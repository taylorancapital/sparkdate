# Loxleys retargeting was a shell — no audience at all, and a filter that removed 78% of the market

**2026-09-08. T-14, the first day of the playbook's Build phase.** Taylor's call
on 2026-08-30 was to build Loxleys' retargeting *at* this step and not before,
because a retargeting campaign launched at T-30 has an empty audience to
retarget. Today the pool exists. This is what was found when the shell was
opened, what was fixed, and what still blocks launch.

## Four numbers to hold in your head

| | |
|---|---|
| **0** | custom audiences attached to the ad set named `LX Retargeting \| Video Viewers + Site Visitors`, before today |
| **78%** | of the reachable market removed by a `relationship_statuses: [1]` filter nobody put there on purpose — priced live, not estimated |
| **11.7** | Marion Court retargeting's lifetime frequency, for **0 purchases on $103.04** — the precedent this launch has to avoid |
| **1.07** | Loxleys prospecting's daily frequency over the same weeks — the unfiltered pool this retargeting will draw on |

---

## §1 EVIDENCE — the shell was not retargeting

`Loxley's Retargeting` (`120250964028390542`) has existed since 2026-08-17,
PAUSED, `OUTCOME_SALES`, $5.00/day, with one ad set
(`120250964028400542`). Read live this morning, three things were true of it at
once, and all three had to be fixed before the word "retargeting" was accurate:

| | as built | why it matters |
|---|---|---|
| `targeting.custom_audiences` | **empty** | Nothing to retarget. Launching it would have spent the retargeting budget on cold traffic. |
| `flexible_spec` | `[{"relationship_statuses": [1]}]` | Facebook's **Single** status — see §2. |
| ads in the ad set | **zero** | Still true. See §5. |

The website audience `Loxleys Retargeting - Site Visitors`
(`120251194124890542`) had been filling since 2026-08-30 and was attached to
nothing — the orphan condition recorded on 2026-09-02 was still live six days
later.

**The ad set's frozen-at-birth fields were already correct**, which is the one
piece of luck here: `OFFSITE_CONVERSIONS`, pixel `4390442851170732` with
`PURCHASE`, 7-day-click attribution, `advantage_audience: 0`. Those cannot be
edited after creation, so had they been wrong the campaign would have needed a
rebuild at T-14. It did not.

## §2 EVIDENCE — the `Single` filter, priced rather than argued

`flexible_spec: [{"relationship_statuses": [1]}]` keeps only people who publicly
declared "Single" on a profile field most users leave blank and Meta has been
retiring. Measured this morning with Meta's own `delivery_estimate`, holding
geo (Lancaster / York / Harrisburg / Reading, 15mi), age (22–45), gender (all)
and optimization goal (`OFFSITE_CONVERSIONS`) constant:

| targeting | monthly reachable, lower–upper |
|---|---:|
| without the filter | **1,000,000 – 1,200,000** |
| with it, as the ad set was built | **241,700 – 284,400** |

**It removes about 78%.** This is the same field that halved Marion Court's
retargeting pool. Its presence here was almost certainly inherited — the ad set
was created 2026-08-17 in the same batch as Marion Court's, which carries it on
the prospecting side too.

A note on what the estimate can and cannot say: with a custom audience attached,
`delivery_estimate` returns exactly `1000 – 1000` whether the filter is present
or not. That is a non-disclosure floor, not a measurement. **The 78% above is
measured on the underlying population, and the warm pool's true size is not
readable by API at all.**

## §3 MECHANISM — why Marion Court's retargeting failed, and why Loxleys' pool is different

`Marion Court Retargeting` is the only comparable this account has actually run
to completion. Lifetime: **$103.04 spend, 4,743 impressions, 406 unique people
reached, frequency 11.68, 44 landing-page views, 0 purchases.** Two of its four
ads absorbed $97 of that at per-ad frequencies of 7.5 and 11.1.

The daily curve is the mechanism, not the total. Marion Court's retargeting
frequency spiked to 6.19 on day two and never returned to 1 — it settled into a
2.5–4.1 band and stayed there for three weeks, which is what serving the same
few hundred people over and over looks like:

| campaign | days | daily frequency range | lifetime impressions / unique reach |
|---|--:|---|---|
| `Marion Court Retargeting` | 23 | 1.19 – **6.19** (settles 2.5–4.1) | 4,743 / 406 = **11.7** |
| `Loxleys \| Traffic` (prime) | 7 | **1.05 – 1.08** | 2,736 / 2,087 = **1.3** |
| `Loxleys \| Sales` (convert) | 4 | 1.11 – 1.24 | 720 / 483 = **1.5** |

**Loxleys' prospecting has been buying almost entirely fresh people** — a
frequency of 1.07 means nearly every impression went to someone who had not seen
it. That is the pool the retargeting layer now draws on, and it is the condition
Marion Court's never had, for a specific reason: **Loxleys' prospecting ad sets
carry no `Single` filter**, so the pool feeding retargeting was never pre-halved.

What that pool contains, measured: **2,939 video plays, 604 thruplays, 188
landing-page views**, on $27 of lifetime paid spend across both Loxleys
campaigns. That is materially more top-of-funnel than Marion Court's retargeting
ever had, bought for a quarter of the money.

This is not a prediction that Loxleys' retargeting will convert. It is the one
structural difference between it and the campaign that spent $103 for nothing —
and it is why the fix in §2 mattered enough to make before launch rather than
after.

## §4 EVIDENCE — the video audience *can* be built by API; the recorded belief was wrong

The standing note said Loxleys' video-viewer audience could not be created
through the API — that engagement audiences need Page-associated videos and ads
uploaded via `act/advideos` are not, failing with error #2654 — and that it
would have to be built by hand in Ads Manager. **That is refuted.** It was
created by API this morning: `120251341306880542`, ENGAGEMENT, 30-day retention,
`200 This audience is ready for use`, rule verified by read-back to hold exactly
the four Loxleys reels.

Two things had to be right, and neither is documented anywhere obvious:

1. **The right video id.** A dark post's `attachments.target.id` — equivalently
   the creative's *top-level* `video_id` — not the `act/advideos` id sitting in
   `object_story_spec.video_data.video_id`. The four Loxleys ads use only two
   source uploads but four distinct reel ids, so the two fields disagree.
2. **An explicit `subtype: ENGAGEMENT`.** Without it Meta returns a genuinely
   misleading error.

Meta contradicts itself unless that second parameter is present, which is why
this looked impossible:

| attempt | result |
|---|---|
| legacy flat `[{event_name, object_id}]`, no subtype | `1870029` — *"Custom Audience Rule Syntax Is Too Old… too old for Graph API v3.0"* |
| modern `inclusions`/`event_sources` envelope | `1870049` — *"Rule Format Not Available For Video Engagement Audience. Please use previous audience rule format instead."* |
| **legacy flat + `subtype: ENGAGEMENT`** | **created** |

So the format Meta calls "too old" is in fact the required one, and the error
that says so only stops pointing at the syntax once the subtype is supplied.
`scripts/meta-launch-lx-retargeting.js` keeps all three attempts in order so a
future run re-proves this rather than trusting this paragraph.

**One thing found in passing, not acted on:** `MC Retargeting`
(`120250973173480542`) — the audience Marion Court's live retargeting has been
spending against — lists **100 video object_ids, every video the Page has**, not
Marion Court's own. It is a whole-account video-viewer audience wearing an
event-specific name. Loxleys' new one lists four, so its pool is people who
watched a *Loxleys* ad. Whether Marion Court's breadth helped or hurt is not
established here and its event is tonight; this is recorded, not recommended
against.

## §5 DECISION — what changed, what is deliberately still undone, and the exact next step

**Changed today**, both verified by independent read-back after the write:

- Created `Loxleys Retargeting - Video Viewers` (`120251341306880542`) — 3-second
  viewers of all four Loxleys reels, 30-day window per the playbook's §2 lookback rule.
- On ad set `120250964028400542`: dropped `flexible_spec`, attached both the
  video audience and the site-visitor audience. Gender stays all — the playbook's
  zero-gender-ad-set rule — age 22–45, geo unchanged.

**The campaign is still PAUSED, on purpose.** Two things gate launch:

**1. There is no ad.** Loxleys has no retargeting creative and the call on
2026-09-08 was to wait for purpose-made art rather than reuse the convert video.
Nothing else blocks it: the ad set is now correct and the audience is ready.

**2. The budget must not move until the art lands.** Under the playbook's
Build/Close table scaled to Loxleys' $180 run, the ladder computes:

| phase | window | cold | retargeting | total/day |
|---|---|--:|--:|--:|
| Build | 09-08 → 09-14 | $5.11 | $3.40 | $8.51 |
| Close | 09-15 → 09-22 | $3.41 | $6.32 | $9.73 |

Remaining spend under this shape is **$137.41**, *less* than the legacy ladder's
remaining $152.99 — it reallocates rather than adds. But stepping cold down from
its current $9.00/day while retargeting cannot serve would simply remove
$3.89/day from the only campaign that can deliver. The playbook's own
floor-priority tail already says what to do here: **run cold-only for the phase
and hold the retargeting campaign at its existing budget.** So `Loxleys | Sales`
stays at $9.00/day on the legacy ladder until there is an ad to fund.

**The exact next step, once art exists:**

1. Build the ad in ad set `120250964028400542`.
2. Add both legs to `content/paid-campaigns.json` with `playbook: "v2"` and
   `role: "cold"` / `"retargeting"`, sharing `total: 180` — replacing the single
   legacy `LX` entry. Modelled against a scratch registry today; it computes the
   table above and reports `0 ungoverned`.
3. Un-pause the campaign. The 03:00 ladder then steps both legs together.

Until step 2 happens the registry is correct as-is: the ungoverned check only
flags **ACTIVE** campaigns, and this one is paused.

## §6 What I did not verify

- **Whether the video audience has anyone in it.** Meta reports every website
  audience on this account at a flat lower/upper bound of 20 and this new one is
  no more readable. `delivery_status 200` means usable, not populated. The rule
  is verified; the membership is not.
- **Whether 3-second `video_watched` is the right threshold** versus 25%/50% or
  ThruPlay. It is the widest option, chosen because the pool is small and Marion
  Court's failure was pool size. No test distinguishes them on this account.
- **Whether dropping the `Single` filter changes who actually converts.** The 78%
  is a reach measurement, not an outcome one. The account has 6 lifetime
  Meta-attributed purchases total; nothing here is causally provable.
- **Whether Marion Court's whole-Page video audience helped or hurt.** Noted in
  §4, not measured.
- **Loxleys ticket sales.** Not pulled this session — Meta's attributed
  conversions are not sales, and Firestore is the truth. `Loxleys | Sales` shows
  0 Meta-attributed purchases on $8.88, which says little either way at that
  spend.
- **The intraday numbers move.** `Loxleys | Sales` lifetime spend read as $8.82,
  $8.83 and $8.88 across three calls this morning. Figures are as-of 2026-09-08
  morning, not settled.
