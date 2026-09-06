# Ads objective gap analysis: what sold under which objective, what's live now, and the sales-vs-sales+retargeting call

2026-09-06. Scope: every dollar of Meta spend and every paid ticket across all 7 events to date, cut by campaign objective (traffic vs. sales), by structure (cold prospecting vs. retargeting), by gender, and by geography (Lancaster vs. Philadelphia). Built from a fresh Firestore + live Meta Graph API join, not from any single platform's own attribution.

**The headline: the objective question has already answered itself.** Every currently active ad in the account is sales-objective — traffic objective is 100% paused or archived, and lifetime it produced one add-to-cart and zero purchases across $740 of spend. The account got here correctly on its own. What's still open is *within* sales objective: the current mix is 86.6% retargeting / 13.4% cold on money still flowing, which is too far toward retargeting to keep feeding itself, and a genuine, separate finding on gender — money spent explicitly targeting women correlates with *worse* results, not better.

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

## §8 DECISION — sales-objective alone, or sales-objective + retargeting?

**Sales-objective, fed by cold prospecting, with retargeting layered on top — not sales-objective alone, and not the current 87/13 split either.**

The reasoning:

1. **Traffic objective is closed, not undecided.** Zero purchases across $740.23 and 2,673 link clicks, lifetime. There's no version of "bring traffic back" that this data supports, confound or not.
2. **Retargeting has no independent audience.** It only exists by spending against people cold prospecting already reached. The cleanest unconfounded comparison available (sales/cold vs. sales/retarget, both on the same 7-day window) shows retargeting converting better per LPV — but "sales-objective alone" with no cold component would starve that exact advantage within weeks, because nothing would be filling the pool it retargets. The current 86.6%/13.4% split is close to doing that already: Marion Court's cold-sales ad set spends $4.11/week against $34.75/week retargeting the same shrinking pool.
3. **The recommendation, concretely:** keep sales-objective as the only objective running. Within it, move the mix from ~87/13 back toward something like 55/45 or 60/40 cold-to-retarget on any event still more than 2 weeks out — there's real headroom to do this without new budget, since the account is running $22/day against a documented $40/day ceiling (PR #454). Once an event is inside its final 1–2 weeks (matching the established pattern that 73% of tickets sell in the last 14 days), tilting back toward retargeting the warm pool built over the campaign's life is reasonable — that's roughly what Marion Court is doing right now, 2 days out.
4. **Caveat that matters more than the recommendation itself:** ad objective, cold-vs-retarget mix, and gender targeting only govern the minority of what actually sells tickets. 57 of 95 paid tickets (60%) are `eventbrite_import` and never touch a Meta ad; only 1 of 96 carries an `fbc` cookie at all. Meta attribution sees roughly 11% of real sales. Getting the objective mix right is worth doing — it's what this report was asked to answer — but it's optimizing the smaller lever. The bigger one (Eventbrite/organic/listing-site reach — already the subject of separate reports on LancasterOnline and the content queue) sits outside this analysis.

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
- **PR #454** ("The ladder took one campaign, and skipped the rest without saying so") — the budget-ladder governance rebuild referenced in §2 and §7. It governs *how much* gets spent and catches ungoverned campaigns; it doesn't decide objective or cold/retarget mix, so there's no overlap with this report's recommendation — but it's the natural place to encode "55/45 cold-to-retarget" as a rule once Tellus Oct 6 has a `brand.json` entry to register against. CI green. Also not merged by me.
- **`reports/MARION_COURT_RETARGETING_FATIGUE_2026-09-01.md`** — the existing deep-dive on the specific pool flagged as unhealthy in §3; not re-derived here.
- **`reports/META_ADS_ROOT_CAUSE_2026-09-04.md`** — the prior root-cause analysis this report builds on (the attribution-window confound, the cookie-regex bug, Meta-sees-11%-of-sales finding). Not re-litigated, only extended.

---

*Data: Firestore `tickets`/`events`/`ad_spend` (135/7/102 docs) joined with a live Meta Graph API v21.0 pull (48 ads) and cross-checked against GA4 own-site sessions. Built in `build/facts2.json`; full per-table output in `build/cuts2.txt`. Two bugs caught and fixed while building this: a gender test that silently read 0% women everywhere (fixed to exact string match on `"woman"`/`"man"`), and $436.50 of spend unmapped to any event that an ad-set-name inference pass narrowed to $16.41 of genuine brand-awareness spend.*

🤖 Generated with [Claude Code](https://claude.com/claude-code)
