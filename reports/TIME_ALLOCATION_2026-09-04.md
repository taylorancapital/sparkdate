# Where the next four months should go — SparkDate against the alternatives (2026-09-04)

**This report changes no code.** It adds this file and nothing else.

**Data.** Firestore (`sparkdate-philly`) read live 2026-09-04: `tickets`,
`events`, `ad_spend`, `recurring_costs`, `users`, `matches`,
`connection_intents`, `leads`. Git history of this repo, 2026-05-02 → 2026-09-04.
`reports/META_ADS_REVIEW_2026-09-02.md` for the ad-level attribution.
Ticket revenue is **gross** — no payment-processor or Eventbrite fee is recorded
anywhere in the system, so every margin figure here is an **overestimate**. §7
lists what that hides.

---

## The answer in one paragraph

SparkDate works. It is a real business that has sold 131 seats across six events
and taken $2,279.41. It is also, measured honestly, returning about **$9.57 per
day worked** before fees, venue costs and your own time — and the returns to
*engineering* on it collapsed months ago: June bought $36.03 of net contribution
per merged PR, August bought $2.52. The thing that grew 22x between those months
was your effort, not the business. But the four months were not a bad trade,
because the asset you built is not the codebase and not the events company — it
is a documented, adversarial, four-month record of running autonomous agents
against live money and live APIs, including every way they lied to you. That is
scarce, it is exactly what the market you are describing pays for, and it does
not currently exist anywhere outside this repo. The recommendation is not to
quit SparkDate. It is to stop paying tuition on the part that has finished
teaching: cap the events business at maintenance, keep it running *as the
testbed*, and spend the reclaimed hours making the agent-reliability work
legible to people who buy it.

---

## Four numbers

| | |
|---|---|
| Gross ticket revenue, 6 events, 125 days | **$2,279.41** |
| Ad spend over the same period | $1,239.28 |
| Net contribution per day worked (92 days) | **$9.57** — before fees, venue, time |
| Merged PRs over the same period | **364** |

---

## 1. EVIDENCE — what the business actually returns

Six events, four of them complete, two still selling:

| Date | Event | Seats | Paid | Gross | Women | Men | %W |
|---|---|---:|---:|---:|---:|---:|---:|
| 2026-06-24 | Founders Mixer | 21 | 18 | $368.93 | 6 | 15 | 29% |
| 2026-07-29 | Round 2 — Summer Nights | 29 | 20 | $468.29 | 9 | 20 | 31% |
| 2026-08-26 | Tellus AfterDark | 30 | 24 | $599.24 | 13 | 17 | 43% |
| 2026-08-31 | Good Good Night | 20 | 14 | $412.32 | 4 | 16 | 20% |
| 2026-09-08 | Marion Court *(selling)* | 16 | 11 | $282.18 | 6 | 10 | 38% |
| 2026-09-22 | Loxley's Social *(selling)* | 9 | 4 | $92.96 | 4 | 5 | 44% |

**131 tickets, 94 paid, 36 free** — 27% of every seat sold so far has been free.
**44 women to 84 men** across all ticket holders: 34%.

Where the money comes from:

| Source | Tickets | Gross |
|---|---:|---:|
| Eventbrite import | 76 | **$1,262.61** |
| Own site | 44 | $964.65 |
| Meetup import | 2 | $52.15 |
| Comp / manual | 9 | $0.00 |

**55% of all revenue arrives through Eventbrite** — a channel this codebase does
not own, cannot instrument, and (per `reports/GA4_ANALYSIS_2026-09-01.md`) fires
no analytics at all. The single best-converting surface in the business is the
one the software has the least purchase on.

## 2. EVIDENCE — the returns to engineering collapsed in July and never recovered

| Month | Tickets | Gross | Ad spend | Net | PRs merged | **Net per PR** |
|---|---:|---:|---:|---:|---:|---:|
| 2026-06 | 29 | $468.40 | $108.15 | $360.25 | 10 | **$36.03** |
| 2026-07 | 26 | $424.31 | $364.01 | $60.30 | 84 | **$0.72** |
| 2026-08 | 69 | $1,261.44 | $711.24 | $550.20 | 218 | **$2.52** |
| 2026-09 (4 d) | 6 | $125.26 | $55.88 | $69.38 | 52 | **$1.33** |
| **Total** | **131** | **$2,279.41** | **$1,239.28** | **$1,040.13** | **364** | **$2.86** |

Read the June and August rows together. Revenue grew **2.7x**. Net contribution
grew **1.5x**. Merged pull requests grew **22x**.

**MECHANISM.** This is not a claim that the August work was wasted — a good part
of it *built the measurement* that made the rest of this report possible, and the
ad infrastructure plausibly contributed to August being the best revenue month.
Grant all of that in full. August still bought $550.20 of net contribution for
218 merged pull requests and 25 days at the keyboard. There is no reading of
that row on which the engineering is the constraint being relieved.

**The cadence, for scale.** 686 commits across **92 distinct working days out of
125** — 74% of all calendar days, including the day of this writing. 41% of all
commits land between 20:00 and 01:00. 65,584 lines under version control:
30,592 in `public/`, 16,148 in `scripts/`, 8,390 in `tests/`, 6,762 in `api/`,
3,331 in `lib/`. 68 scripts, 49 test files, 16 API endpoints, 43 reports.

That is a serious four months of output by any professional standard. It is
being paid $9.57 a day.

## 3. EVIDENCE — 364 PRs did not move the number the business runs on

The binding constraint on a mixed-gender singles event is women in the room.
Across four completed events the female share of ticket holders went **29% →
31% → 43% → 20%**. That is noise around a mean of ~34%, with no direction.

The measured attendance is worse than the ticket mix. At Good Good, four women
held tickets and **one** was in the room
(`reports/EVENT_DEBRIEF_GOOD_GOOD_2026-08-31.md`) — and three of those four
tickets were free ones issued through an Eventbrite ticket type nothing in this
repo created or can see.

Meanwhile the ad account has spent $1,197.77 across 40 delivered ads and Meta
can attribute **six purchases** to all of it, three of them women
(`reports/META_ADS_REVIEW_2026-09-02.md`).

**MECHANISM.** The two things capping this business are (a) how many women will
walk into a bar alone to meet strangers, and (b) a room that holds 20–30 people.
Neither is a software problem. Four months of shipping confirms it from the
other direction: the software got dramatically better and the ratio did not
move.

## 4. MECHANISM — the ceiling, computed

Best event to date realised $599.24 on 30 seats — $19.97 a seat after comps.
Run that at two events a month, every month, with no bad nights:

- **~$14,400 a year gross**, single market, at your best-ever performance
- less ads at the current run rate (~$700/month → $8,400/year)
- less venue costs, which **are recorded nowhere** and are therefore missing
  from every figure in this report
- less Eventbrite and Stripe fees, also unrecorded (§7)

The events business is real and it is honest work. It is also a **services
business with a linear ceiling**: every dollar needs a seat, every seat needs a
room, every room needs a night of your life. Software has essentially no
leverage over that curve — which is precisely what §2 and §3 measured happening.

## 5. EVIDENCE — what you actually built that is scarce

Not the dating site. This:

- A **headless nightly agent** (`run-nightly-claude-code.ps1` → `claude --print`
  in a dedicated clone) that pulls the GA4 Data API and Meta insights, writes a
  full analysis, commits exactly one file, and opens a PR — with a **second
  scheduled job at 09:00 that fact-checks the first one's output.** 24 run logs
  over the 34 days since 2026-08-02.
- `scripts/audit-facts.js` — a cross-surface factual-consistency diff, built on
  the premise, recorded in memory, that *agreement between surfaces is not
  evidence of truth*.
- A UTM convention **enforced at build time** with tests that gate with no API
  token present (`scripts/ad-utm.js`, `tests/ad-utm.test.js`) — after the
  token-dependent linter proved it could not.
- 8,390 lines of tests around code whose main author is an agent.
- 43 reports in `reports/`, several of which exist specifically to record that
  an earlier version of themselves was **wrong** — the Good Good debrief opens
  by retracting its own first draft's central claim.

And, most valuable of all, a **failure catalog**. `CLAUDE.md` and the memory
files are four months of documented, specific ways autonomous agents went wrong
against live systems with real money behind them:

- Two sessions sharing one checkout: a pushed commit **overwritten** when the
  other session reused the branch name; a commit landing on the wrong session's
  branch; a PR shipping a **stale script** that would have silently reverted a
  fix already verified against the live Meta API.
- An analysis that diffed video **rendition** IDs against creative `video_id`s —
  two different ID spaces — and produced a confident headline of "zero matches"
  and a bad PR.
- `tracking_specs` replaced rather than appended, which would have dropped
  landing-page-view tracking from live ads.
- A nightly that silently did not run on 8 of 23 nights because
  `StartWhenAvailable` and `RunOnlyIfNetworkAvailable` were both `False`.

**This is the part that does not exist elsewhere.** Almost everyone writing
about agent reliability is writing about demos. You have four months of an agent
operating a real business's ad account, analytics and publishing pipeline, with
your own money at risk, and a written record of every time it was confidently
wrong. The events business paid for that education. It has now finished
delivering it.

## 6. NOT VERIFIED — the market you are pointing at

You said people are exiting at extremely high values in AI. That is true at the
top and the distribution underneath it is severely skewed. The published 2026
figures say: **92% of M&A deals close under $50 million**, and the *average* AI
M&A valuation runs roughly **2x the median** — which is another way of saying
the headline number is not the number most sellers see. The modal AI "exit" now
is the acquihire or reverse-acquihire, where the acquirer hires the team and
licenses the technology; a small senior team prices in the **$8–16M** range in
total consideration, *before* IP is valued at all.

I have not verified these against primary filings; they are secondary sources
and should be treated as directional. **But the structural point survives any
correction to the numbers: that market buys operators, not repositories.** The
acquihire prices the four people who can do the thing. Nothing in that pricing
model rewards you for having a codebase; it rewards you for being demonstrably
the person who has already solved the hard part on real systems.

Which means the strategic question is not "what should I build instead." It is
**"what makes the thing I can already do visible to the people who buy it."**

## 7. DECISION — three options, honestly priced

**Option A — keep building SparkDate software.** Provably the worst of the
three. §2 prices the marginal PR at $1.33–$2.52. The constraint is women in the
room and 30-seat venues (§3, §4); no PR reaches either. Recommend against.

**Option B — productise the ops layer.** Turn the nightly agent into "an agent
that reads your ad and analytics accounts and files an honest report." The
mechanism works and you have it running. But the moat is thin, the space is
crowded, and it puts you back into building rather than into the market that
§6 says pays. Recommend as a *portfolio artifact*, not as a company.

**Option C — cap the business, cash the education. Recommended.**

1. **SparkDate to maintenance.** Keep it running — it is a genuine revenue line
   and, more importantly, it is the **testbed that makes every claim you make
   about agent reliability verifiable.** That is exactly what a demo cannot buy.
   Freeze feature work. Every remaining item in `HANDOFF.md` that matters is a
   business decision, not code: the venue emails, the F&B model, the per-city
   pricing, whether to seat an attendee with no gender on file.
2. **Publish the failure catalog.** The worktree collision log, the rendition-ID
   wrong headline, the `tracking_specs` near-miss, the nightly that failed 8 of
   23 nights silently. Written up honestly, that is the most credentialing
   artifact in this repo and it is currently invisible inside a `CLAUDE.md`.
3. **Take paid work at market rate.** Any serious contract rate exceeds $9.57 a
   working day by three orders of magnitude. This is the whole argument in one
   line.
4. **If you build a product, build it where you have ground truth** — agent
   output verification — not where you have a 30-seat ceiling.

The framing that matters: **do not build toward an exit.** §6 says that market
prices people who have provably done the hard thing. You spent four months and
about $1,400 of real money becoming one of them. Stop buying more of the same
lesson.

---

## What I did not verify

- **No fee data exists in the system.** Neither Eventbrite's nor Stripe's cut is
  recorded anywhere. At standard published rates the **94 paid** tickets (the
  other 36 are free, and one is refunded) would carry very roughly $210 of fees, which would drop
  net contribution from $880.13 to about $670 and the daily rate from $9.57 to
  about **$7.28**. That estimate is arithmetic on public rate cards, not
  measured — the real figure could be materially different.
- **Venue costs are recorded nowhere at all** and are not in any figure here.
  Every margin number in this report is therefore too high by an unknown amount.
- **`recurring_costs` has two months filled and September blank** — the known
  failure mode in memory (`recurring-costs-are-hand-entered`), which flatters
  every cost figure.
- **"92 working days" is commit days, a proxy for hours.** There is no time log.
  The real hours could be well above or below what that implies, and unlogged
  non-coding hours — venue calls, running the events themselves — are entirely
  absent, which makes the per-day return *worse*, not better.
- **Attendance is a floor, not a count** (`checkin-counts-undercount-attendance`;
  the Good Good debrief records the host himself reading as a no-show).
- **The two September events are still selling.** Their rows will improve.
- **The §6 market figures are secondary sources**, not primary filings.
- **I did not look at your other income, obligations, runway, or what you
  actually enjoy doing.** All four could reasonably override this entire report,
  and none of them is in the data.
