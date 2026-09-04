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

- **The paid path is rebuilt on main (09-03; `reports/PAID_FUNNEL_AUDIT_2026-09-02.md`
  §7 items 1–6) and the 2-for-1 is OPEN TO EVERY BUYER, advertised to women only
  — Taylor's call, 09-02 evening, on legal grounds; never gate it by gender again.**
  Three things remain, none of them code. (1) **Taylor, in GA4 Admin → Custom
  definitions:** register event-scoped `field`, `skipped_details`,
  `page_started_hidden`, `started_hidden`. The Admin API is disabled on this
  project, so it is a UI click; until it is done `checkout_field_started` and
  the ghost-session split read `(not set)`. (2) **The 09-04 nightly is the first
  read of `/lp` selling inline** — `view_item`, `begin_checkout`, `add_to_cart`
  and `lp_visible` now fire there; `ANALYTICS_METHOD.md` §4 and the 2026-09-03
  row in §10 say what to expect, and a rise in the checkout-by-landing-page
  funnel's `/lp` row is instrumentation before it is demand. (3) **After
  09-08, audit item 4:** three ads in one Loxleys set, same creative,
  `/lp?eventId=KL4onXm7hJbqiwI9quAZ`, `/events?event=KL4onXm7hJbqiwI9quAZ&checkout=1`,
  `/event?id=KL4onXm7hJbqiwI9quAZ`, url_tags via `scripts/ad-utm.js`. Still
  never done by anyone: **buy a real ticket through the new `/lp` form from
  inside the Instagram app** — the one test that settles the webview question.
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

- **Eleven free listing surfaces exist; nobody has confirmed the last eight
  landed.** Verified from outside: Eventbrite pricing and copy, and the
  Facebook, Google Business and AllEvents listings. NOT verified: the eight
  remaining calendars (LancasterOnline, LancasterPA, both Visit Lancasters,
  Fig, Nextdoor, Patch, Chamber) or the Meetup post to our own group.
  **Next step: open each claimed listing and read the actual `href` of its
  ticket link.** Do not trust a report that says it saved one — AllEvents
  HTML-escaped the ampersands and Discover Lancaster truncated at 100 chars,
  both silently, which is the entire reason `/l/` short links exist.
- **Ticket Tailor is abandoned, and two live pages still say "Sold out".**
  Both events posted 09-02, then held unsold — which makes Ticket Tailor title
  the page `Sold out – <event>` and emit `"offers": []`, defeating the only two
  reasons to be there. Taylor stopped 09-03: the dashboard wants a password he
  does not have, and the channel does not justify recovering one. **No action
  needed.** The pages are unlinked, in no sitemap, and both events pass by
  09-22, after which the titles are moot. If anyone ever wants it closed:
  reset the password and unpublish both — do NOT "fix" it by turning sales on,
  which reopens the third-checkout and nothing-syncs problems. Full finding in
  the `tickettailor` entry of `content/listing-sites.json`.
- **Philadelphia is quoted at $24.99 in a $29.99 market.** The city page and
  two Philly-targeted blog posts state a flat price; Good Good Things was
  $29.99. `reports/FACT_AUDIT_2026-09-01.md` §2. Deliberately not edited: the
  fix is a decision — stop quoting a number and point at the event page, or
  commit to maintaining per-city ones. First is cheaper to keep true.

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

## Watch signals

- **Marion Court retargeting frequency should fall 13.8 → ~2.5.** If it does not,
  the pool is delivery-limited rather than pool-limited — report §3b is explicitly
  unresolved on that — and the extra budget is buying repetition, not reach.
- **Marion Court Traffic cost per LP view at $10/day.** It ran $0.31 at $6/day and
  the model assumed ~$0.38 blended; above ~$0.68 the increment is not paying.
- **The `/lp`-vs-`/` gap was read with the channel control on 09-02**
  (`reports/PAID_FUNNEL_AUDIT_2026-09-02.md`): the two paid leaks are the tap
  (in-app 1.4% vs normal browser 26%) and the form's first field (23 of 77
  touched it; 8 of 8 who entered a card bought). Score any checkout-form change
  on `add_to_cart ÷ begin_checkout`, and the in-app cohort on
  `select_promotion ÷ view_promotion` (2.3% on 344 impressions, 08-28..31).
- GA4 `facebook / paid_social` should read near-zero sessions from here on. New
  sessions there mean an ad re-introduced June's hand-typed lowercase-no-
  `eventId` URL shape. Same for `Facebook / paid`. Context:
  `reports/GA4_ANALYSIS_2026-08-30.md`.
- Promotions CTR is only computable on windows starting 2026-08-28 or later
  (report §H1) — earlier rows read clicks > views.
- **The rebuilt checkout form is scored by two ratios, from 2026-09-03 on:**
  `add_to_cart ÷ begin_checkout` (24% paid, 30% all-channel before the rebuild)
  and `add_payment_info ÷ begin_checkout` (10%). A climbing `checkout_error`
  with category `gender_missing` means the two-button gender step is not being
  understood; `card_incomplete` was 8 users lifetime and should not grow faster
  than form views do.
