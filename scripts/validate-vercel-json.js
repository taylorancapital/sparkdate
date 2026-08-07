#!/usr/bin/env node
// scripts/validate-vercel-json.js
//
// Type-checks vercel.json against Vercel's own published JSON Schema
// (https://openapi.vercel.sh/vercel.json) BEFORE pushing.
//
// Why this exists: an invalid vercel.json is rejected by Vercel *before a build
// starts*, so the GitHub check shows only "Deployment failed" with a link to the
// generic project-configuration docs — no logs, no line number, nothing that
// says which key is wrong. That cost a full review cycle on PR #150, where
// `functions["api/next-event.js"].includeFiles` had been written as an ARRAY.
// The schema declares it `type: "string"` (a glob) — arrays are only legal under
// the experimental `services` config, not `functions`. `node -e JSON.parse(...)`
// passes such a file happily, because it is valid JSON and invalid Vercel.
//
// Deliberately dependency-free (no ajv): this is a targeted checker for the
// property shapes this repo actually uses, not a general JSON Schema engine.
// It validates types, enums, unknown keys, and required keys for the top level
// plus `functions`, `rewrites`, `redirects`, `headers`, and `crons`.
//
// Usage:
//   node scripts/validate-vercel-json.js            # uses the cached schema
//   node scripts/validate-vercel-json.js --refresh  # re-download the schema
//
// The schema is cached at scripts/vercel-schema.json so this works offline and
// in CI. Refresh it occasionally to pick up new Vercel config options.

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'vercel.json');
const SCHEMA_PATH = path.join(__dirname, 'vercel-schema.json');
const SCHEMA_URL = 'https://openapi.vercel.sh/vercel.json';

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`GET ${url} -> HTTP ${res.statusCode}`));
      }
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve(body));
    }).on('error', reject);
  });
}

// Resolve a $ref against the root schema (the Vercel schema uses local refs).
function deref(node, root, seen = 0) {
  if (!node || typeof node !== 'object' || !node.$ref || seen > 10) return node;
  const parts = node.$ref.replace(/^#\//, '').split('/');
  let cur = root;
  for (const p of parts) {
    cur = cur && cur[decodeURIComponent(p).replace(/~1/g, '/').replace(/~0/g, '~')];
  }
  return deref(cur, root, seen + 1);
}

const typeOf = (v) =>
  v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'number' ? 'number' : typeof v;

function typeMatches(value, type) {
  const types = Array.isArray(type) ? type : [type];
  const actual = typeOf(value);
  return types.some((t) =>
    t === 'integer' ? Number.isInteger(value) : t === actual
  );
}

const errors = [];
const err = (p, m) => errors.push(`${p || '(root)'}: ${m}`);

// Validates `value` against `schema`. Intentionally partial: it enforces the
// constraints that actually reject a deploy (type / enum / unknown+required
// keys / string length) and skips the exotic ones (if-then, dependentSchemas).
function validate(value, schema, p) {
  schema = deref(schema, ROOT_SCHEMA);
  if (!schema || typeof schema !== 'object') return;

  // oneOf/anyOf: pass if ANY branch validates cleanly.
  for (const key of ['oneOf', 'anyOf']) {
    if (Array.isArray(schema[key])) {
      const before = errors.length;
      const ok = schema[key].some((branch) => {
        const mark = errors.length;
        validate(value, branch, p);
        const clean = errors.length === mark;
        errors.length = mark; // discard this branch's errors either way
        return clean;
      });
      errors.length = before;
      if (!ok) {
        err(p, `does not match any allowed shape (${key}); got ${typeOf(value)} ${JSON.stringify(value)}`);
      }
      return;
    }
  }

  if (schema.type && !typeMatches(value, schema.type)) {
    err(p, `expected type ${JSON.stringify(schema.type)}, got ${typeOf(value)} — ${JSON.stringify(value)}`);
    return; // further checks would be noise
  }
  if (schema.enum && !schema.enum.includes(value)) {
    err(p, `expected one of ${JSON.stringify(schema.enum)}, got ${JSON.stringify(value)}`);
  }
  if (typeof value === 'string' && typeof schema.maxLength === 'number' && value.length > schema.maxLength) {
    err(p, `string longer than maxLength ${schema.maxLength}`);
  }

  if (Array.isArray(value) && schema.items) {
    value.forEach((item, i) => validate(item, schema.items, `${p}[${i}]`));
    return;
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const req of schema.required || []) {
      if (!(req in value)) err(p, `missing required key "${req}"`);
    }
    for (const [k, v] of Object.entries(value)) {
      const child = `${p}${p ? '.' : ''}${k}`;
      if (schema.properties && k in schema.properties) {
        validate(v, schema.properties[k], child);
        continue;
      }
      let matched = false;
      for (const [pat, sub] of Object.entries(schema.patternProperties || {})) {
        if (new RegExp(pat).test(k)) { validate(v, sub, child); matched = true; break; }
      }
      if (matched) continue;
      if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        validate(v, schema.additionalProperties, child);
      } else if (schema.additionalProperties === false) {
        err(child, 'unknown key (not allowed by the schema)');
      }
    }
  }
}

let ROOT_SCHEMA;

// Programmatic entry point, used by tests/vercel-config.test.js so CI catches
// an invalid config (the `test` check is what actually gates merges — the Vercel
// check reports a bare "Deployment failed" with no logs). Returns the list of
// human-readable problems; empty means valid.
function validateVercelJson(configPath = CONFIG_PATH, schemaPath = SCHEMA_PATH) {
  errors.length = 0;
  ROOT_SCHEMA = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  validate(JSON.parse(fs.readFileSync(configPath, 'utf8')), ROOT_SCHEMA, '');
  return errors.slice();
}

module.exports = { validateVercelJson, CONFIG_PATH, SCHEMA_PATH };

if (require.main !== module) return;

(async function main() {
  const refresh = process.argv.includes('--refresh');
  if (refresh || !fs.existsSync(SCHEMA_PATH)) {
    process.stdout.write(`Downloading ${SCHEMA_URL} ... `);
    try {
      const body = await download(SCHEMA_URL);
      JSON.parse(body); // reject a captive-portal HTML page etc.
      fs.writeFileSync(SCHEMA_PATH, body);
      console.log(`${body.length} bytes -> ${path.relative(ROOT, SCHEMA_PATH)}`);
    } catch (e) {
      console.log('FAILED');
      if (!fs.existsSync(SCHEMA_PATH)) {
        console.error(`Could not fetch the schema and no cached copy exists: ${e.message}`);
        process.exit(2);
      }
      console.error(`Using cached schema (download failed: ${e.message})`);
    }
  }

  ROOT_SCHEMA = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));

  let config;
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    console.error(`vercel.json is not valid JSON: ${e.message}`);
    process.exit(1);
  }

  validate(config, ROOT_SCHEMA, '');

  if (errors.length) {
    console.error(`\nvercel.json FAILED schema validation (${errors.length} problem${errors.length === 1 ? '' : 's'}):\n`);
    errors.forEach((e) => console.error(`  - ${e}`));
    console.error('\nVercel rejects an invalid config before the build starts, so this would');
    console.error('surface in CI only as "Deployment failed" with no logs. Fix the above first.');
    process.exit(1);
  }

  const fnCount = Object.keys(config.functions || {}).length;
  console.log(
    `vercel.json OK — ${fnCount} function config${fnCount === 1 ? '' : 's'}, ` +
    `${(config.rewrites || []).length} rewrites, ${(config.redirects || []).length} redirects, ` +
    `${(config.crons || []).length} crons`
  );
})();
