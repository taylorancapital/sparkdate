# Field notes — September 2026

**Four new incidents. None of them caught by anything automated.**

*Edition 2. Window: 2026-09-04 12:25 EDT (the commit of edition 1) to
2026-09-04 20:10 EDT. Incidents 19–22, continuing from edition 1
(`reports/NOTHING_THREW_2026-09-04.md`, incidents 01–18, May–September 2026).*

**Read the window before the count.** This edition covers under eight hours, not
a month, because edition 1 shipped this morning and `/field-notes` was run the
same evening to test it. Four incidents in eight hours is not a monthly rate —
it is what happened while **four Claude sessions ran in parallel** on ads and
GA4 work. Treat it as a measurement of incidents per agent-hour under
concurrency, and do not compare it to a future edition covering a quiet month.

If `/field-notes` runs again later in September it should **extend this file,
not replace it** — the window above is the thing to move.

## Detection

| Detection | This edition | Cumulative |
|---|---:|---:|
| `GATE` — a deterministic check refused it | 0 | 1 |
| `THREW` — an actual error surfaced | 0 | 1 |
| `HUMAN` — someone distrusted a number | 1 | 9 |
| `OPERATOR` — reported as "data went missing" | 0 | 1 |
| `LATER` — found by an unrelated dig | **3** | **10** |
| **Total** | **4** | **22** |

**The automated share went down, and that is the finding.** Edition 1 closed at
2 of 18 caught by the system — 11%. This edition is **0 of 4**. Cumulatively
**2 of 22, or 9%**.

Edition 1's countermeasures were written in September and their entire
justification is that this ratio should climb. It has not. Nothing here is
evidence they do not work — three of the five (the gate, the worktrees, the
read-back) guard failure modes that did not recur this window, so they were
never given the chance. But the honest reading is that **the four failures this
window were all in territory no countermeasure covers: the correctness of what
an agent concludes from an API.** The gate checks the *shape* of output, not
whether it is true.

Three of the four were found `LATER`, by an unrelated dig. The fourth was found
because Taylor asked a question.

---

## A. The agent was confidently wrong

### 19 — 245 GA4 fields declared empty without probing them

An audit of the analytics property's coverage concluded that 245 fields were
"structurally empty because every ad we run is on Meta." The claim was written
from **category names** rather than from probing the fields.

It was wrong in three separate ways, all found on 2026-09-04:

- The `sessionGoogleAds*` family is **real and populated** — genuine account
  name, campaign id, campaign type, ad network — because a Google Ads account
  is in fact linked.
- `sessionSa360Medium` and `sessionDv360Medium` return a literal `"cpc"` and
  `"cpm"` **on every row**, including rows whose real source is `(direct)`,
  `eventbrite / listing` or `google / organic`. Constant placeholders, not
  empty. **More dangerous than empty, because they look like data.**
- The honest reason to skip most unread dimensions turned out to be that 195 of
  them return rows whose every value is `(not set)` — a different fact with a
  different remedy.

**Cost:** $37.91 of live Google Ads spend stayed unread for months (incident 20
carries that cost; it is not counted twice here). The durable cost is the
method: triaging an API's fields by category name produces confident, checkable,
wrong claims, and this one sat in a memory file being cited.

**Anchor:** memory `ga4-fields-that-are-switched-off`, rewritten
2026-09-04T14:54Z with an explicit `**CORRECTED**` block; probes against
property `536859339`'s `properties/{id}/metadata` endpoint, range 2026-05-19 on.

### 20 — A capability probe that tested metrics in isolation

GA4's `advertiserAd*` family and `returnOnAdSpend` **error when queried alone**,
returning *"Please add sessionCampaignName to make the request compatible."*

Any probe that tests metrics one at a time therefore concludes they are
unavailable. They are not — they work paired with a campaign dimension.

**Cost:** $37.91 of Google Ads spend invisible to every report written before
2026-09-04. **$35.35 of it bought 110 clicks and zero attributed sessions**, and
nobody knew, because Meta spend auto-syncs and `recurring_costs` is hand-entered
so Google spend lands in neither path. Every CAC figure in every report is
understated by that amount.

**Anchor:** memory `google-ads-spend-is-unread`, 2026-09-04T15:52Z; measured
2026-05-19 → 2026-09-03; last charge 2026-07-24.

*Classification note: filed under A rather than B. The probe's* result *was
correct — the query genuinely failed — but the* conclusion *drawn from it was
wrong, and that is what this class describes.*

### 21 — Correlation presented as causation

A live read of every campaign found `OUTCOME_SALES` holding all 5 purchases on
$373.49 and `OUTCOME_TRAFFIC` holding **0 on $254.14 and 1,156 landing-page
views** — near-identical money, nine times the visitors, nothing. It was
presented as establishing that the traffic objective does not sell.

It does not establish that. Tested per dollar, **p = 0.224**. With six lifetime
conversions the account cannot support a causal claim in either direction.

**Cost:** none realised — no ad was changed on it. The finding was corrected the
same day, and the corrected memory now opens with the retraction rather than
burying it.

**Anchor:** memory `traffic-objective-never-sold`, 2026-09-04T15:43Z, whose
first block reads *"Corrected the same day, after Taylor asked whether it was
truly causal… I first presented them as if they did."* Campaign figures measured
live 2026-08-05 → 2026-09-04.

**Detection: `HUMAN`.** Taylor asked whether it was causal. Nothing in the
pipeline would have caught it — the numbers were all correct.

---

## C. Silent failure — reported success against the wrong inputs

### 22 — The nightly's two halves run different versions of the code

`run-nightly-claude-code.ps1` pulls data in **steps 1–3 from the main checkout's
working tree**, and runs its **analysis in step 6 from a branch cut from
`origin/main`**. The two can be different code.

So merging a change to a pull script does not change what gets pulled. It
changes only what the analysis reads *about*.

This bit on 2026-09-04. PR #430 merged, taking the GA4 pull from 28 tables to
46. A `-Force` run minutes later still wrote **28 files**, because the main
checkout was five commits behind `origin/main` and had not been pulled that
session.

**Cost:** the report in PR #433 (`reports/GA4_ANALYSIS_2026-09-04.md`) was
written by current analysis code against stale data. **The run exited 0, the
gate passed it, and it opened a PR.** Nothing in the log said the inputs were
old — there is no line for it to write.

This is the sharpest illustration in either edition of what the gate does and
does not do: it verified the output's *shape* (one commit, one `reports/*.md`,
clean tree) perfectly, and had no opinion about whether the inputs were current.

**Anchor:** memory `nightly-pulls-from-stale-main-checkout`, 2026-09-04T16:06Z;
PR #430, PR #433; `git rev-list --count HEAD..origin/main` = 5 at the time.

**Not fixed.** The durable fix — have the launcher fast-forward the main
checkout, or run the pull scripts out of the nightly clone so steps 2 and 6
cannot disagree — is not done. Until it is, this recurs after every merged
change to a pull script.

---

## Recurrences

**Incident 10 — a nightly that simply did not run.** No `2026-09-03.log` exists.
September's nightly logs are 09-01, 09-02, 09-04.

**No countermeasure was defeated, because none was ever built.**
`StartWhenAvailable` and `RunOnlyIfNetworkAvailable` are still both `False` on
the 02:00 task; edition 1 recorded that fixing them needs an elevated shell and
nobody has run one. This is a known-unfixed issue recurring on schedule, not a
fix that failed.

Worth noting how close this came to being missed: the logs folder holds
`review-2026-09-03.log` from the 09:00 review task, so a check that asks "is
there a log for 09-03" answers yes. The first draft of `/field-notes` would have
reported a false negative here — in the section whose entire purpose is catching
silence, which is the same failure class as incident 10 itself. Fixed in #437
before this edition was written.

---

## What changed in response

Two things this window, neither of them a countermeasure against the four
incidents above:

- **`/field-notes` itself** (#437) — this document's own command, plus a monthly
  read-only sweep task. Three defects in it were found by running it by hand
  before it ever fired unattended, including the false negative described above.
- **Customer PII removed from the public repo** (#434) — ten tracked files
  carried real attendee names and email addresses, including four full names
  attached to gender and attendance at a singles event. Pseudonymised rather
  than redacted, because the duplicate-name pairing is the finding in that
  report. Not an agent failure and not catalogued as an incident; recorded here
  because it happened in the window and someone reading the trend should know
  what else was going on.

**Nothing was built this window that would have caught incidents 19–22.** All
four are failures of *what an agent concluded*, and every existing countermeasure
guards *what an agent produced*.

---

## Looked at, could not anchor

Three candidates were examined and left out, per the inclusion bar. Recording
them because they may be real and may need someone who remembers:

- **The T-14 sales curve against PR #431's "the sales stopped nine days ago."**
  73% of tickets historically sell in the final 14 days, which is a caution
  about reading a drought too early. But #431 states the delivery is fine and
  the last attributed purchase was 08-26 — both true — and I could not
  establish that it drew a wrong *conclusion* from them. A caution about
  interpretation is not a documented error.
- **The `relationship_statuses: [1]` targeting filter**, which removes 80% of
  reachable audience and sits on Marion Court but not Loxleys. Real and
  significant, but it is an ads-configuration fact; an agent's behaviour is not
  clearly in the causal chain. The arguable version — that
  `MARION_COURT_RETARGETING_FATIGUE_2026-09-01.md` called it a retargeting-pool
  halver when it is on the prospecting sets that fill that pool, so the loss
  compounds upstream — is incompleteness rather than error. **Judgment call,
  deliberately left to a human.**
- **Automatic placements putting 86% of Marion Court spend into Instagram
  Stories.** Same reasoning: a platform default doing what defaults do.

---

## What this is and is not

- **One project, one operator.** These are incidents from a single small
  business, not a survey. The frequencies are not a base rate for anything, and
  this edition's eight-hour window makes that especially true.
- **Selection bias runs in the obvious direction.** This catalogue holds the
  failures that were *noticed*. With 0 of 4 caught by anything automated this
  window and 2 of 22 cumulatively, assuming the list is complete would be the
  same error it documents.
- **The window is not a month.** See the standfirst. Do not read four incidents
  in eight hours as a rate.
- **"Cost" means what was lost or nearly lost**, from logs, commits and API
  reads taken at the time. Where an incident was caught before costing
  anything — 21 — that is stated rather than counted as a loss. Where two
  incidents share one cost — 19 and 20 — it is counted once.
- **Not a claim the agents were unusually bad.** What is specific to agents is
  the rate at which confidently-wrong output is produced and the ease with which
  it reaches a pull request. Three of this edition's four were wrong
  *conclusions* from correct API reads, which is the failure mode no schema
  check can see.
- **Names, account identifiers and customer records are omitted throughout.**
