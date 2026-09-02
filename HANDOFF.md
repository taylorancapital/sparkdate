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

- **The ad lever for women is decided and not yet pulled.** The plan and this
  morning's evidence: `reports/AD_LEVER_WOMEN_2026-09-02.md`; the lifetime ad
  history behind it: `reports/META_ADS_REVIEW_2026-09-02.md`. Three actions are
  Taylor's, in Ads Manager: attach the pixel to the two live Marion Court
  "(Traffic)" ads (they count landing-page views and nothing after); add
  "Visited but did not order tickets" to the MC retargeting set beside the video
  audience; raise the Loxleys female prime budget to a 70/30 split now, not at
  the Sep 8 ladder step. Next step for a session: a week after any of those
  land, `npm run ads:review` and read purchases by gender per ad. That is the
  score; landing-page views are not.
- **Taylor must pause the Cowork nightly task himself; nothing in the repo can.**
  Until then Cowork and the local run both fire and race for one branch name.
  The local nightly is proven: the 02:00 run on 09-02 skipped all three steps
  exactly as #398 intended, after the 01:23 hand run had produced the report.
- **Marion Court: four ad changes went live 2026-09-02 and are running.** Traffic
  and retargeting budgets up, retargeting narrowed to women and the declared-Single
  filter dropped. Values, rationale and rollback: report §10. Both campaigns
  re-entered learning, so **do not tune either again before 2026-09-08 16:30**,
  when both end — each edit restarts the clock and there are only ~6 days. Next
  step is to read the two Marion Court watch signals below around 09-04 and change
  nothing until then. The pixel and audience edits above are the exception Taylor
  asked for; make them once, not repeatedly.
- **MC-RT-QUANG and MC-RT-NO-SCORECARDS stay running — deliberate, for the data.
  Do not pause them as tidy-up.** They will only get ~250–400 impressions each:
  enough to spot a dead ad, not to rank them.
- **Loxleys is next, held for its own chat.** Do not pattern-match Marion Court
  onto it: it has its own budget ladder (memory `lx-campaign-live`) and a 09-22
  event, so none of the six-day time pressure that shaped those calls applies.
  Re-derive from its own numbers.

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
- **An Eventbrite listing dated 2026-08-10 is refused by every sync run, and
  nobody has checked whether it holds buyers.** "SparkDate — Good Good Night @
  Good Good Things Philly (2026-08-10)" matches no event doc, so the sync skips
  it rather than guess — correct, and still refusing as of the 09-02 03:20 run.
  Our Philly doc is dated 08-31 under a *different* EB id (1994945955054), so
  this reads as a rescheduled or duplicate listing. If anyone bought on it and
  never transferred, they exist in no ticket, registration or lead record.
  Needs `EVENTBRITE_TOKEN` to count attendees; then either point the 08-31 doc
  at it, or confirm it is empty and leave it.
- **The nightly still cannot catch up or wait for a network.**
  `StartWhenAvailable` and `RunOnlyIfNetworkAvailable` are both `False` on the
  02:00 task, which is why 8 of 23 nights never ran and why the 08-29 run failed
  both network steps 14 minutes after a boot. Needs an elevated shell.
- **No woman's testimonial exists in any ad.** The only testimonial creative is
  Quang's. The plan above wants one for the women's prime; someone has to ask
  an attendee.
- `reports/META_CAPI_PROMPT.md` is untracked and has never been run.
- **Two report branches the sweep refuses as STALE and nobody has replayed onto
  main:** `claude/accessibility-analysis-2026-08-27` and
  `claude/content-freshness-analysis-2026-08-29`. Cherry-pick or drop them.
- `utm_content=proof_rsa1` sharing is **partly fixed** — read live 2026-09-02,
  all four Marion Court *retargeting* ads now carry a distinct `utm_content`
  (`mc_rt_*`) and `utm_source=Facebook`. The two *Traffic* ads still share
  `proof_rsa1` and hardcode `utm_source=Instagram`, so Women vs All-Genders
  cannot be split in GA4. `url_tags` is settable only at creative creation, so
  fix it at the next event's creative build, not mid-flight.
- `/admin` took 13 sessions from 1 user attributed to `facebook / paid_social`
  with 5 key events. Looks like internal traffic wearing paid attribution;
  nobody has looked. Small, but it feeds the internal-traffic-filter question.
- **An attendee with no gender on file gets no seat at all.** The chemistry
  tool counts them in a coral "N excluded" warning and then leaves them out of
  every table and every round — at an event that is a person standing in the
  room with nowhere to go. Same root as the hetero-only pairing the code
  already flags as waiting on a "looking to meet" field. Decide: seat them
  anyway, or make gender required at checkout.
- **Two strings in `content/brand.json` still describe the old 1-on-1 length.**
  `universal.run_of_show._source` cites `ONE_ON_ONE_MS`, which #379 replaced
  with `_oneOnOneMinutes`; `_wrong_before` still asserts "Seven minutes is not
  a value the tool offers", which is now the default. The numbers themselves
  were corrected before #376 merged — these are the leftover prose, in the file
  that is meant to BE the record.

## Watch signals

- **Marion Court retargeting frequency should fall 13.8 → ~2.5.** If it does not,
  the pool is delivery-limited rather than pool-limited — report §3b is explicitly
  unresolved on that — and the extra budget is buying repetition, not reach.
- **Marion Court Traffic cost per LP view at $10/day.** It ran $0.31 at $6/day and
  the model assumed ~$0.38 blended; above ~$0.68 the increment is not paying.
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
