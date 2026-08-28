# GA4 analysis — 2026-08-28

**`ANALYTICS_CONTEXT.md` read in full first. The copy I read says Last updated: 2026-08-26**, and it
is the authoritative copy on Taylor's machine — this run executed locally in the repo, not in the
Cowork sandbox, so the fork the file's SYNC WARNING describes does not apply to this report. Every
caveat in it is applied below, and §E lists them one by one.

**Export:** 38 GA4 CSVs, all carrying window `20260519-20260827`, read from each file's own `#`
header. All 38 md5s distinct. Pulled **2026-08-27 between 23:07 and 23:19** — that timestamp matters
and §A5 explains why. Plus 9 Meta files, the newest of which is `meta-insights-2026-08-25.csv`
(window Aug 19–25) and the newest daily `meta-insights-daily-2026-08-23.csv`. **Meta is two days
staler than GA4 in this export**, same as the 08-26 run.

**Day indexing.** 0-based, day `0000` = 2026-05-19, so **`0100` = 2026-08-27**. Cross-checked three
ways: the revenue and sessions series both end at 0100; the item-views series ends at 0100; and the
engaged-sessions series' final value at 0100 is the §A5 artifact.

---

## Headline: the waitlist question is answered, and the freshness rule needs splitting in two

Open question 1 — *is the waitlist rescuing or cannibalising?* — has been open across at least four
reports. A new **Waitlist: Rescue or Cannibalize?** exploration answers it: **43 of 58
lead-generating sessions never viewed an item.** The waitlist is catching people who were never
going to reach a ticket. It should stay.

Second: the finalisation rule added to `ANALYTICS_CONTEXT.md` after the 08-26 report is **directionally
right and mechanically wrong**. It treats "the last two days are unreliable" as one phenomenon. It is
two, with different causes and different fixes, and this export separates them cleanly because it was
pulled at 23:19 where the previous one was pulled at 13:12.

Nothing in this report retracts a finding from 2026-08-26. One claim I was about to make — that Meta
paid social had produced its first purchases — **was wrong and is not in this report**; §B explains
what I did instead.

---

## A. Findings

### A1. Open question 1, ANSWERED: the waitlist rescues, it does not cannibalise

`download (30).csv`, a new tab. Three segments over lead-generating sessions:

| Segment | Sessions |
|---|---:|
| `L — generated a lead` | **58** |
| `L only — lead, no item view` | **43** (74.1%) |
| `L+V — lead AND viewed item` | **15** (25.9%) |

**43 + 15 = 58 exactly.** The partition is clean — §2's "verify the segments sum to the total" rule
applied and passed, on the total.

`ANALYTICS_CONTEXT.md` §4 sets the decision rule in advance: *"If they never viewed an item, the form
is catching bounces and should stay prominent. If they did, it is taking sales."* Three quarters
never viewed an item.

**Stress-tested against the internal-traffic caveat.** The window opens 2026-05-19, and the internal
filter only became active 2026-08-25, so this window still contains Taylor's own sessions.
`download (29).csv` gives lead sessions by landing page: `/admin` 6, `/matches` 5, `/profile` 1 —
**12 of 58 (20.7%) are internal-suspect.** Those pages cannot fire `view_item` (§1: it fires only on
`/events` and `/event`), so all 12 must sit in the `L only` bucket. Worst case:

> **31 of 46 genuine lead sessions (67.4%) never viewed an item.**

The direction survives the harshest available correction. **Recommendation: keep the waitlist where
it is.** Note this conclusion runs *with* the grain of the 08-22 change that de-emphasised it (#248) —
de-emphasising is not removing, and nothing here argues for reversing #248.

**One defect in this tab: the `SEQ — view_item then generate_lead` column is broken.** It reports
**492 sessions** for a sequence that is by construction a subset of the 58 sessions that generated a
lead. It cannot exceed 58. Do not use that column; the segment definition needs rebuilding before it
means anything.

*Re-check in ~1 week:* the same three segments on a window starting 2026-08-25, which removes the
internal contamination entirely rather than bounding it.

### A2. The two-day freshness rule is two different mechanisms, and only one of them is a lag

The rule in `ANALYTICS_CONTEXT.md` §1 says the most recent day is missing engagement and undercounts
sessions ~30%, the second-most-recent reports engagement near zero, and only days three-plus back are
final. This export says that is one true statement and one artifact of *when the export was pulled*.

**Mechanism 1 — engagement lag. Real, and confined to one day here.**

| Day | Date | Sessions | Engaged | Rate |
|---|---|---:|---:|---:|
| 0097 | Aug 24 | 135 | 62 | 45.9% |
| 0098 | Aug 25 | 141 | 48 | 34.0% |
| 0099 | Aug 26 | 172 | 73 | 42.4% |
| **0100** | **Aug 27** | **142** | **2** | **1.4%** |

Day 0100 is the artifact, unmistakably. But **day 0099 reads 42.4% — an ordinary day.** The 08-26
report saw the artifact on *two* consecutive days; this export shows it on one. The rule's two-day
drop is therefore **safe but conservative**, not wrong.

**Mechanism 2 — the "~30% session undercount" is mostly a partial day, not processing.** The 08-26
report recorded Aug 26 as "a partial 54" sessions. This export reads Aug 26 as **172**. That is not a
30% undercount, it is a 69% one — because the 08-26 export was pulled at ~13:12, capturing roughly
55% of that day. This export was pulled at 23:19, capturing ~97% of Aug 27.

**Control, and it holds.** The 08-26 report recorded Aug 24 as 135 sessions / 62 engaged. This export
reads Aug 24 as **135 / 62 — identical.** Days three-plus back do not move.

**Proposed replacement wording for `ANALYTICS_CONTEXT.md` §1** (Taylor's file, not edited by this run):

> **The tail of every export is unreliable, for two separate reasons — check both.**
>
> *Engagement lags by one to two days.* The most recent day reports engagement near zero or not at
> all (2026-08-27 read 142 sessions / 2 engaged, 1.4%). The second-most-recent day is sometimes fine
> (2026-08-26 read 42.4% in the same export) and sometimes not (the 08-26 export had it at ~1%).
> Drop two days to be safe; if you need the second day, say that you used it.
>
> *The final day's session and user counts are incomplete in proportion to how much of that day had
> elapsed when the export was pulled.* This is not a GA4 lag and no waiting period fixes it —
> **record the export's pull time and compare it against the day boundary.** An export pulled at
> 13:00 captures roughly half the final day; one pulled at 23:15 captures nearly all of it. Reading
> the same day across two exports pulled at different clock times will show "growth" that is only
> elapsed time.
>
> Days three or more back are final: measured identically across the 08-26 and 08-27 exports.

### A3. `next_event_fetch_failed` — #299 worked, and this is the measurement

`next_event_fetch_failed` reads **62** (`download (33).csv`). The 08-26 report recorded it frozen at
**61**. Report #298 recorded it firing **29 times on 2026-08-24 alone**, all in the paid-social webview
segment and exactly zero in direct browsers.

**One event in the roughly two days since PR #299 shipped, against 29 in a single day before it.**
`ANALYTICS_CONTEXT.md` §3b already records the fix as landed; this is the first export that measures
the result, and it is consistent with the diagnosis (Meta's webview opens the page hidden and
throttled, so a flat 4s timeout expired before the visitor arrived).

**Caveat, stated plainly:** the historical count is not comparable to post-#299 counts, and n=1 is not
a trend. What makes it credible is the size of the drop against a known daily rate, not the count.

*Re-check in ~1 week:* `next_event_fetch_failed` should still be under ~5 total. Its new `reason` and
`page_started_hidden` parameters are **not in this export** — see §C4.

### A4. `checkout_error` — the 8 uncategorised events are historical, now proven

`download (14).csv`, against the 08-26 export:

| Category | 08-26 | 08-27 | Δ |
|---|---:|---:|---:|
| `(not set)` | 8 | **8** | **0** |
| `card_incomplete` | 10 | 15 | +5 |
| `card_declined` | 1 | 1 | 0 |
| `other` | 1 | 1 | 0 |
| **Total** | **20** | **25** | **+5** |

**Every one of the five new errors carried a category; `(not set)` did not move at all.** The two
call sites (`event.html:2200`, `events.html:2475`) both always pass `category`, and have since
PR #148 on 2026-08-05 — 78 of this window's 100 days predate that. The 8 are frozen history. **No
code change is needed**, and the 08-26 report's §D2 can be closed.

**What the same table does say:** `card_incomplete` is now **15 of 25 checkout errors (60%)** and
took all five new ones. That is the dominant live failure mode — people reaching the card form and
not completing it. n=15, small, but it is the only checkout-error category that is actually moving.

### A5. `fbclid` makes the landing-page report unreadable — now quantified precisely

`download (31).csv`: **1,533 distinct landing URLs for 1,690 paid sessions.**

| | |
|---|---|
| URLs with exactly 1 session | **1,435 of 1,533 (93.6%)** |
| Busiest single URL | 19 sessions (`/lp?eventId=8E9WZTat32JyoUjWuIE7`) |
| URLs per session | 0.91 |
| Collapsed to path | **`/lp` 89.2%, `/events` 10.8%** — two rows |

**The fragmenter is `fbclid`, and this is the number that was missing before:**

| Parameter | URLs carrying it | Sessions |
|---|---:|---:|
| `eventId` | 1,533 (100%) | 1,687 |
| **`fbclid`** | **1,521 (99.2%)** | **1,617 (95.9%)** |
| `event` | 144 | 183 |

`fbclid` is Meta's per-click identifier — unique per click by design, which is exactly why 93.6% of
URLs have one session. `eventId` is on every URL but takes few distinct values, so it is not the
fragmenter. Stripping `fbclid` alone would collapse 1,533 rows to roughly the number of
path × eventId combinations, a few dozen.

Unchanged in ratio from 08-26 (1,386 URLs / 1,530 sessions, 0.91) — this is a standing configuration
issue that accumulates, not a regression.

### A6. iOS webview visitors have no working way out; Android does

`download (7).csv`, 1,828 in-app-browser events:

| Event | iOS | Android | (not set) | Total |
|---|---:|---:|---:|---:|
| `in_app_browser_detected` | **1,121** | 482 | 38 | 1,641 |
| `in_app_browser_escape_attempt` | **0** | **160** | 0 | 160 |
| `in_app_browser_copy_link` | 7 | 3 | 0 | 10 |

**The zero is deliberate, and the code says so.** `event.html:1029` returns early unless the user
agent is Android, because the escape is an `intent://` URL that only Android honours, and the comment
is explicit that *"an iOS button that silently did nothing would be worse than the copy-link
instructions it sits next to."* That reasoning is sound.

**What the data adds is how the iOS alternative actually performs.** Android's escape fires for
**160 of 482 detections — 33.2%.** iOS's copy-link fires **7 times against 1,121 detections — 0.6%.**

**iOS is 68.3% of all webview detections.** So the platform carrying two thirds of the trapped
traffic has a fallback used by one visitor in 166, while the minority platform has a working exit
used by a third of them. Nothing here is broken; the asymmetry is just much larger than the code
comment anticipated. → §C1.

### A7. Meta paid social added 157 users and $0.00 over two days

`download (32).csv`, grand total 2,862 active users / 219 key events / $946.16. Meta's five case
variants summed per §3 before any share is quoted:

| Channel | Active users | Key events | Revenue | Revenue/user |
|---|---:|---:|---:|---:|
| Meta paid (5 case variants) | **1,968** (68.8%) | 23 | **$152.45** | **$0.0775** |
| `eventbrite / listing` | **77** (2.7%) | 20 | **$290.39** (30.7%) | **$3.771** |
| `(direct) / (none)` | 408 | 17 | $137.45 | $0.337 |
| Google Ads family (7 rows) | 124 | 94 | **$0.00** | $0.000 |

Against the 08-26 export: Meta paid went **1,811 → 1,968 users (+157) with revenue unchanged at
exactly $152.45.** Eventbrite went 69 → 77 users **and $262.90 → $290.39.**

**Eventbrite now returns 48.7× Meta paid's revenue per active user**, up from 45.3×. The multiple has
widened for the third consecutive report, and for the same arithmetic reason each time: Meta adds
users without revenue.

**Adjusted for datacenter traffic** (§A8), removing ~203 Meta-datacenter users from Meta's
denominator gives $0.0862/user and a **43.7×** multiple. The gap is not an artifact of bot inflation.

**Four temperings carried forward from the last three reports, all still applying:** n = 11 Eventbrite
transactions; §1 says GA4 misses ~55% of real ticket revenue and most of that *is* Eventbrite, so
Eventbrite is understated further still and **the admin dashboard remains the revenue truth**; the two
channels do different jobs (Eventbrite is a marketplace with its own demand, Meta is top-of-funnel);
and the direct/email rows carry internal-traffic contamination for most of this window.

**Case fragmentation, current:** `Facebook / paid_social` 1,156, `facebook / paid_social` 389,
`Instagram / paid_social` 313, `fb / paid_social` 88, `Facebook / paid` 22. Reading only the top row
gives 40.4% against a true 68.8%. The lowercase, `fb` and `Facebook / paid` rows still show **$0.00
across 100 days.**

### A8. Datacenter traffic: confirmed, marginally grown, same shape

`download (21).csv`, 747 city rows summing to 3,211 active users (row sums exceed the property total
of 2,862 because users de-duplicate across rows — expected).

| City | Users | Operator |
|---|---:|---|
| Prineville OR | 85 | Meta |
| Luleå SE | 52 | Meta |
| Forest City NC | 32 | Meta |
| Council Bluffs IA | 25 | Google |
| Ashburn VA | 21 | AWS |
| Boardman OR | 21 | AWS |
| Altoona | 16 | Meta IA **or** PA city, 100 mi from Lancaster |
| Gallatin TN | 11 | Meta |
| Moses Lake WA | 6 | Meta |
| New Albany OH | 1 | Meta |
| **Total** | **270 (8.4%)** | |

Meta-operated locations alone account for ~203. Against 08-26 (205 minimum of 2,670, 7.7%): the
identified count rose 205 → 270 (+31.7%) while total users rose +20.3%, so datacenter traffic grew
slightly faster than real traffic. `(not set)` city holds 319 users (11.6% → 9.9% of the row sum).
**587 of 747 rows (78.6%) hold two users or fewer.**

This **confirms** the 08-26 finding rather than extending it. The Altoona ambiguity is unresolved and
unresolvable from this tab.

### A9. `/getaways` collects 207 expressions of interest and cannot sell anything

`getaway_interest` fired **207 times** — more than `generate_lead` (85), and the third-largest custom
event on the property after `in_app_browser_detected` and `targeted_event_landing`.

I read `public/getaways.html` in full (687 lines). It contains **no purchase path of any kind**: no
`/event?id=` link, no call to `/api/purchase-ticket`, no Reserve control. The page writes
`getaway_interest` to Firestore, optionally captures an email, and displays vote counts.

This is precisely the prompt's target category — *"any page whose only conversion path is a signup
rather than a ticket."* Whether that is wrong depends entirely on whether getaway packages are
bookable yet, which is a product question, not a data one. → §C2.

### A10. The two revenue tabs still disagree, and the gap grew with the transaction count

| Source | Figure |
|---|---|
| `download (35).csv` Revenue by Source | **$946.16** across **35** transactions |
| `download (36).csv` / `(2).csv` Revenue by Item | **$863.66** |
| **Unexplained gap** | **$82.50** |

The 08-26 report recorded this gap as **$75.00 on 32 transactions**. Three more transactions, $7.50
more gap. Both tabs are internally consistent — I verified the by-source rows sum to $946.16 to the
cent and the by-item rows to $863.66 — so this is a real disagreement between two GA4 tabs in one
export, not a parsing error.

**A coincidence worth defusing before someone trips on it:** the 08-26 report's *total* GA4 revenue
was **$863.69**, and this export's *item* revenue is **$863.66** — three cents apart and completely
unrelated quantities. Do not read one as the other.

**Item economics, unchanged:** `Founders Mixer` shows **8 purchases and $192.93 against 0 items
viewed and 0 added to cart**, and `SparkDate: Round 2 — Summer Nights` 8 purchases from 21 views.
Together **$392.85 — identical to the 08-26 figure** — arrives with no funnel in front of it.

### A11. `add_payment_info` is instrumented correctly; the sample is 6

6 events, **all mobile**, total value **$169.94** — which is exactly the total revenue for
2026-08-22 through 08-27 from `download (37).csv` (27.49 + 32.49 + 27.49 + 54.98 + 27.49). Six events
for six purchases in the period since the event began existing.

I read the call site (`event.html:1952`). It fires **after** Stripe validates the card and **before**
the charge POST, which is the correct position to measure the card-entered-charge-not-completed
drop-off it was added for. The saved-card branch skips it by design.

So: working as intended, **zero measurable drop-off at that step, n=6.** Per §5 that count is far too
small to quote as a rate, and this report does not.

### A12. Lancaster converts roughly 10× better per user than Philadelphia

`download (22).csv`:

| City | Active users | Key events | Rate | Revenue | Revenue/user | Engagement |
|---|---:|---:|---:|---:|---:|---:|
| Philadelphia | 549 | 8 | 1.5% | $87.47 | $0.159 | 33.1% |
| Lancaster | 105 | 16 | **15.2%** | $108.96 | **$1.038** | **52.6%** |

**Same structural caveat as 08-26, and it is not resolved:** "Lancaster" is the borough row while
"Philadelphia" is the whole metro, so this compares a town against a metro. The direction is almost
certainly real — a 10× key-event rate does not come from row definitions alone — but the *magnitude*
cannot be quoted until a region grouping exists. → §C3.

**Segment sum check, per §2: it fails.** 549 + 105 = 654 against a grand total of 647 — **off by 7.**
Disclosed rather than reconciled; the 08-26 export was off by 5 on the same tab.

### A13. `/lp` webview vs direct browser — the contradiction from 08-26 persists

`download (10).csv`, all paid-social mobile on `/lp`:

| Segment | Sessions | Avg engagement time | Bounce | Engaged sessions | Key events |
|---|---:|---:|---:|---:|---:|
| C — all paid social, mobile | 1,826 | 4.12s | 71.4% | 523 | 11 |
| A — webview | 1,223 (67.0%) | **2.40s** | 67.4% | 399 (32.6%) | 6 |
| B — direct browser | 605 | **7.57s** | **79.5%** | 124 (20.5%) | 5 |

**Webview share reads 67.0%**, inside the 61–78% range §3 instructs quoting.

The contradiction: webviews show a *higher* engaged-session rate (32.6% vs 20.5%) and a *lower*
bounce rate, but one third the engagement time. §1 explains it — GA4 derives engagement from
`user_engagement`, which fires on visibility/focus changes that Meta's webview handles badly, so
**both** the time and the engaged-session flag are contaminated in the same direction. Per §1's
instruction I use discrete counts instead: **key events per session — webview 6/1,223 (0.49%),
direct browser 5/605 (0.83%).** Direct browser produces key events at 1.7× the rate. n = 6 and 5;
that is a direction, not a rate, and it is stated as such.

**Segment sum check: A + B = 1,828 against C's 1,826 — off by 2 (0.1%).** Engaged sessions and key
events both sum exactly. Disclosed.

### A14. Internal CTA identifiers are still landing in `utm_source`

`download (32).csv` carries these rows:

| Source / medium | Users | Key events | Revenue |
|---|---:|---:|---:|
| `lp / (not set)` | 15 | 1 | $0.00 |
| `get_tickets_block / (not set)` | 5 | 1 | **$27.49** |
| `matches / …` (4 rows) | 8 | 4 | **$27.49** |
| `sticky_ticket_bar / (not set)` | 1 | 0 | $0.00 |
| `lp / paid_social`, `lp / (none)` | 3 | 0 | $0.00 |
| **Total** | **32** | **6** | **$54.98** |

This is the same class of bug PR #237 fixed for `/matches` — an internal CTA identifier written into
`utm_source`, which GA4 reads as a new campaign session and which **overwrites the real acquisition
channel**. `ANALYTICS_CONTEXT.md` §3 records the `matches` rows as historical residue of that bug.
`get_tickets_block` and `sticky_ticket_bar` are *not* covered by that note, and `get_tickets_block`
carries **a real $27.49 sale whose true channel is now unrecoverable.**

I could not locate the producer. A search across the **whole repository, build output included**,
finds exactly two `buildUtmUrl()` callers (`api/cron-send-emails.js`, `api/lead-signup.js`), both
passing string literals for source and medium, and **no template-interpolated `utm_source=` anywhere**
— the single regex hit is a lint *message* in `scripts/lint-content-queue.js:112`. Reported as an
open thread, not a diagnosis. → §D2.

**Related and also unexplained:** `[object Object] / undefined` — **10 users.** The literal string
`undefined` for a medium is a JavaScript interpolation signature, but the same search found no
producer in this codebase, so it may well be external. 10 users, $0.00, no key events.

### A15. `select_promotion` is rising; open question 2 is still unanswerable

`select_promotion` reads **61** events, against 54 on 08-26 and 35 two days before that. From
`download (11).csv` its `In_App_Browser` split is (not set) 21, `true` 20, `false` 20.

But `promotion_name` **does not exist as a dimension anywhere in this 38-file export.** I searched
every file: `sticky_ticket_bar` appears only as a bogus session *source* (§A14), never as a promotion
name. So `ANALYTICS_CONTEXT.md` §4's open question 2 — *did the CTA move work?* — **cannot be answered
for the third consecutive export**, and the metric the context file itself nominates is still not
exportable. → §C5.

---

## B. What this report does NOT claim

**A finding I built and then discarded.** Meta paid social shows 5 transactions and $152.45 in
`download (35).csv` (`Facebook / paid_social` 3 / $97.47, `Instagram / paid_social` 2 / $54.98). Set
against `reports/META_CAPI_PROMPT.md`, which documents **zero** `facebook / paid_social` purchases for
2026-06-01 to 08-04, that reads like Meta paid social converting for the first time.

**It is not new.** The 08-26 report records Meta paid revenue as **$152.45** — the identical figure.
The correct reading is §A7's: 157 more users and no more money. I am recording the near-miss because
it is the same failure mode the 08-26 report spent its headline retracting — reading a figure as
movement without checking it against the previous export — and because the check took one grep.

**Nothing from the 2026-08-26 report is retracted.** Its five retractions stand, its bot-traffic
finding is confirmed (§A8), and its §D2 and §D1 items are now closed by measurement (§A4, §A3).

---

## C. NEEDS TAYLOR INPUT

Items settled in `ANALYTICS_CONTEXT.md` §3b — the internal-traffic filter, `ads_conversion_About_Us_1`,
Google Ads status, and the Marion Court venue/ad-set decision — are **not re-asked here.**

1. **iOS webview escape — new ask.** 1,121 iOS webview detections, and the only iOS affordance
   (copy-link) fires 7 times: **0.6%.** Android's `intent://` escape fires 33.2%. iOS is 68% of
   trapped traffic. The current code is deliberate and its reasoning is good, so this is a product
   call, not a bug fix: is it worth trying an iOS path (an `x-safari-https://` attempt, or clearer
   copy telling people to tap the ⋯ menu), or is the in-app experience now good enough post-#243
   that escaping no longer matters? *Re-check:* `in_app_browser_copy_link` on iOS, currently 7.

2. **`/getaways` has no ticket path — new ask.** 207 `getaway_interest` events, 2.4× `generate_lead`,
   and nothing on the page can be bought. If getaway packages are not bookable this is correct and
   should be left alone. If they are, this is the clearest "leaving sales on the table" page on the
   site. *Re-check:* `getaway_interest`, currently 207.

3. **Region grouping — second ask** (§A12). Lancaster's 15.2% key-event rate against Philadelphia's
   1.5% is worth acting on, but "Lancaster" is a borough and "Philadelphia" is a metro, so the
   magnitude is unquotable. A GA4 audience or region-level breakdown settles in one query what three
   reports have now half-answered. *Re-check:* revenue per active user for a grouped Lancaster County
   vs Philadelphia metro, currently $1.038 vs $0.159 on mismatched denominators.

4. **Register `reason` and `page_started_hidden` as GA4 custom dimensions — new ask.** PR #299 added
   both to `next_event_fetch_failed` specifically so the next report could tell a timeout from a 500
   from a prerendered-hidden page. **Neither appears in this export.** Unregistered event parameters
   are collected but not reportable, so the diagnostic that justified #299 is currently unreadable.
   Two entries under Admin → Custom definitions. *Re-check:* a `reason` breakdown of
   `next_event_fetch_failed` exists at all.

5. **Add `promotion_name` to the exploration set — second ask** (§A15). `select_promotion` is up
   35 → 54 → 61 and nobody can say whether the sticky bar produced any of it. `ANALYTICS_CONTEXT.md`
   §3 nominates `promotion_name: lp_sticky_bar` as the metric for open question 2 and it is still not
   exportable. One free-form tab. *Re-check:* open question 2 becomes answerable.

6. **GA4 bot/datacenter filtering — correcting the ask itself.** The 08-26 report called this "a GA4
   Admin setting, not code." **I do not believe that setting exists.** GA4 excludes known bots
   automatically with no user-facing control, and Data filters support only Developer and Internal
   (IP-based) traffic. So the realistic options are: (a) an IP-range internal-traffic-style filter,
   which requires datacenter IP ranges you would have to source and maintain; (b) handle it at
   analysis time with a city-exclusion segment, which costs nothing and is honest; or (c) accept the
   ~8–12% denominator inflation and state it, which is what §A7 does. **Recommend (b) plus (c).**
   Please confirm before anyone spends time hunting for a toggle.

7. **Should the homepage follow `/lp`'s headline rewrite? — third ask.** `public/index.html` still
   says "Your app matched you" in the H1 (line 1109), meta description (8), `og:description` (12),
   JSON-LD (42) and footer (1281); `about.html` and `signup.html` carry it too. `/lp` moved to "You
   show up. We handle the rest." on 2026-08-22 because **no ad mentions an app and four of nine sell
   against them** (#245). `download (29).csv` shows **`/` is the single largest landing page for
   lead-generating sessions — 15 of 58**, ahead of `/lp`'s 12. Brand voice, so it stays here rather
   than being changed unilaterally. *Re-check:* `generate_lead` sessions landing on `/`, currently 15.

---

## D. Zero-risk fixes

### D1. APPLIED — static social/SEO tags on `/event`, the page every email links to

`public/event.html` had **zero** static `og:` or `twitter:` tags and no `<meta name="description">`.
Everything was injected by `setMeta()` once the event loaded (line ~1439). That is correct for a
browser and **invisible to link scrapers**, which do not execute JavaScript. Facebook, Instagram,
iMessage, WhatsApp, LinkedIn and Twitter all fetch raw HTML.

Two things point at that page constantly: the **entire email nurture sequence** links to
`/event?id=…` (`api/cron-send-emails.js`, six separate call sites), and the page has its **own share
button** (`event.html:~1540`) that hands people a URL to post. Every one of those shares has been
rendering as a bare card — generic title, no description, no image.

Added a static fallback block mirroring the one `events.html` already has, using the same
`og-image.jpg`. **The existing JS still wins for real visitors:** `setMeta()` upserts by selector, so
it finds these tags and overwrites them with event-specific copy.

**Verified, not assumed:**
- `curl` against the served page confirms all 13 tags are now in the raw HTML; before, a scraper saw
  only `<title>Event Tickets - SparkDate</title>`.
- Ran the page's real `setMeta()` logic against the real served HTML in a browser: tag counts stay at
  **1** for `description`, `og:title` and `og:image` — it overwrites in place, no duplicates — and the
  content becomes the per-event value.
- 332 tests pass.

*Re-check in ~1 week:* paste an `/event?id=…` URL into Facebook's Sharing Debugger; it should show
title, description and image with no JS execution.

### D2. Find the producer of `get_tickets_block` / `sticky_ticket_bar` as `utm_source` (§A14)

32 users and one **real $27.49 sale** whose acquisition channel is unrecoverable. Not applied because
the producer is not in this repository — a whole-repo search including build output found only the two
known `buildUtmUrl()` callers, both passing literals, and no interpolated `utm_source=` at all. It is
most likely a hand-built ad URL or an email link authored outside the codebase. Worth 20 minutes with
`npm run ads:check` before assuming it is code. *Re-check:* `get_tickets_block` rows in Campaign Performance, currently 5
users.

### D3. Strip `fbclid` in the GA4 data stream settings (§A5)

Repeated from 08-26, now with the exact parameter named: `fbclid` on 99.2% of landing URLs and 95.9%
of paid sessions. GA4 configuration, not code, so not applied here. *Re-check:* distinct landing-page
rows for paid traffic, currently 1,533; should drop to a few dozen.

### D4. Rebuild the Meta ad URLs with consistent lowercase `utm_source` (§A7)

Repeated, still not done. Reading the top Meta row alone understates Meta by 41%, and
`utm_content=proof_rsa1` on all 14 ads makes per-ad attribution impossible. Meta Ads Manager, not
code. *Re-check:* `facebook`/`fb`/`Facebook` variant rows collapsing to one.

### D5. Rebuild the broken `SEQ` segment in the Waitlist exploration (§A1)

It reports 492 sessions for a sequence that cannot exceed 58. GA4 configuration. The exploration's
other three segments are sound and carry §A1's conclusion without it. *Re-check:* SEQ ≤ 58.

### D6. Reconcile the $82.50 revenue gap between the two revenue tabs (§A10)

Grew from $75.00 as the transaction count grew 32 → 35. Both tabs are internally consistent, so one
of them is systematically wrong and every revenue figure in every report inherits whichever is used.
*Re-check:* the two totals agree, or the mechanism is documented in `ANALYTICS_CONTEXT.md`.

---

## E. Method, parsing assumptions and caveats

**Freshness.** All 38 GA4 CSVs carry `20260519-20260827`, read from each file's own `#` header — not
filenames, not timestamps. All 38 md5s distinct. File-number → report-type mapping was rebuilt from
each file's own title line, as every prior run has had to do.

**Export pull time recorded, and used.** File mtimes cluster 2026-08-27 23:07–23:19. §A2 depends on
this: the previous export was pulled ~13:12, and comparing the two exports' final days without
accounting for that produces phantom growth.

**Title diff against prior coverage.** Each file's title was checked against the 08-26 report. New
this export: **Waitlist: Rescue or Cannibalize?** (2 tabs — §A1 is built on it), **In_App_Browser ×
Event name — Aug 9+** (3 tabs), **Monthly Trends** (4 tabs), **Conversion Tracking**.

**Stale tab name, trust the header.** `download (33).csv` is titled *"Events Counts Last 28 days"* but
its window header reads `20260519-20260827` — 100 days. Every figure taken from it is treated as
100-day. The tab name is wrong, not the data.

**Row-sum reconciliation.** By-source revenue sums to $946.16 exactly across 13 rows; by-item revenue
to $863.66 across 6; the revenue trend to $946.16 across 25 days. Paid landing-page sessions sum to
1,687 against a stated 1,690 (off by 3). City rows sum to 3,211 against a property total of 2,862 —
expected, users de-duplicate across rows — and all city shares use the row sum as denominator, stated
inline.

**`ANALYTICS_CONTEXT.md` caveats applied, explicitly:**

- §1 last-two-days rule → applied, **and interrogated** (§A2). Day 0100 dropped from every reading.
- §1 `begin_checkout` changed meaning 2026-08-21 → **`download (15).csv`'s and `download (17)`/`(20)`/
  `(23)`/`(28)`'s funnel steps refused outright.** Every window here spans 08-21. `download (15)`
  reports a 5-step funnel ending in 4 purchases against a real 35; it is not used for any conversion
  claim, including its device split.
- §1 `add_payment_info` post-dates 2026-08-21 → §A11 treats its 6 events as post-launch only and
  quotes no historical rate.
- §1 GA4 revenue is own-site only → every revenue figure labelled GA4-recorded; admin dashboard named
  as truth (§A7, §A10).
- §1 transaction counts changed meaning 2026-08-20 → no week-over-week transaction comparison is made.
- §1 engagement unreliable in webviews → §A13 declines to read bounce rate or engagement time as
  behaviour and uses key-event counts instead.
- §1 internal traffic unfiltered before 2026-08-25 → §A1 bounds the waitlist finding against it
  explicitly rather than ignoring it; §A7 flags direct/email contamination.
- §1 Meta rolling windows fake trends → **no Meta spend trend is reported at all**, because the newest
  Meta file is two days stale (see below).
- §1 Meta case fragmentation → all five variants summed before any share was quoted (§A7).
- §1 `view_item` does not fire on `/lp` → §A1's "never viewed an item" is read as *never clicked
  through*, not as page failure.
- §1 two `in_app_browser_*` events are ghosts → `checkout_blocked` (12) and `checkout_override` (2)
  present in `download (7).csv` and **excluded** from §A6.
- §1 `lead_form_started` does not pair with `generate_lead` → no abandonment rate quoted anywhere;
  §A1 counts `generate_lead` only.
- §2 verify segments sum to the total → **applied three times, and it caught two failures**: Philly +
  Lancaster off by 7 (§A12), `/lp` A + B off by 2 (§A13). The waitlist partition summed exactly
  (§A1).
- §3b settled questions → four asks deliberately not re-raised (§C preamble).
- §4 open question 1 → **answered** (§A1). Question 2 → still blocked, and why (§A15).
- §5 small samples → every count below the top of the funnel stated alongside its percentage.

**Where tonight's numbers contradict `ANALYTICS_CONTEXT.md`:** §1's two-day finalisation rule is
conservative rather than wrong, and its "~30% session undercount" conflates a processing lag with a
partial-day artifact (§A2). Proposed replacement wording is in §A2. **That file has not been edited —
it is Taylor's, gitignored, and this run does not edit it.**

**What was NOT done.** No Windsor MCP pull. **No Meta analysis of any kind beyond channel
economics**: the newest campaign-level file is `meta-insights-2026-08-25.csv` (Aug 19–25) and the
newest daily is `meta-insights-daily-2026-08-23.csv`, both two-plus days behind the GA4 window, and
§1's rolling-window rule makes a stale-window spend comparison exactly the error that produced three
wrong conclusions in consecutive reports. **Marion Court's 6-carts-to-0-purchases, which §3b names as
the one open thread on that campaign, cannot be advanced without current daily Meta data.** Source
CSVs were read in place and not moved, renamed or modified.

**One thing this export structurally cannot measure.** PR #304 tagged `in_app_browser` at config level
on the 13 remaining GA4 pages, but it merged at 2026-08-28 04:00 UTC — **after this export was pulled
at 2026-08-28 03:19 UTC.** The 88.6% `(not set)` rate in `download (11).csv` covers 100 days of which
95 predate even #265. Neither figure measures #304. The next export is the first one that can.
