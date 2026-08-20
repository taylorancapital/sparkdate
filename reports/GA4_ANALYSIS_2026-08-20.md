# GA4 Analysis — 2026-08-20 (Nightly Automation, Cowork Session)

**This run made zero code changes.** It is a read-only analysis of the GA4 + Meta exports sitting
in `Business Plan/files/Night Tasks/`. The only file added to the repo on this branch is this
report. Every recommendation below is written for a human to apply or reject — nothing was applied,
not even a one-character fix.

---

## What was analyzed

**Focus picked: GA4 Analysis → Site Improvement Suggestions.** The prompt library file named in the
automation's instructions (`Night Tasks/sparkdate-nightly-claude-code-prompts.md`) still does not
exist — for the ninth consecutive run. `Business Plan/files/Night Tasks/TONIGHT_PROMPT.md` remains
the de facto library, and its own default rule ("fresh `download*.csv` present → GA4 analysis") is
unambiguous here: a fresh export landed. No rotation ambiguity tonight.

Files read (read-only; nothing moved, renamed, or deleted):

- **18 `download*.csv` files**, all carrying window `20260519-20260819` in their own `#` header —
  one day newer than the 08-19 run's `20260519-20260818`. `download (15).csv` and
  `download (17).csv` are byte-identical duplicates of the same "All Cities" report (verified with
  `diff`); `(17)` was ignored as redundant.
- **`data.pdf`** — Conversion Tracking / Key Events Breakdown, same Aug 19 window. Read this run
  (the 08-18 and 08-19 reports both skipped the PDFs; this one carries the authoritative key-event
  totals, so skipping it was leaving a cross-check on the table).
- **`data (1).pdf`** — Path Exploration, same window. Also read this run, and it produced the
  in-app-browser finding below that no CSV surfaces.
- **`meta-insights-2026-08-19.csv`** — Meta Marketing API campaign-level pull, window
  `20260813-20260819`, 12 campaign rows.
- Source in a fresh clone of `main` (HEAD `0458735`): `public/lp.html`, `public/event.html`,
  `public/events.html`, `public/index.html`, `public/matches.html`.

**Report-name-to-file-number mapping was rebuilt from each file's own `#` title line.** Tonight's
numbering differs from the 08-19 export again (e.g. that run's `download (17).csv` was the Checkout
Error Breakdown; tonight it's an All Cities duplicate). Confirmed for the third run in a row: the
numbering is session-specific and must never be assumed stable.

**Prior period compared against:** `reports/GA4_ANALYSIS_2026-08-19.md`, which is already merged to
`main` and was therefore readable directly from this clone. It covered window `20260519-20260818`,
$743.73 / 28 transactions.

---

## Headline 1 — The 8-report funnel mystery has a source-level cause: `begin_checkout` is not a checkout event

Every nightly report since 07-29 has flagged that GA4's three Explore funnels disagree with each
other and with reality, and the 08-19 report added a second oddity it could only hypothesise about:
"SparkDate: Round 2 — Summer Nights" shows **8 purchases against only 7 add-to-carts**, which is a
funnel-order impossibility. Tonight a `grep` across `public/` locates the actual cause, and it
explains both symptoms at once.

**`begin_checkout` fires from exactly three places, and none of them is a checkout:**

| Call site | What the user actually did |
|---|---|
| `public/index.html:1089` | Clicked the "Get Tickets" block on the **homepage** |
| `public/index.html:1413` | Clicked the **sticky ticket bar** on the homepage |
| `public/lp.html:592` | Clicked the "Get Tickets" button on the **landing page** |

**`add_to_cart` fires from exactly two places, both on the *destination* pages:**
`public/event.html:1481` and `public/events.html:1855`.

So the real user journey is:

```
/lp or /  →  begin_checkout (CTA click)  →  navigate to /event  →  view_item  →  add_to_cart
          →  checkout_form_started  →  purchase
```

`begin_checkout` is being used as an **outbound-click / intent** event on marketing pages, and it
happens **before** `view_item` and `add_to_cart`, not after. GA4's standard ecommerce funnel
assumes the opposite order (`view_item → add_to_cart → begin_checkout → purchase`). Every Explore
funnel built on that assumption is therefore chaining events backwards.

The raw event counts confirm this exactly (`Traffic & Events Monitoring-Events Counts Last 28 days`):

| Event | Count | Expected if the order were canonical |
|---|---|---|
| `view_item` | 328 | — |
| `add_to_cart` | 47 | ≤ 328 ✓ |
| `begin_checkout` | **107** | ≤ 47 ✗ — it is **2.3× larger than `add_to_cart`** |
| `checkout_form_started` | **138** | ≤ 107 ✗ — **larger than `begin_checkout`** |
| `purchase` | 28 | — |

Two separate ordering inversions, both consistent with `begin_checkout` living on a page the user
visits *earlier*, and with `checkout_form_started` (`event.html:1531`, `events.html:1811`) being
reachable without ever passing through a homepage or `/lp` CTA — e.g. an Eventbrite or direct
visitor who lands straight on `/event`. That is not a bug in the site; it is a naming/semantics
mismatch against the GA4 ecommerce spec.

**This also fully explains the device funnel's nonsense step:** `Segment by Device-Abandonment rate`
reports Add to cart 35 → Begin checkout 5 (a 14.3% completion that has looked alarming for weeks).
Only 5 users hit a *homepage/landing-page CTA after* already adding to cart, because that is the
wrong direction of travel. The step is measuring backtracking, not abandonment.

**And it explains Round 2's 8 purchases vs 7 add-to-carts.** The 08-19 report's hypothesis (the
`addToCartTracked` boolean gate at `event.html:1469` not tripping on every path) is still plausible
as a contributing factor, but the simpler reading is that `add_to_cart` only exists on
`/event` and `/events`, so any purchase completed through a path that skips those pages — or that
loads `eventData` after the interaction, as the gate at `event.html:1469` requires — records a
purchase with no cart event. `add_to_cart` (47) covering only 28 purchases plus everyone who
abandoned is simply too small a number for the funnel to close.

This is a diagnosis, not a fix, and the fix is a judgment call about renaming live GA4 events with
reporting-history consequences — see NEEDS TAYLOR INPUT #1.

---

## Headline 2 — The heaviest spend week yet produced $0 of GA4 revenue on its final day

Revenue is **flat at $743.73 / 28 transactions**, byte-identical to the 08-19 report's figure. The
new day in the window, **Aug 19 (`Nth day` 0092), contributes $0.00** — it does not appear in the
19-row `Revenue Analysis-Revenue Trend` series at all.

The daily series sums cleanly: 20.50 + 27.49 + 109.96 + 27.49 + 27.49 + 27.49 + 27.49 + 27.49 +
27.49 + 54.98 + 27.49 + 27.49 + 27.49 + 21.49 + 42.98 + 103.96 + 27.49 + 32.49 + 54.98 = **$743.73**,
matching `Revenue by Source` (28 txns) and the Key Events PDF (`purchase` = 28, $743.73) — three
independent tables agree, as they did last run.

Key events did move, just not in the direction that pays:

| Key event | 08-19 report | Tonight | Change |
|---|---|---|---|
| `ads_conversion_About_Us_1` | 97 | 97 | flat |
| `generate_lead` | 72 | **77** | **+5** |
| `purchase` | 28 | 28 | **flat** |
| **Total key events** | 197 | **202** | +5 |

So Aug 19 produced **5 new leads and zero ticket sales**, while Meta spend for the Aug 13–19 window
came in at **$299.76** — the highest weekly figure in this project's recorded history.

**Item views collapsed on the same day** (`Ecommerce purchases: Item name-Users By Events`, daily):

| Day | Tellus | Good Good | Loxley's | Marion Court | Total item views |
|---|---|---|---|---|---|
| Aug 17 (0090) | 28 | 11 | 2 | 5 | **46** |
| Aug 18 (0091) | 25 | 1 | 2 | 2 | **30** |
| Aug 19 (0092) | 4 | 1 | 1 | 0 | **6** |

Paid active users track the same shape (`Active Users: Direct vs Paid`): Aug 17 = **100** (an
all-time daily high), Aug 18 = 50, Aug 19 = **25**.

**Treat Aug 19 as provisional, not as a crash.** The CSV file timestamps show this export was pulled
on the evening of Aug 19 itself (21:34–21:46), so the day was still in progress and GA4's own
processing lag had not cleared. This repo's own run log documents **four** prior instances of the
last day in an export reading catastrophically low and correcting upward once a later export
included a day past it. The honest read is: *unknown until the next export*. What is **not**
provisional is that revenue through Aug 18 is unchanged from the last report while a full week of
$299.76 spend ran.

---

## Meta Ads, Aug 13–19: spend up 12.5%, CPC up 15.4%, four pixel purchases, all from three campaigns

`meta-insights-2026-08-19.csv` (Aug 13–19, 12 campaigns) vs. the 08-19 report's
`meta-insights-2026-08-18.csv` (Aug 12–18, 12 campaigns). **The windows overlap on 6 of 7 days** —
deltas are directional, not two independent weeks.

| Metric | Aug 12–18 | Aug 13–19 | Change |
|---|---|---|---|
| Spend | $266.55 | **$299.76** | **+$33.21 (+12.5%)** |
| Impressions | 11,820 | 11,483 | −337 |
| Clicks | 505 | 492 | −13 |
| Blended CPC | $0.5278 | **$0.6093** | **+15.4%** |
| Pixel `purchase` actions | 3 | **4** | +1 |

Third consecutive week of spend rising while clicks fall. Cumulative CPC drift across the three
pulls: $0.4298 → $0.5278 → $0.6093, **+41.8% in two weeks**.

**Where the four purchases came from** (`offsite_conversion.fb_pixel_purchase`):

| Campaign | Spend | Clicks | Pixel purchases |
|---|---|---|---|
| Campaign 1 Tellus AfterDark: Singles Edition **Retargeting** | $58.52 | 169 | 1 |
| Campaign 1 Event 3 Tellus AfterDark ... **-All Genders** | $41.94 | 64 | 1 |
| Campaign 1 Event 4 Good Good Campaign-**Retargeting** | $42.30 | 52 | 2 |
| **Converting subtotal** | **$142.76** | **285** | **4** |
| **Everything else (9 campaigns)** | **$157.00** | **207** | **0** |

Cost per pixel purchase: **$35.69** on the converting campaigns, **$74.94 blended** across all
spend, against a ticket that grosses **$27.49**. Even the best-case subtotal is above the ticket
price. The "-All Genders" non-retargeting campaign holds its purchase for a second consecutive pull,
which is weak but real support for the 08-19 report's "watch this" flag — retargeting-only
conversion is no longer a clean rule.

**The three Marion Court campaigns are the clearest underperformers in the account:**

| Campaign | Spend | Clicks | CPC | Purchases |
|---|---|---|---|---|
| Marion Court Retargeting | $15.17 | 19 | $0.798 | 0 |
| Marion Court All Genders | $9.98 | 6 | **$1.663** | 0 |
| Marion Court Female | $9.45 | 6 | **$1.575** | 0 |
| **Total** | **$34.60** | **31** | **$1.116** | **0** |

$1.116 CPC against a $0.609 account average — **1.8× the blended cost per click** — and the GA4 item
table corroborates the outcome exactly: **"SparkDate: Real People, Real Drinks, Real Court" has 14
item views, 0 add-to-carts, 0 purchases, $0 revenue**, and took **zero new views on Aug 19**. This is
now the third consecutive report showing a perfect zero for this item, with paid spend behind it.

---

## Roughly a quarter of all page views land inside a Facebook/Instagram webview, and almost nobody escapes

This comes from `data (1).pdf` (Path Exploration), which neither of the last two reports opened.

```
session_start 3,187  →  page_view 3,135  →  scroll 879
                                             in_app_browser_detected 818   ← 26.1% of page_views
                                             session_start 261
                                             targeted_event_landing 150
                                             ads_conversion_About_Us_1 89
                                             view_item 82
                                             in_app_browser_escape_attempt 72
                                             lead_form_started 33
```

`in_app_browser_detected` is the **second most common thing that happens after a page view**, ahead
of `view_item` by 10×. Lifetime (28-day event counts) it fires **1,102** times. What that cohort
does next:

| Event | Count | % of 1,102 detections |
|---|---|---|
| `in_app_browser_escape_attempt` | 93 | **8.4%** |
| `in_app_browser_copy_link` | 8 | 0.7% |
| `in_app_browser_banner_dismissed` | 2 | 0.2% |
| `in_app_browser_checkout_blocked` | 12 | 1.1% (legacy, pre-PR #165) |
| `in_app_browser_checkout_override` | 2 | 0.2% |

**91.5% of in-app visitors take no escape action at all.** Reading `public/lp.html:355-420` explains
part of it and is worth stating plainly: `tryEscapeInAppBrowser()` returns `false` immediately for
anything that isn't Android (`if (!/Android/i.test(navigator.userAgent)) return false;`), and the
"Open in Chrome" button is only displayed on Android (`lp.html:400`). **iOS in-app visitors are
offered no escape mechanism at all** — by deliberate design, per the code comment, because Apple
removed the `x-safari-https://` trick. The comment is correct about the constraint; the consequence
is that the majority of this cohort has exactly one path, the email-capture fallback.

That fallback is doing something: `lead_form_started` = 154 → `generate_lead` = 77 is a **50.0%**
completion, and `generate_lead` is the only key event that grew this period (+5). But leads are not
tickets, and this is the single largest identified population on the site with no direct purchase
path. Whether to push harder on the email fallback or move to Stripe hosted Checkout (the code
comment at `lp.html:585-589` already names this as the alternative — a full-page redirect survives
these webviews where an embedded 3DS iframe does not) is a product/money decision, not an agent's.

---

## Cohort retention is collapsing as the cohorts get bigger

`Retention & Cohorts-Cohort exploration 1`, week-1 return rate by weekly cohort:

| Cohort week | Size | Returned in week 1 | Rate |
|---|---|---|---|
| May 24–30 | 7 | 1 | 14.29% |
| Jun 14–20 | 43 | 4 | 9.30% |
| Jun 21–27 | 60 | 7 | 11.67% |
| Jul 5–11 | 154 | 1 | 0.65% |
| Jul 12–18 | 133 | 1 | 0.75% |
| Jul 19–25 | 216 | 3 | 1.39% |
| Jul 26–Aug 1 | 270 | 5 | 1.85% |
| Aug 2–8 | 177 | 4 | 2.26% |
| **Aug 9–15** | **484** | **11** | **2.27%** |
| Aug 16–19 (partial) | 247 | 0 | 0.00% |

The three small early cohorts (7/43/60 users, pre-paid-scale) returned at **9–14%**. Every cohort
since paid traffic scaled returns at **0.65–2.27%**, and the largest cohort ever recorded (484 users,
Aug 9–15) sits at **2.27%**. Across all cohorts, **39 of 2,097 users ever came back**.

This is the retention signature of one-and-done paid clicks rather than an audience. It is
consistent with, and probably the same underlying story as, the 65.8% of traffic / 8.1% of revenue
paid-social split. Worth reading alongside the fact that `first_visit` = 2,118 against
`session_start` = 3,217 — 65.8% of sessions are somebody's first and only one.

---

## A self-referral UTM bug is overwriting real acquisition sources — located in source

`Traffic & Events Monitoring-Campaign Performance` contains rows that are internal page names, not
traffic sources:

| Session source / medium | Users | Key events | Revenue |
|---|---|---|---|
| `matches / (not set)` | 1 | 4 | **$27.49** |
| `matches / web` | 3 | 0 | $0 |
| `matches / (none)` | 1 | 0 | $0 |
| `lp / (not set)` | 12 | 1 | $0 |
| `lp / paid_social`, `lp / (none)`, `lp / ` | 3 total | 0 | $0 |
| `get_tickets_block / (not set)` | 5 | 1 | **$27.49** |

The `matches` rows are directly explained by source: `public/matches.html:182` builds an **internal**
ticket link as `ticketUrl = (ne.ticketPath || '') + '&utm_source=matches&utm_medium=web&utm_campaign=matches_page'`,
and `:190` does the same for the `/getaways` promo link. Tagging an internal navigation with `utm_`
parameters makes GA4 start a new attributed session and **overwrite whatever the user's real
acquisition source was**. One $27.49 sale is currently credited to the SparkDate matches page instead
of whatever channel actually paid for that visitor.

(For contrast, `public/event.html:1326` and `matches.html:130` / `account.html:1366` use `utm_source`
on *outbound share* and *referral* links, which is correct usage — the bug is specifically the two
internal links.)

`get_tickets_block / (not set)` (5 users, $27.49) could **not** be located in source. The only
occurrence of that string is a gtag *event parameter* at `index.html:1089`, which should not affect
session source. Flagging as unexplained rather than guessing.

---

## fbclid duplication is now at 99.2% of paid landing-page rows

`Traffic & Events Monitoring-Free form 4` (926 data rows, paid traffic, 1,032 sessions / 5,616
events):

- **920 of 926 rows (99.4%)** contain an `fbclid` parameter.
- **919 of 926 rows (99.2%)** contain **more than one** `fbclid` — up from the 08-19 report's
  891/906 (98.3%).
- **588 rows (63.5%)** contain **more than one `?`**, i.e. a full second query string welded onto
  the first (e.g. `/lp?eventId=X&fbclid=Y?eventId=X&fbclid=Y`).

Collapsed to base paths, all 926 rows are only **two real pages**: `/lp` (910 sessions, 4,804 events,
5.3 events/session) and `/events` (121 sessions, 812 events, 6.7 events/session). The landing-page
dimension is effectively destroyed for every GA4 report that groups by URL.

`URLSearchParams.get('eventId')` still returns the right value regardless, so checkout is not
breaking — but the previously-identified `carry`-string logic at `public/lp.html:324-330`, which
copies the entire inbound query string onto the next hop, remains the plausible compounding source.
**Not changed by this run.**

---

## Everything else — moving and not moving

**Checkout errors: 17 → 18.** `Checkout Error Breakdown`: `(not set)` 8 (flat), `card_incomplete`
**9** (up from 8), `card_declined` 1 (flat). One new incomplete-card error on Aug 19. Total (18)
matches the 28-day `checkout_error` event count (18) exactly.

**Mobile vs. desktop, fourth consecutive report, same direction.** `Segment by Device-Abandonment
rate`: mobile is **1,685 of 2,097 sessions (80.4%)**. Mobile add-to-cart → begin-checkout is 30 → 2
(6.7%); desktop is 5 → 3 (60.0%). *Given Headline 1, this specific ratio is measuring the wrong
thing and should be retired as evidence* — but the underlying concern (mobile is 80% of traffic and
the in-app-browser cohort is overwhelmingly mobile) stands on its own.

**Item funnel, lifetime** (`View-Cart-Revenue`, totals 328 / 47 / 28 / $678.73):

| Item | Viewed | Cart | Purchased | Revenue | vs. 08-19 |
|---|---|---|---|---|---|
| Tellus AfterDark: Singles Edition | 198 | 20 | 8 | $187.92 | +7 views, +2 carts, **0 new purchases** |
| Good Good Night @ Good Good Things | 82 | 15 | 2 | $59.98 | +1 view |
| SparkDate: Round 2 — Summer Nights | 19 | 7 | 8 | $199.92 | unchanged |
| Sparkdate: The Loxley's Social | 15 | 5 | 2 | $37.98 | +1 view |
| SparkDate: Real People, Real Drinks, Real Court | 14 | **0** | **0** | **$0** | unchanged |
| Founders Mixer | **0** | **0** | 8 | $192.93 | unchanged |

**Founders Mixer's zero-telemetry $192.93 is unchanged for an eighth-plus consecutive report** —
still not greppable in `public/`, `api/`, or `lib/`; still needs Firestore/Eventbrite access.

**Service-fee reconciliation unchanged.** Total $743.73 − item revenue $678.73 = $65.00. At
`SERVICE_FEE` $2.50 × 28 the clean figure is $70.00 → **$5.00 short, exactly 2 transactions**,
identical to the last two reports. Same two legacy transactions, not a growing problem.

**Datacenter/bot traffic: 9.0%, steady.** `All Cities` (2,099 users): Prineville 51 + Lulea 29 +
Council Bluffs 23 + Forest City 23 + Dublin 22 + Ashburn 21 + Boardman 20 = **189 users (9.0%)**,
versus 9.2% last run and 9.1% the run before.

**Philadelphia vs. Lancaster: 17.8×, essentially flat.** `Philly vs Lancaster (filtered)` (a scoped
view totalling $136.45, not sitewide): Philadelphia 364 users / 5 key events / $27.49 / 33.3%
engagement; Lancaster 81 users / 16 key events / $108.96 / 52.7% engagement. Revenue per user
**$0.076 vs $1.345 (17.8×)**, versus 17.5× last run. Key events per user: 0.014 vs 0.198 (14.4×).

**Channel fragmentation, unchanged.** `Facebook / paid_social` (803) and `facebook / paid_social`
(389, lowercase) are still two buckets for one channel, alongside `Facebook / paid` (22),
`Facebook / organic` (14), `facebook / social` (39), `facebook.com / referral` (23),
`m.facebook.com / referral` (36), `l.facebook.com / referral` (1),
`eventsmanager.facebook.com / referral` (1). All paid-social sources combined: **1,380 of 2,098
users (65.8%) producing $59.98 of $743.73 (8.1%)** — identical proportions to last run.

**`[object Object] / undefined`: still exactly 10 users.** Third consecutive report, still not
located in `public/`, `api/`, or `lib/`.

**`test / test`: still 1 user in production data.** Unchanged.

**`ads_conversion_About_Us_1` is now 48.0% of all key events** (97 of 202, down from 49.2% of 197)
and still worth **$0.00**. It contributed zero new key events this period while `generate_lead` grew
by 5.

**Google Ads still $0.** `googleads / paid` 56 users / 51 key events / $0; all Google Ads variants
combined (`googleads / paid`, `Google Ads / cpc`, `googleads / (not set)`, `googleads / offline`,
`googleads / cpc`, `Google / (not set)`) = **112 users, 92 key events, $0.00**. The only Google
revenue in the window is `google / organic` ($27.49) and `google / cpc` ($27.49).

**Error-ish events worth a mention:** `next_event_fetch_failed` = **60** (the retry logic added at
`lp.html:421-430` was meant to reduce this; can't tell from a lifetime count whether it did),
`targeted_event_not_found` = 6, `targeted_event_missing_id` = 1.

---

## NEEDS TAYLOR INPUT (strategy / money / measurement — not an agent's call)

1. **`begin_checkout` should probably be renamed.** It is instrumented as a marketing-page CTA click
   (`index.html:1089`, `index.html:1413`, `lp.html:592`), not a checkout step, which is why 8+
   reports of Explore funnels have been unreadable and why `begin_checkout` (107) exceeds
   `add_to_cart` (47). Renaming a live GA4 event breaks historical continuity and is a measurement
   decision with real consequences — **explicitly not applied.** A non-destructive alternative is to
   leave the event alone and rebuild the Explore funnels around the actual order. *Re-check in ~1
   week:* whether any rebuilt funnel lands within 20% of the true `purchase` count.
2. **$299.76 spent Aug 13–19 for 4 pixel purchases — $74.94 blended cost per purchase against a
   $27.49 ticket.** $157.00 of that went to 9 campaigns that produced zero. This is a budget
   decision. *Re-check in ~1 week:* spend vs. $299.76 and cost-per-purchase vs. $74.94 in the next
   `meta-insights-*.csv`.
3. **Kill or rebuild the three Marion Court campaigns.** $34.60 spent, $1.116 CPC (1.8× account
   average), 31 clicks, and the corresponding GA4 item has **14 views, 0 add-to-carts, 0 purchases**
   across three reports. Either the creative, the audience, or the event itself isn't landing.
   *Re-check in ~1 week:* whether "SparkDate: Real People, Real Drinks, Real Court" has any non-zero
   add-to-cart.
4. **CPC has risen 41.8% in two weeks** ($0.4298 → $0.5278 → $0.6093) on a flat 12-campaign roster.
   Deliberate bid/budget change, or auction pressure? *Re-check in ~1 week:* blended CPC vs. $0.6093.
5. **iOS in-app-browser visitors have no escape path, by design** (`lp.html:355-360`), and 91.5% of
   the 1,102 detected in-app sessions take no escape action. The code comment at `lp.html:585-589`
   already names **Stripe hosted Checkout** (full-page redirect, survives webviews) as the fix. That
   is a payments-architecture decision. *Re-check in ~1 week:* `in_app_browser_escape_attempt` as a
   share of `in_app_browser_detected` (currently 8.4%), and whether purchase count moves.
6. **Week-1 retention has fallen from 9–14% (pre-scale cohorts) to 0.65–2.27% (post-scale).** The
   484-user Aug 9–15 cohort returned 11 people. If the goal is repeat attendance rather than a
   one-time ticket, this is the number that says the current traffic isn't building an audience.
   *Re-check in ~1 week:* week-1 rate for the Aug 16–22 cohort.
7. **Philadelphia vs. Lancaster is 17.8× revenue-per-user in Lancaster's favour**, stable across
   three reports, on a small transaction base. Geo-allocation is a business call.
8. **`ads_conversion_About_Us_1` should probably stop being a key event** — 48.0% of key events,
   $0.00 revenue. Same recommendation as the last two reports. GA4 admin action with reporting
   history consequences.
9. **Founders Mixer's $192.93 / 8 purchases with zero funnel telemetry** — eighth-plus report,
   unresolvable from source. Needs Firestore/Eventbrite access.
10. **Prompt-library fragmentation, ninth run.** `sparkdate-nightly-claude-code-prompts.md` still
    does not exist; `TONIGHT_PROMPT.md` is still stamped `2026-08-14` (so the local PowerShell job
    keeps skipping its own CLI run); two separate run logs still exist in two folders. Worth picking
    one canonical file before this recurs a tenth time.

## Proposed zero-risk fixes — NOT APPLIED, for a human to do

1. **Remove the `utm_source`/`utm_medium`/`utm_campaign` parameters from the two *internal* links at
   `public/matches.html:182` and `public/matches.html:190`.** They restart GA4 attribution and
   overwrite real acquisition sources; one $27.49 sale is currently credited to `matches`. This is
   the most clearly-correct small change identified this run — and it is still **not applied**, per
   the report-only rule. *Re-check in ~1 week:* whether `matches / *` rows disappear from Campaign
   Performance.
2. **Asterisk or omit the final day in these reports.** Fifth consecutive run where the last day
   reads anomalously low (tonight: Aug 19 at $0 revenue, 6 item views, 25 paid users, on an export
   pulled during that same evening). *Re-check in ~1 week:* what Aug 19 reads once a later export
   includes Aug 20.
3. **Normalize `utm_source` capitalization on Meta ad destination URLs** (`Facebook` 803 vs.
   `facebook` 389). Ad-platform URL field change, not a repo change.
4. **Investigate `fbclid` duplication at `public/lp.html:324-330`** (the `carry` string). Now at
   99.2% of paid landing rows and 63.5% carrying a second `?`. Behavioural change to attribution
   carry-through — needs a human decision and a test.
5. **Rebuild or delete the three GA4 Explore funnels** (claiming 9, 11, and 2 purchases against a
   real 28), informed by Headline 1's actual event order. GA4 UI action, no code.
6. **Remove the `test / test` source tag** from production (1 user, unchanged for three reports).
7. **Locate the `[object Object] / undefined` link builder** (10 users, unchanged for three reports;
   not in `public/`, `api/`, or `lib/`).

## Caveats and method notes

- **Aug 19 is a partial, still-processing day.** The GA4 CSVs carry filesystem timestamps of Aug 19
  21:34–21:46, i.e. they were exported during the last day of their own window. Every Aug-19-specific
  figure in this report (revenue $0, 6 item views, 25 paid users, 5 new leads) should be read as
  provisional. This repo's log documents four prior last-day artifacts that corrected upward.
- **I could not verify the 08-19 report's engagement-rate prediction.** That report predicted Aug 18
  would correct from 3.2% into the 45–70% band. Tonight's 18-file export contains **no
  engagement-rate-by-day report** (the 08-19 export had 23 files including one; this set does not),
  so the prediction is neither confirmed nor refuted. Not guessed at.
- **Meta windows overlap.** Aug 13–19 vs. Aug 12–18 share 6 of 7 days. Week-over-week deltas reflect
  one day in and one day out. The per-campaign purchase attribution cannot be separated into "new
  conversion" vs. "re-attributed existing one" without event-level timestamps this export lacks.
- **Sample sizes are small throughout.** 28 lifetime transactions, 4 Meta pixel purchases this week,
  81 Lancaster users, 5 users in the device funnel's begin-checkout step. These are directional
  observations from counts, not statistically defensible claims. The 17.8× Philly/Lancaster multiple
  in particular rests on a handful of transactions.
- **Revenue reconciliation passes.** The 19 daily values sum to $743.73, matching `Revenue by Source`
  (28 txns) and the Key Events PDF exactly. Cumulative through Aug 18 matches the merged 08-19 report
  precisely.
- **File numbering is session-specific.** Every figure was verified against its file's own `# ` title
  line. `download (15).csv` and `download (17).csv` are byte-identical; `(17)` was excluded.
- **Both PDFs were read this run** (the last two reports skipped them). `data (1).pdf`'s path
  exploration produced the in-app-browser finding that no CSV surfaces — worth continuing to read.
- **Source claims are grounded in a fresh clone of `main` at `0458735`**, not in the mounted working
  copy, so they reflect what is actually deployed rather than any local edits.
