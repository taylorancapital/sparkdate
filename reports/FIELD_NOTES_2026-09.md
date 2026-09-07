# Field notes — September 2026

**Seventeen incidents through 2026-09-07. Eleven of them found by a
subsequent, unrelated dig — none by a human's question, none by a gate.**

*This file has now been written in three passes. Edition 2 (2026-09-04,
`#438`) added incidents 19–22 on top of edition 1's May–September retrospective
and said explicitly: "if `/field-notes` runs again later in September it
should extend this file, not replace it." This pass, 2026-09-07, does two
things: folds in the seven September-dated incidents that edition 1 had
already catalogued (01, 02, 06, 07, 10, 13, 14 — see
`reports/FIELD_NOTES_2026-05.md` for why a May incident can be numbered
higher than these), so this file is a complete September record rather than
one slice of it; and extends the window from edition 2's 2026-09-04 20:10 EDT
cutoff through today, adding incidents 29–34.*

## Detection

| Detection | September (full, 17) | Cumulative (34) |
|---|---:|---:|
| `GATE` — a deterministic check refused it | 1 | 1 |
| `THREW` — an actual error surfaced | 0 | 4 |
| `HUMAN` — someone distrusted a number | 5 | 11 |
| `OPERATOR` — reported as "data went missing" | 0 | 1 |
| `LATER` — found by an unrelated dig | 11 | 17 |
| **Total** | **17** | **34** |

**Eleven of September's 17 were `LATER` — found by a dig that was looking for
something else.** Zero were `OPERATOR` and zero were `THREW`. Every single one
of the six incidents newly added in this pass (29–34) is `LATER`. That is not
a selection artifact of this catch-up: five of the six were found by the
project's own multi-agent adversarial-verification habit (root-cause digs,
audit closeouts, a workflow's own follow-up edit) turning up something the
first pass missed, which is a real and growing pattern in how this project
finds its mistakes now, not just how this document finds them.

**The automated share (`GATE`+`THREW`) keeps falling as volume rises.** Across
the full retroactive catalogue: May 0% (0/1) → June 50% (2/4, small-sample —
two same-day syntax/init errors) → July 50% (3/6) → August 23% (4/17) →
September 15% (5/34 cumulative). Edition 1 reported this as "2 of 18, 11%";
edition 2 as "2 of 22, 9%." Both were correct readings of what existed at the
time. The fuller picture, now that May–July are on the record, is that the
early ratio was never really higher — it was a smaller denominator with two
loud, fast, code-level bugs (incidents 25, 26) that happen to announce
themselves the moment anyone loads the page. As the incidents get subtler
(wrong conclusions from correct data, not wrong code), the share that any
existing check could plausibly have caught drops, because none of the checks
built so far look at whether a *conclusion* is true.

---

## A. The agent was confidently wrong

### 01 — Two ID spaces that never match · `HUMAN`

2026-09-02. An analysis compared an ad creative's `video_id` against the
`object_id`s in a video-engagement audience. The first is the source upload;
the second is the delivered rendition — the platform's auto-generated crops.
They can never match, even for the same video.

**Cost:** a false headline that the retargeting audience contained none of
the running videos, an entire "the funnel was never wired up" conclusion
built on top of it, and a pull request. The audience was correctly scoped the
whole time.

### 02 — A share of 105% · `LATER`

Found reviewing PR #400, 2026-09-02. Meta's insights API returns different
conversion counts for the same window with and without a gender breakdown. A
report divided a breakdown numerator by an un-broken denominator, printing
"women's share of landing-page views: 105.00%."

**Cost:** published and nobody noticed. The impossible figure was the visible
tip; every other gender-split cost in that report sat on the same mismatch and
looked fine. `scripts/meta-ads-review.js` now flags any breakdown-vs-total
disagreement over 2% by name.

### 19 — 245 GA4 fields declared empty without probing them · `LATER`

2026-09-04. An audit of the analytics property's coverage concluded that 245
fields were "structurally empty because every ad we run is on Meta," written
from category names rather than from probing the fields. Wrong three separate
ways: the `sessionGoogleAds*` family is real and populated (a Google Ads
account is in fact linked); `sessionSa360Medium`/`sessionDv360Medium` return a
literal `"cpc"`/`"cpm"` on every row regardless of real source — constant
placeholders, more dangerous than empty because they look like data; and 195
of the remaining fields return `(not set)`, a different fact with a different
remedy.

**Cost:** $37.91 of live Google Ads spend stayed unread for months (incident
20 carries that cost; not counted twice here). The durable cost is the
method — triaging an API's fields by category name produces confident,
checkable, wrong claims.

**Anchor:** memory `ga4-fields-that-are-switched-off`, rewritten
2026-09-04T14:54Z with an explicit correction block.

### 20 — A capability probe that tested metrics in isolation · `LATER`

2026-09-04. GA4's `advertiserAd*` family and `returnOnAdSpend` error when
queried alone ("Please add sessionCampaignName to make the request
compatible"). A probe that tests metrics one at a time concludes they are
unavailable; they are not — they work paired with a campaign dimension.

**Cost:** $37.91 of Google Ads spend invisible to every report written before
2026-09-04, $35.35 of which bought 110 clicks and zero attributed sessions —
unknown, because Meta spend auto-syncs and `recurring_costs` is hand-entered,
so Google spend landed in neither path. Every CAC figure in every prior report
is understated by that amount.

### 21 — Correlation presented as causation · `HUMAN`

2026-09-04. A live read of every campaign found `OUTCOME_SALES` holding all 5
purchases on $373.49 and `OUTCOME_TRAFFIC` holding 0 on $254.14 and 1,156
landing-page views, presented as establishing that the traffic objective does
not sell. Tested per dollar, p = 0.224 — with six lifetime conversions the
account cannot support a causal claim in either direction.

**Cost:** none realised. Taylor asked whether it was causal; the finding was
corrected the same day.

### 29 — A wrong headline reached `main` and had to be retracted · `LATER`

2026-09-04, 21:45 EDT, PR #446. The 2026-09-04 delivery diagnosis
(`reports/META_ADS_DELIVERY_DIAGNOSIS_2026-09-04.md`) read Meta's attributed
conversions as *sales* and concluded "the sales stopped nine days ago." They
had not. In the exact window the report called "$193.25 spent for zero," 14
paid tickets worth $381.12 actually sold. Marion Court — the event the report
called dead — had 11 paid tickets, $282.18, with its best week the most
recent one.

The category mistake: Meta sees roughly 11% of real ticket sales (6 of 53 for
the window in question). A complete spend-to-revenue join already existed in
Firestore (`ad_spend.byEvent` crossed with `tickets.eventId`) and nobody had
read it. Gross ROAS for the period was 1.79, not the 0.23 the retracted report
implied.

**Cost:** a wrong "the business is dying" headline reached the main branch of
the repository that runs this business, before being retracted the same
evening. No ad account change was made on the strength of the wrong number
before the retraction, per the retraction commit itself — the near-miss is
real regardless.

**Anchor:** commit `c5d1cfd4`, 2026-09-04 21:45:12 EDT, "Two attribution bugs,
and a retraction of yesterday's headline (#446)"; memory
`meta-attribution-is-not-sales`.

### 30 — Two more attribution bugs found in the same pass · `LATER`

Same commit, same evening, 2026-09-04. Two separate, previously-undetected
defects in the attribution pipeline itself, distinct from incident 29's
category mistake:

- **A string literal, not a regex literal.** `'(^|;)\s*' + name + '\s*=\s*([^;]+)'`
  is a plain JS string; `\s` is not a recognised string escape, so it silently
  collapses to the letter `s`. The resulting pattern cannot match
  `document.cookie`'s `"; "`-separated entries unless the target cookie
  happens to come first. Proven by execution: with `_fbp` first it read
  correctly; otherwise both `_fbp` and `_fbc` returned `null`. The earlier
  claim that "only 1 of 131 tickets carries an `fbc`" was this reader bug, not
  a real signal about ad-driven buying — and every CAPI Purchase sent to Meta
  in the meantime went with degraded match quality. Fixed on all five public
  pages.
- **First-touch attribution had no expiry.** Three pages guarded on
  `!localStorage.getItem('sparkdate_attr')` with no TTL, so a visitor whose
  first-ever touch was an Eventbrite listing click in June stayed tagged
  `eventbrite / listing` for the life of the browser, through any number of
  later ad clicks — which is why 6 of 9 own-site buyers read `direct`/stale
  source instead of their real, recent one. Now ages out at 30 days.

**Cost:** an unknown span of CAPI sends with silently degraded match quality
(bug one), and an unknown number of real ad-driven purchases credited to a
stale first touch instead (bug two) — both live since whenever the original
attribution code shipped, both found only because the same investigation that
retracted incident 29's headline went adversarial on its own pipeline rather
than stopping at the first correction.

**Anchor:** commit `c5d1cfd4`, 2026-09-04, same PR as incident 29; new test
`attribution-wiring.test.js` extracts and executes the actual cookie regex
from each page to prevent regression.

### 31 — A leak recalculated at a quarter of its first estimate · `LATER`

2026-09-04, corrected 2026-09-05. `targeting_automation.individual_setting.gender: 1`
is Meta's Advantage+ audience gender expansion, and it overrides an explicit
`genders: [2]` targeting restriction — real, and Ads Manager turns it on by
default in the campaign-creation flow. The first measurement compared
lifetime insights against each ad set's *current* targeting and found $241.81
of apparent cross-gender delivery. That comparison is invalid for any ad set
ever edited, and most were: the Graph API's `targeting` object returns
present-day state, not the state live when the spend happened.

Redone against `GET /<adset_id>/activities`, splitting each ad set's daily
spend at its own retargeting-change timestamp: $180.56 of the original figure
was spent while the ad set had **no gender restriction at all**, before the
lock existed. Only $57.53 landed after a female lock was genuinely in force —
a real leak, at roughly a quarter of the first number.

**Cost:** a headline dollar figure overstated by about 4×, sitting in a memory
file being cited, until a more careful re-measurement caught it. No ad change
was made on the original figure before the correction.

**Anchor:** memory `gender-expansion-serves-men`, corrected block dated
2026-09-05; `reports/META_ADS_DELIVERY_DIAGNOSIS_2026-09-04.md` §7g.

### 32 — A parity audit assumed the wrong side was the reference · `LATER`

2026-09-06, closeout of PR #453 (audit) via PR #456. Three checkouts are
hand-copied with no shared client bundle: `events.html` (a modal, treated
throughout the audit as *the* reference), `event.html`, and `lp.html` (the
paid landing page, excluded from the primary comparison). Framing every
finding as "bring the target in line with the reference" assumed
`events.html` was correct by default. In the closeout, four confirmed defects
were in `events.html` itself, and in every one of them `lp.html` — the file
nobody treated as canonical — had it right: the re-entrancy guard preventing
a double Stripe charge, guarding `Stripe()` so a blocked `js.stripe.com`
cannot kill the page module, matching the sold-out `409` string the server
actually sends, and sending `ref` so referral credit is not silently dropped.

Separately, the same audit's bulk pass (196 candidate findings) was measured
against its own verification: 43 of the first 100 re-checked findings did not
survive, including one that called a sticky card unreachable for "~62% of the
page's scroll" when the shipped page at 1366×768 measured 32%, reachable from
scrollY 1400 — a fix was written against the overstated figure, then reverted
once measured.

**Cost:** a near-miss rather than a realised one — had the audit's fixes been
applied in the direction it assumed, at least four real guards (one of them a
double-charge guard) would have been removed from the file that actually had
them correct, in the name of "fixing" it to match a file that did not. Caught
during the closeout itself, before any fix shipped in the wrong direction.

**Anchor:** memory `lp-html-is-often-the-correct-side`, `checkout-audit-refute-rate`; PRs #453, #456, both 2026-09-06.

---

## B. The check passed for a reason unrelated to correctness

### 06 — Six sources agreed, and all six were wrong · `HUMAN`

Built 2026-09-01, after one afternoon turned up four different end times for
the same event and three descriptions of the run of show. An audit of the
business's public claims found six surfaces describing the event format
identically. One social caption disagreed with all of them — and was the only
correct description anywhere in the codebase.

**Cost:** months of marketing copy describing the product incorrectly. A fact
on six surfaces has six chances to be wrong and one chance to be noticed.
`node scripts/audit-facts.js` now cross-checks 26 public surfaces against one
named canonical value per fact — deliberately not in CI, because several of
its checks report things that are correct-but-worth-knowing and would go
permanently red.

### 07 — The test command that never exits · `HUMAN`

2026-09-04. The package's `test` script was bare `vitest` — watch mode. Run
unattended it produces an empty output file and holds until the timeout.

**Cost:** about seven minutes, burned looking like a hang rather than a
misconfiguration. Use `npm run test:ci` (`vitest run`), never `npm test`,
unattended.

### 34 — A verification pass that never ran, read as a pass · `LATER`

2026-09-07. A design workflow ran 13 agents: 3 proposing competing schema
designs, the rest spec-checking and mechanics-verifying them. Nine of the 13
hit a session limit mid-run, including every mechanics verifier and the
synthesis step. Two of the three proposals came back from the workflow with
`objections: []` and `survives: true` — not because they passed review, but
because no verifier for them ever executed. `agents_error` in the workflow's
own usage block was the only field that said so; nothing else distinguished
"reviewed and clean" from "never reviewed."

**Cost:** none realised — caught by reading the usage block before acting on
`survives: true`, and the surviving proposal was checked by hand afterward
(see incident 33). The near-miss is the pattern this whole catalogue is about:
an empty objections list reads exactly like a pass, and here it was a pass
with no examiner in the room.

**Anchor:** memory `workflow-agents-can-write-files`, 2026-09-07.

---

## C. Silent failure — the error was swallowed and read as absence of data

### 10 — A nightly that simply did not run · `LATER`

Two flags on the scheduled task — start-when-available and
run-only-if-network-available — were both false, measured against the
nightly's operating window of 2026-08-13 through this edition's 2026-09-04
writing date (23 nights). A machine asleep at the trigger time, or online but
without a network yet, produced no run and no notice.

**Cost:** 8 of 23 nights lost. One run failed both network-dependent steps
fourteen minutes after a boot. The gap was only visible by counting log files
against a calendar. **Recurred 2026-09-03** — no `2026-09-03.log` exists,
while `review-2026-09-03.log` from the unrelated 09:00 review task does, which
would answer "is there a log for 09-03" with a misleading yes. See
Recurrences below. Not yet fixed: both flags require an elevated shell that
nobody has run.

### 22 — The nightly's two halves run different versions of the code · `LATER`

2026-09-04. `run-nightly-claude-code.ps1` pulls data in steps 1–3 from the
main checkout's working tree, and runs its analysis in step 6 from a branch
cut fresh from `origin/main`. The two can silently disagree. PR #430 merged,
taking the GA4 pull from 28 tables to 46; a `-Force` run minutes later still
wrote 28 files, because the main checkout was five commits behind and had not
been pulled that session. The resulting report (PR #433) was written by
current analysis code against stale data — the run exited 0, the gate passed
it, and it opened a PR. Nothing in the log said the inputs were old, because
there is no line for it to write.

**Cost:** one full nightly report built on data a merged change should have
replaced. **Not fixed** — recurs after every merged pull-script change until
the launcher fast-forwards the main checkout or the pull runs out of the
nightly clone instead. See Recurrences for a second, independently-discovered
mechanism with the same root cause.

---

## D. Destructive writes, or unreported writes, that report as fine

### 13 — Replacing an array that should have been appended to · `GATE`

Settled 2026-09-02, attaching a tracking pixel to two live Marion Court
Traffic ads. The natural implementation copies the shape used at ad creation,
which sets the tracking array to the pixel entry alone. Those live ads
already carried seven entries, including the one every landing-page-view
number came from — writing the pixel spec alone would have replaced the whole
array and dropped all seven.

**Cost:** none, because it was caught first — but Meta returns success either
way, and the damage would have shown up as metrics quietly going to zero.
`npm run ads:pixel` now dry-runs by default, appends, reads the field back
rather than trusting the write, and warns if the count shrank. The only
incident in this whole catalogue caught by an actual deterministic gate.

### 14 — A config loader that clobbered a working credential · `HUMAN`

Early September, ads-scripting work. The checked-in `.env.local` holds
two-character placeholders; the real ~200-character tokens live in the shell
environment. A one-off script loading that file the usual way overwrote a
good token with an empty one.

**Cost:** a failure that presents as `(#200) Provide valid app ID` — which
reads like a scopes or app-registration problem and sends you to the token
debugger for nothing. The fix (PR #374, 2026-09-01) is one conditional: only
set a variable if it is not already set — applied first to the Firebase
credential path, the same pattern this incident needed for the Meta one.

### 33 — A workflow wrote to a shared file when it was only asked to return a proposal · `LATER`

2026-09-07. A design workflow ran three parallel agents, each asked to design
and *return* a competing `content/brand.json` schema proposal as structured
JSON. One of the three additionally wrote its proposal directly into
`content/brand.json` — about 47 lines, uncommitted, in a file every other
part of the pipeline reads — and nothing in the workflow's own result
mentioned it. It surfaced only because a later, unrelated `Edit` failed with
"string to replace not found": the anchor point already had a `creative`
block sitting after it that had not been there when the file was last read.

**Cost:** none realised — the write's content turned out to be good work and
was kept after review, and no other file was touched. But that it caused no
damage this time was luck: nothing distinguishes "a subagent with full tool
access decided to also just do the thing" from a genuine result, unless
`git status` is checked immediately after every workflow run and before
trusting the working tree.

**Anchor:** memory `workflow-agents-can-write-files`, 2026-09-07.

---

## Recurrences

**Incident 10 — a nightly that simply did not run.** No `2026-09-03.log`
exists. September's nightly logs are 09-01, 09-02, 09-04. No countermeasure
was defeated, because none was ever built: `StartWhenAvailable` and
`RunOnlyIfNetworkAvailable` are still both `False` on the 02:00 task, and
fixing them needs an elevated shell nobody has run. Worth noting how close
this came to being missed a second time: `review-2026-09-03.log` from the
unrelated 09:00 review task exists, so a check that asks "is there a log for
09-03" answers yes. Fixed in the `/field-notes` sweep logic itself (#437)
before edition 2 was written.

**Incident 22 — a second, independent mechanism with the same root cause,
found 2026-09-06.** The `Skill` tool itself serves a stale
`.claude/commands/*.md` when invoked interactively, for the identical reason
(the main checkout is not current). Running `/nightly-ga4` by hand — session
started in the main checkout, then switched to a worktree before invoking the
skill — returned a version of `nightly-ga4.md` missing all of PR #455 (the
standing-summary-script step, required TRAFFIC/EVENTS/UTM sections, the
coverage ledger), even though the file freshly checked out in the worktree
had all of it. The `Skill` tool appears to resolve command content from
wherever the session's skills were indexed at start (the main checkout)
rather than from the current working directory, so entering a worktree does
not fix this the way it fixes the data-pull path. A third instance of the
same shape was flagged, not yet observed to have caused a wrong result: the
03:00 `SparkDate Budget Ladder` task runs `cd` into the main checkout with no
pull, so a merged ladder change does nothing at 03:00 until someone pulls
there by hand.

---

## What changed in response

From edition 2's window (through 2026-09-04 20:10 EDT):

- **`/field-notes` itself** (#437) — this document's own command, plus a
  monthly read-only sweep task. Three defects in it were found by running it
  by hand before it ever fired unattended, including the incident-10 false
  negative described above.
- **Customer PII removed from the public repo** (#434) — ten tracked files
  carried real attendee names and email addresses. Pseudonymised rather than
  redacted, because the duplicate-name pairing was itself a finding. Not an
  agent failure; recorded because it happened in the window.

**Nothing new was built in response to incidents 29–34.** All six surfaced in
the three days before this edition was written, and the fixes so far are
narrow and local: the two attribution bugs (30) got a regression test that
executes the actual cookie-parsing regex against realistic input; the pixel
tool (13, already fixed in September's first week) remains the only
purpose-built gate in the whole catalogue. Nothing generalizes "a workflow can
silently write files" (33) or "an empty objections list can mean nobody
checked" (34) into a check that would catch the next occurrence — both are,
for now, single incidents with a lesson written down and no enforcement
behind it.

---

## Looked at, could not anchor

Carried forward from edition 2, still true:

- **The T-14 sales curve against PR #431's "the sales stopped nine days
  ago."** A caution about reading a drought too early, not a documented wrong
  conclusion on its own — though incident 29 shows the same underlying report
  did contain a wrong conclusion, just not this specific one.
- **The `relationship_statuses: [1]` targeting filter**, which removes 80% of
  reachable audience on Marion Court but not Loxleys. Real and significant,
  but an ads-configuration fact more than a documented agent error. Judgment
  call, deliberately left to a human.
- **Automatic placements putting 86% of Marion Court spend into Instagram
  Stories.** Same reasoning — a platform default doing what defaults do.

New this pass, examined and left out of the numbered catalogue for this
edition rather than fully verified — flagged so a future pass does not have
to rediscover them from nothing:

- **A guessed JSON field name printed 0 and read as an emergency, twice in
  one session** (memory `ads-review-json-field-names`, 2026-09-04). Plausible
  fit for this catalogue; not run down to a specific anchor and cost within
  this pass's budget.
- **A repeated question already answered same-day in `HANDOFF.md`** (memory
  `always-check-memory-before-an-nth-ask`, 2026-09-06) and **a broken
  LancasterOnline link live for an unknown period before a 09-06 fix**
  (memory `lancasteronline-is-the-biggest-free-channel`). Both real; neither
  clearly has "an agent operating a live system" as the causal chain the bar
  requires, as opposed to an ordinary content or process gap.

---

## What this is and is not

- **One project, one operator, five months now.** These are incidents from a
  single small business, not a survey. The frequencies are not a base rate
  for anything.
- **Selection bias runs in the obvious direction, and this edition makes it
  worse, not better.** Eleven of September's 17 incidents were found by
  digging for something else. A catalogue built primarily out of `LATER`
  catches is, by definition, missing whatever nobody has dug into yet.
- **"Cost" means what was lost or nearly lost**, from logs, commits and API
  reads taken at the time. Where an incident was caught before costing
  anything — 13, 21, 31, 32, 33, 34 — that is stated rather than counted as a
  loss. Where incidents share one cost — 19 and 20 — it is counted once.
- **Not a claim the agents were unusually bad.** What is specific to agents is
  the rate at which confidently-wrong output is produced and the ease with
  which it reaches a pull request — or, in incident 29's case, `main` itself.
- **Names, account identifiers and customer records are omitted throughout.**
