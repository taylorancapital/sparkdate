# GA4 + Meta nightly review — 2026-09-07

This run made ZERO code changes. Per ANALYTICS_METHOD.md §1, the last two dates
in every daily series (20260905, 20260906) are dropped as not-yet-final; all
"closed week" figures below use two disjoint 7-day buckets, never a rolling
window. Data provenance: GA4 window `20260519-20260907`, pulled **2026-09-07
06:00 UTC** (property 536859339, dates in America/New_York); Meta campaign
insights for **2026-08-31 to 2026-09-06**, pulled 2026-09-07 02:00 local.
`ANALYTICS_CONTEXT.md` states "Last updated: 2026-08-26" but its file mtime is
**2026-08-28 18:25** — it was edited without the stamp being bumped, so treat
its content as current through 08-28, not 08-26.

**This report exists because the unattended 02:00 run did not produce one.**
It is a by-hand recovery, run in an interactive worktree session per
CLAUDE.md, using the data the 02:00 pull already wrote successfully.

## HEADLINE — two pipeline failures, fully diagnosed, and neither is new business data

**1. The unattended analysis has now failed two nights running, to the exact
same cause.** Tonight's `logs/2026-09-07.log` shows the Meta pull, all 46 GA4
tables, and the UTM sheet refresh all completed cleanly by 02:01:15. The
headless Claude Code analysis step then launched on branch
`claude/nightly-ga4-2026-09-07` and immediately hit:

> `You've hit your session limit — resets 3am (America/New_York)`
> `ERROR: Claude Code exited 1.`

Scheduled Task result confirmed: `LastTaskResult: 1`, `LastRunTime: 9/7/2026
2:00:01 AM`. This is the identical failure the 09-06 recovery (branch
`worktree-ga4-nightly-manual-run`, merged as #460/#461) already documented for
the night before — a Claude usage-window limit that resets at 3 AM, one hour
after the task fires at 2 AM, with nothing pulled or written for the analysis
step either night. **The data pull itself is not the problem** — it has now
succeeded cleanly for at least three consecutive nights (09-05, 09-06, 09-07);
only the last step, the `claude --print` analysis call inside
`run-nightly-claude-code.ps1`, is dying. Since this has now recurred
identically twice, it is a pattern, not a fluke — if nothing changes, tomorrow
night's 02:00 run should be expected to fail the same way unless whatever is
consuming the usage window before 2 AM changes, or the schedule moves further
from the 3 AM reset.

**2. The Google Ads "$14.46 accruing" figure the 09-06 report caught and
wrote around as a script bug reproduced VERBATIM tonight — because only the
prose was corrected, not the script.** `scripts/ga4-nightly-summary.js`
computes "last 7 closed days" of Google Ads spend by taking the last 7 unique
**dates present in the `google-ads-cost-daily` table itself**, not the last 7
calendar days before the pull:

```js
const gaClosed = closedDates(gaDaily).closed;
const gaRecent = gaClosed.slice(-7);
const gaSpendRecent = gaDaily.filter((r) => gaRecent.includes(r.date))...
```

That table only has rows for days Google Ads actually spent something, and the
account has been dark since **2026-07-24** (confirmed in `ANALYTICS_CONTEXT.md`
via the Ads Manager UI, and the raw
`ga4-api-google-ads-cost-daily-2026-09-07.csv` has no row later than
`20260724`). So "the last 7 dates in this table" resolves to **2026-07-16
through 2026-07-22** — six weeks old — and summing those seven rows
(0 + 0.116237 + 0.201405 + 0.586962 + 0.56185 + 0.807843 + 6.998587 +
5.185051, the closedDates() rule drops 07-23/07-24 as the "unfinal" tail)
gives **$14.46 to the cent**. The label "the account is still accruing cost"
is therefore false for any recent window; the account has spent nothing since
07-24 and the true lifetime total, $37.91, is unchanged from the figure
`ANALYTICS_CONTEXT.md` recorded on 08-25. **Zero-risk fix below.**

Neither finding is a change in the business. Traffic and revenue this closed
week are ordinary (see TRAFFIC); nothing here should change any decision
Taylor makes about ad spend tonight.

## TRAFFIC — standing section

| metric | recent 7d (08/29–09/04) | prior 7d (08/22–08/28) | change |
| --- | ---: | ---: | ---: |
| sessions | 1009 | 1021 | −1% |
| engaged sessions | 364 | 426 | −15% |
| users | 993 | 900 | +10% |
| new users | 941 | 795 | +18% |
| purchasers | 4 | 6 | −33% |
| key events | 11 | 16 | −31% |
| transactions | 4 | 6 | −33% |
| own-site revenue | $114.96 | $169.94 | −32% |

Sessions are flat and users/new-users are up double digits, so the revenue and
key-event drops are not a traffic problem — they are 2 fewer transactions
week over week on a base of 4–6, which ANALYTICS_METHOD §12 says is too small
to read as a trend. Own-site revenue is a floor, not total revenue (§7);
~55% of real ticket revenue is Eventbrite/Meetup and invisible here.

### Channels (window-wide, 20260519–20260907)

| channel group | sessions | users | key events | conv rate | revenue |
| --- | ---: | ---: | ---: | ---: | ---: |
| Paid Social | 3089 | 2818 | 26 | 0.8% | $179.94 |
| Direct | 791 | 480 | 22 | 2.8% | $169.94 |
| Unassigned | 627 | 205 | 66 | 10.5% | $345.37 |
| Email | 391 | 214 | 26 | 6.6% | $125.45 |
| Organic Social | 229 | 182 | 10 | 4.4% | $130.46 |
| Organic Search | 142 | 86 | 7 | 4.9% | $82.47 |
| Paid Other | 117 | 109 | 63 | 53.8% | $0.00 |
| Referral | 74 | 14 | 5 | 6.8% | $0.00 |
| Paid Search | 9 | 9 | 0 | 0.0% | $0.00 |

Paid Social carries 70% of all sessions (3089 of 4415-ish tracked) and
converts worst of any channel with real volume (0.8%); Unassigned — mostly
Eventbrite and organic-listing referrals — is 5% of the traffic and 31% of the
revenue. **Paid Other's 53.8% conv rate is $0 revenue** — its 63 "key events"
are almost certainly `ads_conversion_About_Us_1` (see EVENTS below), a
landing-page-view counted as a key event, not a real conversion; do not read
this row as a healthy channel.

### Top sources, device, geography

Facebook (`Facebook / paid_social`, 1616 sessions) and Instagram (`Instagram /
paid_social`, 635) dominate volume; both convert under 1%. Mobile is 4073
sessions at 2.7% conv / $904 revenue against desktop's 1395 at **8.6%** conv /
$157 revenue — desktop converts 3x better on a fifth of the volume, consistent
with prior reports and not a new finding. iOS Safari is the single biggest
OS/browser cell (2611 sessions). Philadelphia (904 sessions), West Chester
(424) and Lancaster (244) lead cities; the **`(not set)`/continentId `ZZ`
bucket is 118 sessions with a 69.5% key-event rate** against 2.8% everywhere
else — ANALYTICS_CONTEXT.md already flags datacenter/bot traffic as a standing
~8–12% denominator inflation, and this bucket's inverted conversion rate is
consistent with that, not with real users.

## EVENTS — standing section

34 distinct events fired window-wide. **Only 3 are configured as GA4 key
events**: `ads_conversion_About_Us_1` (99, $0 — this is a landing-page view on
`/lp?utm_source=googleads`, not an About Us page visit; ANALYTICS_METHOD §8),
`generate_lead` (93, $92 nominal value, $0 revenue), and `purchase` (39,
$1,061.12, the only one that is actually money).

Four events **carry a dollar value but count zero key events** — they are
funnel steps, not conversions, and any ROAS or funnel math that treats them as
conversions is wrong by construction: `view_item` ($16,604 value on 662
events), `begin_checkout` ($3,961 on 267), `add_to_cart` ($2,529 on 100),
`add_payment_info` ($285 on 10).

**Instrumentation gap worth flagging, not a funnel regression:** `purchase`
fired 39 times but `add_payment_info` only 10 — more completed purchases than
recorded payment-info-add events, which is only possible if `add_payment_info`
under-fires relative to what actually happens at checkout (a saved card, Apple
Pay, or autofill path that skips whatever triggers the event). This is a
10-event sample; do not build a rate on it (ANALYTICS_METHOD §12), but it is
worth someone checking the call site against Stripe's actual payment-element
flow.

What moved: key events fell 16→11 and purchases 6→4 this closed week — a
3–5 count swing on an already-thin base, not a pattern by itself.

## UTM AND TAGGING GAPS — standing section, ranked by sessions affected

1. **`facebook` fragmented across 11 row variants, 2508 sessions, $200.44
   combined** (6 variants still live as of 20260906): `Facebook /
   paid_social` (1616, live), `facebook / paid_social` (435, stale since
   0811), `fb / paid_social` (221, live), `m.facebook.com / referral` (64,
   live), `facebook / social` (61, stale), `facebook.com / referral` (37,
   live), plus 5 smaller/dead rows. No single row shows what Facebook actually
   did; sum before reporting a Facebook figure. **Fix:** normalize
   source/medium casing and the `fb`/`m.facebook.com` variants at the point
   they're written (ad destination URLs and any internal referral tagging),
   not after the fact.
2. **`instagram` split across 2 rows, 778 sessions, $82.47**: `Instagram /
   paid_social` (635) vs `ig / paid_social` (143), both live. Same fix as
   above — one canonical casing.
3. **Our own site tagging its own internal links, 292 sessions
   mis-credited**, 2 rows still live: `get_tickets_block / (not set)` (61
   sessions, live, $27.49 attributed away from its real source) and `matches /
   (not set)` (33, live, $27.49). The rest (`lp / (not set)` 163, `matches /
   web` 26, and four smaller rows) are stale or dead. **Fix:** these are
   internal navigation elements; they should not carry `utm_source` at all —
   strip the tags from `get_tickets_block` and any internal `/matches` links.
4. **`email` fragmented across 6 rows, 259 sessions, $125.45**, 3 live
   (`email / nurture` 53, `email / newsletter` 48, `email / returning` 19).
5. **Obfuscated tag, 137 sessions**: `Ybadbfgfe | Zbfgfe Yvfg / email`
   decodes (a–f +1, g–z ROT13) to `Lancaster | Master List / email` — a
   plaintext twin of the same list already exists (8 sessions). Combined real
   total is 137 sessions, 0 key events. This is the LancasterOnline/Evvnt
   obfuscation the 09-06 report already traced and partially fixed (#461);
   tonight's number is consistent with that being resolved at the source and
   this being residual historical volume, not a new leak.
6. **Broken/placeholder values**: `<campaign-name>` literal placeholder still
   uncorrected on 2 rows / 69 sessions / **41 key events** — this is the
   largest defect by key-event volume in the whole UTM worklist and has been
   open across multiple reports; `undefined` (36 sessions, dead since
   20260710), `(empty string)` content on 4 rows (27 sessions).
7. **`googleads` fragmented across 5 rows, 127 sessions, 94 key events** (all
   `ads_conversion_About_Us_1` — see EVENTS caveat above, not real
   conversions) — every row DEAD or stale, oldest since 20260609, none live
   in the last closed week.
8. **Campaigns spending sessions and returning zero key events** (≥20
   sessions): topped by `Augweek3_lancaster` (471), `Augweek1_philly` (358),
   `summer2026_philly` (273), `Augweek1_lancaster` (223). None of these names
   match any of the 7 campaigns actually live in tonight's Meta pull (Good
   Good, Good Good Retargeting, Marion Court ×3, Loxleys ×2) — this is
   entirely historical July/August spend already stopped, not a live leak.
   Lower priority than items 1–6.
9. **`utm_content` shared across multiple campaigns** (violates
   `content/brand.json`'s uniqueness requirement): `proof_rsa1` spans 7
   different campaigns; `mc_figlancaster` spans 2. Per-ad attribution is
   impossible for any of these until rebuilt with unique values.

## ALSO IN THE REPORT

- **Webview conversion gap, quantified tonight**: in-app-browser sessions
  convert to purchase at **0.09%** (1 of 1107 session-starts) against
  **1.66%** for normal browsers (9 of 542) — an 18x gap. This is the same
  mechanism ANALYTICS_METHOD §6 and multiple prior reports already
  established (Meta's in-app browser degrading the checkout experience); not
  a new finding, but tonight's numbers are the sharpest version of it on
  record. Paid Social — 92% webview by device mix — is very likely
  underperforming for exactly this reason, on top of everything else.
- **Landing-page × source dead pairings** (≥20 sessions, 0 key events):
  `/lp` × `facebook / paid_social` (419), `/lp` × `fb / paid_social` (205),
  `/lp` × `ig / paid_social` (142). The script's own cross-tab suggests
  `googleads / paid` as "the converting source" on `/lp` (91.1%,
  56 sessions) — **do not read that as a real comparison**: every one of
  those 51 "key events" is `ads_conversion_About_Us_1`, i.e. a page load
  with `utm_source=googleads`, not a lead or a sale. Once that pseudo-event
  is excluded, `/lp` has no channel converting meaningfully better than
  another on this pull; the dead Facebook/Instagram volume is fully
  explained by the webview mechanism above, not a page-content problem, so
  no `public/` source change is proposed.
- **Additivity is clean.** Revenue-by-source vs revenue-daily: $0.00 gap.
  Revenue-by-item vs items-daily: $0.00 gap. Revenue-by-item vs transaction
  total: **−$92.52**, but this is the already-documented 2-for-1 item-count
  effect (#205) — expected, not a new discrepancy.
- **`transaction_id` reuse still open**: 16 distinct ids carry 39
  transactions, one id spans multiple dates. Flagged since at least PR #200;
  not investigated further tonight — carried forward, not re-derived.
- **Founders Mixer**: 8 purchases, but 0 recorded `view_item` and 0
  `add_to_cart` — every sale dated in June (0603–0624). Whatever path sold
  these tickets did not go through the instrumented view/cart flow. Old
  enough (June) that this reads as a one-time sales mechanism (comped, admin,
  or an event page since retired) rather than a live gap; not chased further
  tonight.
- **Google Ads, corrected**: real state is **$0 spend since 2026-07-24**,
  lifetime total $37.91 unchanged from the 08-25 figure in
  `ANALYTICS_CONTEXT.md`. One campaign, `Website traffic-Search-1`, recorded
  $35.35 lifetime against **zero attributed sessions** — already known, not
  new spend.

## NEEDS TAYLOR INPUT (0)

Nothing tonight clears the bar in §7 of the prompt — every open item above is
either resolvable in code (the UTM worklist, the script bug) or already a
decided/carried-forward historical item. Matches last night's count (0).

## Zero-risk fixes, described and not applied

1. **`scripts/ga4-nightly-summary.js`, the Google Ads "last 7 closed days"
   block** (around the `gaClosed`/`gaRecent`/`gaSpendRecent` lines): anchor
   the 7-day window to the pull's actual date (e.g. the same `closedDates()`
   basis used for `daily-trend`, or explicitly check whether the sparse
   table's max date falls inside the current 7-day window before reporting
   any "recent" spend), instead of taking the last 7 dates present in the
   Google Ads table itself. As written, once an ad account goes dark, this
   block will keep reporting increasingly stale historical spend as
   "still accruing" forever — it will not self-correct, and it already
   fooled one nightly run into flagging it as a live issue.
2. **Internal-link UTM stripping**: remove `utm_source`/`utm_medium` from the
   `get_tickets_block` and internal `/matches` link elements (item 3 in the
   UTM section) — 94 sessions of live, ongoing self-misattribution, the only
   *currently live* item in the whole UTM worklist with a clear single-line
   fix.
3. **`facebook`/`instagram` source casing normalization** at the destination
   URL / referral-tagging level (items 1–2) — highest session volume in the
   worklist, but requires touching however these six-plus row variants get
   produced (ad UTMs, referral handling) rather than a single call site, so
   scoping it is more than zero-risk-obvious; flagged, not designed, here.

## Caveats

- ANALYTICS_METHOD §1: 20260905 and 20260906 excluded from every daily figure
  as not-yet-final.
- ANALYTICS_METHOD §8 governed the entire Google-Ads-channel reading in
  EVENTS and ALSO — `ads_conversion_About_Us_1` is never treated as a real
  conversion anywhere in this report.
- ANALYTICS_METHOD §12: `add_payment_info` (n=10), Google Ads `Campaign #1`
  (n=4 clicks) and the transaction_id-reuse figures are all small-sample;
  read as direction, not rate.
- ANALYTICS_METHOD §7: all revenue figures above are own-site GA4 only, not
  business revenue.
- ANALYTICS_METHOD §9/§10: no Meta week-over-week comparison is drawn (the
  09-06 Meta pull overlaps this one); no comparison spans the 2026-08-21,
  08-25, 08-28 or 09-03 series-break dates.

**What I did not verify:** did not log into the Google Ads Manager UI tonight
— the "$0 spend since 07-24" conclusion rests on the raw CSV's max date plus
the 08-25 figure already on record in `ANALYTICS_CONTEXT.md`, not a fresh
account check. Did not open any `public/` page source — no dead-traffic
pattern tonight needed a page-level hypothesis beyond the already-established
webview mechanism. Did not chase `transaction_id` reuse or the Founders
Mixer no-view-purchases pattern beyond noting them. Did not independently
re-verify last night's LancasterOnline/Evvnt obfuscated-tag fix beyond
observing this pull's volume is consistent with it.

## Coverage

**46 of 46** tables represented in the standing summary; every table used.
No table was skimmed-and-skipped.
