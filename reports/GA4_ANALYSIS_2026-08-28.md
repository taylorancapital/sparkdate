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

## §0. Decision sheet

Everything in this report that wants a human, on one screen. Section references are plain text rather
than links on purpose — this report has been revised three times and heading anchors break silently.
Search for `§A1`, `§C3` and so on.

### ⚠️ Do this first

**Check `MC All Genders - Video Ad` in Ads Manager for a pending draft and discard it if one exists.**
During the read-only console audit the editor flipped to "Unpublished edits" with an active Publish
button while the auditor was *reading* the destination URL. It reports publishing nothing but could
not verify the account is clean. §F.

### Needs your call — 4 open, 1 resolved, 3 done since

*(C3, C4 and C5 were closed by the 2026-08-28 configuration session — §G. Left in the table with
their outcome rather than deleted, so the ask history stays legible.)*

| # | Ask | Age | The number behind it |
|---|---|---|---|
| C1 | Try an iOS webview escape, or accept the webview? | new | iOS fallback converts **0.6%** (7 of 1,121). Android's escape: **33.2%**. iOS is 68% of trapped traffic |
| C2 | Is `/getaways` meant to sell tickets? | new | **207** interest events — 2.4× `generate_lead` — and no purchase path on the page |
| C3 | Build a region grouping | **DONE §G4** | Lancaster County converts at **6.6×** Philadelphia's key-event rate, **5.0×** revenue/user. Smaller than the 10× quoted on mismatched rows, as predicted |
| C4 | Register `reason` + `page_started_hidden` | **DONE §G5** | Both created. Autocomplete already offered them — **#299 is live and firing**, confirmed from the opposite direction |
| C5 | Add `promotion_name` to the exploration set | **DONE §G1** | Open question 2 answered: sticky bar is **3 of 61** clicks (4.9%). But `view_promotion` never fires, so there is no denominator — §G2 |
| C6 | GA4 bot/datacenter filtering | **RESOLVED** | **No such control exists.** Confirmed on screen. Use a city segment and state the ~8–12% inflation |
| C7 | Cross-tab `select_promotion` × `generate_lead` | new | **The one that closes open question 1.** One tab, no registration needed |
| C8 | Should the homepage follow `/lp`'s headline? | 3rd | `/` is the **largest** lead landing page, 15 of 58, and still says "Your app matched you" |

### Fixes

| Fix | State |
|---|---|
| D1 — static social tags on `/event` | **APPLIED in this PR.** Verified by curl and in-browser |
| §F5 — `lp.html` stops forwarding `fbclid` and a duplicate event id | **DONE — PR #309**, open separately |
| D3 — strip `fbclid` in the GA4 data stream | **DONE 2026-08-28 §G7.** One key, `fbclid`, verified persisted. `eventId` untouched, Email still ON. Not retroactive |
| D4 — rebuild the Meta ad URLs | Not done. Ads Manager. Now a sharper ask than "fix the casing": `utm_source` is hardcoded `Instagram` on every Marion Court ad regardless of placement, and `utm_content=proof_rsa1` is on all four read |
| §F2 — Marion Court Traffic ads have **no pixel dataset selected** | Not done. Check before scoping the CAPI work in `META_CAPI_PROMPT.md` |
| §G6 — fire `view_promotion` alongside `select_promotion` | Not done. **Code**, 4 call sites. Without it the sticky bar's 3 clicks have no denominator |
| §G7 gotcha | The redaction field is a **chip input** — press Enter to commit the key before Save, or it errors as empty |
| D5 — rebuild the `SEQ` segment | **WITHDRAWN §G3.** The segment was not broken; my reading was. It is user-scoped, and GA4 has no session-scoped sequences at all, so the fix I prescribed does not exist. `L+V` already carries the answer |
| D6 — reconcile the **$82.50** revenue gap | Not done. Two GA4 tabs, one export, both internally consistent |
| D2 — find what writes `get_tickets_block` into `utm_source` | Not done. **Producer is not in this repo** — whole-repo search incl. build output. One real $27.49 sale has an unrecoverable channel |

### The three things worth reading if you read nothing else

1. **Open question 1 is half-answered, not answered** (§A1). 43 of 58 lead sessions never viewed an
   item, which points away from cannibalisation — but the pre-registered rule cannot separate a
   rescued bounce from a form filled *instead of* tapping Get Tickets. Leave the waitlist alone;
   settle it with C7.
2. **The freshness rule is two rules** (§A2), and only one is a lag. The other is an artifact of what
   time the export was pulled, which no waiting period fixes. Replacement wording is in §A2.
3. **Eventbrite returns 48.7× Meta paid's revenue per user** (§A7), widened for the third report
   running, and still 43.7× after adjusting for datacenter traffic. Meta added 157 users and **$0.00**
   in two days.

---

## Headline: the waitlist question is half-answered, and the freshness rule needs splitting in two

Open question 1 — *is the waitlist rescuing or cannibalising?* — has been open across at least four
reports. A new **Waitlist: Rescue or Cannibalize?** exploration moves it a long way: **43 of 58
lead-generating sessions never viewed an item**, and the decision rule `ANALYTICS_CONTEXT.md` §4
pre-registered says that means rescue.

**It is half-answered rather than answered, and §A1 explains why.** "Lead, no item view" describes a
rescued bounce *and* a visitor who filled the form instead of tapping Get Tickets equally well —
the rule cannot tell them apart, and I did not notice that when I first wrote this section. The
finding is strong enough to say **leave the waitlist alone**, and not strong enough to say it is
purely rescuing. §C7 is the one-tab addition that would settle it.

Second: the finalisation rule added to `ANALYTICS_CONTEXT.md` after the 08-26 report is **directionally
right and mechanically wrong**. It treats "the last two days are unreliable" as one phenomenon. It is
two, with different causes and different fixes, and this export separates them cleanly because it was
pulled at 23:19 where the previous one was pulled at 13:12.

Nothing in this report retracts a finding from 2026-08-26. One claim I was about to make — that Meta
paid social had produced its first purchases — **was wrong and is not in this report**; §B explains
what I did instead.

---

## A. Findings

### A1. Open question 1, HALF-ANSWERED: no evidence of cannibalisation, but the rule cannot rule it out

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
**12 of 58 (20.7%) are internal-suspect.** Assigning all 12 to the `L only` bucket is the assumption
least favourable to this finding, so it bounds it:

> **Worst case, 31 of 46 genuine lead sessions (67.4%) never viewed an item.**

This is a **bound, not a measurement.** `download (29).csv` reports the *landing* page — the session's
first page — and a session that lands on `/admin` can navigate onward to `/events` and fire
`view_item` perfectly well. So the 12 are not *provably* all in the no-view bucket; the point is only
that putting them all there still leaves two thirds.

### The limitation this finding has, stated plainly

`ANALYTICS_CONTEXT.md` §4 pre-registers the decision rule, which is the right way to run this — but
**the rule cannot separate the two cases it claims to.** "Generated a lead without viewing an item"
is equally consistent with:

- *rescue* — the visitor was going to leave, and the form caught them; and
- *cannibalisation* — the visitor saw the waitlist form and filled it **instead of** tapping Get
  Tickets, never reaching an item **because the form got there first.**

Both produce a lead session with no `view_item`. The 43 therefore cannot be read as 43 rescues.

**What would separate them:** `select_promotion` — the `/lp` CTA tap — co-occurring with
`generate_lead` in the same session. A visitor who tapped Get Tickets *and* filled the form is a
different animal from one who filled the form having never tapped. **No file in this 38-CSV export
cross-tabs the two at session level** (`select_promotion` appears in `download (9)`, `(11)`, `(13)`
and `(33)`, in none of them against `generate_lead`), so this could not be resolved tonight. → §C7.

**What the finding does support:** the waitlist is not obviously taking sales, and there is no
evidence here for making it *less* prominent than #248 already did. **Recommendation: leave it as it
is and resolve the ambiguity with §C7 before touching it in either direction** — which is a weaker
recommendation than "keep it prominent," deliberately.

**On the `SEQ — view_item then generate_lead` column reporting 492: I called this broken. It is
not — my reading of it was.** See §G3. It is a **USER** segment matching 9 users, and the Sessions
column then counts every session those 9 people ever had, including sessions containing neither
event. 492 is internally consistent; "it cannot exceed 58" assumed a session scope the segment never
had. Still do not read it as a sequence count, but the segment definition was not the fault.

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
| **`fbclid`** | **1,521 (99.2%)** | **1,617 (95.9% of the 1,687 that rows sum to; 95.7% of the 1,690 stated grand total)** |
| `event` | 144 | 183 |

`fbclid` is Meta's per-click identifier — unique per click by design, which is exactly why 93.6% of
URLs have one session. `eventId` is on every URL but takes few distinct values, so it is not the
fragmenter. Stripping `fbclid` alone would collapse 1,533 rows to roughly the number of
path × eventId combinations, a few dozen.

Unchanged in ratio from 08-26 (1,386 URLs / 1,530 sessions, 0.91) — this is a standing configuration
issue that accumulates, not a regression.

**Half of this is our code, not GA4 configuration — found after the console audit flagged duplicate
parameters.** Re-parsed for repeated keys: **1,527 of 1,533 rows (99.6%) carry a duplicated
parameter** — `fbclid` twice on 1,521 rows, `eventId` twice on 145, plus `checkout`, `ai` and `ct`.

The producer is `public/lp.html:533` and `:834`:

```js
var carry = (function () {
  var qs = location.search;
  var s = (qs && qs.indexOf('utm_') !== -1) ? '&' + qs.replace(/^\?/, '') : '';   // the WHOLE query string
  ...
})();
...
btn.href = '/events?event=' + encodeURIComponent(ev.id) + '&checkout=1' + carry;
```

`carry` appends the **entire** inbound query string whenever it contains `utm_` anywhere — so
`fbclid` rides along, and the event id arrives a second time as `eventId=` on a URL that already
names it `event=`. The intent (documented in the comment above it) was to stop `ref` and `utm_*`
being dropped on the hop to `/events`, which is right; carrying *everything* is the overreach.

The triple-`eventId` rows the audit saw (`/events?event=X&eventId=X&eventId=X`) imply a second hop I
could not isolate — `events.html:2044` reads the query string and never appends, so it is not the
one. **One producer proven, at least one more suspected.**

**This changes the fix.** §D3's "strip `fbclid` in GA4" is still worth doing, but it cleans up
reporting *after* the fact. Not re-appending the query string is the upstream half, and it is a code
change in a checkout path — which puts it outside this run's zero-risk bar. → §F5.

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

**Superseded in part — see §F2.** "Case fragmentation" is the wrong name for what is happening. The
console audit read four ads directly and found **two different capitalised values, not a casing
mix**: `Facebook` on the Good Good ad and **`Instagram` hardcoded on all three Marion Court ads,
regardless of which placements those ad sets actually run.** The sum above is unaffected — every
variant is included — but **the Facebook-versus-Instagram split within it is fiction** and no
per-platform reading of Meta traffic should be attempted until the ad URLs are rebuilt.

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

**Superseded by §G2 — and my framing of the caveat was itself wrong.** I repeated
`ANALYTICS_CONTEXT.md` §1's claim that "Philadelphia is the whole metro row." It is not: GA4's
`City = Philadelphia` is the **city proper**, with King of Prussia, West Chester, Norristown and
~25 more sitting as their own rows. **Both** sides were undercounted, not just Lancaster — Lancaster
just loses proportionally far more, because the borough is exactly half its county. The region
grouping has now been built; §G2 has the corrected figures, and the direction survives at a smaller
magnitude, as predicted.

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

`promotion_name` did not exist as a dimension anywhere in this 38-file export — `sticky_ticket_bar`
appears only as a bogus session *source* (§A14), never as a promotion name. **That has since been
fixed and open question 2 is now ANSWERED: see §G1.** The short version is that the sticky bar
carries 3 of 61 promotion clicks, 4.9%.

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
   call, not a bug fix.

   **Correction, added after the console audit:** an earlier draft of this ask suggested trying
   `x-safari-https://` as an iOS escape. That suggestion is dead on arrival and this codebase already
   says so — `lp.html:552–556`: *"iOS deliberately has no equivalent — Apple gives a webview no
   supported way to pass a URL to Safari, and the old `x-safari-https://` trick no longer works in
   current FB/IG webviews."* I proposed something the code had already ruled out. **There is no
   technical iOS escape to build.** The real question is narrower and entirely about copy: the iOS
   fallback is the copy-link instruction, it converts at 0.6%, and the only lever is making that
   instruction clearer or accepting that two thirds of webview traffic stays in the webview.
   *Re-check:* `in_app_browser_copy_link` on iOS, currently 7.

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

6. **GA4 bot/datacenter filtering — RESOLVED by the console audit; no such setting exists.** The
   08-26 report called this "a GA4 Admin setting, not code." It is not one. Confirmed on screen: the
   data-filter type radio group offers exactly **Developer traffic, Internal traffic, Web hostname
   traffic** — no bot or datacenter option — and Google's documentation states known bots and spiders
   are excluded automatically via the IAB list with no way to disable it or see how much was
   excluded.

   **A correction to my own framing while I am here:** I wrote that data filters "support only
   Developer and Internal traffic." There are **three** types, not two — Web hostname is the third.
   The conclusion held; the supporting detail was wrong.

   So the realistic options are: (a) an IP-range internal-traffic-style filter, which needs
   datacenter ranges someone would have to source and maintain; (b) a city-exclusion segment at
   analysis time, which costs nothing; or (c) accept the ~8–12% denominator inflation and state it,
   which is what §A7 does. **Recommend (b) plus (c).** Nobody should spend more time hunting for a
   toggle.

7. **Cross-tab `select_promotion` against `generate_lead` at session level — new ask, and it is the
   one that actually closes open question 1.** §A1 answers the question as posed, but the question as
   posed cannot distinguish a rescued bounce from a visitor who filled the form *instead of* tapping
   Get Tickets. Both show as "lead, no item view."

   A session-scoped breakdown of the 58 lead-generating sessions by whether they also fired
   `select_promotion` separates them: **tapped the ticket CTA and still filled the form** is
   cannibalisation-shaped; **never tapped it** is rescue-shaped. `select_promotion` is already
   collected (61 events) and needs no registration — it is in `download (9)`, `(11)`, `(13)` and
   `(33)`, but against browser, `In_App_Browser` and date, never against `generate_lead`.

   One tab on the existing Waitlist exploration. *Re-check:* the share of the 58 that fired
   `select_promotion`, currently unknown.

8. **Should the homepage follow `/lp`'s headline rewrite? — third ask.** `public/index.html` still
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
of paid sessions. **APPLIED 2026-08-28 — see §G7 for the verification and the chip-input gotcha.**

*Re-check in ~1 week:* distinct landing-page rows for paid traffic, currently 1,533. **An earlier
draft of this line said they "should drop to a few dozen." That was wrong** — redaction is
collection-time only, so the 1,533 existing rows are permanent and no number in a trailing 100-day
window will fall. What should happen is that the count **stops climbing**, and a window starting
2026-08-29 shows the two rows §A5 says it should. Measure it on a forward window, not on this one.

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
- §4 open question 1 → **half-answered, and the shortfall named** (§A1): the pre-registered rule
  cannot separate a rescued bounce from a form filled instead of the CTA. Question 2 → still
  blocked, and why (§A15).
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

---

## F. Console audit, 2026-08-28 — what was confirmed on screen

Run separately in Claude-in-Chrome, read-only, against GA4 Admin, Meta Ads Manager, Google Ads and
Eventbrite. Recorded here because it answers five of §C's asks with on-screen evidence rather than
inference, and because it **corrects two things this report got wrong** — §C1 and §C6, both amended
in place above.

**Two view-only side effects the auditor named, neither a config change:** opening a GA4 exploration
stamps its *Last modified* date, so several now carry 2026-08-28 timestamps with no content change;
and the Ads Manager list was re-sorted and set to Last 7 days. GA4 change history shows no entries
after Aug 25.

**⚠️ One thing needing Taylor's eyes, not mine.** While the auditor was *reading* the destination URL
on **MC All Genders - Video Ad**, the editor flipped to "Unpublished edits" with an active Publish
button. The auditor reports typing nothing and publishing nothing — only Home/End/arrow keys inside a
URL field, then Escape — and says Review-and-publish stayed greyed out elsewhere throughout. It could
not verify the account is clean. **Check that ad for a pending draft and discard it if one exists.**
Nothing here should reach live ads without a human deciding it does.

### F1. Asks answered

| § | Ask | Result |
|---|---|---|
| C4 | Register `reason` / `page_started_hidden` | **NOT DONE** — confirmed |
| C5 | `promotion_name` in the exploration set | **NOT DONE** — all 19 saved explorations checked individually; none loads it into Variables, and Variables is the shared dimension pool, so no tab can use it |
| C3 | Region grouping | **NOT DONE** — 2 audiences (both GA4 defaults), 9 comparisons (all built-ins), zero geographic. `Region` sits in the Philly-vs-Lancaster Variables panel and is used in neither tab |
| C6 | Bot filtering | **No such control exists** — see the amended §C6 |
| — | Internal traffic filter | **DONE, both halves** — filter Active (not Testing), rule `internal_traffic` with the IPv4 exact match and the IPv6 /64. Matches `ANALYTICS_CONTEXT.md` §1 exactly |
| — | Query-parameter stripping | **NOT DONE** — Redact data: Email ON, **URL query parameters OFF**; "No modifications yet" under Modify events |

### F2. Meta ad URLs — the finding that supersedes "case fragmentation"

Four of six ads read directly. Verbatim destination URL on the Marion Court ads:

    https://sparkdate.date/lp?eventId=WUaooYvOq0eC0D1QVCvQ&utm_source=Instagram&utm_medium=paid_social&utm_campaign=Augweek3_lancaster&utm_content=proof_rsa1

| Ad | Campaign | `utm_source` | `utm_content` |
|---|---|---|---|
| Good Good Retargeting | Event 4 Good Good | `Facebook` | `proof_rsa1` |
| MC Retargeting - Image Ad | Marion Court Retargeting | `Instagram` | `proof_rsa1` |
| MC Women - Video Ad | Marion Court \| Traffic | `Instagram` | `proof_rsa1` |
| MC All Genders - Video Ad | Marion Court \| Traffic | `Instagram` | not read |
| GG Women - Traffic | Event 3 Good Good | **can't tell** | — |
| Campaign 1 Event 3 Good Good Ad | Event 3 Good Good | **can't tell** | — |

Three consequences:

1. **Every Marion Court ad is hardcoded `utm_source=Instagram`** regardless of placement. Any
   Facebook-versus-Instagram split for Marion Court in GA4 is fiction. §A7's *sum* is unaffected.
2. **`utm_content=proof_rsa1` is identical on all four**, confirming `ANALYTICS_CONTEXT.md` §3 —
   women's creative, all-genders creative and retargeting are indistinguishable in GA4.
3. **Capitalised `Facebook`/`Instagram` may not match GA4's default channel grouping**, which keys on
   lowercase, pushing this traffic toward Referral/Unassigned. Marked *likely* by the auditor, not
   confirmed. `download (30).csv` gives it weak circumstantial support: in that tab's
   lead-generating-session column, **`Unassigned` is the largest single channel group at 16 sessions,
   ahead of Paid Social's 12** — which is odd for a property that is two-thirds Meta paid.

   **An earlier revision of this section cited 189 and 77 here. Both came from that tab's `SEQ`
   column — the one §A1 declares impossible and unusable — and citing it after discarding it was
   wrong.** The corrected figures above come from the `L — generated a lead` column. The direction
   survives; the magnitude does not, and 16 against 12 is thin. Worth one query before it is
   believed.

**The two unreadable ads are unreadable for a structural reason:** both sit in "Campaign 1 Event 3
Good Good Campaign", built with Meta's guided setup, which does not expose a destination-URL field in
the normal ad editor.

**Separately, and not previously known:** the two Marion Court **Traffic** ads have **Website events
unchecked — no pixel dataset selected** — while the retargeting ads carry Sparkdate's pixel. That is
a plausible contributor to the zero-conversion picture in `reports/META_CAPI_PROMPT.md` and is worth
checking before that document's CAPI work is scoped.

### F3. Marion Court — the §3b thread can now be advanced

`ANALYTICS_CONTEXT.md` §3b keeps exactly one thread open on Marion Court: cart-to-purchase. §E of
this report said that could not be advanced without current Meta data. The audit supplies it.

| Campaign | Status | Budget | Last 7d | Reach | Frequency | Purchases |
|---|---|---|---:|---:|---:|---:|
| Marion Court \| Traffic | Active | $6.00/day | $23.91 | 1,862 | 1.97 | — |
| Marion Court Retargeting | Active | $3.00/day | **$29.32** | **113** | **12.52** | **0** |

**The retargeting campaign is the larger line item — $29.32 of $53.23 — and it is showing the same
113 people the ad about twice a day, to zero purchases.** Frequency 12.52 against a reach of 113 is
the number here, and it is not a small-sample artifact: it is arithmetic on 1,415 impressions.

This is a *delivery* observation, not a re-opening of the venue decision §3b marks as settled. But it
bears directly on the 6-carts-to-0-purchases thread: the audience being retargeted is 113 people who
have already seen the ad a dozen times each.

Also worth noting: Marion Court | Traffic's 30-day spend equals its 7-day spend ($23.91 at audit
time; $30.73 read later at Last-30-days). Every dollar it has spent is recent — exactly the
rolling-window trap `ANALYTICS_CONTEXT.md` §1 warns about, so **no trend should be read from it.**

### F4. Google Ads and Eventbrite

**Google Ads — confirmed dark, on screen.** Banner: *"None of your ads are running."* Last 30 days
$0.00 / 0 impressions / 0 clicks. Three campaigns: one PMax Removed, one Search Paused (*"All ads
disapproved, Conversion tracking setup is incomplete"*), one Search Removed. All-time $37.91 / 509
impressions / 114 clicks / 1 conversion / $27.49. Matches `ANALYTICS_CONTEXT.md` exactly, and the 114
all-time clicks are almost certainly the 114 GA4 users. **No money is going out.**

**Eventbrite — being run deliberately.** Three events, all published and On Sale:

| Event | Date | Sold | Gross |
|---|---|---:|---:|
| Good Good Night @ Good Good Things | Aug 31 | 6 / 30 | $139.95 |
| Real People, Real Drinks, Real Court | Sep 8 | 6 / 30 | $101.94 |
| The Loxley's Social | Sep 22 | 2 / 30 | $49.98 |
| | | **14** | **$291.87** |

Not idle. This supports §A7's reading: Eventbrite is a checkout, not a discovery channel, which is
why it converts 48.7× better per GA4 user.

**A coincidence to defuse before it becomes a finding.** Eventbrite gross reads **$291.87** and GA4's
`eventbrite / listing` row reads **$290.39** — $1.48 apart, and **they are not the same quantity.**
GA4's row is people who clicked an Eventbrite listing and then bought **on our own site**;
Eventbrite's gross is tickets sold **on Eventbrite**, which per `ANALYTICS_CONTEXT.md` §1 fires no
analytics of ours at all. Two unrelated numbers that happen to be close. Do not reconcile them.

### F5. What this adds to the fix list

- **`lp.html`'s `carry` should stop forwarding the whole query string** (§A5). Filter it to `utm_*`
  and `ref` — which is what its own comment says it was for — instead of everything including
  `fbclid` and a duplicate event id. Not applied here: it is a code change in the path to checkout,
  above this run's zero-risk bar, and it wants its own PR and its own review.
- **Rebuilding the Meta ad URLs** (§D4) is now a sharper ask than "fix the casing": set `utm_source`
  per placement rather than hardcoding `Instagram`, and give each ad a distinct `utm_content`. The
  two Good Good ads in the guided-setup campaign may need rebuilding outside guided setup to expose
  the field at all.
- **Check the Marion Court Traffic ads' missing pixel dataset** (§F2) before scoping the CAPI work in
  `reports/META_CAPI_PROMPT.md`.

---

## G. GA4 configuration session, 2026-08-28 — results, and three more corrections to me

Run in Claude-in-Chrome after the audit, this time **writing**. §C4 and §C5 are now done, §C3 is
built, and three further claims in this report turn out to be wrong. Each is corrected in place above
and explained here.

### G1. Open question 2, ANSWERED: the sticky bar carries 4.9% of promotion clicks

`promotion_name` is now in the exploration set. §C5 closed.

| Promotion name | Items clicked in promotion | Share |
|---|---:|---:|
| `lp_get_tickets` | 37 | 60.7% |
| `get_tickets_block` | 18 | 29.5% |
| **`lp_sticky_bar`** | **3** | **4.9%** |
| `sticky_ticket_bar` | 2 | 3.3% |
| `careers_events_callout` | 1 | 1.6% |
| **Total** | **61** | |

Total 61 matches `download (33).csv` exactly, which is a good cross-check that the right metric is
being read.

**`ANALYTICS_CONTEXT.md` §4's open question 2 — *did the CTA move work?* — is answerable now.** The
sticky bar added on 2026-08-22 (#243) produces **3 of 61 promotion clicks**. Taking the two
sticky-bar-shaped values together (`lp_sticky_bar` + `sticky_ticket_bar`) gives 5 of 61, 8.2%. The
main in-page CTA still does the overwhelming majority of the work.

**n = 3.** Per §5 this is far too small to call the sticky bar a success or a failure, and this report
does neither. What it does close is the *measurability* question: the number exists now and can be
watched.

**A UI disagreement worth recording,** since `ANALYTICS_CONTEXT.md` §2 collects these: **GA4 will not
allow `Event count` against `Item promotion name`.** Event count, Transactions, Key events, Total
revenue and Purchase revenue are all greyed out as incompatible with that item-scoped dimension. Use
`Items clicked in promotion`, which is the `select_promotion` metric.

### G2. `view_promotion` has never fired, so promotion CTR is not computable

`Items viewed in promotion` reads **0 on every row.** I checked the source: **`view_promotion`
appears nowhere in `public/`.** We fire the click half of the promotion pair and never the impression
half.

So there is no denominator. "3 sticky-bar clicks" cannot become "3 clicks from N impressions", which
is the number that would actually say whether the bar works — a bar shown 40 times and clicked 3 is a
success; shown 1,800 times and clicked 3 is not. **§G1's answer is a numerator without a
denominator,** and that is a code gap, not a configuration one. → §G6.

### G3. The `SEQ` segment was not broken. My reading of it was.

This report called that column "broken" and said 492 "cannot exceed 58." Read in the segment editor,
the definition is:

- **Segment type: USER**, not session.
- Sequence: `view_item` → indirectly followed by → `generate_lead`. Scoping: across all sessions.
- **Users in segment: 9.** Total sessions: 492.

The sequence logic is fine. **492 is the number of sessions belonging to the 9 users who ever
performed that sequence** — including their sessions containing neither event. My "cannot exceed 58"
assumed a session scope the segment never had.

**And the fix I prescribed does not exist.** §D5 said to rebuild it "as a session-scoped SEQUENCE
segment." GA4 offers sequences **only** in User segments; the Session segment builder has no "Add
sequence to include" at all. Rebuilding it with scoping changed to *within the same session* returned
**the identical 492 and the identical 9 users** — every one of those 9 did the sequence inside a
single session already.

**The correct session-scoped answer was already in the table**: `L+V — lead AND viewed item`. It
lacks only ordering, and a lead form submitted *before* viewing an item is not a plausible path on
this site.

**9 users owning 492 sessions is ~55 sessions each, and that is its own red flag** — plausibly
internal traffic from before the 2026-08-25 filter, or automation. Not chased here.

**Two side effects to know about.** An exploration caps at **10 segments** and this one was full, so
the operator deleted the old `SEQ` segment to free a slot before building the replacement. `L`,
`L only` and `L+V` were untouched.

**And the partition has moved since the export.** The live UI now reads **L = 59, L only = 43,
L+V = 16** against this report's 58 / 43 / 15. Still an exact partition (43 + 16 = 59). §A1's figures
are correct *for the 2026-08-27 export* and are not restated; the drift is one additional lead
session and one additional L+V in the days since.

### G4. Region grouping built — and "Philadelphia is the metro" was wrong

§C3 is built. Two new tabs on *Philly vs Lancaster*; no Audience created.

**The correction first.** `ANALYTICS_CONTEXT.md` §1 says "Philadelphia is the whole metro row" and
this report repeated it. **It is the city proper.** King of Prussia (28), West Chester (52),
Coatesville (11), Exton (7), Norristown (7), Drexel Hill (6) and ~20 more sit as their own rows. So
**both** sides of the regex were undercounted — Lancaster simply loses proportionally far more,
because the borough is half its county.

| Grouping | Active users | Key events | Rate | Revenue | Revenue/user |
|---|---:|---:|---:|---:|---:|
| Philadelphia (city proper) | 557 | 9 | 1.6% | $87.47 | $0.157 |
| Lancaster borough only *(the old row)* | 104 | 16 | 15.4% | $108.96 | $1.048 |
| **Lancaster County (16 towns)** | **208** | **22** | **10.6%** | **$163.94** | **$0.788** |

**§A12's direction survives and its magnitude drops, exactly as §A12 predicted it would.** Properly
grouped, Lancaster County converts at **6.6× Philadelphia's key-event rate** and **5.0×** its revenue
per user — against the 10× and 6.5× this report quoted on mismatched rows.

**The county classification is manual.** GA4 has no county dimension, so this has to live as a
maintained city-list regex. Two mechanical notes from the operator: scope any such regex with
`Region = Pennsylvania`, because a bare `Lancaster` also matches Lancaster CA/NY/OH/TX (one user
tonight), and `Columbia` is far more exposed to that than `Lancaster` is.

**Separate finding from the same tab, and it is a big one:** the **`(not set)` region carries 84 of
220 key events — 38% — on $0.00 revenue.** Traffic GA4 cannot place is generating well over a third
of all key-event volume and none of the money. That is consistent with §A7's Google Ads family (94
key events, $0.00, all `ads_conversion_About_Us_1`), but it is not obviously the same rows and is
worth its own look.

### G5. Custom dimensions created, and #299 is confirmed live

§C4 closed. Both created event-scoped, verified on screen:

| Dimension | Parameter | Created |
|---|---|---|
| Fetch failure reason | `reason` | 2026-08-28 |
| Page started hidden | `page_started_hidden` | 2026-08-28 |

Quota after: 4 of 50 event-scoped. No pressure.

**The detail that matters most is incidental:** both parameter names were **already offered in GA4's
autocomplete**, which means the property is already receiving them. **PR #299 is live and firing** —
independent confirmation of §A3, arrived at from the opposite direction. GA4 simply was not
registering the values into anything reportable.

**Not retroactive, restated because it will look like a fault tomorrow:** the ~62 existing
`next_event_fetch_failed` events read `(not set)` on both dimensions permanently, and GA4 typically
takes 24–48 hours to populate a new dimension. Seeing nothing on 2026-08-29 is expected.

**One naming overlap now live:** *Fetch failure reason* sits next to the existing *Checkout Error
Category*, whose description also amounts to "failure reason". Different events, different
parameters, no technical collision — but two similar names in every report picker. Renaming a custom
dimension is safe and non-destructive; changing its parameter is not.

### G6. What this adds to the fix list

- **Fire `view_promotion`** wherever `select_promotion` is fired (§G2). Four call sites:
  `index.html:1103`, `events.html:2744`, `about.html:664`, and the `/lp` CTA. Without it the sticky
  bar's 3 clicks have no denominator and open question 2 stays half-closed. **Code, not config** —
  and it is the kind of small additive change that wants its own PR.
- **Scope any Lancaster County regex with `Region = Pennsylvania`** (§G4), or it will silently collect
  Lancaster CA/NY/OH/TX.
- **Investigate the 9 users with 492 sessions** (§G3) and the **`(not set)` region's 84 key events**
  (§G4). Both look like the same class of thing — traffic that fires events and never buys.

### G7. `fbclid` redaction — APPLIED 2026-08-28, and the caution was discharged first

§D3 and §0 both warned that redaction had to be checked for scoping before anyone touched it,
because a blanket strip would take `eventId` with it. It was read read-only first, the caution was
discharged, and **it is now live.** What the read established:

| Question | Answer |
|---|---|
| Does it take named keys? | **Yes** — up to **30**, case-insensitive |
| Would it affect `eventId`? | **No.** Only the keys you name. `eventId` survives untouched |
| Which fields does it cover? | `page_location`, `page_referrer`, `page_path`, `link_url`, `video_url`, `form_destination` — flagged in bold in the UI |
| Retroactive? | **No.** Collection-time. The existing 1,521 fragmented rows stay fragmented permanently |
| Removes the key or the value? | **The value.** URLs become `…&fbclid=(redacted)`, which still collapses all 1,521 variants into one row per `eventId` |

`page_location` is in the covered list, and that is what `Landing page + query string` derives from,
so it does hit the report §A5 is about.

**Recommendation: enable it, with `fbclid` as the only key.** Three reasons, and one thing it does
not do:

1. The `eventId` risk that justified the caution is gone — the field is a named allow-list.
2. It is the **only** half of §A5 that helps traffic arriving with `fbclid` on the landing page
   itself. PR #309 stops `/lp` *forwarding* it to `/events`; it cannot stop Meta putting it on the
   inbound URL.
3. **It does not touch the Meta pixel.** Redaction applies to the payload sent to GA4, not to the
   browser's URL bar — `fbq` still reads the real `fbclid` and still writes `_fbc`. No attribution
   is lost on either side.

**What it will not do:** fix anything already collected. §A5's 1,533 rows are permanent. The value of
doing it is entirely in the next 100 days, which is also why doing it sooner is worth more than doing
it carefully later.

**APPLIED and verified, 2026-08-28.** The stream row badge flipped from *"URL query parameter keys
inactive"* to **"Email active · 1 URL query parameter key"**. The panel was reopened after saving —
with Save greyed out, confirming persisted rather than unsaved state — and the key field read back
**`fbclid`, one entry, lowercase, nothing else**. Chip elements were counted in the DOM to rule out a
second key below the fold: four exist on the page, three of which are the Enhanced-measurement badges
behind the panel. **`eventId` is not present**, and the field was empty before the change, so nothing
was displaced. Email remains ON.

**A GA4 UI fact worth not rediscovering** — the kind `ANALYTICS_CONTEXT.md` §2 collects. **That field
is a chip input, not a text box.** Typing `fbclid` and pressing Save fails with *"The URL parameter
keys must not be empty"*, because the text has not been committed to a token yet. **Press Enter to
commit it to a chip first, then Save.** The Enter is the commit gesture, not a second key.

*Re-check in ~1 week:* distinct landing-page rows for paid traffic, currently 1,533. New hits arrive
as `/lp?eventId=…&fbclid=(redacted)` — the key stays, the value goes — so the row count should stop
growing almost immediately, while the report itself looks unchanged for a day or two as old and new
data mix. **The existing rows never collapse; only the bleeding stops.**
