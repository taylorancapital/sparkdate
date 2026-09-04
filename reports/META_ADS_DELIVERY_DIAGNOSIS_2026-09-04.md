# Meta ads: the delivery is fine, the sales stopped nine days ago (2026-09-04)

**This report changes no ad and no site code.** It reads the account live and
writes this file. Every recommended change in §7 is stated as a decision for
Taylor, not taken.

> **Revision, same day.** §6 was added after Taylor's read: *"I think it's
> serving me to the wrong audience."* It is. The demographics asked for are
> being honoured exactly — but a relationship-status filter removes **80%** of
> the reachable audience, automatic placements put **86%** of Marion Court's
> money into Instagram Stories, and the objective steers the rest to the
> youngest, cheapest women it can find. Nothing above §6 changed.

**Data.** Meta Marketing API v21.0 read live at 2026-09-04 ~11:20 local against
account `act_1672342180672647` — account status, every campaign / ad set / ad
with `effective_status` and `stop_time`, `adspixels`, per-ad `tracking_specs`,
and insights at account / campaign / ad level with `time_increment=1` over
2026-08-05 → 2026-09-04. Plus a live walk of `https://sparkdate.date/lp` at
375×812 with a Marion Court paid UTM.

**Traps applied.** Meta purchases are *attributed conversions*, not sales
(memory `ga4-revenue-is-own-site-only`: Eventbrite fires no pixel, ~55% of
revenue is invisible to it). `ACTIVE` is not `delivering` (memory
`utm-process-map`). 09-04 is a partial day and is never compared to a whole one.
No creative `video_id` is compared to an audience `object_id` (memory
`meta-video-rendition-ids`).

---

## The answer in one paragraph

Nothing is broken in the sense the question implies. The account is active and
in good standing, the card on file is fine, the pixel fired 12 hours ago, and
money left the account on every one of the last 18 days. What happened is that
**every sale this account has ever produced came from two events that are now
over**, and the two events still on sale have never produced one. The last
attributed purchase was **2026-08-26**; **$193.25 has been spent in the nine
days since, for zero.** Five campaigns still read `ACTIVE` in Ads Manager while
their `stop_time` has already passed — which is why daily spend halved on 09-01
and why the account looks busier than it is. Underneath that, the mechanism was
already diagnosed on 09-02: four in five paid visitors arrive inside the
Instagram or Facebook in-app browser, where 1.4% tap Get Tickets against 26% in
a real browser. The fix for that shipped **two days ago** (#419) and has been
seen by roughly 54 paid visitors — far too few to have moved anything yet. I
verified it works.

## Four numbers

| | |
|---|---:|
| Lifetime paid ROAS, 08-05 → 09-04 ($769.23 spent, $179.94 back) | **0.23** |
| Days since the last attributed purchase (08-26) | **9** |
| Spent since that purchase, for zero attributed sales | **$193.25** |
| Purchases from the two events still on sale ($214.48 spent, 437 LP views) | **0** |

---

## 1. EVIDENCE — the account is healthy and it is spending

`account_status: 1`, `disable_reason: 0`, no spend cap, VISA \*7018 on file,
`is_prepay_account: false`. No campaign, ad set or ad carries an `issues_info`
entry. Nothing is rejected, disapproved, or in review.

Spend, every day, unbroken:

| date | spend | impressions | reach | link clicks |
|---|---:|---:|---:|---:|
| 08-29 | $20.28 | 3,210 | 2,424 | 85 |
| 08-30 | $37.11 | 4,916 | 3,711 | 165 |
| 08-31 | $29.87 | 3,575 | 2,674 | 117 |
| 09-01 | $13.55 | 1,775 | 1,331 | 66 |
| 09-02 | $20.24 | 2,231 | 1,615 | 60 |
| 09-03 | $17.30 | 2,374 | 1,823 | 51 |
| 09-04 (partial) | $6.90 | 823 | 689 | 19 |

The pixel `4390442851170732` last fired `2026-09-03T23:42:07Z`, is not
unavailable, and has automatic matching on.

## 2. EVIDENCE — the sales came from events that have ended

All six lifetime purchases, by campaign, 08-05 → 09-04:

| campaign | spend | LP views | purchases | revenue |
|---|---:|---:|---:|---:|
| Tellus Retargeting | $73.06 | 103 | 2 | $54.98 |
| Tellus — All Genders | $60.64 | 45 | 1 | $27.49 |
| Good Good Retargeting | $100.38 | 72 | 2 | $64.98 |
| Good Good — Sale Obj Women | $61.76 | 36 | 1 | $32.49 |
| Tellus — Sales-Obj-Women | $60.74 | 27 | 0 | $0.00 |
| Tellus — Traffic (2 campaigns) | $39.93 | 182 | 0 | $0.00 |
| Good Good — Traffic | $113.54 | 578 | 0 | $0.00 |
| Good Good — Sale Obj All Genders | $44.77 | 24 | 0 | $0.00 |
| **Marion Court (4 campaigns)** | **$199.00** | **289** | **0** | **$0.00** |
| **Loxleys — Traffic** | **$15.48** | **148** | **0** | **$0.00** |

Every purchase sits in a Tellus or Good Good row. Both events have passed.
**The two events still on sale have spent $214.48 and bought 437 landing-page
views without a single attributed sale.**

The purchases, by date: 08-15, 08-17, 08-18, 08-19, 08-24, 08-26. Then nothing.

## 3. MECHANISM — five campaigns say ACTIVE and are not running

This is the part most likely to read as "the ads are broken," because Ads
Manager shows them green.

| campaign | status | `stop_time` | state |
|---|---|---|---|
| Tellus — All Genders | ACTIVE | 2026-08-26 | **ended 9 days ago** |
| Tellus — Sales-Obj-Women | ACTIVE | 2026-08-26 | **ended 9 days ago** |
| Tellus Retargeting | ACTIVE | 2026-08-26 | **ended 9 days ago** |
| Good Good — Traffic | ACTIVE | 2026-08-31 | **ended 4 days ago** |
| Good Good Retargeting | ACTIVE | 2026-08-31 | **ended 4 days ago** |
| Marion Court — Traffic | ACTIVE | 2026-09-08 | live |
| Marion Court Retargeting | ACTIVE | 2026-09-08 | live |
| Loxleys — Traffic | ACTIVE | 2026-09-22 | live |

The spend record confirms it: the Tellus campaigns' last dollar was 08-26, the
Good Good campaigns' last was 08-31. **Daily spend fell from $29.87 to $13.55
on 09-01** because five of the eight went dark on schedule, silently.

One ad set makes this concrete: `Good Good | Female | Traffic` is `ACTIVE` with
a $20.00/day budget and `budget_remaining` of $20.00 — a live-looking ad set
under a campaign whose `stop_time` passed. It will never spend that budget.

## 4. MECHANISM — the retargeting is paying to re-show ads to nobody

`MC-RT-STILL-THINKING V2`, last 7 days: **$23.87, 1,246 impressions, frequency
8.77, 11 link clicks, 0 purchases.** Frequency 8.77 over 1,246 impressions is
roughly **142 people shown the same ad nine times in a week.**

That is the same pool `MARION_COURT_RETARGETING_FATIGUE_2026-09-01.md` measured:
224 unique people lifetime, frequency 13.77, and a last $11.64 that reached
**three** new people. The ad set is still running at ~$6/day into it.

## 5. NOT THE CAUSE — the pixel, the checkout, and the new code

I checked the three things that would each be a genuine emergency, and none of
them is happening.

**The pixel is attached where it matters.** Eleven of twelve active ads carry
`offsite_conversion[fb_pixel]` in `tracking_specs` and can report a purchase.
The one that cannot — `GG Women - Traffic` — belongs to a campaign that has
already ended, so it costs nothing going forward. (Memory
`meta-pixel-is-per-ad-tracking` and `tracking-specs-append-never-replace` cover
why this is per-ad and why it is not fixed by replacing specs.)

**The 09-02 rebuild did not break tracking, and it works.** I walked
`https://sparkdate.date/lp?utm_source=facebook&utm_medium=paid_social&utm_campaign=MC_202609`
at 375×812. Tapping *Get Tickets — $24.99*:

- opens the inline checkout **without navigating away** (`urlBefore === urlAfter`);
- resolves the right event — *"SparkDate: Real People, Real Drinks, Real Court ·
  Tue, Sep 8"*;
- renders the rebuilt first screen: gender as two tap targets, Reserve enabled
  from the first frame with `$27.49` on it, the 2-for-1 offered to everyone;
- and on the gender tap fires, in order, `checkout_field_started` (GA4),
  **`AddToCart` (Meta pixel)**, `add_to_cart` (GA4).

Both pipes are live. This is the test #420 recorded as never having been run.

**The upstream cause is the one already named.** `PAID_FUNNEL_AUDIT_2026-09-02.md`
measured it: of 1,000 paid visitors to `/lp`, ~36 tap, ~33 see the form, ~8 pick
a gender, ~2 buy — and the tap is 1.4% inside the Instagram/Facebook in-app
browser against 26% in a normal browser. Every live campaign is
`OUTCOME_TRAFFIC` optimising `LINK_CLICKS`, which is what buys that visitor.
Meta's own `recommendations` field flags five ads with *"Ad Isn't Optimized for
Conversions... you may get better results if you choose OFFSITE_CONVERSIONS"*
(code 1942006, importance HIGH).

**The fix has not had a chance to work.** #419 merged 09-02 at 21:40. Paid
landing-page views since: 36 on 09-03, 18 so far on 09-04 — about **54 people**
have seen the new checkout. At the audit's own measured rate that is an expected
yield near zero. Nine days of no sales is real; the last two of them are not yet
evidence about the fix.

## 6. EVIDENCE — who the money actually reached

Added on Taylor's read. Window **08-22 → 09-03**, whole days, live campaigns
only. Breakdown spend reconciles with the unbroken total to within $0.07 on
Marion Court | Traffic, so the memory `meta-gender-rows-do-not-reconcile`
caveat does not bite here — but it applies to *conversions*, and there are none
to reconcile.

### 6a. The "Single" filter removes 80% of the audience

Both Marion Court prospecting ad sets carry
`flexible_spec: [{"relationship_statuses": [1]}]` — Facebook's **Single**
relationship status. Meta's own `delivery_estimate`, holding geo, age and
gender constant:

| targeting | monthly reachable people |
|---|---:|
| women 22-45, Lancaster/York/Harrisburg/Reading 15mi, **as targeted** | **105,700 – 124,300** |
| the same, **without** the Single filter | **530,600 – 624,200** |
| Loxleys' women 22-45, 20mi cities, no filter (for comparison) | 484,600 – 570,100 |

**The filter removes 80% of who could be reached.** And it is not a random 80%:
it keeps only people who publicly declared "Single" on a Facebook profile field
that most users never fill in and that Meta has been quietly retiring. The slice
it keeps skews toward heavy, long-tenured Facebook users — not the person most
likely to buy a $25 mixer ticket in Lancaster.

`MARION_COURT_RETARGETING_FATIGUE_2026-09-01.md` §3 already named this filter as
halving the retargeting pool. It is also on the **prospecting** ad sets, which is
where the 224-person ceiling actually comes from. **Loxleys does not carry it at
all** — so the two events are not comparable, and any read across them is a read
across two different audiences.

### 6b. Placements are automatic, and 86% of Marion Court went to Stories

Every live ad set leaves `publisher_platforms`, `facebook_positions`,
`instagram_positions` and `device_platforms` **unset** — fully automatic. Paired
with `LINK_CLICKS`, Meta buys the cheapest click available, and the cheapest
click is a full-screen swipe surface.

**Marion Court | Traffic — $81.12:**

| placement | spend | share | clicks | LP views | CPC |
|---|---:|---:|---:|---:|---:|
| instagram / **stories** | **$70.05** | **86%** | 267 | 216 | $0.26 |
| facebook / feed | $5.09 | 6% | 18 | 8 | $0.28 |
| facebook / reels_overlay | $2.77 | 3% | 11 | **1** | $0.25 |
| audience_network / an_classic | $1.34 | 2% | 8 | 4 | $0.17 |
| everything else | $1.87 | 2% | 6 | 5 | — |

**Loxleys | Traffic — $14.68:** instagram/reels $9.28 (63%), facebook/reels
$3.68 (25%), facebook/feed $1.10 (7%). **88% Reels.**

**Marion Court Retargeting — $50.37:** facebook/feed $28.58 (57%) at **$1.79 a
click**, instagram/feed $10.12 (20%) at **$3.37 a click** — against $0.26 on the
prospecting campaign. Plus $0.36 on Audience Network rewarded video, which is
the placement where people tap an ad to earn a game reward.

Two things follow. First, `facebook/reels_overlay` bought **11 clicks and one
landing-page view** — ten of eleven never arrived, which is what an accidental
tap looks like. Second, and much larger: Stories and Reels taps open inside the
**Instagram in-app browser**, which is exactly where
`PAID_FUNNEL_AUDIT_2026-09-02.md` measured the Get Tickets tap rate at **1.4%
against 26%** in a real browser. The objective picks the cheapest click; the
cheapest click is the one that lands somewhere nobody buys.

### 6c. The age skew is Meta's choice, not the targeting

Both Marion Court ad sets target **22-45**. Where the money actually went:

| age × gender | spend | share |
|---|---:|---:|
| 25-34 female | $42.71 | 53% |
| 18-24 female (i.e. 22-24) | $23.46 | 29% |
| 35-44 female | $6.86 | **8%** |
| 25-34 male | $3.26 | 4% |
| 35-44 male | $3.06 | 4% |
| everything else | $1.77 | 2% |

**82% of the budget went to women under 35, and 8% to women 35-44** — from an
ad set that asked for 22-45 without a preference. `LINK_CLICKS` found that young
women click cheapest and spent accordingly.

### 6d. What is NOT wrong

- **Geography.** 100% Pennsylvania on all three live campaigns; $0.02 leaked to
  Maryland. Targeting is 15mi (MC) / 20mi (LX) around Lancaster, York,
  Harrisburg and Reading. *Caveat:* Meta's `region` breakdown is state-level, and
  `comscore_market` returned no rows at this spend, so this confirms **in-state**,
  not **in-Lancaster**.
- **Gender.** Honoured exactly. `Marion Court | Female` served 100% women
  ($68.20). `Marion Court | All Genders` ran 59/41 male/female on $12.92 — the
  natural skew, on 16% of the campaign. Loxleys ran male $8.05 / female $6.63.
- **Advantage Audience is off** (`advantage_audience: 0`) on every live ad set.
  Meta is not expanding past the targeting; no `targeting_optimization` is set.

## 7. DECISION — what is actually on the table

None of this is done. Each is Taylor's call.

1. **Marion Court is Tue 09-08 — four days out**, and its campaigns stop that
   day. Whatever happens for it happens this week or not at all.
2. **The five ended-but-ACTIVE campaigns**: extend `stop_time`, or archive them
   so the account stops reading as busier than it is. Leaving them is the only
   option that costs nothing and also fixes nothing.
3. **Marion Court retargeting** at frequency 8.77 into 224 people is the
   clearest waste on the board — roughly $6/day. Pausing that ad set moves it
   somewhere with reach; the pool is too small to be worth re-showing.
4. **The objective.** Every live campaign buys link clicks. The audit, Meta's
   own recommendation, and the 1.4%-vs-26% tap gap all point the same way. The
   09-09 review was scheduled for this — but that is the day *after* Marion
   Court.
5. **Loxleys is the one with runway** (stops 09-22, currently $3/day, ladder to
   $9 on 09-08 per memory `lx-campaign-live`). It is the event where a changed
   objective has time to matter.
6. **The Single filter (§6a).** Dropping `relationship_statuses` from the two
   Marion Court prospecting ad sets multiplies the reachable audience by five.
   It is a one-field edit and it does not force creative re-review. The counter-
   argument is that it is the only interest-style signal on the ad set at all —
   removing it makes the targeting purely geo/age/gender. Loxleys already runs
   that way, so there is a live comparison either way.
7. **Placements (§6b).** Restricting to feed-style placements, or excluding
   Audience Network and Reels overlay, stops paying for taps that never arrive.
   This is the lever that most directly attacks the in-app-browser problem
   without touching the objective. Note it will raise CPC — that is the point.

## 8. What I did not verify

- **Whether Marion Court and Loxleys have actually sold tickets.** Meta's zero
  is attributed conversions only; Eventbrite fires no pixel. PR #427 concluded
  Marion Court's two sales trace to email and organic Facebook — I did not
  re-derive that, and I did not read Stripe or the dashboard here. *"Zero
  purchases from ads"* is not *"zero tickets sold."*
- **The creatives themselves.** I read delivery, not whether the copy or the
  video is any good. `META_ADS_REVIEW_2026-09-02.md` covers that ground.
- **Whether #419 improved the tap rate.** 54 visitors is not a measurement. The
  earliest honest read is several days of the new page at current volume.
- **Ad-review / policy state beyond the API.** `effective_status` and
  `issues_info` are clean for every object; I did not open Account Quality.
- **Gender splits.** Not pulled here — and memory
  `meta-gender-rows-do-not-reconcile` says the breakdown and the total disagree
  in this account, so they need the treatment `ads:review` gives them.

## 9. One thing I did to the data

Walking the live checkout fired one real `ViewContent` + `InitiateCheckout` and
one `AddToCart` into the production pixel and into GA4 on 2026-09-04, from this
machine, on a Marion Court paid UTM. No purchase was completed and no payment
details were entered. If 09-04 shows exactly one add-to-cart with no sale, that
is me.
