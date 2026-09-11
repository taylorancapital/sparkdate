# A better alternative to Meta ads is the channel already selling most of the tickets (2026-09-11)

**This report changes no site code.** Taylor asked, for the second time in four
days, what a better alternative to Meta ads would be for a business like this
one: lower CPC and CPM, higher conversion. The 09-07 answer was that much of
"Meta looks bad" was measurement, and that the retargeting starvation should be
fixed before judging the channel. Both of those have now happened (PRs #521,
#523, the Loxleys retargeting launch on 09-08), so this is the genuine
"where else" conversation the 09-07 note said would come next.

The answer is in data the business already has. **Every paid channel tried
besides Meta sold nothing. The channels that convert ten to thirty times better
than Meta per visit are all free, and one of them, Eventbrite, already sells 61%
of the tickets without a visitor ever reaching the site.** The better
alternative is not another ad network. It is working the discovery surfaces
properly and treating Meta as the last-14-days tool the playbook already makes
it.

Everything marked MEASURED below was read today: Firestore `tickets`, `events`
and `ad_spend` (all 147 ticket docs, 108 spend docs, via the REST API), last
night's GA4 pull (`Night Tasks/ga4-api-*-2026-09-11.csv`, window 2026-05-19 →
2026-09-11), and `meta-insights-2026-09-10.csv` for the week 09-04 → 09-10.

---

## Four numbers

| | |
|---|---:|
| Paid tickets bought on Eventbrite, never touching an ad or the site | **65 of 106 (61%)** |
| Paid-social sessions per own-site sale | **535** |
| Eventbrite-listing sessions per own-site sale | **16** |
| Sales from the five other paid channels tried (Google Search, Nextdoor, TikTok, Pinterest, Reddit) | **0** |

---

## CORRECTION (same day, afternoon) — Eventbrite Ads has been running since June, and the report below did not know

**§5 said Eventbrite Ads "has never been run on this account." That is false.**
Read in the organizer account, Marketing → Eventbrite Ads, after Taylor asked
to "set up the Eventbrite Ads test on Loxleys":

| Campaign | Dates | Objective | Daily budget | Spend | Impressions | Clicks | CPC |
|---|---|---|---:|---:|---:|---:|---:|
| Loxleys (Sep 22) | 08/30 → 09/22, **live** | Drive traffic | $2 | $19.84 | 1,615 | 32 | $0.62 |
| Marion Court #1 | 09/01 → 09/08 | Drive traffic | $7 | $51.00 | 1,204 | 15 | $3.40 |
| Marion Court #2 | 08/16 → 09/08 | Drive traffic | $2 | $94.27 | 11,621 | 128 | $0.74 |
| Tellus Aug (two campaigns) | 08/06 → 08/26 | Drive traffic | | not read | | | |
| Good Good (two campaigns) | 07/24 → 08/31 | Drive traffic | | not read | | | |
| Summer Nights (three campaigns) | 07/11 → 07/29 | Drive traffic / awareness | | not read | | | |
| page 2 of the list | June, presumably Founders Mixer | | | not read | | | |

**Invoices, all paid:** Jun 21 $50.23 · Jul 1 $19.13 · Aug 1 $42.89 · Aug 25
$150.54 · Sep 1 $80.99 = **$343.78**, plus the unbilled period since 09-01
(Marion Court #1's $51.00 in full and parts of the other two), so roughly
**$400 lifetime**. The dashboard's "Monthly performance" panel read 26,656
impressions / 399 clicks / $304 on an unlabelled default window.

**What this changes:**

1. **None of that spend is in Firestore `ad_spend`**, so the dashboard's CAC
   and every "$1,408.64 of ad spend" figure in this report are understated by
   roughly $400, about 28%. This is the Google Ads gap of 09-04 again, on a
   third platform.
2. **Eventbrite's per-ticket cost is not $2.61.** Fees plus roughly $400 of
   Eventbrite Ads over 65 Eventbrite tickets is about **$8.80**. Still far
   under Meta's band, but the "free discovery" framing in §2b was too clean.
3. **Part of the "Eventbrite Marketplace" traffic in §2b is bought.** Marion
   Court's two campaigns delivered 143 clicks against a listing that had 371
   visits in total, so up to **39%** of that event's listing traffic was paid
   placement, sitting inside Eventbrite's "site, app, and marketing efforts"
   bucket. Loxleys: 32 of 278 (12%). The organic marketplace share is nearer
   half than three quarters.
4. **The Eventbrite Ads "test" in §6 item 5 is not a new thing to set up.** It
   has been running for three months on a `Drive traffic` objective with no
   sales attribution on the report page, so it has never been scored. The
   way to score it exists (Traffic and Conversion orders per event against
   the campaign's clicks), and on the listing's own 1.8 to 2.7% visit-to-order
   rate the Marion Court campaigns bought roughly four orders for $145, about
   **$35 to $40 per order** — a model, not an observation, because nothing
   attributes an order to a paid click.

The rest of the report stands with those corrections applied where marked.

## §1 EVIDENCE — where the 106 tickets actually came from

MEASURED, Firestore, all time to 2026-09-11. Paid means `status === 'confirmed'
&& amount > 0 && !isComp && !isPlusOne`, the filter the attribution memory calls
correct. That returns **106** (the 09-10 dashboard review quoted 128 for five
completed events; it counted differently, and the difference does not move any
share below by more than a few points).

| Door | Paid tickets | Share | Gross | What it cost | Per ticket |
|---|---:|---:|---:|---|---:|
| Bought on Eventbrite (`eventbrite_import`) | 65 | 61% | $1,482.87 | $169.72 Eventbrite fees (11.4%) + ≈$400 Eventbrite Ads, not in `ad_spend` (see CORRECTION) | **$2.61 fees only; ≈$8.80 with the ads** |
| Bought on sparkdate.date | 39 | 37% | $1,019.63 | $1,370.72 Meta + $37.92 Google | $36 – $228 (see below) |
| Bought on Meetup (`meetup_import`) | 2 | 2% | $52.15 | $0 | $0 |
| **All** | **106** | | **$2,554.65** | **$1,408.64** | **$13.29** if every ticket is credited to ads |

Ad spend by month (Firestore `ad_spend`, synced from both platforms): Meta Jun
$108.15, Jul $364.01, Aug $711.24, Sep-to-date $187.32 = **$1,370.72**; Google
Jun $2.56, Jul $35.36 = **$37.92**. Meta is 97% of every dollar spent on
acquisition.

**Of the 39 own-site tickets, GA4 attributes 6 to a paid-social session.** The
other 33: Eventbrite listing click 11, direct 6, email 5, organic Facebook 4,
Google organic 3, Facebook Page event 1, Google Ads (Performance Max, last
click) 1, and two from on-site surfaces (`get_tickets_block`, `matches`).
That is the same 39 transactions GA4 reports, reconciled to the own-site count
exactly.

So the honest cost-per-ticket for ads is a **range, not a number**:

- **$13.29** if every one of the 106 tickets is credited to ads (the 09-04
  report's ceiling; it is what gross ROAS 1.81 rests on).
- **$36.12** if ads are credited with every own-site ticket ($1,408.64 / 39).
- **$201** on session attribution (7 tickets: 6 Meta + 1 Google).
- **$228** on Meta's own pixel (6 lifetime attributed purchases).

Session attribution is a floor: the click-to-purchase lag is measured at 14
days, the cookie reader that dropped `_fbp`/`_fbc` was only fixed on 09-04, and
a first-touch record with no expiry masked ad clicks until the same day
(`reports/META_ADS_ROOT_CAUSE_2026-09-04.md` §3). The truth is inside the
range. But even the ceiling is five times what an Eventbrite ticket costs, and
the ceiling credits Meta with tickets bought by people who never saw an ad.

### Per event, crediting every ticket to the ads (the most generous reading)

| Event | Meta spend | Paid tickets | Cost per ticket | Women |
|---|---:|---:|---:|---:|
| Founders Mixer + Round 2 (Jun–Jul; spend predates tagging, so it is one pool) | $474.42 | 41 | $11.57 | 7 |
| Tellus AfterDark, Aug 26 | $234.37 | 24 | $9.77 | 9 |
| Good Good, Aug 31 | $320.45 | 14 | $22.89 | 1 |
| Marion Court, Sep 8 | $276.99 | 17 | $16.29 | 6 |
| Loxleys, Sep 22 (T-11, live) | $66.75 | 8 so far | $8.34 | 3 |

(Another $35.66 sits on an event id that matches no event document.)

## §2 EVIDENCE — what each door converts at, per visit

MEASURED, GA4 own-site sessions only, 2026-05-19 → 2026-09-11. This is the
apples-to-apples comparison: the same attribution model on every row, so the
14-day-lag caveat applies equally to all of them.

| Source of the visit | Sessions | Own-site sales | **Sessions per sale** | Revenue |
|---|---:|---:|---:|---:|
| Paid social (every Meta tag: Facebook, Instagram, fb, ig, facebook) | 3,211 | 6 | **535** | $179.94 |
| Direct | 884 | 6 | 147 | $169.94 |
| Email (own list, all sends) | 395 | 5 | 79 | $125.45 |
| Organic Facebook (Page, bio link, referrals) | 199 | 4 | 50 | $102.97 |
| Google organic | 140 | 3 | 47 | $82.47 |
| **Eventbrite listing → site** | 176 | 11 | **16** | $290.39 |
| Facebook Page event (n = 1) | 12 | 1 | 12 | $27.49 |

A visitor who arrives from an Eventbrite listing is **33 times** as likely to
buy as one who arrives from a Meta ad. Email is 7×. Google organic is 11×. And
the Eventbrite row is only the part of Eventbrite that GA4 can see; the 65
on-platform buyers had no session at all.

The Eventbrite listing is the one surface that has never had an optimisation
pass (`social-proof-pulls-women` memory, 08-25; TL2 was published with no cover
on 09-08 and every share advertised Eventbrite's logo instead of ours).

## §2b EVIDENCE (added the same afternoon) — Eventbrite's own traffic report

MEASURED, read in the Eventbrite organizer account, Reporting → Traffic and
Conversion, last-touch, online sales only. This is the number the ads range
in §1 was missing: **where the people who buy on Eventbrite come from.**

| Selection | Window | Listing visits | Orders | Tickets | Conversion | Eventbrite Marketplace | Direct | Creator event links (our shares) | Creator tools |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Loxleys (Sep 22) | all time | 278 | 5 | 5 | 1.8% | **201 (72%)** | 63 (23%) | 10 (4%) | 4 (1%) |
| Loxleys + Marion Court (Sep 8) | 2026-05-01 → 09-11 | 649 | 15 | 17 | 2.31% | **494 (76%)** | 125 (19%) | 22 (3%) | 8 (1%) |
| Marion Court alone (by subtraction) | | 371 | 10 | 12 | 2.7% | 293 (79%) | 62 (17%) | 12 (3%) | 4 (1%) |

Eventbrite defines Marketplace as "Eventbrite's site, app, and marketing
efforts", Direct as "traffic from outside Eventbrite with no known source",
and Creator event links as "sharing your event link". The Marketplace row
does not expand in the accessibility tree, so the split between search,
app, and Eventbrite's own emails was not read. Select-all across every
event did not take in the UI; the two most recent Lancaster events are what
was read, and they are the two most relevant.

Three things follow:

1. **Eventbrite is the largest top of funnel the business has, and it is
   Eventbrite's, not ours.** Three quarters of listing visits arrive from
   Eventbrite browsing. Our own shared links are 3 to 4%.
2. **The listing converts at 1.8 to 2.7% of visits**, against 0.19% for a
   Meta session on the site (§2). Same product, ten times the rate.
3. **The ads' cost per ticket sits at the expensive end of §1's range.** The
   65 Eventbrite buyers mostly reached the listing through Eventbrite, so
   crediting them to Meta ($13.29) is not supportable; the $36 to $228 band
   is the honest one.

For Eventbrite Ads (§5): being first in category organically means the
*search* placement adds little. What it would add is the homepage, category
page, app and related-events placements, which Eventbrite's product page
lists and which are not category search. That is still a test, and this
report can score it: the Traffic and Conversion report will show the paid
placement as its own channel row.

## §3 EVIDENCE — the paid alternatives already tried

MEASURED, same GA4 window. Taylor has already bought clicks on five other paid
channels. All of it is in the same table, and none of it sold a ticket.

| Paid channel | Spend | Sessions | Sales | Note |
|---|---:|---:|---:|---|
| Meta (all campaigns) | $1,370.72 | 3,211 | 6 | last week's prospecting CPC ran $0.10 – $0.68 |
| Google Ads, Search ("Website traffic-Search-1") | $35.35 | **0** | 0 | 110 clicks, zero attributed sessions; cause not established (`google-ads-spend-is-unread`) |
| Google Ads, Performance Max | $2.56 | 2 | 1 | last-click; GA4's data-driven model credits it $0 |
| Nextdoor (cpc) | not synced | 22 | 0 | the free Nextdoor Events post is a different surface and is in use |
| TikTok Ads | not synced | 30 | 0 | `week1_Solution` / `week2_Solution` |
| Pinterest Ads | not synced | 12 | 0 | `week3_Women` |
| Reddit Ads | not synced | 4 | 0 | `week3_Women` |

**On a paid basis nothing tested beats Meta.** Meta's cold CPC is already at
the cheap end of what any network sells. The problem is not the price of the
click.

## §4 MECHANISM — why "lower CPC" is the wrong target

The account's own landing-page-view → purchase rate on Meta is **0.40%**
(6 / 1,504, `reports/META_ADS_DELIVERY_DIAGNOSIS_2026-09-04.md` §7c). At a
$0.26 CPC that is roughly **$65 of clicks per ticket** against a $24.99 –
$29.99 ticket. Halve the CPC and it is $32: still underwater. The arithmetic
only closes if the conversion rate moves by an order of magnitude, and no ad
network sells that.

What does move it by an order of magnitude is **intent**. A person on an
Eventbrite listing, a newspaper calendar, a Google result for "singles events
Lancaster", or an email they signed up for came *looking for something to do*.
A person scrolling Instagram was interrupted. The 33× gap in §2 is that
difference, and it is the same reason 61% of buyers never reach the site: they
were already on Eventbrite when they decided.

Two facts about the buying moment make discovery surfaces even more important
than the rate suggests:

- **66% of tickets sell in the final 14 days** and 36% in the final week
  (`sales-happen-in-the-last-14-days`, five completed events). People decide
  close to the night. Calendars and listings are where "what's on this week" is
  answered; a cold ad at T-25 is shown to someone who is not yet deciding.
- **The Evvnt / LancasterOnline newsletter sent 138 sessions in one day for
  $0** (09-03), more than any free surface except Eventbrite's whole window.
  Its ticket link was broken at the time (129 of those sessions fired zero
  `view_item`), fixed 09-06 with the path-only `/l/` links, and has not yet
  been observed working; the re-check is due around 09-13 to 09-17.

**What no channel fixes: women.** Paid tickets are 32% women on the site, 22%
on Eventbrite (33% counting the free women's tier). No door in the data brings
women at a better rate than the others. That is a creative and offer problem
(social-proof creative, the 2-for-1 carve-out decided 09-10) and a borrowed-
audience problem (`/women-outreach`), not a channel-selection problem, and this
report does not pretend otherwise.

## §5 EVIDENCE (corrected) — Eventbrite Ads, the one paid channel with an intent argument, is already running

**Eventbrite Ads** promotes a listing to people already browsing events on
Eventbrite in the same market: budgets of $5 – $25 a day, promoted placement
on search, homepage, category pages, the app and related events, and a
$20/month credit for Premium organisers, per Eventbrite's own product page.
**This report first said it had never been run here. It has run on every
event since June** — see the CORRECTION at the top for the campaigns, the
invoices and the numbers. It is the only paid product whose audience is
defined by *looking for an event nearby* rather than by demographics, and on
the listing's own conversion rate its Marion Court campaigns modelled out at
$35 to $40 per order, inside the cheap end of Meta's band. What it has never
had is a score.

How to read it if tried: Eventbrite Ads land on the Eventbrite listing, so the
sales arrive as `eventbrite_import` and GA4 never sees them. Score it in
Firestore, as Eventbrite-sourced paid tickets at the same T-minus against past
events (the Sales Pace card, #504), never in GA4 and never in Meta.

Also not verified: whether the free calendars scale past one newsletter blast;
whether Meetup's organizer promotion tools do anything; the actual spend on
Nextdoor, TikTok, Pinterest and Reddit (none of it is synced to `ad_spend`, so
their cost per zero sales is unknown, only that it was zero).

## §6 DECISION — where the next dollar and the next hour go

In order. The first four cost hours, not money.

1. **Treat Eventbrite as the primary acquisition channel it already is.** Give
   the listings the pass they have never had: cover art on every event (TL2's
   was missing at publish), photos of a real room, the host named, the run of
   show in the description, women's-facing copy per the 09-02 brainstorm §4.
   This is the surface 61% of buyers decide on and it has had zero optimisation
   against $1,371 of ad optimisation.
2. **Fill the free calendars, every event, every time.** `content/listing-sites.json`
   registers 15 surfaces; 9 are still `not_pursued`. `/syndicate-events` builds
   each form to ready-to-submit. Use the `/l/` short links on all of them (three
   of the surfaces have already mangled a long URL). Around 09-13 to 09-17,
   confirm `lancasteronline / listing` finally shows non-zero `view_item`.
3. **Grow and use the email list.** 118 users plus 151 leads produced 395
   sessions and 5 sales, seven times Meta's rate per visit. Every listing and
   every event page should capture an address; the T-14 send is the one that
   lands in the window where two-thirds of sales happen.
4. **Post every event to the Meetup group and as a Facebook Page Event with the
   venue tagged.** Meetup has sold 2 tickets from a group nobody posts in.
   The Page Event exposes the night to the venue's followers (Tellus 360's
   page carries 83,750 check-ins) and produced a ticket from 12 visits.
5. **Score the Eventbrite Ads campaign that is already live on Loxleys, and
   decide its budget.** (Corrected: it exists, $2/day since 08-30, $19.84 spent,
   32 clicks.) At $2/day the remaining 11 days buy about 35 more clicks, under
   one expected order at the listing's rate, which reads as nothing either way.
   Raising it to $5/day through 09-22 (about $55 more, the "Add to your budget"
   control on the campaign page) buys roughly 90 clicks, two or three expected
   orders — still thin, but the first campaign here that could be read at all.
   Score it in Firestore as `eventbrite_import` tickets at T-7 and T-1 against
   the past-event median at the same T-minus, and in Eventbrite's Traffic and
   Conversion report as orders against the campaign's clicks. The budget change
   is Taylor's click; nothing was changed today.
6. **Keep Meta, in the shape the playbook already gives it.** Cold at the $2/day
   floor outside T-14, retargeting and the women-locked 2-for-1 cell carrying
   the Close phase. Nothing in this report argues for changing the ladder; it
   argues against adding another interruption channel to it. Do not re-run
   Google Search until the zero-sessions-for-110-clicks tracking gap is
   understood, and expect little from it when it is: search volume for this
   category in Lancaster is small.
7. **Women are the constraint, and no channel solves it.** Social-proof
   creative (`social-proof-pulls-women`), the 2-for-1 carve-out (PR #521), and
   borrowed audiences (`/women-outreach`, 09-02 brainstorm Tier 2) are the
   levers. They belong in the same week as items 1 to 4, not after them.

## What I did not verify

- **The spend on Nextdoor, TikTok, Pinterest and Reddit.** None of it is in
  `ad_spend`, so the table in §3 can say those channels sold nothing, not what
  they cost to sell nothing.
- **How many of the 65 Eventbrite buyers saw a Meta ad first.** Some did; an ad
  can send someone to Eventbrite instead of the site. That is exactly why the
  cost-per-ticket is given as a range from $13.29 to $228 rather than a number,
  and why the per-visit comparison in §2 carries the argument instead.
- **106 versus 128.** The 09-10 dashboard review counted 128 dated paid tickets
  across five completed events; today's strict filter returns 96 for those five
  and 106 overall. I did not reconcile the two. The channel shares are robust to
  it: Eventbrite's 61% would need 20 uncounted own-site tickets to fall below
  half.
- **Eventbrite Ads' effectiveness.** Corrected the same afternoon: the
  campaigns exist and their spend, impressions and clicks were read for three
  of eleven; the other eight and page 2 of the list were not opened, and no
  campaign carries order attribution, so "$35 to $40 per order" is the
  listing's blended rate applied to paid clicks, not a measurement. The
  Marketplace row's split between organic browse and paid placement is not
  exposed anywhere that was read.
- **Eventbrite Ads spend is in no dataset.** Not in `ad_spend`, not in the
  nightly, not in the dashboard CAC. The invoices page is the only record.
- **LancasterOnline after the 09-06 link fix.** The 138-sessions day is
  historical; the fixed link has produced no measured conversions yet because
  the newsletter has not gone out again. Re-check due 09-13 to 09-17.
- **The last two days of the GA4 window** are stubs by construction
  (`ANALYTICS_METHOD.md` §1). On a four-month window they do not move any row.
- **Loxleys and TL2 are live** and their ticket counts are incomplete; both
  appear in the tables at today's values and will grow.

## Sources

- Firestore `tickets` (147 docs), `events` (7), `ad_spend` (108), read
  2026-09-11 via the REST API with the GA4/Firebase service account. The
  main checkout's `@google-cloud/firestore` install is missing
  `collection-reference.js`, so the admin SDK could not load from a worktree;
  the REST scripts are in the session scratchpad.
- `Business Plan/files/Night Tasks/ga4-api-{traffic-by-source,revenue-by-source,
  key-events-by-source,channel-groups,paid-cost-vs-sessions}-2026-09-11.csv`,
  pulled 06:00 UTC.
- `Business Plan/files/Night Tasks/meta-insights-2026-09-10.csv` (09-04 → 09-10).
- `reports/META_ADS_ROOT_CAUSE_2026-09-04.md`,
  `reports/META_ADS_DELIVERY_DIAGNOSIS_2026-09-04.md` §7c,
  `reports/WOMEN_ACQUISITION_BRAINSTORM_2026-09-02.md`,
  `reports/LOXLEYS_RETARGETING_LAUNCH_2026-09-08.md`,
  `content/listing-sites.json`.
- Eventbrite Ads: eventbrite.com/organizer/features/eventbrite-ads/ and the
  Eventbrite help centre pricing page, read 2026-09-11.
