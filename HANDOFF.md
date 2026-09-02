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

- **Marion Court is hands-off until 2026-09-08 16:30, when both campaigns end.**
  Four ad changes went live 09-02 (`reports/META_ADS_REVIEW_2026-09-02.md` §10)
  and the pixel was attached to the two Traffic ads; both campaigns are in
  learning and each edit restarts the clock. Two remaining items are deferred BY
  DECISION, not forgotten — the retargeting set's missing site-visitor audience,
  and the Traffic ads' shared `utm_content`, which cannot be fixed on a live
  creative. Do not re-raise them as findings. MC-RT-QUANG and MC-RT-NO-SCORECARDS
  stay running for the data; do not pause them as tidy-up.
- **The score comes 09-09, not before.** The pixel bought measurement, not lift —
  both Traffic sets still optimise `LINK_CLICKS`. Run `npm run ads:review` and
  read **purchases by gender per ad**, never landing-page views.
- **The UTM convention is enforced at BUILD time now (#411); its first real use
  is the Loxleys retargeting creatives on Sep 8.** `scripts/ad-utm.js` computes
  the tag from brand.json and refuses what GA4 cannot split;
  `tests/ad-utm.test.js` gates it with no token, which `ads:lint` never could.
  When those creatives are built, import `urlTags` and let it fail rather than
  typing a tag. Nothing live is retagged — `url_tags` is frozen at creation.
- **Taylor must pause the Cowork nightly task himself; nothing in the repo can.**
  Until then Cowork and the local run both fire and race for one branch name.
- **Loxleys is next, held for its own chat.** Its budget ladder is deliberate
  (memory `lx-campaign-live`) and the event is 09-22, so none of Marion Court's
  six-day pressure applies. Its retargeting is meant to be built at the Sep 8
  ladder step — the paused campaigns and unattached audience are by design.
- **Eight venue-outreach emails sit in Taylor's Gmail Drafts, unsent by his own
  choice (09-02).** Beer gardens and rooftops, per the revised criteria and the
  nine verified contacts in `Business Plan/files/Venue_Outreach_Package.md`. Two
  steps are his alone: **check the From line** — the signature says
  `hello@sparkdate.date`, and if that is not a send-as alias on that account all
  eight leave from his personal Gmail contradicting their own signature; and
  **Uptown Beer Garden is phone-only, (267) 639-4493** — 700 standing, the best
  room on the list, no published email anywhere. Yards and Silk City came from the
  old scraped CSV and are unverified; expect bounces.
- **That outdoor list expires with the season — late October, ~8 weeks from 09-02.**
  Cherry Street Pier, Frankford Hall and Evil Genius are the covered/year-round
  three that survive it. Independence and Morgan's Pier are already written as
  spring approaches rather than October fills; do not "fix" them back.
- **The F&B model files were relabelled, not recomputed.** `$1,400` still feeds
  net-profit per event, the `$10,000/month` venue figure and the `$11,200`
  eight-event total, all assuming a mid-tier room — while the new target list is
  casual tier (~$20-25/head). Taylor's decision to make, not a copy fix. Working:
  `reports/VENUE_PITCH_FACT_AUDIT_2026-09-01.md`.

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
  Quang's. `reports/AD_LEVER_WOMEN_2026-09-02.md` wants one for the women's
  prime; someone has to ask an attendee.
- `reports/META_CAPI_PROMPT.md` is untracked and has never been run.
- **Two report branches the sweep refuses as STALE and nobody has replayed onto
  main:** `claude/accessibility-analysis-2026-08-27` and
  `claude/content-freshness-analysis-2026-08-29`. Cherry-pick or drop them.
- **The pixel records more checkouts than carts.** Seven days to 09-02:
  `InitiateCheckout` 50 against `AddToCart` 19, so checkout is being reached
  without a cart firing. (`Purchase` 18 over `AddPaymentInfo` 12 is *explained* —
  server-side purchases.) Counts read, firing code not. Whoever picks this up
  starts in the client-side pixel calls, not in Meta.
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
