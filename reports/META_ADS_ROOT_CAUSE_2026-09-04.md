# The Meta ads were never measured against sales, and the join already existed

**2026-09-04, evening.** Supersedes
`reports/META_ADS_DELIVERY_DIAGNOSIS_2026-09-04.md`, whose headline — *"the
sales stopped nine days ago"* — is retracted at the top of that file.

**Method.** Ten agents, five investigating and five adversarially verifying each
other, against Firestore (`tickets`, `events`, `ad_spend`) and the Meta
Marketing API v21.0 read live. Every load-bearing number below survived a second
agent trying to break it. Where one did not survive, it is marked.

---

## The answer in one paragraph

Nothing about the campaigns' *delivery* is broken, and the business is not
obviously losing money on them. What was broken is that **every "sales" number
anyone has quoted about Meta came from Meta's own attributed conversions**,
which see **6 of 53 real tickets — 11%**. Meanwhile a complete spend-to-revenue
join has existed in Firestore since 2026-08-01 and nobody had read it. Read it
and gross ROAS is **1.79**, not 0.23. Two genuine defects were found and fixed:
a regex bug that silently dropped Meta's `_fbp`/`_fbc` cookies for most buyers,
and a first-touch attribution record with no expiry, so one Eventbrite visit in
June masked every ad click after it. Two ad-account settings — a **one-day**
click attribution window against a **measured 14-day** click-to-purchase lag,
and an optimisation goal switched from `LANDING_PAGE_VIEWS` to `LINK_CLICKS` on
2026-08-05 — explain most of what looked like collapse.

## Four numbers

| | |
|---|---:|
| Gross ROAS, all channels, 08-05 → 09-04 ($776 spend, $1,387 tickets) | **1.79** |
| What Meta reports for the same window | **0.23** |
| Real tickets Meta can see | **6 of 53 (11%)** |
| Marion Court's disjoint weekly ticket counts | **0, 1, 4, 6** |

---

## 1. EVIDENCE — the join already existed

`scripts/sync-meta-spend.js` writes 101 daily `ad_spend` docs to Firestore, each
carrying `byEvent` keyed by the Firestore `eventId` **parsed out of each ad's own
destination link**. Monthly `_unattributed`: 2026-06 $110.71, 2026-07 $363.71,
**2026-08 $0.00, 2026-09 $0.00**. All unattributed spend predates the tagging
work.

Crossed with `tickets.eventId` — which includes every Eventbrite and Meetup
import, because it never touches the pixel:

| event | Meta spend | tickets | revenue | gross ROAS | cost/ticket |
|---|---:|---:|---:|---:|---:|
| Loxleys | $16.18 | 4 | $92.96 | **5.75** | $4.04 |
| Tellus | $234.37 | 24 | $599.24 | **2.56** | $9.77 |
| Marion Court | $205.18 | 11 | $282.18 | **1.38** | $18.65 |
| Good Good | $320.45 | 14 | $412.32 | **1.29** | $22.89 |
| **account** | **$776.18** | **53** | **$1,386.70** | **1.79** | — |

**The honest bound is 0.23 … 1.79** — Meta's pixel-matched floor, and the
ceiling that credits the ads with every ticket. Gross, before venue and
operating costs, and before the ~$101.33 of Eventbrite fees inside that window
(net ≈ $1,285.37).

## 2. EVIDENCE — sales never stopped, and Marion Court is accelerating

In the exact nine-day window the previous report called *"$193.25 spent for
zero"*: **14 paid tickets, $381.12.** Only 08-28 and the partial 09-04 were
empty. The longest zero-sale run since 08-05 is **three days**.

Marion Court's own disjoint 7-day buckets: **0 → 1 → 4 → 6.** Its best week is
the most recent one.

Aligned on days-before-event rather than calendar date, cumulative paid tickets
at **T-5**: Tellus 18, Round 2 15, **Marion Court 11**, Founders 10, Good Good 8.
Third of five on units and on revenue. **Soft, not failing.**

The account-wide weekly decline that looked alarming — 21 → 13 → 12 tickets — is
an inventory effect: 14 of the peak week's 21 were Tellus inside its own final
fortnight, and an event that has happened cannot sell more. **Normalised per
live event the trend rises: 5.25 → 3.25 → 4.00.**

**The genuinely idle asset is Loxleys** — 4 paid tickets, nothing since 08-24,
11 days dry while its campaign spends. At T-18 its predecessors had booked 0, 7,
2 and 3, so 4 is inside the historical range and cannot be called behind either.

## 3. MECHANISM — two code defects, both now fixed

**`spdCookie()` never read Meta's cookies unless they came first.** In all five
public pages it compiled:

```
'(^|;)\s*' + name + '\s*=\s*([^;]+)'      ->      (^|;)s*_fbps*=s*([^;]+)
```

`\s` is not an escape inside a JS string literal — it collapses to the letter
`s`. `document.cookie` separates entries with `"; "`, which that pattern cannot
match. Proven by execution: with `_ga=..; _fbp=..; _fbc=..` both return `null`;
with `_fbp` first it returns correctly.

The fingerprint is in the data — one ticket carries `fbc` set and `fbp` null,
which is impossible if both were read properly. **So "only 1 of 131 tickets has
an fbc" was a reader bug, not evidence about ad-driven buying.** Every CAPI
`Purchase` since the pixel work shipped went to Meta with degraded match
quality.

**First-touch attribution had no TTL.** `lp.html`, `events.html` and
`event.html` all guarded on `!localStorage.getItem('sparkdate_attr')` with no
expiry, so a visitor whose first touch was an Eventbrite listing in June stays
`eventbrite / listing` for the life of the browser, through any number of later
ad clicks. That is why 6 of 9 own-site buyers read `direct`. Now expires at 30
days — long enough to cover the measured 14-day click-to-buy lag and Meta's
7-day window.

## 4. MECHANISM — two ad-account settings

**A one-day click attribution window on every live prospecting ad set.**
`attribution_spec` is `[{CLICK_THROUGH, window_days: 1}]` on all four live
traffic ad sets. The four `OUTCOME_SALES` retargeting sets are 7-day; 7 is the
account maximum.

Against that: an agent decoded the embedded timestamp inside a real `fbc` on
ticket `zc4mqCYPoA` (2026-08-29, $27.49, Marion Court, recorded as
`channel=direct`). The click was **2026-08-15T16:42:39Z — 14.0 days before the
purchase.** Meta credits it to nothing. Our own attribution calls it direct.

**The optimisation goal was switched to buy taps instead of arrivals.** Every
Event 2 / Event 3 ad set before **2026-08-05** used `LANDING_PAGE_VIEWS`. From
that date the account has run `LINK_CLICKS` on every traffic ad set. That is the
cheap-click lever — not Advantage+.

## 5. NOT THE CAUSE — the Advantage+ audit, in full

All 40 campaigns / 42 ad sets / 45 ads enumerated, including archived and
deleted. *(The campaigns edge rejects an `effective_status` array in v21.0; only
`filtering=[{field:"campaign.effective_status",operator:"IN",...}]` returns
archived rows. Without it the account shows 12 campaigns instead of 40.)*

| lever | state |
|---|---|
| Advantage+ **audience** | **OFF on every live ad set.** `advantage_audience=1` on exactly 3, all archived June boosted posts, $73.50 lifetime |
| Detailed-targeting expansion | **absent on all five live ad sets.** `individual_setting.gender=1` survives only on paused/archived sets; it overrode a real women-lock on just two, $162.14 |
| Lookalike / custom-audience relaxation | **OFF** — `{lookalike:0, custom_audience:0}` on all 7 ad sets that carry it |
| Advantage+ **placements** | **ON** — 31 of 42 ad sets, $892.50, including all five live |
| Advantage **campaign budget** (CBO) | **ON** — 16 of 40 campaigns, including all three live |
| Advantage+ **creative** | **ON** — `advantage_plus_creative` OPT_IN on 38 of 45 ads, $1,006.56 of $1,248.58 lifetime spend |

**The Marion Court creatives, never previously checked, are OPT_IN** — 9 features
on `MC Women - Video Ad`, 12–13 on the three retargeting ads. The two Loxleys
prime ads built by script on 08-30 are the clean counterexample: a full 83-key
spec with `advantage_plus_creative` OPT_OUT and **zero** OPT_IN features. It can
be, and has been, fully turned off in this account.

**And the mis-tap theory the previous report sold is dead.** Marion Court put
85.6% of spend into Instagram Stories and converted **286 link clicks into 233
landing-page views — 81%**. Loxleys runs 89% and 96% on Instagram and Facebook
Reels. Only `facebook/facebook_reels_overlay` is junk (7% LPV/click) and it is
$3.37 lifetime.

## 6. The worst live dollar

**Marion Court Retargeting**: $81.45 lifetime, $33.77 in the last 7 days, 35 link
clicks *lifetime*, **$1.41 CPC, $2.46 per landing-page view, zero attributed
purchases ever.** The traffic side runs $0.26 CPC and $0.33 per landing-page
view. 55% of it goes to `facebook/feed`.

**And it served men for two weeks.** It carries `genders:[2]` and no
`individual_setting`, yet delivered **$23.77 of $81.45 (29.2%) to male**, every
day from 08-17 through 09-01. Its `updated_time` is `2026-09-01T22:50:15-0400`,
and from 09-02 the breakdown is female-only. Cause not established — the ad set
was edited that evening and the leak stopped the same day.

## 7. Where Meta's six attributed purchases came from

All six are **click-attributed** — `1d_click=5, 7d_click=6, 1d_view=0,
7d_view=0`. No view-through component. Their $179.94 decomposes exactly as
3×$32.49 + 3×$27.49, and each matches a real own-site Stripe ticket on the day
Meta names, 6 of 6 on (day, exact cents).

Every one came from an `OUTCOME_SALES` retargeting-style ad set — Good Good
Retargeting 2, Tellus Retargeting 2, Good Good Sales-Obj-Women 1, Tellus All
Genders 1. **All four are now paused or archived. Both live traffic campaigns
and the live retargeting campaign report zero attributed purchases lifetime.**

Reconciling Meta's counts back to individual tickets is structurally impossible
beyond this — insights expose no per-conversion identifier. The only join that
works is ours, one-way: ticket → `utm_content` → ad set spend.

## 8. What I did NOT verify

- **Whether the ads *caused* the Eventbrite sales.** The 1.79 ceiling credits
  them with everything; the 0.23 floor credits them with nothing. Nothing in the
  data separates the two, and no instrumentation short of a holdout test would.
- **Why MC Retargeting served men.** The leak is measured; the cause is not.
  `advantage_audience` was 0 and `individual_setting` absent throughout.
- **Whether the two fixed bugs materially changed anything historically.** They
  degraded match quality and mislabelled channel; how many sales that cost is
  not recoverable.
- **Any per-ad or per-creative claim.** With 6 Meta conversions and 53 tickets,
  no arm-level causal statement survives — see the previous report's §7f, which
  still stands at p = 0.224.
- **Eventbrite order-level data.** No credential exists in this environment;
  `EVENTBRITE_TOKEN` is present in Vercel production but `vercel env pull`
  returns it empty, as it does for every sensitive value.

## 9. Housekeeping found in passing

- Event doc `QLKraJga4YAAUn8dnRLY`, a duplicate "Good Good Night", absorbed
  **$35.66 of Meta spend with zero tickets.**
- The business owns **three pixels**; only `4390442851170732` is in use.
- **`privacy.html` §3 does not name Meta as a data recipient**, while CAPI has
  been sending hashed email plus `fbp`/`fbc` on every own-site purchase.
- Two ticket docs store `amount` as a **string**, which silently
  string-concatenates in any naive revenue sum. Two more use a misspelled
  `eventID`. Four rogue `eventId` values exist, including a capital-O lookalike
  of the Founders Mixer id — **`eventName` is the reliable join key, not
  `eventId`.**
- The correct paid-ticket filter is `status === 'confirmed' && Number(amount) > 0
  && !isComp && !isPlusOne` — 36 confirmed docs have `amount = 0`, including 21
  free Eventbrite tickets carrying no flag at all.
