# The Meta ad ladder — Seed, Build, Close

**Standing playbook. Meant to be typed into Ads Manager for every future
SparkDate event**, not re-derived each time. Extracted from §8 of
`reports/ADS_OBJECTIVE_GAP_ANALYSIS_2026-09-06.md` (2026-09-06) so the forward
plan has its own citable home instead of living inside a dated diagnostic
report. That source report, plus `reports/META_ADS_ROOT_CAUSE_2026-09-04.md`,
carry the full evidence trail (a live Firestore + Meta Graph API v21.0 join,
adversarially verified) behind every number below — this file states the
resulting rules, not the derivation.

**One number or rule per dimension.** Lead time, phasing, budget, cold:retarget
split, gender targeting, city handling — no further judgment calls should be
left once this is read. Every claim is tagged by why it's that number:

- **`[platform]`** — forced by Meta's mechanics (frozen-at-birth ad set fields,
  the $2.00/day campaign floor) or the account's own $40/day governance
  ceiling.
- **`[measured]`** — grounded in this account's own historical numbers.
  Nothing here clears conventional statistical significance (6 lifetime
  Meta-attributed purchases, total, ever, across seven events) — "measured"
  means effect direction and magnitude judged consistent across multiple cuts
  of the data, not a p-value.
- **`[judgment]`** — the data does not isolate this exact value; this is the
  specific default to use, with the measured facts that motivated it stated
  alongside, not disguised as more than they are.

## Quick-reference build table

| Phase | Window | Days | Daily budget | Cold $ | Retarget $ | Gender |
|---|---|--:|--:|--:|--:|---|
| **Seed** | T-21 to T-15 | 7 | $10.00 | $8.00 (80%) | $2.00 (20%, exact Meta floor) | 100% broad |
| **Build** | T-14 to T-8 | 7 | $14.00 | $8.40 (60%) | $5.60 (40%) | 100% broad |
| **Close** | T-7 to T-0 | 8 (incl. event day) | $16.00 | $5.60 (35%) | $10.40 (65%) | 100% broad |

Reference total: **~$296/event** (7×$10 + 7×$14 + 8×$16) — in the same band as
this account's two most productive Lancaster events (Marion Court $221, Tellus
$234) and below Good Good's $363 (worst ROAS in the account, see
`META_ADS_ROOT_CAUSE_2026-09-04.md`). Scale the whole ladder up or down for a
bigger or smaller event; **hold the day-windows, the cold:retarget
percentages, and the $2.00/day floor-priority rule (§2 below) fixed** — those
are the load-bearing rules, the dollar amounts are the part meant to flex.

**Philadelphia runs the identical table** except it does not automatically
advance past Seed — see §4's gate before releasing Build/Close budget.

---

## 1. Lead time and phase schedule — T-21 as the default, honestly labeled

**Launch the first ad dollar 21 days before the event, every time, as the
default.** `[judgment]`

Be precise about what this number is and isn't. This account's six historical
first-ad lead times are 13, 19, 22, 23, 32, and 38 days (Founders, Tellus Aug,
Marion Court, Loxleys, Round 2, Good Good) — mean 24.5, median 22.5, and **no
event has ever actually launched at T-21.** No lead time has ever been tied to
a measured outcome either: six lifetime Meta-attributed purchases spread
across all six events is not enough volume to have tested whether any
particular lead time causally helps. T-21 is a judgment call, chosen because
it sits inside the real 13–38 day range, close to both the median (22.5) and
Marion Court's actual 22-day lead time (one of the two most productive
Lancaster events), and because it leaves exactly one full week of upstream
seeding time before the account's own measured, backloaded final-two-weeks
window opens (below — that part *is* measured).

Three phases, and here the historical grounding is real but partial — say
precisely which part:

- **Close (T-7 to T-0, 8 days) matches the account's own measured
  sales-curve buckets directly.** `[measured]` — 37% of tickets sell in the
  final 7 days and 73% in the final 14, per the account's own disjoint T-7..1/
  T-0 and T-14..8 buckets. This window is a harvest phase by definition, not
  by assumption.
- **Build (T-14 to T-8, 7 days) approximates the account's T-14..8 bucket**,
  the second-heaviest ticket window in every event examined (e.g. Tellus: 11
  of 24 tickets fell in this exact bucket). `[measured]`, approximately —
  bucket edges in the source data are T-14..8, which this phase matches
  exactly.
- **Seed (T-21 to T-15, 7 days) is a judgment extension backward from Build,
  not a bucket match.** `[judgment]` — the account's own T-30..15 bucket is
  wider than Seed's window and carries meaningfully less ticket volume than
  the two buckets above it (e.g. Founders: 2 tickets in T-30..15 vs. 6 in
  T-14..8 and 10 in T-7..1), consistent with treating Seed as investment
  rather than harvest, but there's no sub-bucket data that specifically
  validates a 7-day Seed window versus a 5-day or 10-day one.

**Campaign structure — build both campaigns once, on day one of Seed, never
recreate:** objective, `optimization_goal`, `attribution_spec`, and creative
`url_tags` are frozen at birth and cannot be edited on a live ad set.
`[platform]` Build `<Event> | Cold` and `<Event> | Retargeting` on day one —
both `OFFSITE_CONVERSIONS` / `PURCHASE` pixel / 7-day click / Advantage+
audience **off** — and move between phases by editing daily budget only. This
is exactly what `scripts/meta-budget-ladder.js`'s ladder registry does with
existing campaigns (a budget-JSON edit, not a rebuild) — it doesn't yet decide
objective, phasing, or cold/retarget mix on its own, so a new event still
needs this playbook read and applied by hand at registration time.

**Cold-start / compressed-schedule rule:** if fewer than 21 days remain when
planning starts, skip Seed and launch directly at Build's 60/40 split; if
fewer than 14 days remain, launch directly at Close's 35/65 split. **Never
compress Close** — it's the single highest-value window in the cycle by a
wide margin. `[judgment]` — no historical event in this account has run a
deliberately compressed schedule to measure against.

## 2. Cold-vs-retargeting split, by phase

| Phase | Cold | Retarget | Why |
|---|--:|--:|---|
| Seed | **80%** | **20%** | `[judgment]`, mechanically pinned to Meta's $2.00/day floor at the $10/day Seed budget. This isn't "retargeting" in the sense that converts at 1.9% — the pool barely exists yet. It's floor-spend insurance that keeps the standing Retargeting campaign live so it isn't dead weight once Build actually needs it to work. |
| Build | **60%** | **40%** | `[measured]`-motivated, not measured directly: sales/retarget converts LPV→purchase at 1.9% vs. sales/cold's 1.3%, and costs less per LPV ($1.25 vs $1.79) — a real edge on 4 vs. 2 purchases, not statistical proof. No historical campaign has ever run a deliberate 60/40 split by phase to test this number itself; the *direction* (skew toward retarget as the pool matures) is what's grounded in data, the exact 60/40 is a judgment call inside that direction. |
| Close | **35%** | **65%** | Same basis as Build, taken further: retargeting gets the majority in the harvest window, leaning into its measured per-LPV edge during the highest-ticket-share period. Cold never goes to zero — the backloaded sales curve means some event-day buyers haven't been touched by any ad yet, and 35% keeps that door open. |

**Budget-floor priority rule — makes the percentages executable at any event
size:** compute each phase's dollar amounts from the percentages above; if the
computed retarget-campaign dollar amount would fall below Meta's $2.00/day
floor, **set retargeting to exactly $2.00/day and let cold absorb the rest of
that phase's budget** (this is why the Seed row is $10/day, not lower — $10 is
the minimum Seed total that lets 20% land exactly on the floor without the
override firing). `[platform]` If a phase's total daily budget would need to
drop under $4.00/day to make even this work, run cold-only for that phase and
hold the Retargeting campaign at its existing budget rather than fund it below
the floor.

**Never let this drift toward an 8:1-or-worse retarget:cold ratio.** As of the
2026-09-06 pull, Marion Court's active cold-sales ad set was spending
$4.11/week against $34.75/week on its retargeting campaign — an 8:1 ratio,
well past even Close's 65:35. That pattern (documented separately in
`reports/MARION_COURT_RETARGETING_FATIGUE_2026-09-01.md` — $87.51 lifetime, 34
landing-page views, 0 purchases) is the specific failure this ladder exists to
prevent, not a target to preserve. An 85%+ retarget share is only ever correct
inside the final 8 days under this template — never before, and even then
it's 65%, not 87%.

## 3. Gender targeting — zero dedicated gender-restricted ad sets, every phase, every event

**Run every ad set — cold and retargeting, every phase — as gender = all. Do
not build a women-only or men-only ad set.** `[judgment]`, reached from four
converging `[measured]` signals — read the honest counter-argument below
before treating this as more settled than it is.

1. **The paradox itself.** Women-targeted budget *share* correlates inversely
   with actual women's ticket share across this account's 6-event history
   (Spearman rho = −0.657, exact permutation p = 0.088, n=6 — suggestive, not
   proven). The worst outcome (Good Good, 7.1% women) came from the heaviest
   targeting (86.6% of that event's budget).
2. **Meta's own delivered-gender data shows no targeting advantage.** Within
   sales-objective ads, male LPV→purchase conversion matches or beats
   female's (sales/retarget: male 2/95 = 2.1% vs. female 2/114 = 1.75%;
   sales/cold: male 1/67 = 1.5% vs. female 1/82 = 1.2%). There is no evidence
   in this account's own delivery data that paying to target women
   specifically outperforms reaching everyone.
3. **The channel cross-check.** `eventbrite_import` tickets are 19.3% women
   (11/57) — worse than broad reach. The untracked `none` channel
   (organic/direct, zero ad targeting of any kind) is **35.7% women** (10/28),
   better than Eventbrite and close to Tellus's ad-level best. Broad,
   untargeted reach already outperforms every gender-restricted lever this
   account has tried, on Meta or off it.
4. **Live under-delivery — a delivery-mechanics failure, independent of the
   correlation debate.** As of 2026-09-06, Marion Court's `Female | Sales` ad
   set (inside a campaign budgeted $14.00/day, $98/week) had spent **$4.11 in
   the trailing 7 days — about 4% of its assigned budget.** Loxleys' gender
   split had spent **$1.27 lifetime**, $0.87 to the male ad set and $0.40 to
   the female one — both well under a single day's target. At this account's
   pixel volume, a `PURCHASE`-optimized ad set restricted to one gender
   doesn't just convert about the same as broad — it frequently can't find
   enough qualifying impressions to spend the budget assigned to it. That's a
   delivery-mechanics failure, not only a targeting-quality question, and it
   also multiplies the number of line items that each need to separately
   clear the $2.00/day floor at a $22–40/day account ceiling. `[platform]`+`[measured]`

**The honest counter-argument, and why zero still wins over a small nonzero
share:** Tellus AfterDark — this account's single best women's-share result
(37.5%) — did **not** run gender=all. It ran 34.8% of its budget on dedicated
women-targeting, the smallest nonzero share in the 6-event sample, but not
zero. Read narrowly, the data supports "less women-targeting is better,"
which is consistent with either "keep going to zero" or "stop at something
small and nonzero, like Tellus's ~35%." This playbook picks zero specifically
because of point 4 above, which Tellus's outcome doesn't speak to at all: the
delivery-mechanics failure is current and measured (two campaigns
under-spending their own budgets), and a bounded nonzero test cell would very
likely reproduce that exact under-delivery rather than generate a usable
comparison. A future event that deliberately tests a small nonzero share
(with its own kill rule tied to spend-rate, not just conversion rate) would be
a reasonable experiment to run outside this default, not a reason to change
the default itself yet.

**Where the "reach women" effort goes instead — a real substitute, not a
shrug:**
- **Creative, inside the broad ad set.** Tellus's social-proof/testimonial
  creative is this account's own clearest evidence of what pulls women in
  (memory: `social-proof-pulls-women`). Every phase's broad ad set should run
  that creative pattern — the lever is what the ad shows, not who it's aimed
  at.
- **Channel and listing investment, outside Meta ad sets.** The `none`/organic
  channel already beats every Meta gender-targeting attempt at 35.7% women.
  Budget that used to fund a women-only ad set is better spent on Eventbrite
  listing copy/imagery quality and the organic content queue
  (`content/queue.csv`) than on a Meta gender checkbox.
- **The 2-for-1 mechanic stays exactly as coded** — offered to every buyer at
  checkout, advertised to women. That's already correct per standing guidance
  (memory: `two-for-one-is-female-ads-only`) and isn't touched by this rule.

## 4. City-specific delta — Philadelphia gets a budget gate, not a different structure

**No change to phase windows, cold:retarget percentages, or the gender rule.**
`[measured]`-grounded: Good Good already ran a *higher* sales-objective spend
share than Lancaster (56.9% vs. 36.1%), a *heavier* women-targeting share
(86.6%, the account's heaviest) than any Lancaster event, and the account's
*longest* lead time (38 days) — and still finished worst on every axis (ROAS
1.13 vs. 2.14, $25.96/ticket vs. $10.96, 7.1% vs. 27.5% women). If objective
mix, gender mix, or lead time were Philadelphia's problem, Philadelphia should
already be winning on at least one of those bases; it isn't on any. Applying a
different mix there would treat a symptom the data has already ruled out.

The delta is a data-driven spend gate, tied to a real in-flight number, not a
flat discount:

- Launch identically: Seed at $10/day, 80/20, broad targeting.
- **Hold at the Seed rate through the T-14 checkpoint.** Do not auto-advance
  to Build's $14/day or Close's $16/day.
- **Go/no-go test at T-14:** compare Philadelphia's Seed-phase cold-sales ad
  set's cost-per-LPV against this account's own sales/cold benchmark of
  $1.79/LPV. `[measured]` for the $1.79 anchor. If it's at or under **~$2.70/
  LPV (1.5× the benchmark)**, advance to Build and Close on schedule — the
  event runs the full ladder identically to Lancaster. If it's above that,
  hold at $10/day for the rest of the cycle rather than escalating spend into
  a setup that isn't responding. `[judgment]` for the 1.5× tolerance — no
  in-city historical Seed-phase number exists yet to calibrate against.

This gate is preferred over a flat discount because it responds to what's
actually observed in that specific event: if the gate fails, total
Philadelphia spend stops near $70 (7 days × $10) instead of running the full
~$296; if it passes, the template runs there exactly as it does in Lancaster.
Either outcome produces real information about whether Philadelphia's problem
is structural (venue/market) rather than something this playbook's levers
control — which n=1 event cannot yet answer directly.

## 5. Budget ladder mechanics and the $40 ceiling

The account's $40/day ceiling (governed by `scripts/meta-budget-ladder.js`'s
registry) is account-wide, not per-event, and this per-event template has to
fit inside it — including when two events overlap, which is this account's
normal state (Marion Court and Loxleys ran concurrently at $22/day combined in
early September 2026).

- **Every campaign, every phase, sits at or above the $2.00/day Meta floor**
  via the priority rule in §2 — the tightest case is Seed's retargeting
  campaign at exactly $2.00.
- **Run Cold and Retargeting as two separate, manually-budgeted (ABO)
  campaigns per event — never combine them under one CBO campaign.**
  `[judgment]`, motivated by a measured fact: `learning_stage_info` returned
  empty for all four active ad sets checked 2026-09-06, and this account's own
  live pacing is already erratic at the ad-set level (§3's under-delivery
  figures). A CBO layer on top of pacing this uneven would let Meta silently
  override the cold:retarget percentages this playbook exists to enforce, at
  an account too small to have shown it can reallocate sensibly. This isn't a
  Meta-imposed rule — CBO is available — it's a judgment call specific to
  this account's low volume, worth revisiting if purchase volume grows.
- **Custom-audience lookback window: 30 days**, for the pool the retargeting
  campaign draws from. `[judgment]` — this account's event traffic volumes are
  modest enough (some events' entire LPV history is in the low hundreds) that
  a shorter 7–14 day window risks a pool too thin to deliver against reliably;
  not verified against actual current audience membership counts (a known
  gap: website custom audiences report a floor of "20," not a real size — see
  memory `website-audiences-are-orphans`).
- **Concurrent-event rule:** if two events' active phases overlap and their
  combined daily total would exceed $40, **compress the earlier-phase event's
  Seed or Build budget first** — that window's historical ticket share is
  smaller and a temporary cut there costs less than the same cut would in
  Close. **Never compress a Close-phase (T-7..0) budget** to make room for
  another event's earlier phase; it carries 37–43% of historical ticket
  volume. If two events' Close phases would genuinely overlap, hold the
  smaller or later event at Build's $14/day one phase longer rather than run
  two Close-phase budgets at once. `[judgment]` — no two events' Close phases
  have actually overlapped yet in this account's history.
- **Worked example:** a new event entering Close ($16/day, or $10/day for a
  gated-hold Philadelphia event) alongside an existing $22/day committed
  brings the account to $38/day (Lancaster) or $32/day (Philadelphia hold) —
  both under the $40 ceiling with room to spare.

## 6. What remains genuinely uncertain

- **T-21 is a judgment call inside a real 13–38 day historical spread** (mean
  24.5, median 22.5, n=6), not a value the data measured as optimal. No lead
  time in this account's history has ever been tied to a causal outcome —
  treat T-21 as the best available default, not a proven optimum.
- **The Seed/Build/Close percentages (80/20, 60/40, 35/65) are directionally
  motivated by the one real measured signal in the account** (retargeting's
  LPV→purchase and cost-per-LPV edge) **but the exact numbers at each phase
  are judgment calls** — no campaign has run a controlled phase-by-phase test
  of these splits.
- **The gender=0% rule rests on a live, measured delivery failure plus a
  suggestive n=6 correlation, not a clean statistical proof** — and this
  account's own best women's-share result (Tellus, 37.5%) came from a small
  nonzero share, not zero. If a future event shows a genuinely well-targeted,
  adequately-delivering women's ad set outperforming broad delivery, that's
  new evidence this rule should update on.
- **The CBO ban and the learning-phase argument behind it hedge an ambiguous
  signal.** `learning_stage_info` returning empty could mean the account never
  engages Meta's learning phase (supporting the ban) or could be a
  field-availability artifact unrelated to actual CBO behavior.
- **The 30-day custom-audience lookback is a default, not a measured account
  fact** — actual audience sizes have not been directly re-pulled.
- **Philadelphia's gate rests on n=1** (Good Good). A second gated
  Philadelphia event either confirms the gate is doing useful work or shows it
  needs recalibrating.

## How to use this with zero further judgment calls

1. Count days to the event. 21+ days out → start at Seed. 8–14 → start at
   Build. 0–7 → start at Close. Mid-cycle starts skip earlier phases (§1).
2. Build two sales-objective campaigns (`<Event> | Cold`, `<Event> |
   Retargeting`) on day one, both `OFFSITE_CONVERSIONS`/`PURCHASE`/7-day-click/
   Advantage+ off, both ABO — set daily budgets per the phase row in the
   quick-reference table, applying the $2.00 floor-priority rule (§2) if the
   event's budget is scaled down.
3. Every ad set in both campaigns is broad/all-gender. Do not create a
   women-only or men-only ad set.
4. Move to the next phase's budget row on schedule (T-15, T-8, T-0). The
   dollar amounts change; the gender rule never does.
5. If the event is in Philadelphia: hold at Seed's $10/day through T-14, run
   the cost-per-LPV gate in §4, then advance or hold.
6. If a second event's window overlaps, check the combined daily total
   against $40 before advancing either event's phase (§5); trim the event
   further from its own event date first, and never trim a Close phase.

## What this playbook does not change

Objective (sales-only over traffic) was already settled by
`reports/META_ADS_ROOT_CAUSE_2026-09-04.md` and isn't revisited here — every
live ad in the account is already sales-objective, and traffic-objective
lifetime purchases are zero of $740.23 spent. Nothing in this playbook
overrides that report's caveat that Meta-attributed levers govern a minority
of what sells tickets: roughly 60% of paid tickets are `eventbrite_import` and
never touch a Meta ad, and Meta's own attribution sees only about 6% of real
sales, lifetime (memory: `meta-attribution-is-not-sales`). This is the fully
specified answer to "how do we configure the Meta side," not a claim that the
Meta side is the biggest lever available — see
`reports/WOMEN_ACQUISITION_BRAINSTORM_2026-09-02.md` and the LancasterOnline/
Evvnt free-syndication work for the non-Meta side of that picture.

## Provenance and what was corrected getting here

This playbook went through adversarial verification (two independent lenses
per claim — statistical rigor, and platform-constraint/consistency) before
being finalized in the source report. What that changed, carried forward here
so the confidence tags above can be trusted at face value:

- Lead time (T-21): relabeled from a blanket "measured pattern" to informed
  judgment, with the honest historical spread stated rather than overclaimed.
- Phase windows: split the label — Close and Build's windows genuinely match
  measured sales-curve buckets; Seed's window is an explicit judgment
  extension with no matching sub-bucket in the data.
- Cold:retarget split by phase: relabeled from "measured pattern" to informed
  judgment — the *direction* is measured, the exact percentages are not.
- Added the $2.00/day budget-floor priority rule (§2), which was previously
  missing entirely and would otherwise have silently produced non-executable
  sub-floor campaigns at smaller event budgets.
- Gender rule: kept the zero recommendation, but reframed its strongest
  support around the independent, currently-live, measured delivery failure
  rather than resting solely on the n=6 correlation — and explicitly surfaced
  the Tellus counter-example rather than omitting it.
- CBO-vs-ABO rule: retagged from a platform constraint to informed judgment —
  Meta does not forbid CBO; the ban is this account's own call given its low
  purchase volume and observed erratic pacing.
- Daily budget ladder ($10/$14/$16, ~$296 total) and the Philadelphia spend
  gate: checked directly against the source report's underlying data exports
  and held up unchanged.

---

*Source: `reports/ADS_OBJECTIVE_GAP_ANALYSIS_2026-09-06.md` §8, built from
Firestore `tickets`/`events`/`ad_spend` joined with a live Meta Graph API
v21.0 pull, cross-checked against GA4 own-site sessions. See also
`reports/META_ADS_ROOT_CAUSE_2026-09-04.md` (the attribution-window confound,
the cookie-regex bug, the Meta-sees-~6%-of-sales finding) and
`reports/MARION_COURT_RETARGETING_FATIGUE_2026-09-01.md` (the retargeting-pool
health question referenced in §2).*

🤖 Generated with [Claude Code](https://claude.com/claude-code)
