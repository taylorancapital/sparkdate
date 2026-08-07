// tests/vercel-config.test.js
//
// Guards vercel.json, which has a failure mode nothing else in this repo catches:
// an invalid config is rejected by Vercel BEFORE a build starts, so the GitHub
// "Vercel" check reports only "Deployment failed" pointing at the generic
// project-configuration docs — no build logs, no line number, no key name.
// Meanwhile the "test" check goes green, because valid-JSON-but-invalid-Vercel
// passes every other check we run.
//
// That combination cost a full review cycle on PR #150, where
// functions["api/next-event.js"].includeFiles was written as an ARRAY of two
// paths. Vercel's schema declares that field `type: "string"` (a glob) — arrays
// are only legal under the experimental `services` config, not `functions`.
//
// Two classes of bug are covered here:
//   1. Schema violations (wrong type, unknown key, bad enum) — validated against
//      Vercel's own published schema, cached at scripts/vercel-schema.json.
//   2. An includeFiles glob that is schema-valid but doesn't name every template
//      api/next-event.js reads at runtime. Note this is a robustness guard, not
//      a reproduction of a live outage: /philadelphia currently server-renders
//      correctly in production even though public/city.html was never listed,
//      so Vercel is evidently making public/ readable to the function anyway.
//      That behaviour isn't something the docs promise, and the failure mode if
//      it ever changes is a silent 302 of every affected route to /events, so
//      the config should name each template it depends on explicitly.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const ROOT = path.join(__dirname, '..');
const { validateVercelJson } = require('../scripts/validate-vercel-json.js');

const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));

// Expands `a/{b,c}.html` into ['a/b.html', 'a/c.html']. Deliberately minimal:
// it covers the brace form Vercel's own docs use for these globs, which is all
// this repo needs. A pattern using `*`/`**` is reported as unexpanded so the
// coverage assertion below skips it rather than silently passing.
function expandBraces(pattern) {
  const m = /^([^{]*)\{([^}]*)\}(.*)$/.exec(pattern);
  if (!m) return [pattern];
  const [, pre, body, post] = m;
  return body.split(',').flatMap((opt) => expandBraces(`${pre}${opt.trim()}${post}`));
}

describe('vercel.json', () => {
  it('is valid against Vercel\'s published JSON schema', () => {
    const problems = validateVercelJson();
    expect(problems, `vercel.json schema problems:\n  - ${problems.join('\n  - ')}`).toEqual([]);
  });

  it('declares functions.*.includeFiles as a glob string, never an array', () => {
    // Called out explicitly because it is the exact mistake that broke PR #150,
    // and because an array *looks* more correct than a brace glob to a reader.
    for (const [fnPath, cfg] of Object.entries(config.functions || {})) {
      if ('includeFiles' in cfg) {
        expect(
          typeof cfg.includeFiles,
          `functions["${fnPath}"].includeFiles must be a glob string (Vercel rejects arrays here)`
        ).toBe('string');
      }
    }
  });

  it('bundles every public/*.html template api/next-event.js reads at runtime', () => {
    const src = fs.readFileSync(path.join(ROOT, 'api/next-event.js'), 'utf8');
    // Matches the readFileSync(path.join(process.cwd(), 'public', 'x.html')) form
    // the render=page / render=home template loaders use.
    const needed = [...src.matchAll(/['"]public['"]\s*,\s*['"]([\w.-]+\.html)['"]/g)]
      .map((m) => `public/${m[1]}`);

    expect(needed.length, 'expected to find template reads in api/next-event.js').toBeGreaterThan(0);

    const pattern = config.functions?.['api/next-event.js']?.includeFiles;
    expect(pattern, 'api/next-event.js must declare includeFiles').toBeTruthy();

    const covered = expandBraces(pattern);
    // If the pattern uses wildcards we can't cheaply prove coverage here; the
    // schema test above still applies, so only assert when it's fully expanded.
    if (covered.some((c) => c.includes('*'))) return;

    for (const file of new Set(needed)) {
      expect(
        covered,
        `api/next-event.js reads ${file} at runtime but includeFiles ("${pattern}") does not name it. ` +
        `Add it to the glob: relying on Vercel happening to make public/ readable is undocumented, ` +
        `and if it stops the route silently 302s to /events instead of failing the build`
      ).toContain(file);
      // And the file must actually exist, or the glob matches nothing regardless.
      expect(fs.existsSync(path.join(ROOT, file)), `${file} does not exist`).toBe(true);
    }
  });

  it('routes / through the render=home function that index.html depends on', () => {
    // The homepage rewrite and the includeFiles entry have to move together:
    // routing / at the function without bundling index.html (or vice versa) is
    // the kind of half-change that only shows up in production.
    const rootRewrite = (config.rewrites || []).find((r) => r.source === '/');
    expect(rootRewrite, 'vercel.json must define a rewrite for /').toBeTruthy();
    if (/render=home/.test(rootRewrite.destination)) {
      expect(config.functions?.['api/next-event.js']?.includeFiles || '')
        .toMatch(/index/);
    }
  });
});
