# Marion Court Retargeting — a small pool, halved by a filter nobody meant as a filter

**2026-09-01, revised twice. Current as of 2026-09-02.** Source: Meta Marketing
API read live (account `act_1672342180672647`, campaign `120250958681350542`,
ad set `120250958851430542`, audience `120250973173480542`); GA4 from
`Business Plan/files/Night Tasks/ga4-api-utm-content-2026-09-01.csv`.

Figures cover 2026-08-17 (launch) → **2026-09-01 complete**.

> ### Revision history — read this before citing anything
>
> **v1** concluded retargeting was *"priced wrong, not executed wrong"* — a
> structurally overpriced channel. **Withdrawn.**
>
> **v2** concluded the audience contained none of our videos and the two-stage
> design "was never wired up." **Withdrawn, and it was my error** — see §3a. I
> compared each ad's source `video_id` against the audience's `object_id`s.
> Those are different ID spaces. The audience is correctly scoped to Marion
> Court and the pipe works.
>
> **v3 (this one)** restores the plain explanation: the pool is small because
> the top of funnel is small, and `relationship_statuses: [1]` cuts roughly half
> of what does arrive. That was the original read, and the evidence supports it.

Does not re-open the venue/ad-set decision settled in `ANALYTICS_CONTEXT.md` §3b.

---

## 1. The symptom

Cumulative **unique people reached**, expanding window from launch:

| through | spend | impressions | unique reach | frequency | new people | $ per new person |
|---|---:|---:|---:|---:|---:|---:|
| 08-19 | $15.17 | 573 | 153 | 3.75 | — | $0.10 |
| 08-22 | $27.07 | 1,027 | 189 | 5.43 | +36 | $0.33 |
| 08-25 | $41.53 | 1,784 | 210 | 8.50 | +21 | $0.69 |
| 08-28 | $51.07 | 2,369 | 221 | 10.72 | +11 | $0.87 |
| 09-01 | $62.71 | 3,084 | **224** | **13.77** | **+3** | **$3.88** |

The last $11.64 reached three new people. Weekly reach *falls* — 153 → 113 → 103
— and CPM falls 37% while CTR falls, because with $3/day and nobody new to reach
Meta keeps spending by buying cheaper impressions against the same people.

**Lifetime: 0 add-to-carts, 0 purchases** on Meta's attribution (see §6 — that
number means less than it appears).

## 2. Weekly, in non-overlapping buckets

The nightly CSVs can't show this: rolling 7-day windows, no reach or frequency
column at all.

| week | spend | impr | reach | freq | CTR | link CTR | CPC | CPM | LP views |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 08-13 – 19 | $15.17 | 573 | 153 | 3.75 | 3.32% | 1.40% | $0.80 | $26.47 | 11 |
| 08-20 – 26 | $29.32 | 1,415 | 113 | 12.52 | 1.77% | 0.71% | $1.17 | $20.72 | 10 |
| 08-27 – 09-01 | $18.22 | 1,096 | 103 | 10.64 | 1.64% | 0.91% | $1.01 | $16.62 | 8 |
| **lifetime** | **$62.71** | **3,084** | **224** | **13.77** | 2.01% | 0.91% | $1.01 | $20.33 | **29** |

---

## 3. Why the pool is 224

### 3a. Not because it's disconnected — my v2 claim was wrong

The `MC Retargeting` audience (`subtype=ENGAGEMENT`, 365d, prefilled 08-17) has a
rule of 88 bare entries, `{"event_name":"video_watched","object_id":<id>}`, with
no completion threshold. **All 85 readable ones are Marion Court creatives dated
2026-08-17 → 2026-08-29** — including `Marion_Court_Women_Ads.mov` (08-22, when
Traffic launched) and "Tue, Sep 8 · Marion Court Room" (08-29, the V2 refresh).
The audience is correctly scoped, and it is being kept current.

**The trap that produced the wrong finding, so nobody repeats it:** an ad
creative's `object_story_spec.video_data.video_id` is the **source upload**.
Meta registers `video_watched` engagement against the **delivered rendition** —
the auto-cropped 4:5 and 9:16 versions, which appear in the list by name. Same
content, different IDs. **Comparing creative `video_id` to audience `object_id`
will always report zero matches and means nothing.**

### 3b. Because the top of funnel is small, and then halved

Marion Court video engagement, lifetime, both campaigns:

| | 3-sec views | ThruPlay | 100% |
|---|---:|---:|---:|
| Traffic | 438 | 309 | 317 |
| Retargeting | 133 | 75 | 77 |
| **total** | **571** | **384** | **394** |

571 view-actions ≈ **400–500 unique watchers**. Meta served **224** of them after
the ad set's filters:

- **`relationship_statuses: [1]` — declared "Single" only.** The Traffic ad sets
  use no such filter. Meta prices it on the *cold* local population at 1.0–1.2M →
  246k–289k, **a ~76% cut**. This is the largest non-load-bearing narrowing.
- Geo: 15-mile radii on Lancaster, York, Harrisburg, Reading. Age 22–45.
- `targeting_relaxation_types: {lookalike: 0, custom_audience: 0}` and
  `targeting_automation: {advantage_audience: 0}` — no permission to drift out.

**Not resolved:** whether 224 is pool-limited or delivery-limited. Meta reports
the audience at `approximate_count 1000–1000` and returns *the same* 1000–1000
for every targeting variant tested, so it is a floor, not a measurement. Reach is
what Meta *served*, not what exists. Both readings are consistent with the data.

### 3c. The ad set is not targeting women

`genders: [1, 2]` — both. `relationship_statuses` is a relationship filter, not a
gender one. **Nothing in this campaign has ever targeted women.** Its female skew
in *spend* (62.5%) is Meta's delivery choice, and its output skews male anyway —
see §5.

---

## 4. The 08-29 creative refresh worked, partially

| window | creative / audience | CTR | link CTR |
|---|---|---:|---:|
| 08-13 – 19 | original, **fresh** audience | 3.32% | 1.40% |
| 08-20 – 26 | original, tiring | 1.77% | 0.71% |
| 08-27 – 28 | original, tired | 1.31% | 0.79% |
| 08-29 – 09-02 | new creative, same tired pool | **1.82%** | **0.98%** |

About a third of the way back to week one. V2 is the better ad (link CTR 1.19%
vs 0.86%). **Two of the three new ads were never tested** — MC-RT-QUANG delivered
26 impressions, MC-RT-NO-SCORECARDS 17. Their 0% CTR is no exposure, not a
verdict. $3/day does not support three ads in one ad set.

---

## 5. Gender — female in cost, male in result

| | Retargeting | Traffic |
|---|---:|---:|
| share of spend on women | 62.5% | **91.8%** |
| share of LP views from women | 44.8% | **95.9%** |
| female CTR | 1.67% | **2.91%** |
| female CPM | $23.33 | $6.84 |
| **cost per female LP view** | **$3.02** | **$0.30** |

Retargeting spends the majority on women but takes only 44.8% of its LP views
from them, because women in this pool click at 1.67% against men's 2.42%. Meta
charges a 39% CPM premium for them there. Traffic delivers a female LP view for
**10.1× less** — and its skew is deliberate: the `Female | Traffic` ad set
(`genders: [2]`) takes $51.90 of $60.30 and produces 173 of 194 LP views.

---

## 6. Attribution — 349 sessions, zero measured revenue

| ad tag | sessions | key events | revenue |
|---|---:|---:|---:|
| `proof_rsa1` (both Traffic ads) | 326 | 0 | $0 |
| `mc_rt_still_thinking` / `_quang` / `_scorecards` / `_thinking` | 23 | 0 | $0 |
| **all Marion Court ads** | **349** | **0** | **$0** |

**The measurement works** — `Augweek2_lancaster` reads 350 sessions → 13 key
events → $109.96, i.e. **$0.31/session** on the same LP and tag structure.
Marion Court reads $0.00.

Meta is independently blind: Traffic ad sets carry `promoted_object: null` (no
pixel dataset); the retargeting ad set optimises for `PURCHASE` on a 7-day click
window and has never recorded one; ~two-thirds of seats sold on Eventbrite, which
fires none of our analytics. **$0 is not proof the ads sold nothing — it is proof
we cannot tell.**

Tagging: all four retargeting ads now carry distinct `utm_content` and
`utm_source=Facebook`. The two Traffic ads still share `proof_rsa1` and hardcode
`utm_source=Instagram`, so Women vs All-Genders cannot be split.

---

## 7. Unit economics

A seat is worth **~$16.88** (9 sold, $151.91). Ads have driven 222 LP views on
$155.66, so an LP view is worth **$0.00–$0.68** — the floor is zero because GA4
measures no ad-driven revenue at all, and the ceiling credits ads with every seat
including Eventbrite's.

| channel | cost / LP view | cost / **female** LP view | break-even conv. rate |
|---|---:|---:|---:|
| `Marion Court \| Traffic` | $0.31 | **$0.30** | 1.84% |
| `Marion Court Retargeting` | $2.16 | **$3.02** | **12.8%** |

**Scale check.** Filling the remaining 21 seats needs 519–1,556 LP views —
**$161–$484 through Traffic** — against roughly $58.50 of budget left. **The
budget is 3–8× short of the room** however it is routed.

---

## 8. Modelled: raise top-of-funnel, widen retargeting, target women

The scenario asked for on 2026-09-02: Traffic to $10/day, drop
`relationship_statuses`, and set retargeting to `genders: [2]`. Remaining window
~6 days. Run rates from the last complete week; treat pool figures as
order-of-magnitude.

| | now | scenario |
|---|---:|---:|
| Traffic budget | $6/day | **$10/day** |
| new video views bought | ~260 | **~430** |
| unique pool entrants added | ~200 | **~340** |
| pool by 09-08 | ~450 | **~800** |
| servable after filters | 224 | **~400 women** |
| retargeting frequency | 13.77 | **~2.5** |
| retargeting $/LP view | $2.16 | **~$1.20** |
| total LP views, both campaigns | ~139 | **~209** |

**The mechanism that matters is frequency collapsing from 13.8 to ~2.5**, because
there are finally enough people to spread across. CTR should recover toward week
one's 1.40% link CTR on genuinely fresh eyes.

Retargeting still does not clear the $0.00–$0.68 bar at ~$1.20 — but it moves
from 3–9× over value to ~2×, against a pool that compounds rather than one being
re-served. **This is the version of the two-stage design that has never actually
been run.**

**The two targeting changes must go together.** Dropping Single widens; setting
`genders: [2]` roughly halves. Doing only the gender change would make the pool
smaller, not larger.

---

## 9. What I did not verify

- Whether 224 is pool-limited or delivery-limited (§3b).
- `learning_stage_info` returns null — no claim about learning phase. The ad set
  has recorded zero purchase events against a ~50/week requirement, so there is
  effectively no learning state a targeting edit could destroy.
- Prefill on **rule edit** is undocumented; prefill at **creation** is confirmed
  here (audience created 2026-08-17 20:24 ET, campaign reached 115 unique people
  that same day). If an audience is rebuilt, create a new one rather than editing.
- Whether the ~⅓ Eventbrite : own-site seat split is exact.
- Cold-audience sizes are Meta's modelled estimates.

---

## 10. What to do — the ad set runs to 2026-09-08 16:30

Nothing here is applied. Nothing has been changed in the ad account.

**The two targeting changes, together** (§8): drop `relationship_statuses: [1]`,
set `genders: [2]`. Free, no learning cost, and they are the difference between
re-serving 224 people and reaching ~400 women.

**Raise Traffic.** It is not fatigued (frequency flat at 1.96, CTR *rising*
2.59% → 2.82%), buys a female LP view 10.1× cheaper, and — since the pipe does
work — every video view it buys lands in the retargeting pool. At $10/day the
*marginal* LP view runs ~$0.58, so the increment is roughly break-even on its
own; the pool it builds is the reason to do it anyway. Make the budget change
**once**, not in increments.

**Pause MC-RT-QUANG and MC-RT-NO-SCORECARDS.** They cannot be tested at $3/day
inside a three-ad set.

**Do not rebuild the audience.** It is correctly scoped and current. v2 of this
report said otherwise and was wrong.

**Temper the expectation.** The budget stays 3–8× short of the room, and six days
is thin. The durable win is that the funnel finally runs as designed.

**The bigger question.** Traffic buys sessions at $0.185; `Augweek2_lancaster`
converted comparable sessions at $0.31 each, which would be ROAS 1.7. Marion
Court converts at zero measured. **The traffic is cheap enough to work; something
after the click is not converting** — the offer, the LP, or the Eventbrite
handoff. An outbound-click key event on the LP is the cheapest way to find out,
and it is a better question than how to split $21.
