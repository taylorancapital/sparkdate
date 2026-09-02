# Meta ads review — what the past ads did for women (2026-09-02)

**This report changes no site code.** It adds this file, `scripts/meta-ads-review.js`
(the pull behind it, re-runnable as `npm run ads:review`), and nothing else.

**Data.** Every ad the account has run, pulled 2026-09-02 01:26 local from
`act_1672342180672647` via the Marketing API (Graph v21.0): 45 ads, 40 with any
delivery, lifetime window (Meta's maximum). Spend, impressions, clicks and
landing-page views (LPV) are split by Meta's own gender inference for the person
served. "Purchases" are Meta-attributed conversions, a stricter measure than
sales, and an ad can only count one if the pixel is in its tracking; §5 lists
the five current ads where it is not.
Targeting shown is the ad set's **current** setting; delivery is **lifetime**, so
a set edited mid-flight shows a mismatch, and the delivery record is the truth.
Appendix A lists every ad; Appendix B has each ad's copy, audience and results
by gender.

## The answer in one paragraph

The account has spent about $1,200 across forty ads and Meta can attribute six
purchases to all of it, three by women. The women who did buy came through
Eventbrite listings and, once, through a social-proof creative (Tellus, week of
08-18). Three things explain the gap. First, more than a quarter of the money in
women-targeted ad sets reached men, including the "bring your girl" 2-for-1,
which is a women-only offer. Second, the ads that buy women's attention
cheapest (Traffic-objective video, $0.11 to $0.30 a landing-page view) were
built without the pixel in their tracking, so they count a landing-page view
and nothing after it: no cart, no checkout, no purchase, and no signal for Meta
to learn from. Third, at the last event the
ticketed women showed up at a quarter of the men's rate, so seats are being
lost after the sale as well as before it. Getting more women into the room is
therefore three fixes, not one: deliver the women's ads to women, attach the
pixel to the Traffic ads so a purchase can be counted, and make arriving alone
feel safe.

## Four numbers

| | |
|---|---|
| Lifetime spend, 40 delivered ads | $1,197.77 |
| Share of it that reached women | 66% ($786.45) |
| Cost of one woman's landing-page view, all ads | $0.48 (1,627 views) |
| **Women's purchases Meta can see** | **3** (men: 3) |

## 1. EVIDENCE — a third of the "women's" money reached men

Twenty-four ads sit in sets whose current target is women. They spent $871.71,
and $241.74 of it (28%) was served to men or to people of unknown gender. Eleven
of those sets delivered more than a quarter of their spend to men:

| Ad (set currently aimed at women) | Spend | To men | Copy theme |
|---|---:|---:|---|
| Good Good Retargeting (Event 4) | $100.37 | $63.73 (63%) | social proof |
| Format A — Landing Page (Summer Nights) | $88.39 | $31.17 (35%) | positioning |
| Good Good Sales Obj Women (Event 4) | $61.76 | $39.60 (64%) | **2-for-1 / bring your girl** |
| Founders Mixer | $57.09 | $21.66 (38%) | positioning |
| MC-RT-STILL-THINKING | $51.92 | $18.77 (36%) | retargeting nudge |
| Good Good Ad (Event 3) | $51.44 | $19.20 (37%) | social proof |
| Format B — Eventbrite + FBEVENT | $51.32 | $18.63 (36%) | positioning |
| Format A — Eventbrite + FBWEB | $38.62 | $14.32 (37%) | positioning |
| MC-RT-STILL-THINKING V2 | $9.63 | $4.07 (42%) | retargeting nudge |
| MC-RT-QUANG | $1.04 | $0.57 (55%) | social proof |
| MC-RT-NO-SCORECARDS | $0.56 | $0.29 (52%) | positioning |

The one that matters most is the third row. "Thinking about it, but not alone?
Bring your girl — one ticket gets you both in" is the offer `content/brand.json`
restricts to female ads, and $39.60 of the $61.76 behind it was shown to men.
The Good Good roster is the other half of that record: both 2-for-1 seats were
men, both came, and no woman used the offer.

**MECHANISM.** Advantage+ audience is off on every set, and with it off gender
is a hard constraint, so lifetime delivery to men under a women-only setting
means the setting was not always women-only. The Marion Court retargeting set
was narrowed to women on 2026-09-02 (HANDOFF); the Good Good sets most likely
launched open and were narrowed or renamed later. **NOT VERIFIED:** I did not
pull the ad-set change history (`/{adset_id}/activities` would settle it). The
money was spent either way.

## 2. EVIDENCE — the objective sets the price of a woman's visit

| Campaign objective | Ads | Spend | To women | Women's LPV | Cost per women's LPV | Women's purchases |
|---|---:|---:|---:|---:|---:|---:|
| Traffic | 23 | $558.29 | 79% | 1,357 | **$0.33** | 0 (see §5) |
| Sales | 12 | $500.07 | 53% | 186 | $1.42 | 3 |
| Link clicks (June) | 5 | $139.41 | 57% | 84 | $0.95 | 0 |

The five cheapest women's landing-page views the account has ever bought were
all Traffic-objective video ads aimed at women:

| Ad | Women's LPV | Cost each |
|---|---:|---:|
| Loxleys, female, prime video | 42 | $0.11 |
| Landing page — Event 3 Women | 115 | $0.17 |
| Good Good Ad (Event 3, "28 people came") | 177 | $0.18 |
| GG Women — Traffic ("bring your girl") | 282 | $0.22 |
| MC Women — Video Ad (Traffic) | 178 | $0.30 |

A landing-page view is not a seat. GG Women — Traffic bought 282 women's views
of `/lp` for $62; Good Good then ticketed four women, three of them on free
Eventbrite tickets this account never touched. The 09-01 GA4 report has the
page-level reason: `/lp` earns about $0.10 a session and `/event` about $2.42,
and Eventbrite-listing traffic landing on `/event` runs $3.30 a session,
thirty-two times paid Facebook landing on `/lp`.

## 3. EVIDENCE — what bought the purchases Meta can see

By the copy's lead line (classified from the primary text; Appendix B shows each ad's):

| Theme | Ads | Spend | To women | Women's LPV | Cost each | Purchases (women / men) |
|---|---:|---:|---:|---:|---:|---:|
| 2-for-1 / bring a friend | 12 | $351.75 | 87% | 880 | $0.35 | 0 / 1 |
| Social proof ("28 people came", "Met my match", "what the night looks like") | 8 | $304.16 | 42% | 297 | $0.43 | **2** / 1 |
| Positioning (no swiping, a real room) | 12 | $340.00 | 61% | 279 | $0.74 | 1 / 1 |
| Retargeting nudge ("still thinking?") | 6 | $132.28 | 58% | 45 | $1.72 | 0 / 0 |
| Free tickets for women (July, DM to claim) | 2 | $69.58 | 100% | 126 | $0.55 | 0 / 0 |

And by funnel stage: the ten retargeting ads took $307 and hold four of the six
attributed purchases; the thirty prospecting ads took $890 and hold two.
Retargeting audiences here skew female without being told to (59–66% of spend
on the all-gender Tellus and Event 2 retargeting sets), because the prime ads
that fill them are aimed at women.

The 2-for-1 is the account's biggest theme by spend and its cheapest women's
click after social proof, and Meta has never attributed a woman's purchase to
it. Taylor's own read from 2026-08-25 (memory `social-proof-pulls-women`) is the
same: the Tellus social-proof creative converted women directly, four purchases
on 08-18, a 59%-female week.

## 4. EVIDENCE, from the room — buying is half of it

From `reports/EVENT_DEBRIEF_GOOD_GOOD_2026-08-31.md`, corrected roster:

| Good Good, 2026-08-31 | Ticketed | In the room |
|---|---:|---:|
| Women | 4 (3 free Eventbrite, 1 paid $32.49) | 1 |
| Men | 16 | 14 |

A gap of roughly 25% against 88% that price, comps and the 2-for-1 do not
explain. The debrief's hypothesis, and an outside operator's independent
remark, is the experience of arriving alone at a dive bar. Four data points, a
hypothesis, not a finding — but every ad dollar that does buy a woman's seat
runs into it next.

## 5. MECHANISM — the pixel is up; five current Traffic ads are not wired to it

- **The pixel dataset exists and fires.** `4390442851170732` ("Sparkdate Date's
  Pixel - Active Version") last fired 2026-09-01 23:58 UTC, and the site sends
  Purchase both from the page and server-side. Every Sales-objective ad carries
  it in `tracking_specs` and optimises for it, and so do most older Traffic
  ads: Good Good Ad, the Tellus Traffic pair, the three Landing page - Event 3
  ads, the Event 2 women's ads, and both Loxleys prime videos.
- **Five current Traffic ads carry no pixel in their tracking**, checked ad by
  ad on 2026-09-02: MC Women - Video Ad (Traffic), MC All Genders - Video Ad
  (Traffic), GG Women - Traffic, LX Women - Video Ad (Traffic) and LX All
  Genders - Video Ad (Traffic) (the last two paused). They report landing-page
  views and nothing after: the 282 women's views on GG Women - Traffic show no
  cart or checkout, while the older Traffic ads that do carry the pixel show
  carts and checkouts (Landing page - Event 3 Women: 5 checkouts; Good Good Ad:
  1 cart; Loxleys male prime: 1 checkout). None of those reported a purchase
  either, so the 0 in §2 is partly "cannot count" and partly "did not happen".
- **The 20-person floor on the website audiences is a separate question.** The
  pixel fires for every visitor whichever ad sent them, so ad tracking does not
  gate audience growth; the earlier handoff note that tied the two together is
  not supported by this pull. Not re-checked here.
- **Per-ad attribution in GA4 only became possible on 2026-08-29** when
  `utm_content` stopped reading `proof_rsa1` on every ad; before that no ad's
  clicks could be told from another's. This review uses Meta's own numbers for
  that reason.
- **Advantage+ audience is off everywhere**, so the leak in §1 is a history
  problem, not a targeting-expansion problem.

## DECISION — what to do, in order

1. **Attach the pixel to the two live Marion Court Traffic ads** (MC Women -
   Video Ad (Traffic), MC All Genders - Video Ad (Traffic)): in Ads Manager, the
   ad's Tracking section, website events, choose the dataset; or by API, set
   `tracking_specs` the way `scripts/meta-create-lx-prime-ads.js` does. The
   Loxleys prime videos already carry it. Until then those two ads can never
   count a cart, a checkout or a purchase, and nothing else on this list can be
   judged.
2. **Check gender delivery weekly, and never let 2-for-1 copy run where men are
   served.** `npm run ads:review` prints "women share of spend" beside each
   set's target; anything aimed at women and under about 90% is a set to fix.
   The two live Marion Court retargeting ads carrying 2-for-1 adjacent copy sit
   at 58–64% women lifetime; their current setting is women, so the leak should
   close from here — confirm next week.
3. **Lead the women's creative with proof, and demote the 2-for-1 to the
   second line.** The creatives that produced women's purchases were "28 people
   came to our first mixer", "What the night actually looks like", and Marion
   Court now has the Quang testimonial. "Bring your girl" buys the cheapest
   clicks and has never bought a seat.
4. **Send the women's ad to the event page, not `/lp`.** Test the female prime
   ad against `/event?id=…` for Marion Court: that page converts listing
   traffic at thirty-two times paid social on `/lp`. This is not a per-ad
   landing-page variant (memory `one-landing-page-no-variants`); it is the page
   that already exists for the event.
5. **Give the Eventbrite listing a women's pass.** It is the channel that sold
   the recent seats and has never had a copy or photo pass. Its first lines are
   what a woman reads before any of ours.
6. **Close the show-up gap.** A confirmation step for free tickets, a
   host-greets-you line in the pre-event email and on `/event`, the profile
   prompt for +1 seats (`api/cron-send-emails.js:491` still skips them), and a
   non-bar venue test when the calendar allows.
7. **Budget.** The Sales objective at $1.42 a women's view is defensible only
   while it is the objective that can see a purchase; once step 1 is done,
   move the women's prospecting budget back to Traffic video with the pixel
   attached and judge it by purchases, not views.

## What I did not verify

- Ad-set change history (which sets were opened, narrowed or renamed, and
  when). The mismatch between current target and lifetime delivery is real; the
  mechanism is inferred.
- Purchases by gender from Firestore for any event other than Good Good. Meta's
  attributed purchases are a floor, and the five Traffic ads named in §5
  cannot contribute one.
- Meta's gender inference; "unknown" rows are shown, never redistributed.
- Whether any of the 2026 June "Promoting website" boosts carried targeting at
  all (their sets report gender `0`).
- Nothing in this review was cross-checked against GA4 session counts; the two
  systems count different things.

## Appendix A. Every ad, by lifetime spend

| Ad | Campaign | Status | Aimed at | Spend | Impr | Reach | Link clicks | LPV | Purch | $/LPV | Women share of spend | Women share of LPV |
|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Campaign 1 Event 4  Good Good Campaign-Retargeting | Campaign 1 Event 4 Good Good Campaign-Retargeting | ACTIVE (set ends 2026-08-31) spending | women 18-65 | $100.37 | 4092 | 486 | 79 | 72 | 2 | $1.39 | 35.59% | 38.89% |
| Format A — Landing Page | Event 2 — Summer Nights — FB Web Format A | ARCHIVED (set ends 2026-07-29) | women 22-45 | $88.39 | 7488 | 4098 | 244 | 157 | 0 | $0.56 | 64.45% | 64.33% |
| Tellus AfterDark: Singles Edition Retargeting | Campaign 1 Tellus AfterDark: Singles Edition Retargeting | ACTIVE (set ends 2026-08-26) spending | all 18-65 | $73.06 | 3046 | 474 | 108 | 103 | 2 | $0.71 | 59.29% | 66.02% |
| GG Women - Traffic | Campaign 1 Event 3 Good Good Campaign | ACTIVE (set ends 2026-08-31) spending | women 22-45 | $62.10 | 10054 | 5411 | 337 | 282 | 0 | $0.22 | 100.00% | 100.00% |
| Campaign 1 Event 4  Good Good Campaign-Sales Object-Women | Campaign 1 Event 4 Good Good Campaign-Sale Obj Women | ARCHIVED (set ends 2026-08-31) | women 18-65 | $61.76 | 2190 | 931 | 38 | 36 | 1 | $1.72 | 33.94% | 38.89% |
| Event 2 Retargeting- Fixed | Event 2 Retargeting - Fixed | ARCHIVED (set ends 2026-07-29) | all 22-45 | $61.21 | 5720 | 786 | 89 | 59 | 0 | $1.04 | 51.25% | 52.54% |
| Campaign 1 Event 3 Tellus AfterDark: Singles Edition @ Tellus360 Campaign - Sales Obj Women | Campaign 1 Event 3 Tellus AfterDark: Singles Edition @ Tellus360 Campaign -Sales-Obj-Women | ACTIVE (set ends 2026-08-26) spending | women 18-65 | $60.74 | 2490 | 917 | 37 | 27 | 0 | $2.25 | 100.00% | 100.00% |
| Campaign 1 Event 3 Tellus AfterDark: Singles Edition @ Tellus360 Campaign - Sales Obj All Genders | Campaign 1 Event 3 Tellus AfterDark: Singles Edition @ Tellus360 Campaign -All Genders | ACTIVE (set ends 2026-08-26) spending | all 18-65 | $60.64 | 2677 | 912 | 47 | 45 | 1 | $1.35 | 37.45% | 37.78% |
| Event 2 - Women Awareness — Carousel 1 | Event 2 — Women — Awareness — LP | ARCHIVED (set ends 2026-07-29) | women 22-40 | $57.17 | 6560 | 3697 | 111 | 100 | 0 | $0.57 | 100.00% | 100.00% |
| Event: Founders Mixer! 🚀🍸💕 | Event: Founders Mixer! 🚀🍸💕 | ARCHIVED (set ends 2026-06-24) | women 22-65 | $57.09 | 7085 | 4440 | 164 | 62 | 0 | $0.92 | 61.67% | 58.06% |
| MC Women - Video Ad (Traffic) | Marion Court \| Traffic | ACTIVE (set ends 2026-09-08) spending | women 22-45 | $53.33 | 7627 | 3051 | 218 | 178 | 0 | $0.30 | 100.00% | 100.00% |
| MC-RT-STILL-THINKING | Marion Court Retargeting | PAUSED (set ends 2026-09-08) spending | women 22-45 | $51.92 | 2452 | 221 | 21 | 23 | 0 | $2.26 | 63.85% | 39.13% |
| Campaign 1 Event 3 Good Good Ad | Campaign 1 Event 3 Good Good Campaign | PAUSED (set ends 2026-08-31) spending | women 22-45 | $51.44 | 9298 | 4989 | 351 | 296 | 0 | $0.17 | 61.39% | 59.80% |
| Format B — Eventbrite + FBEVENT code | Event 2 — Summer Nights — FB Event Format B | ARCHIVED (set ends 2026-07-29) | women 22-45 | $51.32 | 5701 | 3359 | 126 | 38 | 0 | $1.35 | 63.50% | 76.32% |
| Campaign 1 Event 4 Good Good Campaign-Sale Obj Women | Campaign 1 Event 4 Good Good Campaign-Sale Obj All Genders | ARCHIVED (set ends 2026-08-31) | all 18-65 | $44.77 | 1642 | 852 | 27 | 24 | 0 | $1.87 | 40.23% | 45.83% |
| Format A — Eventbrite + FBWEB code | Event 2 — Summer Nights — FB Web Format A | ARCHIVED (set ends 2026-07-29) | women 22-45 | $38.62 | 3854 | 2138 | 88 | 34 | 0 | $1.14 | 62.35% | 67.65% |
| Women Offer — Carousel 1 | Event 2 — Women — Offer — Eventbrite | ARCHIVED (set ends 2026-07-29) | women 22-45 | $30.25 | 3122 | 2142 | 73 | 66 | 0 | $0.46 | 100.00% | 100.00% |
| Landingpage - Event 3 Women | Landing Page - Event 3 Women | ARCHIVED (set ends 2026-08-10) | women 22-45 | $25.36 | 2412 | 2075 | 175 | 164 | 0 | $0.15 | 75.71% | 70.12% |
| Campaign 1 Event 3 Tellus AfterDark: Singles Edition @ Tellus360 Campaign - Women Ad | Campaign 1 Event 3 Tellus AfterDark: Singles Edition @ Tellus360 Campaign - Women Campaign | PAUSED (set ends 2026-08-31) | women 22-45 | $20.92 | 2982 | 1591 | 107 | 97 | 0 | $0.22 | 100.00% | 100.00% |
| Campaign 1 Event 3 Tellus AfterDark: Singles Edition @ Tellus360 Ad | Campaign 1 Event 3 Tellus AfterDark: Singles Edition @ Tellus360 Campaign | PAUSED (set ends 2026-08-31) | all 22-45 | $19.01 | 2959 | 1554 | 108 | 85 | 0 | $0.22 | 57.02% | 61.18% |
| MC All Genders - Video Ad | Marion Court All Genders | ARCHIVED (set ends 2026-09-08) | men+women 22-45 | $18.23 | 841 | 349 | 4 | 4 | 0 | $4.56 | 31.71% | 0.00% |
| MC Women - Video Ad | Marion Court Female | ARCHIVED (set ends 2026-09-08) | women 22-45 | $17.35 | 826 | 375 | 8 | 8 | 0 | $2.17 | 100.00% | 100.00% |
| Event 2 — Women — Offer — Eventbrite 2 for 1 Ad | Event 2 — Women — Offer — Eventbrite | ARCHIVED (set ends 2026-07-29) | women 22-36 | $12.41 | 1396 | 1059 | 33 | 26 | 0 | $0.48 | 100.00% | 100.00% |
| Promoting website: https://sparkdate.date/founding?utm_source=facebook&utm_medium=social&utm_campaign=bio#signup | [6/1/2026] Promoting https://sparkdate.date/founding?utm_source=facebook&utm_medium=social&utm_campaign=bio#signup | ARCHIVED (set ends 2026-06-05) | 0 25-65 | $10.42 | 857 | 734 | 23 | 21 | 0 | $0.50 | 61.90% | 52.38% |
| MC-RT-STILL-THINKING V2 | Marion Court Retargeting | ACTIVE (set ends 2026-09-08) spending | women 22-45 | $9.63 | 607 | 92 | 7 | 6 | 0 | $1.61 | 57.74% | 66.67% |
| MC All Genders - Video Ad (Traffic) | Marion Court \| Traffic | ACTIVE (set ends 2026-09-08) spending | men+women 22-45 | $8.66 | 1926 | 1061 | 38 | 22 | 0 | $0.39 | 41.11% | 54.55% |
| Eventbrite - Event 3 Women | Event 3 — Philly — Women 70/30 Split Test | ARCHIVED (set ends 2026-08-10) | women 22-42 | $7.38 | 1001 | 914 | 20 | 17 | 0 | $0.43 | 100.00% | 100.00% |
| Landingpage - Event 3 Women USA | Landing Page - Event 3 Women - USA | ARCHIVED (set ends 2026-08-10) | women 22-45 | $6.26 | 638 | 619 | 35 | 32 | 0 | $0.20 | 100.00% | 100.00% |
| Promoting website: https://sparkdate.date/lp?utm_source=Facebook&utm_medium=paid&utm_campaign=<campaign-name> | [6/6/2026] Promoting https://sparkdate.date/lp?utm_source=Facebook&utm_medium=paid&utm_campaign=<campaign-name> | ARCHIVED (set ends 2026-06-08) | 0 18-65 | $5.99 | 462 | 426 | 13 | 13 | 0 | $0.46 | 61.10% | 46.15% |
| Loxleys \| male \| prime video | Loxleys \| Traffic | ACTIVE (set ends 2026-09-22) spending | men 22-45 | $5.32 | 1016 | 872 | 66 | 59 | 0 | $0.09 | 0.00% | 0.00% |
| Loxleys \| female \| prime video | Loxleys \| Traffic | ACTIVE (set ends 2026-09-22) spending | women 22-45 | $4.76 | 599 | 489 | 46 | 40 | 0 | $0.12 | 100.00% | 105.00% |
| Event 2 Retargeting | Event 2 Retargeting | ARCHIVED (set ends 2026-07-29) | all 18-65 | $4.70 | 221 | 48 | 2 | 0 | 0 | - | 58.09% | - |
| Event 1 Retargeting | Event 1 Re-Marketing - Copy | ARCHIVED (set ends 2026-06-24) | all 18-65 | $4.65 | 96 | 4 | 2 | 1 | 0 | $4.65 | 94.41% | 100.00% |
| Landingpage - Event 3  All | Landing Page - Event 3 Women - Copy | ARCHIVED (set ends 2026-08-10) | all 22-45 | $4.04 | 383 | 343 | 11 | 11 | 0 | $0.37 | 30.45% | 9.09% |
| SparkDate Summer Nights — Ad Set B Landing Page | SparkDate Event 2 — Summer Nights — Traffic | ARCHIVED (set ends 2026-07-29) | all 22-45 | $2.63 | 225 | 216 | 2 | 2 | 0 | $1.31 | 42.59% | 50.00% |
| SparkDate Summer Nights — Ad Set A Eventbrite - Copy | SparkDate Event 2 — Summer Nights — Traffic | ARCHIVED (set ends 2026-07-29) | all 22-45 | $2.56 | 248 | 238 | 3 | 3 | 0 | $0.85 | 51.17% | 100.00% |
| Women Offer — Carousel 1 | Event 2 — Women — Offer — Eventbrite | ARCHIVED (set ends 2026-07-29) | women 22-45 | $1.54 | 205 | 200 | 2 | 2 | 0 | $0.77 | 100.00% | 100.00% |
| MC-RT-QUANG | Marion Court Retargeting | ACTIVE (set ends 2026-09-08) spending | women 22-45 | $1.04 | 26 | 11 | 0 | 0 | 0 | - | 45.19% | - |
| MC-RT-NO-SCORECARDS | Marion Court Retargeting | ACTIVE (set ends 2026-09-08) spending | women 22-45 | $0.56 | 19 | 13 | 0 | 0 | 0 | - | 48.21% | - |
| Event 1 Retargeting | Event 1 Re-Marketing | ARCHIVED (set ends 2026-06-24) | all 18-65 | $0.17 | 4 | 1 | 0 | 0 | 0 | - | 0.00% | - |
| LX Women - Video Ad (Traffic) | Loxley's \| Traffic | PAUSED (set ends 2026-09-22) | women 22-45 | - | - | - | - | - | - | - | - | - |
| LX Women - Video Ad | Loxley's Female | ARCHIVED (set ends 2026-09-22) | women 22-45 | - | - | - | - | - | - | - | - | - |
| LX All Genders - Video Ad | Loxley's All Genders | ARCHIVED (set ends 2026-09-22) | men+women 22-45 | - | - | - | - | - | - | - | - | - |
| LX All Genders - Video Ad (Traffic) | Loxley's \| Traffic | PAUSED (set ends 2026-09-22) | men+women 22-45 | - | - | - | - | - | - | - | - | - |
| SparkDate Summer Nights — Eventbrite | SparkDate Event 2 — Summer Nights — Traffic | ARCHIVED (set ends 2026-07-29) | all 22-45 | - | - | - | - | - | - | - | - | - |

## Appendix B. Ad by ad: copy, audience, results by gender

### Campaign 1 Event 4  Good Good Campaign-Retargeting

- **Campaign:** Campaign 1 Event 4 Good Good Campaign-Retargeting (OUTCOME_SALES, ACTIVE)
- **Ad set:** Campaign 1 Event 4  Good Good Campaign-Retargeting (ACTIVE; 2026-08-13 to 2026-08-31; budget at campaign; goal OFFSITE_CONVERSIONS)
- **Audience:** women, 18-65; US; custom: Good Good Thing Retargeting; advantage+ audience off
- **Ad status:** ACTIVE; created 2026-08-13; delivery 2026-05-25..2026-09-02; last 7 days $31.57
- **Format:** video, CTA BOOK_TRAVEL
- **Primary text:** 31 people came to our last one. /  / Monday, August 31. Good Good Things, 11 S 21st, Rittenhouse. Doors 6:30 PM. /  / $29.99.
- **Headline:** 31 people came to our last one
- **Description:** Mon, Aug 31 · $29.99
- **Link:** https://sparkdate.date/lp?eventId=HwXXG8HPLMLwaoBoNdXk&utm_source=Facebook&utm_medium=paid_social&utm_campaign=Augweek3_philly&utm_content=gg_rt_thirtyone
- **UTMs seen by GA4:** utm_source=Facebook utm_medium=paid_social utm_campaign=Augweek3_philly utm_content=gg_rt_thirtyone

| Gender | Spend | Impr | Reach | Link clicks | CTR | CPC | LPV | $/LPV | Add to cart | Checkout | Purch | Leads |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| male | $63.73 | 3081 | 295 | 51 | 2.79% | $0.74 | 44 | $1.45 | 6 | 2 | 1 | 1 |
| female | $35.72 | 978 | 176 | 28 | 5.21% | $0.70 | 28 | $1.28 | 3 | 4 | 1 | 0 |
| unknown | $0.92 | 33 | 6 | 0 | 0.00% | $0.00 | 0 | - | 0 | 0 | 0 | 0 |
| **all** | $100.37 | 4092 | 486 | 79 | 3.35% | $0.73 | 72 | $1.39 | 9 | 6 | 2 | 1 |

### Format A — Landing Page

- **Campaign:** Event 2 — Summer Nights — FB Web Format A (OUTCOME_TRAFFIC, ARCHIVED)
- **Ad set:** Format A — Single + Dating Interests - Landing Page (ARCHIVED; 2026-06-29 to 2026-07-29; $5/day; goal LINK_CLICKS)
- **Audience:** women, 22-45; 40.183653,-76.413708 +30mile; advantage+ audience off
- **Ad status:** ARCHIVED; created 2026-06-29; delivery 2026-05-25..2026-09-02; last 7 days $0.00
- **Format:** video, CTA BOOK_TRAVEL
- **Primary text:** No profiles. No swiping. No "hey" sitting unanswered for 4 days. /  / Just a room full of single people who actually showed up. /  / July 29th · Lancaster · 4 rounds of 7-minute conversations. Say yes to who you liked, get their contact the next morning.
- **Headline:** Singles Night — July 29
- **Link:** https://sparkdate.date/lp?utm_source=facebook&utm_medium=paid_social&utm_campaign=week2_Solution
- **UTMs seen by GA4:** utm_source=facebook utm_medium=paid_social utm_campaign=week2_Solution

| Gender | Spend | Impr | Reach | Link clicks | CTR | CPC | LPV | $/LPV | Add to cart | Checkout | Purch | Leads |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| female | $56.97 | 4671 | 2413 | 162 | 3.47% | $0.35 | 101 | $0.56 | 0 | 0 | 0 | 0 |
| male | $31.17 | 2789 | 1595 | 81 | 3.23% | $0.35 | 56 | $0.56 | 0 | 0 | 0 | 0 |
| unknown | $0.25 | 28 | 20 | 1 | 3.57% | $0.25 | 0 | - | 0 | 0 | 0 | 0 |
| **all** | $88.39 | 7488 | 4098 | 244 | 3.38% | $0.35 | 157 | $0.56 | 0 | 0 | 0 | 0 |

### Tellus AfterDark: Singles Edition Retargeting

- **Campaign:** Campaign 1 Tellus AfterDark: Singles Edition Retargeting (OUTCOME_SALES, ACTIVE)
- **Ad set:** Tellus AfterDark: Singles Edition Retargeting (ACTIVE; 2026-08-09 to 2026-08-26; budget at campaign; goal OFFSITE_CONVERSIONS)
- **Audience:** all, 18-65; US; custom: Tellus AfterDark: Singles Edition Retargeting, Tellus360 Retargeting; advantage+ audience off
- **Ad status:** ACTIVE; created 2026-08-09; delivery 2026-05-25..2026-09-02; last 7 days $0.59
- **Format:** link, CTA BOOK_TRAVEL
- **Primary text:** Not speed dating. Not a loud bar where you're shouting over a band. /  / A real room, a format built so conversations actually happen, and hosts whose job is making sure you're not standing alone. /  / Wednesday, August 26 · 6:30–8:30pm · Tellus360, Downtown Lancaster
- **Headline:** What the night actually looks like
- **Description:** 30 people max
- **Link:** https://sparkdate.date/events?event=8E9WZTat32JyoUjWuIE7&eventId=8E9WZTat32JyoUjWuIE7&utm_source=Instagram&utm_medium=paid_social&utm_campaign=Augweek2_lancaster&utm_content=proof_rsa1
- **UTMs seen by GA4:** utm_source=Instagram utm_medium=paid_social utm_campaign=Augweek2_lancaster utm_content=proof_rsa1

| Gender | Spend | Impr | Reach | Link clicks | CTR | CPC | LPV | $/LPV | Add to cart | Checkout | Purch | Leads |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| female | $43.32 | 1519 | 288 | 71 | 10.20% | $0.28 | 68 | $0.64 | 3 | 12 | 1 | 6 |
| male | $29.74 | 1527 | 189 | 37 | 5.70% | $0.34 | 35 | $0.85 | 3 | 3 | 1 | 1 |
| **all** | $73.06 | 3046 | 474 | 108 | 7.94% | $0.30 | 103 | $0.71 | 6 | 15 | 2 | 7 |

### GG Women - Traffic

- **Campaign:** Campaign 1 Event 3 Good Good Campaign (OUTCOME_TRAFFIC, ACTIVE)
- **Ad set:** Good Good | Female | Traffic (ACTIVE; 2026-08-22 to 2026-08-31; $20/day; goal LINK_CLICKS)
- **Audience:** women, 22-45; Philadelphia +15mile; advantage+ audience off
- **Ad status:** ACTIVE; created 2026-08-22; delivery 2026-05-25..2026-09-02; last 7 days $47.89
- **Format:** video, CTA BOOK_TRAVEL
- **Primary text:** Thinking about it, but not alone? Bring your girl — one ticket gets you both in. /  / A real room, hosts who make the introductions, and someone in your corner for the first ten minutes. /  / Good Good Night · Monday, August 31 · Good Good Things, 11 S 21st St, Philadelphia · 2-for-1, early bird thru Aug 15
- **Headline:** Bring your girl — 2-for-1
- **Description:** Good Good Night · Aug 31
- **Link:** https://sparkdate.date/lp?eventId=HwXXG8HPLMLwaoBoNdXk&utm_source=Facebook&utm_medium=paid_social&utm_campaign=Augweek3_philly&utm_content=proof_rsa1
- **UTMs seen by GA4:** utm_source=Facebook utm_medium=paid_social utm_campaign=Augweek3_philly utm_content=proof_rsa1

| Gender | Spend | Impr | Reach | Link clicks | CTR | CPC | LPV | $/LPV | Add to cart | Checkout | Purch | Leads |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| female | $62.10 | 10054 | 5411 | 337 | 3.39% | $0.18 | 282 | $0.22 | 0 | 0 | 0 | 0 |
| **all** | $62.10 | 10054 | 5411 | 337 | 3.39% | $0.18 | 282 | $0.22 | 0 | 0 | 0 | 0 |

### Campaign 1 Event 4  Good Good Campaign-Sales Object-Women

- **Campaign:** Campaign 1 Event 4 Good Good Campaign-Sale Obj Women (OUTCOME_SALES, ARCHIVED)
- **Ad set:** Campaign 1 Event 4  Good Good Campaign-Sales Object-Women (ARCHIVED; 2026-08-13 to 2026-08-31; budget at campaign; goal OFFSITE_CONVERSIONS)
- **Audience:** women, 18-65; Philadelphia +25mile; advantage+ audience off
- **Ad status:** ARCHIVED; created 2026-08-13; delivery 2026-05-25..2026-09-02; last 7 days $0.00
- **Format:** video, CTA BOOK_TRAVEL
- **Primary text:** Thinking about it, but not alone? Bring your girl — one ticket gets you both in. /  / A real room, hosts who make the introductions, and someone in your corner for the first ten minutes. /  / Good Good Night · Monday, August 31 · Good Good Things, 11 S 21st St, Philadelphia · 2-for-1, early bird thru Aug 15
- **Headline:** Bring your girl — 2-for-1
- **Description:** Good Good Night · Aug 31
- **Link:** https://sparkdate.date/lp?eventId=HwXXG8HPLMLwaoBoNdXk&utm_source=Facebook&utm_medium=paid_social&utm_campaign=Augweek3_philly&utm_content=proof_rsa1
- **UTMs seen by GA4:** utm_source=Facebook utm_medium=paid_social utm_campaign=Augweek3_philly utm_content=proof_rsa1

| Gender | Spend | Impr | Reach | Link clicks | CTR | CPC | LPV | $/LPV | Add to cart | Checkout | Purch | Leads |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| male | $39.60 | 1566 | 589 | 26 | 3.13% | $0.81 | 22 | $1.80 | 1 | 3 | 1 | 6 |
| female | $20.96 | 603 | 337 | 12 | 3.65% | $0.95 | 14 | $1.50 | 0 | 0 | 0 | 0 |
| unknown | $1.20 | 21 | 5 | 0 | 0.00% | $0.00 | 0 | - | 0 | 0 | 0 | 0 |
| **all** | $61.76 | 2190 | 931 | 38 | 3.24% | $0.87 | 36 | $1.72 | 1 | 3 | 1 | 6 |

### Event 2 Retargeting- Fixed

- **Campaign:** Event 2 Retargeting - Fixed (LINK_CLICKS, ARCHIVED)
- **Ad set:** Event 2 Retarget- Fixed (ARCHIVED; 2026-06-30 to 2026-07-29; $2/day; goal LANDING_PAGE_VIEWS)
- **Audience:** all, 22-45; 40.190793,-76.359625 +32mile; custom: Video Watched; advantage+ audience off
- **Ad status:** ARCHIVED; created 2026-06-30; delivery 2026-05-25..2026-09-02; last 7 days $0.00
- **Format:** video, CTA BOOK_TRAVEL
- **Primary text:** Still thinking about July 29th? Four rounds of speed dating, one night, real people — American Bar & Grill, Lancaster. Early bird $18 ends July 15th.
- **Headline:** July 29th — spots are filling
- **Description:** Early bird ends June 17
- **Link:** https://www.eventbrite.com/e/sparkdate-summer-nights-tickets-1992377619092?aff=oddtdtcreator

| Gender | Spend | Impr | Reach | Link clicks | CTR | CPC | LPV | $/LPV | Add to cart | Checkout | Purch | Leads |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| female | $31.37 | 2743 | 463 | 41 | 1.68% | $0.68 | 31 | $1.01 | 0 | 0 | 0 | 0 |
| male | $29.83 | 2974 | 344 | 48 | 1.78% | $0.56 | 28 | $1.07 | 0 | 0 | 0 | 0 |
| unknown | $0.01 | 3 | 1 | 0 | 0.00% | $0.00 | 0 | - | 0 | 0 | 0 | 0 |
| **all** | $61.21 | 5720 | 786 | 89 | 1.73% | $0.62 | 59 | $1.04 | 0 | 0 | 0 | 0 |

### Campaign 1 Event 3 Tellus AfterDark: Singles Edition @ Tellus360 Campaign - Sales Obj Women

- **Campaign:** Campaign 1 Event 3 Tellus AfterDark: Singles Edition @ Tellus360 Campaign -Sales-Obj-Women (OUTCOME_SALES, ACTIVE)
- **Ad set:** Campaign 1 Event 3 Tellus AfterDark: Singles Edition @ Tellus360 Campaign -Women (ACTIVE; 2026-08-13 to 2026-08-26; budget at campaign; goal OFFSITE_CONVERSIONS)
- **Audience:** women, 18-65; Harrisburg +15mile; Lancaster +15mile; Reading +15mile; York +15mile; advantage+ audience off
- **Ad status:** ACTIVE; created 2026-08-13; delivery 2026-05-25..2026-09-02; last 7 days $0.81
- **Format:** video, CTA BOOK_TRAVEL
- **Primary text:** Thinking about it, but not alone? Bring your girl — one ticket gets you both in. /  / A real room, hosts who make the introductions, and someone in your corner for the first ten minutes. /  / Tellus AfterDark: Singles Edition · Wednesday, August 26 · Tellus360, 24 E King St, Lancaster · 2-for-1, early bird thru Aug 15
- **Headline:** Real people who actually show up
- **Description:** $18.99 early bird thru Aug 15
- **Link:** https://sparkdate.date/lp?eventId=8E9WZTat32JyoUjWuIE7&utm_source=Facebook&utm_medium=paid_social&utm_campaign=Augweek2_lancaster&utm_content=proof_rsa1
- **UTMs seen by GA4:** utm_source=Facebook utm_medium=paid_social utm_campaign=Augweek2_lancaster utm_content=proof_rsa1

| Gender | Spend | Impr | Reach | Link clicks | CTR | CPC | LPV | $/LPV | Add to cart | Checkout | Purch | Leads |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| female | $60.74 | 2490 | 917 | 37 | 2.97% | $0.82 | 27 | $2.25 | 1 | 1 | 0 | 2 |
| **all** | $60.74 | 2490 | 917 | 37 | 2.97% | $0.82 | 27 | $2.25 | 1 | 1 | 0 | 2 |

### Campaign 1 Event 3 Tellus AfterDark: Singles Edition @ Tellus360 Campaign - Sales Obj All Genders

- **Campaign:** Campaign 1 Event 3 Tellus AfterDark: Singles Edition @ Tellus360 Campaign -All Genders (OUTCOME_SALES, ACTIVE)
- **Ad set:** Campaign 1 Event 3 Tellus AfterDark: Singles Edition @ Tellus360 Campaign -All Genders (ACTIVE; 2026-08-13 to 2026-08-26; budget at campaign; goal OFFSITE_CONVERSIONS)
- **Audience:** all, 18-65; Harrisburg +15mile; Lancaster +15mile; Reading +15mile; York +15mile; advantage+ audience off
- **Ad status:** ACTIVE; created 2026-08-13; delivery 2026-05-25..2026-09-02; last 7 days $0.66
- **Format:** video, CTA BOOK_TRAVEL
- **Primary text:** 28 people came to our first mixer. Two months later, multiple matches are still talking. /  / No swiping. No three weeks of texting that goes nowhere. You show up, we handle the rest. /  / Tellus AfterDark: Singles Addition · Wednesday, August 26th · Tellus360 · 24 E King St, Lancaster, PA 17602 6:30pm
- **Headline:** Real people who actually show up
- **Description:** $18.99 early bird thru Aug 15
- **Link:** https://sparkdate.date/lp?eventId=8E9WZTat32JyoUjWuIE7&utm_source=Facebook&utm_medium=paid_social&utm_campaign=Augweek2_lancaster&utm_content=proof_rsa1
- **UTMs seen by GA4:** utm_source=Facebook utm_medium=paid_social utm_campaign=Augweek2_lancaster utm_content=proof_rsa1

| Gender | Spend | Impr | Reach | Link clicks | CTR | CPC | LPV | $/LPV | Add to cart | Checkout | Purch | Leads |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| male | $37.77 | 1898 | 588 | 31 | 3.06% | $0.65 | 28 | $1.35 | 2 | 2 | 0 | 3 |
| female | $22.71 | 767 | 315 | 16 | 4.30% | $0.69 | 17 | $1.34 | 3 | 5 | 1 | 1 |
| unknown | $0.16 | 12 | 8 | 0 | 0.00% | $0.00 | 0 | - | 0 | 0 | 0 | 0 |
| **all** | $60.64 | 2677 | 912 | 47 | 3.40% | $0.67 | 45 | $1.35 | 5 | 7 | 1 | 4 |

### Event 2 - Women Awareness — Carousel 1

- **Campaign:** Event 2 — Women — Awareness — LP (OUTCOME_TRAFFIC, ARCHIVED)
- **Ad set:** Event 2 - Women Awareness — $4/day (ARCHIVED; 2026-07-17 to 2026-07-29; $1/day; goal LANDING_PAGE_VIEWS)
- **Audience:** women, 22-40; 40.044868,-76.304693 +10mile; 40.272002,-76.88612 +10mile; 40.338447,-75.925665 +10mile; interests: Dating game show; advantage+ audience off
- **Ad status:** ARCHIVED; created 2026-07-17; delivery 2026-05-25..2026-09-02; last 7 days $0.00
- **Format:** video, CTA SEE_DETAILS
- **Primary text:** Ladies — free tickets to SparkDate Summer Nights, July 29 in Lancaster. Real conversations, no swiping, bar open all night. We just want a great room. DM us to grab yours. 🎟️
- **Headline:** Get Tickets Here!
- **Description:** Get Tickets here! https://sparkdate.date/lp?utm_source=facebook&utm_medium=paid_social&utm_campaign=week3_Women
- **Link:** https://sparkdate.date/lp?utm_source=facebook&utm_medium=paid_social&utm_campaign=week3_Women
- **UTMs seen by GA4:** utm_source=facebook utm_medium=paid_social utm_campaign=week3_Women

| Gender | Spend | Impr | Reach | Link clicks | CTR | CPC | LPV | $/LPV | Add to cart | Checkout | Purch | Leads |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| female | $57.17 | 6560 | 3697 | 111 | 1.80% | $0.48 | 100 | $0.57 | 0 | 0 | 0 | 0 |
| **all** | $57.17 | 6560 | 3697 | 111 | 1.80% | $0.48 | 100 | $0.57 | 0 | 0 | 0 | 0 |

### Event: Founders Mixer! 🚀🍸💕

- **Campaign:** Event: Founders Mixer! 🚀🍸💕 (LINK_CLICKS, ARCHIVED)
- **Ad set:** Event: Founders Mixer! 🚀🍸💕 (ARCHIVED; 2026-06-11 to 2026-06-24; budget at campaign; goal LINK_CLICKS)
- **Audience:** women, 22-65; (40.26479102278382, -76.48406982421876) +30mile; advantage+ audience ON
- **Ad status:** ARCHIVED; created 2026-06-11; delivery 2026-05-25..2026-09-02; last 7 days $0.00
- **Format:** video, CTA BUY_TICKETS
- **Primary text:** No profiles. No swiping. No "sorry, crazy week" texts. Just a room of people who showed up to meet — four rounds, fifteen faces, one night.  /  / June 24th, American Bar & Grill @ 6:30 /  / #lancaster / #lancasterdating / #PhillyDating / #SingleInPhilly / #PhillyEvents / #datingapps / #irldating
- **Headline:** Founders Mixer! 🚀🍸💕
- **Link:** https://www.eventbrite.com/e/sparkdate-founders-singles-mixer-starting-at-1499-tickets-1990063778332

| Gender | Spend | Impr | Reach | Link clicks | CTR | CPC | LPV | $/LPV | Add to cart | Checkout | Purch | Leads |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| female | $35.21 | 4287 | 2574 | 100 | 2.36% | $0.35 | 36 | $0.98 | 0 | 0 | 0 | 0 |
| male | $21.66 | 2764 | 1806 | 64 | 2.32% | $0.34 | 26 | $0.83 | 0 | 0 | 0 | 0 |
| unknown | $0.22 | 34 | 26 | 0 | 0.00% | $0.00 | 0 | - | 0 | 0 | 0 | 0 |
| **all** | $57.09 | 7085 | 4440 | 164 | 2.33% | $0.35 | 62 | $0.92 | 0 | 0 | 0 | 0 |

### MC Women - Video Ad (Traffic)

- **Campaign:** Marion Court | Traffic (OUTCOME_TRAFFIC, ACTIVE)
- **Ad set:** Marion Court | Female | Traffic (ACTIVE; 2026-08-22 to 2026-09-08; budget at campaign; goal LINK_CLICKS)
- **Audience:** women, 22-45; York, PA +15mile; Lancaster, PA +15mile; Harrisburg, PA +15mile; Reading, PA +15mile; advantage+ audience off
- **Ad status:** ACTIVE; created 2026-08-22; delivery 2026-05-25..2026-09-02; last 7 days $38.92
- **Format:** video, CTA BOOK_TRAVEL
- **Primary text:** Thinking about it, but not alone? Bring your friend — one ticket gets you both in. /  / Split the nerves, double the people you actually talk to, and have someone to debrief with on the way out. /  / Tuesday, September 8 · Marion Court Room, Lancaster · 2-for-1 live now.
- **Headline:** Bring a friend. One ticket, two of you.
- **Description:** 2-for-1 tickets live now
- **Link:** https://sparkdate.date/lp?eventId=WUaooYvOq0eC0D1QVCvQ&utm_source=Instagram&utm_medium=paid_social&utm_campaign=Augweek3_lancaster&utm_content=proof_rsa1
- **UTMs seen by GA4:** utm_source=Instagram utm_medium=paid_social utm_campaign=Augweek3_lancaster utm_content=proof_rsa1

| Gender | Spend | Impr | Reach | Link clicks | CTR | CPC | LPV | $/LPV | Add to cart | Checkout | Purch | Leads |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| female | $53.33 | 7627 | 3051 | 218 | 2.88% | $0.24 | 178 | $0.30 | 0 | 0 | 0 | 0 |
| **all** | $53.33 | 7627 | 3051 | 218 | 2.88% | $0.24 | 178 | $0.30 | 0 | 0 | 0 | 0 |

### MC-RT-STILL-THINKING

- **Campaign:** Marion Court Retargeting (OUTCOME_SALES, ACTIVE)
- **Ad set:** MC Retargeting | Video Viewers + Site Visitors | 22-45 (ACTIVE; 2026-08-17 to 2026-09-08; budget at campaign; goal OFFSITE_CONVERSIONS)
- **Audience:** women, 22-45; York, PA +15mile; Lancaster, PA +15mile; Harrisburg, PA +15mile; Reading, PA +15mile; custom: MC Retargeting; advantage+ audience off
- **Ad status:** PAUSED; created 2026-08-17; delivery 2026-05-25..2026-09-02; last 7 days $10.39
- **Format:** video, CTA BOOK_TRAVEL
- **Primary text:** You've seen this one. It's still open! /  / Tuesday, September 8 · Marion Court Room, Lancaster · 6:30–8:30pm. /  / $24.99.
- **Headline:** Tue, Sep 8 · Marion Court Room
- **Description:** Doors 6:30 PM · $24.99
- **Link:** https://sparkdate.date/lp?eventId=WUaooYvOq0eC0D1QVCvQ&utm_source=Facebook&utm_medium=paid_social&utm_campaign=Augweek3_lancaster&utm_content=mc_rt_thinking
- **UTMs seen by GA4:** utm_source=Facebook utm_medium=paid_social utm_campaign=Augweek3_lancaster utm_content=mc_rt_thinking

| Gender | Spend | Impr | Reach | Link clicks | CTR | CPC | LPV | $/LPV | Add to cart | Checkout | Purch | Leads |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| female | $33.15 | 1344 | 128 | 8 | 1.49% | $1.66 | 9 | $3.68 | 0 | 0 | 0 | 0 |
| male | $18.77 | 1108 | 93 | 13 | 2.62% | $0.65 | 14 | $1.34 | 0 | 0 | 0 | 0 |
| **all** | $51.92 | 2452 | 221 | 21 | 2.00% | $1.06 | 23 | $2.26 | 0 | 0 | 0 | 0 |

### Campaign 1 Event 3 Good Good Ad

- **Campaign:** Campaign 1 Event 3 Good Good Campaign (OUTCOME_TRAFFIC, ACTIVE)
- **Ad set:** Campaign 1 Event 3 Good Good Ad set (PAUSED; 2026-08-05 to 2026-08-31; $5/day; goal LINK_CLICKS)
- **Audience:** women, 22-45; Philadelphia +15mile; advantage+ audience off
- **Ad status:** PAUSED; created 2026-08-05; delivery 2026-05-25..2026-09-02; last 7 days $16.62
- **Format:** video, CTA BOOK_TRAVEL
- **Primary text:** 28 people came to our first mixer. Two months later, multiple matches are still talking. /  / No swiping. No three weeks of texting that goes nowhere. You show up, we handle the rest. /  / Good Good Night · Monday, August 31 · Good Good Things, 11 S 21st St, Philadelphia · 6:30pm
- **Headline:** Real people who actually show up
- **Description:** $24.99 early bird thru Aug 15
- **Link:** https://sparkdate.date/lp?eventId=HwXXG8HPLMLwaoBoNdXk&utm_source=Facebook&utm_medium=paid_social&utm_campaign=Augweek1_philly&utm_content=proof_rsa1
- **UTMs seen by GA4:** utm_source=Facebook utm_medium=paid_social utm_campaign=Augweek1_philly utm_content=proof_rsa1

| Gender | Spend | Impr | Reach | Link clicks | CTR | CPC | LPV | $/LPV | Add to cart | Checkout | Purch | Leads |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| female | $31.58 | 5532 | 3100 | 210 | 3.83% | $0.15 | 177 | $0.18 | 1 | 0 | 0 | 0 |
| male | $19.20 | 3676 | 1906 | 134 | 3.70% | $0.14 | 112 | $0.17 | 0 | 0 | 0 | 0 |
| unknown | $0.66 | 90 | 35 | 7 | 7.78% | $0.09 | 7 | $0.09 | 0 | 0 | 0 | 0 |
| **all** | $51.44 | 9298 | 4989 | 351 | 3.82% | $0.14 | 296 | $0.17 | 1 | 0 | 0 | 0 |

### Format B — Eventbrite + FBEVENT code

- **Campaign:** Event 2 — Summer Nights — FB Event Format B (OUTCOME_TRAFFIC, ARCHIVED)
- **Ad set:** Format B — Single + Dating Interests (ARCHIVED; 2026-06-30 to 2026-07-29; $1.5/day; goal LINK_CLICKS)
- **Audience:** women, 22-45; 40.183653,-76.413708 +30mile; advantage+ audience off
- **Ad status:** ARCHIVED; created 2026-06-30; delivery 2026-05-25..2026-09-02; last 7 days $0.00
- **Format:** video, CTA BUY_TICKETS
- **Primary text:** No profiles. No swiping. No "hey" sitting unanswered for 4 days. /  / Just a room full of single people who actually showed up. /  / July 29th · Lancaster · 4 rounds of 7-minute conversations. Say yes to who you liked, get their contact the next morning. /  / 🎟 Utilize promo code FBEVENT for priority check-in.
- **Headline:** Singles Night — July 29
- **Link:** https://www.facebook.com/events/1046329421197232

| Gender | Spend | Impr | Reach | Link clicks | CTR | CPC | LPV | $/LPV | Add to cart | Checkout | Purch | Leads |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| female | $32.59 | 3263 | 1924 | 79 | 2.54% | $0.39 | 29 | $1.12 | 0 | 0 | 0 | 0 |
| male | $18.63 | 2417 | 1349 | 46 | 2.15% | $0.36 | 9 | $2.07 | 0 | 0 | 0 | 0 |
| unknown | $0.10 | 21 | 10 | 1 | 4.76% | $0.10 | 0 | - | 0 | 0 | 0 | 0 |
| **all** | $51.32 | 5701 | 3359 | 126 | 2.39% | $0.38 | 38 | $1.35 | 0 | 0 | 0 | 0 |

### Campaign 1 Event 4 Good Good Campaign-Sale Obj Women

- **Campaign:** Campaign 1 Event 4 Good Good Campaign-Sale Obj All Genders (OUTCOME_SALES, ARCHIVED)
- **Ad set:** Campaign 1 Event 4 Good Good Campaign-Sale Obj All Genders (ARCHIVED; 2026-08-13 to 2026-08-31; budget at campaign; goal OFFSITE_CONVERSIONS)
- **Audience:** all, 18-65; Philadelphia +25mile; advantage+ audience off
- **Ad status:** ARCHIVED; created 2026-08-13; delivery 2026-05-25..2026-09-02; last 7 days $0.00
- **Format:** video, CTA BOOK_TRAVEL
- **Primary text:** 28 people came to our first mixer. Two months later, multiple matches are still talking. /  / No swiping. No three weeks of texting that goes nowhere. You show up, we handle the rest. /  / Good Good Night · Monday, August 31 · Good Good Things, 11 S 21st St, Philadelphia · 6:30pm
- **Headline:** Real people who actually show up
- **Description:** $24.99 early bird thru Aug 15
- **Link:** https://sparkdate.date/lp?eventId=HwXXG8HPLMLwaoBoNdXk&utm_source=Facebook&utm_medium=paid_social&utm_campaign=Augweek3_philly&utm_content=proof_rsa1
- **UTMs seen by GA4:** utm_source=Facebook utm_medium=paid_social utm_campaign=Augweek3_philly utm_content=proof_rsa1

| Gender | Spend | Impr | Reach | Link clicks | CTR | CPC | LPV | $/LPV | Add to cart | Checkout | Purch | Leads |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| male | $26.53 | 1110 | 504 | 14 | 3.33% | $0.72 | 12 | $2.21 | 1 | 2 | 0 | 1 |
| female | $18.01 | 524 | 317 | 12 | 5.53% | $0.62 | 11 | $1.64 | 0 | 3 | 0 | 2 |
| unknown | $0.23 | 8 | 8 | 1 | 25.00% | $0.12 | 1 | $0.23 | 0 | 0 | 0 | 0 |
| **all** | $44.77 | 1642 | 852 | 27 | 4.14% | $0.66 | 24 | $1.87 | 1 | 5 | 0 | 3 |

### Format A — Eventbrite + FBWEB code

- **Campaign:** Event 2 — Summer Nights — FB Web Format A (OUTCOME_TRAFFIC, ARCHIVED)
- **Ad set:** Format A — Single + Dating Interests - EventBrite (ARCHIVED; 2026-06-30 to 2026-07-29; $1/day; goal LINK_CLICKS)
- **Audience:** women, 22-45; 40.183653,-76.413708 +30mile; advantage+ audience off
- **Ad status:** ARCHIVED; created 2026-06-30; delivery 2026-05-25..2026-09-02; last 7 days $0.00
- **Format:** video, CTA BOOK_TRAVEL
- **Primary text:** No profiles. No swiping. No "hey" sitting unanswered for 4 days. /  / Just a room full of single people who actually showed up. /  / July 29th · Lancaster · 4 rounds of 7-minute conversations. Say yes to who you liked, get their contact the next morning. /  / 🎟 Mention FBWEB at the door for priority check-in.
- **Headline:** Singles Night — July 29
- **Link:** https://www.eventbrite.com/e/sparkdate-speed-dating-for-app-burned-singles-summer-nights-tickets-1992377619092

| Gender | Spend | Impr | Reach | Link clicks | CTR | CPC | LPV | $/LPV | Add to cart | Checkout | Purch | Leads |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| female | $24.08 | 2208 | 1262 | 62 | 2.90% | $0.38 | 23 | $1.05 | 0 | 0 | 0 | 0 |
| male | $14.32 | 1632 | 854 | 26 | 1.65% | $0.53 | 11 | $1.30 | 0 | 0 | 0 | 0 |
| unknown | $0.22 | 14 | 11 | 0 | 0.00% | $0.00 | 0 | - | 0 | 0 | 0 | 0 |
| **all** | $38.62 | 3854 | 2138 | 88 | 2.36% | $0.42 | 34 | $1.14 | 0 | 0 | 0 | 0 |

### Women Offer — Carousel 1

- **Campaign:** Event 2 — Women — Offer — Eventbrite (OUTCOME_TRAFFIC, ARCHIVED)
- **Ad set:** Women Offer — $4/day — Eventbrite (ARCHIVED; 2026-07-17 to 2026-07-29; $5/day; goal LANDING_PAGE_VIEWS)
- **Audience:** women, 22-45; 40.240416,-76.397229 +30mile; interests: Dating game show; advantage+ audience off
- **Ad status:** ARCHIVED; created 2026-07-17; delivery 2026-05-25..2026-09-02; last 7 days $0.00
- **Format:** video, CTA BOOK_TRAVEL
- **Primary text:** Two of you. $25 total. One unforgettable night. /  / Bring your girl. You're not walking in alone. / 4 rounds of real conversations. Real people. / If you both say yes to someone, you get their number. /  / $12.50 each. That's cheaper than drinks.
- **Headline:** Get Tickets Here!
- **Description:** Get Tickets Here! https://www.eventbrite.com/e/sparkdate-summer-nights-tickets-1992377619092?aff=oddtdtcreator
- **Link:** https://www.eventbrite.com/e/sparkdate-summer-nights-tickets-1992377619092?aff=oddtdtcreator

| Gender | Spend | Impr | Reach | Link clicks | CTR | CPC | LPV | $/LPV | Add to cart | Checkout | Purch | Leads |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| female | $30.25 | 3122 | 2142 | 73 | 2.66% | $0.36 | 66 | $0.46 | 0 | 0 | 0 | 0 |
| **all** | $30.25 | 3122 | 2142 | 73 | 2.66% | $0.36 | 66 | $0.46 | 0 | 0 | 0 | 0 |

### Landingpage - Event 3 Women

- **Campaign:** Landing Page - Event 3 Women (OUTCOME_TRAFFIC, ARCHIVED)
- **Ad set:** LP Ad Set Event 3 Women (ARCHIVED; 2026-07-24 to 2026-08-10; $6.5/day; goal LANDING_PAGE_VIEWS)
- **Audience:** women, 22-45; Philadelphia +30mile; advantage+ audience off
- **Ad status:** ARCHIVED; created 2026-07-24; delivery 2026-05-25..2026-09-02; last 7 days $0.00
- **Format:** video, CTA SEE_DETAILS
- **Primary text:** You + a friend, one night, zero pressure. SparkDate's Good Good Night @ Good Good Things is 2-for-1 this week only — August 10th in Philly. Four rounds of real conversation, no apps required.
- **Headline:** Bring a Friend, Split the Ticket
- **Link:** https://sparkdate.date/lp?eventId=QLKraJga4YAAUn8dnRLY&utm_source=Facebook&utm_medium=paid_social&utm_campaign=summer2026_philly&utm_content=week1_rsa1
- **UTMs seen by GA4:** utm_source=Facebook utm_medium=paid_social utm_campaign=summer2026_philly utm_content=week1_rsa1

| Gender | Spend | Impr | Reach | Link clicks | CTR | CPC | LPV | $/LPV | Add to cart | Checkout | Purch | Leads |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| female | $19.20 | 1654 | 1382 | 121 | 7.86% | $0.15 | 115 | $0.17 | 0 | 5 | 0 | 0 |
| male | $6.01 | 751 | 639 | 53 | 8.39% | $0.10 | 48 | $0.13 | 0 | 0 | 0 | 0 |
| unknown | $0.15 | 7 | 7 | 1 | 14.29% | $0.15 | 1 | $0.15 | 0 | 0 | 0 | 0 |
| **all** | $25.36 | 2412 | 2075 | 175 | 8.04% | $0.13 | 164 | $0.15 | 0 | 5 | 0 | 0 |

### Campaign 1 Event 3 Tellus AfterDark: Singles Edition @ Tellus360 Campaign - Women Ad

- **Campaign:** Campaign 1 Event 3 Tellus AfterDark: Singles Edition @ Tellus360 Campaign - Women Campaign (OUTCOME_TRAFFIC, PAUSED)
- **Ad set:** Campaign 1 Event 3 Tellus AfterDark: Singles Edition @ Tellus360 Campaign - Women Ad set (CAMPAIGN_PAUSED; 2026-08-07 to 2026-08-31; $5/day; goal LINK_CLICKS)
- **Audience:** women, 22-45; Harrisburg +10mile; Lancaster +15mile; York +10mile; advantage+ audience off
- **Ad status:** PAUSED; created 2026-08-07; delivery 2026-05-25..2026-09-02; last 7 days $0.00
- **Format:** video, CTA BOOK_TRAVEL
- **Primary text:** Thinking about it, but not alone? Bring your girl — one ticket gets you both in. /  / A real room, hosts who make the introductions, and someone in your corner for the first ten minutes. /  / Tellus AfterDark: Singles Edition · Wednesday, August 26 · Tellus360, 24 E King St, Lancaster · 2-for-1, early bird thru Aug 15
- **Headline:** Real people who actually show up
- **Description:** $18.99 early bird thru Aug 15
- **Link:** https://sparkdate.date/lp?eventId=8E9WZTat32JyoUjWuIE7&utm_source=Facebook&utm_medium=paid_social&utm_campaign=Augweek1_lancaster&utm_content=proof_rsa1
- **UTMs seen by GA4:** utm_source=Facebook utm_medium=paid_social utm_campaign=Augweek1_lancaster utm_content=proof_rsa1

| Gender | Spend | Impr | Reach | Link clicks | CTR | CPC | LPV | $/LPV | Add to cart | Checkout | Purch | Leads |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| female | $20.92 | 2982 | 1591 | 107 | 3.69% | $0.19 | 97 | $0.22 | 0 | 0 | 0 | 0 |
| **all** | $20.92 | 2982 | 1591 | 107 | 3.69% | $0.19 | 97 | $0.22 | 0 | 0 | 0 | 0 |

### Campaign 1 Event 3 Tellus AfterDark: Singles Edition @ Tellus360 Ad

- **Campaign:** Campaign 1 Event 3 Tellus AfterDark: Singles Edition @ Tellus360 Campaign (OUTCOME_TRAFFIC, PAUSED)
- **Ad set:** Campaign 1 Event 3 Tellus AfterDark: Singles Edition @ Tellus360 Ad set (CAMPAIGN_PAUSED; 2026-08-07 to 2026-08-31; $3.5/day; goal LINK_CLICKS)
- **Audience:** all, 22-45; Harrisburg +10mile; Lancaster +15mile; York +10mile; advantage+ audience off
- **Ad status:** PAUSED; created 2026-08-07; delivery 2026-05-25..2026-09-02; last 7 days $0.00
- **Format:** video, CTA BOOK_TRAVEL
- **Primary text:** 28 people came to our first mixer. Two months later, multiple matches are still talking. /  / No swiping. No three weeks of texting that goes nowhere. You show up, we handle the rest. /  / Tellus AfterDark: Singles Addition · Wednesday, August 26th · Tellus360 · 24 E King St, Lancaster, PA 17602 6:30pm
- **Headline:** Real people who actually show up
- **Description:** $24.99 early bird thru Aug 15
- **Link:** https://sparkdate.date/lp?eventId=8E9WZTat32JyoUjWuIE7&utm_source=Facebook&utm_medium=paid_social&utm_campaign=Augweek1_lancaster&utm_content=proof_rsa1
- **UTMs seen by GA4:** utm_source=Facebook utm_medium=paid_social utm_campaign=Augweek1_lancaster utm_content=proof_rsa1

| Gender | Spend | Impr | Reach | Link clicks | CTR | CPC | LPV | $/LPV | Add to cart | Checkout | Purch | Leads |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| female | $10.84 | 1649 | 907 | 67 | 4.12% | $0.16 | 52 | $0.21 | 0 | 0 | 0 | 0 |
| male | $8.06 | 1300 | 676 | 41 | 3.23% | $0.19 | 33 | $0.24 | 0 | 0 | 0 | 0 |
| unknown | $0.11 | 10 | 6 | 0 | 0.00% | $0.00 | 0 | - | 0 | 0 | 0 | 0 |
| **all** | $19.01 | 2959 | 1554 | 108 | 3.72% | $0.17 | 85 | $0.22 | 0 | 0 | 0 | 0 |

### MC All Genders - Video Ad

- **Campaign:** Marion Court All Genders (OUTCOME_SALES, ARCHIVED)
- **Ad set:** MC All Genders | Lancaster-Harrisburg-York-Reading 15mi | 22-45 (ARCHIVED; 2026-08-17 to 2026-09-08; budget at campaign; goal OFFSITE_CONVERSIONS)
- **Audience:** men+women, 22-45; York, PA +15mile; Lancaster, PA +15mile; Harrisburg, PA +15mile; Reading, PA +15mile; advantage+ audience off
- **Ad status:** ARCHIVED; created 2026-08-17; delivery 2026-05-25..2026-09-02; last 7 days $0.00
- **Format:** video, CTA BOOK_TRAVEL
- **Primary text:** 31 people at American Bar & Grill. 22 at our first one. /  / No swiping. No three weeks of texting that goes nowhere. Drinks, an icebreaker, then real conversations — in that order. /  / Tuesday, September 8 · Marion Court Room, Lancaster · 6:30–8:30pm
- **Headline:** Real people who actually show up
- **Description:** $18.99 thru Aug 24
- **Link:** https://sparkdate.date/lp?eventId=WUaooYvOq0eC0D1QVCvQ&utm_source=Instagram&utm_medium=paid_social&utm_campaign=Augweek3_lancaster&utm_content=proof_rsa1
- **UTMs seen by GA4:** utm_source=Instagram utm_medium=paid_social utm_campaign=Augweek3_lancaster utm_content=proof_rsa1

| Gender | Spend | Impr | Reach | Link clicks | CTR | CPC | LPV | $/LPV | Add to cart | Checkout | Purch | Leads |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| male | $12.45 | 654 | 261 | 4 | 2.60% | $0.73 | 4 | $3.11 | 0 | 0 | 0 | 2 |
| female | $5.78 | 187 | 90 | 0 | 0.53% | $5.78 | 0 | - | 0 | 0 | 0 | 0 |
| **all** | $18.23 | 841 | 349 | 4 | 2.14% | $1.01 | 4 | $4.56 | 0 | 0 | 0 | 2 |

### MC Women - Video Ad

- **Campaign:** Marion Court Female (OUTCOME_SALES, ARCHIVED)
- **Ad set:** MC Female | Lancaster-Harrisburg-York-Reading 15mi | 22-45 (ARCHIVED; 2026-08-17 to 2026-09-08; budget at campaign; goal OFFSITE_CONVERSIONS)
- **Audience:** women, 22-45; York, PA +15mile; Lancaster, PA +15mile; Harrisburg, PA +15mile; Reading, PA +15mile; advantage+ audience off
- **Ad status:** ARCHIVED; created 2026-08-17; delivery 2026-05-25..2026-09-02; last 7 days $0.00
- **Format:** video, CTA BOOK_TRAVEL
- **Primary text:** Thinking about it, but not alone? Bring your friend — one ticket gets you both in. /  / Split the nerves, double the people you actually talk to, and have someone to debrief with on the way out. /  / Tuesday, September 8 · Marion Court Room, Lancaster · 2-for-1 live now.
- **Headline:** Bring a friend. One ticket, two of you.
- **Description:** 2-for-1 tickets live now
- **Link:** https://sparkdate.date/lp?eventId=WUaooYvOq0eC0D1QVCvQ&utm_source=Instagram&utm_medium=paid_social&utm_campaign=Augweek3_lancaster&utm_content=proof_rsa1
- **UTMs seen by GA4:** utm_source=Instagram utm_medium=paid_social utm_campaign=Augweek3_lancaster utm_content=proof_rsa1

| Gender | Spend | Impr | Reach | Link clicks | CTR | CPC | LPV | $/LPV | Add to cart | Checkout | Purch | Leads |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| female | $17.35 | 826 | 375 | 8 | 1.33% | $1.58 | 8 | $2.17 | 0 | 1 | 0 | 0 |
| **all** | $17.35 | 826 | 375 | 8 | 1.33% | $1.58 | 8 | $2.17 | 0 | 1 | 0 | 0 |

### Event 2 — Women — Offer — Eventbrite 2 for 1 Ad

- **Campaign:** Event 2 — Women — Offer — Eventbrite (OUTCOME_TRAFFIC, ARCHIVED)
- **Ad set:** Event 2 — Women — Offer — Eventbrite 2 for 1 (ARCHIVED; 2026-07-24 to 2026-07-29; $6/day; goal LANDING_PAGE_VIEWS)
- **Audience:** women, 22-36; 40.053695,-76.307641 +10mile; 40.267374,-76.897107 +10mile; 40.346428,-75.93031 +10mile; advantage+ audience off
- **Ad status:** ARCHIVED; created 2026-07-24; delivery 2026-05-25..2026-09-02; last 7 days $0.00
- **Format:** video, CTA SEE_DETAILS
- **Primary text:** Ladies — free tickets to SparkDate Summer Nights, July 29 in Lancaster. Real conversations, no swiping, bar open all night. We just want a great room. DM us to grab yours. 🎟️
- **Headline:** Get Tickets on Eventbrite!  >>
- **Link:** https://www.eventbrite.com/e/sparkdate-summer-nights-tickets-1992377619092?aff=oddtdtcreator

| Gender | Spend | Impr | Reach | Link clicks | CTR | CPC | LPV | $/LPV | Add to cart | Checkout | Purch | Leads |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| female | $12.41 | 1396 | 1059 | 33 | 2.44% | $0.36 | 26 | $0.48 | 0 | 0 | 0 | 0 |
| **all** | $12.41 | 1396 | 1059 | 33 | 2.44% | $0.36 | 26 | $0.48 | 0 | 0 | 0 | 0 |

### Promoting website: https://sparkdate.date/founding?utm_source=facebook&utm_medium=social&utm_campaign=bio#signup

- **Campaign:** [6/1/2026] Promoting https://sparkdate.date/founding?utm_source=facebook&utm_medium=social&utm_campaign=bio#signup (LINK_CLICKS, ARCHIVED)
- **Ad set:** [6/1/2026] Promoting https://sparkdate.date/founding?utm_source=facebook&utm_medium=social&utm_campaign=bio#signup (ARCHIVED; 2026-06-01 to 2026-06-05; budget at campaign; goal LANDING_PAGE_VIEWS)
- **Audience:** 0, 25-65; Lancaster +10mile; Philadelphia +12mile; advantage+ audience ON
- **Ad status:** ARCHIVED; created 2026-06-01; delivery 2026-05-25..2026-09-02; last 7 days $0.00
- **Format:** video, CTA SIGN_UP
- **Primary text:** Stop swiping. Start living. Curated dating events.
- **Headline:** SparkDate
- **Link:** https://sparkdate.date/founding?utm_source=facebook&utm_medium=social&utm_campaign=bio#signup
- **UTMs seen by GA4:** utm_source=facebook utm_medium=social utm_campaign=bio#signup

| Gender | Spend | Impr | Reach | Link clicks | CTR | CPC | LPV | $/LPV | Add to cart | Checkout | Purch | Leads |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| female | $6.45 | 513 | 436 | 12 | 3.12% | $0.40 | 11 | $0.59 | 0 | 0 | 0 | 0 |
| male | $3.91 | 341 | 302 | 10 | 3.52% | $0.33 | 9 | $0.43 | 0 | 0 | 0 | 0 |
| unknown | $0.06 | 3 | 2 | 1 | 33.33% | $0.06 | 1 | $0.06 | 0 | 0 | 0 | 0 |
| **all** | $10.42 | 857 | 734 | 23 | 3.38% | $0.36 | 21 | $0.50 | 0 | 0 | 0 | 0 |

### MC-RT-STILL-THINKING V2

- **Campaign:** Marion Court Retargeting (OUTCOME_SALES, ACTIVE)
- **Ad set:** MC Retargeting | Video Viewers + Site Visitors | 22-45 (ACTIVE; 2026-08-17 to 2026-09-08; budget at campaign; goal OFFSITE_CONVERSIONS)
- **Audience:** women, 22-45; York, PA +15mile; Lancaster, PA +15mile; Harrisburg, PA +15mile; Reading, PA +15mile; custom: MC Retargeting; advantage+ audience off
- **Ad status:** ACTIVE; created 2026-08-29; delivery 2026-05-25..2026-09-02; last 7 days $9.54
- **Format:** video, CTA BOOK_TRAVEL
- **Primary text:** You've seen this one. It's still open. /  / Tuesday, September 8 · Marion Court Room, Lancaster · 6:30–8:30pm. /  / $24.99.
- **Headline:** Tue, Sep 8 · Marion Court Room
- **Description:** Doors 6:30 PM · $24.99
- **Link:** https://sparkdate.date/lp?eventId=WUaooYvOq0eC0D1QVCvQ&utm_source=Facebook&utm_medium=paid_social&utm_campaign=Augweek3_lancaster&utm_content=mc_rt_still_thinking
- **UTMs seen by GA4:** utm_source=Facebook utm_medium=paid_social utm_campaign=Augweek3_lancaster utm_content=mc_rt_still_thinking

| Gender | Spend | Impr | Reach | Link clicks | CTR | CPC | LPV | $/LPV | Add to cart | Checkout | Purch | Leads |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| female | $5.56 | 323 | 59 | 5 | 2.48% | $0.69 | 4 | $1.39 | 0 | 0 | 0 | 0 |
| male | $4.07 | 284 | 33 | 2 | 1.76% | $0.81 | 2 | $2.04 | 0 | 0 | 0 | 0 |
| **all** | $9.63 | 607 | 92 | 7 | 2.14% | $0.74 | 6 | $1.61 | 0 | 0 | 0 | 0 |

### MC All Genders - Video Ad (Traffic)

- **Campaign:** Marion Court | Traffic (OUTCOME_TRAFFIC, ACTIVE)
- **Ad set:** Marion Court | All Genders | Traffic (ACTIVE; 2026-08-22 to 2026-09-08; budget at campaign; goal LINK_CLICKS)
- **Audience:** men+women, 22-45; York, PA +15mile; Lancaster, PA +15mile; Harrisburg, PA +15mile; Reading, PA +15mile; advantage+ audience off
- **Ad status:** ACTIVE; created 2026-08-22; delivery 2026-05-25..2026-09-02; last 7 days $4.28
- **Format:** video, CTA BOOK_TRAVEL
- **Primary text:** 31 people at American Bar & Grill. 22 at our first one. /  / No swiping. No three weeks of texting that goes nowhere. Drinks, an icebreaker, then real conversations — in that order. /  / Tuesday, September 8 · Marion Court Room, Lancaster · 6:30–8:30pm
- **Headline:** Real people who actually show up
- **Description:** $18.99 thru Aug 24
- **Link:** https://sparkdate.date/lp?eventId=WUaooYvOq0eC0D1QVCvQ&utm_source=Instagram&utm_medium=paid_social&utm_campaign=Augweek3_lancaster&utm_content=proof_rsa1
- **UTMs seen by GA4:** utm_source=Instagram utm_medium=paid_social utm_campaign=Augweek3_lancaster utm_content=proof_rsa1

| Gender | Spend | Impr | Reach | Link clicks | CTR | CPC | LPV | $/LPV | Add to cart | Checkout | Purch | Leads |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| male | $5.10 | 1246 | 649 | 18 | 1.61% | $0.26 | 10 | $0.51 | 0 | 0 | 0 | 0 |
| female | $3.56 | 680 | 418 | 20 | 2.94% | $0.18 | 12 | $0.30 | 0 | 0 | 0 | 0 |
| **all** | $8.66 | 1926 | 1061 | 38 | 2.08% | $0.22 | 22 | $0.39 | 0 | 0 | 0 | 0 |

### Eventbrite - Event 3 Women

- **Campaign:** Event 3 — Philly — Women 70/30 Split Test (OUTCOME_TRAFFIC, ARCHIVED)
- **Ad set:** Event 3 Philly — Eventbrite — Women 70/30 (ARCHIVED; 2026-07-24 to 2026-08-10; $1/day; goal LANDING_PAGE_VIEWS)
- **Audience:** women, 22-42; Newark +25mile; New York +25mile; Philadelphia +25mile; advantage+ audience off
- **Ad status:** ARCHIVED; created 2026-07-24; delivery 2026-05-25..2026-09-02; last 7 days $0.00
- **Format:** video, CTA SEE_DETAILS
- **Primary text:** You + a friend, one night, zero pressure. SparkDate's Good Good Night @ Good Good Things is 2-for-1 this week only — August 10th in Philly. Four rounds of real conversation, no apps required.
- **Headline:** Bring a Friend, Split the Ticket
- **Link:** https://www.eventbrite.com/e/sparkdate-good-good-night-good-good-things-tickets-1994945955054?aff=oddtdtcreator&keep_tld=true

| Gender | Spend | Impr | Reach | Link clicks | CTR | CPC | LPV | $/LPV | Add to cart | Checkout | Purch | Leads |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| female | $7.38 | 1001 | 914 | 20 | 2.30% | $0.32 | 17 | $0.43 | 0 | 0 | 0 | 0 |
| **all** | $7.38 | 1001 | 914 | 20 | 2.30% | $0.32 | 17 | $0.43 | 0 | 0 | 0 | 0 |

### Landingpage - Event 3 Women USA

- **Campaign:** Landing Page - Event 3 Women - USA (OUTCOME_TRAFFIC, ARCHIVED)
- **Ad set:** LP Ad Set Event 3-USA (ARCHIVED; 2026-07-27 to 2026-08-10; $1.5/day; goal LANDING_PAGE_VIEWS)
- **Audience:** women, 22-45; US; advantage+ audience off
- **Ad status:** ARCHIVED; created 2026-07-27; delivery 2026-05-25..2026-09-02; last 7 days $0.00
- **Format:** video, CTA SEE_DETAILS
- **Primary text:** You + a friend, one night, zero pressure. SparkDate's Good Good Night @ Good Good Things is 2-for-1 this week only — August 10th in Philly. Four rounds of real conversation, no apps required.
- **Headline:** Bring a Friend, Split the Ticket
- **Link:** https://sparkdate.date/lp?eventId=QLKraJga4YAAUn8dnRLY&utm_source=Facebook&utm_medium=paid_social&utm_campaign=summer2026_philly&utm_content=week1_rsa1
- **UTMs seen by GA4:** utm_source=Facebook utm_medium=paid_social utm_campaign=summer2026_philly utm_content=week1_rsa1

| Gender | Spend | Impr | Reach | Link clicks | CTR | CPC | LPV | $/LPV | Add to cart | Checkout | Purch | Leads |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| female | $6.26 | 638 | 619 | 35 | 5.33% | $0.18 | 32 | $0.20 | 0 | 0 | 0 | 0 |
| **all** | $6.26 | 638 | 619 | 35 | 5.33% | $0.18 | 32 | $0.20 | 0 | 0 | 0 | 0 |

### Promoting website: https://sparkdate.date/lp?utm_source=Facebook&utm_medium=paid&utm_campaign=<campaign-name>

- **Campaign:** [6/6/2026] Promoting https://sparkdate.date/lp?utm_source=Facebook&utm_medium=paid&utm_campaign=<campaign-name> (LINK_CLICKS, ARCHIVED)
- **Ad set:** [6/6/2026] Promoting https://sparkdate.date/lp?utm_source=Facebook&utm_medium=paid&utm_campaign=<campaign-name> (ARCHIVED; 2026-06-06 to 2026-06-08; budget at campaign; goal LANDING_PAGE_VIEWS)
- **Audience:** 0, 18-65; Lancaster +12mile; advantage+ audience ON
- **Ad status:** ARCHIVED; created 2026-06-06; delivery 2026-05-25..2026-09-02; last 7 days $0.00
- **Format:** video, CTA SIGN_UP
- **Primary text:** Your app matched you. We host the date. Curated dating events in Philadelphia.
- **Headline:** SparkDate
- **Link:** https://sparkdate.date/lp?utm_source=Facebook&utm_medium=paid&utm_campaign=<campaign-name>
- **UTMs seen by GA4:** utm_source=Facebook utm_medium=paid utm_campaign=<campaign-name>

| Gender | Spend | Impr | Reach | Link clicks | CTR | CPC | LPV | $/LPV | Add to cart | Checkout | Purch | Leads |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| female | $3.66 | 266 | 242 | 7 | 3.38% | $0.41 | 6 | $0.61 | 0 | 0 | 0 | 0 |
| male | $2.29 | 190 | 176 | 6 | 3.16% | $0.38 | 7 | $0.33 | 0 | 0 | 0 | 0 |
| unknown | $0.04 | 6 | 6 | 0 | 0.00% | $0.00 | 0 | - | 0 | 0 | 0 | 0 |
| **all** | $5.99 | 462 | 426 | 13 | 3.25% | $0.40 | 13 | $0.46 | 0 | 0 | 0 | 0 |

### Loxleys | male | prime video

- **Campaign:** Loxleys | Traffic (OUTCOME_TRAFFIC, ACTIVE)
- **Ad set:** Loxleys | male | Traffic (ACTIVE; 2026-08-23 to 2026-09-22; budget at campaign; goal LINK_CLICKS)
- **Audience:** men, 22-45; Harrisburg +20mile; Lancaster +20mile; York +20mile; advantage+ audience off
- **Ad status:** ACTIVE; created 2026-08-30; delivery 2026-05-25..2026-09-02; last 7 days $5.22
- **Format:** video, CTA LEARN_MORE
- **Primary text:** Loxleys. Tuesday, September 22 at Loxleys, patio bar, Lancaster, PA. Doors 6:30 PM. /  / Weeks of texting and no plan ever made. This is the other option. /  / Early bird $24.99 through Sept 7.
- **Headline:** Lancaster, PA · Sep 22
- **Description:** Doors 6:30 PM
- **Link:** https://sparkdate.date/lp?eventId=KL4onXm7hJbqiwI9quAZ
- **url_tags:** utm_source={{site_source_name}}&utm_medium=paid_social&utm_campaign=LX_202609&utm_content=lx_prime_male_noplan
- **UTMs seen by GA4:** utm_source={{site_source_name}} utm_medium=paid_social utm_campaign=LX_202609 utm_content=lx_prime_male_noplan

| Gender | Spend | Impr | Reach | Link clicks | CTR | CPC | LPV | $/LPV | Add to cart | Checkout | Purch | Leads |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| male | $5.32 | 1016 | 872 | 66 | 7.87% | $0.07 | 59 | $0.09 | 0 | 1 | 0 | 0 |
| **all** | $5.32 | 1016 | 872 | 66 | 7.87% | $0.07 | 59 | $0.09 | 0 | 1 | 0 | 0 |

### Loxleys | female | prime video

- **Campaign:** Loxleys | Traffic (OUTCOME_TRAFFIC, ACTIVE)
- **Ad set:** Loxleys | female | Traffic (ACTIVE; 2026-08-23 to 2026-09-22; budget at campaign; goal LINK_CLICKS)
- **Audience:** women, 22-45; Harrisburg +20mile; Lancaster +20mile; York +20mile; advantage+ audience off
- **Ad status:** ACTIVE; created 2026-08-30; delivery 2026-05-25..2026-09-02; last 7 days $4.64
- **Format:** video, CTA LEARN_MORE
- **Primary text:** Loxleys. Tuesday, September 22 at Loxleys, patio bar, Lancaster, PA. Doors 6:30 PM. /  / Not an app. Not speed dating. A room of people who actually decided to show up. /  / Early bird $24.99 through Sept 7. /  / Bring a friend - 2-for-1 on tickets.
- **Headline:** Lancaster, PA · Sep 22
- **Description:** Doors 6:30 PM
- **Link:** https://sparkdate.date/lp?eventId=KL4onXm7hJbqiwI9quAZ
- **url_tags:** utm_source={{site_source_name}}&utm_medium=paid_social&utm_campaign=LX_202609&utm_content=lx_prime_female_showup
- **UTMs seen by GA4:** utm_source={{site_source_name}} utm_medium=paid_social utm_campaign=LX_202609 utm_content=lx_prime_female_showup

| Gender | Spend | Impr | Reach | Link clicks | CTR | CPC | LPV | $/LPV | Add to cart | Checkout | Purch | Leads |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| female | $4.76 | 599 | 489 | 46 | 9.18% | $0.09 | 42 | $0.11 | 0 | 0 | 0 | 0 |
| **all** | $4.76 | 599 | 489 | 46 | 9.18% | $0.09 | 40 | $0.12 | 0 | 0 | 0 | 0 |

### Event 2 Retargeting

- **Campaign:** Event 2 Retargeting (LINK_CLICKS, ARCHIVED)
- **Ad set:** Event 2 Retarget (ARCHIVED; 2026-06-27 to 2026-07-29; $6/day; goal LANDING_PAGE_VIEWS)
- **Audience:** all, 18-65; US; custom: Visited but did not order tickets, Video Watched; advantage+ audience off
- **Ad status:** ARCHIVED; created 2026-06-27; delivery 2026-05-25..2026-09-02; last 7 days $0.00
- **Format:** video, CTA BOOK_TRAVEL
- **Primary text:** Still thinking about July 29th? Four rounds of speed dating, one night, real people — American Bar & Grill, Lancaster. Early bird $18 ends July 15th.
- **Headline:** July 29th — spots are filling
- **Description:** Early bird ends June 17
- **Link:** https://www.eventbrite.com/e/sparkdate-speed-dating-for-app-burned-singles-summer-nights-tickets-1992377619092

| Gender | Spend | Impr | Reach | Link clicks | CTR | CPC | LPV | $/LPV | Add to cart | Checkout | Purch | Leads |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| female | $2.73 | 122 | 30 | 1 | 0.82% | $2.73 | 0 | - | 0 | 0 | 0 | 0 |
| male | $1.97 | 99 | 18 | 1 | 1.01% | $1.97 | 0 | - | 0 | 0 | 0 | 0 |
| **all** | $4.70 | 221 | 48 | 2 | 0.90% | $2.35 | 0 | - | 0 | 0 | 0 | 0 |

### Event 1 Retargeting

- **Campaign:** Event 1 Re-Marketing - Copy (OUTCOME_TRAFFIC, ARCHIVED)
- **Ad set:** Event 1 Retarget (ARCHIVED; 2026-06-16 to 2026-06-24; $5/day; goal LANDING_PAGE_VIEWS)
- **Audience:** all, 18-65; US; custom: Event visitors – 30d, excl buyers; advantage+ audience off
- **Ad status:** ARCHIVED; created 2026-06-16; delivery 2026-05-25..2026-09-02; last 7 days $0.00
- **Format:** video, CTA BOOK_TRAVEL
- **Primary text:** Still thinking about June 24? Four rounds of speed dating, one night, real people — American Bar & Grill, Lancaster. Early bird $18 ends June 17.
- **Headline:** June 24 — spots are filling
- **Description:** Early bird ends June 17
- **Link:** https://www.eventbrite.com/e/sparkdate-speed-dating-for-app-burned-singles-tickets-1990063778332?keep_tld=true

| Gender | Spend | Impr | Reach | Link clicks | CTR | CPC | LPV | $/LPV | Add to cart | Checkout | Purch | Leads |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| female | $4.39 | 87 | 2 | 2 | 3.45% | $1.46 | 1 | $4.39 | 0 | 0 | 0 | 0 |
| male | $0.26 | 9 | 2 | 0 | 11.11% | $0.26 | 0 | - | 0 | 0 | 0 | 0 |
| **all** | $4.65 | 96 | 4 | 2 | 4.17% | $1.16 | 1 | $4.65 | 0 | 0 | 0 | 0 |

### Landingpage - Event 3  All

- **Campaign:** Landing Page - Event 3 Women - Copy (OUTCOME_TRAFFIC, ARCHIVED)
- **Ad set:** LP Ad Set Event 3 All Gender (ARCHIVED; 2026-07-30 to 2026-08-10; $5/day; goal LANDING_PAGE_VIEWS)
- **Audience:** all, 22-45; Philadelphia +25mile; advantage+ audience off
- **Ad status:** ARCHIVED; created 2026-07-30; delivery 2026-05-25..2026-09-02; last 7 days $0.00
- **Format:** video, CTA BOOK_TRAVEL
- **Primary text:** Skip the small talk marathon. Several short dates, zero awkward silences (okay, maybe one). Philly's Good Good Night, Good Good Things — Aug 10. Tickets moving fast. Description: Philly · Aug 10 · Grab a seat
- **Headline:** Find Your Person in One Night
- **Link:** https://sparkdate.date/lp?eventId=QLKraJga4YAAUn8dnRLY&utm_source=Facebook&utm_medium=paid_social&utm_campaign=summer2026_philly&utm_content=week1_rsa1
- **UTMs seen by GA4:** utm_source=Facebook utm_medium=paid_social utm_campaign=summer2026_philly utm_content=week1_rsa1

| Gender | Spend | Impr | Reach | Link clicks | CTR | CPC | LPV | $/LPV | Add to cart | Checkout | Purch | Leads |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| male | $2.80 | 282 | 243 | 10 | 4.61% | $0.22 | 10 | $0.28 | 0 | 0 | 0 | 0 |
| female | $1.23 | 99 | 97 | 1 | 1.01% | $1.23 | 1 | $1.23 | 0 | 0 | 0 | 0 |
| unknown | $0.01 | 2 | 2 | 0 | 0.00% | $0.00 | 0 | - | 0 | 0 | 0 | 0 |
| **all** | $4.04 | 383 | 343 | 11 | 3.66% | $0.29 | 11 | $0.37 | 0 | 0 | 0 | 0 |

### SparkDate Summer Nights — Ad Set B Landing Page

- **Campaign:** SparkDate Event 2 — Summer Nights — Traffic (OUTCOME_TRAFFIC, ARCHIVED)
- **Ad set:** Event 2 Sparkdate Ad Set - Landing Page (ARCHIVED; 2026-06-27 to 2026-07-29; $7/day; goal LANDING_PAGE_VIEWS)
- **Audience:** all, 22-45; 40.180855,-76.375256 +30mile; interests: Hinge, Bumble; advantage+ audience off
- **Ad status:** ARCHIVED; created 2026-06-27; delivery 2026-05-25..2026-09-02; last 7 days $0.00
- **Format:** video, CTA SEE_DETAILS
- **Primary text:** Tired of matching with people who never reply? /  / SparkDate is hosting a speed dating night in Lancaster on July 29th. /  / 4 rounds. 7 minutes each. Real conversations with people who actually want to meet you. /  / If you both say yes → you get their contact info the next morning. /  / No algorithms. No ghosting. Just people. /  / 🎟 Limited spots — grab yours before they're gone.
- **Headline:** SparkDate is hosting a speed dating night in Lancaster on July 29th.
- **Link:** https://sparkdate.date/lp?utm_source=facebook&utm_medium=paid_social&utm_campaign=week2_Solution
- **UTMs seen by GA4:** utm_source=facebook utm_medium=paid_social utm_campaign=week2_Solution

| Gender | Spend | Impr | Reach | Link clicks | CTR | CPC | LPV | $/LPV | Add to cart | Checkout | Purch | Leads |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| male | $1.51 | 123 | 119 | 1 | 0.81% | $1.51 | 1 | $1.51 | 0 | 0 | 0 | 0 |
| female | $1.12 | 101 | 96 | 1 | 1.98% | $0.56 | 1 | $1.12 | 0 | 0 | 0 | 0 |
| unknown | $0.00 | 1 | 1 | 0 | 0.00% | $0.00 | 0 | - | 0 | 0 | 0 | 0 |
| **all** | $2.63 | 225 | 216 | 2 | 1.33% | $0.88 | 2 | $1.31 | 0 | 0 | 0 | 0 |

### SparkDate Summer Nights — Ad Set A Eventbrite - Copy

- **Campaign:** SparkDate Event 2 — Summer Nights — Traffic (OUTCOME_TRAFFIC, ARCHIVED)
- **Ad set:** Event 2 Sparkdate Ad Set - Eventbrite (ARCHIVED; 2026-06-27 to 2026-07-29; $7/day; goal LANDING_PAGE_VIEWS)
- **Audience:** all, 22-45; 40.180855,-76.375256 +30mile; interests: Hinge, Bumble; advantage+ audience off
- **Ad status:** ARCHIVED; created 2026-06-27; delivery 2026-05-25..2026-09-02; last 7 days $0.00
- **Format:** video, CTA SEE_DETAILS
- **Primary text:** Tired of matching with people who never reply? /  / SparkDate is hosting a speed dating night in Lancaster on July 29th. /  / 4 rounds. 7 minutes each. Real conversations with people who actually want to meet you. /  / If you both say yes → you get their contact info the next morning. /  / No algorithms. No ghosting. Just people. /  / 🎟 Limited spots — grab yours before they're gone.
- **Headline:** SparkDate is hosting a speed dating night in Lancaster on July 29th.
- **Link:** https://www.eventbrite.com/e/sparkdate-speed-dating-for-app-burned-singles-summer-nights-tickets-1992377619092

| Gender | Spend | Impr | Reach | Link clicks | CTR | CPC | LPV | $/LPV | Add to cart | Checkout | Purch | Leads |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| female | $1.31 | 112 | 106 | 3 | 5.36% | $0.22 | 3 | $0.44 | 0 | 0 | 0 | 0 |
| male | $1.23 | 134 | 130 | 0 | 0.00% | $0.00 | 0 | - | 0 | 0 | 0 | 0 |
| unknown | $0.02 | 2 | 2 | 0 | 0.00% | $0.00 | 0 | - | 0 | 0 | 0 | 0 |
| **all** | $2.56 | 248 | 238 | 3 | 2.42% | $0.43 | 3 | $0.85 | 0 | 0 | 0 | 0 |

### Women Offer — Carousel 1

- **Campaign:** Event 2 — Women — Offer — Eventbrite (OUTCOME_TRAFFIC, ARCHIVED)
- **Ad set:** Women Offer — $1/day — Eventbrite (ARCHIVED; 2026-07-20 to 2026-07-29; $1/day; goal LANDING_PAGE_VIEWS)
- **Audience:** women, 22-45; 39.953789,-75.121765 +20mile; interests: Dating game show; advantage+ audience off
- **Ad status:** ARCHIVED; created 2026-07-20; delivery 2026-05-25..2026-09-02; last 7 days $0.00
- **Format:** video, CTA BOOK_TRAVEL
- **Primary text:** Two of you. $25 total. One unforgettable night. / @Good Good Things - Philly /  / Bring your girl. You're not walking in alone. / 4 rounds of real conversations. Real people. / If you both say yes to someone, you get their number. /  / $12.50 each. That's cheaper than drinks.
- **Headline:** Safety First!
- **Description:** Get Tickets Here! https://www.eventbrite.com/e/sparkdate-summer-nights-tickets-1992377619092?aff=oddtdtcreator
- **Link:** https://www.eventbrite.com/e/sparkdate-summer-nights-tickets-1992377619092?aff=oddtdtcreator

| Gender | Spend | Impr | Reach | Link clicks | CTR | CPC | LPV | $/LPV | Add to cart | Checkout | Purch | Leads |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| female | $1.54 | 205 | 200 | 2 | 0.98% | $0.77 | 2 | $0.77 | 0 | 0 | 0 | 0 |
| **all** | $1.54 | 205 | 200 | 2 | 0.98% | $0.77 | 2 | $0.77 | 0 | 0 | 0 | 0 |

### MC-RT-QUANG

- **Campaign:** Marion Court Retargeting (OUTCOME_SALES, ACTIVE)
- **Ad set:** MC Retargeting | Video Viewers + Site Visitors | 22-45 (ACTIVE; 2026-08-17 to 2026-09-08; budget at campaign; goal OFFSITE_CONVERSIONS)
- **Audience:** women, 22-45; York, PA +15mile; Lancaster, PA +15mile; Harrisburg, PA +15mile; Reading, PA +15mile; custom: MC Retargeting; advantage+ audience off
- **Ad status:** ACTIVE; created 2026-08-29; delivery 2026-05-25..2026-09-02; last 7 days $1.04
- **Format:** video, CTA BOOK_TRAVEL
- **Primary text:** "Hosts and event setup made me relaxed and able to talk freely. Met my match there and seeing where it goes from there!" — Quang /  / Tuesday, September 8 · Marion Court Room, Lancaster · 6:30–8:30pm. /  / $24.99.
- **Headline:** “Met my match there.”
- **Description:** Tue, Sep 8 · 6:30 PM · $24.99
- **Link:** https://sparkdate.date/lp?eventId=WUaooYvOq0eC0D1QVCvQ&utm_source=Facebook&utm_medium=paid_social&utm_campaign=Augweek3_lancaster&utm_content=mc_rt_quang
- **UTMs seen by GA4:** utm_source=Facebook utm_medium=paid_social utm_campaign=Augweek3_lancaster utm_content=mc_rt_quang

| Gender | Spend | Impr | Reach | Link clicks | CTR | CPC | LPV | $/LPV | Add to cart | Checkout | Purch | Leads |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| male | $0.57 | 10 | 4 | 0 | 0.00% | $0.00 | 0 | - | 0 | 0 | 0 | 0 |
| female | $0.47 | 16 | 7 | 0 | 0.00% | $0.00 | 0 | - | 0 | 0 | 0 | 0 |
| **all** | $1.04 | 26 | 11 | 0 | 0.00% | $0.00 | 0 | - | 0 | 0 | 0 | 0 |

### MC-RT-NO-SCORECARDS

- **Campaign:** Marion Court Retargeting (OUTCOME_SALES, ACTIVE)
- **Ad set:** MC Retargeting | Video Viewers + Site Visitors | 22-45 (ACTIVE; 2026-08-17 to 2026-09-08; budget at campaign; goal OFFSITE_CONVERSIONS)
- **Audience:** women, 22-45; York, PA +15mile; Lancaster, PA +15mile; Harrisburg, PA +15mile; Reading, PA +15mile; custom: MC Retargeting; advantage+ audience off
- **Ad status:** ACTIVE; created 2026-08-29; delivery 2026-05-25..2026-09-02; last 7 days $0.56
- **Format:** video, CTA BOOK_TRAVEL
- **Primary text:** No scorecards. No swiping. No three weeks of texting that goes nowhere. /  / A room in Lancaster, an icebreaker, and people who decided to show up. /  / Tuesday, September 8 · Marion Court Room, Lancaster · 6:30–8:30pm. $24.99.
- **Headline:** No scorecards. No swiping.
- **Description:** Tue, Sep 8 · Doors 6:30 PM · $24.99
- **Link:** https://sparkdate.date/lp?eventId=WUaooYvOq0eC0D1QVCvQ&utm_source=Facebook&utm_medium=paid_social&utm_campaign=Augweek3_lancaster&utm_content=mc_rt_scorecards
- **UTMs seen by GA4:** utm_source=Facebook utm_medium=paid_social utm_campaign=Augweek3_lancaster utm_content=mc_rt_scorecards

| Gender | Spend | Impr | Reach | Link clicks | CTR | CPC | LPV | $/LPV | Add to cart | Checkout | Purch | Leads |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| male | $0.29 | 10 | 5 | 0 | 0.00% | $0.00 | 0 | - | 0 | 0 | 0 | 0 |
| female | $0.27 | 9 | 8 | 0 | 0.00% | $0.00 | 0 | - | 0 | 0 | 0 | 0 |
| **all** | $0.56 | 19 | 13 | 0 | 0.00% | $0.00 | 0 | - | 0 | 0 | 0 | 0 |

### Event 1 Retargeting

- **Campaign:** Event 1 Re-Marketing (OUTCOME_TRAFFIC, ARCHIVED)
- **Ad set:** Event 1 Retarget (ARCHIVED; 2026-06-15 to 2026-06-24; $5/day; goal LANDING_PAGE_VIEWS)
- **Audience:** all, 18-65; US; custom: Event visitors – 30d, excl buyers; advantage+ audience off
- **Ad status:** ARCHIVED; created 2026-06-15; delivery 2026-05-25..2026-09-02; last 7 days $0.00
- **Format:** video, CTA SEE_DETAILS
- **Primary text:** Still thinking about June 24? Four rounds of speed dating, one night, real people — American Bar & Grill, Lancaster. Early bird $18 ends June 17.
- **Headline:** June 24 — spots are filling
- **Description:** Early bird ends June 17
- **Link:** https://www.eventbrite.com/e/sparkdate-speed-dating-for-app-burned-singles-tickets-1990063778332?keep_tld=true

| Gender | Spend | Impr | Reach | Link clicks | CTR | CPC | LPV | $/LPV | Add to cart | Checkout | Purch | Leads |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| male | $0.17 | 4 | 1 | 0 | 0.00% | $0.00 | 0 | - | 0 | 0 | 0 | 0 |
| **all** | $0.17 | 4 | 1 | 0 | 0.00% | $0.00 | 0 | - | 0 | 0 | 0 | 0 |

### LX Women - Video Ad (Traffic)

- **Campaign:** Loxley's | Traffic (OUTCOME_TRAFFIC, PAUSED)
- **Ad set:** Loxley's | Female | Traffic (PAUSED; 2026-08-22 to 2026-09-22; budget at campaign; goal LINK_CLICKS)
- **Audience:** women, 22-45; York, PA +15mile; Lancaster, PA +15mile; Harrisburg, PA +15mile; Reading, PA +15mile; advantage+ audience off
- **Ad status:** PAUSED; created 2026-08-22; delivery none; last 7 days $0.00
- **Format:** video, CTA BOOK_TRAVEL
- **Primary text:** Thinking about it, but not alone? Bring your friend — one ticket gets you both in. /  / Split the nerves, double the people you actually talk to, and have someone to debrief with on the way out. /  / Tuesday, September 22 · Loxley's patio bar, Lancaster · 2-for-1 live now
- **Headline:** Bring a friend. One ticket, two of you.
- **Description:** 2-for-1 tickets live now
- **Link:** https://sparkdate.date/lp?eventId=KL4onXm7hJbqiwI9quAZ&utm_source=Facebook&utm_medium=paid_social&utm_campaign=Augweek2_lancaster&utm_content=proof_rsa1
- **UTMs seen by GA4:** utm_source=Facebook utm_medium=paid_social utm_campaign=Augweek2_lancaster utm_content=proof_rsa1
- **Results:** never delivered

### LX Women - Video Ad

- **Campaign:** Loxley's Female (OUTCOME_SALES, ARCHIVED)
- **Ad set:** LX Female | Lancaster-Harrisburg-York-Reading 15mi | 22-45 (ARCHIVED; 2026-08-17 to 2026-09-22; budget at campaign; goal OFFSITE_CONVERSIONS)
- **Audience:** women, 22-45; York, PA +15mile; Lancaster, PA +15mile; Harrisburg, PA +15mile; Reading, PA +15mile; advantage+ audience off
- **Ad status:** ARCHIVED; created 2026-08-17; delivery none; last 7 days $0.00
- **Format:** video, CTA BOOK_TRAVEL
- **Primary text:** Thinking about it, but not alone? Bring your friend — one ticket gets you both in. /  / Split the nerves, double the people you actually talk to, and have someone to debrief with on the way out. /  / Tuesday, September 22 · Loxley's patio bar, Lancaster · 2-for-1 live now
- **Headline:** Bring a friend. One ticket, two of you.
- **Description:** 2-for-1 tickets live now
- **Link:** https://sparkdate.date/lp?eventId=KL4onXm7hJbqiwI9quAZ&utm_source=Facebook&utm_medium=paid_social&utm_campaign=Augweek2_lancaster&utm_content=proof_rsa1
- **UTMs seen by GA4:** utm_source=Facebook utm_medium=paid_social utm_campaign=Augweek2_lancaster utm_content=proof_rsa1
- **Results:** never delivered

### LX All Genders - Video Ad

- **Campaign:** Loxley's All Genders (OUTCOME_SALES, ARCHIVED)
- **Ad set:** LX All Genders | Lancaster-Harrisburg-York-Reading 15mi | 22-45 (ARCHIVED; 2026-08-17 to 2026-09-22; budget at campaign; goal OFFSITE_CONVERSIONS)
- **Audience:** men+women, 22-45; York, PA +15mile; Lancaster, PA +15mile; Harrisburg, PA +15mile; Reading, PA +15mile; advantage+ audience off
- **Ad status:** ARCHIVED; created 2026-08-17; delivery none; last 7 days $0.00
- **Format:** link, CTA BOOK_TRAVEL
- **Primary text:** 31 people at American Bar & Grill. 22 at our first one. /  / No swiping. No three weeks of texting that goes nowhere. Drinks, an icebreaker, then real conversations — in that order. /  / Tuesday, September 22 · Loxley's patio bar, Lancaster · 6:30–8:30pm
- **Headline:** Real people who actually show up
- **Description:** Sept 22 · Loxley's patio bar, Lancaster
- **Link:** https://sparkdate.date/lp?eventId=KL4onXm7hJbqiwI9quAZ&utm_source=Facebook&utm_medium=paid_social&utm_campaign=Augweek2_lancaster&utm_content=proof_rsa1
- **UTMs seen by GA4:** utm_source=Facebook utm_medium=paid_social utm_campaign=Augweek2_lancaster utm_content=proof_rsa1
- **Results:** never delivered

### LX All Genders - Video Ad (Traffic)

- **Campaign:** Loxley's | Traffic (OUTCOME_TRAFFIC, PAUSED)
- **Ad set:** Loxley's | All Genders | Traffic (PAUSED; 2026-08-22 to 2026-09-22; budget at campaign; goal LINK_CLICKS)
- **Audience:** men+women, 22-45; York, PA +15mile; Lancaster, PA +15mile; Harrisburg, PA +15mile; Reading, PA +15mile; advantage+ audience off
- **Ad status:** PAUSED; created 2026-08-22; delivery none; last 7 days $0.00
- **Format:** link, CTA BOOK_TRAVEL
- **Primary text:** 31 people at American Bar & Grill. 22 at our first one. /  / No swiping. No three weeks of texting that goes nowhere. Drinks, an icebreaker, then real conversations — in that order. /  / Tuesday, September 22 · Loxley's patio bar, Lancaster · 6:30–8:30pm
- **Headline:** Real people who actually show up
- **Description:** Sept 22 · Loxley's patio bar, Lancaster
- **Link:** https://sparkdate.date/lp?eventId=KL4onXm7hJbqiwI9quAZ&utm_source=Facebook&utm_medium=paid_social&utm_campaign=Augweek2_lancaster&utm_content=proof_rsa1
- **UTMs seen by GA4:** utm_source=Facebook utm_medium=paid_social utm_campaign=Augweek2_lancaster utm_content=proof_rsa1
- **Results:** never delivered

### SparkDate Summer Nights — Eventbrite

- **Campaign:** SparkDate Event 2 — Summer Nights — Traffic (OUTCOME_TRAFFIC, ARCHIVED)
- **Ad set:** Event 2 Sparkdate Ad Set - Eventbrite (ARCHIVED; 2026-06-27 to 2026-07-29; $7/day; goal LANDING_PAGE_VIEWS)
- **Audience:** all, 22-45; 40.180855,-76.375256 +30mile; interests: Hinge, Bumble; advantage+ audience off
- **Ad status:** ARCHIVED; created 2026-06-27; delivery none; last 7 days $0.00
- **Format:** video, CTA SEE_DETAILS
- **Primary text:** Tired of matching with people who never reply? /  / SparkDate is hosting a speed dating night in Lancaster on July 29th. /  / 4 rounds. 7 minutes each. Real conversations with people who actually want to meet you. /  / If you both say yes → you get their contact info the next morning. /  / No algorithms. No ghosting. Just people. /  / 🎟 Limited spots — grab yours before they're gone.
- **Link:** https://www.eventbrite.com/e/sparkdate-speed-dating-for-app-burned-singles-summer-nights-tickets-1992377619092
- **Results:** never delivered
