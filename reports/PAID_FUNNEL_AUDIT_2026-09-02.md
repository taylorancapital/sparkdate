# Paid funnel audit — where an ad click stops between `/lp` and a ticket (2026-09-02)

**This report changes no site code.** It adds this file and nothing else. One
defect it found is offered as a separate task (the 2-for-1 gate, §5.1).

**Data.** Three sources, read together and reconciled where they overlap:

- The 09-02 nightly GA4 pull (28 `ga4-api-*-2026-09-02.csv`, window
  `20260519-20260902`, pulled 05:23 UTC) for lifetime shape.
- **Live GA4 Data API queries run for this audit** (property 536859339, same
  service account as the nightly), because the nightly set never splits paid
  social by webview, by landing page x device, or by campaign engagement. Every
  live window stops at **2026-08-31** — the last two days are dropped per
  `ANALYTICS_METHOD.md` §1 — and starts on 08-22 or 08-24, after the site
  changes of 08-22 and the webview flag going config-level on 08-23 (§10).
  Paid-social windows are not cut by the 08-25 internal-traffic filter because
  paid social was never internal traffic.
- `meta-insights-2026-09-01.csv` (window `20260826-20260901`, 8 campaigns) and
  the lifetime ad-level pull in `reports/META_ADS_REVIEW_2026-09-02.md`.
- A live walk of `/lp` → checkout at 375x812 on 2026-09-02 (Browser pane,
  desktop Chrome emulating a phone; a fast wired connection, not a webview).

**Traps applied.** §1 (two-day tail), §3/§10 (`begin_checkout` redefined
08-21 — no window here spans it), §4 (`/lp` fires no `view_item`; the checkout
path funnel is used instead), §6 (engagement is under-instrumented in webviews —
every bounce figure below is paired with a behavioural count that does not
depend on engagement pings), §7 (GA4 revenue is own-site only; Eventbrite is
invisible), §12 (counts are stated beside every rate).

---

## The answer in one paragraph

Nothing in the paid path is technically broken: the landing page resolves the
targeted event in about 100 ms, stores first-touch attribution, deep-links into
the checkout step, and Stripe mounts; checkout errors are three users in ten
days and 3-D Secure has never fired once in the property's history. What is
broken is the shape. Of every 1,000 paid visitors who land on `/lp`, about 36
tap Get Tickets, 33 see the checkout form, 8 pick a gender (the first field),
and 2 buy. The loss is in two places. First, the tap: the ads deliver roughly
four in five visitors inside the Instagram or Facebook in-app browser, where
the button is tapped by 1.4% of visitors against 26% in a normal browser, and
the average iOS in-app session records about one second of engagement — so the
75% bounce rate the question asks about is real, mostly bought by the Traffic
objective, and partly inflated by Meta loading the page before anyone looks at
it. Second, the form: across every channel, 77 people reached the checkout form
in ten days, 23 touched the first field, 8 entered a valid card, and all 8
bought — the form loses nine in ten before the card and loses nobody after it.
The paid form's first screen is a disabled button reading "Select Gender", a
dropdown, four more fields, a women-only 2-for-1 offer shown to men, and (for
the webview majority) a warning that checkout may fail. The changes that raise
conversion are to that first screen, to the page load between tap and form,
and to what a one-second visitor sees inside the coral card; the ad objective
is the upstream cause and is already scheduled for the 09-09 review.

## Four numbers

| | |
|---|---|
| `/lp` bounce rate, paid social, 08-25 to 08-31 (786 sessions) | **75%** |
| Paid visitors who tap Get Tickets: in-app browser vs normal browser | **1.4% vs 26%** (11 of 791; 20 of 78) |
| Checkout form → valid card, all channels, 08-22 to 08-31 | **10%** (8 of 77; every one of the 8 then bought) |
| Own-site purchases from paid social, 08-24 to 08-31 | **2** ($54.98 in GA4; Meta attributes 1 for the week to 09-01) |

---

## 1. EVIDENCE — the bounce is real, it is bought by the objective, and part of it may be nobody

**`/lp` from paid social bounces 75% in the last clean week** (08-25 to 08-31:
786 sessions, 195 engaged, average session 58 s, 1 key event, $0 revenue). The
same page from a desktop bounces 11% (83 sessions, 08-22 to 08-31). The
homepage from direct traffic bounces 34–41%; `/event` from any channel 0–8%.
Site-wide over the whole window: 55%.

| Landing page, cohort (window) | Sessions | Bounce | Notes |
|---|---:|---:|---|
| `/lp`, Paid Social (08-25..31) | 786 | 75% | 1 key event, $0 |
| `/lp`, mobile, all channels (08-22..31) | 1,007 | 72% | |
| `/lp`, desktop, all channels (08-22..31) | 83 | 11% | |
| `/`, Direct (08-25..31) | 37 | 41% | |
| `/`, mobile, all channels (08-22..31) | 77 | 27% | $87 |
| `/event`, mobile, all channels (08-22..31) | 25 | 8% | $27 |
| Whole property (05-19..09-02) | 4,911 | 55% | |

**By browser context it is two different pages.** Paid social, 08-24 to 08-31,
split on the `in_app_browser` flag:

| OS, browser | Sessions | Bounce | Engagement per session |
|---|---:|---:|---:|
| iOS, in-app (Instagram/Facebook) | 730 | 79% | **1.0 s** |
| Android, in-app | 73 | 79% | 6.6 s |
| Android, Chrome (mostly the auto-escape) | 38 | 26% | 13.7 s |
| iOS, Safari | 25 | 48% | 23.5 s |
| Windows | 18 | 11% | 6.8 s |

Eighty percent of paid sessions are iOS in-app, and that cohort averages one
second of recorded engagement. §6 of `ANALYTICS_METHOD.md` says engagement
under-reports in webviews, so §2 below pairs this with a count that does not
depend on engagement pings; the direction survives.

**By campaign it is the objective.** Same window, paid social, campaigns with
30+ sessions:

| Campaign · utm_content | What it is | Sessions | Bounce |
|---|---|---:|---:|
| Augweek1_philly · proof_rsa1 | Good Good Ad, Traffic objective | 193 | **89%** |
| Augweek3_lancaster · proof_rsa1 | Marion Court Traffic | 278 | 76% |
| Augweek3_philly · proof_rsa1 | GG Women Traffic + retargeting | 410 | 73% |
| LX_202609 · lx_prime_male_noplan | Loxleys Traffic, men | 48 | 63% |
| LX_202609 · lx_prime_female_showup | Loxleys Traffic, women | 35 | 49% |
| Augweek2_lancaster · proof_rsa1 | Tellus retargeting, Sales objective | 50 | **42%** |

The Traffic sets optimise for `LINK_CLICKS`; the visits they buy are the ones
that bounce. HANDOFF already schedules this for 09-09 (pixel attached 09-02,
both Traffic sets in learning); it is stated here as the cause of the number,
not re-raised as a decision.

**Some of the 79% may be nobody.** `public/lp.html` documents that Meta's
in-app browser opens the destination hidden and throttled before the user
swipes to it (that is what #299 fixed). A hidden load still fires GA4
`page_view` and `session_start`. For the week to 09-01 Meta counts 693 link
clicks and 582 landing-page views; GA4 counts about 708 paid-social sessions
over six of those seven days. GA4 recording more sessions than Meta records
landing-page views is consistent with prerendered ghosts inside the webview
count. The page captures `document.hidden` at start but only sends it on a
fetch failure, so the share cannot be measured today — see §7.3.

**One day is excluded.** 08-22 reads 22.6% bounce on `/lp` paid social because
`fb / paid_social` delivered 88 sessions that day, all engaged, 87 of them
firing `lead_form_started` and none `generate_lead`. That is not a human
pattern (Loxleys, the only campaign using the `fb` source macro, was created
08-30). The daily series from 08-23 reads 74, 72, 81, 77, 90, 87, 62, 68, 71%.

## 2. EVIDENCE — the tap: same button, 1.4% in the app, 26% outside it

Paid social, 08-24 to 08-31, users. The checkout path is
`/lp` → tap → `/events?event=…&checkout=1` (dialog opens on the form) → gender
→ card → buy. Each row is the GA4 event that fires at that step.

| Step (event) | In-app browser | Normal browser | All paid¹ |
|---|---:|---:|---:|
| Landed (`session_start`) | 791 | 78 | 870 |
| Tapped Get Tickets (`select_promotion`) | 11 | 20 | 31 |
| Checkout form shown (`begin_checkout`) | 11 | 17 | 29 |
| Picked a gender (`add_to_cart`) | 4 | 2 | 7 |
| Entered a valid card (`add_payment_info`) | 0 | 1 | 2 |
| Bought (`purchase`) | 0 | 1 | 2 |

¹ "All" includes 5 users whose events carried no flag; one of the two purchases
is among them.

**Per 1,000 landers: in-app 14 tap, 14 see the form, 5 pick a gender, 0 buy;
normal browser 256 tap, 218 see the form, 26 pick a gender, 13 buy.**

Two controls on the obvious objection that normal-browser visitors are simply
a different audience:

- **Same OS, same ads, different browser.** Android in-app users: 67 landed, 4
  tapped (6%), 4 reached the form. Android users who arrived in Chrome — nearly
  all of them the page's own auto-escape, attempted by 63 of the 67: 37 landed,
  10 tapped (27%), 11 reached the form. Those who land in Chrome are a
  self-selected, more engaged subset, so 4x is an upper bound on the browser's
  own effect; it is not zero.
- **Impressions the visitor actually saw.** `view_promotion` (live since 08-28)
  counts the CTA being at least half on screen. 08-28 to 08-31, paid social:
  in-app **344 views → 8 taps (2.3%)**; normal browser 33 → 16 (48%). The
  in-app cohort sees the button and does not tap it; this is not a
  left-before-load artefact.

Design context from the page itself: the button sits at 520 px in an 812 px
viewport (verified live), the sticky bar covers anyone whose fold is above
it, and the card names the event, venue, date and price. What the card does
not carry above the button is any proof or any description of what the night
is; the rotating testimonial sits below the card and types itself out one
character at a time, so a one-second visitor sees a half word (the live
screenshot caught "Good ne").

## 3. EVIDENCE — the form loses nine in ten before the card and nobody after it

All channels, 08-22 to 08-31 (ten days, `begin_checkout` post-redefinition):

| Step | Users | Of previous |
|---|---:|---:|
| Checkout form shown (`begin_checkout`) | 77 | |
| Picked a gender (`add_to_cart`) | 23 | 30% |
| Entered a valid card (`add_payment_info`) | 8 | 35% |
| Bought (`purchase`) | 8 | **100%** |
| Any checkout error (`checkout_error`) | 3 | |

By landing page (checkout-path funnel, same window): `/lp` 1,051 → 26 form →
2 card → 2 bought; `/` 85 → 14 → 4 → 4; `/events` 84 → 13 → 1 → 1; `/event`
30 → 17 → 1 → 1. The homepage visitor who reaches the form gets a card in 29%
of cases; the `/lp` visitor 8%. Audience and page are confounded here, which is
why §7 asks for a split test rather than a conclusion.

**Payment is not failing; it is not being attempted.** Lifetime `checkout_error`
is 28 events from 14 users (18 `card_incomplete` from 8 users — a Reserve tap
with a half-filled card field, retried 2.25x). Inside webviews: 2 events, 1
user. `checkout_3ds_required` has never fired — it is absent from the property's
35 event names. The 08-22 diagnosis found zero incomplete PaymentIntents in
Stripe's entire history; that read was not repeated (§8), and nothing since
contradicts it.

## 4. VERIFIED LIVE — what the paid visitor actually gets

Walked on 2026-09-02 at 375x812 with the Marion Court `eventId` and a paid
UTM set.

**`/lp` works.** `/api/next-event` answered in ~3 ms from cache (cold TTFB
0.73 s from `curl`), the card read "SparkDate: Real People, Real Drinks, Real
Court · Marion Court Room, Lancaster · Tue, Sep 8 · in 6 days", the button
read "Get Tickets — $24.99" with the $2.50 fee disclosed beneath, `href`
resolved to `/events?event=WUaooYvOq0eC0D1QVCvQ&checkout=1&utm_…` with all four
UTMs carried, and `localStorage.sparkdate_attr` held the first-touch UTMs with
`landing_path` and `first_seen`. DOMContentLoaded 109 ms, load 445 ms, 120 KB
transferred. No scarcity line showed (18 of 30 seats remain; the rule needs
≤10 or ≤25%).

**The hop costs a second page.** `/events` is 175 KB of HTML, then Firebase,
then a Firestore query of every upcoming event, then Stripe. On a wired desktop
connection: DOMContentLoaded 0.99 s, Firestore back and the dialog open at
1.96 s, `load` 2.02 s, Stripe's frames finished at 7.7 s. `/lp` prefetches the
HTML and preloads Stripe.js; nothing preloads Firebase, and the dialog cannot
open before the Firestore read returns. A throttled webview on a phone will
be a multiple of this; the visitor sees the events grid, then a modal pops
over it.

**The form's first screen.** The dialog opened on the checkout step, correctly
skipping the details step. What is on screen: eyebrow "Step 2 of 2 · Checkout",
"Reserve your spot", the event line, then a **Gender** dropdown reading
"Select…", Name, Email, Phone (optional), the card field, a 2-for-1 checkbox.
The form is 1,032 px tall; the submit button's top edge is at 1,029 px in an
812 px viewport, so it is below the fold, and when it is reached it is
disabled and reads **"Select Gender"** until the dropdown is used. Selecting
"Man" enables it as "Reserve Spot · $27.49" — and leaves the 2-for-1 box on
screen (`display: flex`), see §5.1. In an Instagram or Facebook UA the code
also inserts an amber block directly above the button: *"Checkout may fail in
this app's browser. Instagram and Facebook block the security step your card
needs."* (`events.html` `#modalIabWarn`; not rendered in this walk because the
Browser pane cannot present an Instagram UA).

## 5. DEFECT — what is actually broken, in order of cost

1. **The women-only 2-for-1 is offered to men in the dialog the ads land in.**
   `public/event.html` hides its toggle (`#twoForOneToggle hidden`, shown only
   for `woman`); `public/events.html` renders `.two-for-one-toggle` for
   everyone. A man who ticks it fills four +1 fields, submits, and
   `api/purchase-ticket.js` answers 400 "2-for-1 is available to women only",
   which the dialog maps to `other` and shows as "We could not complete your
   purchase." Verified live with gender=man. Offered as a task chip.
2. **The checkout step tells ~80% of paid visitors their card may fail, for a
   failure with no recorded instance.** Zero `checkout_3ds_required` ever, zero
   incomplete PaymentIntents at the last Stripe read, one webview user with a
   card error in the whole history. The block sits between the price and the
   button. This is a copy decision that has outlived its evidence, not a code
   bug.
3. **The Reserve button is below the fold and disabled on arrival.** A paid
   visitor who just tapped "Get Tickets — $24.99" lands on "Select…" and, if
   they scroll, "Select Gender". Twenty-two of 29 paid form viewers never
   touched the first field (§2).
4. **Two measurement gaps hide the next answer.** `customEvent:reason` is
   registered but reads `(not set)` on all 25 `checkout_error` events, so the
   `card_incomplete` retries cannot be read; `skipped_details` on
   `checkout_form_started` is sent but not registered, so the straight-to-form
   path cannot be told from the details path in any report.
5. **Ads can outlive their event.** `targeted_event_not_found` fired for 6
   Facebook paid users — a campaign link whose `eventId` no longer resolves,
   after which `/lp` quietly sells the soonest event instead. The Good Good set
   ended 08-31, so this is small now; it will recur at every event boundary
   unless ad-set end dates are checked against event dates (the UTM process
   memory already says "ACTIVE ≠ delivering, check `end_time`").

Not broken, checked: `/founding` now redirects to `/lp` (48 stale sessions
predate the fix); `next_event_fetch_failed` is 2 events since #299; Loxleys'
`{{site_source_name}}` macro fragments the source into `fb`, `ig`, `th` and one
literal `{{site_source_name}}` row — by design under #411, sum them when
reporting.

## 6. MECHANISM — why the numbers look like this

- **The objective buys the visit that bounces.** `LINK_CLICKS` optimisation
  finds people who tap, including by accident on a full-bleed video in a feed.
  Those taps open Meta's in-app browser on iOS, where the page gets one second.
  Retargeting on the Sales objective bounces at 42% on the same page.
- **The webview is a worse room, not a broken one.** Same Android phones: 6%
  tap in-app, 27% in Chrome, with selection caveats. The button works; the
  visitor is less present. iOS has no escape hatch at all (Apple gives a
  webview no supported way to hand a URL to Safari), so 80% of paid visitors
  will keep arriving here and the path has to work inside it.
- **The tap buys a second page load, a database read and a wall of fields.**
  Two seconds on a wired desktop before the form exists; then five inputs and
  a disabled button. Intent that survived the ad and the tap is spent waiting
  and then reading.
- **Nothing after the card leaks.** Eight valid cards, eight tickets. Every
  dollar of loss is before the card is complete.

## 7. DECISION — changes to raise conversion once they hit the page, in order

Each item names the metric that scores it, so the 09-09 review can say whether
it worked instead of guessing.

1. **Rebuild the first screen of the checkout dialog (`public/events.html`).**
   Gender as two tap buttons at the top (Woman / Man) instead of a `<select>`;
   the submit button enabled from the start with the price on it and
   validation on submit, not a disabled "Select Gender"; the 2-for-1 block
   hidden until Woman is chosen (copy `event.html`'s pattern — this also
   closes §5.1); Phone moved below the button or dropped from the paid path
   (the API does not need it); the button visibly above ~700 px. **Score:**
   `add_to_cart / begin_checkout` (all channels now 30%, paid 24%) and
   `add_payment_info / begin_checkout` (now 10%). If the paid form matched the
   homepage's 29% form-to-card, the same 29 paid form views would have yielded
   about 8 cards instead of 2.
2. **Remove the "Checkout may fail" block from the checkout step.** Keep a
   quiet "Trouble paying? Open in Safari" text link under the button, and keep
   the `/lp` banner's copy-link for the rare card that does need it. **Score:**
   webview `add_payment_info / begin_checkout` (now 0 of 11).
3. **Take the second page out of the paid path.** `/lp` already knows the
   event from `/api/next-event` and needs only Stripe.js and
   `/api/purchase-ticket` (which prices server-side) to sell it. Render the
   checkout inline on `/lp` for the targeted event — no Firebase, no Firestore
   read, no navigation — and keep `/events` for browsing. This is the largest
   change on the list and the one most likely to move the in-app cohort, which
   cannot leave the webview and currently pays the hop in full. A cheaper
   interim: on `/events?checkout=1`, open the dialog from `/api/next-event?id=`
   before the Firestore list returns. **Score:** `begin_checkout /
   select_promotion` (now 29 of 31, but only after the wait) and, once
   measured, time-to-form; in-app `add_to_cart / begin_checkout`.
4. **Split-test the ad destination inside one ad set.** Same creative, three
   ads: `/lp`, `/events?event=X&checkout=1`, `/event?id=X`. The Meta review's
   §DECISION 4 already proposes `/event`; the `checkout=1` arm is the missing
   one. This is a destination choice, not a landing-page variant. **Score:**
   `begin_checkout` per landing-page view and purchases per arm from
   `tickets.channel` + `utm_content` (per-ad attribution works since 08-29).
   Hold until the Marion Court sets end 09-08 (HANDOFF: hands-off until then).
5. **Give the one-second visitor something to read inside the coral card.** One
   approved proof line above the button (the fact-audit gates which numbers
   are allowed), and render the first testimonial complete, letting the
   typewriter run on rotations only. The typewriter on CTA quote boxes is
   wanted (#346); this keeps it and stops the first frame being a fragment.
   **Score:** in-app `select_promotion / view_promotion` (now 2.3% on 344
   impressions).
6. **Instrument what the next report will need.** (a) Send `page_started_hidden`
   on `page_view` from `/lp` and fire one `lp_visible` event on first
   visibility, so ghost sessions can be subtracted from the bounce; (b)
   register `skipped_details` and fix `reason` on `checkout_error`; (c) a
   first-focus event per checkout field so the drop between fields is visible.
   Zero user-facing change; without (a) the 79% cannot be trusted as a human
   number.
7. **Upstream, and already scheduled.** The Traffic objective is the cause of
   the bounce table in §1. Nothing here should change before the 09-09 review
   reads purchases by gender per ad, per HANDOFF.

What not to do: hosted Stripe Checkout as a webview fix (the 08-22 report
already showed the webview is not failing payments, and this audit finds the
loss before the card), per-ad landing-page variants (memory: one landing page,
no variants), and any new number on the page that is not in the approved
stats.

## 8. What I did not verify

- **Stripe since 08-22.** `STRIPE_SECRET_KEY` is not in this shell, so
  incomplete PaymentIntents and `requires_action` were not re-read; the zero
  is the 08-22 dashboard figure.
- **A real purchase from inside the Instagram app** (the five-minute test the
  08-22 report asked for). No record that it was ever done. It remains the one
  test that settles the webview question directly.
- **Meta prerender share.** Inferred from the fetch-failure evidence and the
  sessions-versus-LPV gap, not measured; §7.6(a) is how to measure it.
- **The in-app warning block's rendering** — the Browser pane cannot present
  an Instagram UA; read from source.
- **Dialog timing on a real phone.** Measured on desktop emulation over a wired
  connection; a webview will be slower, by an amount not measured.
- **`tickets.channel` for the two paid purchases** — Firestore was not read.
- **The 08-22 `fb / paid_social` burst** is excluded on pattern, not proven
  non-human.
- **Meta's own funnel counts** are not reconciled to GA4's; the two count
  different things (`META_ADS_REVIEW_2026-09-02.md` says the same).

---

## Appendix — the live queries

All against property 536859339 via the Data API; a re-runnable script lives in
the audit session's scratchpad and is described in memory
`adhoc-ga4-queries-from-a-worktree`. Paid Social = `sessionDefaultChannelGroup`
filter. Webview = `customEvent:in_app_browser`.

| Table | Dimensions | Window |
|---|---|---|
| Landing x channel bounce | `landingPage`, `sessionDefaultChannelGroup` | 08-25..31 and 08-22..31 |
| Paid: landing x webview | `landingPage`, `in_app_browser` | 08-24..31 |
| Paid: event x webview (funnel counts) | `eventName`, `in_app_browser` | 08-24..31 |
| Paid: checkout events x OS x webview | `eventName`, `operatingSystem`, `in_app_browser` | 08-24..31 |
| Paid: OS x webview engagement | `operatingSystem`, `in_app_browser` | 08-24..31 |
| Paid: campaign x content bounce | `sessionCampaignName`, `sessionManualAdContent` | 08-22..31 |
| Paid: promotion CTR x webview | `itemPromotionName`, `in_app_browser` | 08-28..31 |
| Paid: daily `/lp` bounce | `date` | 08-22..31 |
| All: checkout-path funnel x landing page | `runFunnelReport`, breakdown `landingPage` | 08-22..31 |
| Paid: checkout-path funnel x webview | `runFunnelReport`, breakdown `in_app_browser` | 08-24..31 |
| `checkout_error` category x webview | `customEvent:category`, `in_app_browser` | 05-19..08-31 |
| Page engagement | `pagePath` in `/lp`, `/events`, `/event`, `/` | 08-22..31 |

Page engagement, for the record: `/lp` 1,150 views, 943 s of engagement
(0.8 s per view); `/events` 559 views, 7,833 s (14 s); `/` 161 views, 2,118 s
(13 s); `/event` 42 views, 256 s (6 s).

Meta, week 08-26 to 09-01: $172.72 across 8 campaigns, 693 link clicks, 582
landing-page views, 1 attributed purchase (Tellus retargeting), 3 initiated
checkouts, 4 add-to-carts, 6 leads.
