# Checkout event tracking review — 2026-09-04 → 09-06

**Prompted by:** Taylor, 2026-09-06 evening — *"noticing bounce rate on checkout, review checkout events tracking over the last 3 days."*

**This review made no code changes.** It adds this file, a memory note, and a
handoff entry. Every fix below is described, not applied.

**Data.** Live GA4 Data API pulls on property 536859339 at **2026-09-06 22:00 ET**
(02:00 UTC 09-07) — scripts and CSVs kept in the session scratchpad, tables
reproduced here in full. The 02:00 nightly's `ga4-api-*-2026-09-06.csv` files
were read for comparison, not as the source. Meta pixel 4390442851170732 read
live through the Graph API `/stats` edge. Three checkouts read at
`origin/main` `e94c5b20` (`public/lp.html`, `public/event.html`,
`public/events.html`); the live pages were fetched with `curl` and the `/lp`
checkout was exercised in a real browser. Firestore was **not** reachable from
this session (no `FIREBASE_*` env), which matters for exactly one claim,
flagged below.

**One test session of mine is in the 09-06 numbers.** At ~22:20 ET I opened
`/lp?eventId=KL4onXm7hJbqiwI9quAZ`, tapped Get Tickets and picked a gender, which
fired `select_promotion`, `view_item`, `begin_checkout`, `checkout_form_started`,
`checkout_field_started` and `add_to_cart` (and the pixel equivalents) from this
machine. No form was submitted. If the internal-traffic filter does not cover
this IP, 09-06 carries one extra of each.

**Adversarially verified before publishing.** Every finding below went through
two independent verifiers (re-derive the evidence; hunt for a better
explanation), against fresh live pulls made after this document's original
draft. Five of seven survived unchanged bar wording. Two did not: the "dead
link" on 09-03 turned out to be a live link hit by an automated scanner, not a
broken one (rewritten below, MECHANISM — the scanner), and the Eventbrite
explanation for two extra Marion Court tickets rested on fee arithmetic this
codebase doesn't do (corrected in NOT VERIFIED). Both corrections are folded
into the text below rather than kept as a separate errata section — nothing
here is the first draft.

---

## HEADLINE — The tracking is working. The bounce number is two artifacts and one automated scanner. What actually changed is that nobody has entered a card since 09-01.

Three things are true at once, and the GA4 UI shows only the first:

1. **The 100% bounce rate is the newest-day processing lag**, the same trap
   `ANALYTICS_METHOD.md` §1(a) documents. In the 02:00 pull, 09-05 and 09-06
   both read 100%. Live twenty hours later, 09-05 reads **55.3%** (85 sessions,
   38 engaged) and 09-06 still reads 100% — with a 140-second average session
   duration, which cannot coexist with zero engaged sessions. Re-checked past
   midnight (03:06 ET 09-07): 09-05 is now stable and final at 55.3%; 09-06 is
   still 0 engaged of 38 sessions, three-plus hours after the day ended —
   confirming the lag rather than a fresh problem, and meaning **anyone
   opening the GA4 dashboard this morning will still see a 100% figure for
   yesterday.** Excluding bot traffic (below), the human bounce rate for
   09-03 / 09-04 / 09-05 is **69% / 72% / 73%**, inside the 63–79% band the
   same bot-excluded basis reads for the two weeks before (the raw,
   bot-included range for that comparison week is 59–79%). Nothing moved.

2. **The one real spike is an automated scanner reading a good link, not a broken link and not checkout behaviour.** On 09-03,
   **129 sessions** from the LancasterOnline/Evvnt newsletter (the obfuscated
   `Ybadbfgfe | Zbfgfe Yvfg / email` tag) hit `/event?id=JHbbbLiBd3fD3E4DIDiD` and
   got nothing — HTTP 404, `/api/next-event?id=` returns `{"event":null}`. The
   first draft of this document called that a dead link. It wasn't: applying
   the newsletter's own obfuscation cipher (`reports/GA4_DEEP_READ_2026-09-06.md`
   §1 — a–f shift +1 with f→a, g–z ROT13, **and digits shift +3**, which that
   report had wrong) to the *real* Marion Court id, `WUaooYvOq0eC0D1QVCvQ`,
   reproduces `JHbbbLiBd3fD3E4DIDiD` exactly. **The link was never broken — a
   security scanner enciphered the query string before fetching it**, so the
   id it requested was gibberish to the server even though the id the
   newsletter actually sent was correct. 113 of the 129 hits landed in the
   single minute 10:48 ET; every one was desktop Chrome at 1920×1080, English,
   new-user; the geography is San Jose, Virginia, Moses Lake WA, Des Moines
   and Colorado — **zero in Pennsylvania** — and each carried a distinct
   Mailchimp subscriber id, one scan per recipient at send time. The *same*
   newsletter's plaintext row (`Lancaster | Master List / email`, 6–7 sessions,
   Lancaster/Philadelphia/NJ) landed on the correct id and converted normally:
   `view_item` 6/6, `begin_checkout` 6/6, 33% bounce. **The newsletter link
   worked for every human who clicked it.** `/event`'s missing not-found event
   is still a real gap (below), but there was no bounce to catch — 129 bot
   hits would have logged as 129 bot hits, not as a broken link.

3. **Every checkout event that should fire, fires** — verified on the live
   `/lp` with the real gtag.js loaded and `/g/collect` requests going out. What
   the last four days show is a funnel that opens and then stops:

   | window | `begin_checkout` | `add_to_cart` (gender picked) | `add_payment_info` (card accepted) | `purchase` | `checkout_error` |
   |---|---:|---:|---:|---:|---:|
   | 08-24 → 09-01 (9 days, before the rebuild) | 84 | 31 | 9 | 9 | 10 |
   | **09-02 → 09-06 (5 days)** | **37** | **1** | **0** | **0** | **0** |

   The Meta pixel — which receives `Purchase` **server-side** from the Stripe
   webhook regardless of what the browser does — agrees: 80 `InitiateCheckout`,
   **0 `AddPaymentInfo`, 0 `Purchase`** for the same five days, against 16 and
   24 in the nine days before. Two independent systems, one of them not in the
   browser at all, both read zero. `add_payment_info` fires the moment Stripe
   accepts a card and `checkout_error` fires when Reserve is pressed with a
   bad one, so zero of both means **no guest completed card entry** — not
   that payments failed. (It doesn't cover the separate member/card-on-file
   branch, which charges a saved card without ever calling Stripe Elements
   and so never fires `add_payment_info` even on success; that branch is
   covered instead by `purchase`, which fires on both paths and is
   independently zero for the same five days.)

The rest of this document is the evidence for each of those, the instrumentation
map that the review was asked for, and what was not verified.

---

## EVIDENCE — bounce rate, day by day, live versus the 02:00 file

Live pull 2026-09-06 22:00 ET. "02:00 file" is `ga4-api-session-quality-daily-2026-09-06.csv`.
"Humans" excludes sessions whose city is a Meta data-centre location (see
MECHANISM below). Last two live days are still not final.

| date | sessions | engaged | bounce (live) | bounce (02:00 file) | bounce (humans only) | avg session |
|---|---:|---:|---:|---:|---:|---:|
| 08-24 | 135 | 62 | 54.1% | 54.1% | 54.9% | 177 s |
| 08-25 | 141 | 48 | 66.0% | 66.0% | 66.4% | 107 s |
| 08-26 | 172 | 73 | 57.6% | 57.6% | 58.7% | 253 s |
| 08-27 | 153 | 32 | 79.1% | 79.1% | 79.1% | 45 s |
| 08-28 | 116 | 32 | 72.4% | 72.4% | 73.5% | 60 s |
| 08-29 | 138 | 57 | 58.7% | 58.7% | 75.5% | 46 s |
| 08-30 | 220 | 78 | 64.5% | 64.5% | 72.3% | 84 s |
| 08-31 | 169 | 62 | 63.3% | 63.3% | 64.2% | 134 s |
| 09-01 | 109 | 45 | 58.7% | 58.7% | 62.7% | 68 s |
| 09-02 | 85 | 31 | 63.5% | 63.5% | 63.9% | 33 s |
| 09-03 | 210 | 65 | 69.0% | 69.0% | 69.2% | 22 s |
| 09-04 | 78 | 26 | 66.7% | 66.7% | 71.8% | 26 s |
| **09-05** | 85 | 38 | **55.3%** | **100%** | **73.4%** | 30 s |
| 09-06 | 34 | 0 | 100% *(unprocessed)* | 100% | 100% *(unprocessed)* | 140 s |

Two readings of the same table:

- **09-05 went from 100% to 55% between the 02:00 pull and 22:00** — that is
  the engagement-processing lag, measured before (§1a: 08-24 read 3.1% engaged
  in one export and 45.9% in the next). 09-06 will do the same.
- **The humans-only column barely moves in the last three days** (69 → 72 →
  73%). The live 09-05 figure of 55% is *too good*, because 22 crawler
  sessions that day all registered as engaged.

Average session duration has been drifting down since 08-27, when Loxleys'
Traffic ads (in-app browser traffic, 4–5 s sessions) started; that is a mix
change, not a page change, and it predates the window Taylor asked about.

### By landing page — the checkout surfaces

| date | `/lp` sessions | `/lp` bounce | `/event` sessions | `/event` bounce | `/events` sessions | `/events` bounce |
|---|---:|---:|---:|---:|---:|---:|
| 09-02 | 69 | 68.1% | 6 | 33.3% | 1 | 100% |
| 09-03 | 63 | 68.3% | **136** | **69.9%** | 2 | 50% |
| 09-04 | 62 | 77.4% | 9 | 0% | 2 | 50% |
| 09-05 | 60 | 50.0% *(22 crawler sessions inside)* | 4 | 50% | 4 | 25% |
| 09-06 | 30 | 100% *(unprocessed)* | — | — | 1 | 100% |

For reference, `/lp`'s landing bounce over 08-24 → 09-01 ran 62–90%. Nothing
in the last three days is outside that.

### By source — where the bounces came from, 09-03 → 09-06

| source / medium | sessions | engaged | bounce | avg session | what it is |
|---|---:|---:|---:|---:|---|
| `Ybadbfgfe \| Zbfgfe Yvfg / email` | 129 | 36 | 72.1% | 5.4 s | LancasterOnline newsletter, read by an automated scanner (see MECHANISM — the scanner) |
| `Instagram / paid_social` | 81 | 6 | **92.6%** | 4.9 s | the new Sales campaigns' Instagram placements |
| `fb / paid_social` | 67 | 38 | 43.3% | 55 s | Loxleys' old Traffic tags; ~half of 09-05's rows are the crawler |
| `ig / paid_social` | 41 | 9 | 78.0% | 89 s | Loxleys Traffic, Instagram |
| `(direct) / (none)` | 27 | 9 | 66.7% | 95 s | |
| `(not set)` | 21 | 0 | 100% | 43 s | all on 09-06, unprocessed |
| `Facebook / paid_social` | 12 | 1 | 91.7% | 16 s | |
| `m.facebook.com / referral` | 11 | 11 | 0% | 27 s | crawler, see below |

`Instagram / paid_social` at 93% bounce and 5 seconds is the cohort worth
watching. It is consistent with Meta's in-app browser pre-opening ad
destinations before the user swipes to them (`page_started_hidden`, which
`lp.html` already sends but which is not yet registered as a custom dimension —
HANDOFF's standing item for Taylor). On `/lp` in this window, `page_view` fired
230 times and `lp_visible` 182 — **19% of `/lp` loads were never shown to a
person**. Until `page_started_hidden` is registered, those ghosts and human
bounces read the same.

---

## EVIDENCE — the checkout funnel, day by day, GA4 and the pixel side by side

GA4 event counts (live) and Meta pixel event counts (`/stats`,
`aggregation=event`, browser + server, US Eastern days). The rule at 09-03 is the
paid-path rebuild (#419, deployed 09-02 21:40 ET; `ANALYTICS_METHOD.md` §10).

| date | GA4 `begin_checkout` | GA4 `add_to_cart` | GA4 `add_payment_info` | GA4 `purchase` | GA4 `checkout_error` | pixel `InitiateCheckout` | pixel `AddToCart` | pixel `AddPaymentInfo` | pixel `Purchase` |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 08-24 | 14 | 9 | 1 | 1 | 2 | 8 | 10 | 2 | 3 |
| 08-25 | 15 | 9 | 1 | 1 | 0 | 20 | 10 | 2 | 3 |
| 08-26 | 15 | 4 | 2 | 2 | 5 | 22 | 8 | 4 | 6 |
| 08-27 | 7 | 1 | 1 | 1 | 0 | 2 | 2 | 2 | 3 |
| 08-28 | 7 | 3 | 0 | 0 | 0 | 4 | 5 | 0 | 0 |
| 08-29 | 8 | 3 | 2 | 2 | 0 | 4 | 2 | 2 | 4 |
| 08-30 | 2 | 0 | 0 | 0 | 0 | 4 | 0 | 0 | 0 |
| 08-31 | 7 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 0 |
| 09-01 | 9 | 2 | 2 | 2 | 3 | 10 | 4 | 4 | 5 |
| 09-02 | 8 | 0 | 0 | 0 | 0 | 16 | 6 | 0 | 0 |
| 09-03 | 7 | 1 | 0 | 0 | 0 | 14 | 2 | 0 | 0 |
| 09-04 | 11 | 0 | 0 | 0 | 0 | 17 | 2 | 0 | 0 |
| 09-05 | 8 | 0 | 0 | 0 | 0 | 15 | 6 | 0 | 0 |
| 09-06 | 3 | 0 | 0 | 0 | 0 | 18 | 20 | 0 | 0 |

Three things to read off this:

- **`begin_checkout` kept firing after the rebuild** at roughly the prior rate
  (7–11 a day), on the pages it should: `/lp` 11 and `/event` 18 in 09-03 →
  09-06, `/events` 0 — which is the rebuild working as designed (`/lp` now
  sells inline instead of sending people to the `/events` dialog).
- **Everything below it stopped on 09-02, in both systems.** The pixel's
  `Purchase` and `AddPaymentInfo` are the decisive columns: both were
  non-zero most days before, both are zero every day since.
- **The pixel's `AddToCart` did not stop (36 in the window) while GA4's
  `add_to_cart` did (1).** That looks like a GA4 defect and is not — see
  MECHANISM.

Note that GA4's `purchase` and the pixel's `Purchase` never agreed on
*levels* (9 vs 24 over 08-24 → 09-01; the pixel counts browser and server
copies, plus whatever fires from `localhost`). The signal is that both went to
zero on the same day, not the levels.

`checkout_error` categories in the window: none (0 events). The last errors
were 3 on 09-01, category `(not set)`.

### The two ratios HANDOFF says the rebuilt form is scored on

| ratio | 08-24 → 09-01 | 09-02 → 09-06 |
|---|---:|---:|
| `add_to_cart ÷ begin_checkout` | 37% (31/84) | 3% (1/37) |
| `add_payment_info ÷ begin_checkout` | 11% (9/84) | 0% (0/37) |

Read the first ratio with the definition change in mind (`ANALYTICS_METHOD.md`
§10, 09-03): before the rebuild most `begin_checkout`s were the `/events`
dialog's "Continue to checkout" click, a deliberate second step; since 09-03,
`/lp` fires it the instant the inline form expands on the Get Tickets tap, and
`/event` fires it on the first field focus. The opens are lower-intent now, so
the denominator inflated. The second ratio does not have that excuse —
`add_payment_info` means the same thing on both sides of 09-03 — and 0 of 37 is
the number to worry about. The sample is small (§12): at the prior rate of
11% per open, 37 opens should have produced about 4 card entries, and the chance
of seeing none is about 2% (Poisson, λ ≈ 4). Per session the traffic also fell
by two thirds, which loosens that to about 4%. So it is unlikely to be noise, but
it is also five days and thirty-seven opens.

**Update, on reprocessing:** the live test below is desktop-only, and this
document originally flagged mobile/webview `add_to_cart` as unverified. It
isn't broken. Once GA4 finished processing 09-06 overnight, a genuine
`add_to_cart` appeared on `/lp` at 17:07 local time — **mobile Safari, inside
Facebook's in-app browser, from `fb / paid_social`** — the exact environment a
desktop test can't cover, firing cleanly. That is a real ad-driven conversion
step five hours before this review's own live test, so it isn't the
reviewer's own traffic surfacing late either. The self-flagged gap closes in
the finding's favor: the code path works on mobile webview too.

---

## MECHANISM — the scanner, not a dead link, produced 09-03's one real spike

Applying the newsletter's cipher (see HEADLINE #2) to the campaign fields
independently confirms it's the same send as the plaintext row, not a
different or broken one:

| field | plaintext | enciphered (obfuscated row) |
|---|---|---|
| `utm_campaign` | `e37bbcb030-EMAIL_CAMPAIGN_2026_09_02_03_52` | `f60ccdc363-FZBVY_DBZCBVTA_5359_32_35_36_85` |
| `utm_content` | `mc_figlancaster` | `zd_avtybadbfgfe` |
| event id | `WUaooYvOq0eC0D1QVCvQ` (Marion Court) | `JHbbbLiBd3fD3E4DIDiD` |

Same Mailchimp send, same real link, same correct event — one row obfuscated,
one not. Only the query-string *values* are enciphered; the path (`/event`)
is untouched, which is why the enciphered id 404s while the plaintext one
resolves. (The cipher itself is a–f shift +1 with f→a, g–z ROT13, **and
digits shift +3** — `reports/GA4_DEEP_READ_2026-09-06.md` §1 says digits pass
through unchanged; they don't, and that report should be corrected too.)

Timing, device and geography rule out humans on the 129-session row:

| signal | the 129 (obfuscated row) | the 6–7 (plaintext row, humans) |
|---|---|---|
| timing | 113 of 129 in the single minute 10:48 ET | spread 10:49 → 14:31, into 09-05 |
| device | 129/129 desktop Chrome, 1920×1080, English | mixed, matches normal traffic |
| geography | San Jose CA, Virginia, Moses Lake WA, Des Moines IA, Colorado — **zero PA** | Lancaster PA, Philadelphia, NJ, NY |
| checkout | 0/129 `view_item`, 0/129 `begin_checkout`; 16/129 reached `/events` | 6/6 `view_item`, 6/6 `begin_checkout`, 33% bounce |
| identity | one distinct Mailchimp subscriber id per hit | normal session mix |

This is consistent with an email-security scanner that fetches every link in
a newsletter once per recipient at delivery time, running just long enough
for gtag's synchronous `page_view` (5.4 s average) but rarely long enough for
`event.html`'s Firestore lookup and redirect (`loadEvent()`,
`event.html:1493–1502`) — which is why 16 of 129 did reach `/events` while
the rest didn't.

**What this changes, and what it doesn't.** "Not checkout behaviour" still
holds — bot traffic to a page titled "Event Tickets" reads like a bounce.
"Dead link" doesn't — no human hit a broken URL that day, and the newsletter
converted normally for the people who actually clicked it. Two knock-on
effects: **Taylor's `/l/lx-lancasteronline` / `/l/mc-lancasteronline` short
links fixed nothing that was broken** (harmless, but not the story — see
NOT VERIFIED for what their own status actually is); and because the scanner
leaves paths intact and follows redirects, a *future* scan of the short links
will land on the real event id under `utm_source=lancasteronline` and could
fire a real `view_item` — so the planned check ("does `lancasteronline /
listing` show non-zero `view_item` by ~09-13") needs a device/geography
filter before it's trusted, or a scanner hit will pass as a human one.

---

## MECHANISM — the 09-05 "field interactions" were Meta's crawler, and they lower the bounce rate rather than raise it

On 09-05, `checkout_field_started` fired 32 times from 16 users and
`lead_form_started` 16 times from 16 users, all on `/lp` — against a
site-wide `begin_checkout` of 8. On `/lp` that combination is impossible for
a person: the checkout section is `display:none` until `openInlineCheckout()`
adds `.open` (`lp.html` CSS lines 179–180), and that function fires
`view_item` + `begin_checkout` + `checkout_form_started` synchronously in the
same call (`lp.html` ~1365–1379) before any field can take focus. Fields that
cannot be seen cannot be focused by a human; they can be by a renderer that
dispatches `focus` events programmatically.

Breaking the 16 users down (GA4, city × source × browser × device):

| city | sessions 09-05 | source / medium | browser |
|---|---:|---|---|
| Prineville | 8 | `fb / paid_social` | (not set) / Chrome / Safari |
| Dublin | 3 | `fb / paid_social`, `m.facebook.com / referral` | Firefox / Chrome |
| Forest City | 3 | `fb / paid_social`, `m.facebook.com / referral` | Firefox / (not set) |
| Fort Worth | 3 | `fb / paid_social` | (not set) |
| Luleå | 2 | `facebook.com / referral`, `m.facebook.com / referral` | Chrome |
| Altoona | 1 | | |
| Gallatin | 1 | | |
| Springfield | 1 | `m.facebook.com / referral` | (not set) |

Prineville (OR), Luleå (SE), Forest City (NC), Gallatin (TN), Fort Worth (TX)
and Altoona (IA) are Meta data-centre sites; Dublin is Meta's EU base;
Springfield is Springfield, Nebraska — Sarpy County, next to Meta's Papillion
site. Every one of these sessions fired exactly two `checkout_field_started`
events, and per city the field-starters and `begin_checkout` sessions are
disjoint (they sum to exactly the session count) — two separate crawler
behaviours, one clicking through, one dispatching focus.

**The causal link is exact, not same-day-coincidental.** Pulled from the Meta
Ads API directly: `Loxleys | Sales` was created **2026-09-05 12:17:55 ET**
(its ads a few seconds later); `Marion Court | Sales` was created **14:24:44
ET**. Every single GA4 event from these cities that day falls in exactly two
hours — **12:00 and 14:00 ET** — with the 12:00 cluster carrying `LX_202609`
tags and the 14:00 cluster carrying `MC_202609` tags or Marion Court's event
id with no utm at all. That is Meta's ad-review crawler, fetching each
destination within minutes of the ad being created, not the PR commits
(14:02 and 14:46 ET, the code landing, not the ads). Two more tells: the
sessions are geographically impossible for these ads, which target a 20-mile
Lancaster/Harrisburg/York radius (`content/brand.json`,
`scripts/build-paid-campaign.js`) and cannot be served in Oregon or Sweden;
and Meta's own Insights show `Loxleys | Sales` had **4** link clicks and
`Marion Court | Sales` **2** on 09-05 — fewer than the 9 and 4
campaign-tagged sessions GA4 recorded from these cities alone, so more
"clicks" arrived from the review crawl than from paying users that day.
`page_started_hidden` is also set on 19 of the 22 sessions' page loads —
consistent with a fetch, not a tap.

Over the whole window these cities account for **33 sessions (2 / 2 / 7 / 22 / 0
for 09-02 → 09-06), every one of them "engaged"**, 208 events on 09-05 alone.
Consequences:

- They **lower** the day's bounce rate: 09-05 reads 55% with them, 74.6%
  without (63 sessions, 16 engaged, once Gallatin and Springfield are added
  to the exclusion list — an earlier cut of this same table read 73.4% with
  two of the eight cities still counted in).
- They inflate `lead_form_started` (16 of 16 that day), `checkout_field_started`
  (32 of 32), `lp_visible`, `page_view`, and `sessions`; only 13 of the 22
  sessions actually carry the ad's own campaign tags (`fb / paid_social` with
  `LX_202609`/`MC_202609`), the other 9 arrive as plain `facebook.com` /
  `m.facebook.com` referral with no utm at all.
- They pass the internal-traffic filter (it is IP-based, and these are Meta's
  IPs), and GA4 has no city-based data filter, so the fix is analytical: any
  report that counts `/lp` sessions or form interactions should exclude these
  cities, or the pages should stamp an `is_bot`-style parameter on sessions
  where `navigator.webdriver` is set or the UA is Meta's crawler
  (`facebookexternalhit`, `meta-externalagent`), so the exclusion becomes a
  dimension instead of a city list. Not built; recommended below.

Removing them, the human count on `/lp`'s checkout fields in four days is
**one person** (Lancaster, Safari, 09-06, `fb / paid_social`), who touched one
field. Only 6 of the day's 8 site-wide `begin_checkout`s came from these
cities, so **at least 10 of the 16** field-starting users — not "≥8" as this
document first said — had no `begin_checkout` at all; the same 6 also account
for 7 of 8 `select_promotion` and 6 of 11 `view_item` that day. This will
recur: it already happened on a smaller scale around the 08-29/08-30 campaign
builds (32 and 26 crawler-shaped sessions), and it will happen again the next
time an ad or campaign is created or edited — see DECISION.

---

## MECHANISM — why the pixel kept counting `AddToCart` while GA4 did not

In every one of the three checkouts the pixel `AddToCart` and the GA4
`add_to_cart` sit in the same block under the same condition
(`lp.html` 1415–1420, `events.html` 2530–2535, `event.html` 2100–2118), so
they cannot diverge on a real page load. They diverge on *where the page is
loaded from*. Pixel fires by host, 09-02 → 09-06 (`/stats`, `aggregation=host`):

| day | `sparkdate.date` | `localhost` | `invalid.invalid` |
|---|---:|---:|---:|
| 09-02 | 263 | 27 | 0 |
| 09-03 | 397 | 56 | 0 |
| 09-04 | 206 | 8 | 8 |
| 09-05 | 205 | 35 | 6 |
| 09-06 | 110 | 137 | 39 |

**316 pixel fires in five days came from a local dev server or a file
opened from disk**, which is what running the checkout pages locally does —
the HTML carries the production pixel id. GA4's `hostName` for the same
window is `sparkdate.date` only (493 sessions), so those local loads never
reach GA4 — the internal-traffic filter (Active since 08-25) drops this
machine's IP; the pixel has no equivalent. The checkout parity audit's
closeout (#456, 09-06 13:34) and the `/event` rebuild (#453, 09-05 19:47)
were exercising exactly these forms on exactly these days, and 09-06 —
the day #456 shipped — has the most `localhost` fires and the most pixel
`AddToCart` (20).

The `/stats` edge takes one aggregation at a time, so `AddToCart` cannot be
split by host directly; this is the consistent explanation, not a measured
one. Before the rebuild the two systems tracked within 30% (41 vs 31).

**This is the weakest mechanism in this document — say so rather than imply
it's settled.** `AddToCart`'s pixel-to-GA4 ratio jumped from ~1.3× before
09-02 to ~38× after; its sibling events moved far less over the same
window (`ViewContent`/`view_item` ~1.65× → ~4×, `InitiateCheckout`/
`begin_checkout` ~0.9× → ~2.3×). Local testing explains a general lift, not
a 38× one specific to this event. The `/stats` endpoint's undocumented
`host=` filter parameter was tried against `AddToCart` directly and is
silently ignored — there is no available tool that splits this further from
outside Meta's dashboard.

The same mechanism is the likely answer to HANDOFF's open thread *"the pixel
records more checkouts than carts"*: it also records checkouts from
`localhost`. Whoever picks that thread up should split by host first.

---

## EVIDENCE — the live checkout fires every event it should

Verified at ~22:20 ET on `https://sparkdate.date/lp?eventId=KL4onXm7hJbqiwI9quAZ`
in a real browser, reading `window.dataLayer`, `window.google_tag_manager` and
the resource timeline:

| step | what fired |
|---|---|
| page load | `gtag.js` loaded for `G-21YLCC35F1`; `/g/collect` requests for `page_view`, `targeted_event_landing`, `scroll`; `config` carried `page_path`, `page_started_hidden`, `in_app_browser` |
| tap Get Tickets | `select_promotion{lp_get_tickets}` → `view_item{24.99}` → `begin_checkout{24.99}` → `checkout_form_started{source:lp, skipped_details:true}`; pixel `ViewContent`, `InitiateCheckout` |
| tap "Woman" | `checkout_field_started{field:gender, source:lp}` → `add_to_cart{24.99, Loxley's}`; pixel `AddToCart`; pay button reads **Reserve Spot · $27.49** |
| focus name, email | `checkout_field_started{name}`, `{email}` |
| console | no errors; only `Content-Security-Policy-Report-Only` notices about `facebook.com/tr` (report-only, non-blocking — `vercel.json:55`) |

`curl` of the live `/lp`, `/events`, `/event` and `/lp?eventId=…` all carry the
`G-21YLCC35F1` snippet and the pixel init. No consent banner, no consent-mode
call, no enforced CSP exists anywhere in `public/` or `vercel.json`.

So a visitor who taps Get Tickets and picks a gender is counted, on both
systems, exactly as intended. Thirty-seven did the first and one did the
second.

---

## REFERENCE — the checkout instrumentation map

What fires where, as of `origin/main` `e94c5b20`. Line numbers will drift.

| event | `/lp` (`lp.html`) | `/event` (`event.html`) | `/events` dialog (`events.html`) |
|---|---|---|---|
| `view_item` | 1376, on first inline-form open, only if `coSellable()` | 1660, once per load in `applyEventData()`; **skipped for past events** | 2291, every dialog open |
| `begin_checkout` | 1377, same moment | **2311, on first `focusin` in `#checkoutForm`**; unguarded `gtag`, relies on the line-95 shim | 2264 when opened straight to checkout (`?checkout=1`, not sold out); 2392 on the Continue click |
| `checkout_form_started` | 1378 `{source:lp, skipped_details:true}` | 2323 `{in_app_browser}`; unguarded | 2269 `{skipped_details:true}`; 2402 **with no params at all** |
| `checkout_field_started` | 1324 via `coTrack()` — `gender`, `name`, `email`, `card`, `two_for_one`; `{source:lp}` | 2226 — `name`, `email`; `{source:event}` | 2604 — `name`, `email`; `{source:events}` |
| `add_to_cart` / pixel `AddToCart` | 1418–1419, first gender pick, once per load | 2103–2112 in `updatePricing()`, once a priced ticket is concrete (i.e. gender chosen) | 2533–2534, first gender pick per event id |
| `add_payment_info` / `AddPaymentInfo` | 1497–1498, after `createPaymentMethod` succeeds | 2511 / 2523 | 2783 / 2791 |
| `checkout_3ds_required` / `_completed` | 1512 / 1518 | 2592 / 2603, unguarded | 2826 / 2832 |
| `purchase` / pixel `Purchase` | 1523 / 1528, gated `!result.duplicate \|\| authed` | 2728 / 2748, same gate, unguarded | 2852 / 2863, same gate |
| `checkout_error` | 1550 `{category, reason, source:lp}` | 2833 `{category, reason, source:event}`, unguarded | 2906 `{category, reason}` — **no `source`** |
| in-app browser | `in_app_browser_detected`, `_escape_attempt`, `_copy_link{source:lp_checkout}` | same with `source:event` | same with `source:events` |
| page-level | `lp_visible{started_hidden}` (53); config `page_started_hidden` (37) — **`/lp` only** | — | — |
| server-side (all three) | `api/stripe-webhook.js:242` sends pixel `Purchase` via CAPI on `payment_intent.succeeded`, `eventId` = PaymentIntent id (deduped with the browser copy); `api/lead-signup.js` sends `Lead`. **No GA4 Measurement Protocol anywhere.** `lib/meta-capi.js:85` skips silently when `META_CAPI_ACCESS_TOKEN` is unset. |

Notes the map surfaced, none of which explains the last three days:

- `event.html:95` is the only `window.gtag` no-op shim in the repo; several
  of that page's checkout calls are unguarded and depend on it. `lp.html`,
  `events.html`, `account.html` and `signup.html` have unguarded or
  differently-guarded calls and no shim (`account.html:1100` `purchase`,
  `signup.html:1384` `sign_up`).
- `events.html:2402` sends `checkout_form_started` with no parameters and
  `events.html:2906` sends `checkout_error` without `source`, so those two
  cannot be told apart from the other surfaces once the dimensions are
  registered.
- Four event parameters are still unregistered as custom dimensions and read
  `(not set)`: `field`, `skipped_details`, `page_started_hidden`,
  `started_hidden` (HANDOFF, Taylor's GA4 Admin item). `category`, `reason`,
  `in_app_browser` are registered.
- `checkin.html` has the pixel and no GA4; `404.html` has neither; `admin.html`
  has GA4 and no events.

---

## NOT VERIFIED

- **Firestore ticket truth.** No `FIREBASE_*` credentials in this session.
  The two independent zero readings above are own-site (Stripe) only; Eventbrite
  sales are invisible to both by construction (`ANALYTICS_METHOD.md` §7). One
  data point suggests something *did* sell outside Stripe:
  `META_ADS_ROOT_CAUSE_2026-09-04.md` (committed 09-04 21:45) has Marion Court
  at 11 paid tickets / $282.18 and `ADS_OBJECTIVE_GAP_ANALYSIS_2026-09-06.md`
  (committed 09-06 19:33) has 13 / $325.30 — two more tickets for $43.12,
  i.e. **$21.56 each**, not the own-site $27.49 ($24.99 + $2.50 fee) every GA4
  transaction shows. **This document's first draft explained that as
  Eventbrite's net-of-fee amount — that mechanism is wrong and has been
  removed.** `scripts/sync-eventbrite.js` and `lib/enroll.js` store an
  Eventbrite ticket's `amount` as Eventbrite's **gross face-value price**;
  the actual fee is kept in a separate `ebFeeCents` field that is never
  subtracted from `amount` anywhere in this codebase, and both cited reports
  state they sum raw `amount` — the 09-04 report says outright its figure is
  "before... Eventbrite fees." Two Eventbrite tickets at Marion Court's
  $24.99 gross price would add $49.98, not $43.12 — the fee-netting theory
  doesn't even hit the target number. A better-fitting, still-unconfirmed
  guess: Marion Court's Eventbrite listing also sells a cheaper "Bring a
  Friend" tier (`content/listing-sites.json`), which would explain a
  sub-$24.99 average without inventing fee arithmetic the code doesn't do.
  Either way, **the two tickets are not Stripe** — own-site purchases are
  independently confirmed at zero for this window — but which non-Stripe
  channel, and at what actual per-ticket price, is not resolved. **The check:
  the two newest Marion Court ticket docs' `source` and `ticketTier` fields**
  (Firestore access, or the admin dashboard). If either turns out to be a
  Stripe purchase after all, both the client `purchase` event and the
  webhook's CAPI `Purchase` missed it, which would reopen this review.
- **Pixel `AddToCart` by host.** The `/stats` edge cannot cross `event ×
  host`; the localhost explanation is consistent, not measured — and its
  ratio to GA4's count is disproportionately larger than sibling events (see
  MECHANISM), which no available tool can resolve further.
- **126–250 pixel events a day arrive as `SERVER`-sourced**
  (`aggregation=event_source`: 153 / 251 / **126** / 143 / 128 for 09-02 → 09-06
  — the range is 126–251, not the 137 floor an earlier draft of this document
  quoted from the wrong column) while this repo's CAPI code sends only
  `Purchase` and `Lead`, and the pixel shows ≤ 2 `Lead` and 0 `Purchase` a day
  in that window — nowhere near enough to account for it. Something else is
  posting server events to this pixel; a repo-wide search for every
  `graph.facebook.com` call confirms `lib/meta-capi.js` is the only code that
  posts to the events endpoint at all. Events Manager → the pixel → *Event
  source* would name it (Eventbrite's own Meta integration is one plausible
  candidate, unconfirmed). Not chased here; it does not affect the GA4
  findings.
- **About 42 landing sessions carry their query string twice**
  (`/lp?eventId=KL4…&fbclid=…?eventId=KL4…&fbclid=…`), and those sessions bounce
  far *less* (weighted ~33% across all 42; the two largest rows run 23% and
  44%) than the plain in-app rows (60–92%). **This document's first draft
  guessed the Android in-app-browser escape code re-appends the query —
  that's wrong and has been dropped.** That code is hard-gated to Android
  user agents in all three files, but roughly 70% of the 42 doubled sessions
  are iOS or desktop, where it cannot run; and the doubling shows up in GA4
  as far back as 08-01, two weeks before the escape code even existed
  (deployed 08-13, PR #165). Nearly every doubled session carries `fbclid`,
  and several show `pageReferrer=https://l.facebook.com/` — Facebook's own
  link-shim domain — which points at something in Facebook's own link-click
  or redirect handling, upstream of this site, rather than at our code. Not
  confirmed either way. `event.html:1444–1452` already recovers the id from
  this shape regardless of cause.
- **The `Instagram / paid_social` 93% bounce** cannot be split into ghost
  pre-loads versus humans until `page_started_hidden` is registered.
- ~~Mobile and webview behaviour of the gender buttons~~ — **resolved.** The
  live test was desktop-only, but overnight reprocessing surfaced a genuine
  `add_to_cart` from mobile Safari inside Facebook's in-app browser on 09-06
  (see EVIDENCE — the checkout funnel, "Update, on reprocessing"). The path
  works on mobile webview.
- **09-06 itself.** Sessions, engagement and events for 09-06 were still
  being processed at pull time. Every 09-06 figure here is a floor. Confirmed
  still true on re-check at 03:06 ET 09-07 (0 of 38 sessions engaged, three-
  plus hours after the day ended) — don't trust a same-morning look either.
- **Whether `META_CAPI_ACCESS_TOKEN` is actually configured on the live
  Vercel deployment.** Neither this session nor its verification pass could
  reach Vercel's project settings to check directly. This is the one
  remaining unknown behind treating the pixel's server-side `Purchase` as
  independent corroboration — though GA4's own client-side `purchase` (which
  doesn't depend on CAPI at all) already establishes the zero-purchases
  headline on its own.

---

## DECISION — what to do with this

Nothing here needs a deploy tonight. In priority order:

1. **Confirm the Firestore side** (Taylor, admin dashboard or Firestore, two
   minutes): the last two Marion Court tickets' `source`/`ticketTier` — any
   Eventbrite tier (including the cheaper "Bring a Friend" one) closes this
   review; Stripe reopens it as a purchase-event bug on both systems.
2. **Register the four custom dimensions** (Taylor, GA4 Admin → Custom
   definitions, already on HANDOFF): `page_started_hidden` is now the single
   split that would tell the 93%-bounce Instagram cohort's ghosts from its
   humans, and `field` would show which field the one human touched.
3. **Fire a not-found event on `/event`** — `event.html` `loadEvent()` before
   `window.location.replace('/events')` (~line 1501):
   `gtag('event','targeted_event_not_found',{source:'event',target_event_id:eventId})`,
   mirroring `lp.html:1128`. The 09-03 blast turned out to be an automated
   scanner, not a dead link (MECHANISM above), but the gap is still real:
   without this, the next burst of scanner traffic to a bad id on `/event`
   will read as an unexplained bounce spike again. One line, no behaviour
   change.
4. **Exclude Meta's crawler from analysis, as a standing filter, not a
   one-off.** It has now hit GA4 on at least two separate campaign-build days
   (08-29/08-30 and 09-05, both times within an hour of a campaign or ad
   being created via the Meta API) — this will recur every time an ad is
   created or edited. Two ways: (a) now, in `scripts/ga4-nightly-summary.js`,
   print sessions from the data-centre city list (Prineville, Luleå, Forest
   City, Gallatin, Fort Worth, Altoona, Dublin, Springfield NE, plus
   Ashburn/Clonee/Odense/Papillion/New Albany/Eagle Mountain/Huntsville/Los
   Lunas) as a separate line and subtract them from the engagement rate; (b)
   longer-term, stamp a session-level `is_bot` parameter from
   `navigator.webdriver` / the `facebookexternalhit` and `meta-externalagent`
   user agents so it becomes a filterable dimension. GA4 has no city-level
   data filter, so (a) is the only immediate option.
5. **Re-baseline the two form ratios** in HANDOFF's watch signal: keep
   `add_payment_info ÷ begin_checkout` as the primary (its meaning survived the
   09-03 rebuild) and treat `add_to_cart ÷ begin_checkout` as a different
   instrument since 09-03, because `/lp` and `/event` now fire `begin_checkout`
   at a lower-intent moment than the old dialog did.
6. **Split the HANDOFF thread "pixel records more checkouts than carts" by
   host before anything else.** The 316 localhost/`invalid.invalid` fires in
   five days are the first place to look, and the code paths that fire
   `InitiateCheckout` without `AddToCart` (form open vs gender pick) are the
   second — that ordering is by design on all three surfaces.
7. **Two two-minute checks, neither this session could reach:** whether
   `META_CAPI_ACCESS_TOKEN` is actually set on the live Vercel deployment
   (Vercel project settings — this is the one load-bearing unknown behind
   treating pixel `Purchase` as independent of GA4, though GA4's own zero
   already stands on its own); and whether the two `/l/lx-lancasteronline` /
   `/l/mc-lancasteronline` short links have actually been pasted into the
   live Evvnt listings yet — HANDOFF records this as Taylor's pending action,
   and no `lancasteronline / listing` session has appeared in GA4 through
   09-06 either way.
8. **Park, not fix:** the doubled-query landing rows; the `SERVER`-sourced
   pixel events (check Events Manager once); the `events.html` param gaps
   (`checkout_form_started` with no params at 2402, `checkout_error` without
   `source` at 2906) — worth folding into the next parity pass, not a PR of
   their own.

What this review does **not** conclude: that the rebuilt form is worse. Five
days, thirty-seven low-intent opens and a T-3 event whose paid traffic is 93%
five-second Instagram sessions is not a test of the form. It is a test of the
traffic. The number to watch this week is `add_payment_info`, and the first
one that fires will say more than this document does.

---

## Method notes

- Every GA4 figure is from `runReport` on property 536859339 at 2026-09-06
  22:00 ET, `dateRanges` as stated per table, no sampling reported. Event
  tables were pulled unfiltered for 09-02 → 09-06 and 08-24 → 09-01 to make sure
  no renamed or unexpected event was hiding (none was; 22 and 28 distinct
  names respectively).
- Pixel figures are `GET /v21.0/4390442851170732/stats` with
  `aggregation=event|host|event_source`, `start_time` 2026-08-24 04:00 UTC,
  bucketed into US-Eastern days.
- The 02:00 nightly's files were read only to show what they said before
  processing caught up; they were not modified or re-pulled.
- Line numbers cite the worktree copy of `origin/main` at `e94c5b20`.
- Bounce rate is GA4's definition (1 − engagement rate; a session is engaged
  at ≥ 10 s, ≥ 2 page views, or a key event). `ANALYTICS_METHOD.md` §6
  warns engagement is unreliable inside webviews; this review therefore leans on
  event counts for every claim about the checkout itself and uses bounce only to
  answer the question that was asked about it.
- **Property timezone.** `scripts/fetch-ga4-tables.js` and this review both
  assume America/New_York; a live `runReport` call separately reports
  `metadata.timeZone` as the fixed offset `Etc/GMT+4`. In September (EDT)
  these are the same offset, so every hour-level claim above (the 10:48 ET
  scanner cluster, the 12:00/14:00 ET crawler hours) is internally
  consistent — but the two labels aren't the same *kind* of thing, and would
  diverge across a DST boundary. Worth a single GA4 property-settings check
  if an hour-precise claim is ever made across a DST change.
- **Verification.** Every finding went through two independent adversarial
  passes (re-derive the evidence against fresh live pulls; hunt for a better
  explanation) before this document was finalized. Two findings changed
  substantively as a result — both are folded into the text above, not kept
  as a separate errata list. The workflow's full verdicts and evidence trail
  are not part of this repo; ask if you want the raw transcript.
