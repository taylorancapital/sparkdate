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

## §1 EVIDENCE — where the 106 tickets actually came from

MEASURED, Firestore, all time to 2026-09-11. Paid means `status === 'confirmed'
&& amount > 0 && !isComp && !isPlusOne`, the filter the attribution memory calls
correct. That returns **106** (the 09-10 dashboard review quoted 128 for five
completed events; it counted differently, and the difference does not move any
share below by more than a few points).

| Door | Paid tickets | Share | Gross | What it cost | Per ticket |
|---|---:|---:|---:|---|---:|
| Bought on Eventbrite (`eventbrite_import`) | 65 | 61% | $1,482.87 | $169.72 Eventbrite fees (11.4%) | **$2.61** |
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

## §5 NOT VERIFIED — the one paid channel with an intent argument

**Eventbrite Ads** promotes a listing to people already browsing events on
Eventbrite in the same market: budgets of $5 – $25 a day, promoted placement
"in select markets", and a $20/month credit for Premium organisers, per
Eventbrite's own product page and help centre (read today, not tested). It has
never been run on this account. It is the only paid product whose audience is
defined by *looking for an event nearby* rather than by demographics, so it is
the one paid test this report recommends, and it is recommended as a test:
nothing here says it works, only that its audience is the audience §2 says
converts.

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
5. **Test Eventbrite Ads once, on Loxleys, now.** Loxleys is at T-11, inside the
   14-day window where sales happen, and it is the event with the best cost per
   ticket so far ($8.34). $5 – $10 a day through 09-22, roughly $75. Score it as
   §5 says. If Eventbrite-sourced paid tickets at T-7 and T-1 beat the past-event
   median at the same T-minus, it earned a second run on TL2.
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
- **Eventbrite Ads' effectiveness.** Only its existence and price band were
  read, from Eventbrite's own pages. No third-party benchmark was found and
  none is quoted.
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
