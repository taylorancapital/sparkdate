# The ad lever for women, in order (2026-09-02)

**This report changes no site code.** It adds this file only. It answers one
question Taylor asked after reading `reports/META_ADS_REVIEW_2026-09-02.md`
(PR #400): *what can I do to get women to these events by pulling the ad lever?*
The review holds the lifetime ad history; this file holds the plan and the
three pulls made this morning that the plan rests on.

**Data, all read from `act_1672342180672647` on 2026-09-02 between 07:35 and
08:30 local via the Marketing API (Graph v21.0):** the custom audiences with
their rules, every live ad set's targeting, account insights broken down by
placement (lifetime, and the last 30 days per ad), and the pixel's own event
counts for the last seven days. Meta would not return a placement split by
gender in the same call (`(#100) Current combination of data breakdown columns
... is invalid`), so placement figures below are all genders, and the per-ad
placement figures for the women's ads are women because those ad sets are
women-only. "Clicks" in the 30-day table are all clicks, not link clicks, for
the same reason.

## DECISION — pull the lever in this order

1. **Wire the two live Marion Court Traffic ads to the pixel** (MC Women -
   Video Ad (Traffic), MC All Genders - Video Ad (Traffic)): the ad's Tracking
   section in Ads Manager, or `tracking_specs` by API the way
   `scripts/meta-create-lx-prime-ads.js` builds them. Until then those ads
   cannot record a cart, a checkout or a purchase, and nothing below can be
   scored. Both Loxleys prime videos already carry it.
2. **Put the site-visitor audience into the women's retargeting set.**
   "Visited but did not order tickets" already exists (all visitors, 60 days,
   buyers excluded) and the pixel is logging thousands of page views a week.
   The Marion Court retargeting set is named "Video Viewers + Site Visitors"
   but attaches only the video audience "MC Retargeting". Add the website
   audience; keep the set women-only.
3. **Run the funnel the account has already shown works.** Instagram buys
   women's attention cheapest; Facebook is where the purchases have landed.
   Prospect women-only on Instagram with Traffic video, retarget women-only on
   both placements under the Sales objective. Four of the six attributed
   purchases in the account's history came from retargeting.
4. **Change what the ad says, by stage.** Prospecting leads with proof ("31
   people came to our last one", the room on video), the hosted line from the
   Tellus retargeting copy ("hosts whose job is making sure you're not standing
   alone"), and a woman's testimonial, which the account does not have (the
   only testimonial ad is Quang's). Retargeting is where the 2-for-1 belongs,
   as the closer for a woman who already visited: as a prospecting headline it
   has bought 880 women's landing-page views and never a seat.
5. **Send the women's prime to the event page, not `/lp`.** `/event` earns
   about $2.42 a session to `/lp`'s $0.10 (09-01 GA4 report). Score the test by
   pixel purchases after step 1, never by views. Not a per-ad landing-page
   variant (memory `one-landing-page-no-variants`); the page already exists.
6. **Weight the budget to women, now.** The Loxleys female prime is the
   cheapest click in the account and shares a small daily budget with the male
   one. This account has run a 70/30 women's split before ("Event 3 — Philly —
   Women 70/30 Split Test"). Raise the female side today rather than at the
   Sep 8 ladder step.
7. **Keep every women's set women-only from launch.** All live ones are, but
   28% of past women's spend reached men because sets launched open and were
   narrowed later. Never launch open; Advantage+ audience stays off.

## EVIDENCE — placement

| Placement, lifetime, all ads | Spend | Landing-page views | Cost each | Attributed purchases |
|---|---:|---:|---:|---:|
| Facebook | $594.84 | 771 | $0.77 | 5 |
| Instagram | $531.93 | 1,388 | $0.38 | 1 |
| Audience Network | $72.08 | 60 | $1.20 | 0 |
| Threads | $1.34 | 6 | $0.22 | 0 |

Instagram delivers a woman's landing-page view at half Facebook's price;
Facebook delivers the purchases, because the retargeting ads that hold them
serve there. The women's prime ads run almost entirely on Instagram already:

| Women's prime ad, last 30 days | Placement | Spend | Clicks | Cost per click |
|---|---|---:|---:|---:|
| GG Women - Traffic | Instagram | $60.99 | 333 | $0.18 |
| GG Women - Traffic | Facebook | $0.86 | 5 | $0.17 |
| MC Women - Video Ad (Traffic) | Instagram | $50.62 | 207 | $0.24 |
| MC Women - Video Ad (Traffic) | Facebook | $1.72 | 9 | $0.19 |
| Loxleys, female, prime video | Instagram | $3.17 | 33 | $0.10 |
| Loxleys, female, prime video | Facebook | $1.37 | 16 | $0.09 |
| Loxleys, male, prime video (for comparison) | Instagram | $3.66 | 45 | $0.08 |

## EVIDENCE — audiences, and the pixel behind them

Custom audiences on the account, as of this morning:

| Audience | Type | Rule | Displayed size |
|---|---|---|---:|
| Visited but did not order tickets | website | all pixel visitors, 60 days, purchasers excluded | ≥ 20 |
| Loxleys Retargeting - Site Visitors | website | url contains `eventId=KL4onXm7hJbqiwI9quAZ`, 30 days | ≥ 20 |
| Tellus AfterDark: Singles Edition Retarget | website | url contains the Tellus event id, 30 days | ≥ 20 |
| MC Retargeting | video viewers | three MC videos | ≥ 1,000 |
| Tellus360 Retargeting, Good Good Thing Retargeting, Video Watched | video viewers | per-event videos | ≥ 1,000 |
| Event visitors – 30d, excl buyers | Facebook event | flagged "too small to be used" | — |

The "≥ 20" and "≥ 1,000" figures are the floors Meta displays below its
reporting threshold, not counts. The pixel itself is not the constraint:

In the last seven days the pixel recorded 2,837 PageView, 163 ViewContent, 50 InitiateCheckout, 21 AddToCart, 18 Purchase and 12 AddPaymentInfo events, plus 215 Lead events (many of them server-side, from the Eventbrite import path). A site-visitor audience built on it fills at that rate.

Live ad sets, as of this morning (Advantage+ audience off on every one):

| Ad set | Gender | Age | Places | Optimises for | Custom audience |
|---|---|---|---|---|---|
| Loxleys, female, Traffic | women | 22–45 | Harrisburg, Lancaster, York +20 mi | link clicks | none |
| Loxleys, male, Traffic | men | 22–45 | same | link clicks | none |
| Marion Court, Female, Traffic | women | 22–45 | four custom points +15 mi | link clicks | none |
| Marion Court, All Genders, Traffic | both | 22–45 | same | link clicks | none |
| MC Retargeting, Video Viewers + Site Visitors | women | 22–45 | same | conversions | MC Retargeting (video only) |

## How to score it

- `npm run ads:review` weekly: women's share of spend per set, purchases by
  gender per ad.
- The ticket records per event, through `scripts/audit-event-gender-mix.js`.
  A woman's purchase is the only number that counts; a woman's arrival is the
  one after that.

## What the ad lever will not do

- It cannot make a woman who bought walk in. At Good Good one of four did
  (`reports/EVENT_DEBRIEF_GOOD_GOOD_2026-08-31.md`). That is venue, arrival and
  the pre-event email.
- It cannot replace Eventbrite, where recent women's seats actually came from,
  three of four at Good Good on a free ticket type. The listing has never had a
  copy pass.

## What I did not verify

- Placement split by gender (Meta refused the combination). The per-ad table
  is women only because those sets are women-only.
- True audience sizes; Meta shows floors.
- Whether a woman's testimonial exists to use; none is in any ad.
- The ad-set change history behind the 28% leak (carried over from #400).
