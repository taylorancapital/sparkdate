# Loxleys link clicks halved in two days: today's half is the ladder's planned cut, the slide before it is one ad wearing out (2026-09-11)

**This report changes nothing on the account.** Taylor: "Dismal link clicks on
loxleys over the last 2 days" (the Meta campaign). Every number below was read
live from the Marketing API tonight, 2026-09-11 ~22:40 EDT, plus the account's
own change log (`/act_…/activities`), the 03:00 ladder's log, and the Firestore
`tickets` collection via the REST API. The retargeting launch write-up
(`reports/LOXLEYS_RETARGETING_LAUNCH_2026-09-08.md`) is the baseline this
picks up from.

The short version: **link clicks across both Loxleys campaigns went 27 → 22 →
17 → 6 from 09-08 to today.** Today's drop is mostly money: the budget ladder
cut the cold campaign from $9.00 to $5.11 a day at 03:00 this morning, which is
the v2 playbook's Build-phase rate and was planned. The slide *before* today,
at a flat $9.00, is not money. It is click-through decaying on the male ad
(4.7% → 0.4% in four days) while the female ad held near 2.5%, and the
retargeting ad going from 5 clicks to 1 a day as its ~250-person pool passes
frequency 3, the line the launch report said to watch. Sales are unaffected so
far: 8 paid tickets at T-11, mid-pack against past events at the same point,
and 6 of the 8 bought on Eventbrite where Meta's pixel cannot see them.

---

## Four numbers

| | |
|---|---:|
| Link clicks, both Loxleys campaigns, 09-10 + 09-11 vs 09-08 + 09-09 | **23 vs 49** |
| Male cold ad's link click-through, 09-08 → 09-11 | **4.7% → 0.4%** |
| Cold campaign daily budget after this morning's ladder run (was $9.00) | **$5.11** |
| Paid Loxleys tickets at T-11 (past events at T-14: 2 / 13 / 7 / 6 / 4) | **8** |

---

## EVIDENCE — what actually dropped, day by day

Two campaigns are live for Loxleys: `Loxleys | Sales` (cold, two ad sets, one
video ad each, OUTCOME_SALES, budget on the campaign) and `Loxley's Retargeting`
(one ad set, `LX-RT-PATIO`, $3.40/day since 09-08). Both are ACTIVE, neither
carries an `issues_info`, no ad is in review or disapproved, and today's hourly
breakdown shows the cold campaign delivering every hour from 00:00 to 22:00.
Nothing is switched off.

**`Loxleys | Sales` (cold), by day.** Budget is what the change log says was in
force; 09-11 spend is through 22:00.

| day | budget in force | spend | impressions | reach | link clicks | LPV | CPC | link CTR | CPM |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 09-05 | $9 → $2.00 at 14:33 | $1.27 | 133 | 120 | 4 | 4 | $0.21 | 3.0% | $9.55 |
| 09-06 | $2.00 | $2.91 | 225 | 182 | 6 | 6 | $0.16 | 2.7% | $12.93 |
| 09-07 | $2.00 | $2.62 | 205 | 182 | 6 | 5 | $0.13 | 2.9% | $12.78 |
| 09-08 | $9.00 at 03:00, $5.11 at 09:29 | $7.88 | 574 | 395 | 22 | 22 | $0.16 | 3.8% | $13.73 |
| 09-09 | $9.00 at 03:00 | $10.24 | 777 | 557 | 19 | 16 | $0.26 | 2.4% | $13.18 |
| 09-10 | $9.00 | $9.66 | 776 | 575 | 16 | 12 | $0.25 | 2.1% | $12.45 |
| 09-11 | $5.11 at 03:00 | $4.96 | 368 | 272 | 5 | 4 | $0.38 | 1.4% | $13.48 |

CPM is flat at $12.5–13.7 the whole week, so impressions per dollar did not
move. Placement mix did not move either (Facebook feed ~60% of spend both
before and after). What moved is the click-through rate, and it moved on one
ad.

**By ad.** Same two videos since 08-30 (the "prime" ads on the paused Traffic
campaign and the "convert" ads on the Sales campaign use the same
`video_id`s, 1464886812146012 male and 1420196480082165 female), so the
creative has been in front of this market for 13 days, not 6.

| day | male: imps / link / CTR | male: thruplay ÷ plays | female: imps / link / CTR | female: thruplay ÷ plays |
|---|---|---:|---|---:|
| 09-08 | 295 / 14 / **4.7%** | 24% | 279 / 8 / 2.9% | 19% |
| 09-09 | 433 / 11 / 2.5% | 14% | 344 / 8 / 2.3% | 21% |
| 09-10 | 438 / 8 / 1.8% | 16% | 338 / 8 / 2.4% | 16% |
| 09-11 | 239 / 1 / **0.4%** | 10% | 130 / 4 / 3.1% | 22% |

The male ad is being scrolled past: plays that reach 25% went 54% → 42%,
thruplays 24% → 10%, average watch time 4 s → 2 s. The female ad's numbers are
flat across the same four days. Lifetime frequency on the male ad set is 2.28
(731 people reached, 1,664 impressions since 09-05); the female set is 2.04.

**`Loxley's Retargeting`, by day.** One ad, launched 09-08.

| day | spend | impressions | reach | daily freq | link clicks | LPV | CPC | link CTR | CPM |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 09-08 | $2.94 | 184 | 108 | 1.70 | 5 | 4 | $0.59 | 2.7% | $15.98 |
| 09-09 | $3.60 | 231 | 120 | 1.93 | 3 | 3 | $1.20 | 1.3% | $15.58 |
| 09-10 | $3.81 | 176 | 101 | 1.74 | 1 | 0 | $3.81 | 0.6% | $21.65 |
| 09-11 | $2.54 | 157 | 101 | 1.55 | 1 | 1 | $2.54 | 0.6% | $16.18 |

Lifetime: $12.89, 749 impressions, **253 people, frequency 2.96**, 10 link
clicks, 0 purchases. The two audiences behind it report Meta's floor sizes
(site visitors "20", video viewers "1,000"), so 253 reached is the only real
measure of the pool, and every day now serves the same ~100 people 1.5–1.9
times. The launch report's own line was "anything trending past ~3 on a pool
this size is the same failure starting" — Marion Court's retargeting ended at
frequency 11.7, $103, zero purchases. Loxleys' is at 2.96 on day four.

---

## MECHANISM — three causes, stacked, and one of them was self-inflicted

**1. Today's cut is the plan.** The v2 playbook splits the $180 Loxleys run
cold:retarget 80/20 in Seed, 60/40 in Build (09-08 → 09-14), 35/65 in Close
(09-15 → 09-22). Build's cold rate is $5.11. The ladder applied it at 03:00
today, and the dry run tonight prints `SKIP already at the build rate` for
both campaigns. At a flat 2.25% click-through, halving the spend from ~$9.95 to
$4.96 takes the cold campaign from ~17 clicks to ~8 on its own; the remaining
gap to today's 5 is the click-through decay below. So **today's number is
roughly three quarters budget, one quarter fatigue.**

**2. The slide at a flat $9.00 (22 → 19 → 16) is fatigue on the male ad.**
Same budget, same CPM, same placements, same audience definition (men 22–45,
Harrisburg/Lancaster/York +20 mi, no interest or relationship filters) — and
the click-through fell by more than half in three days while the female ad,
built the same day with the same structure, did not move. Watch-time and
thruplay fell with it, which is what a creative being recognised and skipped
looks like, not what an auction problem looks like. This is the same video
that ran on the Traffic campaign from 08-30 at 6–8% click-through; men in this
market have now seen it for 13 days.

**3. The budget was whipsawed five times in six days, and each edit put the
campaign back into "Pending Process."** From the account's own change log:

| when (EDT) | edit | who |
|---|---|---|
| 09-05 14:33 | $9.00 → $2.00 | the 09-05 objective switch, hand-set |
| 09-08 03:00 | $2.00 → $9.00 | 03:00 ladder, main checkout, **legacy** registry (convert step) |
| 09-08 09:29 | $9.00 → $5.11 | the retargeting-launch session's v2 ladder, run from a worktree |
| 09-09 03:00 | $5.11 → $9.00 | 03:00 ladder, main checkout **still on the legacy registry** (its log says `1 ungoverned` — it did not know the retargeting campaign existed) |
| 09-10 03:00 | no change | still legacy: $9.00 was its plan |
| 09-11 03:00 | $9.00 → $5.11 | 03:00 ladder, main checkout pulled on 09-10, v2 registry |

This answers the open HANDOFF question from 09-11 ("is the 03:00 ladder
actually applying?"): **yes.** The $9.00 it found on 09-10 was not a hand edit
and not a refusal; it was the stale main checkout's legacy ladder overwriting
the worktree session's v2 write the next morning, the pattern in memory
`nightly-pulls-from-stale-main-checkout`. Four moves of 76% or more in four
days is not how a Sales-objective campaign with zero attributed purchases
settles; Meta re-enters learning on large budget edits, and this campaign has
never had three consecutive days at one budget since it went live. I cannot
measure how much of the click-through decay is that rather than fatigue
(see NOT VERIFIED), but it did not help.

**And the comparison in the back of the mind is not like-for-like.** The
Traffic campaign bought 22–38 link clicks a day for $2.30–3.50 (CPC $0.08, CTR
6–8%, CPM $7). The Sales campaign buys 16–22 for $8–10 (CPC $0.16–0.26, CPM
$13). That gap is the 09-05 objective switch working as designed: Sales pays
roughly double per impression to reach people Meta scores as likely buyers,
and the account chose it because Traffic had sold nothing across every event
(memory `traffic-objective-never-sold`, 0 vs 6, p=0.22 per dollar). Link
clicks are not what this campaign is optimised to buy. The click-through
collapse on one ad is a real signal anyway, because it is measured against
the same campaign's own earlier days.

---

## EVIDENCE — sales are not (yet) telling the same story

Firestore `tickets` for Loxleys, all 16 docs, read tonight:

| kind | count | detail |
|---|---:|---|
| paid | **8** | 2 own-site (08-14, 08-15 at $21.49), 6 Eventbrite imports (08-17, 08-24 at $24.99; **three on 09-07**, the early-bird deadline, at $21.56; 09-10 at $26.22) |
| comps | 5 | 08-20, 08-29, 09-05, 09-08, 09-09 |
| $0, not comp | 3 | a +1 seat, an Eventbrite free seat, a manual import (08-15/16) |

Paid buyers: 5 men, 3 women. Seven of the 8 paid were in by T-14 (09-08),
which puts Loxleys third of six events at that mark (Founders 2, Round 2 13,
Tellus 7, Good Good 6, Marion Court 4) — the memory
`sales-happen-in-the-last-14-days` says never to judge before T-7 and that 66%
of paid tickets land in the final fortnight. Nothing here is behind.

Meta shows 0 attributed purchases on both campaigns, which is consistent with
6 of the 8 sales happening on Eventbrite with no site visit. And the
expected-sales arithmetic for a two-day window (23 link clicks × the account's
0.40% landing-page-to-purchase rate ≈ 0.1 tickets) means these two days could
not have shown a sales signal either way.

---

## NOT VERIFIED — what I did not check

- **How much of the male ad's decay is learning-reset rather than fatigue.**
  Meta's `learning_stage_info` came back empty for all three ad sets, so I
  cannot say whether the 09-09 and 09-11 budget edits reset learning. The
  watch-time decline points at fatigue; the timing overlaps the edits. Both
  can be true.
- **Whether the dark posts behind the ads still exist.** The ads token lacks
  `pages_read_engagement`, so the post check errored on every ad. The ads
  are ACTIVE with no `issues_info`, which is what Meta shows when the post is
  fine; if a post had been deleted the ad would read WITH_ISSUES. Inferred,
  not read.
- **Whether PR #545 (deleting the stale Loxleys Facebook posts on 09-11)
  touched anything the ads use.** The ads' `effective_object_story_id`s are
  dark posts minted by the ad creatives on 08-30/09-05/09-08, not the organic
  queue posts that PR cleared, and their timings do not line up with the
  09-08 → 09-10 slide. Not the cause, but not proven either.
- **The retargeting pool's true size.** Meta reports its floor values ("20",
  "1,000"). Reach 253 after $12.89 is the only real read.
- **Today's figures settle.** 09-11 is read at 22:00 with Meta's usual
  same-day lag; expect 09-11 to close a little higher on every count.
- **Whether adding a second male creative would restore click-through.** The
  account has never run two creatives in one ad set at the same time, so there
  is no in-account evidence, only the general one.

---

## DECISION — what is Taylor's to decide

Nothing below has been done. The first two are the ones I would take.

1. **Add a second video to the male cold ad set; do not replace the one that
   is there.** Replacing mints a new dark post and drops the video-viewer
   audience's feed (memory `dont-swap-creatives-under-live-retargeting`);
   adding keeps the feed and gives men something they have not skipped 13
   days running. It needs an asset that is not the 08-30 pair. The account
   already holds the retargeting patio video (`1634620321428923`) and the
   August "LX Women / All Genders" videos; any of them, or a new one, beats
   another week of the same clip at 0.4%.
2. **Decide the retargeting pool before Close starts on 09-15.** The ladder
   will move retargeting from $3.40 to **$6.32/day** and cold down to $3.41
   that morning. $6.32 at $16 CPM is ~400 impressions a day into a pool that
   253 people have absorbed so far at frequency 2.96 — that is Marion Court's
   shape within the week. Either widen the ad set's audience (Page and
   Instagram engagers from the LX organic run, 30-day site visitors across
   all events) so the money has somewhere new to go, or set the retargeting
   entry `managed: false` in `content/paid-campaigns.json` and hold it at
   ~$3.40 by hand through 09-22. Widening is a live ad-set targeting edit,
   which is allowed; the objective is not.
3. **Leave the cold budget alone.** $5.11 is the plan, it was applied
   correctly, and the main checkout is now current so the 03:00 run will stop
   flip-flopping. Raising it to chase the click count would buy more of the
   ad men are already skipping.
4. **Retire the HANDOFF ladder question** (done in this PR, with the change
   log as evidence) and decide the two expired Marion Court acknowledgements
   the dry run keeps printing — both campaigns are still ACTIVE but have spent
   $0 since 09-09, so it is housekeeping, not money.

---

*Sources: Marketing API v21.0 `campaigns` / `adsets` / `ads` / `insights` (daily,
by ad, by placement, by age×gender, hourly) and `activities` on
`act_1672342180672647`; `Night Tasks/logs/budget-ladder.log`;
`node scripts/meta-budget-ladder.js --all` dry run; Firestore `tickets` via REST.
Pulled 2026-09-11 22:35–22:50 EDT from worktree `lx-link-clicks-drop`.*
