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

- **Marion Court: four changes went LIVE 2026-09-02 and are running now.**
  Traffic $6→$10/day, Retargeting $3→$6/day, retargeting ad set `genders` [1,2]→[2],
  `relationship_statuses:[1]` removed. Marion Court now spends **$16/day, ~$101
  to 09-08** against ~$57 before. **Both campaigns re-entered learning** (budget
  moves of 67% and 100%, plus a targeting edit) — expect 1–2 erratic days out of
  the ~6 remaining, and **do not tune again before 09-08**, each edit restarts it.
  Detail and rollback pointers: report §10.
- **Watch two numbers.** Retargeting frequency should fall 13.8 → ~2.5; if it does
  not, the pool is delivery-limited not pool-limited (report §3b is explicitly
  unresolved on this) and the extra budget is buying repetition. And Traffic CPL
  was $0.31 at $6/day — above ~$0.68 the increment stops paying for itself.
- **MC-RT-QUANG and MC-RT-NO-SCORECARDS stay running — deliberate, not an
  oversight.** Taylor's call 2026-09-02, for the data. **Do not pause them as
  tidy-up.** Expect only ~250–400 impressions each: enough to spot a dead ad, not
  to rank them. A real creative read needs their own ad set at the next event.
- **Loxleys is the next thread, deliberately held for its own chat.** The method
  from Marion Court is what transfers: pull reach/frequency and disjoint weekly
  buckets from the API (the nightly CSVs carry neither), check what the
  retargeting audience actually contains by resolving object_ids to names, and
  read cost per *female* LP view rather than blended. Note Loxleys already has a
  budget ladder recorded in memory (`lx-campaign-live`) and its own event on
  2026-09-22 — so it is not a copy of this situation.
- **Do NOT rebuild the `MC Retargeting` audience.** An earlier revision of that
  report said it contained none of our videos; that was wrong. It is correctly
  scoped — 88 Marion Court renditions, 08-17 → 08-29, kept current.

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
