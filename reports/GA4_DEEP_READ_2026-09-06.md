# GA4 deep read — 2026-09-06

**What this is.** Taylor's standing complaint about the nightly GA4 PRs, in his
words: they "are basically half a page and they really don't have great
insights", with no summary of traffic, no summary of events, and nothing about
gaps in UTM tagging — while the pull itself has grown to **46 tables every
night**. This report is that missing depth, run against tonight's pull, plus the
two changes that stop the gap reopening: a script that computes the standing
numbers so no run can skip them, and a rewritten nightly prompt that requires
them.

It also closes the one item PR #449 escalated to Taylor — the "scrambled email
UTM string" — which turns out not to need him at all.

**Data.** GA4 Data API, property 536859339, window `20260519-20260906`, pulled
**2026-09-06 06:12 UTC**, read from each file's own `#` header. 46 tables, all
46 read. Meta: `meta-insights-2026-09-05.csv`, window `20260830-20260905`.
Daily figures exclude **2026-09-05 and 2026-09-06** as not final
(`ANALYTICS_METHOD.md` §1); period comparisons use two **disjoint** closed
weeks, never a rolling window.

**Own-site revenue is not business revenue.** Eventbrite and Meetup purchases
fire no analytics at all, so roughly 55% of real revenue is invisible here by
construction. Every dollar below is a floor.

---

## HEADLINE — the "scrambled email UTM" is a broken link on a free newspaper listing, and it cost about 129 clicks. Nobody needs email-platform access; the fix is already deployed and needs pasting into one form.

PR #449 escalated this to Taylor twice, most recently as: *"needs someone with
the email platform's send history to identify which campaign this was and fix
the merge-tag failure at the source — I can see the GA4 symptom but not the
email vendor side."* That framing is wrong in every part. Here is what it
actually is.

**1. The string is not scrambled, it is enciphered, and the cipher is trivial.**
Letters `a`–`f` shift **+1**; letters `g`–`z` are **ROT13**. Case, digits and
punctuation pass through. That reproduces all three observed strings exactly:

| in GA4 | decodes to |
|---|---|
| `Ybadbfgfe \| Zbfgfe Yvfg` | `Lancaster \| Master List` |
| `FZBVY_DBZCBVTA` | `EMAIL_CAMPAIGN` |
| `zd_...` | `mc_...` |

**2. It did not need decoding at all, because the plaintext is sitting in the
same table.** `ga4-api-traffic-by-source` carries **both** rows:

```
Ybadbfgfe | Zbfgfe Yvfg / email    129 sessions   129 users   0 key events   $0
Lancaster | Master List / email      7 sessions     7 users   0 key events   $0
```

One channel, two rows, 136 sessions. Every previous report read only the larger
half.

**3. It is not our email.** `Lancaster | Master List` is the audience name of
**LNP | LancasterOnline's** events newsletter, whose event calendar is powered
by **Evvnt**. Taylor submitted both SparkDate events to it on **2026-09-02**
(Evvnt confirmation and "thanks for submitting your event" mail, 02:52 and 03:07
UTC; the Loxley's listing is live at `lancasteronline.com/visitlancaster/…
/event/3807561-sparkdate-the-loxley-s-social`). The newsletter went out
**2026-09-03** — every one of the 136 sessions is dated 09-03 apart from a
single straggler on 09-05. `EMAIL_CAMPAIGN` is an unfilled placeholder in *their*
template. There is no merge tag of ours to fix and no send history of ours to
look up.

**4. The real finding is the one nobody looked for: the link they are using is
broken, and the same table proves it.** Both rows land on `/event`. Their
behaviour could not be more different:

| | obfuscated row | plaintext row |
|---|---:|---:|
| sessions / users | 129 / 129 | 7 / 7 |
| `page_view` | 146 | 7 |
| `view_item` | **0** | **6** |
| `begin_checkout` | **0** | **6** |
| `checkout_form_started` | 0 | 6 |

`view_item` fires in `applyEventData()` in [public/event.html:1477](public/event.html:1477), and only
after the event document has actually been fetched and rendered. **Not one of
the 129 sessions ever saw an event.** Six of the seven sessions on the clean
link saw one and opened checkout.

The mechanism is the one `/l/` short links already exist to defeat. From
[scripts/build-listing-redirects.js:11](scripts/build-listing-redirects.js:11): *"listing sites mangle long
query-strings, and they do it silently … Neither surfaced as an error. Both
produce a working link that reports no attribution — the worst failure shape
available."* Here the mangling is the publisher's link-tagging pass rewriting
the query string, which carries `?id=<firestore doc id>`. Garble the `id` (or the
literal key `id`, which the same cipher turns into `ve`) and
[public/event.html:1389](public/event.html:1389) either cannot find an event or has no id at all — and
the visitor gets a page with no event on it.

**5. The fix is already built, deployed, and takes one paste.** Both path-only
short links are live right now and 307 correctly:

```
https://sparkdate.date/l/lx-lancasteronline
  -> /event?id=KL4onXm7hJbqiwI9quAZ&utm_source=lancasteronline&utm_medium=listing&utm_campaign=lx_202609&utm_content=lx_lancasteronline

https://sparkdate.date/l/mc-lancasteronline
  -> /event?id=WUaooYvOq0eC0D1QVCvQ&utm_source=lancasteronline&utm_medium=listing&utm_campaign=mc_202609&utm_content=mc_lancasteronline
```

They carry **no query string of their own**, so there is nothing for a third
party to rewrite; the UTMs live in the redirect target, where only we can edit
them. **Action: in the Evvnt dashboard, change each event's ticket/website URL
to its `/l/…` link.** That is a listing edit, not an email-platform task.

**What I did not establish.** I could not read the exact URL Evvnt is serving —
its API needs an account token and the calendar page renders the event through a
widget I could not extract the ticket href from. So "the query string was
mangled" is the mechanism most consistent with the evidence, not a directly
observed fact. The alternative — that the 129 are automated newsletter
link-scanners and the 7 are the humans — is not excluded by these tables, and
would also produce zero `view_item`. **Both readings point at the same next
step**, because the `/l/` link is correct under either. What would settle it:
open the live listing, copy the ticket link, and paste it into a browser.

---

## 1. Traffic

Two **disjoint** closed weeks. Recent = 08-29 → 09-04; prior = 08-22 → 08-28.

| metric | recent 7d | prior 7d | change |
|---|---:|---:|---:|
| sessions | 1,009 | 1,021 | −1% |
| engaged sessions | 364 | 426 | −15% |
| engagement rate | 36.1% | 41.7% | |
| users | 993 | 900 | +10% |
| new users | 941 | 795 | +18% |
| purchasers | 4 | 6 | −33% |
| key events | 11 | 16 | −31% |
| transactions | 4 | 6 | −33% |
| own-site revenue | $114.96 | $169.94 | −32% |

**Reading it.** Sessions are flat and users are up 10%, but sessions per user
fell — the site is reaching more people, each of them less. Engagement rate down
5.6 points on flat volume is the more honest signal than the revenue line, which
moves on 4 transactions and should not be read as a trend at that n.

**Channels, window-wide.**

| channel | sessions | users | key events | conv rate | revenue |
|---|---:|---:|---:|---:|---:|
| Paid Social | 3,078 | 2,781 | 26 | 0.8% | $179.94 |
| Direct | 789 | 478 | 22 | 2.8% | $169.94 |
| Unassigned | 646 | 224 | 66 | 10.2% | $345.37 |
| Email | 388 | 212 | 26 | 6.7% | $125.45 |
| Organic Social | 222 | 176 | 10 | 4.5% | $130.46 |
| Organic Search | 141 | 85 | 7 | 5.0% | $82.47 |
| Paid Other | 117 | 109 | 63 | 53.8% | $0.00 |
| Referral | 74 | 14 | 5 | 6.8% | $0.00 |

Two things a reader must not take at face value. **"Unassigned" is the top
revenue channel** ($345.37) because `utm_medium=listing` — our own convention —
is not a channel GA4 recognises, so Eventbrite, the single best-converting
source on the site, is filed under nothing. **"Paid Other" converts at 53.8%**
because 63 of its 117 sessions fire the Google Ads page-load artifact described
in §2; it has produced $0.

**Device.** Mobile 4,000 sessions / 2.8% key-event rate / $904.17; desktop 1,394
/ 8.6% / $156.95; tablet 19 / 0% / $0. Desktop's apparent lead is largely the
`(not set)` bucket below — do not act on it.

**The suspect bucket is unchanged.** `(not set)` country / continentId `ZZ`:
**118 sessions, 82 key events, $0** — a 69.5% key-event rate against 4.3%
property-wide. Excluding it, the property rate is **2.8%**. It inflates every
engagement and conversion number in this report by roughly half again.
Consistent with automated traffic; still no IP or user-agent evidence has been
examined, so it stays a caveat, not a verdict.

**Geography.** Philadelphia 893 sessions / 16 key events / $114.96; Lancaster 237
/ 17 / $136.45. Lancaster produces more key events and more revenue from a
quarter of the sessions.

---

## 2. Events

**Only three events are actually configured as key events.**

| key event | count | revenue |
|---|---:|---:|
| `ads_conversion_About_Us_1` | 99 | $0.00 |
| `generate_lead` | 93 | $0.00 |
| `purchase` | 39 | $1,061.12 |

**43% of every "key event" number on this property is a page load.**
`ads_conversion_About_Us_1` is 99 of 231 key events, produces $0, and is a
legacy Google Ads import artifact. Any conversion rate quoted without stripping
it is inflated — that is the single most load-bearing correction in this report,
because it touches every channel table.

**Four funnel events are NOT key events, and appear in the key-events table
anyway** — carrying an event *value* with a key-event count of **zero**:
`view_item` ($16,479.43), `begin_checkout` ($3,861.51), `add_to_cart`
($2,529.00), `add_payment_info` ($284.90). Reading their presence in that table
as "conversions" claims four the property does not have. The summary script now
marks only non-zero key-event counts.

**Full event volumes** (top of 36): `page_view` 9,750 · `session_start` 5,470 ·
`first_visit` 4,006 · `scroll` 2,947 · `user_engagement` 2,730 ·
`in_app_browser_detected` 2,361 · `targeted_event_landing` 2,200 ·
`view_promotion` 835 · `view_item` 657 · `lead_form_started` 326 ·
`checkout_form_started` 299 · `begin_checkout` 263 · `add_to_cart` 100 ·
`generate_lead` 93 · `next_event_fetch_failed` 62 · `purchase` 39 ·
`checkout_error` 28 · `add_payment_info` 10.

`next_event_fetch_failed` at **62 events across 42 users** is a live client-side
failure nobody has raised; it is the `/lp` ticket card failing to resolve an
event and falling back to a bare `/events` link.

**Which channels produce which key events.** All 99 `ads_conversion_About_Us_1`
come from `googleads/*`. `purchase` comes from `eventbrite / listing` (11,
$290.39) and `(direct) / (none)` (6, $169.94) before anything else. Meta paid
social's contribution across all its spellings is 5 purchases.

---

## 3. Funnel

| step | users | completion | lost |
|---|---:|---:|---:|
| session_start | 3,974 | 9.7% | |
| view_item | 384 | 24.0% | **−3,590** |
| begin_checkout | 92 | 15.2% | −292 |
| purchase | 14 | 100% | −78 |

**The entire funnel is decided at step one.** 3,590 of 3,974 users leave without
ever seeing an event. Everything downstream is a rounding error by comparison.

By channel, at step one → view_item: Paid Social 2,778 → 215 (**7.7%**); Direct
477 → 61 (12.8%); Unassigned 144 → 44 (30.6%). Paid Social supplies 70% of
arrivals and is the worst arm at the only step that matters.

**Webview vs normal browser** — the sharpest split on the property:

| step | in-app browser | normal browser |
|---|---:|---:|
| session_start | 1,081 | 529 |
| view_item | 40 (**3.7%**) | 136 (**25.7%**) |
| begin_checkout | 10 | 66 |
| purchase | 1 | 9 |

A 7× gap at the first step. Caveat, and it is a real one: this segment pair only
exists since the in-app-browser flag shipped, so it reads a ~13-day slice inside
a 110-day window, and the purchase counts (1 vs 9) are below the n<10 line.

**Checkout ratios.** `add_to_cart ÷ begin_checkout` = **38.0%** (100/263), up on
the 24% paid / 30% all-channel benchmark from before the 09-03 form rebuild.
`add_payment_info ÷ begin_checkout` = 3.8% (10/263) — but `add_payment_info` only
began firing recently and its 10 events match the 10 own-site transactions since
it shipped exactly, so this ratio is uninterpretable over this window rather
than alarming.

**Checkout errors.** 28 events / 14 users: `card_incomplete` 18/8,
`(not set)` 8/7, `card_declined` 1, other 1. `card_incomplete` at 8 users is
unchanged from its documented lifetime figure — it is not growing. But **25 of
28 errors carry no reason at all**, so the error taxonomy currently cannot
diagnose anything.

---

## 4. UTM and tagging gaps — the worklist

Every defect is now **dated**. LIVE = produced a session in the last closed week;
stale = within four weeks; DEAD = older. This matters more than it sounds: the
`[object Object] / undefined` defect has been carried as an open action item by
**seven consecutive reports**, and it last produced a session on **2026-07-10**.
It is dead. Stop carrying it.

**D1 — one advertiser, eleven rows.** Meta traffic is split across 11
source/medium spellings, 5 of them still live:

| row | sessions | key events | revenue | status | last seen |
|---|---:|---:|---:|---|---|
| `Facebook / paid_social` | 1,610 | 15 | $97.47 | LIVE | 09-06 |
| `facebook / paid_social` | 435 | 5 | $0.00 | stale | 08-11 |
| `fb / paid_social` | 209 | 0 | $0.00 | **LIVE** | 09-06 |
| `m.facebook.com / referral` | 63 | 0 | $0.00 | LIVE | 09-05 |
| `facebook / social` | 61 | 3 | $47.99 | stale | 08-18 |
| `facebook.com / referral` | 37 | 0 | $0.00 | LIVE | 09-05 |
| `Facebook / paid` | 26 | 0 | $0.00 | DEAD | 06-09 |
| …4 more | | | | | |

**2,484 sessions, 29 key events, $200.44 combined.** Instagram is split two ways
(`Instagram / paid_social` 625 + `ig / paid_social` 129 = 754, both live). The
`fb` and `ig` short forms are the live half of this and are worth fixing first —
they are 338 sessions with **zero** key events between them.

**D2 — our own site tagging its own internal links.** 291 sessions across the
window; **2 rows still live, 93 sessions**:

| row | sessions | users | revenue | status |
|---|---:|---:|---:|---|
| `lp / (not set)` | 163 | 17 | $0.00 | stale |
| `get_tickets_block / (not set)` | 61 | 6 | $27.49 | **LIVE** |
| `matches / (not set)` | 32 | 3 | $27.49 | **LIVE** |
| `matches / web` | 26 | 4 | $0.00 | stale |

A utm-tagged **internal** link starts a fresh GA4 session and overwrites the
visitor's real acquisition source, so these are not merely untidy rows: $54.98
of revenue is currently credited to a button. Note `lp / (not set)` lands 106 of
its sessions on `/admin` from 2 users — most of that row is internal traffic,
not visitors.

**D3 — `utm_medium=listing` files our best channel under nothing.**
`eventbrite / listing` is 174 sessions, 23 key events (**13.2%**, 8.5× the
property average) and **$290.39 — 27.4% of all own-site revenue.** GA4 has no
`listing` channel, so all of it lands in "Unassigned" and is invisible in every
channel report. This is a deliberate convention (`content/listing-sites.json`
explains why `referral` was rejected); the cost of it is that the best channel on
the site never appears by name.

**D4 — placeholder and broken values still live:**

| value | sessions | key events | status | last seen |
|---|---:|---:|---|---|
| `<campaign-name>` | 69 | 41 | — | legacy June ad |
| `(not set)` source/medium | 54 | 0 | LIVE | 09-06 |
| `[object Object] / undefined` | 36 | 0 | **DEAD** | 07-10 |
| `undefined` campaign | 36 | 0 | — | |
| `(data not available)` | 10 | 1 | LIVE | 09-05 |
| empty `utm_content` (5 rows) | 76 | 0 | — | |
| `{{site_source_name}} / paid_social` | 1 | 0 | LIVE | 08-30 |

That last one is an unexpanded Meta macro reaching GA4 as a literal — one
session, but it means a creative shipped with the macro in a place Meta does not
substitute.

**D5 — `utm_content` shared across campaigns.** `proof_rsa1` appears under
`Augweek3_lancaster`, `Augweek1_philly`, `Augweek3_philly`, `Augweek1_lancaster`
and more. `content/brand.json` requires `utm_content` to be unique per ad
precisely because a shared value can never be split apart afterwards. It cannot
be fixed on the live ads — `url_tags` is frozen at creation — so this is a
constraint on the *next* build, not a repair.

**D6 — campaigns spending sessions and returning nothing** (≥20 sessions, 0 key
events): `Augweek3_lancaster` 462 · `Augweek1_philly` 358 ·
`summer2026_philly` 273 · `Augweek1_lancaster` 223 · `week2_Solution` 212 ·
`LX_202609 / lx_prime_male_noplan` 153 · `week3_Women` 116 ·
`LX_202609 / lx_prime_female_showup` 80.

**D7 — auto-tagging overwriting a manual campaign** happens exactly **once**, on
40 sessions (`AutoTagged_Search` over `week3_Women`). The other ~1,400 rows in
`first-user-tagging` where the columns differ are simply missing manual tags,
not overwrites. Worth stating because that file invites the opposite reading.

---

## 5. Also in the report

**Loxleys has sold 2 own-site tickets, on 08-14 and 08-15, and nothing since.**
`items-daily` dates every sale, and this is why PR #449's headline is wrong (see
below). Marion Court, by contrast, sold on 08-27, 08-29 (×2) and 09-01 (×2).

**Revenue by item, window-wide:** Tellus AfterDark 12 seats / $287.88 · Round 2
Summer Nights 8 / $199.92 · Founders Mixer 8 / $192.93 · Good Good Night 6 /
$149.94 · Marion Court 5 / $99.95 · Loxley's 2 / $37.98. **Only 7 of 41 seats
sold in this window are for the two events currently live.**

**Additivity closes.** `revenue-by-source` = `revenue-daily` = $1,061.12 / 39
transactions, exactly. `revenue-by-item` = `items-daily` = $968.60, exactly. The
$92.52 gap between item revenue and transaction revenue is the documented
per-transaction fee effect, not a discrepancy.

**`transaction_id` reuse:** 16 distinct ids carry 39 transactions; 5 ids appear
more than once, one carries 8, and 5 span more than one date. Counted, not
diagnosed — PR #200's question stays open.

**Google Ads has recorded no cost, clicks or impressions since 2026-07-24** — 41
consecutive closed days. Lifetime $37.91, of which $35.35 went to
`Website traffic-Search-1` for **zero attributed sessions**. Important
qualification: GA4 cannot tell a paused campaign from a stopped cost import, so
this is a statement about the data, not about the account.

**Meta.** No week-over-week claim is possible: the 09-05 and 09-04 files overlap
by 6 of 7 days (`ANALYTICS_METHOD.md` §9). Both Sales-objective campaigns
delivered for the first time on 09-05.

---

## 6. Needs Taylor input

1. **Paste the `/l/…` links into the two Evvnt listings** (Loxley's and Marion
   Court). Two minutes, and it is the only thing standing between a free
   Lancaster-newspaper newsletter and a working ticket link. Re-check in a week:
   `lancasteronline / listing` should appear in `traffic-by-source` with
   non-zero `view_item`. — *This replaces the "scrambled email UTM" ask, which
   is now closed: it was never an email-platform problem.*

2. **Decide whether `utm_medium=listing` keeps hiding the best channel** (D3).
   Either accept that Eventbrite's $290.39 lives in "Unassigned" forever, or
   move listings to a medium GA4 groups. This is a measurement-policy call with
   a real cost either way, so it is yours, not mine.

Nothing else tonight rises to a judgment call. Everything else in §4 is a code
or listing fix that a session can make.

---

## 7. Zero-risk fixes, described and not applied

1. **Lower-case the `fb` and `ig` source values** in whatever builds those links
   — 338 live sessions, zero key events, currently invisible next to their
   capitalised twins.
2. **Stop putting `utm_*` on internal links** for `get_tickets_block` and
   `matches` (D2, both live).
3. **Add a reason to every `checkout_error`** — 25 of 28 carry none.
4. **Investigate `next_event_fetch_failed`** (62 events, 42 users).
5. **Retire `[object Object] / undefined` from the carried-items list.** Dead
   since 07-10, carried by seven reports.
6. Add an `ANALYTICS_METHOD.md` §10 entry for the 2026-09-03 checkout-form
   rebuild, and a §7 worked example using the LNP split rows.

---

## 8. Caveats, and what I did not verify

- **The exact URL on the Evvnt listing.** Its API requires an account token and
  the calendar widget did not expose the ticket href to me. The mangled-query
  mechanism is inference; the scanner-traffic alternative is not excluded. Both
  imply the same fix.
- **Whether the 7 plaintext sessions and the 129 obfuscated ones are the same
  kind of visitor.** n=7 is small and I have leaned on it. What it can support:
  the clean link demonstrably works. What it cannot: a conversion-rate estimate
  for that newsletter.
- **Business revenue.** GA4 is own-site only; Eventbrite and Meetup are
  invisible. Nothing here counts them.
- **Causality anywhere.** Sixteen adversarial verification passes ran against
  the first draft of these findings. They confirmed essentially every number and
  refuted a majority of the *stories* attached to them — including my own first
  reading of the webview gap and of the Instagram-vs-Facebook comparison. Where
  a mechanism is stated below the level of "this is what the table says", it is
  marked as inference.
- **Per-event daily counts do not exist on disk.** No table carries
  `eventName × date`, so "which event first appeared or collapsed this window"
  is not computable. A `date × eventName` pull would fix it.
- **Engagement rate by landing page** is likewise not available — no table joins
  `landingPage` to `engagementRate`.
- **The two non-final days** (09-05, 09-06) are excluded from every daily figure.
- **Meta attribution is not sales.** Not one number above treats it as such.

## 9. Correction to carry: PR #449's headline is wrong

PR #449 credits the Loxleys campaign with **5.75 gross ROAS, "the account's
best"**. The Loxleys ads went live **2026-08-30**. `items-daily` dates both of
Loxleys' own-site tickets to **08-14 and 08-15** — two weeks before any Loxleys
ad existed. Since the ads started the campaign has spent about $18 for 183
clicks and zero tickets. The figure should not be cited. The general rule is
already in memory as `meta-attribution-is-not-sales`; what was missing was a
mechanical check, and the standing summary now prints **sale dates per item**
next to any ad-credit claim precisely so this cannot recur silently.

## 10. Coverage

**46 of 46 tables** are represented in the standing summary this report is built
on. No table was skimmed and set aside.
