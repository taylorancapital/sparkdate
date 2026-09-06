# HANDOFF — intent only

**Contract for this file. Read before editing it.**

This holds only what a machine cannot derive: what someone was mid-way through,
why, and what they would do next.

**Never write here:** open PRs, worktree inventories, stash lists, recent
commits, or "X is merged." `npm run brief` derives all of that live and is
correct; a typed copy is wrong within hours. The 2026-08-30 version of this file
listed two PRs as open (one had merged) and three worktrees that no longer
existed, while missing all four that did. **That is the rule this file exists
for.** It is about the KIND of content, not the amount.

**THE ~25 LINE CAP IS GONE (2026-09-04).** It was added in #357 when the file
was 29 lines, as shorthand for "intent only". It never held once: 29 → 48 → 94
→ 115 → 129 → 152 → 195 lines across seven sessions, and no session ever
trimmed to it. What it did instead was create pressure to delete live intent
from other people's chats to hit a number — which is a worse failure than
length, because a dropped thread is invisible and a long file is merely long.

**What replaces it, so the file cannot rot instead:**

1. **Date every entry** you add, `(MM-DD)`. Rot is then visible to a reader
   rather than requiring `git log`.
2. **Every entry names a next concrete step.** If you cannot write one, it is
   not in-flight intent — it is a finding (`reports/`), a fact (memory file) or
   a rule (`CLAUDE.md`). Move it and delete it here.
3. **Delete on completion, not on length.** Finishing a thread means removing
   its entry in the same PR.
4. **Never delete another session's entry to make room.** Correct it if you
   have evidence it is wrong or done, and say what the evidence was.

**Durable rules go in `CLAUDE.md`. Durable facts go in memory files. Findings go
in `reports/`.** If an entry here stops being "in flight," move it or delete it.

## In flight

- **`status: 'full'` is a SOFT close — answered and shipped, do not re-raise.**
  Taylor, 09-06: *"I'd like it to be soft close, a lot of these venues could
  utilize more people."* The flag means stop advertising, not refuse money. The
  three client surfaces honour it (off the grid, checkout swapped for the
  waitlist, `/api/next-event` stops promoting); the purchase endpoint
  deliberately does NOT, so a direct link, a stale tab or a host putting a
  walk-up through still completes. A hard block was written in #456 and reverted
  before it shipped, and a test now pins its absence so a later parity pass
  cannot re-add it. A hard close, if ever wanted, needs its own flag
  (`status: 'closed'`) so the soft one keeps working. Capacity is still enforced
  server-side and remains the real backstop. *(09-06)*
- **The #453 audit's queue is closed but not empty.** All 100 findings that had
  never been checked now have a verify verdict (52 confirmed, 43 rejected, 5
  split), but the usage limit cut the second adversarial lens short on the last
  batch, so some "confirmed" carry one lens instead of two. Four findings also
  sit outside that queue (196 − 92 verdicts = 104; the resume queue held 100).
  Everything acted on in #456 was re-read by hand first; the rest was not.
  **Next step: nothing, unless someone wants the tail — the raw verdicts are in
  the run journal named in the report, and the confirmed-but-unfixed ones are
  content and layout decisions, not defects.** *(09-06)*

- **The nightly's data pull runs from the MAIN CHECKOUT's working tree, while its
  analysis cuts from `origin/main`.** So merging a change to
  `scripts/fetch-ga4-tables.js` does nothing until someone runs `git pull` there.
  This cost a whole run on 09-04: a change landed taking the pull 28 → 46 tables,
  the re-run still wrote 28, and the report was written by current code against
  stale data with nothing in the log saying so — exit 0, PR opened. **Fix not built:** have the launcher
  fast-forward the checkout, or run the pull scripts out of the nightly clone, so
  steps 1-3 and step 6 cannot disagree. Memory:
  `nightly-pulls-from-stale-main-checkout`.
- **Two Google Ads questions are Taylor's alone, in the Ads console, not code.**
  (1) `Website traffic-Search-1` spent **$35.35 for ZERO attributed sessions**
  while the 20 sessions GA4 credits to Google Ads carry no campaign and no cost.
  (2) An unreplaced `<campaign-name>` tracking-template placeholder is carrying
  **41 key events**. Cause untested for both — auto-tagging off, an off-property
  destination URL, and gclid stripping all fit the data. The tables state the
  fact and no cause; do not let a report assert one.
- **Taylor: bump `ANALYTICS_CONTEXT.md`'s `Last updated:` to 2026-08-28.** It
  says 08-26, its mtime is 08-28, and it contains a section headed "SPLIT
  2026-08-28". Under the rule in the stamp-check PR that is a TRUE positive and
  clears once bumped — the old rule compared the stamp to the newest nightly
  report, which is regenerated daily, so it fired every night by construction and
  had consumed seven consecutive NEEDS-TAYLOR-INPUT slots.
- **One line to redact:** `scripts/fetch-ga4-tables.js` carries a real Stripe
  payment-intent id in a comment, in a public repo. Not a credential and not what
  #434 was about, but needless. Fold into the next PR touching that file.
- **The paid path is rebuilt on main (09-03; `reports/PAID_FUNNEL_AUDIT_2026-09-02.md`
  §7 items 1–6) and the 2-for-1 is OPEN TO EVERY BUYER, advertised to women only
  — Taylor's call, 09-02 evening, on legal grounds; never gate it by gender again.**
  Two things remain, neither code. (1) **Taylor, in GA4 Admin → Custom
  definitions:** register event-scoped `field`, `skipped_details`,
  `page_started_hidden`, `started_hidden`. The Admin API is disabled on this
  project, so it is a UI click; until it is done `checkout_field_started` and
  the ghost-session split read `(not set)`. (2) **After 09-08, audit item 4:**
  three ads in one Loxleys set, same creative,
  `/lp?eventId=KL4onXm7hJbqiwI9quAZ`, `/events?event=KL4onXm7hJbqiwI9quAZ&checkout=1`,
  `/event?id=KL4onXm7hJbqiwI9quAZ`, url_tags via `scripts/ad-utm.js`. Still
  never done by anyone: **buy a real ticket through the new `/lp` form from
  inside the Instagram app** — the one test that settles the webview question.
- **~~Marion Court is hands-off~~ — SUPERSEDED 09-05 by Taylor's instruction.**
  Its Traffic campaign is now PAUSED and a Sales campaign runs in its place; the
  retargeting set was left untouched exactly as this entry asked. The rest of
  the entry still holds for what remains running:
  Four ad changes went live 09-02 (`reports/META_ADS_REVIEW_2026-09-02.md` §10)
  and the pixel was attached to the two Traffic ads; both campaigns are in
  learning and each edit restarts the clock. Two remaining items are deferred BY
  DECISION, not forgotten — the retargeting set's missing site-visitor audience,
  and the Traffic ads' shared `utm_content`, which cannot be fixed on a live
  creative. Do not re-raise them as findings. MC-RT-QUANG and MC-RT-NO-SCORECARDS
  stay running for the data; do not pause them as tidy-up.
- **Both live events are now on a SALES objective and every Traffic campaign is
  paused (09-05).** This closes the "objective question asked and never
  answered" entry that sat here since 09-04. Taylor directed it; the analysis
  that preceded it is `reports/META_ADS_ROOT_CAUSE_2026-09-04.md`. Live now:
  `Loxleys | Sales` ($2.00/day, stops 09-22), `Marion Court | Sales`
  ($10/day, stops 09-08), `Marion Court Retargeting` (untouched, $6/day).
  `Loxleys | Traffic` and `Marion Court | Traffic` are PAUSED.
  **Two things the next session must NOT re-derive.** (1) The objective's
  evidence changed: on *purchases* it is p=0.224 and worthless, but on
  *initiate_checkout* — 44 events instead of 6 — it is p=8e-18 and reproduces
  inside Instagram Stories and Facebook feed separately. Use the checkout
  endpoint. (2) **Placement was REFUTED as a lever** and my earlier
  recommendation to restrict it is withdrawn: Instagram's clicks arrive BETTER
  than Facebook's, and the in-app browser is a browser effect (FB app 71.5%,
  IG app 74.0%, p=0.31), not a placement one. Only Audience Network is
  genuinely bad. Memory: `automatic-placements-buy-stories`. *(09-05)*
- **`Marion Court | Sales` is a T-3 hail mary and must be scored as one.** Built
  09-05 on the 2-for-1 female creative because Taylor asked for women's sales.
  It has ~3 days minus review, and `purchase` had ZERO events in the prior 7
  days against the ~50/week Meta wants, so it will not leave the learning
  phase. **Judge it on whether women reach checkout, never on purchases** —
  there will be far too few to read. It also carries the first correct tags on
  a Marion Court ad (`mc_close_female_bringafriend`, CTA `LEARN_MORE`); the
  live MC Women ad still carries `proof_rsa1` and `BOOK_TRAVEL` frozen in.
  *(09-05)*
- **The budget ladder takes as many campaigns as you register, and it is now
  loud about the ones you do not.** The hardcoded `CAMPAIGNS` array is gone;
  the list lives in `content/paid-campaigns.json`, the arithmetic in
  `scripts/budget-ladder.js` (offline-tested, `tests/budget-ladder.test.js`),
  and any campaign that is ACTIVE in the account but in neither the registry
  nor its `acknowledged` list is reported as UNGOVERNED with a non-zero exit.
  One account-wide daily ceiling ($40) now covers all runs at once — today the
  account reads $22.00/day, $2.00 laddered plus $20.00 outside it.
  **Three next steps, all small.** (1) **Taylor: `git pull` in the main
  checkout** — the 03:00 `SparkDate Budget Ladder` task runs `npm run
  ads:ladder -- --all --execute` from there, so this merge does nothing until
  it does (same flaw as the nightly's data pull, first entry above).
  (2) **Tellus Oct 6 needs a `brand.json` event entry before it can be
  registered** — the ladder reads the event DATE from brand.json and refuses a
  key it cannot find. Blocked on facts nobody has written down: confirmed date,
  ticket price, early-bird cutoff, and the run budget (the October slate report
  models $200). (3) **Both Marion Court acknowledgements expire 09-08** and
  will start reporting themselves as stale the next morning; retire them with
  the event. *(09-06)*
- **The 09-05 nightly (PR #449) credits Loxleys with 5.75 ROAS, "best in the
  account", and it is spurious.** The Loxleys ads went live 08-30; all four of
  its paid tickets were bought 08-14 to 08-24, before any ad existed. Since the
  ads started: $18 spent, 183 clicks, zero tickets. **The correction is now
  written down** — `reports/GA4_DEEP_READ_2026-09-06.md` §9, and the standing
  summary prints per-item SALE DATES next to any ad-credit claim so it cannot
  recur silently. **Next step is still Taylor's: close or correct PR #449
  itself** — the figure is live in an open PR body until he does. The general
  rule is memory `meta-attribution-is-not-sales`. *(09-05, updated 09-06)*
- **The "scrambled email UTM" ask is CLOSED — it was never an email-platform
  problem, and the report that closed it 404'd its own fix.** PR #449
  escalated it twice as needing the email vendor's send history. It decodes
  with a one-line cipher (a–f shift +1, g–z ROT13) to `Lancaster | Master
  List / email` — LNP | LancasterOnline's events newsletter, powered by
  Evvnt, where Taylor submitted both events on 09-02. GA4 carries the SAME
  channel twice, obfuscated (129 sessions) and plaintext (7): the 129 fired
  **zero** `view_item`, the 7 fired 6. **Taylor's fix, in the Evvnt
  dashboard: set each event's ticket URL to `sparkdate.date/l/lx-
  lancasteronline` and `/l/mc-lancasteronline`.** Those two links work —
  confirmed by loading each and reading the event title/date/venue/price out
  of the DOM, not just a `curl` 200 (see memory
  `lancasteronline-is-the-biggest-free-channel` for why a 200 alone doesn't
  prove it on this site). **What went wrong first:** the report printed each
  link with its destination on the next line starting `->`; copying both
  lines together mangles the URL into something the router correctly 404s.
  Taylor hit exactly this. Fixed in `reports/GA4_DEEP_READ_2026-09-06.md` and
  its artifact (commit `e6cc9513`, merged via #455) — the links now stand
  alone with an explicit warning not to paste the destination alongside them.
  Re-check in a week: `lancasteronline / listing` should show non-zero
  `view_item`. *(09-06)*
- **The nightly's depth problem is fixed in code, not in exhortation, and the
  first run under the new rules is tonight's 02:00.** Taylor, 09-06: the reports
  "are basically half a page and they really don't have great insights" — no
  traffic summary, no events summary, nothing on UTM gaps, against 46 tables
  pulled nightly (the 09-05 report read ~15 and named seven more as "skimmed").
  `scripts/ga4-nightly-summary.js` now computes the standing floor and prints a
  **coverage ledger naming every table and whether it was used**;
  `.claude/commands/nightly-ga4.md` makes TRAFFIC / EVENTS / UTM GAPS
  non-omittable and requires a numbers block in the PR body. **Next step: read
  the 09-07 nightly PR and check the ledger says 46/46 and the body carries
  numbers.** If a run skips the script, that is the thing to fix, not the prose.
  *(09-06)*
- **D3 is fixed: GA4 now has a Channel Group so `medium=listing` stops
  filing under Unassigned. Nothing left to do.** `reports/GA4_DEEP_READ_2026-
  09-06.md` flagged it as Taylor's call — `content/listing-sites.json`
  deliberately rejected `referral` as the medium (GA4 auto-assigns `referral`
  to any uncontrolled inbound link, so a hand-tagged listing would drown in
  it), which is exactly why GA4's Default Channel Group has no rule for
  `listing` and dumps it all into Unassigned. Taylor: "you do this." Built
  and saved live in GA4 Admin → Data display → Channel groups: **"SparkDate
  Channels"** — a copy of Default Channel Group plus one new rule, `Event
  Listings` = Session medium exactly matches `listing`. Confirmed against
  real data: the Traffic acquisition report, both groupings side by side,
  splits the old 283-session Unassigned bucket into 160 still-Unassigned and
  **123 sessions / $97.96 (16.91% of all revenue) now labeled "Event
  Listings."** This only changes GA4's own native reports —
  `ga4-nightly-summary.js` already parsed `eventbrite/listing` straight from
  source+medium and is unaffected. Data API dimension name for reference:
  `sessionCustomChannelGroupingSlot01`. *(09-06)*
- **Two Loxleys Traffic campaigns exist and only one carries the Single
  filter.** Pulled live 09-04 20:15: `Loxleys | Traffic` (`120251085229290542`)
  is ACTIVE at $3/day with **no `flexible_spec`**, while `Loxley's | Traffic`
  (`120251072593050542`) is PAUSED at $10/day **with
  `relationship_statuses:[1]`**. The active one matches the ladder in memory
  `lx-campaign-live`, so this reads as an intentional replacement rather than a
  duplicate — but it is why `single-filter-costs-80-percent` can say "Loxleys
  does not carry it" and a glance at the account can suggest otherwise. **Next
  step: confirm the paused pair is dead and archive it, or say why it is
  being kept, before the 09-22 retirement.** *(09-04)*
- **The score comes 09-09, not before.** ~~both Traffic sets still optimise
  `LINK_CLICKS`~~ — no longer true as of 09-05, both are PAUSED and the live
  campaigns are `OUTCOME_SALES`. Run `npm run ads:review` and read **purchases
  by gender per ad**, never landing-page views. Note the new ad sets carry a
  7-day click window; the paused ones were frozen at 1 day, so the two are not
  measured on the same instrument.
- **The UTM convention is enforced at BUILD time now (#411); its first real use was the three
  creatives built 09-05, not the Sep 8 retargeting.** `scripts/ad-utm.js` computes
  the tag from brand.json and refuses what GA4 cannot split;
  `tests/ad-utm.test.js` gates it with no token, which `ads:lint` never could.
  When those creatives are built, import `urlTags` and let it fail rather than
  typing a tag. Nothing live is retagged — `url_tags` is frozen at creation.
- **Taylor must pause the Cowork nightly task himself; nothing in the repo can.**
  Until then Cowork and the local run both fire and race for one branch name.
- **~~Loxleys is next, held for its own chat~~ — done 09-05, rebuilt on a sales
  objective.** Its retargeting is still unbuilt and the entry below still
  describes why that is by design: Its budget ladder is deliberate
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
- **The free-listing syndication run is part-done and the rest is unverified.**
  Eventbrite is fixed and confirmed live: Loxley's now reads $24.99 through
  Sep 7 then $29.99 (it had been selling $6 under the site, expiring Sep 1),
  and both descriptions carry the three-movements copy. NOT confirmed from
  outside: whether Marion Court's 2-for-1 ticket got renamed to name women, and
  whether the AllEvents link repairs and the eight remaining calendars were
  done. **Next step: get the Chrome agent's final report and spot-check the
  hrefs it claims** — two sites silently corrupted a link already, which is
  why `/l/` short links exist at all.
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
- **The 02:00 task can now catch up and wake the machine, but still will not
  wait for a network.** Taylor set `StartWhenAvailable` and `WakeToRun` to True
  in an elevated shell on 09-04, which closes the "8 of 23 nights never ran"
  hole. `RunOnlyIfNetworkAvailable` is still `False`, which is what made the
  08-29 run fail both network steps 14 minutes after a boot. Same elevated-shell
  fix, one more setting.
- **No woman's testimonial exists in any ad.** The only testimonial creative is
  Quang's. `reports/AD_LEVER_WOMEN_2026-09-02.md` wants one for the women's
  prime; someone has to ask an attendee.
- `reports/META_CAPI_PROMPT.md` is untracked and has never been run.
- **One report branch the sweep still refuses as STALE and nobody has replayed
  onto main:** `claude/content-freshness-analysis-2026-08-29`. Cherry-pick or
  drop it. (`claude/ga4-analysis-2026-08-28` is resolved — its report reached
  main via #308 under a different branch; the branch itself is a duplicate and
  can be deleted.)
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
- **118 sessions report country `(not set)` / continentId `ZZ`, fire 82 key
  events and produce $0.** A 58% key-event rate against roughly 3%
  property-wide, one session per user. Consistent with automated traffic, not
  proof of it — no IP or user-agent evidence was examined. It inflates every
  engagement and conversion rate the nightly computes. `ga4-api-geo-country-
  language-*.csv` carries the annotation in its own header.
- **`transaction_id` is being reused.** 16 distinct ids for 39 transactions;
  Firestore-style doc ids carry up to 8 orders each while Stripe
  payment-intent ids carry exactly 1, and one id appears on two different days.
  That is what #200 set out to fix. Whether this is legacy data or a live
  regression was NOT established — the range straddles the fix and nobody
  bisected it.

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
- **A rise in the checkout-by-landing-page funnel's `/lp` row is instrumentation
  before it is demand (09-03 on).** `view_item`, `begin_checkout`, `add_to_cart`
  and `lp_visible` only started firing on `/lp` when it began selling inline, so
  the first reads after 09-03 measure new events, not new interest.
  `ANALYTICS_METHOD.md` §4 and the 2026-09-03 row in §10 say what to expect.
  *(Restored 09-04 — dropped during a prune to hit the old line cap, which is
  exactly the failure mode that cap caused.)*
- **Google Ads spend now lands in `ad_spend` as `{date}__google` documents.**
  Any third spend source must namespace its doc id the same way — the Meta sync
  writes `ad_spend/{date}` with a whole-document `set`, so a shared id silently
  deletes a day of Meta spend. Memory: `google-ads-spend-is-unread`.
