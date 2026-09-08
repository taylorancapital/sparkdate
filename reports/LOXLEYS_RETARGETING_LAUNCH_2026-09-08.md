# Loxleys retargeting was a shell — no audience at all, and a filter that removed 78% of the market

**2026-09-08. T-14, the first day of the playbook's Build phase.** Taylor's call
on 2026-08-30 was to build Loxleys' retargeting *at* this step and not before,
because a retargeting campaign launched at T-30 has an empty audience to
retarget. Today the pool exists. This is what was found when the shell was
opened, what was fixed, and the one decision left.

**Updated later the same day:** the purpose-made retargeting creative landed at
08:58 and the ad is built. The only thing still outstanding is the budget flip,
which moves real money on a live campaign — see §5.

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
| ads in the ad set | **zero** | Fixed later the same day, once the art landed — see §5. |

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

`flexible_spec: [{"relationship_statuses": [1]}]` is Facebook's **Single**
status. Relationship status is *optional self-declared profile data*, so the
field selects "people who publicly declare a relationship status on Facebook" —
a behavioural slice, not a demographic one. Measured this morning with Meta's own
`delivery_estimate`, holding
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

**A claim this report made in its first version, now retracted.** It said Meta
"has been retiring" this field. That is **false**, and was inherited from a
memory file rather than checked. Meta's 2022 purge removed *sensitive*
detailed-targeting categories — health, sexual orientation, religion, politics
— and relationship status was not among them; it remains live core demographic
targeting in 2026. Two further claims in the same sentence ("a field most users
leave blank", "skews to heavy, long-tenured users") are **unverified**: an 80%
cut is equally consistent with "most people don't declare" and with "most
declarers aren't single", and the reach number cannot separate them. **The
measured 78-80% is the entire case against the filter, and it stands on its
own** — two independent `delivery_estimate` reads, 09-04 and 09-08. No decision
here depended on the deprecation story, but it was stated as fact and read as one.

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

## §5 DECISION — what changed, and the one decision left

**Changed today**, each verified by independent read-back after the write:

- Created `Loxleys Retargeting - Video Viewers` (`120251341306880542`) — 3-second
  viewers of all four Loxleys reels, 30-day window per the playbook's §2 lookback rule.
- On ad set `120250964028400542`: dropped `flexible_spec`, attached both the
  video audience and the site-visitor audience. Gender stays all — the playbook's
  zero-gender-ad-set rule — age 22–45, geo unchanged.
- Built the ad **`LX-RT-PATIO`** (`120251342754360542`, creative
  `1570774961210484`) from `LX-RETARGETING-CONVERT_feed_portrait.mp4`, the
  purpose-made art delivered at 08:58. Six read-back checks pass: right ad set,
  exact `url_tags`, no empty UTM segment, video attached, pixel in
  `tracking_specs`, not active. Meta has it `IN_PROCESS` — ad review.
- Migrated the registry: the single legacy `LX` entry in
  `content/paid-campaigns.json` is now two `playbook: "v2"` entries, `role`
  `cold` and `retargeting`, sharing one `total: 180`. `--all` reports
  **0 ungoverned**.

**Copy.** Rendered from brand.json's own `caption_templates.retargeting.convert`
template and event facts rather than retyped, so a price change cannot leave a
stale figure in an ad:

> You looked at Loxleys.
>
> Tuesday, September 22. Loxleys, patio bar, Lancaster, PA. Doors 6:30 PM. $29.99.
>
> Still time.

$29.99 is the regular price, correct because early bird ended 2026-09-07 — the
script derives which price applies from `early_bird_through` rather than
hardcoding it, because brand.json's own LX `open_issues` calls this the "PRICE
TRAP". `utm_content` is `lx_rt_patio`: three segments, no phase segment, so the
ad keeps one GA4 row across convert and close. Built through `scripts/ad-utm.js`,
which throws on a bad slug — that is the guard that was missing when
`tl2__helesha` shipped into a field frozen at creation. No 2-for-1 line;
brand.json restricts that copy to female ad sets and the script asserts it.

### The one decision left: the budget flip

Nothing is un-paused and no budget has moved. Going live means:

| campaign | now | §8 Build | §8 Close (09-15) |
|---|--:|--:|--:|
| `Loxleys \| Sales` (cold) | $9.00/day | **$5.11** | $3.41 |
| `Loxley's Retargeting` | paused, $5.00 set | **$3.40** | $6.32 |
| total | $9.00 | **$8.51** | $9.73 |

Remaining spend across both legs is **$137.41** against the legacy ladder's
remaining **$152.99** — it reallocates and slightly reduces. But it steps a
*currently serving* campaign down 43%, which is a human's call, not a script's.
Three actions, in order: `node scripts/meta-budget-ladder.js --all --execute`,
then un-pause the campaign, then un-pause the ad. The 03:00 ladder handles every
night after that.

## §6 GAP — nothing in the playbook would have caught this filter

Asked directly on 2026-09-08 whether §8 covers targeting filters. **It does not.**
`relationship_statuses` appears **zero times** in
`reports/ADS_OBJECTIVE_GAP_ANALYSIS_2026-09-06.md` and zero times in
`reports/META_AD_LADDER_PLAYBOOK.md`. §8 pins lead time, phase windows, the
cold:retarget split, gender, geography and budget — and says nothing about any
other demographic filter. So the next event would inherit the same field the same
silent way this one did.

**Proposed rule, for review rather than applied unilaterally:**

> **No demographic filter beyond age and geography, on any ad set, either role,
> any phase.** `flexible_spec` stays empty. Age 22–45 and the event's market are
> the only audience constraints a cold ad set carries; a retargeting ad set adds
> its custom audiences and nothing else.

Why it belongs next to §8.3's gender rule rather than as a footnote:

- **Measured, twice, independently.** The filter costs 78–80% of reachable
  audience — Marion Court 09-04, Loxleys retargeting 09-08, both Meta's own
  `delivery_estimate`.
- **It is a bigger version of the failure §8.3 already bans.** §8.3 removes
  gender ad sets partly because a restricted, PURCHASE-optimized ad set at this
  account's volume cannot find enough qualifying impressions to spend its budget.
  A filter cutting 78% rather than roughly 50% fails the same way, harder — and
  it compounds, because it sits on the prospecting ad sets that *fill* the
  retargeting pool.
- **It is not a demographic.** Relationship status is optional self-declared
  profile data, so it selects for the act of declaring, not for being single.
- **The failure mode is silence.** This one was inherited from an 08-17 batch and
  sat unnoticed for three weeks on a campaign nobody had opened. It was found by
  reading the live ad set, not by any check.

**The detection half matters more than the rule half.** The budget ladder already
proves the pattern: an ACTIVE campaign in neither registry list prints
`UNGOVERNED` and exits non-zero, so a missing entry cannot be silent. The
equivalent here is one assertion — no live ad set carries a non-empty
`flexible_spec` — in `scripts/meta-ads-review.js` or the ladder's `--check`.
**Not built.** It is a rule change plus a new check, and both are Taylor's call.

## §7 NOT VERIFIED — what I did not check

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
