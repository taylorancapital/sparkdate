# Marion Court Retargeting — the pool was never connected to the campaign feeding it

**2026-09-01, substantially revised 2026-09-02.** Source: Meta Marketing API,
read live (account `act_1672342180672647`), campaign `120250958681350542`
"Marion Court Retargeting", ad set `120250958851430542`, custom audience
`120250973173480542`. GA4 figures from
`Business Plan/files/Night Tasks/ga4-api-utm-content-2026-09-01.csv`.

Figures cover 2026-08-17 (launch) through **2026-09-01 complete**.

> **Revision note.** The first version of this report concluded that retargeting
> was *"priced wrong, not executed wrong"* — structurally overpriced as a
> channel. **That was measuring a broken pipe.** The two-stage design (Traffic
> casts a wide net → retargeting harvests it) is sound and has never actually
> been tested, because the audience does not contain any video the campaign is
> running. §3 is the corrected root cause; the economics in §7 are real but are
> the economics of a sealed pool, not of retargeting.

This does not re-open the venue/ad-set decision `ANALYTICS_CONTEXT.md` §3b marks
settled on 2026-08-25.

---

## 1. The symptom: impressions climbed, reach stopped

Cumulative **unique people reached**, expanding window from launch:

| through | spend | impressions | unique reach | frequency | new people | $ per new person |
|---|---:|---:|---:|---:|---:|---:|
| 08-19 | $15.17 | 573 | 153 | 3.75 | — | $0.10 |
| 08-22 | $27.07 | 1,027 | 189 | 5.43 | +36 | $0.33 |
| 08-25 | $41.53 | 1,784 | 210 | 8.50 | +21 | $0.69 |
| 08-28 | $51.07 | 2,369 | 221 | 10.72 | +11 | $0.87 |
| 09-01 | $62.71 | 3,084 | **224** | **13.77** | **+3** | **$3.88** |

The last $11.64 reached three new people — a 39× rise in the cost of a
newly-reached person. This is arithmetic on unique-user counts, not a rate on a
small sample, and it is invisible in the nightly CSVs, which are rolling 7-day
windows carrying no reach or frequency column at all.

## 2. Delivery, in non-overlapping weeks

| week | spend | impr | reach | freq | CTR | link CTR | CPC | CPM | LP views |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 08-13 – 08-19 | $15.17 | 573 | 153 | 3.75 | 3.32% | 1.40% | $0.80 | $26.47 | 11 |
| 08-20 – 08-26 | $29.32 | 1,415 | 113 | 12.52 | 1.77% | 0.71% | $1.17 | $20.72 | 10 |
| 08-27 – 09-01 | $18.22 | 1,096 | 103 | 10.64 | 1.64% | 0.91% | $1.01 | $16.62 | 8 |
| **lifetime** | **$62.71** | **3,084** | **224** | **13.77** | 2.01% | 0.91% | $1.01 | $20.33 | **29** |

**Weekly reach falls** — 153 → 113 → 101. A pool being topped up does not shrink.
**CPM falls 37% while CTR falls**, the opposite of the textbook auction-punishment
signature: with a fixed $3/day and nobody new to reach, Meta keeps spending by
buying progressively cheaper impressions against the same people.

---

## 3. Root cause — the audience is an allow-list of 88 videos, none of them ours

**This supersedes the first version's "the audience has no website rule"
diagnosis.** That was true but not the live defect, and it pointed at a fix
(add site visitors) that is blocked anyway.

`MC Retargeting` (`120250973173480542`) is `subtype=ENGAGEMENT`, 365-day
retention, prefilled at creation on 2026-08-17. Its rule names **88 specific
video `object_id`s**. Video-engagement audiences do not adopt new videos
automatically — the IDs are an allow-list.

Every creative built for this event was uploaded fresh. **None of their video IDs
is in that list:**

| ad | campaign | `video_id` | in the audience? |
|---|---|---|---|
| MC Women - Video Ad (Traffic) | Traffic | 1082861517651493 | **no** |
| MC All Genders - Video Ad (Traffic) | Traffic | 2188897505005440 | **no** |
| MC-RT-STILL-THINKING | Retargeting | 1119512250399584 | **no** |
| MC-RT-STILL-THINKING V2 | Retargeting | 1740771030478630 | **no** |
| MC-RT-NO-SCORECARDS | Retargeting | 1747594286277775 | **no** |
| MC-RT-QUANG | Retargeting | 1585560229896313 | **no** |

The growth curves are the confirmation:

| through | retargeting pool | Traffic reach | Traffic video views |
|---|---:|---:|---:|
| 08-22 | 189 | 46 | 5 |
| 08-25 | 210 | 1,595 | 95 |
| 08-28 | 221 | 2,459 | 254 |
| 09-01 | **224** | **3,916** | **436** |

**Traffic reached 3,916 people and produced 436 video views; the pool grew by
35** — and those are Meta reaching further into the pre-existing prefilled set,
not new entrants. The net is cast. It drains into a bucket that is not under it.

This explains every symptom above: the plateau, the *falling* weekly reach (a
sealed set with 365-day retention aging out), the frequency blow-out, and the
ad set's aspirational name ("Video Viewers + Site Visitors").

**The two-stage design is sound and has never been tested.**

### Secondary narrowings, on top of the sealed pool

- `relationship_statuses: [1]` — declared "Single" only. The Traffic ad sets use
  no such filter. Meta prices it on the *cold* local population at 1.0–1.2M →
  246k–289k, a ~76% cut. It will cut whatever finally arrives once the pipe is fixed.
- Geo: 15-mile radii on Lancaster, York, Harrisburg, Reading. Age 22–45.
- `targeting_relaxation_types: {lookalike: 0, custom_audience: 0}` and
  `targeting_automation: {advantage_audience: 0}` — no permission to drift outward.

**Audience size is not readable.** Meta reports `approximate_count 1000–1000` and
returns the *same* 1000–1000 for every targeting variant tested. It is a floor.
The only trustworthy figure is observed reach: **224, plateaued.**

---

## 4. The 2026-08-29 creative refresh worked, partially

**Corrected from the first version**, which said the new creative "matched the
tired one." Three more days of data show otherwise.

| window | creative / audience | CTR | link CTR |
|---|---|---:|---:|
| 08-13 – 19 | original, **fresh** audience | 3.32% | 1.40% |
| 08-20 – 26 | original, tiring | 1.77% | 0.71% |
| 08-27 – 28 | original, tired | 1.31% | 0.79% |
| 08-29 – 09-02 | **new creative, same sealed pool** | **1.82%** | **0.98%** |

New creative bought back CTR 1.31% → 1.82% — about a third of the way to week
one. V2 is the better ad (link CTR 1.19% vs 0.86%). The other two-thirds is the
sealed pool, which no creative reaches.

Two of the three new ads were never tested: **MC-RT-QUANG delivered 26
impressions and MC-RT-NO-SCORECARDS 17.** Their 0% CTR is no exposure, not a
verdict. $3/day does not support three ads in one ad set.

---

## 5. Gender — the retargeting pool is female in cost and male in result

Tested because the hypothesis was that retargeting is female-biased and therefore
worth a premium. **It is the other way round.**

| | Retargeting | Traffic |
|---|---:|---:|
| share of spend on women | 62.5% | **91.8%** |
| share of LP views from women | 44.8% | **95.9%** |
| female CTR | 1.67% | **2.91%** |
| female CPM | $23.33 | $6.84 |
| **cost per female LP view** | **$3.02** | **$0.30** |

Retargeting *spends* the majority on women, so by spend it looks female-weighted
— but those women click at 1.67% against men's 2.42%, so its **output skews male
(55.2% of LP views).** Meta charges a 39% CPM premium for the women it does
reach there. Traffic delivers a female landing-page view for **10.1× less.**

Traffic's female skew is deliberate: the `Marion Court | Female | Traffic` ad set
takes $51.90 of the campaign's $60.30 and produces 173 of its 194 LP views.

---

## 6. Attribution — 349 ad-driven sessions, zero measured revenue

GA4 `utm_content`, through 2026-09-01. The per-ad `mc_rt_*` tags added in the
08-29 build make this readable for the first time:

| ad tag | sessions | key events | revenue |
|---|---:|---:|---:|
| `proof_rsa1` (both Traffic ads) | 326 | 0 | $0 |
| `mc_rt_still_thinking` (V2) | 10 | 0 | $0 |
| `mc_rt_quang` | 5 | 0 | $0 |
| `mc_rt_scorecards` | 4 | 0 | $0 |
| `mc_rt_thinking` | 4 | 0 | $0 |
| **all Marion Court ads** | **349** | **0** | **$0** |

**The measurement is not broken.** `Augweek2_lancaster` reads 350 sessions → 13
key events → $109.96, i.e. **$0.31 revenue per session** on the same landing page
and tag structure. Marion Court reads $0.00.

Meta's side is independently blind: the Traffic ad sets carry
`promoted_object: null` (no pixel dataset), the retargeting ad set optimises for
`PURCHASE` on a 7-day click window and has never recorded one, and roughly
two-thirds of this event's seats sold on Eventbrite, which fires none of our
analytics. So $0 measured is **not** proof the ads sold nothing — the Eventbrite
path is genuinely invisible. It is proof we cannot tell.

**Tagging status, correcting the standing HANDOFF thread:** all four retargeting
ads now carry a distinct `utm_content` and `utm_source=Facebook`. The two Traffic
ads still share `proof_rsa1` and hardcode `utm_source=Instagram`, so Women vs
All-Genders cannot be split. `url_tags` is settable only at creative creation.

---

## 7. Unit economics — real numbers, but they measure a sealed pool

A seat is worth **~$16.88** (9 sold, $151.91 across Eventbrite and own-site). Ads
have driven 222 landing-page views on $155.66.

| channel | cost / LP view | cost / **female** LP view | break-even conv. rate |
|---|---:|---:|---:|
| `Marion Court \| Traffic` | $0.31 | **$0.30** | 1.84% |
| `Marion Court Retargeting` | $2.16 | **$3.02** | **12.8%** |

**Read this correctly.** Retargeting's 12.8% break-even is what it costs to
re-serve 224 sealed people, not what retargeting costs as a strategy. The number
is real; the conclusion the first version drew from it — that the channel is
structurally overpriced — was not.

**Scale check, unchanged.** Filling the remaining 21 seats needs 519–1,556 LP
views, i.e. **$161–$484 through Traffic**, against roughly $58.50 of budget left.
**The budget is 3–8× short of the room** however it is routed. No option below
changes that.

---

## 8. What I did not verify

- Whether the ~1/3 Eventbrite:own-site seat split is exact — it comes from the
  08-28 and 09-01 reports, not a fresh read.
- `learning_stage_info` returns null, so no claim about learning phase. Note the
  ad set has recorded zero purchase events ever against a ~50/week requirement,
  so there is effectively no learning state a targeting edit could destroy —
  **correcting the first version's "a targeting edit may go net-negative."**
- Cold-audience sizes are Meta's modelled estimates.
- ~~Whether adding video IDs to a live audience backfills historical viewers.~~
  **Resolved 2026-09-02 — see §8b. The earlier claim that "Meta documents that it
  does" was wrong.**

---

## 8b. Prefill: create a new audience, do not edit the existing one

**This corrects an earlier line in this report** which said Meta documents that
engagement audiences backfill on rule edit. It does not.

**Editing an existing audience — not supported, do not rely on it.** Meta's
Engagement Custom Audiences guide describes prefill only at creation: *"When you
first create this audience, Facebook prefills the audience with a list of people
who already engaged…"* On the update endpoint `rule` **is** writable, but
`prefill` is not an accepted parameter there and nothing documents that changing
the rule re-runs it. Status code `442` ("Your Custom Audience could not be
prefilled") implies prefill is a discrete creation-time operation with its own
state. Several practitioner write-ups claim engagement audiences never backfill
at all, which contradicts the official docs on the creation case — treat them as
unreliable on this nuance in both directions.

**Creating a new audience — confirmed, on this account:**

| fact | value |
|---|---|
| `MC Retargeting` created | **2026-08-17, 20:24 America/New_York** |
| `data_source.creation_params` | `{"prefill":"true"}` |
| campaign unique reach on 2026-08-17 | **115 people** |

115 unique people reached inside the ~3.5 hours between audience creation and
midnight. No one watched 88 older videos in that window. **Prefill pulled
historical viewers, and it worked here.**

**Consequence for §9:** the fix is certain if you *create* rather than *edit*,
and a prefilled audience is populated at creation rather than filling up over
days — so it can plausibly help before 09-08, which this report previously
hedged against.

---

## 9. What to do — the ad set runs to 2026-09-08 16:30

Nothing here is applied.

**Do first, because it is free and it is the actual defect:**

- **Connect the pipe — by creating a new audience, not editing this one** (§8b).
  Build it as **Page / Instagram-account engagement**, not a video-ID list. That
  captures video views without naming individual videos, so **it never goes stale
  again** — which is the actual bug, not just this instance of it — and prefill
  populates the full 365-day window at creation, so it inherits Traffic's 436
  video views immediately rather than starting empty. One new audience and an
  ad-set swap; no creative rebuild. Editing the existing audience's rule is a bet
  on undocumented behaviour — don't.
- **Drop `relationship_statuses: [1]`**, which would otherwise cut ~76% of
  whatever finally arrives. No learning cost (§8).

**Then, for the last six days:**

- **Fund Traffic, and note the case is now stronger than the first version
  allowed.** Once the pipe is connected, Traffic spend does double duty — ~65
  video views/day stops evaporating and starts accruing. Traffic is not fatigued
  (frequency flat at 1.96, CTR *rising* 2.59% → 2.82%) and buys a female LP view
  10.1× cheaper. At $10/day the *marginal* LP view costs ~$0.58 under base
  assumptions, so the increment is roughly break-even — worth measuring by running
  it 48 hours and reading the actual CPL, which is worth more than the $27.
- **Pause MC-RT-QUANG and MC-RT-NO-SCORECARDS**, or give them their own budget.
  They cannot be tested at $3/day inside a three-ad set.

**Timing, revised by §8b.** A prefilled audience is populated at creation, not
over days, so this can plausibly help before 09-08 — the earlier version of this
report hedged against that and was wrong to. Temper it anyway: 436 video views is
a few hundred people before the geo/age/Single cuts, so the pool roughly
doubles-to-triples rather than transforms, and the budget stays 3–8× short of the
room. **The durable win is that it stops going stale for every event after this
one.**

**The bigger question this raises.** Traffic buys sessions at $0.185 and
`Augweek2_lancaster` converted comparable sessions at $0.31 each. At that rate
Marion Court Traffic would run ROAS 1.7. It runs at zero measured instead. The
traffic is cheap enough to work; something after the click is not converting —
the offer, the LP for this event, or the Eventbrite handoff. That is a
hypothesis, and a better question than how to split $21. Making the Eventbrite
handoff measurable (an outbound-click key event on the LP) would be the cheapest
way to start answering it.
