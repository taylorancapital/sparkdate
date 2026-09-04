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

- Nothing. The last session added two women's testimonials to the six site
  rotators and closed clean.
- **Marion Court is hands-off until 2026-09-08 16:30, when both campaigns end.**
  Both are in learning and every edit restarts the clock. Two items are deferred
  BY DECISION, not forgotten — the retargeting set's missing site-visitor
  audience, and the Traffic ads' shared `utm_content`, unfixable on a live
  creative. Do not re-raise them as findings, and do not pause MC-RT-QUANG or
  MC-RT-NO-SCORECARDS as tidy-up; they are running for the data. Score it 09-09
  on **purchases by gender per ad**, never landing-page views.
- **Loxleys is next and is held for its own chat.** Event is 09-22, so none of
  Marion Court's pressure applies. Its budget ladder is deliberate (memory
  `lx-campaign-live`), and its paused campaigns and unattached audience are by
  design — the retargeting is meant to be built at the Sep 8 ladder step. When
  those creatives are built, import `urlTags` from `scripts/ad-utm.js` and let
  it fail rather than typing a tag; nothing live is retagged.
- **Free-listing syndication is part-done and the rest is unverified.**
  Eventbrite is confirmed live and correctly priced. NOT confirmed from outside:
  whether Marion Court's 2-for-1 ticket got renamed to name women, and whether
  the AllEvents link repairs and eight remaining calendars were done. Next step:
  get the Chrome agent's final report and **spot-check the hrefs it claims** —
  two sites silently corrupted a link already, which is why `/l/` links exist.

## Waiting on Taylor — nothing in the repo can do these

- **GA4 Admin → Custom definitions:** register event-scoped `field`,
  `skipped_details`, `page_started_hidden`, `started_hidden`. The Admin API is
  disabled here, so it is a UI click; until then `checkout_field_started` and
  the ghost-session split read `(not set)`.
- **Pause the Cowork nightly task.** Until then it and the local 02:00 run both
  fire and race for one branch name.
- **Eight venue-outreach emails sit unsent in Gmail Drafts by his own choice.**
  Check the From line before sending — the signature says `hello@sparkdate.date`,
  and if that is not a send-as alias on that account all eight leave from his
  personal Gmail contradicting their own signature. Uptown Beer Garden is
  phone-only, (267) 639-4493 — 700 standing, best room on the list. Contacts:
  `Business Plan/files/Venue_Outreach_Package.md`. That outdoor list expires with
  the season (~late October); Cherry Street Pier, Frankford Hall and Evil Genius
  are the year-round three that survive it.
- **Philadelphia is quoted at $24.99 in a $29.99 market** on the city page and
  two blog posts. The fix is a decision, not a copy edit: stop quoting a number
  and point at the event page, or commit to per-city ones.
  `reports/FACT_AUDIT_2026-09-01.md` §2.
- **The F&B model files were relabelled, not recomputed.** `$1,400` still feeds
  net-profit per event, the `$10,000/month` venue figure and the `$11,200`
  eight-event total, all assuming a mid-tier room — while the new target list is
  casual tier (~$20-25/head). `reports/VENUE_PITCH_FACT_AUDIT_2026-09-01.md`.

## Open threads nobody owns

- **Three women's testimonials now exist; none is in an ad.** Molly, Helesha and
  Anonymous M. are in `content/brand.json` and live on all six rotators. The only
  testimonial ad creative is still Quang's, so `reports/AD_LEVER_WOMEN_2026-09-02.md`'s
  ask is now a **build** job, not an asking job.
- **Nobody has bought a real ticket through `/lp` from inside the Instagram
  app.** The one test that settles the webview question.
- **The door records the same person twice and the audit cannot see it.** Two of
  twenty at Good Good held both a ticket marked absent and a door-created
  registration marked present. `scripts/audit-duplicate-attendees.js` groups by
  **email** and found neither — the door's missing email lookup is what creates
  the second account, so grouping by email cannot detect its own failure mode.
  `reports/EVENT_DEBRIEF_GOOD_GOOD_2026-08-31.md`.
- **Someone issued a free Eventbrite ticket type for women** — three of four
  female registrations at Good Good, `isComp` false on all. Nothing here created
  it or can see it. Who set it up, and is it live for the next event?
- **An Eventbrite listing dated 2026-08-10 is refused by every sync run** and
  nobody has checked whether it holds buyers. It matches no event doc, so the
  sync skips rather than guess. Needs `EVENTBRITE_TOKEN` to count attendees.
- **The nightly cannot catch up or wait for a network.** `StartWhenAvailable` and
  `RunOnlyIfNetworkAvailable` are both `False` on the 02:00 task — why 8 of 23
  nights never ran. Needs an elevated shell.
- **The pixel records more checkouts than carts** — `InitiateCheckout` 50 against
  `AddToCart` 19, seven days to 09-02. Counts read, firing code not; start in the
  client-side pixel calls, not in Meta.
- **An attendee with no gender on file gets no seat at all.** The chemistry tool
  counts them in a coral "N excluded" warning, then leaves them out of every
  table and round. Decide: seat them anyway, or require gender at checkout.
- `reports/META_CAPI_PROMPT.md` is untracked and has never been run.
- Two report branches the sweep refuses as STALE, never replayed onto main:
  `claude/accessibility-analysis-2026-08-27`,
  `claude/content-freshness-analysis-2026-08-29`. Cherry-pick or drop.
