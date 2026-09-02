# HANDOFF — intent only

**Contract for this file. Read before editing it.**

This holds only what a machine cannot derive: what someone was mid-way through,
why, and what they would do next. Keep it under ~25 lines.

**Never write here:** open PRs, worktree inventories, stash lists, recent
commits, or "X is merged." `npm run brief` derives all of that live and is
correct; a typed copy is wrong within hours. The 2026-08-30 version of this file
listed two PRs as open (one had merged) and three worktrees that no longer
existed, while missing all four that did.

**Durable rules go in `CLAUDE.md`. Durable facts go in memory files. Findings go
in `reports/`.** If an entry here stops being "in flight," move it or delete it.

## In flight

- **The `MC Retargeting` audience does not contain a single video we are
  running.** It is a 365-day engagement allow-list of 88 video `object_id`s
  prefilled on 08-17; all six live Marion Court creatives were uploaded later and
  are outside it. So `Marion Court | Traffic` reached 3,916 people and produced
  436 video views while the retargeting pool grew by 35 — the two-stage design
  was never wired up, and everything that looked like retargeting fatigue is a
  sealed pool being re-served. **Free to fix** (add the live video IDs, or rebuild
  the audience as Page/IG engagement so it stops going stale on every upload) and
  **nothing has been changed in the ad account.** Full write-up and the revised
  option list: `reports/MARION_COURT_RETARGETING_FATIGUE_2026-09-01.md`. Decide
  before **2026-09-08 16:30**, when the ad set ends anyway — but expect this to
  unblock the *next* event, not rescue Sep 8.
- **Open question that gates the above:** does adding video IDs to a live
  engagement audience backfill viewers already inside the retention window?
  Meta documents that it does; unconfirmed on this account, and it decides
  whether the fix helps in six days or only from here on.

## Open threads nobody owns

- **The door records the same person twice, and the existing audit cannot see
  it.** Confirmed at Good Good: two of twenty attendees held both a ticket
  marked absent and a door-created registration marked present.
  `scripts/audit-duplicate-attendees.js` groups by **email** and found neither —
  the door's email lookup missing is what creates the second account, so
  grouping by email cannot detect its own failure mode. Needs matching on more
  than an exact email. Full case: `reports/EVENT_DEBRIEF_GOOD_GOOD_2026-08-31.md`.
- **Someone issued a free Eventbrite ticket type for women.** It produced three
  of four female registrations at Good Good. Nothing in this repo created it or
  can see it — `isComp` is false on all of them. Who set it up, and is it still
  live for the next event?
- **The nightly still cannot catch up or wait for a network.**
  `StartWhenAvailable` and `RunOnlyIfNetworkAvailable` are both `False` on the
  02:00 task, which is why 8 of 23 nights never ran and why the 08-29 run failed
  both network steps 14 minutes after a boot. Needs an elevated shell.
- `reports/META_CAPI_PROMPT.md` is untracked and has never been run.
- `utm_content=proof_rsa1` sharing is **partly fixed** — read live 2026-09-02,
  all four Marion Court *retargeting* ads now carry a distinct `utm_content`
  (`mc_rt_*`) and `utm_source=Facebook`. The two *Traffic* ads still share
  `proof_rsa1` and hardcode `utm_source=Instagram`, so Women vs All-Genders
  cannot be split in GA4. `url_tags` is settable only at creative creation, so
  fix it at the next event's creative build, not mid-flight.
- Marion Court Traffic ads have no pixel dataset selected — they cannot report
  conversions until one is. **This is also what blocks the site-visitor
  retargeting audience:** every website audience on the account sits at Meta's
  20-person floor and one is flagged too small to use, so the pool never grows
  to usable size. Fix the dataset first; the audience work depends on it.
- `/admin` took 13 sessions from 1 user attributed to `facebook / paid_social`
  with 5 key events. Looks like internal traffic wearing paid attribution;
  nobody has looked. Small, but it feeds the internal-traffic-filter question.

## Watch signals

- **`funnel-checkout-by-landing-page` gets its first real read tonight.** It
  showed `/lp` taking 2,566 sessions to 7 purchases while `/` took 349 to the
  same 7. Before believing a 7x page-quality gap, control for channel — paid
  social lands almost entirely on `/lp`, so some of that is traffic mix.
- GA4 `facebook / paid_social` should read near-zero sessions from here on. New
  sessions there mean an ad re-introduced June's hand-typed lowercase-no-
  `eventId` URL shape. Same for `Facebook / paid`. Context:
  `reports/GA4_ANALYSIS_2026-08-30.md`.
- Promotions CTR is only computable on windows starting 2026-08-28 or later
  (report §H1) — earlier rows read clicks > views.
