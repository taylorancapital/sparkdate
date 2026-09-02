# Marion Court Retargeting — audience exhaustion, not creative fatigue

**2026-09-01, revised 2026-09-02.** Source: Meta Marketing API, read live
(account `act_1672342180672647`), campaign `120250958681350542` "Marion Court
Retargeting", ad set `120250958851430542`. Cross-checked against the eleven
`meta-insights-*.csv` pulls in `Business Plan/files/Night Tasks/`.

Figures are the campaign's whole life, 2026-08-17 (launch) through **2026-09-01
complete** (the 09-02 revision re-read them once that day closed; the first
version of this report quoted 09-01 mid-day and is superseded).

This does **not** re-open the venue/ad-set decision that `ANALYTICS_CONTEXT.md`
§3b marks settled on 2026-08-25. It is a delivery finding about one ad set.

---

## The one number

Cumulative **unique people reached**, expanding window from campaign launch:

| through | spend | impressions | unique reach | frequency | new people | $ per new person |
|---|---:|---:|---:|---:|---:|---:|
| 08-19 | $15.17 | 573 | 153 | 3.75 | — | $0.10 |
| 08-22 | $27.07 | 1,027 | 189 | 5.43 | +36 | $0.33 |
| 08-25 | $41.53 | 1,784 | 210 | 8.50 | +21 | $0.69 |
| 08-28 | $51.07 | 2,369 | 221 | 10.72 | +11 | $0.87 |
| 09-01 | $62.71 | 3,084 | **224** | **13.77** | **+3** | **$3.88** |

**The last $11.64 bought three new people.** Cost per newly-reached person has
risen 39× since the first week. Reach is flat while impressions keep climbing —
the campaign is no longer finding anyone, it is re-showing the ad to the same
224 people, now 13.8 times each.

This is arithmetic on unique-user counts, not a rate on a small sample. It does
not depend on clicks and is not a rolling-window artifact.

---

## The fatigue curve, in non-overlapping weeks

Rolling-window CSVs cannot show this (six of seven days overlap — the trap
`ANALYTICS_CONTEXT.md` §1 warns about), and they carry no reach or frequency
column at all. These buckets are disjoint, read straight from the API.

| week | spend | impr | reach | freq | CTR | **link CTR** | CPC | CPM | LP views |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 08-13 – 08-19 | $15.17 | 573 | 153 | 3.75 | 3.32% | **1.40%** | $0.80 | $26.47 | 11 |
| 08-20 – 08-26 | $29.32 | 1,415 | 113 | 12.52 | 1.77% | **0.71%** | $1.17 | $20.72 | 10 |
| 08-27 – 09-01 | $18.22 | 1,096 | 103 | 10.64 | 1.64% | **0.91%** | $1.01 | $16.62 | 8 |
| **lifetime** | **$62.71** | **3,084** | **224** | **13.77** | 2.01% | 0.91% | $1.01 | $20.33 | **29** |

- **Link CTR fell by half, then recovered part of the way**: 1.40% → 0.71% →
  0.91%. The recovery is the 08-29 creative refresh, and it is real — see below.
  It did not get back to week one.
- **CPM fell 37%** ($26.47 → $16.62) while CTR fell. That is the opposite of the
  textbook "the auction punishes a tired ad" signature, and worth understanding:
  with a fixed $3/day and nobody new to reach, Meta keeps spending by buying
  progressively cheaper impressions against the same people. **The falling CPM is
  a symptom, not relief** — it partly masks the collapse in CPC terms.
- Weekly landing-page views: 11 → 10 → 8.

**Lifetime: 0 add-to-carts, 0 purchases.** Not "few" — zero, every day, on Meta's
own attribution, for all four Marion Court campaigns ($155.66 combined). See
§Attribution for why that number is close to meaningless.

---

## Why the pool is 224 people

The ad set stacks four narrowings and disables every escape hatch.

**1. The custom audience is video-engagement only — despite its name.**
The ad set is called *"MC Retargeting | Video Viewers + Site Visitors"*. The
audience it actually uses (`120250973173480542`, "MC Retargeting") is
`subtype=ENGAGEMENT`, 365-day retention, and its rule is **87 `video_watched`
entries and nothing else.** There is no website rule in it. The name promises
site visitors; the audience does not contain them.

Consequence: `Marion Court | Traffic` has reached **3,831 people** and driven
**193 landing-page views** — and none of that flows into this pool. The feeder
campaign is not feeding this campaign.

**2. Geo:** 15-mile radii on Lancaster, York, Harrisburg, Reading.
**3. Age:** 22–45.
**4. `relationship_statuses: [1]` — declared "Single" only.** The Traffic ad sets
carry no such filter. Meta's own estimator prices this filter on the cold local
population at **1.0–1.2M → 246k–289k, a ~76% cut.**

**5. Every expansion setting is off:**
`targeting_relaxation_types: {lookalike: 0, custom_audience: 0}` and
`targeting_automation: {advantage_audience: 0}`. So when the pool ran dry, Meta
had no permission to drift outward — it could only increase frequency. That is
exactly what the table above shows.

**How much would dropping "Single" actually buy?** Unknown, and smaller than the
76% figure suggests. That number is measured on the *cold* population; the
retargeting pool is video watchers, and Traffic has produced only 433 video
views lifetime. A realistic range is 224 → 400–600, not thousands. **Do not
quote the 76% as if it applied to this audience.**

**A caveat on audience size.** Meta reports this audience as
`approximate_count 1000–1000`, and returns *the same 1000–1000* for every
targeting variant tested — with and without the age cap, the geo, and the Single
filter. It is a floor, not a measurement, and must not be quoted as the audience
size. The only trustworthy figure is the observed one: **224 unique people
reached, plateaued.** The audience's `operation_status` is code 441 ("still
finding people… size will increase as it populates"), which after 15 days is
itself a signal.

---

## The 2026-08-29 creative refresh — it worked, partially

**Corrected 2026-09-02.** The first version of this report said the new creative
"matched the tired one" and bought "days, not conversions." Three more days of
data show that was too strong. Creative is a real lever here — just a small and
capped one.

Same audience, old creative vs new:

| window | creative / audience | CTR | link CTR |
|---|---|---:|---:|
| 08-13 – 19 | original, **fresh** audience | 3.32% | 1.40% |
| 08-20 – 26 | original, tiring | 1.77% | 0.71% |
| 08-27 – 28 | original, tired | 1.31% | 0.79% |
| 08-29 – 09-02 | **new creative, same tired audience** | **1.82%** | **0.98%** |

New creative bought back CTR 1.31% → 1.82% — roughly **a third of the way** to
week one, not the whole way. V2 is genuinely the better ad: link CTR 1.19%
against the original's 0.86%.

The other two-thirds is the audience, and no creative reaches it.

**And two of the three new ads were never actually tested:**

| ad | status | created | spend | impr | reach | freq | CTR | LP views |
|---|---|---|---:|---:|---:|---:|---:|---:|
| MC-RT-STILL-THINKING | Paused | 08-17 | $51.92 | 2,452 | 221 | 11.10 | 2.00% | 23 |
| MC-RT-STILL-THINKING V2 | Active | 08-29 | $9.20 | 588 | 90 | 6.53 | 2.21% | 6 |
| MC-RT-QUANG | Active | 08-29 | $1.04 | 26 | 11 | 2.36 | 0.00% | 0 |
| MC-RT-NO-SCORECARDS | Active | 08-29 | $0.54 | 17 | 11 | 1.55 | 0.00% | 0 |

V2 took 87% of post-refresh spend. The other two have delivered **26 and 17
impressions** — their 0% CTR is *no exposure*, not a verdict. $3/day does not
support three ads in one ad set. This matches the standing caution about swapping
creatives under live retargeting: a new asset does not inherit the old one's
delivery, it competes for a budget too small to split.

**So: more creative is not the bottleneck.** Two already-built ads have never
shipped. Where creative *would* compound is `Marion Court | Traffic`, because the
retargeting audience rule is literally `video_watched` — video views are the only
mechanism that grows this pool. And Traffic is not fatigued either: frequency
flat at 1.96, CTR *rising* 2.59% → 2.82%, LP views 72 → 121 week over week.

---

## Placement: paying 2.4× CPM to reach them on the wrong surface

| | Marion Court Retargeting | Marion Court \| Traffic |
|---|---|---|
| dominant placement | Facebook feed — **57% of spend** | Instagram Stories — **88% of spend** |
| CPM there | **$17.90** | **$7.38** |
| frequency there | **12.17** | 2.54 |
| CTR there | 2.32% | 3.03% |
| cost per LP view (campaign) | **$2.21** | **$0.31** |

The people in this pool are there *because they watched a video* — and those
videos ran overwhelmingly on Instagram Stories. The retargeting ad then chases
them onto Facebook feed at 2.4× the CPM, where it hits them twelve times each.
Traffic buys a landing-page view for **7.1× less**.

---

## Attribution — what any of this can and cannot be measured by

Added 2026-09-02, in answer to "can we attribute revenue to any of these?"

**Short answer: no, not at $21 and six days, and not on the Meta side at all.**

**Meta-side attribution is structurally dead for this event.** Three independent
reasons, each sufficient on its own:

1. The two **Traffic ad sets have `promoted_object: null`** — no pixel, no
   dataset. They can never report a conversion, only clicks and landing-page
   views. (Consistent with the 08-28 §F2 finding; note a `LINK_CLICKS` goal has
   no promoted object by design, so this confirms rather than proves it.)
2. The retargeting ad set optimizes for `PURCHASE` on a **7-day click-through
   window with no view-through**, and has never recorded one.
3. Roughly two-thirds of this event's seats sold on **Eventbrite, which fires
   none of our analytics** — the ~55% blind spot already on record.

So the "0 purchases on $155.66" above is not evidence the ads failed to sell. It
is evidence Meta cannot see the sales. The event has sold ~9 seats.

**GA4-side, the tagging is better than the record says.** Read live 2026-09-02 —
this **supersedes** the 08-28 audit and the standing HANDOFF thread, both of which
say every Marion Court ad shares `utm_content=proof_rsa1` and is hardcoded
`utm_source=Instagram`:

| ad | campaign | `utm_source` | `utm_content` |
|---|---|---|---|
| MC-RT-STILL-THINKING | Retargeting | `Facebook` | `mc_rt_thinking` |
| MC-RT-STILL-THINKING V2 | Retargeting | `Facebook` | `mc_rt_still_thinking` |
| MC-RT-NO-SCORECARDS | Retargeting | `Facebook` | `mc_rt_scorecards` |
| MC-RT-QUANG | Retargeting | `Facebook` | `mc_rt_quang` |
| MC Women - Video Ad (Traffic) | Traffic | `Instagram` | **`proof_rsa1`** |
| MC All Genders - Video Ad (Traffic) | Traffic | `Instagram` | **`proof_rsa1`** |

**All four retargeting ads now carry a distinct `utm_content`** — per-ad GA4
attribution works there. The fix appears to have shipped with the 08-29 creative
build. **The two Traffic ads still share `proof_rsa1`**, so they cannot be told
apart, and `proof_rsa1` is shared with other campaigns' ads account-wide, so that
bucket is not even Marion-Court-specific. All six carry
`eventId=WUaooYvOq0eC0D1QVCvQ`, so GA4 item-scoped data separates the *event*
regardless — which is where the $49.97 / 3 seats figure comes from.

**Per option:**

| option | revenue attributable? | why |
|---|---|---|
| 1. Drop the Single filter | **No** | Same ad, same `utm_content`. Only a date break separates before from after, and 3 new people in 4 days is no sample. |
| 2. Website-visitor audience | **No** | Blocked before it starts (see below), and same problem as 1. |
| 3. Pause the starved ads | **Neutral** | But note they carry `mc_rt_scorecards` / `mc_rt_quang` — a real creative test *is* possible here if ever funded properly. |
| 4. Move budget to Traffic | **Partially** | GA4 sees own-site revenue, but only at campaign level and pooled into the shared `proof_rsa1` bucket. Women vs All-Genders cannot be split. Meta sees nothing. Eventbrite sales invisible. |
| 5. Do nothing | — | Baseline. |

**The measurable version of this question is answerable — at the next event, not
this one.** It needs: a pixel dataset on the Traffic ads, a distinct
`utm_content` per Traffic ad, and `utm_source` set per placement. `url_tags` is
settable only at creative creation, so those fixes mean minting new ads — which
is free to do at the next event's creative build and costly to do mid-flight.

---

## What I did not verify

- `learning_stage_info` came back null, so I make **no claim** about learning phase.
- Cold-audience sizes are Meta's modelled estimates, not measurements.
- Whether the Eventbrite share of this event's seats is exactly two-thirds — the
  6-of-9 split comes from the 08-28 and 09-01 reports, not from a fresh read.
- The venue and ad-set decision stays settled per §3b. This is a delivery
  finding, not a re-opening.

---

## Unit economics — what a landing-page view is worth, and what each channel charges

Added 2026-09-02. This is the section that decides the options below; everything
above is diagnosis.

**A seat is worth ~$16.88.** The Sep 8 event has sold 9 — 6 on Eventbrite
($101.94) and 3 own-site ($49.97) — for $151.91 gross.

**An LP view is worth $0.23–$0.68.** Ads have driven **222 landing-page views**
(193 Traffic + 29 retargeting) on $155.66. The range is the credit assumption:

| credit assumption | LP view → seat | value per LP view |
|---|---:|---:|
| own-site seats only (floor) | 1.35% | **$0.23** |
| all 9 seats credited to ads (ceiling) | 4.05% | **$0.68** |

The ceiling is generous — organic, email and Eventbrite's own marketplace
discovery all contribute seats no ad paid for.

**Now put cost beside it:**

| channel | cost / LP view | break-even conv. rate | ROAS range |
|---|---:|---:|---:|
| `Marion Court \| Traffic` | **$0.31** | **1.84%** | **0.72 – 2.20** |
| `Marion Court Retargeting` | **$2.16** | **12.8%** | **0.10 – 0.32** |

**Traffic needs 1.84% of LP views to become seats to wash its face, and we are
observing between 1.35% and 4.05%** — a coin flip leaning positive.
**Retargeting needs 12.8%.** Nothing converts at 12.8%. It loses money under the
single most generous assumption available to it.

**This is why the creative question is settled.** Even V2 — the best ad in the
retargeting campaign — runs **$1.53 per LP view**, still 2.2–6.8× over what an LP
view is worth. Fixing the creative mix inside that ad set cannot get it above
water. **The channel is priced wrong, not executed wrong.**

**Scale check.** Filling the remaining 21 seats needs 519 LP views at the
optimistic rate, 1,556 at the pessimistic — **$161 to $484 routed through
Traffic.** Roughly $58.50 of budget remains across both campaigns. **The budget is
3–8× short of the room** however it is routed. Optimising the split is worth about
half a seat; the room does not get filled by reallocating $21.

### Projected outcome of each option, 2026-09-02 → 09-08 16:30 (~6.5 days)

Run rates are the last complete week. Seat and revenue columns inherit the
$0.23–$0.68 range above and should be read as order-of-magnitude, not forecast.

| option | LP views | Δ vs doing nothing | Δ expected revenue |
|---|---:|---:|---:|
| **4. Shift retargeting budget to Traffic** | ~175 | **+54** | **+$12 to +$37** |
| 5. Do nothing | ~121 | — | — |
| 3. Pause the two starved ads | ~121 | +0.3 | **+$0.07 to +$0.22** |
| 1. Drop the Single filter | ~126 | +5 | ~$0, possibly negative* |
| 2. Website-visitor audience | ~121 | 0 | $0 — cannot execute |

\* a targeting edit resets learning on a conversion-optimised ad set; with 6.5
days left that can cost more than the extra reach returns.

**Option 5 also has a non-monetary cost:** frequency on the same 224 people goes
from 13.8 to roughly 16.5 by event day.

---

## Options — the ad set runs to 2026-09-08 16:30 (event day), ~$21 more at $3/day

Nothing here is applied. **Note 1 and 4 are alternatives, not a stack**: if the
budget leaves the retargeting ad set, dropping the Single filter does nothing
this week.

**Do now:**

- **4. Move the final week's budget to `Marion Court | Traffic`.** The only option
  with real magnitude: $21 buys **~68 landing-page views** there against ~9 in
  retargeting. Not fatigued, still improving, huge headroom. Caveat: $6 → $9/day
  is +50% and can reset its `LINK_CLICKS` learning — it re-learns in about a day
  at this volume, so make the change **once, today**, not in increments.
- **3. Pause MC-RT-QUANG and MC-RT-NO-SCORECARDS.** Free and certain, concentrates
  what is left on V2, the measurably better ad. A rounding error on $21.

**Housekeeping, not a Sep 8 play:**

- **1. Drop `relationship_statuses: [1]`** so the ad set is not broken next time it
  is used. Expect 224 → 400–600, not thousands, and expect no measurable revenue
  signal from it this week.

**Next event, and this is the valuable one:**

- **2. Connect the funnel's two halves** — a website-visitor rule on "MC
  Retargeting", or a site-visitor audience beside it. Currently blocked: every
  website audience on the account sits at Meta's 20-person floor and one is
  explicitly flagged *too small to use in campaign creation*. 193 LP views cannot
  build a usable pool. **Gated behind the pixel thread already in HANDOFF** — until
  the Traffic ads have a dataset, the site-visitor pool never reaches usable size.
- **Fix the Traffic ads' tagging at the same time** (`utm_content` per ad,
  `utm_source` per placement) — free during a creative build, costly mid-flight.

**Not recommended:**

- **5. Do nothing.** ~$21 to show the same 224 people the ad another five times
  each. Defensible only as a pure frequency play.
