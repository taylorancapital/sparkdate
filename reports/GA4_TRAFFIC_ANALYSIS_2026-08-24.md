# GA4 traffic analysis — 2026-08-24

**Zero code changes.** One file added: this report. Nothing in `public/`, `api/`, `lib/`,
`scripts/`, `vercel.json`, `package.json` or the Firestore rules was touched, and no CSV
in the Night Tasks folder was moved, renamed or modified.

**Why this report exists.** Tonight's first run (`claude/perf-analysis-2026-08-24`) skipped
GA4 on the freshness rule — all 38 `download*.csv` carry window `20260519-20260823`, the
same window the 2026-08-23 report analysed, so the rule said "stale, rotate to
maintenance." That was procedurally correct and practically wrong. Re-checking the 08-23
report against the export shows it **analysed maybe a third of these files**. The traffic
side — source/medium, landing pages, revenue by source, device funnel, item performance —
was **never analysed by any prior report**. Confirmed by string-searching
`reports/GA4_ANALYSIS_2026-08-23.md` (393 lines): it contains **zero** occurrences of
`eventbrite / listing`, `262.9`, `[object Object]`, `fb / paid_social`, `Nextdoor`,
`Retention`, `Cohort`, `abandonment`, or `Views-Cart`.

So "the window didn't move" was true and "there's nothing new to learn here" did not
follow. This report covers what was left.

---

## The headline

**Paid Meta is half the traffic and 3% of the money. Eventbrite is 3% of the traffic and
33% of the money.**

| Source group | Sessions | % of sessions | Transactions | Revenue | Revenue/session |
|---|---|---|---|---|---|
| **Meta paid** (all 5 case variants) | 1,814 | 48.9% | 4 | $119.96 | **$0.066** |
| **Eventbrite listing** | 107 | 2.9% | 10 | $262.90 | **$2.457** |
| Email (all 5 mediums) | 195 | 5.3% | 4 | $97.96 | $0.502 |
| Direct | 644 | 17.4% | 4 | $109.96 | $0.171 |
| Google Ads (all variants) | 134 | 3.6% | 1 | $27.49 | $0.205 |
| Internal-name "phantom" sources | 277 | 7.5% | 2 | $54.98 | $0.198 |

**Eventbrite returns 37× more revenue per session than paid Meta**, on 1/17th the traffic.
It is the single largest revenue source in the property: **$262.90 of $803.71 (32.7%) from
10 of 30 transactions.**

Four things must be said before anyone acts on that:

1. **n=10 transactions.** Per `ANALYTICS_CONTEXT.md` §5, everything at or below
   `add_to_cart` is single-digit-to-low-double-digit and must not be converted to a rate
   without the count. The count is shown everywhere above. The 37× ratio is directionally
   solid because the gap is two orders of magnitude, not because the sample is good.
2. **This understates Eventbrite further.** §1 says roughly 55% of real ticket revenue
   comes through Eventbrite and Meetup and fires no analytics on our side. The $262.90 is
   only the traffic that *came back to our site* with an Eventbrite referrer and then
   bought here. The true contribution is larger. **The admin dashboard remains the revenue
   truth; nothing here is a total-revenue figure.**
3. **It is not a like-for-like channel comparison.** Eventbrite traffic is late-funnel —
   people already browsing an events marketplace. Meta paid is cold prospecting. A 37×
   efficiency gap does not mean "move the budget," it means the two are doing different
   jobs and only one is being measured on revenue.

   **From Taylor (2026-08-24), which explains the mechanism:** the Eventbrite listings
   carry hand-added UTM links inviting people to learn more about SparkDate, and people
   click them. That accounts for the channel existing at all. `listing` is not a medium
   GA4 ever assigns by itself, and no `utm_medium=listing` appears anywhere in this
   repository — so the tags were placed on Eventbrite, outside the codebase, exactly as
   described.

   It also sharpens what the 37× means. These are not strangers: Eventbrite showed them
   a dated event first, and the click is a warm second step. The behaviour matches —
   `download (26).csv` attributes 34 `view_item`, 24 `checkout_form_started` and **10
   `purchase`** to `eventbrite / listing`, a 29% view-to-purchase rate that no cold
   channel produces. Eventbrite did the acquiring; our site took the payment.

   **One part of the account is not visible in this export and should not be assumed.**
   Whether those visitors land on an About-style page before the event page cannot be
   checked here: `download (26).csv` is the only source-attributed event file and it
   carries commerce events only — no `page_view`, no About Us. Confirming the landing
   path needs a Landing page × Session source/medium export, which is worth pulling,
   because the answer changes whether the winning link is a "learn about us" link or an
   event link.
4. **Direct and email are contaminated by internal traffic.** See the internal-traffic
   section below.

---

## Finding 1 — case fragmentation is splitting Meta across five rows

`ANALYTICS_CONTEXT.md` §3 warns that some ads spell `facebook` lowercase and others
`Facebook`, and says to sum them before reporting. Here is the actual damage:

| Row | Sessions | Users | Key events | Transactions | Revenue |
|---|---|---|---|---|---|
| `Facebook / paid_social` | 1,017 | 936 | 10 | 2 | $64.98 |
| `facebook / paid_social` | 436 | 390 | 5 | 0 | $0.00 |
| `fb / paid_social` | 88 | 88 | 0 | 0 | $0.00 |
| `Facebook / paid` | 26 | 22 | 0 | 0 | $0.00 |
| `Instagram / paid_social` | 244 | 198 | 4 | 2 | $54.98 |
| `lp / paid_social` | 3 | 2 | 0 | 0 | $0.00 |
| **Meta paid, summed** | **1,814** | **1,636** | **19** | **4** | **$119.96** |

Anyone reading the top row alone sees 1,017 sessions and concludes Meta is 27% of traffic.
It is **48.9%**. The understatement is **44%** — nearly half of Meta's volume is invisible
unless you know to add five rows together.

It is worse than a reporting nuisance. **`facebook / paid_social` (lowercase) has 436
sessions, 5 key events and $0.00 across the entire 97-day window.** So does `fb /
paid_social` at 88. Whether that is genuinely worse-performing inventory or just a
different spelling of the same ads is **not answerable from this export** — and per §3,
`utm_content=proof_rsa1` is identical on all 14 servable ads, so per-ad attribution is
impossible anyway. That is the real cost of the case bug: 524 sessions that cannot be
assigned to anything.

**Re-check in ~1 week:** whether `fb /` and lowercase `facebook /` rows still appear at
all. They should disappear as ads are rebuilt with consistent casing.

---

## Finding 2 — 47% of all "key events" are an About Us page view worth $0

The property records **206 key events**. They break down (`download (16).csv`) as:

| Key event | Count | Revenue |
|---|---|---|
| `ads_conversion_About_Us_1` | **97** | $0.00 |
| `generate_lead` | 79 | $0.00 |
| `purchase` | 30 | $803.71 |
| **total** | **206** | **$803.71** |

**`ads_conversion_About_Us_1` is 47.1% of every key event in this property and has
produced zero revenue in 97 days.** It is a Google Ads conversion action firing on an
About Us page view. All 97 sit on Google Ads rows: `googleads / paid` 56 users → 51 key
events, `googleads / (not set)` → 16, `googleads / offline` → 14, `googleads / cpc` → 11.

Consequence: **every "key events" number anywhere in this property is inflated by roughly
2×**, and the inflation is concentrated entirely in one channel. Google Ads looks like the
best-converting source on the site (134 sessions → 97 key events = 72%) and has produced
**one transaction and $27.49.**

This corroborates the 08-23 report's observation that Google Ads looks stopped —
`ads_conversion_About_Us_1` is frozen at 97 across two consecutive exports.

**Re-check in ~1 week:** whether the count is still exactly 97. If it is, Google Ads is
off and the conversion action should be retired or demoted from "key event."

---

## Finding 3 — a real bug: `[object Object] / undefined` is a traffic source

**36 sessions, 10 users, 257 events, mobile only, $0 revenue.**

That is a JavaScript object being stringified into a UTM parameter. It has never been
mentioned in any prior report. 257 events across 36 sessions is ~7 events/session — real
engaged traffic, not bots — whose acquisition channel is permanently destroyed.

Related, and previously documented: the internal-name sources are still here and still
growing. `lp / (not set)` 162 sessions, `get_tickets_block / (not set)` 51,
`matches / (not set)` 26, `matches / web` 26, `lp / (none)` 3, `sticky_ticket_bar /
(not set)` 1, `get_tickets_block / ` (trailing blank medium) 4 — **277 sessions across 8
rows, 7.5% of all traffic, carrying $54.98 of purchase credit.** The 08-23 report
established these are `promotion_name` values from `index.html`, have never existed as a
`utm_source` anywhere in git history, and therefore cannot be fixed from the codebase.

Also present: **`test / test`, 4 sessions, 1 user, 31 events** — a test that made it into
production data.

**Re-check in ~1 week:** whether `[object Object] / undefined` acquires new sessions. If
it does, it is live and reproducing.

---

## Finding 4 — two-thirds of Meta's mobile traffic is in a webview, and it converts ~10× worse

| Cohort | Sessions | Key events | Rate |
|---|---|---|---|
| In-app browser | 1,148 | 9 | **0.78%** |
| Everything else | 2,563 | 197 | **7.69%** |

A **9.8× gap.** Within Meta specifically, `Facebook / paid_social` mobile is 965 sessions
of which **646 (66.9%) are in-app**, and `Instagram / paid_social` mobile is 225 of which
141 (62.7%).

Two caveats, both required:

- §1 warns that engagement *time* is unreliable in webviews because `user_engagement`
  depends on visibility/focus events the Meta browser handles badly. That caveat is about
  engagement time. **Key events are discrete counts, which §1 explicitly says to prefer** —
  so this comparison is the sanctioned one. But differential event loss cannot be ruled out
  entirely, so read 9.8× as "large," not as exactly 9.8.
- 9 key events is a small numerator. The count is stated; the rate is not quoted without it.

This is the same conclusion the /lp CTA work (#243) was built on, now visible from the
traffic side rather than the scroll side.

---

## Finding 5 — GA4 landing-page reporting is unusable, and here is the number

`download (8).csv` has **1,184 distinct landing-page URLs for 1,314 paid sessions** —
**0.9 URLs per session.** Effectively every paid visitor gets their own landing page row,
because `fbclid` and `eventId` are in the URL. The single busiest landing URL in 97 days
has **15 sessions**.

Collapsed to the path, the picture is simple and useful:

| Landing path | Paid sessions | Share |
|---|---|---|
| `/lp` | 1,154 | **87.8%** |
| `/events` | 160 | 12.2% |

This is consistent with §1's note that `fbclid` duplication runs at 1,141/1,142 (99.9%).
The fix is a GA4-side one (strip query parameters in the data stream settings), not a code
change.

---

## Finding 6 — the device funnel, with the trap it contains

`download (14).csv`:

| Step | Users | Completion | mobile | desktop |
|---|---|---|---|---|
| 1. Session start | 2,412 | 10.4% | 1,924 | 475 |
| 2. View product | 250 | 16.8% | 205 | 45 |
| 3. Add to cart | 42 | 19.0% | 34 | 8 |
| 4. Begin checkout | 8 | 25.0% | 4 | 4 |
| 5. Purchase | 2 | — | 1 | 1 |

**Do not read step 4 or 5.** This funnel's window is `20260519-20260823`, which spans
**2026-08-21** — the date `begin_checkout` changed meaning (PRs #204, #229). Before that
it fired on homepage/landing CTA *clicks*; after, at actual checkout start. §1 is explicit
that any range crossing that date mixes two incompatible definitions. The `8` at step 4 is
two different events added together, and the `2` at step 5 is a sequence-completion count,
**not** the property's 30 purchases.

Steps 1→3 predate the boundary in definition and are readable: **2,412 users → 250 view
product (10.4%) → 42 add to cart.** The 90% drop before anyone views a product is the
n=1,436 figure §5 lists as having adequate volume, and it is still the dominant problem.

The desktop-vs-mobile split at step 3 (desktop 4 of 8 continue, mobile 4 of 34) looks
dramatic and **should not be quoted** — n=8 and n=34.

---

## Finding 7 — item performance, and Marion Court from the GA4 side

`download (34).csv`:

| Item | Viewed | Added to cart | Purchased | Revenue |
|---|---|---|---|---|
| Tellus AfterDark: Singles Edition | 276 | 31 | 9 | $212.91 |
| SparkDate: Round 2 — Summer Nights | 21 | 7 | **8** | $199.92 |
| Founders Mixer | 0 | 0 | 8 | $192.93 |
| Good Good Night @ Good Good Things | 105 | 20 | 3 | $89.97 |
| Sparkdate: The Loxley's Social | 20 | 7 | 2 | $37.98 |
| **SparkDate: Real People, Real Drinks, Real Court** (Marion Court) | **21** | **2** | **0** | **$0.00** |

Two things stand out.

**Marion Court: 21 views, 2 carts, 0 purchases** — against **$75.53** of Meta spend Aug
17–23 (see `PERFORMANCE_ANALYSIS_2026-08-24.md` Part 2). It was 20/1/0 in the 08-23
export; one extra view and one extra cart in a day. This is now the **third consecutive
report** showing Marion Court with zero sales, and the GA4 and Meta sides agree.

**Round 2 — Summer Nights converts 8 purchases from 21 views** while Tellus AfterDark
needs 276 views for 9. That is a 13× difference in view-to-purchase rate, on n=8 and n=9 —
too small to act on, but it is the kind of gap worth a deliberate look rather than an
accident. Caveat: item-view attribution depends on `view_item`, which §1 says **does not
fire on `/lp`** — so an item sold mostly through `/lp` → checkout without an `/events`
step will show few views and normal purchases. That may be the whole explanation.

**Founders Mixer remains 0 viewed / 0 carted / 8 purchased / $192.93** — unchanged across
roughly a dozen reports and still unexplained.

---

## Finding 8 — internal traffic is visibly distorting two channels

§1 says no IP exclusion or internal-traffic filter is configured and "your own visits are
in every number." Two rows show it plainly:

- **`email / email` desktop: 97 sessions from 1 user**, 899 events. One person, 97
  sessions. That is not a newsletter audience.
- **`lp / (not set)` desktop: 150 sessions from 9 users**, 1,111 events — ~123 events per
  user.
- `resend.com / referral`: 57 sessions from 2 users. `eventsmanager.facebook.com /
  referral`: 20 sessions from 1 user. `matches / (not set)`: 26 sessions from 1 user, and
  it carries **$27.49 of purchase credit**.
- `pinterest / paid_social` desktop: 12 sessions from 1 user.

The email group's $0.502/session in the headline table is therefore **not trustworthy** —
a large share of its 195 sessions is one internal user. The Eventbrite figure is the
cleanest in the table: **107 sessions from 64 users**, a normal ratio, with only 2 in-app
sessions.

**This is the single highest-leverage fix available and it is not a code change** — it is
a GA4 Admin setting (define internal traffic by IP, then activate the filter). §1 already
recommends it. It is now the second consecutive report recommending it.

---

## Data quality note — a reconciliation gap worth knowing

`download (24).csv` states a Grand total of **3,566 sessions / 2,418 users / 206 key
events**. Summing its 96 data rows gives **3,711 sessions / 2,595 users / 206 key events**
— a **145-session (4.1%)** discrepancy on sessions and 177 on users. Key events reconcile
exactly.

Users are expected not to sum (one person across two sources counts once in the total).
Sessions summing high by 4% is GA4 row-level cardinality handling, not an error in the
parse. **Every group figure in this report is a row sum**, so groups are internally
consistent with each other; where a property-wide total is quoted, the file's own Grand
total is used. A 4% discrepancy does not move any conclusion here — the smallest ratio
argued is 7.7×.

---

## NEEDS TAYLOR INPUT

1. **Is Eventbrite being treated as a channel or as a checkout?** It is 33% of recorded
   revenue from 3% of sessions and gets no deliberate investment. If listings are currently
   a byproduct of ticketing, that is a strategy question worth asking on purpose.
2. **Retire or demote `ads_conversion_About_Us_1`.** It is 47% of all key events, $0
   revenue, and it makes every key-event number in the property roughly 2× too high. That
   is a Google Ads / GA4 configuration decision, not a code change.
3. **Is Google Ads still running at all?** 134 sessions, 1 transaction, $27.49, and the
   conversion count frozen at 97 across two exports. Second report asking.
4. **Turn on the internal-traffic filter.** GA4 Admin setting. Second report asking. One
   user with 97 sessions is currently inside the email channel's conversion rate.
5. **Marion Court — kill or rebuild.** $75.53, seven days, 21 item views, 2 carts, zero
   purchases. Third consecutive report asking.
6. **The `[object Object] / undefined` source is a live bug** and needs someone to find
   where a JS object reaches a UTM parameter. I did not investigate the source, and per the
   standing rule I would not have changed it if I had.

---

## Proposed zero-risk fixes — NOT APPLIED

All GA4/Ads configuration; none is a code change.

1. **Strip query parameters in the GA4 data stream** so landing pages collapse from 1,184
   rows to a handful. Highest-value reporting fix here.
2. **Define and activate internal traffic exclusion** (Admin → Data Streams → Configure tag
   settings). Use "Exclude permanently" per §2, and verify segments sum before quoting any
   rate afterwards.
3. **Demote `ads_conversion_About_Us_1` from key event.**
4. **Rebuild Meta ad URLs with consistent lowercase `utm_source=facebook`** and real
   per-ad `utm_content` — §3 notes all 14 servable ads currently share
   `utm_content=proof_rsa1`. This is an ad-platform change, not a repo change, though
   `npm run ads:check` reports the live state.

**Re-check for all of the above in ~1 week:** source/medium row count (should fall as case
variants merge), landing-page row count (should collapse), key-event total (should drop by
~97 if the About Us action is demoted), and whether `/admin`-landing sessions disappear
from `generate_lead`.

---

## Method and caveats

- **Zero code changes**; verified as a single-file staged diff before commit.
- **Same export as the 08-23 report** — window `20260519-20260823` on all 38 files, read
  from each file's own `#` header, never filenames. Nothing here is a day-over-day trend;
  it is analysis of data that was already present and had not been looked at.
- **38 files, 3 md5 duplicate pairs** (`(15)`≡`(18)`, `(23)`≡`(31)`, `(3)`≡`(4)`). Each
  pair was read once. File-number → report-type mapping was rebuilt from each file's own
  title line, as prior runs found the numbering changes between exports.
- **Files this report draws on:** (5) Direct vs Paid, (7) Campaign Performance, (8) landing
  page × query string, (14) device abandonment, (16) key events breakdown, (19)/(20)
  waitlist, (24) in-app by source and device, (33)/(34) item performance, (37) revenue by
  source.
- **Caveats from `ANALYTICS_CONTEXT.md` applied:** `begin_checkout` 08-21 definition change
  (Finding 6, funnel steps 4–5 explicitly not interpreted); GA4 revenue is own-site only
  (headline, stated twice); `view_item` does not fire on `/lp` (Finding 7); case
  fragmentation (Finding 1); internal traffic unfiltered (Finding 8); §5 sample sizes
  (counts shown beside every rate); webview engagement-time unreliability (Finding 4, with
  the reason key events are used instead).
- **`add_payment_info` and the waitlist question were not revisited** — the 08-23 report
  answered the waitlist question from files (19)/(20) and this export is identical, so
  repeating it would add nothing.
- **No browser or network egress**, so nothing was verified against the live site.
