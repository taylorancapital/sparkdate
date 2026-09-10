// lib/tiktok-token-store.js
//
// Where the rotating TikTok refresh token actually lives.
//
// WHY THIS EXISTS
//
// `lib/tiktok-auth.js` says the problem out loud and then says it cannot fix
// it: TikTok returns a NEW refresh token on most refreshes and kills the old
// one, but the refresh token lives in a GitHub secret and "a Node process
// cannot write either." So the module warns and hopes a human is reading.
//
// Nobody is reading. The publish workflow runs unattended, and the only copy
// of the new token would sit in an Actions log that expires. Wiring TikTok
// into CI without solving this buys exactly ONE working run, and the failure
// arrives days later as posts that silently never appear.
//
// A Node process cannot write a GitHub secret. It CAN write Firestore, and
// the publish workflow already holds Firebase Admin credentials for other
// reasons. So the refresh token moves there: read at the start of a run,
// written back whenever TikTok rotates it, with no human in the loop.
//
// THE ENVIRONMENT IS STILL THE SEED, NOT THE SOURCE OF TRUTH
//
// TIKTOK_REFRESH_TOKEN is honoured when the store is empty, which is how the
// first token gets in (see scripts/tiktok-authorize.js) and how a human
// recovers after a rotation is lost. But once the store holds a token, the
// store wins -- the env copy goes stale the first time TikTok rotates, and
// preferring it would reintroduce exactly the bug this file exists to kill.
//
// Everything except open()/read()/write() is pure, so the resolution and
// rotation logic is testable without Firestore or credentials.

'use strict';

const TikTokAuth = require('./tiktok-auth');

// snake_case to match every other collection in this project (ad_spend,
// event_registrations, rate_limits). Denied to all clients by the default
// `match /{document=**} { allow read, write: if false; }` at the bottom of
// firestore.rules, and explicitly denied again there because this is a
// credential and a future broad isAdmin() read must not sweep it up.
const COLLECTION = 'integration_tokens';
const DOC_ID = 'tiktok';

/**
 * Which refresh token this run should present, and where it came from.
 *
 * Pure. The `source` is returned rather than logged in place so the caller
 * can say it once, in its own voice -- and so a test can assert on the
 * precedence rule directly instead of scraping console output.
 *
 * @returns {{token: string|null, source: 'store'|'env'|null}}
 */
function resolveRefreshToken({ stored, env = process.env } = {}) {
  const fromStore = typeof stored === 'string' ? stored.trim() : '';
  if (fromStore) return { token: fromStore, source: 'store' };

  const fromEnv = String(env.TIKTOK_REFRESH_TOKEN || '').trim();
  if (fromEnv) return { token: fromEnv, source: 'env' };

  return { token: null, source: null };
}

/**
 * Open the Firestore-backed store, or null when Firebase is not configured.
 *
 * Returning null rather than throwing is deliberate: a developer running
 * `social.js run` on a laptop has TikTok credentials in their shell and no
 * Firebase service account, and that should still publish. They lose
 * automatic persistence, not the ability to post -- and getAccessToken's
 * existing rotation warning is what covers them.
 */
function openStore(env = process.env) {
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
    return null;
  }

  // Required lazily so that requiring this module costs nothing in a process
  // that never touches TikTok -- and so the unit tests, which inject a fake
  // store, never load firebase-admin at all.
  const admin = require('firebase-admin');
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey: (env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      }),
      projectId: env.FIREBASE_PROJECT_ID,
    });
  }

  const ref = admin.firestore().collection(COLLECTION).doc(DOC_ID);

  return {
    async read() {
      const snap = await ref.get();
      if (!snap.exists) return null;
      return snap.data().refresh_token || null;
    },
    async write(token, meta = {}) {
      await ref.set({
        refresh_token: token,
        // Rotation history is the only way to tell "TikTok stopped rotating"
        // from "our write silently stopped happening" after the fact.
        rotated_at: new Date().toISOString(),
        ...meta,
      }, { merge: true });
    },
  };
}

/**
 * Get a usable TikTok access token for this run, and make sure the refresh
 * token that comes back survives it.
 *
 * This is the only function either entry point should call. Duplicating the
 * read/refresh/persist sequence at two call sites is precisely how one of
 * them ends up refreshing without persisting -- and a refresh that is not
 * persisted has already destroyed the stored token by the time anyone looks.
 * `social-preflight` is the dangerous one: it exists to be run casually, and
 * every casual run rotates the credential the scheduled job depends on.
 *
 * @returns {Promise<{accessToken: string, rotated: boolean, source: string|null,
 *                    persisted: boolean}|null>} null when unconfigured.
 */
async function acquireAccessToken(env = process.env, opts = {}) {
  const log = opts.log || (() => {});
  const auth = opts.auth || TikTokAuth;
  // `undefined` means "open the real one"; an explicit null means "there is
  // no store", which is what the tests and the laptop case both want.
  const store = opts.store === undefined ? openStore(env) : opts.store;

  let stored = null;
  if (store) {
    try {
      stored = await store.read();
    } catch (e) {
      // A read failure must not fall through to the env copy silently: if the
      // store holds a newer token than the environment, using the env one
      // fails anyway, and the reason would be invisible.
      log(`tiktok: could not read the stored refresh token -- ${e.message}`);
    }
  }

  const { token: refreshToken, source } = resolveRefreshToken({ stored, env });
  if (source === 'env' && store) {
    log('tiktok: no stored refresh token; seeding from TIKTOK_REFRESH_TOKEN.');
  }

  // getAccessToken reads TIKTOK_REFRESH_TOKEN off whatever env it is handed,
  // so the resolved token is injected rather than the module being taught
  // about Firestore. lib/tiktok-auth.js stays dependency-free and pure.
  const effectiveEnv = refreshToken
    ? { ...env, TIKTOK_REFRESH_TOKEN: refreshToken }
    : env;

  const out = await auth.getAccessToken(effectiveEnv, { log });
  if (!out || !out.accessToken) return null;

  let persisted = false;
  if (out.rotated && out.refreshToken) {
    if (store) {
      try {
        await store.write(out.refreshToken, { rotated_from: source });
        persisted = true;
        log('tiktok: refresh token rotated and saved.');
      } catch (e) {
        // The old token is already dead at this point -- TikTok killed it
        // when it issued the new one. So this is not "the save failed and we
        // will retry"; it is "TikTok publishing is broken from the next run
        // unless this value is captured NOW."
        log('');
        log(`  !! TikTok rotated the refresh token and SAVING IT FAILED: ${e.message}`);
        log('  !! The previous token is already dead. Set TIKTOK_REFRESH_TOKEN to:');
        log(`  !!   ${out.refreshToken}`);
        log('');
      }
    }
    // With no store at all, getAccessToken has already printed the new token
    // and said the next run will fail. Repeating it here would only make the
    // laptop case noisier than the case that actually matters.
  }

  return { ...out, source, persisted };
}

module.exports = {
  COLLECTION, DOC_ID,
  resolveRefreshToken, openStore, acquireAccessToken,
};
