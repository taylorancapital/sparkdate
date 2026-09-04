# GA4 analysis — 2026-09-04 (second pull of the day)

**This run made ZERO code changes.** The only file it adds is this report. Every
fix described below is a recommendation for a human to apply, not something
that was applied.

**Staleness check, as required.** `ANALYTICS_CONTEXT.md` reads **"Last updated:
2026-08-26."** The newest report already on *this branch's* history is
`GA4_ANALYSIS_2026-09-02.md`, so the stamp is older than the newest report and
may have forked. I checked its §3b settled list against everything raised
below and re-ask nothing already settled there.

**Operational note, not analytics.** This is the second `nightly-ga4` run
today. An earlier run at 2026-09-04 01:31 ET already produced
`reports/GA4_ANALYSIS_2026-09-04.md` on a sibling, unmerged branch
(`claude/nightly-ga4-2026-09-04`, PR #427) — the launcher script detected that
branch already existed on origin and cut this one as
`claude/nightly-ga4-2026-09-04-1156` instead (`-Force` behavior, documented in
`CLAUDE.md`). **Both files share the same path**, `reports/GA4_ANALYSIS_2026-09-04.md`
— whoever reviews these two PRs should merge one and expect a conflict on the
other, not two separate reports living side by side. This report continues
from `GA4_ANALYSIS_2026-09-02.md` per instruction, but I fetched PR #427's
content read-only for continuity and note where it changes this run's framing.

**Data.** GA4 Data API, property 536859339, window `20260519-20260904`,
**pulled 2026-09-04 15:55 UTC** (11:55 America/New_York) — about 14 hours
later in the day than the 01:31 ET run, which matters for how settled the
tail is (see §1 below). Meta: `meta-insights-2026-09-03.csv`, window
`20260828-20260903`, 6 campaigns — **the identical window** PR #427 already
reported this morning (re-pulled ~10 hours later), not a new week. No
hand-exported `download*.csv` is newer than the API set; those are still
dated `20260519-20260827` and were skipped.

---

## HEADLINE — Nothing new sold since 09-01. The one substantive change since this morning's pull: the Marion Court Facebook-Event sale now has a matching `utm_content` tag, upgrading that leg of the attribution from circumstantial to directly confirmed. The email leg still isn't.

PR #427 (this morning) resolved the two 09-01 Marion Court purchases that
reopened `ANALYTICS_CONTEXT.md` §3b out of an unattributed `(not set)` row,
into `email / returning` (2 txns / $48.98) and a new `facebook_event / listing`
row (1 txn / $27.49) — with the caveat that no item-by-source cross-tab
existed in that pull, so the link to the Marion Court seats was "circumstantial,
not verified."

Tonight's pull carries a table PR #427 didn't check: `ga4-api-utm-content`.
Filtering it for the `mc_` prefix used across every other Marion Court tag in
this property (`mc_rt_still_thinking`, `mc_rt_quang`, `mc_rt_scorecards`,
`mc_rt_thinking`, all still $0) turns up:

| `sessionManualAdContent` | `sessionCampaignName` | sessions | keyEvents | revenue |
|---|---|---|---|---|
| `mc_facebook_event` | `mc_202609` | 2 | 1 | **$27.49** |

That is an exact match, to the cent, for the `facebook_event / listing` row's
one transaction — and `mc_facebook_event` is unambiguously Marion Court's own
event-listing tag, not an ad. **This upgrades that leg of the attribution from
inferred to confirmed via a direct cross-tab.** No retargeting tag
(`mc_rt_*`) shows any revenue, in this pull or any prior one — the conclusion
that the two purchases did not come from the retargeting spend under review
stands, now on firmer footing for one of the two.

**The other leg does not get the same upgrade.** No `mc_`-prefixed row
matches the `email / returning` transactions ($48.98). The closest revenue
figures in `utm-content` are `(not set)` / `week2_Solution` (12 keyEvents,
$48.98) and `(not set)` / `(direct)` (22 keyEvents, $169.94) — neither is
Marion-Court-tagged, and `$48.98` appears in more than one place in this
table, so it cannot be pinned down the way the Facebook-Event leg was. That
half of PR #427's finding is unchanged: plausible, not confirmed.

**Nothing else moved.** `revenue-by-source` (39 transactions, $1,061.12),
`items-daily` (last dated row still 2026-09-01), `revenue-daily` (same), and
`key-events` (231: 99 + 93 + 39) are byte-for-byte identical to both the
09-02 and this morning's 09-04 pulls. No sale has happened since 09-01.

---

## ALSO IN THE REPORT

### 1. The by-source additivity artifact on 09-03 fully cleared between the two pulls today — a real-time data point on how fast it drains.

This morning's pull (05:31 UTC) read 2026-09-03, then the final day, as
**+62 sessions / +30.2% over-summed, 73 `(not set)`**. Tonight's pull (15:55
UTC, ~10 hours later), with 09-04 now the final day, reads 09-03 as **exact —
210 trend sessions, 210 by-source sum, 0 `(not set)`**. 09-03's engagement
rate (30.95%) also sits inside the normal 30–41% band for this property
rather than the near-zero signature of an unsettled day. Per
`ANALYTICS_METHOD.md` §1(a) ("if you need the second day, say that you used
it") — **I used 09-03 in the headline and table below**, on the strength of
this evidence, while still treating 09-04 (below) as fully excluded.

The new final day, 2026-09-04, is a partial day (pull ran at 11:55 ET, so
roughly 12 of 24 hours elapsed) and now carries a smaller version of the same
artifact:

| date | position | trend sessions | by-source sum | diff | `(not set)` |
|---|---|---|---|---|---|
| 2026-09-01 | 4th from last | 109 | 109 | 0 | — |
| 2026-09-02 | 3rd from last | 85 | 86 | +1 (+1.2%) | — |
| 2026-09-03 | 2nd from last | 210 | 210 | **0 (exact)** | — |
| 2026-09-04 | final (partial day, ~12h elapsed) | 24 | 38 | **+14 (+58.3%)** | **15** |

96 of 98 dated rows in the full window match exactly; the two exceptions are
today's final two days, consistent with the standing rule. Recommend (again)
folding by-source additivity into `ANALYTICS_METHOD.md` §1 explicitly — see
zero-risk fixes.

### 2. `card_incomplete` checkout errors have now held flat for three consecutive pulls — the climb stopped.

| pull | `card_incomplete` |
|---|---|
| 09-01 | 15 events / 7 users |
| 09-02 | 18 events / 8 users |
| 09-04 (this morning) | 18 events / 8 users |
| 09-04 (tonight) | **18 events / 8 users — unchanged** |

Logged as a data point, not a new ask. Two full pulls now show no further
growth after the 09-01→09-02 jump.

### 3. A same-day email send to `/event` on 2026-09-03 produced 129 sessions and zero conversions so far — and its UTM identity renders as scrambled text.

`ga4-api-landing-by-source` and `ga4-api-daily-by-source` both show a single
`sessionSourceMedium` value —
`Ybadbfgfe | Zbfgfe Yvfg / email` (campaign `f60ccdc363-FZBVY_DBZCBVTA_..._85`
in `ga4-api-utm-content`) — accounting for **129 of 09-03's 210 sessions**
(36 engaged, 27.9%), **all landing on `/event`, 0 key events, $0 revenue.**
That single row is the majority of what made 09-03 the highest-traffic
Thursday in the whole 05-19–09-04 window (previous high: 153 on 08-27).

Two separate things worth separating:

- **The name is not readable.** It is neither literal text nor a clean
  cipher I could decode (tried ROT13 and a Caesar brute-force on both
  strings; no shift produces English). This looks like a mangled UTM
  parameter from whatever email tool sent it — possibly double-encoded,
  truncated, or corrupted in transit — rather than intentional obfuscation.
  I cannot tell you which list or campaign this was.
- **The zero conversion may just be freshness.** `/event` does fire
  `view_item` after click-through (§4), so this is not an instrumentation
  gap — recipients who clicked genuinely have not progressed yet. But the
  send is one to two days old, inside the tail-exclusion window, and this
  property's numbers need time to show a sale. Too early to call this
  underperforming.

### 4. `/lp`'s new inline-checkout instrumentation (live since 2026-09-03, §10): `lp_visible` growing normally, `checkout_field_started` still stuck at n=2.

| event | this morning (01:31 pull) | tonight (11:55 pull) |
|---|---|---|
| `lp_visible` | 58 events / 53 users | **79 events / 74 users** |
| `checkout_field_started` | 2 events / 1 user | **2 events / 1 user — unchanged** |

`lp_visible` grew with traffic as expected. `checkout_field_started` did not
move at all despite ~10 more hours and presumably more `/lp` sessions in
between. Per §12, n=2 carries no rate — not flagging this as a problem, just
noting the flat count so it isn't mistaken for growth next time this table is
pulled.

### 5. Meta: `20260828-20260903`, $161.20 across 6 campaigns — the identical window PR #427 already reported this morning at $161.19. No week-over-week comparison; not a new week, per §9.

| campaign | spend | impressions | clicks | CPC |
|---|---|---|---|---|
| Marion Court \| Traffic | $50.39 | 8,161 | 191 | $0.2638 |
| Campaign 1 Event 3 Good Good Campaign | $45.87 | 7,745 | 255 | $0.1799 |
| Marion Court Retargeting | $28.54 | 1,508 | 22 | $1.2973 |
| Campaign 1 Event 4 Good Good Campaign-Retargeting | $21.72 | 1,026 | 29 | $0.7490 |
| Loxleys \| Traffic | $14.68 | 2,289 | 184 | $0.0798 |
| Campaign 1 Tellus AfterDark: Singles Edition Retargeting | $0 | 0 | 0 | — |

Movement since this morning is one cent of accrued spend on Marion Court |
Traffic and single-digit impression counts elsewhere — noise, not a
decision. The Marion Court Retargeting frequency watch signal (from
HANDOFF) still cannot be checked: no `reach`/`frequency` column in this file,
same gap flagged 09-02 and again this morning.

---

## NEEDS TAYLOR INPUT

1. **Marion Court attribution, refined, not a new ask.** The
   `facebook_event / listing` sale is now confirmed via a matching
   `mc_facebook_event` utm_content tag (exact $27.49 match) — it is Marion
   Court's own event listing, not an ad. The `email / returning` sale is
   still only plausibly linked, with no matching Marion-Court-tagged row in
   `utm-content`. Neither is a retargeting-ad sale. Whether this changes
   anything about the ad-set decision is still a business call, not an
   analytics one — carried from the 09-02 headline and PR #427, not counted
   as a fresh ask.
2. **The scrambled email UTM string (§3 above).** 129 sessions, one send,
   landing entirely on `/event`, currently zero conversions. Only you would
   know which list or send this corresponds to — worth checking with
   whatever tool sent it, both to identify it and to see why its UTM
   parameters aren't coming through as readable text. *(New ask.)*
3. **Bump `ANALYTICS_CONTEXT.md`'s "Last updated" stamp.** Still 2026-08-26.
   This is the **sixth** report to spend a sentence on it — the fifth ask
   was PR #427, this morning, on the sibling branch; this is a same-day
   repeat, not a new night.

**Nothing from `ANALYTICS_CONTEXT.md` §3b was re-asked** beyond the Marion
Court item above, which §3b itself names as the one condition that reopens
it. Internal-traffic filter, `ads_conversion_About_Us_1` (frozen at 99),
Google Ads (dark), and `next_event_fetch_failed` (#299) were checked against
§3b and left alone.

---

## Zero-risk fixes — described only, NOT applied

1. **Extend `ANALYTICS_METHOD.md` §1 to explicitly name by-source additivity
   as a two-day tail artifact**, and record that it can clear inside a single
   day once enough hours pass (§1 above: same date, +30.2% at 05:31 UTC → 0%
   at 15:55 UTC on the same calendar day). Carried from 09-02 and this
   morning; still not applied, now with a third and sharpest data point.
2. **Bump `ANALYTICS_CONTEXT.md`'s "Last updated" stamp** (6th ask, also
   listed above as it needs a person, not code).
3. **Add a `reach`/`frequency` field to the Meta insights pull.** Carried
   from 09-02 and this morning; still blocks the Marion Court Retargeting
   frequency watch signal.
4. **Note in `ANALYTICS_METHOD.md` §9 that `meta-insights-<date>.csv` is
   named for the window's last day, one day behind the pull date.** Carried
   from 09-02 and this morning.
5. **Investigate the garbled email `sessionSourceMedium`/campaign string**
   (§3 above) at the source — check whether the sending tool is passing
   malformed or double-encoded UTM parameters, independent of whether the
   129-session send ever converts.

---

## Caveats and method

- **`ANALYTICS_CONTEXT.md` read in full first**, stamp 2026-08-26, stated at
  the top per its own instruction. `reports/ANALYTICS_METHOD.md` read in
  full and treated as authoritative on every measurement question.
- **Which caveats were load-bearing tonight.** §1(a) is why 09-03 is used
  only with the explicit "I used the second day" disclosure, and why 09-04
  is excluded outright. §7 is why revenue figures are never called business
  revenue. §9 is why the Meta section makes no week-over-week claim — the
  window is not just overlapping, it is identical to the one already
  reported this morning. §10 is why the checkout-by-landing-page and channel
  funnels are not used to measure the 09-03 `/lp` change (§4 above uses raw
  event counts instead, and states n=2 explicitly). §12 governs every small-n
  statement here (n=2 `checkout_field_started`, n=1 `mc_facebook_event`
  transaction, n=4/891 open cohort cell below).
- **Additivity and control checks.** Key-event decomposition closes exactly:
  99 + 93 + 39 = 231, matching `ga4-api-events` and `ga4-api-key-events`.
  `revenue-by-source` sums to $1,061.12 across 39 transactions, matching
  `revenue-daily` and `key-events`, identical to both the 09-02 and this
  morning's pulls. `itemsPurchased` 41 vs `transactions` 39 is the
  documented #205 2-for-1 seat count. `revenue-by-item`'s Marion Court row
  (12 added to cart, 5 purchased, $99.95) matches the seat/order
  reconciliation from the 09-02 report exactly. By-source sums match
  `daily-trend` on 96 of 98 dated rows; the two exceptions are the final two
  days, discussed in §1 above. `mc_facebook_event`'s $27.49 matches
  `facebook_event / listing`'s transaction to the cent — the one hard
  cross-tab check this report makes.
- **Cohort retention: unchanged, not re-raised.** `wk of 2026-08-24`'s
  week-1 cell still reads 4/891 (0.45%), still open (closes 09-06, roughly
  4 of 7 days elapsed at this pull) and still not comparable to the four
  closed cohorts per §1(c). `wk of 2026-08-31` week-0 baseline now reads 550
  users (was 513 this morning), consistent with a still-filling current
  week, not a change in an existing one.
- **What I did not verify.** Which specific session(s) within
  `email / returning` correspond to the Marion Court seats — no matching
  `mc_`-tagged utm_content row exists, so that half stays circumstantial.
  Where the scrambled email UTM string actually originates — I attempted
  ROT13 and a full Caesar-shift brute force on both garbled strings and
  neither produced readable text; did not pursue further decoding, since
  identifying the source system is Taylor's call (§ NEEDS TAYLOR INPUT #2).
  Whether the 09-03 `/lp` instrumentation is producing the intended funnel
  shape — still too thin (n=2) to say anything, per §12.
- **Parsing.** Every file parsed from its own real header after the `#`
  block; `Grand total` rows excluded from row-level aggregation and used
  only as independent checks. No column names hardcoded. No CSV was moved,
  renamed, or modified. Scratch parsing scripts (`ga4_parse.py`,
  `additivity.py`, `check2.py`, `check3.py`) lived in the system temp
  directory throughout and are not part of this commit.
- **Source reading.** PR #427's report content was read via
  `git show origin/claude/nightly-ga4-2026-09-04` for continuity only — no
  code or config outside `reports/` was read for analysis purposes, and
  nothing outside `reports/` was modified.
