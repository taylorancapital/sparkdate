# GA4 Analysis — 2026-08-28

**This run made ZERO code changes.** The only file added to this branch is this report.
Every fix described below is written down for a human to apply, not applied.

**`ANALYTICS_CONTEXT.md` was read in full first. The copy in this sandbox is stamped
"Last updated: 2026-08-26"** — quoted here per that file's own sync-warning rule. It
contains the 08-26 corrections (the two-day tail rule, the All Cities datacenter
measurement, the Good Good / Marion Court Traffic resume corrections), so it is the
current copy and has not forked. Its campaign table is still one export behind on
`Marion Court | Traffic`, which is reported below, not edited.

**Prompt:** Prompt 9 (GA4 → site improvement suggestions), picked because the GA4 export
is genuinely fresh — see §E1.

---

## Data used

| Source | Window | Freshness |
|---|---|---|
| 38 × `download*.csv` | `20260519-20260827` (read from each file's own `#` header) | **Fresh** — one day past the `...0826` window the 08-26 report analysed and the 08-27 run rejected as stale |
| `meta-insights-2026-08-27.csv` | `20260821-20260827`, 11 campaigns, level=campaign | **Fresh** — newest prior pull was `...-08-25.csv` (`20260819-20260825`) |
| `meta-insights-2026-08-25.csv` | `20260819-20260825`, 11 campaigns | prior period, for the w/w comparison in §A3 |
| `/tmp/sparkwork` (fresh clone of `main`, unshallowed) | HEAD `31166bb` | read-only, used to ground every source-level claim |

Day indices are 0-based from 2026-05-19, so **`0100` = 2026-08-27** and `0099` = 2026-08-26.
Cross-checked three ways (calendar arithmetic; the 08-26 report's independently-derived
`0099 = 2026-08-26`; and the Revenue Trend file summing to exactly $946.16 over its 25
non-zero days, matching the Key Events Breakdown total).

---

## A. Findings

### A1. HEADLINE — GA4 is recording our own UI element names as acquisition sources, and it is carrying real money with it

`download (5).csv` ("Key events — Key event sources") has a `Source` column, and among the
real channels it lists these:

| Key event | "Source" | Key events | Revenue |
|---|---|---:|---:|
| `purchase` | **`lp`** | 4.124 | **$118.89** |
| `purchase` | **`get_tickets_block`** | 2.136 | **$58.73** |
| `purchase` | **`events`** | 0.275 | **$7.57** |
| `generate_lead` | **`lp`** | 5.432 | $0 |
| `generate_lead` | **`matches`** | 5.389 | $0 |
| `ads_conversion_About_Us_1` | **`get_tickets_block`** | 2.038 | $0 |
| `ads_conversion_About_Us_1` | **`lp`** | 0.950 | $0 |
| | **total** | **20.345 of 219 (9.3%)** | **$185.18 of $946.16 (19.6%)** |

(The fractions are GA4's data-driven attribution splitting credit across touchpoints;
they are not a parsing error.)

Session-scoped, the same thing shows up in `download (32).csv` as **32 active users, 6 key
events and $54.98 across nine rows**: `lp / (not set)` (15 users), `lp / paid_social` (2),
`lp / (none)` (1), `matches / web` (3), `matches / (none)` (2), `matches / (not set)` (2,
**4 key events, $27.49**), `matches / ` (1), `get_tickets_block / (not set)` (5, 1 key
event, **$27.49**), `sticky_ticket_bar / (not set)` (1).

**Cause, located in source.** GA4 treats an event parameter literally named `source` as an
event-scoped campaign field and folds it into the traffic-source dimensions. The repo
passes exactly that, by hand, on **11 live `gtag('event', …)` calls across four pages**:

```
public/lp.html:572, 603, 625, 672, 682, 789   { source: 'lp' }
public/events.html:1811, 1824, 1842           { source: 'events' }
public/event.html:1056                        { source: 'event' }
public/matches.html:263                       { source: 'matches' }
```

**`get_tickets_block` is what proves it.** That string has never existed as a URL, a link,
or a UTM anywhere in the repo — I grepped the whole tree and the full history. It only ever
existed as `gtag('event', 'begin_checkout', { source: 'get_tickets_block' })`, added in
`58c83b8` (2026-06-05); `sticky_ticket_bar` likewise in `d3b686c` (2026-08-07). Yet GA4 has
both as **Session source** rows carrying users, key events and $27.49 of revenue. A value
that only ever travelled as an event parameter cannot reach the session-source dimension by
any other route.

**Two of them are already fixed, by accident.** `ea7faa8` — "Make the GA4 ecommerce funnel
measure the funnel (#204)", 2026-08-21 — rewrote both homepage handlers to
`select_promotion` with `promotion_name:`, which incidentally removed the reserved `source`
key. That was done to fix the funnel, not this; the same class of bug was left in place on
the other four pages.

**This reclassifies a recurring finding.** The `matches / *` rows and the $27.49 miscredited
to them have been attributed across several reports to the `matches.html` self-referral UTM
links fixed in #237. #237 fixed the *links*. `matches.html:263` still passes
`source: 'matches'` on a live `select_content` call, so those rows have a second, unfixed
cause and will keep appearing.

**Honest limits.** `event` (singular, from `event.html:1056`) is the one live value that does
**not** appear in any source row — consistent with it firing only inside webviews on a page
that is rarely a session's first, but it means the mechanism is confirmed for four of five
values, not five of five. And the two files disagree on magnitude because they use different
attribution models: **$185.18 data-driven vs $54.98 last-click session-scoped.** Both are
above zero and both point at the same rows; I am not asserting a single number.

---

### A2. Marion Court took its first purchase — the one number that was allowed to reopen the question

`ANALYTICS_CONTEXT.md` §3b closed the Marion Court venue/ad-set debate on 2026-08-25 and
left exactly one trigger open: *"Track cart→purchase for this event specifically; that number
moving is the only thing that re-opens the discussion."*

It moved. From `download (2).csv`:

| | 08-26 report | tonight (`...0827`) |
|---|---:|---:|
| Items viewed | 27 | **40** |
| Added to cart | 6 | **7** |
| **Purchased** | **0** | **1** |
| Item revenue | $0.00 | **$24.99** |

Sixth consecutive report is no longer "zero purchases." **But two things temper it, and they
pull in opposite directions:**

1. **Meta's pixel still shows zero.** Across Aug 21–27 all four Marion Court campaigns
   returned `offsite_conversion.fb_pixel_purchase = 0`, on **$65.42 of spend (32.3% of the
   week's total)**, 6,485 impressions, 156 clicks, 4 `view_content`, **0 `add_to_cart`, 0
   `initiate_checkout`**. So the *event* converted once; the *campaigns* still have not been
   credited with a conversion. Those are different claims and I am not merging them.
2. **View→cart efficiency went down, not up.** +13 views bought +1 cart: 22.2% → **17.5%**.
   The purchase came off a cart base that grew more slowly than attention did.

n=1. This is a single ticket. It is reported because §3b named this exact number as the
trigger, not because one sale settles anything.

---

### A3. The Meta week got materially cheaper — and for once the window comparison is structurally legitimate

`ANALYTICS_CONTEXT.md` §1 requires checking that every campaign existed for the whole of both
windows before reporting a spend change as a decision. **I ran that check and it passes:** the
Aug 19–25 and Aug 21–27 pulls contain the **same 11 campaigns, no additions and no drops**,
and the newest of them (Marion Court, launched 2026-08-17) predates the start of both windows.
The two windows overlap 5 of 7 days, so these are not independent samples — but the composition
artifact that produced three wrong conclusions in a row is not present here.

| | Aug 19–25 | Aug 21–27 | change |
|---|---:|---:|---:|
| Spend | $234.58 | **$202.54** | −13.7% |
| Clicks | 514 | **616** | +19.8% |
| **CPC** | $0.4564 | **$0.3288** | **−28.0%** |
| `landing_page_view` | 312 | **421** | +34.9% |
| Impressions | 15,631 | 18,612 | +19.1% |
| pixel `lead` | 4 | **8** | ×2 |
| pixel `view_content` | 62 | 54 | −12.9% |
| pixel `add_to_cart` | 8 | 7 | −1 |
| **pixel `purchase`** | **2** | **2** | flat |

More clicks and a third more landing-page views for 14% less money is a real efficiency gain.
**It has not reached purchases**: blended CPA is **$202.54 / 2 = $101.27** against an
$18.99–$29.99 ticket — better than last window's $117.29, still roughly 4× the ticket price.

**Two campaigns are carrying most of the waste**, and both are Marion Court:

| Campaign | Spend | Clicks | CPC | vs account avg |
|---|---:|---:|---:|---:|
| Marion Court Female | $4.32 | **1** | **$4.3200** | 13.1× |
| Marion Court Retargeting | $25.71 | 21 | **$1.2243** | 3.7× |
| Tellus AfterDark …-Sales-Obj-Women | $14.93 | 9 | $1.6589 | 5.0× |
| *(account average)* | | | $0.3288 | — |

And the two cheapest are doing the volume: **Good Good Campaign $0.1629 CPC (284 clicks, 231
landing-page views)** and **Marion Court | Traffic $0.2439 (126 clicks, 96 landing-page
views)**. `Marion Court | Traffic` returned 0 `view_content`, 0 leads and 0 purchases, which
is expected — it is a traffic-objective campaign feeding the retargeting pool by design
(`ANALYTICS_CONTEXT.md` §1, ad-set-level sync PR #296), not a conversion campaign judged and
found wanting.

**Campaign-table drift, third report running:** `Marion Court | Traffic` is still absent from
the §1 first/last-spend table and `Campaign 1 Event 3 Good Good Campaign` is still listed as
ending 2026-08-13 while spending **$46.26 in Aug 21–27** — the single largest line in the
account. Reported, not edited.

---

### A4. The "$75.00 unexplained discrepancy" between two files in the same export is the service fee

Three reports have flagged that the item-revenue file and the total-revenue file disagree on
the same transactions ($72.50, then $75.00, described as *"NOT explained; do not cite it as
agreement without re-deriving it"*).

Tonight: `download (18)` / `download (35)` total revenue **$946.16 across 35 transactions**;
`download (2)` / `download (36)` item revenue **$863.66**. Gap = **$82.50 = 33 × $2.50**.

$2.50 is `SERVICE_FEE` (`event.html:1174`, `events.html:1761`, mirroring `SERVICE_FEE_CENTS`
in `lib/pricing.js`). The purchase event sends `value: ticket + SERVICE_FEE` but item
`price: ticket / seats` — and `event.html:2126-2128` says so outright in a code comment:
*"a metric that already excludes the service fee and so never matched purchase revenue
anyway; `value` above remains exact and is the number to trust."*

The prior gap fits the same rule: **$75.00 = 30 × $2.50 at 32 transactions.** Both times
exactly **two** transactions carry no fee. This is not a discrepancy and does not need
re-deriving each night — **item revenue + $2.50 × (fee-bearing transactions) = total
revenue**, by design. Worth adding to `ANALYTICS_CONTEXT.md` so it stops consuming a
paragraph per report.

---

### A5. The two-day tail rule was ONE day deep in this export — §1 as written would have thrown away good data

`ANALYTICS_CONTEXT.md` §1 says the most recent day is *missing engagement entirely* and the
second-most-recent *reports engagement near zero*. **Tonight it does not read that way:**

| Date | Sessions | Engaged | Rate |
|---|---:|---:|---:|
| 2026-08-23 | 129 | 47 | 36.4% |
| 2026-08-24 | 135 | 62 | 45.9% |
| 2026-08-25 | 141 | 48 | 34.0% |
| 2026-08-26 *(2nd-newest)* | 172 | **73** | **42.4%** — ordinary |
| 2026-08-27 *(newest)* | 142 | **2** | **1.4%** — the artifact, and it HAS a row |

So the artifact is one day deep here, and it sits on the newest day rather than the
second-newest. **The most likely reason is export time-of-day:** these CSVs were exported
2026-08-27 **23:06–23:19**, against the 08-26 export's **12:41–12:54** — eleven more hours of
GA4 processing.

**The rule's underlying claim is nonetheless confirmed again.** 2026-08-25 read **135
sessions / 2 engaged** in the 08-26 export and now reads **141 / 48**. The lag is real and it
does revise upward.

**What I did with it:** kept the conservative two-day drop for every headline number, and
report 2026-08-26 separately as "reads final but treat as provisional." The refinement worth
recording is that **the depth is variable, not fixed at two** — so the rule should stay
"drop two" for safety, but a report should not assert that the second-newest day *is*
corrupted without checking, because tonight it was not.

---

### A6. Open question 1 (waitlist) — re-answered, same direction, and now with the internal-traffic contamination sized

`download (30).csv` splits lead sessions directly:

- **58 sessions generated a lead**
- **43 of those never viewed an item (74.1%)**
- 15 both led and viewed an item (25.9%)

The waitlist is **rescuing, not cannibalising** — three-quarters of leads never looked at a
ticket, so the form is catching people who were leaving, not diverting buyers. Consistent
with the 08-26 read (40 of 55, 72.7%) on a slightly larger base.

**Contamination, from `download (29).csv`:** of those 58 lead sessions, **12 (20.7%) landed on
`/admin` (6), `/matches` (5) or `/profile` (1)** — pages no real lead can reach. That is
higher than the 12% measured over 05-24–08-21 and higher than the 18% in the 08-26 report.
The internal-traffic filter went active 2026-08-25 and **is not retroactive**, so a window
starting 2026-05-19 still contains all of it. On the real base of ~46 sessions the direction
does not change.

The largest genuine lead landing page is **`/` (15 of 58, 25.9%)**, ahead of `/lp` (12) and
`/event` (9). `index.html` still opens with "Your app matched you." — see §C4.

---

### A7. `page_path` is configured to include the query string on nine pages, and GA4 is doubling it

99.7% of the paid-traffic landing-page rows carry a duplicated query segment:

```
/events?event=8E9W…&eventId=8E9W…&eventId=8E9W…
/events?event=8E9W…&checkout=1&eventId=8E9W…&checkout=1&eventId=8E9W…
/lp?eventId=HwXX…&fbclid=PAc…8g?eventId=HwXX…&fbclid=PAc…8g      ← note the second "?"
```

`download (31).csv`: **1,533 distinct rows for 1,687 paid sessions — 1.10 sessions per row.**
1,528 rows (99.7%), covering 1,629 sessions (96.6%), show the doubling. Largest single row: 19
sessions.

**Cause:** nine pages set `'page_path': window.location.pathname + window.location.search` in
their `gtag('config', …)` while GA4 independently derives the query string from
`page_location`, so the search string lands twice — `lp.html:38`, `event.html:38`,
`events.html:41`, `index.html:35`, `signup.html:42`, `privacy.html:23`, `admin.html:36`,
`careers.html:34`. **The repo contains its own control group:** `getaways.html:34`,
`profile.html:28` and all nine `blog/*.html` pages set `pathname` only — and none of them
appear in the duplicated rows.

**Do not overstate this.** 1,521 of the 1,533 rows contain an `fbclid`, which is unique per
click, so **this report would be fragmented even with the bug fixed** — `fbclid` is the
dominant cause of the fragmentation, not the duplication. What the duplication actually costs
is `page_path` itself, and `lp.html:679` names that dimension as the fallback way to tell two
concurrent-event campaigns apart *"via page_path string-matching on the raw query param."*
That fallback is currently matching a doubled string.

---

### A8. Datacenter traffic: essentially flat in absolute terms while real traffic grew

`download (21).csv`, 748 city rows over 2,862 active users. Using the 08-26 report's own
floor set so the two are comparable: Prineville 85, Lulea 52, Council Bluffs 25, Ashburn 21,
Boardman 21, Moses Lake 6 = **210 users (7.3%)**, against 205 (7.7%) two days ago. **+5 users
while the property gained 192** — the absolute datacenter count is static, so the share is
diluting rather than the problem shrinking. Adding the ambiguous Meta-datacenter towns
(Forest City 32, Altoona 16, Gallatin 11) gives **269 (9.4%)**; that is *not* directly
comparable to the 08-26 "318 / 11.9%" figure, which used a wider city set.

**`(not set)` city: 319 users (11.1%).** 587 rows hold ≤2 users (694 users, 24.2%).

Applying §1's region-grouping caveat before any Philly-vs-Lancaster read: the raw rows are
**Philadelphia 549 vs Lancaster 105 (5.2×)**, but grouped, **Philly metro ≈ 655 and Lancaster
County ≈ 203** (Lancaster 105 + Ephrata 21 + Millersville 15 + Elizabethtown 11 + Lititz 9 +
Mount Joy 9 + Columbia 8 + Quarryville 6 + Leola 6 + Willow Street 5 + Landisville 3 + Akron 3
+ Manheim 1 + Marietta 1) — **3.2×, not 5.2×.** I excluded Denver (10) and Lebanon (12) as
ambiguous. `download (22).csv` still compares the two ungrouped rows, so its
$0.159/user vs $1.038/user gap inherits the borough-vs-metro problem §1 describes. **What
survives grouping: Lancaster's engagement rate is 52.6% against Philadelphia's 33.1% — 19.5
points higher — and it produced 16 key events to Philadelphia's 8 off a fifth of the users.**

---

## B. Numbers I refused to compute, and why

- **Every `begin_checkout` step in all four funnel files.** All windows are `20260519-20260827`
  and therefore span 2026-08-21, mixing the pre-#204 CTA-click definition with the real
  checkout-start one. `download (17)`, `(19)`, `(20)`, `(23)` all have a `begin_checkout`
  step; none of them is a behaviour measurement. (§1)
- **The paid funnel's all-zero `purchase` row** (`download (19)`: 0 purchases for both webview
  and normal browser). That funnel has `add_payment_info` as step 5, an event that did not
  exist before 2026-08-21, which drives every later step to 0 on any historical window. Not a
  finding. (§1)
- **Any before/after read across 2026-08-25** on users, sessions or engagement — the
  internal-traffic filter creates a cliff there. Worth noting that sessions went **129 → 135 →
  141 → 172 across Aug 23–26**, i.e. *up* across the date Taylor's own visits stopped being
  counted, so the underlying growth is real; but I am not quoting a percentage on it.
- **`lead_form_started` cohort splits.** `download (9)` shows 101 in all-paid-social-mobile
  (43 webview / 58 direct browser) — the exact comparison §1 says not to rely on, because the
  two cohorts differ in the JS environment that determines whether the event fires. Counted
  `generate_lead` instead: **13 total, 7 webview / 6 direct.**
- **An 86%-style waitlist abandonment rate.** `lead_form_started` (101) does not pair with
  `generate_lead` (13) in this segment either. (§1)
- **GA4 revenue as business revenue.** $946.16 is own-site only; ~55% of real ticket revenue
  arrives via Eventbrite/Meetup imports that fire nothing client-side. Visible in the data:
  **Founders Mixer shows 8 purchases and $192.93 with 0 item views and 0 carts in front of
  them.** Eventbrite is $290.39 / 11 transactions (30.7% of GA4 revenue) from 77 users (2.7%).
- **Open question 2 (did the CTA move work?) — still unanswerable, second report running.**
  `select_promotion` is up — **61 events property-wide against 54 in the 08-26 export**, and
  29 events / 17 users in all-paid-social-mobile with 20 of the 29 in a webview — but
  **no file in this 38-file export breaks `select_promotion` down by
  `promotion_name`**, so the `lp_sticky_bar` share that `ANALYTICS_CONTEXT.md` §3 asks for
  cannot be measured. See §C1.

---

## C. NEEDS TAYLOR INPUT

1. **Add a `select_promotion` × `promotion_name` tab to the GA4 export.** (**2nd ask.**) This
   is the whole of open question 2 and it has now been unanswerable in two consecutive
   reports despite the data existing in GA4. A free-form with `promotion_name` as the row
   dimension and Event count / Total users as metrics would settle whether the sticky bar
   added by #243 is producing taps, in one tab.
   *Re-check in ~1 week:* the `lp_sticky_bar` share of `select_promotion`.
2. **Decide the scope of the `source:` parameter fix in §A1 — and whether the historical rows
   should be excluded from reporting.** (**1st ask, new.**) The code change itself is
   mechanical (§D1). The judgment calls are (a) whether to also stop trusting the affected
   historical rows, since ~$185 of attributed revenue and 9.3% of key events are on internal
   labels and will stay that way in every window reaching back before the fix, and (b)
   whether the 2026-05-19 window start should move to a post-fix date for channel reporting.
   *Re-check in ~1 week:* whether `lp`, `events` and `matches` still appear in Traffic
   acquisition after the fix ships.
3. **Marion Court: the trigger you set has fired — do you want the discussion reopened?**
   (**Not a re-ask of the settled venue question.**) §3b named cart→purchase as the only
   thing that reopens it; it went 0 → 1 (§A2) while Meta's pixel stayed at 0 on 32.3% of
   spend. Separately and more concretely: **Marion Court Female spent $4.32 for one click
   ($4.32 CPC) and Marion Court Retargeting is at $1.2243 CPC, 3.7× the account average.**
   Those two ad sets are a spend-efficiency question independent of the venue.
   *Re-check in ~1 week:* Marion Court item cart→purchase, and the two CPCs.
4. **The homepage headline.** (**3rd ask.**) `index.html` still reads "Your app matched you.
   We host the date." in the hero while `/lp` was changed to "You show up. We handle the
   rest." on 2026-08-22 because no ad mentions an app and four of nine sell against them. `/`
   is the **largest single lead-generating landing page — 15 of 58 lead sessions (25.9%)**, so
   this is the page where the mismatch costs most. Brand voice, so not decided here.
   *Re-check in ~1 week:* `generate_lead` and engagement rate on `/`.
5. **GA4 bot/datacenter filtering.** (**2nd ask.**) 210 users (7.3%) minimum sit in hyperscale
   datacenter towns and the absolute count has not moved in two days (§A8). Every per-user
   denominator stays inflated until this is on.
   *Re-check in ~1 week:* Prineville + Lulea + Council Bluffs + Ashburn + Boardman +
   Moses Lake as a share of active users.
6. **A region grouping for geography.** (**2nd ask.**) Raw rows give Philadelphia 5.2×
   Lancaster; grouped they give 3.2× (§A8). Until a grouping exists, every city comparison in
   these reports has to be hand-corrected and is quotable only as a range.

*Not re-asked, per §3b: the internal-traffic filter (active), `ads_conversion_About_Us_1`
(retired 2026-08-25 — and consistent with that, it sits at **99 key events, unchanged from
the 08-26 export**, with no new fires), Google Ads status (dark), the Marion Court venue/ad-set
configuration itself, and `next_event_fetch_failed` (fixed in #299).*

---

## D. Proposed zero-risk fixes — described, NOT applied

Each of these is a change a human should make and review. **None was made.**

1. **Rename the `source` event parameter on the 11 live `gtag` calls** listed in §A1 to
   something outside GA4's reserved campaign namespace — `page_source`, `sd_source`, or
   `fired_from`. Files/lines: `lp.html:572, 603, 625, 672, 682, 789`; `events.html:1811, 1824,
   1842`; `event.html:1056`; `matches.html:263`. Low risk (these parameters feed no
   registered custom dimension that I could find), but it is still a tracking change on the
   checkout pages, so it wants a human eye and a Realtime check after deploy.
   *Re-check in ~1 week:* new `lp / *`, `events / *` and `matches / *` rows should stop
   appearing in Traffic acquisition.
2. **Drop `+ window.location.search` from the nine `page_path` overrides** (`lp.html:38`,
   `event.html:38`, `events.html:41`, `index.html:35`, `signup.html:42`, `privacy.html:23`,
   `admin.html:36`, `careers.html:34` — matching what `getaways.html:34` and `profile.html:28`
   already do). GA4 keeps the query string from `page_location` regardless.
   *Re-check in ~1 week:* landing-page rows should stop showing a doubled query segment.
   Row count will stay high because of `fbclid`; that is expected (§A7).
3. **Record the service-fee identity in `ANALYTICS_CONTEXT.md`** (§A4) so the item-vs-total
   revenue gap stops being re-derived as a mystery: *item revenue + $2.50 × fee-bearing
   transactions = total revenue.*
4. **Refresh the `ANALYTICS_CONTEXT.md` §1 campaign table** — add `Marion Court | Traffic`
   (spending $30.73 in Aug 21–27) and correct `Campaign 1 Event 3 Good Good Campaign` from
   "last spend 2026-08-13" to live ($46.26 in Aug 21–27, the account's largest line). Third
   report flagging this.
5. **Soften §1's tail rule from "the last two days" to "at least the last two days, depth
   varies with export time-of-day"** (§A5), and note that the second-newest day may read
   normal, as it did tonight.

---

## E. Method and caveats

**E1. Freshness, checked from the files' own headers, not filenames or mtimes.** All 38
`download*.csv` carry `# 20260519-20260827`. The 08-26 report analysed `...0826` and the
08-27 run rejected an unchanged `...0826` as stale, so this export is genuinely one day
newer. Meta: `meta-insights-2026-08-27.csv` (`20260821-20260827`) is new since the 08-25 pull.
Both run logs — the `## NIGHTLY RUN LOG` in `sparkdate-nightly-claude-code-prompts.md` and
the separate one in `TONIGHT_PROMPT.md` — were read before choosing; the most recent GA4 run
was 2026-08-26 and last night (08-27) was Prompt M7, so this is not a repeat.

**E2. `ANALYTICS_CONTEXT.md` caveats that actually bit tonight**, and where: the
`begin_checkout` 2026-08-21 boundary (§B, four files refused); `add_payment_info` not existing
before 2026-08-21 (§B, the zeroed paid funnel); the two-day tail (§A5 — and it *contradicted*
the file, reported as such rather than resolved silently); the 2026-08-25 internal-traffic
cliff (§B, plus §A6's 20.7% `/admin`-`/matches` contamination, which is not retroactive);
`lead_form_started` not pairing with `generate_lead` (§B); GA4 revenue being own-site only
(§B, Founders Mixer); Meta rolling windows faking trends (§A3 — the check was run and
**passed**, which is why a spend comparison appears at all); the Lancaster-borough-vs-metro
denominator (§A8); the datacenter inflation of per-user denominators (§A8); and the
`Facebook`/`facebook` case fragmentation (1,156 + 389 + 88 `fb` + 22 `Facebook / paid` users
across four rows — summed before quoting anything).

**E3. What I could not check.** No browser and no GA4 UI access, so §A1 and §A7 are
source-plus-export inference, not runtime verification. Both are falsifiable in one minute
each in GA4 DebugView / Realtime and should be confirmed there before any code moves. Meta's
campaign-level purchase counts are ad-attributed and deliberately stricter than site
purchases, so §A2's "pixel says 0, GA4 says 1" is an expected kind of disagreement, not
evidence of a broken pixel.

**E4. Sample sizes.** Everything at or below `add_to_cart` is single-digit. Specifically:
Marion Court's purchase is **n=1**; the paid-social webview/direct `generate_lead` split is
**7 vs 6**; `add_payment_info` is 6 events property-wide; `checkout_error` is 25 events
(card_incomplete 15, `(not set)` 8, card_declined 1, other 1). Percentages on those are not
quoted without the count.

**E5. Consistency checks run.** Revenue Trend sums to exactly $946.16 over 25 days, matching
Key Events Breakdown and Revenue by Source — three files agree. Item revenue ($863.66) differs
by exactly $82.50, explained in §A4. `download (22)`'s two city rows sum to 654 against a
stated 647 total — **off by 7**, disclosed rather than smoothed. The 38 CSVs were checked for
a full duplicate of a prior export and are not one.

**E6. Not analysed tonight.** `download (16)` (cohort retention) — the most recent cohorts'
windows have not closed, and the 08-26 report was forced into a retraction on exactly that
(1.0% read early, true value 1.9%). Left rather than repeated. `data.pdf` was present and
refreshed but not parsed; the CSVs carried every question this prompt asks.

---

## F. One-week re-check list, in priority order

| # | Metric | Expectation if the change worked |
|---|---|---|
| 1 | `lp` / `events` / `matches` / `get_tickets_block` in Traffic acquisition | no NEW sessions after the §D1 fix ships |
| 2 | `select_promotion` by `promotion_name` | tab exists; `lp_sticky_bar` share measurable |
| 3 | Marion Court item: views → carts → purchases | cart→purchase holds above 0; view→cart back above 22% |
| 4 | Marion Court Female + Retargeting CPC | below $1.00, or the ad sets are off |
| 5 | Landing-page rows | no doubled query segment; row count still high (fbclid) |
| 6 | Blended Meta CPA | below $101.27 and trending toward the $29.99 ticket |
| 7 | Datacenter-town share of active users | falling, if bot filtering is switched on |
| 8 | `generate_lead` sessions landing on `/admin` / `/matches` / `/profile` | below 20.7% as the filtered period grows |
