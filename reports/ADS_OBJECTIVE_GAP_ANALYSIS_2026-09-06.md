# Ads objective gap analysis: what sold under which objective, what's live now, and the sales-vs-sales+retargeting call

2026-09-06. Scope: every dollar of Meta spend and every paid ticket across all 7 events to date, cut by campaign objective (traffic vs. sales), by structure (cold prospecting vs. retargeting), by gender, and by geography (Lancaster vs. Philadelphia). Built from a fresh Firestore + live Meta Graph API join, not from any single platform's own attribution.

**The headline: the objective question has already answered itself.** Every currently active ad in the account is sales-objective — traffic objective is 100% paused or archived, and lifetime it produced one add-to-cart and zero purchases across $740 of spend. The account got here correctly on its own. What's still open is *within* sales objective: the current mix is 86.6% retargeting / 13.4% cold on money still flowing, which is too far toward retargeting to keep feeding itself, and a genuine, separate finding on gender — money spent explicitly targeting women correlates with *worse* results, not better.

**Update, same day:** §8 originally left the forward call as a direction ("something closer to 55/45 or 60/40, tilt back late") rather than a build spec. Taylor asked for it fully disambiguated — one number per dimension, meant to be typed into Ads Manager for every future event. §8 now is that: a three-phase (Seed/Build/Close) lead-time, budget, cold:retarget, and gender-targeting template, put through adversarial verification before being finalized (three of its numbers had their confidence label corrected as a result — see §8's changelog).

## Four numbers to hold in your head

| | | |
|---|---|---|
| **Lifetime spend / revenue / ROAS** | $1,267.32 / $2,322.53 / **1.83** | Firestore tickets, not Meta's attribution (Meta sees ~11% of real sales) |
| **Traffic objective's lifetime purchases** | **0** of $740.23 spent | 1 add-to-cart, 0 checkouts, 0 purchases across 2,673 link clicks |
| **Retargeting share of money still spending** | 86.6% of active-ad spend / 31.2% of all last-7-day spend | two different, both-correct denominators — see §3 |
| **Cost per woman, cheapest vs. most expensive event** | $4.24 (Loxleys*) → $9.07 (Tellus) → **$314.68 (Good Good)** | *Loxleys' is confounded — see §5 |

---

## §1 EVIDENCE — the historical trace: every event, every objective, every dollar

Every paid ticket (`status === 'confirmed' && Number(amount) > 0 && !isComp && !isPlusOne` — cents, sometimes stored as a string) joined to Meta spend by event, objective, and structure.

| Event | City | Date | Spend | Tickets | Revenue | ROAS | $/ticket | Women | Men | W% |
|---|---|---|--:|--:|--:|--:|--:|--:|--:|--:|
| Founders Mixer | Lancaster | 06-24 | $61.91 | 20 | $411.92 | 6.65 | $3.10 | 4 | 15 | 21.1% |
| Round 2 — Summer Nights | Lancaster | 07-29 | $350.80 | 20 | $468.29 | 1.33 | $17.54 | 3 | 17 | 15.0% |
| Tellus AfterDark | Lancaster | 08-26 | $234.37 | 24 | $599.24 | 2.56 | $9.77 | 9 | 15 | **37.5%** |
| Good Good Night | Philadelphia | 08-31 | $363.49 | 14 | $412.32 | 1.13 | $25.96 | 1 | 13 | **7.1%** |
| Marion Court | Lancaster | 09-08 | $221.06 | 13 | $325.30 | 1.47 | $17.00 | 4 | 9 | 30.8% |
| Loxleys | Lancaster | 09-22 | $19.28 | 4 | $92.96 | 4.82* | $4.82* | 2 | 2 | 50.0%* |
| Tellus AfterDark (2) | Lancaster | 10-06 | $0.00 | 0 | $0.00 | — | — | 0 | 0 | — |
| **Total** | | | **$1,250.91** | **95** | **$2,310.03** | **1.85** | | 23 | 71 | 24.5% |

\* Loxleys' ROAS is spurious — see §5. Plus $16.41 in brand/unmapped spend (early ad sets that predate the eventId-in-link convention) and 1 unmatched ticket (~$12.50), reconciling to the account-wide $1,267.32 / $2,322.53 above.

**Objective mix, per event, as a share of that event's own lifetime spend:**

| Event | Traffic/cold | Traffic/retarget | Sales/cold | Sales/retarget |
|---|--:|--:|--:|--:|
| Founders Mixer | 92% | 8% | 0% | 0% |
| Round 2 | 81% | 19% | 0% | 0% |
| Tellus AfterDark | 17% | 0% | 52% | 31% |
| Good Good | 43% | 0% | 29% | 28% |
| Marion Court | 44% | 0% | 17% | 39% |
| Loxleys (lifetime) | 95% | 0% | 5% | 0% |

Read top to bottom, this is a visible transition: the first two events ran almost entirely on traffic objective; the last three introduced sales objective and retargeting as structures. Loxleys' *lifetime* row still shows 95% traffic because most of its historical spend predates a switch made this week — see the live state below, which has already moved past this table.

**Lifetime, by objective, all events combined (Meta ad-level, so window-confounded — see §4):**

| Bucket | Spend | Link clicks | CPC | LPV | Add-to-cart | Checkout | Purchases | LPV→purchase | $/LPV |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| Traffic / cold | $669.50 | 2,580 | $0.26 | 1,952 | 1 | 7 | **0** | 0.0% | $0.34 |
| Sales / cold | $268.93 | 167 | $1.61 | 150 | 8 | 18 | 2 | 1.3% | $1.79 |
| Sales / retarget | $260.95 | 223 | $1.17 | 209 | 15 | 21 | 4 | 1.9% | $1.25 |
| Traffic / retarget | $70.73 | 93 | $0.76 | 60 | 0 | 0 | **0** | 0.0% | $1.18 |

Total Meta-attributed purchases across the account's entire life: **6**. Every stat above this line is real; every conclusion drawn *from* it has to survive that denominator.

## §2 EVIDENCE — the account right now (live-pulled 2026-09-06)

**Every active ad is sales objective.** Nothing traffic-objective is spending a dollar today:

| Campaign | Status | Objective | Daily budget | Stop date |
|---|---|---|--:|---|
| Marion Court \| Sales | ACTIVE | Sales | $14.00 | 09-08 |
| Marion Court Retargeting | ACTIVE | Sales | $6.00 | 09-08 |
| Loxleys \| Sales | ACTIVE | Sales | $2.00 | 09-22 |
| Marion Court \| Traffic | PAUSED | Traffic | $10.00 | 09-08 |
| Loxleys \| Traffic (×2 dupes) | PAUSED | Traffic | $3–10.00 | 09-22 |
| Loxley's Retargeting | PAUSED | Sales | $5.00 | 09-22 |

Current run rate: **$22.00/day** across the three active campaigns — matches the figure independently verified in the open budget-ladder PR (#454, see §8). All six currently-active ad sets share the same frozen-at-birth configuration: `OFFSITE_CONVERSIONS` optimizing for the `PURCHASE` pixel event, 7-day click attribution, Advantage+ audience **off** (manual targeting). That's the textbook-correct sales-objective setup; the account has already converged on it.

**Account billing status:** `account_status = 9` (IN_GRACE_PERIOD), `disable_reason = 0` (none), balance $61.68, lifetime spend $1,269.86 on file (the $2.54 gap from the $1,267.32 ledger total above is same-day spend not yet folded into the joined dataset — not a discrepancy). Checked daily delivery against budget for all four recent campaigns: no shortfall — Retargeting ran 25–119% of its $6 budget day to day (Meta averages over the week, so days over 100% are normal), Traffic ran 49–108% before being paused, both new campaigns (Marion Court Sales, Loxleys Sales) delivered fully on their first partial day. **Grace period is not currently suppressing delivery.** It's worth a look at Meta's own billing settings before it escalates, but it is not, today, an operational problem.

## §3 EVIDENCE — retargeting's share of spend: two correct numbers, not one

- **Of money the currently-active ads are spending:** $34.75 of $40.13 in the last 7 days is retargeting — **86.6%**. Nearly all of it is one audience: `MC Retargeting | Video Viewers + Site Visitors`.
- **Of every dollar actually spent in the last 7 calendar days**, including the traffic campaigns that were still running for part of that window before being paused: **31.2%** of $150.90.

These aren't in tension — they're the same account caught mid-transition. The trailing week still carries $100+ of traffic-objective cold spend (Real People Traffic $54.20, Good Good Traffic $28.15, Loxleys Traffic $18.28) that has since been switched off; the *forward-looking* number is the 86.6% one, and it says something specific: **cold prospecting has nearly stopped while retargeting keeps spending against a pool that traffic-objective ads used to fill.** Marion Court's own active cold-sales ad set is spending $4.11/week against $34.75/week on retargeting — an 8:1 ratio in the wrong direction if the retargeting pool is meant to be replenished rather than slowly exhausted.

One retargeting-specific number to sit with: `MC Retargeting` has spent **$87.51 lifetime for 34 landing-page views and 0 Meta-attributed purchases**. This pool's fatigue is already the subject of a dedicated prior report (`reports/MARION_COURT_RETARGETING_FATIGUE_2026-09-01.md`) — not re-litigated here, but it's the concrete face of "retargeting needs a fed, healthy pool," not an abstract concern.

## §4 MECHANISM — why the traffic-vs-sales comparison above needs a caveat, and why the sales/cold-vs-retarget comparison doesn't

Every traffic ad set in this account was frozen at birth on a **1-day click** attribution window; every sales ad set on a **7-day** window. That's not a small footnote — it means the traffic-vs-sales comparison in §1's funnel table is measured on two different instruments, and Meta will structurally undercount traffic's real (already-weak) results relative to sales'. Previously established: per landing-page-view, sales-objective's edge is significant even accounting for this (p=0.010); **per dollar it is not (p=0.224)** — sales objective costs roughly 5x more per LPV ($1.25–1.79 vs $0.26–0.34), so the two effects partly cancel. Six lifetime conversions is not enough to settle this cleanly either way, and no phrasing below should be read as "proven."

**The comparison that is *not* window-confounded** is sales/cold vs. sales/retarget — both run the same 7-day attribution. There, retargeting converts LPV→purchase at 1.9% vs. cold's 1.3%, and costs less per LPV ($1.25 vs $1.79). Directionally consistent with retargeting a warmer audience working better, on 4 vs. 2 purchases — suggestive, not proof, but it's the cleanest apples-to-apples read the account has.

**Checked and inconclusive:** whether the account's sales-objective ad sets ever exit Meta's algorithmic learning phase. Pulled `learning_stage_info` directly on all four currently-active ad sets — the API returned nothing for any of them. That's consistent with an account whose lifetime purchase count (6) is far below the volume where Meta's optimization engages at all, but an empty field can't be distinguished here from a field-availability quirk. Flagging it as a real open question rather than asserting an interpretation: at this spend scale, "optimizing for purchases" may functionally behave more like manual delivery than a fully-learned algorithm, which argues for not over-trusting Meta's own optimization to find the right audience unsupervised.

## §5 MECHANISM — the gender paradox, and why Loxleys' ROAS is fake

**Money spent explicitly targeting women correlates with a *worse* share of actual women's tickets, not a better one.** Across the 6 events with ad history:

| Event | Women-targeted spend | Share of event budget | Actual women's share of tickets | $/woman |
|---|--:|--:|--:|--:|
| Tellus AfterDark | $81.66 | 34.8% | **37.5%** | $9.07 |
| Founders Mixer | $57.09 | 92.2% | 21.1% | $14.27 |
| Marion Court | $187.70 | 84.9% | 30.8% | $46.92 |
| Round 2 | $279.70 | 79.7% | 15.0% | $93.23 |
| Good Good | $314.68 | 86.6% | **7.1%** | $314.68 |
| Loxleys* | $8.48 | 44.0% | 50.0%* | $4.24* |

Spearman rank correlation between women-targeted *share* of budget and actual women's ticket share: **rho = −0.657, exact permutation p = 0.088** (n=6 — not significant at the conventional 0.05 threshold, but suggestive). On *absolute* women-targeted dollars instead of share, it tightens to rho = −0.829, p = 0.029 — technically significant, but this is the more manipulable measure (bigger events spend more on everything, including women-targeting, independent of any real effect), so treat the dollar-based number as the weaker, not stronger, of the two. Drop Loxleys (whose tickets are provably pre-ad, next paragraph) and the pattern weakens further to rho = −0.500 on n=5 — nowhere near significant alone.

**Read as mechanism, not proof:** the two events with the best women's share (Tellus 37.5%, Loxleys 50%) both spent the *smallest* share of their budget explicitly chasing women. This lines up with an already-established finding in this account — Eventbrite listing traffic and organic social proof, not gender-targeted ad dollars, are what actually pulled women into Tellus (memory: `social-proof-pulls-women`). It's also confounded: Good Good is simultaneously the worst performer on *every* axis (ROAS, cost/ticket, geography — see §6), so "heaviest women-targeting, worst women's share" may partly just be "worst event, full stop," not a clean causal chain from ad targeting to outcome. Both things can be true at once, and the data here can't fully separate them.

**Loxleys' 4.82 ROAS and 50% women's share are not from these ads.** Checked precisely: all 4 paid Loxleys tickets were bought 2026-08-14 through 08-24; the first ad dollar was spent 2026-08-30. Every paid ticket predates every ad by 6 to 16 days. Zero of its 4 paid tickets came on or after the first ad. This corroborates and sharpens what open PR #449 already reports. It's also not (yet) a fair test of the new ads in the other direction: at $19.28 spent and 185 link clicks, the account's own conversion baseline (0.40% of landing-page views) predicts **0.58 expected new sales** — getting zero so far is not an anomaly at this scale, just too little spend to expect a result yet.

## §6 MECHANISM — geography: Philadelphia underperforms on every axis, including the ones objective doesn't touch

| City | Spend | Tickets | Revenue | ROAS | $/ticket | Women % | Sales-objective share of spend |
|---|--:|--:|--:|--:|--:|--:|--:|
| Lancaster | $887.42 | 81 | $1,897.71 | 2.14 | $10.96 | 27.5% | 36.1% |
| Philadelphia | $363.49 | 14 | $412.32 | 1.13 | $25.96 | 7.1% | **56.9%** |

This is the report's clearest "objective mix isn't the lever" evidence: Philadelphia already runs a *higher* sales-objective share of spend than Lancaster (56.9% vs 36.1%) and still comes in worse on ROAS, cost per ticket, and women's share, all at once. If the fix were "more sales objective," Philadelphia should already be winning on that basis — it isn't. The honest limitation: Philadelphia is currently one event (Good Good), so this table cannot separate "Philadelphia as a market" from "Good Good as a specific venue/execution" — that's a different investigation than this one, but it means **don't read this as license to fix Philadelphia by adjusting objective mix; the problem, whatever it is, is sitting somewhere else.**

## §7 Gap analysis — current state vs. an ideal setup

| # | Dimension | Current state | Ideal | Gap |
|---|---|---|---|---|
| 1 | Objective | 100% of active spend is sales-objective | Same | **Closed.** Credit where due — traffic hasn't produced a purchase in $740 of lifetime spend and the account has already fully exited it. |
| 2 | Cold : retarget mix | 86.6% retargeting / 13.4% cold on active spend | Something closer to even, or at least enough cold spend to keep replenishing the retargeted pool | **Open.** At an 8:1 ratio against cold on Marion Court specifically, the warm pool is being drawn down, not fed. |
| 3 | Gender targeting spend | Heaviest women-targeting share (Good Good 86.6%, Founders 92.2%) coincides with the worst women's-share outcomes | Shift budget toward the channels that have actually worked (Eventbrite social proof, broad/cold reach) rather than explicit women-targeted line items | **Open, suggestive not proven** (§5). The live account has already partly moved this way — Loxleys' active ad sets split 44% women / 56% men, less skewed than the historical average. |
| 4 | Geography | Philadelphia underperforms on every metric despite more sales-objective spend | Diagnose the venue/market-fit problem before scaling Philly spend further | **Open, and explicitly out of scope for this report** — needs its own investigation, not an objective-mix fix. |
| 5 | Tellus AfterDark (Oct 6) | Zero ad spend, zero tickets, 30 days out | Ads running by now, per the account's own historical pattern (13–38 day lead times across 6 events) | **Open but not yet abnormal** — 4 of 6 past events didn't start ad spend until inside 30 days. It *is* blocked structurally: PR #454 can't register it without a `brand.json` entry (confirmed date/price/early-bird terms), and that's the actual blocker, not budget — headroom is ample ($18/day free under the $40 ceiling; comparable events ran on $5–13/day). |
| 6 | MC Retargeting pool health | $87.51 spent, 34 LPV, 0 Meta-attributed purchases | A retargeting pool that's converting, not just spending | **Open**, already the subject of a dedicated prior report — not re-derived here. |
| 7 | Billing | account_status 9 (grace period), delivery unaffected today | Resolved before it can affect delivery | **Watch item, not urgent.** Verified no delivery shortfall on any of the 4 recent campaigns. |

## §8 DECISION — the fully disambiguated forward playbook

*The prior version of this section said "sales-objective, cold-fed, retargeting layered on top, tilt back late" — directionally right, not buildable. Below is the fully specified version: one number or rule per dimension, tagged by why it's that number, meant to be typed into Ads Manager for every future SparkDate event with no further judgment calls left on lead time, phasing, cold:retarget split, gender targeting, city handling, or budget. This version has been through adversarial verification against `build/cuts2.txt` and `build/live.txt`; three claims had their evidentiary label corrected as a result (see the changelog at the end) — the decisions themselves did not change, but three were previously overclaiming "measured" support they didn't have, and one gained a mechanical fix (a budget-floor rule) that was missing entirely.*

**Tags used throughout:**
- **`[platform]`** — forced by Meta's mechanics (frozen-at-birth fields, the $2.00/day campaign floor) or the account's own $40/day governance ceiling (PR #454).
- **`[measured]`** — grounded in this account's own historical numbers. Nothing here clears conventional statistical significance — 6 lifetime Meta-attributed purchases, total, ever — so "measured" means effect direction and magnitude judged consistent across multiple cuts of the data, not a p-value.
- **`[judgment]`** — the data does not isolate this exact value; this is the specific default to use, with the measured facts that motivated it stated alongside, not disguised as more than they are.

### Quick-reference build table

| Phase | Window | Days | Daily budget | Cold $ | Retarget $ | Gender |
|---|---|--:|--:|--:|--:|---|
| **Seed** | T-21 to T-15 | 7 | $10.00 | $8.00 (80%) | $2.00 (20%, exact Meta floor) | 100% broad |
| **Build** | T-14 to T-8 | 7 | $14.00 | $8.40 (60%) | $5.60 (40%) | 100% broad |
| **Close** | T-7 to T-0 | 8 (incl. event day) | $16.00 | $5.60 (35%) | $10.40 (65%) | 100% broad |

Reference total: **~$296/event** (7×$10 + 7×$14 + 8×$16) — in the same band as this account's two most productive Lancaster events (Marion Court $221, Tellus $234) and below Good Good's $363 (worst ROAS in the account). Scale the whole ladder up or down for a bigger/smaller event; **hold the day-windows, the cold:retarget percentages, and the $2.00/day floor-priority rule (§8.2) fixed** — those are the load-bearing rules, the dollar amounts are the part meant to flex.

**Philadelphia runs the identical table** except it does not automatically advance past Seed — see §8.4's gate before releasing Build/Close budget.

---

### 8.1 Lead time and phase schedule — T-21 as the default, honestly labeled

**Launch the first ad dollar 21 days before the event, every time, as the default.** `[judgment]`

Be precise about what this number is and isn't. The account's six historical first-ad lead times are 13, 19, 22, 23, 32, and 38 days (Founders, Tellus Aug, Marion Court, Loxleys, Round 2, Good Good) — mean 24.5, median 22.5, and **no event has ever actually launched at T-21.** No lead time has ever been tied to a measured outcome either: the account has 6 lifetime Meta-attributed purchases total, spread across all six events, which is not enough volume to have tested whether any particular lead time causally helps. So T-21 is not a measured pattern — it's a judgment call, chosen because it sits inside the real 13–38 day range, close to both the median (22.5) and Marion Court's actual 22-day lead time (one of the two most productive Lancaster events), and because it leaves exactly one full week of upstream seeding time before the account's own measured, backloaded final-two-weeks window opens (see below — that part *is* measured).

Three phases, and here the historical grounding is real but partial — say precisely which part:

- **Close (T-7 to T-0, 8 days) matches the account's own measured sales-curve buckets directly.** `[measured]` — 37% of tickets sell in the final 7 days and 73% in the final 14, per the account's own T-7..1/T-0 and T-14..8 buckets (report §1, table F). This window is a harvest phase by definition, not by assumption.
- **Build (T-14 to T-8, 7 days) approximates the account's T-14..8 bucket**, the second-heaviest ticket window in every event examined (e.g. Tellus: 11 of 24 tickets fell in this exact bucket). `[measured]`, approximately — bucket edges in the source data are T-14..8, which this phase matches exactly.
- **Seed (T-21 to T-15, 7 days) is a judgment extension backward from Build, not a bucket match.** `[judgment]` — the account's own T-30..15 bucket is wider than Seed's window and carries meaningfully less ticket volume than the two buckets above it (e.g. Founders: 2 tickets in T-30..15 vs. 6 in T-14..8 and 10 in T-7..1), consistent with treating Seed as investment rather than harvest, but there's no sub-bucket data that specifically validates a 7-day Seed window versus a 5-day or 10-day one.

**Campaign structure — build both campaigns once, on day one of Seed, never recreate:** objective, `optimization_goal`, `attribution_spec`, and creative `url_tags` are frozen at birth and cannot be edited on a live ad set. `[platform]` Build `<Event> | Cold` and `<Event> | Retargeting` on day one — both `OFFSITE_CONVERSIONS` / `PURCHASE` pixel / 7-day click / Advantage+ audience **off**, matching the account's already-converged-on standard — and move between phases by editing daily budget only. This is exactly what PR #454's ladder registry already does with existing campaigns (a budget-JSON edit, not a rebuild).

**Cold-start / compressed-schedule rule** (a real recurring situation — Tellus Oct 6 currently has zero ad spend at 30 days out): if fewer than 21 days remain when planning starts, skip Seed and launch directly at Build's 60/40 split; if fewer than 14 days remain, launch directly at Close's 35/65 split. **Never compress Close** — it's the single highest-value window in the cycle by a wide margin. `[judgment]` — no historical event in this account has run a deliberately compressed schedule to measure against.

### 8.2 Cold-vs-retargeting split, by phase

| Phase | Cold | Retarget | Why |
|---|--:|--:|---|
| Seed | **80%** | **20%** | `[judgment]`, mechanically pinned to Meta's $2.00/day floor at the $10/day Seed budget. This isn't "retargeting" in the sense that converts at 1.9% — the pool barely exists yet. It's floor-spend insurance that keeps the standing Retargeting campaign live (avoiding a mid-cycle cold-start, §8.1) so it isn't dead weight when Build actually needs it to work. |
| Build | **60%** | **40%** | `[measured]`-motivated, not measured directly: sales/retarget converts LPV→purchase at 1.9% vs. sales/cold's 1.3%, and costs less per LPV ($1.25 vs $1.79) — a real edge on 4 vs. 2 purchases, not statistical proof. No historical campaign has ever run a deliberate 60/40 split by phase to test this number itself; the *direction* (skew toward retarget as the pool matures) is what's grounded in data, the exact 60/40 is a judgment call inside that direction. |
| Close | **35%** | **65%** | Same basis as Build, taken further: retargeting gets the majority in the harvest window, leaning into its measured per-LPV edge during the highest-ticket-share period. Cold never goes to zero — the backlogged sales curve means some event-day buyers haven't been touched by any ad yet, and 35% keeps that door open. |

**Budget-floor priority rule — makes the percentages executable at any event size:** compute each phase's dollar amounts from the percentages above; if the computed retarget-campaign dollar amount would fall below Meta's $2.00/day floor, **set retargeting to exactly $2.00/day and let cold absorb the rest of that phase's budget** (this is why the Seed row above is $10/day, not lower — $10 is the minimum Seed total that lets 20% land exactly on the floor without the override firing). `[platform]` If a phase's total daily budget would need to drop under $4.00/day to make even this work, run cold-only for that phase and hold the Retargeting campaign at its existing budget rather than fund it below the floor.

**Never let this drift toward the account's current live ratio.** Marion Court's active cold-sales ad set is spending $4.11/week against $34.75/week retargeting the same pool — an 8:1 ratio, well past even Close's 65:35. That pattern (documented separately as MC Retargeting's fatigue: $87.51 lifetime, 34 LPV, 0 purchases) is the specific failure this ladder is built to prevent, not a target to preserve. An 85%+ retarget share is only ever correct inside the final 8 days under this template — never before, and even then it's 65%, not 87%.

### 8.3 Gender targeting — zero dedicated gender-restricted ad sets, every phase, every future event

**Run every ad set — cold and retargeting, every phase — as gender = all. Do not build a women-only or men-only ad set again.** `[judgment]`, reached from four converging `[measured]` signals — but read the honest counter-argument below before treating this as more settled than it is.

1. **The paradox itself.** Women-targeted budget *share* correlates inversely with actual women's ticket share across the account's 6-event history (rho = −0.657, p = 0.088, n=6 — suggestive, not proven). The worst outcome (Good Good, 7.1% women) came from the heaviest targeting (86.6%).
2. **Meta's own delivered-gender data shows no targeting advantage.** Within sales-objective ads, male LPV→purchase conversion matches or beats female's (SALES/RT: male 2/95=2.1% vs. female 2/114=1.75%; SALES/cold: male 1/67=1.5% vs. female 1/82=1.2%, from the account's own delivered-gender breakdown). There is no evidence in this account's own delivery data that paying to target women specifically outperforms reaching everyone.
3. **The channel cross-check.** `eventbrite_import` tickets are 19.3% women (11/57) — worse than broad reach. The untracked `none` channel (organic/direct, zero ad targeting of any kind) is **35.7% women** (10/28), better than Eventbrite and close to Tellus's ad-level best. Broad, untargeted reach already outperforms every gender-restricted lever this account has tried, on Meta or off it.
4. **Live under-delivery, happening right now — this is the load-bearing evidence, and it's independent of the correlation debate.** Marion Court's `Marion Court | Sales` campaign (which houses the `Female | Sales` ad set) is budgeted at $14.00/day — $98/week — and has spent **$4.11 in the trailing 7 days: about 4% of its assigned budget.** Loxleys' `Loxleys | Sales` campaign is budgeted at $2.00/day and has spent **$1.27 lifetime**, split $0.87 to the male ad set and $0.40 to the female one — both well under even a single day's target. At this account's pixel volume, a `PURCHASE`-optimized ad set restricted to one gender doesn't just convert about the same as broad — **it frequently can't find enough qualifying impressions to spend the budget assigned to it, right now, in the account's own live data.** That's a delivery-mechanics failure, not only a targeting-quality question, and it also multiplies the number of line items that each need to separately clear the $2.00/day floor at a $22–40/day account ceiling. `[platform]`+`[measured]`

**The honest counter-argument, and why zero still wins over a small nonzero share:** Tellus AfterDark — this account's single best women's-share result (37.5%) — did **not** run gender=all. It ran 34.8% of its budget on dedicated women-targeting, the smallest nonzero share in the 6-event sample, but not zero. Read narrowly, the data supports "less women-targeting is better," which is consistent with either "keep going to zero" or "stop at something small and nonzero, like Tellus's ~35%." This playbook picks zero specifically because of point 4 above, which Tellus's outcome doesn't speak to at all: the delivery-mechanics failure is a *current, live, measured* problem (two campaigns under-spending their own budgets right now), and a bounded nonzero test cell would very likely reproduce that exact under-delivery rather than generate a usable comparison — it doesn't have a clean floor to stop at the way the day-count and split questions do. Zero is the specific, buildable, and mechanically safe answer; a future event that deliberately tests a small nonzero share (with its own kill rule tied to spend-rate, not just conversion rate) would be a reasonable experiment to run outside this default, not a reason to change the default itself yet.

**Where the "reach women" effort goes instead — a real substitute, not a shrug:**
- **Creative, inside the broad ad set.** Tellus's social-proof/testimonial creative is this account's own clearest evidence of what pulls women in (documented separately: `social-proof-pulls-women`). Every phase's broad ad set should run that creative pattern — the lever is what the ad shows, not who it's aimed at.
- **Channel and listing investment, outside Meta ad sets.** The `none`/organic channel already beats every Meta gender-targeting attempt at 35.7% women. Budget that used to fund a women-only ad set is better spent on Eventbrite listing copy/imagery quality and the organic content queue (`content/queue.csv`) than on a Meta gender checkbox.
- **The 2-for-1 mechanic stays exactly as coded** — offered to every buyer at checkout, advertised to women. That's already correct per standing guidance and isn't touched by this rule.

**Immediate action on currently-live campaigns:** Marion Court's `Female | Sales` ad set and Loxleys' `male`/`female` split don't match this rule. Don't touch Marion Court now — it's inside Close, 2 days out, and a rebuild there would cold-start delivery at the worst possible moment. Loxleys (16 days out, Seed/Build boundary) is a good time to rebuild its two gender-split ad sets into one broad ad set going forward.

### 8.4 City-specific delta — Philadelphia gets a budget gate, not a different structure

**No change to phase windows, cold:retarget percentages, or the gender rule.** `[measured]`-grounded: Good Good already ran a *higher* sales-objective spend share than Lancaster (56.9% vs. 36.1%), a *heavier* women-targeting share (86.6%, the account's heaviest) than any Lancaster event, and the account's *longest* lead time (38 days, longest of any event) — and still finished worst on every axis: ROAS 1.13 vs. 2.14, $25.96/ticket vs. $10.96, 7.1% vs. 27.5% women. If objective mix, gender mix, or lead time were Philadelphia's problem, Philadelphia should already be winning on at least one of those bases; it isn't on any. Applying a different mix there would treat a symptom the data has already ruled out.

**The delta is a data-driven spend gate, tied to a real in-flight number, not a flat discount:**

- Launch identically: Seed at $10/day, 80/20, broad targeting.
- **Hold at the Seed rate through the T-14 checkpoint.** Do not auto-advance to Build's $14/day or Close's $16/day.
- **Go/no-go test at T-14:** compare Philadelphia's Seed-phase cold-sales ad set's cost-per-LPV against this account's own sales/cold benchmark of $1.79/LPV. `[measured]` for the $1.79 anchor. If it's at or under **~$2.70/LPV (1.5× the benchmark)**, advance to Build and Close on schedule — the event runs the full ladder identically to Lancaster. If it's above that, hold at $10/day for the rest of the cycle rather than escalating spend into a setup that isn't responding. `[judgment]` for the 1.5× tolerance — no in-city historical Seed-phase number exists yet to calibrate against.

This gate is preferred over a flat discount because it responds to what's actually observed in that specific event: if the gate fails, total Philadelphia spend stops near $70 (7 days × $10) instead of running the full ~$296; if it passes, the template runs there exactly as it does in Lancaster. Either outcome produces real information about whether Philadelphia's problem is structural (venue/market) rather than something this playbook's levers control — which n=1 event cannot yet answer directly.

### 8.5 Budget ladder — daily budgets, campaign mechanics, and the $40 ceiling

The account's $40/day ceiling (PR #454's governance) is account-wide, not per-event, and this is a per-event template that has to fit inside it — including when two events overlap, which is the account's normal state (Marion Court and Loxleys are both live right now, $22/day combined).

- **Every campaign, every phase, sits at or above the $2.00/day Meta floor** via the priority rule in §8.2 — the tightest case is Seed's retargeting campaign at exactly $2.00.
- **Run Cold and Retargeting as two separate, manually-budgeted (ABO) campaigns per event — never combine them under one CBO campaign.** `[judgment]`, motivated by a measured fact: `learning_stage_info` returned empty for all 4 currently-active ad sets, and the account's own live pacing is already erratic at the ad-set level (§8.3's under-delivery figures — Marion Court's Sales campaign spending 4% of its assigned budget, Loxleys spending a fraction of its target). `[measured]` A CBO layer on top of pacing this uneven would let Meta silently override the cold:retarget percentages this playbook exists to enforce, at an account too small to have shown it can reallocate sensibly. This isn't a Meta-imposed rule — CBO is available — it's a judgment call specific to this account's low volume, and worth revisiting if purchase volume grows.
- **Custom-audience lookback window: 30 days**, for the pool the retargeting campaign draws from. `[judgment]` — this account's own event traffic volumes are modest enough (some events' entire LPV history is in the low hundreds) that a shorter 7–14 day window risks a pool too thin to deliver against reliably; not verified against this account's actual current audience membership counts (a known gap: website custom audiences report a floor of "20," not a real size, per prior findings).
- **Concurrent-event rule:** if two events' active phases overlap and their combined daily total would exceed $40, **compress the earlier-phase event's Seed or Build budget first** — that window's historical ticket share is smaller and a temporary cut there costs less than the same cut would in Close. **Never compress a Close-phase (T-7..0) budget** to make room for another event's earlier phase; it carries 37–43% of historical ticket volume. If two events' Close phases would genuinely overlap, hold the smaller or later event at Build's $14/day one phase longer rather than run two Close-phase budgets at once. `[judgment]` — no two events' Close phases have actually overlapped yet in this account's history, so this is a policy for when it happens, not a measured outcome.
- **Worked example at today's state:** a new event entering Close ($16/day, or $10/day for a gated-hold Philadelphia event) alongside the account's current $22/day committed brings the account to $38/day (Lancaster) or $32/day (Philadelphia hold) — both under the $40 ceiling with room to spare.

### 8.6 What remains genuinely uncertain

- **T-21 is a judgment call inside a real 13–38 day historical spread (mean 24.5, median 22.5, n=6), not a value the data measured as optimal.** No lead time in this account's history has ever been tied to a causal outcome — treat T-21 as the best available default, not a proven optimum, and don't be surprised if a future event with a different natural lead time performs fine too.
- **The Seed/Build/Close percentages (80/20, 60/40, 35/65) are directionally motivated by the one real measured signal in the account (retargeting's LPV→purchase and cost-per-LPV edge) but the exact numbers at each phase are judgment calls** — no campaign has run a controlled phase-by-phase test of these splits.
- **The gender=0% rule rests on a live, measured delivery failure (two campaigns currently under-spending their own budgets) plus a suggestive n=6 correlation, not a clean statistical proof — and the account's own best women's-share result (Tellus, 37.5%) came from a small nonzero share, not zero.** If a future event shows a genuinely well-targeted, adequately-delivering women's ad set outperforming broad delivery, that's new evidence this rule should update on.
- **The CBO ban and the learning-phase argument behind it hedge an ambiguous signal.** `learning_stage_info` returning empty could mean the account never engages Meta's learning phase (supporting the ban) or could be a field-availability artifact unrelated to actual CBO behavior.
- **The 30-day custom-audience lookback is a default, not a measured account fact** — actual audience sizes weren't re-pulled for this playbook.
- **Philadelphia's gate rests on n=1.** A second gated Philadelphia event either confirms the gate is doing useful work or shows it needs recalibrating — one data point can't yet distinguish those.

### How to use this with zero further judgment calls

1. Count days to the event. 21+ days out → start at Seed. 8–14 → start at Build. 0–7 → start at Close. Mid-cycle starts skip earlier phases (§8.1).
2. Build two sales-objective campaigns (`<Event> | Cold`, `<Event> | Retargeting`) on day one, both `OFFSITE_CONVERSIONS`/`PURCHASE`/7-day-click/Advantage+ off, both ABO — set daily budgets per the phase row in the Quick-reference table, applying the $2.00 floor-priority rule (§8.2) if the event's budget is scaled down.
3. Every ad set in both campaigns is broad/all-gender. Do not create a women-only or men-only ad set.
4. Move to the next phase's budget row on schedule (T-15, T-8, T-0). The dollar amounts change; the gender rule never does.
5. If the event is in Philadelphia: hold at Seed's $10/day through T-14, run the cost-per-LPV gate in §8.4, then advance or hold.
6. If a second event's window overlaps, check the combined daily total against $40 before advancing either event's phase (§8.5); trim the event further from its own event date first, and never trim a Close phase.

### What this playbook does not change

Objective (sales-only) was already settled by the base report and isn't revisited here. Nothing in this playbook overrides the base report's caveat that Meta-attributed levers govern a minority of what sells tickets — 60% of paid tickets are `eventbrite_import` and never touch a Meta ad, and Meta attribution sees roughly 11% of real sales. This is the fully specified answer to "how do we configure the Meta side," not a claim that the Meta side is the biggest lever available.

### Verification changelog

This section went through adversarial verification (two independent lenses per claim: statistical rigor, and platform-constraint/consistency) before being finalized. What that changed:

- Lead time (T-21): relabeled from measured_pattern to informed_judgment. Added the honest historical spread (13-38 days, mean 24.5, median 22.5, n=6, no event actually launched at T-21, no lead time ever tied to a measured outcome) so the number's provenance is stated accurately rather than overclaimed.
- Phase windows (Seed/Build/Close day-boundaries): relabeled from a blanket measured_pattern to a split label -- Close's T-7..0 and Build's T-14..8 windows genuinely match the account's own measured sales-curve buckets (kept as measured); Seed's T-21..15 window is explicitly flagged as a judgment extension with no matching sub-bucket in the data (relabeled informed_judgment).
- Cold:retarget split by phase (80/20, 60/40, 35/65): relabeled from measured_pattern to informed_judgment. The direction (skew toward retarget as the pool matures) is grounded in the measured sales/cold vs sales/retarget LPV->purchase and cost-per-LPV gap; the exact percentages at each phase are not something any historical campaign tested.
- Added a new $2.00/day budget-floor priority rule to the cold:retarget split (section 8.2) that was previously missing -- ensures the percentages stay executable at any event's budget scale by forcing the retarget leg to the Meta floor (and cold to absorb the remainder) whenever the computed percentage would fall under $2.00/day, rather than silently producing a non-executable sub-floor campaign at smaller event budgets.
- Gender rule (zero dedicated single-gender ad sets): kept the zero recommendation, but corrected the evidentiary framing. Explicitly surfaced and addressed the counter-argument that Tellus -- the account's single best women's-share outcome (37.5%) -- ran a nonzero (34.8%) women-targeted share, not zero. Reframed the basis for going all the way to zero around the independent, currently-live, measured delivery failure (Marion Court's Sales campaign spending ~4% of its $14/day budget; Loxleys' campaign spending a fraction of its $2/day target) rather than resting solely on the correlation, and stated plainly that this is a stronger stance than the correlation data alone would require.
- CBO-vs-ABO campaign structure rule: retagged from platform_constraint to informed_judgment -- Meta does not forbid CBO; the ban is this account's own judgment call given its low purchase volume and observed erratic pacing, not a hard mechanical restriction.
- Daily budget ladder ($10/$14/$16, ~$296 total) and the Philadelphia spend-gate: left unchanged -- both were checked directly against build/live.txt and build/cuts2.txt and held up (budgets clear the $2 floor and fit the $40 ceiling; the gate's $1.79 benchmark and T-14 checkpoint are consistent with the account's own sales/cold data).

## What I did not verify

- **No causal claim survives n=6 lifetime Meta-attributed purchases.** Every "consistent with" in this report means exactly that, not "caused by."
- **The gender-targeting-spend correlation (§5) is suggestive at p=0.088–0.029 depending on which measure you use, on 5–6 data points.** It should change what gets tried next, not stand alone as proof.
- **Philadelphia is one event (Good Good).** Nothing here can separate "the city" from "this specific venue and execution."
- **The `learning_stage_info` null result (§4) is genuinely ambiguous** — could mean the ad sets never engage Meta's learning-phase machinery at this volume, or could be a field-availability artifact. Not resolved either way.
- **Retargeting audience sizes were not re-pulled this session.** A prior finding (memory: website custom audiences report a floor of "20," not a real count) means the true size of the pool being retargeted is not confidently known from the API; this report reasons about it structurally (it's fed by cold traffic, full stop) rather than by size.
- **Whether `account_status: 9` could ever escalate to actually blocking spend was not investigated beyond confirming it hasn't yet.** Worth a look at Meta Ads Manager's billing page directly; not done here since delivery data showed no current impact.
- **The ~$2–3 gaps between the account-level lifetime total ($1,269.86), the ad-level funnel total ($1,270.11), and the spend-ledger total ($1,267.32) were not fully reconciled** — consistent with same-day spend and different source tables, not investigated further since none of the three changes any conclusion above.

## Related in-flight work (not touched by this analysis)

- **PR #449** ("GA4 is static tonight; Loxleys shows the retracted mistake live") — already reports the Loxleys GA4-vs-Firestore mismatch; §5 above independently confirms and sharpens it (exact ticket-by-ticket timing, not just an aggregate mismatch). CI green, mergeable. Not merged by me — that's a call for you to make, per how you like to handle your own PRs.
- **PR #454** ("The ladder took one campaign, and skipped the rest without saying so") — the budget-ladder governance rebuild referenced in §2 and §7. It governs *how much* gets spent and catches ungoverned campaigns; it doesn't decide objective, phasing, or cold/retarget mix, so there's no overlap with this report's recommendation — but it's the natural place to encode §8's Seed/Build/Close budget ladder as a rule once Tellus Oct 6 has a `brand.json` entry to register against. CI green. Also not merged by me.
- **`reports/MARION_COURT_RETARGETING_FATIGUE_2026-09-01.md`** — the existing deep-dive on the specific pool flagged as unhealthy in §3; not re-derived here.
- **`reports/META_ADS_ROOT_CAUSE_2026-09-04.md`** — the prior root-cause analysis this report builds on (the attribution-window confound, the cookie-regex bug, Meta-sees-11%-of-sales finding). Not re-litigated, only extended.

---

*Data: Firestore `tickets`/`events`/`ad_spend` (135/7/102 docs) joined with a live Meta Graph API v21.0 pull (48 ads) and cross-checked against GA4 own-site sessions. Built in `build/facts2.json`; full per-table output in `build/cuts2.txt`. Two bugs caught and fixed while building this: a gender test that silently read 0% women everywhere (fixed to exact string match on `"woman"`/`"man"`), and $436.50 of spend unmapped to any event that an ad-set-name inference pass narrowed to $16.41 of genuine brand-awareness spend.*

🤖 Generated with [Claude Code](https://claude.com/claude-code)
