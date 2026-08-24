# SparkDate — Dependency / Security Audit (Prompt M5)

**Date:** 2026-08-23
**Run:** nightly automation, Cowork session
**Focus:** Maintenance rotation **Prompt M5 — Dependency / Security Audit** (first ever run)
**Repo state analyzed:** `main` @ `4e62a11` — *"Trend ad cost from the Meta API instead of a number typed once (#257)"*, Sat Aug 22 23:59:30 2026 −0400

> **This run made ZERO code changes.** No file in `public/`, `api/`, `lib/`, `scripts/`,
> `package.json`, `package-lock.json`, `vercel.json`, or the Firestore rules was touched.
> The only file added to this branch is this report. Every fix described below is a
> **recommendation for a human to apply**, not something that was applied.
>
> M5's prompt text says to run `npm audit fix` and commit the result. **That half was
> deliberately not executed**, per this task's standing hard rule. It was instead verified
> in a throwaway copy of the repo outside the clone, and the results are reported here.

---

## Why M5 tonight

Both data sources are stale, so the rotation rule sends the night to M1–M8:

- **GA4: stale, third-party-confirmed.** All 37 `download*.csv` in the Night Tasks folder
  carry window `20260519-20260822` (read from each file's own `#` header, not filenames,
  per the 07-28 lesson). This is byte-for-byte the same export the **2026-08-22 second run**
  already analyzed — the same duplicate fingerprint it documented still holds:
  `download.csv` == `download (7).csv` (md5 `31a0c18a`), `download (8)` == `download (9)`
  (`4a16336e`), and `download (10)`/`(12)`/`(13)`/`(15)` are four copies of one file
  (`80cfa821`). The same two malformed filenames (`download (38.csv`, `download 35.csv`)
  and the same missing `data (1).pdf` are still there. Re-running Prompt 9 would have
  reproduced last night's report.
- **Meta: stale.** Freshest pulls are `meta-insights-2026-08-22.csv` and
  `meta-insights-daily-2026-08-22.csv`, both already consumed by the 08-22 run. Per the
  08-17 correction's lesson, this was checked against the local automation's own logs
  rather than inferred: `Night Tasks\logs\` ends at **`2026-08-21.log`** — there is no
  08-22 or 08-23 log, so the local PowerShell nightly has not pulled since Aug 21.
- **M5 had never run.** M1 ran 07-28, M2 07-31, M3 08-10, M4 08-22. M5 is next in sequence,
  and the rotation note singles it out as *"worth running weekly given it touches
  payments/auth."* Confirmed against **both** run logs (this file's, and the separate one
  inside `TONIGHT_PROMPT.md`) — neither records an M5 run.

**Naming collision worth knowing:** `AUDIT.md`'s finding **"M5"** is a *different* M5 —
it is that document's own numbering for the Stripe `current_period_end` API-version issue,
and it is referenced by name in the header comment of `lib/stripe.js`. It has nothing to do
with the prompt library's M5. Don't conflate them.

---

## Headline

**`npm audit` reports 31 vulnerabilities (2 critical, 8 high, 21 moderate) across 373
dependencies — but the two "critical" findings are both unreachable in production, and
the entire remaining production surface reduces to a single advisory.**

Concretely, verified end to end in a disposable copy of the repo:

| Step | Full audit | Production-only (`--omit=dev`) | Tests |
|---|---|---|---|
| Today, as committed | **31** (2 crit / 8 high / 21 mod) | **24** (1 crit / 5 high / 18 mod) | 303/303 pass |
| After `npm audit fix` (lockfile only) | **23** (1 / 2 / 20) | **18** (0 / 1 / 17) | 303/303 pass |
| …plus dropping the unused `firebase` dep | — | **8** (0 crit / 0 high / 8 mod) | 303/303 pass |

Those 8 survivors all trace to **one** advisory: `uuid` < 11.1.1
([GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq)), and clearing it
requires a `firebase-admin` **12.7.0 → 14.3.0** two-major-version bump — the one thing M5's
own prompt says explicitly not to do automatically.

---

## What is actually installed

`package.json` declares four production dependencies and one dev dependency:

| Declared | Range | Resolved in lockfile | Notes |
|---|---|---|---|
| `firebase` | `^10.7.0` | **10.14.1** | Client SDK. **Nothing in the repo imports it** — see below. |
| `firebase-admin` | `^12.0.0` | **12.7.0** | Real production dependency (`lib/auth.js`, 20+ scripts). |
| `stripe` | `^14.0.0` | **14.25.0** | Real (`lib/stripe.js`). |
| `resend` | `^3.0.0` | **3.5.0** | Real (6 API/lib modules). No advisories against it or its tree. |
| `vitest` (dev) | `^2.1.9` | **2.1.9** | Test runner only. |

Dependency counts from `npm audit`: **197 prod, 89 dev, 132 optional, 5 peer — 373 total.**

---

## Finding 1 — `npm audit fix` is safe here, and clears both criticals' worth of noise

**Verified, not assumed.** The repo was copied to a scratch directory (`.git` removed),
`npm ci` run, the suite run as a baseline, then `npm audit fix` applied and the suite re-run.
The clone that this branch was pushed from was never touched — `git status --porcelain`
on it is empty.

- **`package.json` is byte-identical afterwards** (`diff` clean). This is a **lockfile-only**
  change.
- 15 transitive packages move, every one a patch or minor bump inside its existing major:

  ```
  @google-cloud/storage        7.19.0  -> 7.22.0
  @google-cloud/storage/uuid   8.3.2   -> (deduped away)
  @protobufjs/eventemitter     1.1.0   -> 1.1.1
  @protobufjs/fetch            1.1.0   -> 1.1.1
  brace-expansion              2.1.0   -> 2.1.4
  form-data                    2.5.5   -> 2.5.6
  google-gax/@grpc/grpc-js     1.14.3  -> 1.14.4
  hasown                       2.0.3   -> 2.0.4
  nanoid                       3.3.12  -> 3.3.18
  postcss                      8.5.15  -> 8.5.26
  protobufjs                   7.5.7   -> 7.6.5
  qs                           6.14.2  -> 6.15.3
  side-channel                 1.1.0   -> 1.1.1
  websocket-driver             0.7.4   -> 0.7.5
  ```

- **`npm run test:run`: 303 tests across 22 files pass before and after.** Identical counts.
- It clears 8 root packages: `websocket-driver` (critical), `@grpc/grpc-js`,
  `brace-expansion`, `form-data`, `nanoid`, `postcss`, `protobufjs` (all high), and `qs`
  (moderate). Production-only severity goes **1 critical / 5 high → 0 critical / 1 high**.

Of the eight, three are on genuine production paths and worth naming:

- **`qs` 6.14.2 → 6.15.3** — pulled by **`stripe`** (`qs: ^6.11.0`).
  [GHSA-q8mj-m7cp-5q26](https://github.com/advisories/GHSA-q8mj-m7cp-5q26), a remotely
  triggerable `TypeError` in `qs.stringify`. This sits under the payments SDK; it is the
  single most worthwhile line in the whole diff.
- **`protobufjs` 7.5.7 → 7.6.5** and **`@grpc/grpc-js` 1.14.3 → 1.14.4** — both under
  `firebase-admin` → `@google-cloud/firestore` → `google-gax`, i.e. the Firestore wire path
  every serverless endpoint uses. Four DoS advisories between them, up to CVSS 7.5.
- `brace-expansion` 2.1.0 → 2.1.4 clears three DoS advisories (`glob`/`editorconfig`
  tooling paths).

**This is the one thing worth doing tonight,** and it is one command plus a lockfile commit.

---

## Finding 2 — neither "critical" is exploitable in this setup

Both criticals look alarming in the audit summary and are not.

### `vitest` ≤ 3.2.5 — [GHSA-5xrq-8626-4rwp](https://github.com/advisories/GHSA-5xrq-8626-4rwp), CVSS 9.8

The advisory's own title states the precondition: *"When Vitest UI server is listening,
arbitrary file can be read and executed."* Checked: **no script in `package.json` passes
`--ui`** — the three test scripts are `vitest`, `vitest run`, and `vitest run --reporter=verbose`,
none of which start the UI server. `vitest` is a `devDependency`, and CI (`.github/workflows/test.yml`)
runs `npm run test:ci`, also non-UI. There is no path by which the vulnerable server listens.

Clearing it regardless requires **vitest 2.1.9 → 4.1.11**, two major versions — which would
put a major-version bump of the test runner between Taylor and every future nightly PR's
green check. Not worth it for an unreachable finding. See NEEDS TAYLOR INPUT.

### `websocket-driver` ≤ 0.7.4 — [GHSA-xv26-6w52-cph6](https://github.com/advisories/GHSA-xv26-6w52-cph6)

Reached via `faye-websocket` ← `@firebase/database`. Worth being precise, because the
obvious read is wrong: `@firebase/database` is pulled **both** by the unused `firebase`
client package **and** by `@firebase/database-compat` **1.0.8, a non-optional dependency of
`firebase-admin` 12.7.0**. So it *is* in the production tree.

It is still never executed: `firebase-admin` lazy-loads the Realtime Database module only on
`admin.database()`, and **the repo contains zero references to Realtime Database** — grepping
`api/`, `lib/`, `public/`, `scripts/`, `tests/`, `firebase.json` and `.firebaserc` for
`.database()`, `admin.database`, `getDatabase`, `firebase/database` and `databaseURL` returns
nothing. This project is Firestore + Auth only.

And it is fixed by plain `npm audit fix` anyway (0.7.4 → 0.7.5, in the diff above), so the
reachability question is academic — just take the bump.

---

## Finding 3 — the `firebase` client SDK is installed, vulnerable, and unused

**10 of the 24 production-only findings — including every `undici` advisory, the only
remaining `high` after `npm audit fix` — exist solely because of a dependency nothing uses.**

The evidence:

- **Nothing imports it.** Grepping the whole repo (excluding `node_modules`) for
  `require('firebase…')` / `from 'firebase…'` across `.js`, `.mjs`, `.cjs` and `.html`
  returns **zero matches** outside `firebase-admin`.
- **There is no bundler.** No webpack/rollup/parcel config; `vitest.config.js` is for tests
  only. Nothing could bundle `node_modules/firebase` into a page even in principle.
- **The browser loads Firebase from Google's CDN instead.** 17 `<script>` references across
  **6 pages** — `account.html`, `admin.html`, `city.html`, `event.html`, `events.html`,
  `signup.html` — all pointing at `https://www.gstatic.com/firebasejs/10.7.0/`
  (`firebase-app.js`, `firebase-auth.js`, `firebase-firestore.js`).

`undici` 6.19.7 is depended on by `@firebase/auth`, `@firebase/auth-compat`,
`@firebase/firestore`, `@firebase/functions` and `@firebase/storage` — the **client** SDK
packages, all reachable only through `firebase`. It is *not* in `firebase-admin`'s tree
(admin's Firestore path is `@google-cloud/firestore`, a different package). It carries
**14 advisories** — 4 high, 6 moderate, 3 low, plus one that resolves — mostly WebSocket
parser DoS and HTTP request-smuggling / CRLF-injection issues, none of which run because
neither the browser nor any server module ever loads that code.

**Verified payoff of removing it:** in the scratch copy, `npm uninstall firebase` on top of
`npm audit fix` left **8 production-only findings, 0 critical, 0 high**, and **303/303 tests
still passing**.

This is a `package.json` change, so it is **not** applied here and **not** classified as
zero-risk — see "proposed fixes" for the caveat.

**Separate, related issue `npm audit` cannot see:** the version users actually run is the
**gstatic pin, 10.7.0**, hardcoded in six HTML files. The lockfile resolves the same
`^10.7.0` range to **10.14.1**. So the audit is reporting on 10.14.1 while production serves
10.7.0, and no npm tooling will ever tell you about a browser-SDK advisory. An M5 run gives
false comfort about the client SDK specifically. Bumping the CDN pin is a real code change
across six files touching auth and checkout — flagged, not proposed.

---

## Finding 4 — what genuinely remains: one advisory, behind a two-major bump

After `npm audit fix`, the production-only findings that are neither dev tooling nor
client-SDK dead weight are these eight packages — `@google-cloud/firestore`,
`@google-cloud/storage`, `firebase-admin`, `gaxios`, `google-gax`, `retry-request`,
`teeny-request`, `uuid` — and **all eight are the same finding counted eight times.** Seven
are flagged only as *"depends on vulnerable versions of uuid."*

**Root advisory:** `uuid` < 11.1.1,
[GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) — *"Missing buffer
bounds check in v3/v5/v6 when `buf` is provided."* Moderate; npm records CVSS 7.5.

Installed copies: `firebase-admin/node_modules/uuid` **10.0.0** (non-optional, production),
plus optional `uuid` 9.0.1 and `@google-cloud/storage/node_modules/uuid` 8.3.2.

**Likely not reachable, stated as inference rather than fact.** The advisory requires calling
`v3`, `v5` or `v6` *with a `buf` argument*. Every call site found in the installed tree uses
`v4` and passes no buffer: `firebase-admin/lib/eventarc/eventarc-utils.js:50`
(`(0, uuid_1.v4)()`), and `v4`-only usage in `gaxios`, `google-gax` and `teeny-request`.
`v4` is not in the advisory's affected list. This was a grep of the built `lib/`/`build/`
output, not a call-graph analysis — treat it as strong evidence, not proof.

**Fix path:** `firebase-admin` 12.7.0 → **14.3.0**, flagged `isSemVerMajor`. Two majors, on
the package that backs **auth-token verification** (`lib/auth.js`) and every Firestore write
in the app. M5's own text: *"do NOT upgrade automatically"* for exactly `firebase`,
`firebase-admin`, `stripe`. Escalated below rather than acted on.

---

## Finding 5 — CI runs a different Node than production declares

Not from `npm audit`; noticed while reading the workflows.

- `package.json` declares `"engines": { "node": "22.x" }`.
- **All three** GitHub Actions workflows pin `node-version: '20'` —
  `.github/workflows/test.yml`, `social-publish.yml`, `sync-ad-spend.yml`.

So the 303 tests that gate every nightly PR run on Node 20, while `engines` tells Vercel to
deploy on Node 22. A Node-22-only behaviour difference would pass CI and fail in production.
Nothing is currently known to be broken by this — it is a gap in what CI can catch.

Historical note: `AUDIT.md` (2026-05-24) finding **M4** flagged that `package.json` had *no*
`engines` field and recommended pinning `20.x`. The field was later added as `22.x`; the
workflows were not moved with it.

---

## Finding 6 — nothing catches any of this automatically

There is **no `npm audit` step in any of the three workflows**. `AUDIT.md`'s M4 already
recommended adding `npm audit --production --audit-level=high` to CI back on 2026-05-24;
three months on it is still absent, which is why 31 findings accumulated silently until a
maintenance-rotation prompt happened to look.

Useful detail for whoever wires it up: with `npm audit fix` applied, `npm audit --omit=dev
--audit-level=high` **passes clean today** (0 critical, 0 high in production). So that gate
can be turned on immediately without a backlog of pre-existing failures to suppress — but
only *after* the lockfile bump, not before.

---

## NEEDS TAYLOR INPUT

1. **`firebase-admin` 12.7.0 → 14.3.0 (two major versions).** The only thing standing between
   the repo and a clean production audit. Touches auth-token verification and every Firestore
   call. Reviewing two majors of changelog is a real afternoon, and the advisory it clears is
   a moderate that the evidence says isn't reachable. Genuinely a judgement call: schedule it
   as its own reviewed PR, or accept the finding and document why. **Do not let it ride in on
   a nightly.**
2. **Remove `firebase` from `dependencies`?** Nothing imports it; the browser uses the gstatic
   CDN; removing it drops production findings from 18 to 8 and eliminates the last `high`.
   The question is whether it is there deliberately — a planned migration off the CDN, local
   tooling, or an editor's type resolution. If it is vestigial, deleting it is the highest
   value-per-risk change available.
3. **The gstatic Firebase pin is 10.7.0 across six pages while the lockfile resolves 10.14.1.**
   `npm audit` is structurally blind to the version users actually execute. Decide whether to
   bump the CDN pin (six files, all auth/checkout — needs a real test pass) and whether to add
   a periodic manual check of Firebase JS SDK release notes, since no tooling covers it.
4. **Node 20 in CI vs `engines: 22.x`.** Which is authoritative? Aligning the workflows to 22
   is one line each, but it changes the environment every nightly PR is validated in, so it
   should be a deliberate call rather than a drive-by edit.
5. **`vitest` 2.1.9 → 4.1.11 to clear the critical?** Two majors of the test runner, for an
   advisory that requires a UI server this project never starts. Recommendation: don't, and
   record the reason so future M5 runs stop re-raising it. Taylor's call whether "critical in
   the report, unreachable in fact" is acceptable to carry.

---

## Proposed zero-risk fixes — NOT APPLIED

Written up for a human. Nothing below was executed against the repo.

1. **Run `npm audit fix` and commit only `package-lock.json`.**
   Verified in a throwaway copy: `package.json` unchanged, 15 transitive patch/minor bumps,
   303/303 tests pass, 31 → 23 findings and production 1 critical / 5 high → 0 / 1. Includes
   the `qs` bump under `stripe` and the `protobufjs` / `@grpc/grpc-js` bumps under the
   Firestore wire path. Confirm the diff is lockfile-only before committing.
2. **Add an audit gate to `.github/workflows/test.yml`,** after the existing `npm ci` step:
   `npm audit --omit=dev --audit-level=high`. Passes clean *after* fix #1 and fails today, so
   land it second. Use `--omit=dev` — a dev-scoped gate would fail on the unreachable `vitest`
   critical and get muted within a week.
3. **Align `node-version` to `22` in all three workflows** to match `engines`. One line each.
   Listed here as mechanical, but see NEEDS TAYLOR INPUT #4 — it changes the CI environment,
   so it deserves a conscious yes rather than a silent edit.

---

## What to re-check, and when

| Recommendation | Re-check | When |
|---|---|---|
| `npm audit fix` applied | `npm audit --omit=dev` → expect **0 critical, 0 high, 17 moderate**; `npm run test:run` → 303/303 | Immediately after; then weekly |
| CI audit gate added | `test.yml` run shows the audit step green on a PR | Next nightly PR |
| `firebase` dependency removed | `npm audit --omit=dev` → expect **8 moderate, 0 high**; all 6 gstatic pages still sign in and check out | ~1 week after merge |
| `firebase-admin` major bump (if taken) | `npm audit --omit=dev` → expect **0 findings**; auth verification + a real Stripe test purchase | Same PR, before merge |
| Node 20 → 22 in CI | `test.yml` green on Node 22 | Immediately |
| M5 generally | Re-run the rotation — expect the count to be flat if nothing lands, and investigate any *rise* | Weekly, per the rotation note |

---

## Method and caveats

**How this was run.** Fresh `--depth 1` clone to `/tmp/sparkwork`; `npm audit --json`
read there. Everything that *mutates* — `npm ci`, `npm audit fix`, `npm uninstall`,
`npm run test:run` — was run in **separate throwaway directories** (`/tmp/auditscratch`,
`/tmp/testscratch`, `/tmp/nofb`) so the clone this branch was pushed from could not be
modified. `git status --porcelain` on the clone was empty after all npm work.

**Caveats:**

- **Advisory data is a point-in-time snapshot** from `registry.npmjs.org` on 2026-08-23.
  Counts will drift as advisories are published; a future M5 comparing to this report should
  compare *root advisories*, not totals.
- **Reachability claims are static.** "Not exploitable" here means no code path was found by
  grepping source and built `node_modules` output — not that a dynamic test proved it. The
  `uuid` v4-only claim and the "no Realtime Database" claim are both of this kind. The
  `vitest --ui` claim is stronger (it is a script-level fact).
- **`npm audit fix` was verified against the repo's own suite, which the suite's own header
  says is incomplete.** `.github/workflows/test.yml` carries a comment noting Firestore and
  Stripe are mocked, tracked as a follow-up to `AUDIT.md` H5. 303 passing tests is meaningful
  evidence that the lockfile bump is safe, not a guarantee.
- **No runtime/network verification.** No browser or egress to the deployed site from this
  sandbox, so nothing was confirmed against production — including whether the gstatic 10.7.0
  bundle is what actually loads.
- **`AUDIT.md` is from 2026-05-24** and parts of it are stale (its M4 complains about missing
  `engines` and `scripts`, both since added). Only the still-true parts are cited.
- **No prior M5 baseline exists.** This report *is* the baseline; there was no earlier run to
  trend against.

**`ANALYTICS_CONTEXT.md` — read in full before starting, as required.** Tonight's focus
computes **no GA4 and no Meta numbers**, so none of its measurement traps bind to any figure
in this report. Recording which ones *would* have applied, so this is not mistaken for having
skipped the file:

- The **`begin_checkout` redefinition (2026-08-21, PRs #204/#229)** and the
  **`add_payment_info` did-not-exist-before-08-21** trap: not engaged — no funnel numbers here.
- The **Meta rolling-window artifact** (campaigns that launch mid-window fake a spend trend):
  not engaged — no spend figures here. It *was* used in the freshness decision: the Meta CSVs
  were checked and found already consumed, not re-analyzed.
- **GA4 revenue is own-site only (~55% of tickets arrive via Eventbrite/Meetup):** not engaged.
- The **small-sample rule** (don't percentage single-digit counts): honoured — every count in
  this report is a package or advisory count, stated as a raw number, never a rate.

One place where a caveat file and a computed number *would* interact, flagged as required:
`ANALYTICS_CONTEXT.md` §3 notes the 2026-08-22 site changes and says to expect discontinuities
from 2026-08-23 onward. **This report's `main` HEAD (`4e62a11`) is dated 2026-08-22 23:59 EDT**,
so it includes those changes — meaning the dependency tree audited here is the post-change one,
and it is the correct baseline for any future comparison, not a pre-change snapshot.
