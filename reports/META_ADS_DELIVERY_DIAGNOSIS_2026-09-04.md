# Meta ads: the delivery is fine, the sales stopped nine days ago (2026-09-04)

**This report changes no ad and no site code.** It reads the account live and
writes this file. Every recommended change in §8 is stated as a decision for
Taylor, not taken.

> **Revised twice, same day. Read §7 before acting on §1–§5.**
>
> **§6** answers *"I think it's serving me to the wrong audience."* It is. The
> demographics asked for are honoured exactly — but a relationship-status filter
> removes **80%** of the reachable audience, automatic placements put **86%** of
> Marion Court's money into Instagram Stories, and the objective spends the rest
> on the youngest women it can find.
>
> **§7** answers *"what else could we be missing?"* — and it **corrects the
> weight of §2**. The `OUTCOME_TRAFFIC` objective has never produced a sale on
> any event ($254.14, 1,156 landing-page views, zero), and both live prospecting
> campaigns run it. Marion Court is at **T-4**, and 73% of tickets have always
> sold in the final 14 days, so its selling window has not happened yet. And
> **zero sales on 437 landing-page views is not statistically meaningful** —
> about 1.7 were expected. The nine-day drought is the symptom that made us look,
> not proof on its own; §7a and §6 carry the actual evidence.
>
> Nothing in §1–§5 changed. §2's *numbers* stand; §7c revises what they prove.

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

## 7. EVIDENCE — why it has been hard to understand

Added on Taylor's second read: *"What else could we be missing? I don't
understand why it doesn't work."* Four things, and the first two change what
"doesn't work" even means.

### 7a. The Traffic objective has never produced a sale. Not once, on any event.

Every campaign the account has run, grouped by `objective`, 08-05 → 09-04:

| objective | spend | LP views | purchases | revenue | CAC |
|---|---:|---:|---:|---:|---:|
| `OUTCOME_SALES` | $373.49 | 279 | **5** | $147.45 | $74.70 |
| `OUTCOME_TRAFFIC` | **$254.14** | **1,156** | **0** | $0.00 | — |
| ended/renamed (mixed) | $142.11 | 72 | 1 | $32.49 | $142.11 |

**Traffic bought four times the landing-page views and sold nothing.**

Isolating cold prospecting only — retargeting removed from both sides, because
warm audiences convert better and would flatter the sales objective:

| cold prospecting only | spend | LP views | purchases |
|---|---:|---:|---:|
| sales objective | $227.91 | 132 | **2** |
| traffic objective | $254.14 | 1,156 | **0** |

Near-identical money. The traffic objective bought **nine times the visitors**
and converted none of them. If those 1,156 visitors had converted at the
sales-objective rate (1.52%), they would have produced about **17 sales**;
Poisson puts the chance of seeing zero at roughly **1 in 40 million**.

**The honest caveat:** the other side of that comparison is `n = 2`. Two sales
is a thin base to derive a rate from, so treat the *direction* as strong and
the *magnitude* as indicative. But every independent line points the same way —
Meta's own `recommendations` field (code 1942006, importance HIGH, on five ads),
the audit's 1.4%-vs-26% tap gap, and §6b's finding that `LINK_CLICKS` spends 86%
of the money on a swipe surface.

**What is live right now:** `Marion Court | Traffic` and `Loxleys | Traffic`,
both `OUTCOME_TRAFFIC`. The only live `OUTCOME_SALES` campaign is Marion Court
Retargeting, pointed at the exhausted 224-person pool from §4. **So every dollar
of live prospecting is on the one objective that has never sold a ticket.**

### 7b. Marion Court is at T-4, and 73% of tickets sell in the final 14 days

From `content/brand.json` → `paid_template._measured`, built from Firestore on
2026-08-23 across the **two completed** events (n=51 tickets; events still on
sale are excluded because their late window has not happened yet):

| window | tickets | cumulative |
|---|---:|---:|
| T-60..T-31 | 4 | 8% |
| T-30..T-22 | 5 | 18% |
| T-21..T-15 | 5 | 27% |
| T-14..T-8 | 14 | 55% |
| **T-7..T-1** | **19** | **92%** |
| T-0 | 4 | 100% |

*"73% of tickets sell in the final 14 days. The last week alone (19 tickets)
outsells everything before T-15 (14 tickets)."*

**Marion Court is 2026-09-08. Today is 09-04. That is T-4** — inside the single
highest-selling week of the cycle, which historically carries sales from 55% to
92% of the total. Calling it a failure today is calling it before the window in
which three quarters of tickets have always sold.

And the money is thin in exactly that window: Marion Court | Traffic is at
$10/day and its retargeting at $6/day, in the week that matters most.

Loxleys is 09-22, i.e. **T-18** — the flat part of the curve, where $3/day is
the ladder working as designed. Its zero is expected, not alarming.

### 7c. Zero sales on 437 landing-page views is not evidence of anything

The account's own LP → purchase rate is **6 / 1,504 = 0.40%**. Marion Court and
Loxleys together bought 437 landing-page views, so the expected number of sales
is **1.7**. The chance of observing zero when 1.7 are expected is about **18%**.

**So the nine-day drought, on its own, is a weak signal** — I should have said
so in §2 and did not. It is entirely consistent with a funnel working exactly at
its historical rate on a budget too small to produce a countable result. The
strong signals in this report are the objective split (§7a) and the audience
findings (§6); the drought is the symptom that made us look, not proof by itself.

At the current rate, one ticket costs roughly **250 landing-page views**, which
at Marion Court's $0.26 CPC is about **$65 of clicks per sale** before any
non-converting spend — against a $24.99 ticket. That ratio, not any single
broken thing, is why this does not work.

### 7d. The instrument has been broken since 08-25 — which is why nothing explains itself

`npm run ads:lint`, run live just now, returns **1 error and 8 warnings**:

```
ERROR utm-content-shared (1)
  (account-wide)  utm_content="proof_rsa1" is on 11 ads
                  (MC Women - Video Ad, MC All Genders - Video, …)
                  -- none can be attributed individually
```

Both live Marion Court traffic ads point at:

```
https://sparkdate.date/lp?eventId=WUaooYvOq0eC0D1QVCvQ
  &utm_source=Instagram          <- hardcoded, regardless of placement
  &utm_campaign=Augweek3_lancaster  <- an AUGUST WEEK 3 name, on a SEPTEMBER 8 event
  &utm_content=proof_rsa1        <- the seeded EXAMPLE value, shared by 11 ads
```

`content/brand.json` names all three as known defects, and
`reports/GA4_ANALYSIS_2026-08-28.md` recorded this exact URL on 08-28 as "not
done." The build-time gate (#411) fixed *future* ads — Loxleys is correctly
tagged with `url_tags` and a real `lx_prime_female_showup` slug — but
`url_tags` is frozen at creation (memory `meta-organic-vs-ads-two-paths`), so
the Marion Court ads still carry it.

**This does not stop a single sale. It stops us learning anything.** Marion
Court's traffic lands in GA4 under an August campaign name, in a bucket shared
with ten other ads. So the question "which Marion Court ad works" has been
unanswerable the entire time the event has been on sale — and that, more than
any single defect, is why it keeps not making sense.

### 7e. Two things in the live creative I had not read until now

- **`MC All Genders - Video Ad` advertises a price that expired eleven days
  ago.** Its link description reads **"$18.99 thru Aug 24."** The checkout
  charges **$27.49** ($24.99 + $2.50 fee) — **45% more than the ad promises.**
  It is the smaller ad set ($12.92 in the window), but a price mismatch between
  ad and checkout is a conversion killer wherever it appears. The larger ad
  (`MC Women`, $68.20) is accurate: "2-for-1 tickets live now."
- **Every Marion Court ad uses `call_to_action_type: BOOK_TRAVEL`.** Loxleys
  uses `LEARN_MORE`. Meta uses the CTA type as an intent signal for who to serve
  the ad to, and "Book Travel" is not what a Lancaster mixer is. I have **no
  measurement** that this is costing anything — flagging it as wrong, not as
  proven harmful.

## 7f. CORRECTION — the objective claim does not survive its own test

Taylor asked whether the objective is *causally* the reason. I tested it instead
of asserting it again, and **§7a overstated the case. It is not established.**

§7a computed the expected number of traffic-arm sales using the *sales arm's own
rate*. That assumes the conclusion. The correct test pools both arms and asks
how likely it is that both sales landed in the sales arm by chance.

**It depends entirely on the denominator, and the two answers disagree:**

| denominator | comparison | test | p | verdict |
|---|---|---|---:|---|
| landing-page views | 2/132 vs 0/1,156 | Fisher exact, 1-tailed | **0.010** | significant |
| **dollars spent** | 2 on $227.91 vs 0 on $254.14 | Fisher exact, 1-tailed | **0.224** | **not significant** |

**Dollars is the decision-relevant denominator** — it is the thing being
allocated. Per *visitor* a sales-objective click is better; per *dollar* the
sales objective buys nine times fewer visitors, and that cancels the advantage
out almost exactly. On the measure that matters for a budget decision, **2 versus
0 is what you would expect from chance about one time in five.**

**Nothing else in the account clears the bar either:**

| comparison | figures | p |
|---|---|---:|
| retargeting vs cold prospecting | $63.03/sale vs $241.03/sale (4 vs 2) | 0.110 |

**The root cause of the uncertainty is that the account has six conversions.**
To detect a genuine 2× per-dollar difference at 80% power would take roughly
**$5,671 per arm** — about **fifteen times** the money either arm has seen, and
seven times the account's entire lifetime spend of $769.23. A 3× difference
would still take ~$1,891 per arm. **At $10–16/day this question cannot be
settled by running the experiment.**

### What *is* established, and it is not the objective

The in-app-browser tap gap from `PAID_FUNNEL_AUDIT_2026-09-02.md` is measured on
**869 sessions** rather than 6 conversions, and it is behaviour, not attribution:

| | tap Get Tickets | rate |
|---|---|---:|
| in-app browser (Instagram/Facebook) | 11 of 791 | **1.39%** |
| normal browser | 20 of 78 | **25.6%** |

**An 18.4× difference, Fisher exact p ≈ 4 × 10⁻¹⁵.** That is the single
best-evidenced fact about this funnel.

**And placement is the lever on it.** §6b measured that 86% of Marion Court's
money runs in Instagram Stories and 88% of Loxleys' in Reels — placements whose
taps open in the in-app browser essentially always. So the causal chain that
holds up is:

> **placement → in-app browser → 18× worse tap rate** (p ≈ 4e-15, n = 869)

and the one that does not is:

> **objective → cheaper clicks → fewer sales** (p = 0.22 per dollar, n = 6)

The objective change remains a *reasonable bet* — it is the mechanism that
selects the cheap Stories click in the first place, and Meta's own
`recommendations` field flags it on five ads. But it is a bet, not a
demonstrated cause, and it should not be sold as one.

### The number that no objective change fixes

Cold prospecting, **across both objectives**, has cost **$241.03 per sale**
($482.05, 2 sales) against a **$24.99 ticket**. Retargeting costs $63.03. Neither
is profitable on ticket revenue alone. **That gap — not the objective — is the
problem**, and closing it needs the tap rate to move, which is §6b's lever and
#419's rebuilt checkout, not a setting in Ads Manager.

## 7g. THE TELLUS PRECEDENT, AND HOW TO KEEP A SALES OBJECTIVE FEMALE

Taylor, on reading §7f: *"tier 4 might work for marion court no? I had done this
once and got a flood of orders last time on tellus, but I want to make sure I get
female."* Both halves check out. Also: **he is right that pausing the Marion
Court retargeting leaves only a funnel that has never converted** — §8 item 2 is
withdrawn below.

### The Tellus switch is real, and it is the best precedent the account has

The Tellus `OUTCOME_SALES` campaigns were created **2026-08-13, at T-13.**

| date | spend | view_content | add_to_cart | init_checkout | purchases |
|---|---:|---:|---:|---:|---:|
| 08-06 … 08-12 | $3.95–$11.38/day | **0 every day** | **0** | **0** | **0** |
| **08-13** | $47.74 | 2 | 1 | 1 | 0 |
| 08-14 | $33.46 | 31 | 2 | 5 | 0 |
| 08-15 | $38.63 | 34 | 1 | 5 | **1** |
| 08-17 | $62.38 | 32 | 5 | 6 | **1** |
| 08-18 | $57.48 | 24 | 3 | 8 | **1** |
| 08-19 | $43.56 | 7 | 2 | 4 | **1** |

**Four purchases in five days, after none ever.** For this account that is a
flood, and it is the only period it has happened.

**Two caveats, stated so the precedent is not oversold.** Spend jumped **4.5×**
on the same day ($10.58 → $47.74), so objective and budget changed together. And
`view_content` / `add_to_cart` / `initiate_checkout` were **zero on every day
before 08-13** — the pixel's ecommerce events were not reporting at all, so
there is no valid "before" to compare against. The switch is confounded three
ways. It is still the strongest thing in the account's history, and it is
first-hand experience, which outranks a p-value computed on six conversions.

### The female question has an exact answer: gender expansion

`targeting_automation.individual_setting.gender: 1` is Advantage+ audience
**gender expansion**, and it **overrides `genders: [2]`**:

| ad set | asked for | expansion | delivered |
|---|---|---:|---|
| Good Good Campaign-Retargeting | WOMEN | **1** | **63% of money on men** ($63.73 of $100.38) |
| Good Good "Sale Obj Women" | WOMEN | 1 | **64% men — its one purchase was a man** |
| Tellus Retargeting | all (unset) | 1 | 41% men |
| **Tellus "Sales-Obj-Women"** | WOMEN | **0** | **100% women**, $60.74 |
| `Marion Court \| Female \| Traffic` | WOMEN | unset | **100% women**, $70.89 |

**With expansion off, gender holds at exactly 100% — every time.** A campaign
named "Sale Obj Women" that spent 64% on men is not a naming error; it is this
one field. Of the six lifetime purchases, **three were women and three men**,
despite women-first intent.

**A sales objective does not cost the gender control.** Tellus "Sales-Obj-Women"
was `OUTCOME_SALES` with expansion off and held 100% women. The two settings are
independent.

**The trap:** Ads Manager turns Advantage+ audience **on by default** in the
creation flow — which is how the Good Good sales campaigns got it and the older
Tellus one did not. And `advantage_audience: 0` is **not** sufficient: every live
ad set has that set to 0 while three still carried gender expansion. The field to
check is `individual_setting.gender`.

**Marion Court's ad sets already have expansion off.** The targeting is right; it
is the objective and the placement that are not.

### The operational catch: objective is not editable

Meta does not allow `objective` to be changed on an existing campaign. A sales
objective means **a new campaign, ad set and ad** — and therefore a new creative,
which is the only way `url_tags` can be fixed (§7d). `scripts/meta-create-lx-prime-ads.js`
already does exactly this correctly and is the template.

**At T-4 that is a poor bet for Marion Court**, for one measurable reason:

| optimisation event | volume, last 7 days | can it exit learning? |
|---|---:|---|
| `purchase` | **0** | no |
| `add_to_cart` | 3 | no |
| `initiate_checkout` | 2 | no |
| `view_content` | 17 | no |
| **`landing_page_view`** | **519** | **yes — clears Meta's ~50/week** |

A purchase-optimised campaign would have **zero events to learn from**. Tellus
had 13 days of runway; Marion Court has four.

**The cheaper move that gets most of the benefit, and is editable on the live ad
set:** change `optimization_goal` from `LINK_CLICKS` to `LANDING_PAGE_VIEW` on
`Marion Court | Female | Traffic`. It is one field, no rebuild, no new creative.
It makes Meta optimise for people who actually *load the page* rather than
people who *tap* — which is precisely the accidental-tap problem measured in §6b
(`facebook/reels_overlay`: 11 clicks, **1** landing-page view). And at 519 events
a week it is the only goal in the account that can actually leave the learning
phase. It resets learning, which at T-4 is a real cost — worth it only alongside
the placement restriction, not instead of it.

**Loxleys at T-18 is where the full Tier 4 belongs** — enough runway for a new
sales-objective campaign to learn, correct tagging from birth, and expansion
explicitly off.

## 8. DECISION — what is actually on the table

None of this is done. Each is Taylor's call. **Ranked by the strength of the
evidence behind it, per §7f — not by how appealing the theory is.**

### Tier 1 — true by inspection. No statistics required, nothing to be wrong about.

1. **`MC All Genders` promises "$18.99 thru Aug 24"; checkout charges $27.49.**
   Eleven days expired and **45% below** the real price. Editing a link
   description does not touch the frozen `url_tags` and does not force
   re-review. There is no version of this that is not a defect.
2. **~~Pause the Marion Court retargeting.~~ WITHDRAWN — see §7g.** Taylor's
   objection is correct and I missed it: MC Retargeting is the **only**
   `OUTCOME_SALES` delivery Marion Court has. Pausing it four days out leaves
   nothing but the traffic funnel that has never converted, and no fresh
   retargeting pool can be built in four days. The frequency-8.77 waste is real,
   but it is roughly **$24 for the rest of the run** — the cheaper of the two
   mistakes. **Leave it running; revisit after 09-08.**
3. **The five ended-but-ACTIVE campaigns** (§3): archive or extend. Costs
   nothing either way; leaving them just keeps the account unreadable.

### Tier 2 — the best-evidenced causal lever in the account (p ≈ 4e-15, n = 869)

4. **Restrict placements.** The in-app browser converts **18.4× worse** at the
   tap, measured on 869 sessions, and §6b shows 86% of Marion Court's money in
   Instagram Stories and 88% of Loxleys' in Reels — both of which open in it
   nearly always. Excluding Audience Network and Reels overlay outright, and
   weighting toward feed, attacks the one mechanism this account has actually
   demonstrated. **Expect CPC to rise sharply. That is the intended effect** —
   §7f shows cheap clicks are precisely what is not working.

### Tier 3 — a measured audience fact, though its effect on sales is untested

5. **The Single filter (§6a)** removes **80%** of reachable audience — that is
   Meta's own estimator, not an inference. Whether the other 80% *buys* is
   untested. Dropping it is one field and no re-review; it also makes the two
   Marion Court ad sets match Loxleys, giving a like-for-like comparison for the
   first time.

### Tier 4 — a reasonable bet, explicitly NOT a demonstrated cause

6. **The objective, split by event (§7g).** The statistics still say p = 0.224 —
   but Taylor's Tellus precedent (4 sales in 5 days after the 08-13 switch, none
   before) is first-hand and outranks a p-value on six conversions. Two
   different calls:
   - **Loxleys, T-18: build the full sales-objective campaign.** Objective is not
     editable, so this is a new campaign/ad set/ad — which is also the only way
     to fix `url_tags` (§7d). `scripts/meta-create-lx-prime-ads.js` is the
     template. **Gender expansion explicitly off** (§7g).
   - **Marion Court, T-4: do NOT rebuild.** `purchase` has **0 events in 7 days**
     to learn from; Tellus had 13 days of runway, this has four. Instead change
     `optimization_goal` from `LINK_CLICKS` to `LANDING_PAGE_VIEW` on
     `Marion Court | Female | Traffic` — editable on the live ad set, one field,
     no new creative, and the only goal in the account with the volume (519/week)
     to leave the learning phase. It optimises for people who *load the page*
     rather than people who *tap*, which is §6b's exact defect.

### Timing, not a lever

7. **Marion Court is T-4** (§7b). Its selling window is now, it is funded at $10
   + $6 a day, and its campaigns stop 09-08. Tier 1 items 1–2 are the only ones
   that can land inside it. **Judging the event before 09-08 is judging it early.**
8. **The `proof_rsa1` tagging (§7d) cannot be fixed on the live ads** —
   `url_tags` is frozen at creation, so a correct tag costs a new dark post,
   which memory `dont-swap-creatives-under-live-retargeting` says not to do
   under a live retargeting audience. Recommend Marion Court stays unmeasurable
   through 09-08 — it is four days — and every ad after it goes through
   `scripts/ad-utm.js`, as Loxleys already does.

### The thing none of these fixes

Cold prospecting costs **$241.03 per sale across both objectives** against a
**$24.99 ticket**; retargeting costs $63.03. **No setting in Ads Manager closes
a 10× gap.** The tap rate has to move — Tier 2, plus #419's rebuilt checkout,
which is two days old and unmeasured. If that does not move it, the honest
conclusion is that cold paid acquisition does not pay for this product at this
ticket price, and the money belongs in the channels that already work: Eventbrite
listings, email, and the retargeting pool that costs $63 a sale when it has
anyone in it.
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

## 9. What I did not verify

- **Whether Marion Court and Loxleys have actually sold tickets.** Meta's zero
  is attributed conversions only; Eventbrite fires no pixel. PR #427 concluded
  Marion Court's two sales trace to email and organic Facebook — I did not
  re-derive that, and I did not read Stripe or the dashboard here. *"Zero
  purchases from ads"* is not *"zero tickets sold."*
- **The video creative.** §7e reads every live ad's headline, body, CTA and
  destination link — but not the footage itself. Whether the video is any good
  is unmeasured here; `META_ADS_REVIEW_2026-09-02.md` covers that ground.
- **Whether a sales objective would actually optimise.** Decision 1 notes this
  account has 6 lifetime pixel purchases against the ~50/week Meta wants. I did
  not model what that does to delivery — it is the strongest argument against
  the change I am recommending, and it is untested.
- **The purchase-timing curve is n=51 across two Lancaster events** (§7b),
  both from `brand.json`'s own reading of Firestore on 08-23. I did not
  re-derive it, and `brand.json` itself says to treat the shape as directional
  and the percentages as imprecise.
- **Whether #419 improved the tap rate.** 54 visitors is not a measurement. The
  earliest honest read is several days of the new page at current volume.
- **Ad-review / policy state beyond the API.** `effective_status` and
  `issues_info` are clean for every object; I did not open Account Quality.
- **Gender splits.** Not pulled here — and memory
  `meta-gender-rows-do-not-reconcile` says the breakdown and the total disagree
  in this account, so they need the treatment `ads:review` gives them.

## 10. One thing I did to the data

Walking the live checkout fired one real `ViewContent` + `InitiateCheckout` and
one `AddToCart` into the production pixel and into GA4 on 2026-09-04, from this
machine, on a Marion Court paid UTM. No purchase was completed and no payment
details were entered. If 09-04 shows exactly one add-to-cart with no sale, that
is me.
