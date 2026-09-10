// tests/resend-rejection-visibility.test.js
//
// One invariant, in two files: a send Resend REFUSED must never be
// indistinguishable from a send we chose not to make.
//
// resend.emails.send() resolves with { error } on a 4xx/5xx — it does not
// throw. Every `catch` around a send is therefore dead to rejections, and the
// `else` branch is the only place a refusal can be seen. Those else branches
// used to read `{ skipped++; }` with no log, folding a rate-limited or
// quota-exceeded send into the same bucket as "already registered".
//
// It surfaced on 2026-09-09: the account crossed its 100/day Resend quota
// twenty seconds into the 9 AM cron run. Nothing was actually lost (Resend
// kept accepting — match emails sent eighteen minutes after the 100% notice
// were delivered), but the run's summary line would have looked identical if
// every send after the cap had been refused. These are source-level
// assertions, in the style of tests/add-guest.test.js, because the handlers'
// own writes need the Firestore emulator; the shape of the failure path does
// not.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
const cronSrc = readFileSync(resolve(ROOT, 'api/cron-send-emails.js'), 'utf8');
const declareSrc = readFileSync(resolve(ROOT, 'api/declare-connection.js'), 'utf8');

describe('api/cron-send-emails — a rejection is not a skip', () => {
  it('has no silent `else { skipped++ }` left on a send path', () => {
    // The exact shape that hid it. If this matches again, a rejected send has
    // gone quiet somewhere.
    expect(cronSrc).not.toMatch(/}\s*else\s*{\s*skipped\+\+;\s*}/);
  });

  it('defines logRejected and uses it on every send path', () => {
    expect(cronSrc).toMatch(/function logRejected\(/);
    const calls = cronSrc.match(/logRejected\(/g) || [];
    // Seven send paths: profile reminder, pre-event, post-event prompt,
    // returning invite, nurture bucket, newsletter, post-nurture event.
    // (One of the eight matches is the declaration itself.)
    expect(calls.length).toBeGreaterThanOrEqual(8);
  });

  it('counts rejections separately from skips in every pass', () => {
    const counters = cronSrc.match(/let sent = 0, skipped = 0, rejects = 0;/g) || [];
    expect(counters.length).toBe(6);
    // …and reports the count, so a run that starts getting refused says so.
    expect(cronSrc).toMatch(/rejected: rejects/);
  });

  it('still writes the sent-stamp only after a successful send', () => {
    // This is what makes a rejection self-healing: no stamp, so the next run
    // retries it. A rejection that stamped anyway would be a silent loss.
    expect(cronSrc).not.toMatch(/logRejected\([^)]*\);\s*(await )?\w+\.(ref\.)?update\(/);
  });
});

describe('api/declare-connection — the match lock records the outcome', () => {
  it('claims the lock before sending, with notified false', () => {
    // The lock CANNOT move to after the send: it closes the both-directions
    // race, and handleUnpick reads the same doc to refuse an undo once
    // contact info is out. So it is claimed first and corrected after.
    const createIdx = declareSrc.indexOf('lockRef.create(');
    const sendIdx = declareSrc.indexOf('resend.emails.send(');
    expect(createIdx).toBeGreaterThan(-1);
    expect(sendIdx).toBeGreaterThan(createIdx);
    const createBlock = declareSrc.slice(createIdx, createIdx + 300);
    expect(createBlock).toMatch(/notified: false/);
  });

  it('reads the error off every send result rather than trusting Promise.all', () => {
    const allIdx = declareSrc.indexOf('await Promise.all(sends)');
    expect(allIdx).toBeGreaterThan(-1);
    const after = declareSrc.slice(allIdx, allIdx + 700);
    expect(after).toMatch(/\.map\(\(r\) => r && r\.error\)/);
    expect(after).toMatch(/failures\.length/);
  });

  it('only logs "match notified" once no send was refused', () => {
    const failIdx = declareSrc.indexOf('if (failures.length)');
    const okIdx = declareSrc.indexOf('match notified:');
    expect(failIdx).toBeGreaterThan(-1);
    expect(okIdx).toBeGreaterThan(failIdx);
    // The refusal branch has to return, or the success log runs anyway —
    // which is exactly the bug this replaces.
    const failBlock = declareSrc.slice(failIdx, okIdx);
    expect(failBlock).toMatch(/return;/);
    expect(failBlock).toMatch(/notifyError/);
  });

  it('treats a missing address as a match that was not notified', () => {
    // Promise.all([]) resolves, so a match where neither side had an email
    // used to log "match notified" having sent nothing at all.
    expect(declareSrc).toMatch(/sends\.length < 2/);
  });

  it('marks the lock notified only on the success path', () => {
    const okIdx = declareSrc.indexOf('match notified:');
    const before = declareSrc.slice(Math.max(0, okIdx - 400), okIdx);
    expect(before).toMatch(/notified: true/);
  });
});
