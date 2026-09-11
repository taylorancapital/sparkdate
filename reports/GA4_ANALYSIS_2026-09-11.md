# GA4 + Meta nightly review — 2026-09-11

This run made ZERO code changes. Per ANALYTICS_METHOD.md §1, the last two
dates in every daily series (20260909, 20260910) are dropped as not-yet-final;
all "closed week" figures below use two disjoint 7-day buckets, never a
rolling window. Data provenance: GA4 window `20260519-20260911`, pulled
**2026-09-11 06:00 UTC** (property 536859339, dates in America/New_York);
Meta campaign insights for **2026-09-04 to 2026-09-10**, pulled 2026-09-11
02:00 local. `ANALYTICS_CONTEXT.md` states "Last updated: 2026-08-26"; its
file mtime is **2026-08-28 18:25** — later than the stamp, meaning it was
edited without the stamp being bumped. Same one-sentence note carried
unchanged for several nights now (the mtime itself hasn't moved since); not
re-escalating, per this prompt's standing instruction not to treat "newer
than the newest nightly report" as evidence, since that condition is always
true by construction.

Unattended run: `scripts/ga4-nightly-summary.js` executed cleanly against all
46 tables; no fallback to hand-parsing was needed. Everything below the
standing summary — the cross-pull event diffs, the Meta pixel corroboration,
the commit-history correlation — was derived by hand from the individual
CSVs and `git log`, because the standing summary computes window totals and
does not diff consecutive nightly pulls against each other.

## HEADLINE — GA4 and Meta's own pixel agree: zero purchases have completed anywhere on the site in at least 8 days, while checkout-starts kept climbing and ad spend kept flowing to the pages where they climbed fastest

**The plain finding.** No GA4 transaction and no Meta purchase-pixel event has
fired since **2026-09-01**. That is not a slow week — it is a complete stop,
on every landing page, every channel, for nine consecutive nights of pulls,
while the funnel steps that lead up to a purchase kept growing. This is a
different kind of finding than "conversion is down": it is "the last step of
the funnel produced a flat line for over a week while every step before it
grew," and it lines up almost to the hour with the commit that rebuilt the
checkout.

**Five independent pieces of evidence, cross-checked against each other:**

1. **`ga4-api-transactions-2026-09-11.csv` — the transaction ledger itself.**
   Sorting every transaction date in the 20260519–20260911 window: the
   maximum date is **20260901**. Zero rows exist for 20260902 through
   20260909 (20260910 is the excluded non-final tail). Two transactions
   landed on 09-01 itself (`pi_3UAspoRsTCYDr2LL1PSccXsa`,
   `pi_3UAxgVRsTCYDr2LL09rl5qU2`, $27.49 each) — nothing after.
2. **`ga4-api-revenue-daily-2026-09-11.csv`.** Rows for 20260907, 20260908,
   20260909 each explicitly read `0, 0` (revenue, transactions); 20260902
   through 20260906 don't even appear as rows, because the underlying report
   omits days with zero of every tracked metric — meaning those five days
   recorded neither a transaction nor any other key event.
3. **Cumulative event counts, diffed across nine consecutive nightly pulls**
   (`ga4-api-events-2026-09-01.csv` through `...-2026-09-11.csv`, each a
   window-to-date total, so subtracting consecutive pulls gives that pull
   period's real delta):

   | event | 09-01 pull | 09-02 pull | 09-04 | 09-05 | 09-06 | 09-07 | 09-08 | 09-09 | 09-11 |
   | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
   | `begin_checkout` | 218 | 227 | 243 | 254 | 263 | 267 | 273 | 278 | 284 |
   | `checkout_field_started` | — | — | 2 | 2 | 30 | 35 | 40 | 44 | 49 |
   | `add_payment_info` | 8 | 10 | 10 | 10 | 10 | 10 | 10 | 10 | 10 |
   | `checkout_error` | 25 | 28 | 28 | 28 | 28 | 28 | 28 | 28 | 28 |
   | `purchase` | 37 | 39 | 39 | 39 | 39 | 39 | 39 | 39 | 39 |

   Read the columns, not just the headline row: from the **09-02 pull
   onward**, `begin_checkout` gained **57 more users** and
   `checkout_field_started` gained **49** (from a standing start — it's a
   2026-09-03 event, ANALYTICS_METHOD §10), while `add_payment_info`,
   `checkout_error`, and `purchase` did not move **at all** — not up for a
   success, not up for a decline. Whatever happens after someone starts
   filling in the checkout form is producing neither outcome GA4 knows how to
   record.
4. **`ga4-api-funnel-checkout-by-landing-page-*.csv`, the chain-count funnel,
   diffed the same way.** Comparing the 09-02 pull to the 09-09 pull: the
   `session_start` step rose 3550→4111 (+561), the `begin_checkout` step rose
   153→202 (+49, concentrated on `/lp` 78→102 and especially `/event`
   25→48 — **+92%** on the one page the checkout rebuild targeted first) —
   and the `purchase` step's `RESERVED_TOTAL` and every one of its six
   per-page rows are **byte-identical** across the two pulls: `/` 7, `/lp` 7,
   `/event` 3, `/events` 3, `/account` 1, `/admin` 1. Forty-nine more people
   started checkout in that week; not one of them shows up as a completed
   chain on any page.
5. **Meta's own pixel — a completely independent tracking system, on a
   different company's servers — tells the same story.** Every
   `meta-insights-*.csv` pull whose 7-day window starts on or after
   **20260828** (i.e. 09-03, 09-04, 09-05, 09-07, 09-09, 09-10 — six
   consecutive pulls) records **zero** `purchase` or
   `offsite_conversion.fb_pixel_purchase` actions across every campaign,
   while `initiate_checkout`-family actions are present and rising (Meta
   pixel: 6 action-line mentions in the 08-28→09-03 pull, 54 in the
   09-04→09-10 pull — not a clean count, since several action-type aliases
   fire per checkout start, but the direction is unambiguous). The last pull
   with any `purchase` action recorded is `meta-insights-2026-09-01.csv`
   (window 20260826–20260901) — the same boundary date the GA4 transaction
   ledger shows.

**Timing: this starts at the commit that rebuilt the checkout, and survives
a large follow-up fix.** `c600dce7` (#419, "Paid path: sell on /lp, rebuild
the checkout's first screen, open the 2-for-1 to every buyer") merged
**2026-09-02 21:40 local** — hours before the freeze becomes visible in the
data — and rewrote the first screen of all three checkout surfaces (`lp.html`
inline checkout, `event.html`, `events.html`). This is the same change
ANALYTICS_METHOD §10 dates to 2026-09-03. Four days later, `6877cf67` (#456,
"The half of the #453 audit that shipped unread, including a double
charge") landed a large parity audit against the same three files and found
serious, confirmed defects: a re-entrancy bug where tapping a gender button
mid-submit could **charge a guest twice** and take a second seat from
inventory; a bug where a blocked/failed `js.stripe.com` load threw a
`ReferenceError` at module scope and silently crashed the whole checkout
behind a button that still looked live and priced; swallowed server error
messages (a sold-out 409 fell through to a generic "contact support" message
logged as `checkout_error` category `other`); and several more. **That
commit's own closeout says, in its own words: "no purchase was completed end
to end"** during its verification pass. GA4 and Meta data through
09-09/09-10 — three to four days after #456 shipped — still show zero
purchases and zero `add_payment_info`. Whatever #456 fixed, it has not
visibly restored a completed sale.

**Ad spend did not pause for this.** Meta spent **$132.53** in the rolling
week ending 09-10 (Marion Court and Loxleys campaigns, current-state
snapshot per ANALYTICS_METHOD §9 — not a week-over-week comparison) driving
traffic straight at `/lp` and `/event`, the two pages where begin_checkout
growth was concentrated. Every dollar of that is buying a checkout start with
nowhere confirmed to land.

**This also invalidates reading Eventbrite's channel row as evidence
anything is fine.** `eventbrite / listing` revenue in GA4 is NOT a ticket
sold through Eventbrite's own checkout (ANALYTICS_METHOD §7 — Eventbrite
fires no analytics of its own); it is someone who clicked through from an
Eventbrite *listing page* and then bought on **our own** Stripe checkout. So
Eventbrite-attributed GA4 revenue depends on exactly the same broken
own-site checkout as every other channel. The freeze is checkout-wide, not
channel-specific — consistent with every landing page's purchase-chain count
being frozen identically (finding 4 above), not just the paid-social ones.

**What this is NOT yet confirmed to be, and why I can't confirm it further
tonight.** There are two possibilities this data cannot distinguish: (a) real
money has stopped changing hands — a genuine, ongoing revenue-losing bug — or
(b) purchases are still completing but the client-side event pipeline that
reports them broke. The fact that **both** the success signal
(`add_payment_info`, which fires client-side once Stripe accepts the card,
*before* server confirmation) and the failure signal (`checkout_error`) are
frozen, not just `purchase`, argues against a narrow "the purchase event
alone stopped firing" theory and toward something upstream of card
submission — but this is a hypothesis, not a confirmed mechanism. I have no
way to resolve it further tonight: `mcp__claude_ai_Windsor_ai__get_connectors`
returns only a `tiktok` account (no Stripe, no Meta/Facebook — confirmed
again, unchanged from the last several reports), this is a report-only
unattended run with no browser access, and deliberately running a real
purchase against production payment infrastructure is not something to do
without authorization. **See NEEDS TAYLOR INPUT #1 — this needs a human to
run one test purchase (or check the Stripe/admin dashboard for any charge
dated 09-02 or later) this week, not after the next nightly pull.**

## TRAFFIC — standing section

| metric | recent 7d (09/02–09/08) | prior 7d (08/26–09/01) | change |
| --- | ---: | ---: | ---: |
| sessions | 636 | 1077 | -41% |
| engaged sessions | 274 | 379 | -28% |
| engagement rate | 43.1% | 35.2% | +7.9pp |
| users | 614 | 1010 | -39% |
| new users | 565 | 923 | -39% |
| purchasers | 0 | 7 | -100% |
| key events | 5 | 19 | -74% |
| transactions | 0 | 7 | -100% |
| own-site revenue | $0.00 | $197.43 | -100% |

The purchaser/transaction/revenue rows are the HEADLINE finding restated at
closed-week granularity — see above for the full evidence chain; this table
is what finally makes it a *closed-week* fact rather than a "the raw tail
looks bad" caveat, since both 09-02 and 09-08 are now fully closed days.
Sessions and users are down 39–41% week over week, but note the engagement
*rate* rose (35.2%→43.1%) even as raw volume fell — the drop in sessions is
not a quality collapse, and per last night's report the Sun/Mon (09-06/07)
portion of this decline had already reversed in the raw tail by Tuesday
(09-08: 97 sessions) before this week's bucket even closed. Own-site revenue
is a floor, not total revenue (ANALYTICS_METHOD §7); ~55% of real ticket
revenue runs through Eventbrite/Meetup and is invisible here regardless.

### Channels (window-wide, 20260519–20260911)

| channel group | sessions | users | key events | conv rate | revenue |
| --- | ---: | ---: | ---: | ---: | ---: |
| Paid Social | 3211 | 2916 | 29 | 0.9% | $179.94 |
| Direct | 884 | 516 | 25 | 2.8% | $169.94 |
| Unassigned | 648 | 213 | 66 | 10.2% | $345.37 |
| Email | 395 | 218 | 26 | 6.6% | $125.45 |
| Organic Social | 237 | 188 | 10 | 4.2% | $130.46 |
| Organic Search | 153 | 93 | 7 | 4.6% | $82.47 |
| Paid Other | 119 | 111 | 63 | 52.9% | $0.00 |
| Referral | 77 | 16 | 5 | 6.5% | $0.00 |
| Cross-network | 15 | 15 | 6 | 40.0% | $27.49 |
| Paid Search | 9 | 9 | 0 | 0.0% | $0.00 |
| AI Assistant | 1 | 1 | 0 | 0.0% | $0.00 |

Paid Social is 45% of window-wide sessions and converts worst of any channel
with real volume (0.9%); Unassigned (mostly Eventbrite-listing referrals,
which as noted above still depend on our own checkout) is 9% of sessions and
30% of revenue. **Paid Other's 52.9% conversion is $0 revenue** — its 63 "key
events" are almost entirely `ads_conversion_About_Us_1` (ANALYTICS_METHOD §8,
a landing-page-view pseudo-event on `/lp?utm_source=googleads`, not a real
conversion, and Google Ads has been dark since 07-24 — ANALYTICS_CONTEXT
§3b, settled). Do not read that row as healthy.

### Top 15 sources (window-wide)

| source / medium | sessions | users | key events | conv rate | revenue |
| --- | ---: | ---: | ---: | ---: | ---: |
| Facebook / paid_social | 1625 | 1496 | 15 | 0.9% | $97.47 |
| (direct) / (none) | 884 | 516 | 25 | 2.8% | $169.94 |
| Instagram / paid_social | 636 | 566 | 6 | 0.9% | $82.47 |
| facebook / paid_social | 435 | 390 | 5 | 1.1% | $0.00 |
| fb / paid_social | 276 | 268 | 2 | 0.7% | $0.00 |
| ig / paid_social | 190 | 177 | 1 | 0.5% | $0.00 |
| eventbrite / listing | 176 | 82 | 23 | 13.1% | $290.39 |
| lp / (not set) | 168 | 21 | 1 | 0.6% | $0.00 |
| google / organic | 140 | 84 | 6 | 4.3% | $82.47 |
| Ybadbfgfe \| Zbfgfe Yvfg / email | 129 | 129 | 0 | 0.0% | $0.00 |
| email / email | 117 | 12 | 6 | 5.1% | $48.98 |
| m.facebook.com / referral | 64 | 64 | 0 | 0.0% | $0.00 |
| facebook / social | 61 | 39 | 3 | 4.9% | $47.99 |
| get_tickets_block / (not set) | 61 | 6 | 1 | 1.6% | $27.49 |
| resend.com / referral | 57 | 2 | 4 | 7.0% | $0.00 |

Eventbrite is the standout again: 5% of Facebook's raw volume, 13.1%
conversion — roughly 15x Facebook's own rate — even though (per the HEADLINE)
its conversions ultimately run through the same frozen checkout as
everything else, meaning this row's historical strength is exactly what has
gone to zero this week. Facebook/Instagram variants dominate raw volume but
convert under 1.1% everywhere they appear (see UTM section — summing all
casing variants doesn't materially change the rate).

### Device

| device | sessions | engaged | key events | conv rate | revenue |
| --- | ---: | ---: | ---: | ---: | ---: |
| mobile | 4321 | 1718 | 114 | 2.6% | $904.17 |
| desktop | 1427 | 895 | 123 | 8.6% | $156.95 |
| tablet | 19 | 4 | 0 | 0.0% | $0.00 |

Desktop converts more than 3x better than mobile on a third the sessions —
unchanged from every prior report. This gap predates and is unrelated to the
checkout freeze (both device rows include the same frozen week).

### Geography

| city | region | sessions | users | key events | revenue |
| --- | --- | ---: | ---: | ---: | ---: |
| Philadelphia | Pennsylvania | 937 | 804 | 16 | $114.96 |
| West Chester | Pennsylvania | 424 | 53 | 19 | $82.47 |
| Lancaster | Pennsylvania | 271 | 208 | 18 | $136.45 |
| New York | New York | 198 | 174 | 1 | $0.00 |
| (not set) | (not set) | 178 | 157 | 83 | $0.00 |
| Exton | Pennsylvania | 157 | 7 | 10 | $0.00 |
| (not set) | Pennsylvania | 146 | 119 | 3 | $54.98 |
| Prineville | Oregon | 111 | 111 | 0 | $0.00 |
| Harrisburg | Pennsylvania | 88 | 69 | 2 | $27.49 |
| Ashburn | Virginia | 78 | 26 | 6 | $27.49 |

**Suspect geography bucket, unchanged mechanism:** `(not set)`/continentId
`ZZ` is 118 sessions with an inverted **69.5%** key-event rate against **2.8%**
property-wide excluding it — consistent with the datacenter/bot traffic
ANALYTICS_CONTEXT documents as an ~8–12% denominator inflation on active-user
counts (Prineville OR and Ashburn VA above are both known Meta/hyperscale
datacenter towns per that file). No IP/user-agent check was run tonight to
confirm; carried forward as a caveat, not a verdict.

### New vs returning

| cohort | sessions | users | key events | revenue | revenue / user |
| --- | ---: | ---: | ---: | ---: | ---: |
| new | 4167 | 4175 | 168 | $651.76 | $0.16 |
| returning | 1337 | 250 | 69 | $409.36 | $1.64 |

Returning users are 6% of users but convert to revenue at ~10x the per-user
rate of new users — expected for a low-frequency event-ticket product, not a
new finding, and both cohorts' revenue totals are window-wide so this is not
affected by the current-week freeze specifically.

### When traffic arrives, and when it converts (window-wide, by hour)

Traffic peaks Thursday 10:00 (158 sessions) and Saturday 19:00 (122), but key
events cluster hardest on **Tuesday** across three different hours (12:00→23
key events, 11:00→13, 14:00→11) — 47 of the top-8 converting hour-slots'
key events land on a single weekday. This is a window-wide pattern that
predates the freeze; it's worth keeping in mind for *when* checkout gets
re-verified (Tuesday traffic is disproportionately the traffic that used to
convert).

## EVENTS — standing section

35 distinct events fired window-wide. **Only 3 are configured as GA4 key
events**: `ads_conversion_About_Us_1` (99 events, $0 — a landing-page view on
`/lp?utm_source=googleads`, not an About Us visit, per ANALYTICS_METHOD §8,
and dark since Google Ads went dark 07-24), `generate_lead` (99, $98 nominal
value, $0 revenue), and `purchase` (39, $1,061.12 — the only one that's real
money, frozen since 09-01 per the HEADLINE).

Four events carry a dollar VALUE but are counted as **zero** key events —
funnel steps, not conversions, by GA4's own configuration:

| event | key events | event value |
| --- | ---: | ---: |
| view_item | 0 | $17,424.08 |
| begin_checkout | 0 | $4,436.30 |
| add_to_cart | 0 | $2,578.98 |
| add_payment_info | 0 | $284.90 |

**What moved this week, isolated by diffing the 09-01 and 09-08 cumulative
pulls (7 days, 09-02 through 09-08):** `generate_lead` rose 93→98 (+5 — this
IS the recent week's entire "5 key events" figure in the TRAFFIC table, since
`purchase` and `ads_conversion_About_Us_1` both held flat over the same
span); `view_item` value rose ~$15,130→$16,804 (checkout-adjacent browsing
kept happening); `begin_checkout`, `checkout_field_started` climbed sharply
(see HEADLINE table). So this week's only completions of any kind were 5
newsletter/waitlist-type leads — zero purchases, and (per the HEADLINE)
zero `add_payment_info` and zero `checkout_error` either.

`lp_visible` (330 events, 289 users) and `checkout_field_started` (49
events, 23 users) are both 2026-09-03 paid-funnel-fix instrumentation
(ANALYTICS_METHOD §10) — their raw volumes are consistent with `/lp`'s
session share, but per the HEADLINE, `checkout_field_started`'s *growth this
specific week* (2→49 events since it was introduced) is exactly the signal
that something is starting and not finishing.

### Which channels produce which key events (top of the table)

`ads_conversion_About_Us_1` is overwhelmingly `googleads` rows (51+16+16+11
= 94 of its 99 total) — all pseudo-conversions per §8, from a channel dark
since 2026-07-24 (ANALYTICS_CONTEXT §3b, settled). Real `generate_lead`
credit is spread thin: `(direct)` leads (19), `Facebook / paid_social` (12),
`eventbrite / listing` (12). Real `purchase` credit — window-wide, since
none of it is from this week — is led by `eventbrite / listing` (11
purchases, $290.39) and `(direct)` (6, $169.94).

## UTM AND TAGGING GAPS — standing section, ranked by LIVE sessions affected

**LIVE** = fired a session in the last closed week (from 20260902); **stale**
= last four closed weeks; **DEAD** = older. Ranked below by each cluster's
own LIVE-session total, computed from the per-row status the script assigns
(a defect can appear in more than one cluster — e.g. `lp / (not set)` is
both a `lp` casing/format variant AND an internal-link tagging issue — so
LIVE totals across clusters are not additive; I've flagged the one
overlap below rather than double-count it in a single grand total).

1. **`facebook` fragmented across 11 row variants, 6 LIVE, ~2019 LIVE
   sessions (2580 combined window-wide), 31 key events, $200.44.** Live:
   `Facebook / paid_social` (1625, last seen 20260909), `fb / paid_social`
   (276, 20260910), `m.facebook.com / referral` (64, 20260905),
   `facebook.com / referral` (38, 20260907), `Facebook / social` (10,
   20260908), `l.facebook.com / referral` (6, 20260910). Dead/stale:
   `facebook / paid_social` lowercase (435, DEAD, 20260811), `facebook /
   social` lowercase (61, stale, 20260818), `Facebook / paid` (26, DEAD,
   20260609), `eventsmanager.facebook.com / referral` (20, stale, 20260812),
   `Facebook / organic` (19, stale, 20260819). **Fix, unchanged across at
   least five reports now:** normalize source/medium casing and the
   `fb`/`m.facebook.com` variants at the point they're written (ad
   destination URLs, internal referral handling). Not yet applied. Who:
   engineering — this touches however the ad platform and referral handling
   write these values, not a single call site, so it's described, not
   scoped to a one-line fix.
2. **`instagram` split across 2 rows, both LIVE, 826 sessions, 7 key events,
   $82.47**: `Instagram / paid_social` (636, 20260908) vs `ig / paid_social`
   (190, 20260910). One canonical casing needed. Who: engineering, same
   mechanism as #1.
3. **Own-site internal-link tagging — 263 LIVE sessions currently, 298
   total window-wide.** `lp / (not set)` (168, LIVE 20260909 — overlaps with
   item 4 below, same row, not double-counted in any total elsewhere in this
   report), `get_tickets_block / (not set)` (61, LIVE 20260904, $27.49
   attributed away from its real source), `matches / (not set)` (34, LIVE
   20260908, $27.49). The rest (`matches / web` 26, `lp / (none)` 3, `lp /
   paid_social` 3, `matches / (none)` 2, `sticky_ticket_bar / (not set)` 1)
   are stale/dead. **Fix, unchanged across multiple reports, and the
   single clearest one-line item in this whole worklist:** strip
   `utm_source`/`utm_medium` from the `get_tickets_block` element and the
   internal `/matches` links. Who: engineering, one call site each. See
   Zero-risk fixes below.
4. **`lp` fragmented across 3 rows, 1 LIVE, 168 LIVE sessions (174
   combined)** — same row as item 3's `lp / (not set)`. `lp / (none)` (3,
   stale, 20260816) and `lp / paid_social` (3, stale, 20260822) are the
   other two. Same normalization fix as #1/#2 would resolve the casing/none
   variants; the internal-tagging half is #3's fix.
5. **`google` fragmented across 3 rows, 1 LIVE, 140 LIVE sessions (152
   combined), 11 key events, $109.96**: `google / organic` (140, LIVE
   20260910) is the live, healthy row; `google / cpc` (11, stale, 20260825)
   and `Google / (not set)` (1, DEAD, 20260724) are historical residue from
   the Google Ads account (dark since 07-24, settled).
6. **`email` fragmented across 6 rows, 2 LIVE, 70 LIVE sessions (262
   combined, $125.45, 26 key events combined)**: `email / newsletter` (49,
   LIVE 20260910) and `email / returning` (21, LIVE 20260909). `email /
   email` (117, stale, last 20260826) is the largest row by volume but
   hasn't fired in two weeks; `email / nurture` (53, stale, last 20260831).
   Who: whoever configures the ESP's UTM presets (a mail-platform settings
   fix, not application code) — Taylor's call on which medium label is
   canonical, since these look like inconsistent campaign setup rather than
   a code bug.
7. **`googleads` fragmented across 5 rows, 0 LIVE, 127 sessions window-wide,
   94 key events** (all `ads_conversion_About_Us_1`, not real conversions
   per §8) — every row DEAD, oldest since 20260803, all from an account dark
   since 2026-07-24 (settled, ANALYTICS_CONTEXT §3b). Pure historical
   residue; no action needed.
8. **Broken/placeholder values — 50 LIVE sessions across three rows.**
   `traffic-by-source` value `(not set)` (36 sessions, 0 key events, LIVE
   20260910); `(data not available)` (13, 1 key event, LIVE 20260910 — a
   genuine GA4 attribution-loss signature, commonly consent-mode/ITP session
   stitching failure, too small to chase further); `lp /` (1, LIVE 20260910
   — a malformed internal tag, likely a trailing-slash typo somewhere in an
   href, up from earlier reports' count of this same defect). The
   `<campaign-name>` literal template placeholder (2 rows, ~69 sessions, 41
   key events window-wide) and bare `undefined` (36 sessions) are both DEAD
   — last seen 20260803 and no live ad carries either string; not
   re-flagged as an action item, just carried for the historical record.
9. **Obfuscated tag, 129 sessions on the ciphertext row, plaintext twin at 9
   (window-wide; real combined total ≈138).** `Ybadbfgfe | Zbfgfe Yvfg /
   email` decodes (a–f shift +1, g–z ROT13) to `Lancaster | Master List /
   email`. Same LancasterOnline/Evvnt mechanism a prior report traced and
   partially fixed (#461); this cluster carries no LIVE/DEAD status from
   the script (it's a single decode, not a fragmentation family), so
   treat the 129+9 as ongoing until it stops appearing in a fresh pull.
10. **`utm_content` shared across campaigns** (violates `content/brand.json`
    uniqueness): `proof_rsa1` spans 7 campaigns, `Tellus+AfterDark:...`
    spans 2, `mc_figlancaster` spans 2 — all confirmed confined to
    paused/historical ads. Tonight's Paid Ad UTMs refresh (unattended run
    log, 02:01 local) explicitly lists **7 ACTIVE ads, all with distinct
    utm_content** (`lx_rt_patio`, `lx_convert_female_showup`,
    `lx_convert_male_noplan`, `mc_rt_scorecards`, `mc_rt_quang`,
    `mc_rt_still_thinking`, `mc_close_female_bringafriend`) and logs the
    line "utm_content distinct across all serving ads" itself — verified
    directly from tonight's own refresh, not carried over. No action
    needed on live ads.
11. **Campaigns with recorded sessions and zero key events (≥20 sessions),
    e.g. `Augweek3_lancaster` (471), `Augweek1_philly` (363),
    `summer2026_philly` (273)** — all August-dated campaign names, all
    already dead per the fragmentation clusters above using the same
    naming family. Historical dead weight, not chased further.
12. **Auto-tagging overwriting a manual campaign — `Campaign #1` replaced
    `week1_math`, 18 sessions.** Small, one-time, not re-investigated.

## ALSO IN THE REPORT

- **Webview conversion gap, restated at tonight's numbers.** Purchase funnel
  by webview segment (window-wide): webview session_starts 1191 → purchase 1
  (0.08%); normal-browser session_starts 621 → purchase 9 (1.45%) — an ~18x
  gap, essentially unchanged from the last several reports. Same mechanism
  as ANALYTICS_METHOD §6 (Meta's in-app browser degrading checkout). Given
  the HEADLINE, this specific ratio hasn't moved because *neither* segment
  produced a purchase this week — both numerators are entirely historical.
- **Loxleys sale-date check, repeated per the prompt's explicit warning
  about crediting a campaign before it existed — unchanged, still resolved.**
  "Sparkdate: The Loxley's Social" item sold its only 2 recorded units on
  **20260814 and 20260815**; the first `Loxleys` campaign row appears in
  `meta-insights-2026-08-30.csv` (window 20260824–20260830) and not in any
  earlier pull, i.e. the campaign launched no earlier than 08-30 — two full
  weeks after those sales. Nothing in tonight's Meta pull credits a Loxleys
  campaign with a sale that predates it.
- **Marion Court checkout-stage watch item — still resolved, not
  re-opening.** "SparkDate: Real People, Real Drinks, Real Court" item is
  still 13 carts → 5 purchased, $99.95, unchanged from the last several
  reports (and, per the HEADLINE, could not have moved this week regardless
  since nothing purchased anything).
- **Additivity is clean.** Revenue-by-source vs revenue-daily: $0.00 gap.
  Revenue-by-item vs items-daily: -$0.00 gap. Revenue-by-item vs transaction
  total: **-$92.52**, the already-documented 2-for-1 item-count effect
  (#205) — expected, not a new discrepancy.
- **`transaction_id` reuse still open**: 16 distinct ids carry 39
  transactions; 5 ids appear more than once (max 8 on one id), 5 span more
  than one date. Open since PR #200; not investigated further tonight,
  carried forward unchanged for another report (frozen along with
  everything else purchase-related this week).
- **Checkout errors, window-wide totals** (all pre-dating the freeze per the
  HEADLINE's event-diff table — nothing new this week): `card_incomplete`
  18 events/8 users, `(not set)` category 8 events/7 users, `card_declined`
  1, `other` 1. Reasons: `(not set)` 25, "your postal code is incomplete." 3.
- **Founders Mixer**: 8 purchases, 0 recorded `view_item`, 0 `add_to_cart` —
  all June sales (0603–0624). Old enough to read as a one-time sales
  mechanism (comped, admin, or a since-retired event page), not a live gap.
- **Google Ads, confirmed still dark.** Spend on the last 7 closed days
  (20260902–20260908): **$0.00**. Lifetime total unchanged: `Website
  traffic-Search-1` $35.35 (0 attributed sessions) + `Campaign #1` $2.56
  (Performance Max, 4 clicks, 10.73 nominal ROAS — far too small to mean
  anything, §12).
- **New organic/listing sources first seen in the last 7 closed days**:
  `nextdoor_event / listing` (5 sessions since 20260902),
  `visitlancastercity / listing` (4, since 20260903), `facebook_group /
  listing` (4, since 20260904), `figlancaster / listing` (2, since
  20260902), `Facebook / social` (10, since 20260902) — read as new free
  event-listing placements going live (consistent with the
  `syndicate-events` skill's purpose), not tagging defects.
- **Pages taking real traffic and returning nothing** (≥15 sessions, 0 key
  events, window-wide): blank landing-page value (24 sessions, 24 users —
  down from ~48 in recent reports), `(not set)` (43, 34), `/signup` (15, 11
  — already-settled: membership shelved, `sign_up` fires zero times all
  year per ANALYTICS_CONTEXT §1). No `public/` page source was opened
  tonight for these — all three are the same already-settled small pages
  from prior reports, and tonight's investigation effort went entirely into
  the checkout freeze, which is the far larger and more urgent finding.
  Landing-page × source dead pairings (≥20 sessions, 0 key events) are
  likewise unchanged in shape from prior reports: `/lp` × `facebook /
  paid_social` (419), `/event` × the obfuscated Lancaster email tag (129),
  `/admin` × `lp / (not set)` (106, the internal-tagging artifact above),
  `/events` × `eventbrite / listing` (49), `/founding` × `facebook /
  social` (45). The script's cross-tab again surfaces `googleads / paid` as
  the only "converting" source on `/lp` (91.1%, 56 sessions) — **not real**,
  every one of those "key events" is `ads_conversion_About_Us_1` (§8).

## NEEDS TAYLOR INPUT (1)

1. **(NEW, urgent — this needs action this week, not at the next nightly
   pull) Run one real checkout end to end (test-mode charge, or a real
   refundable one) on `/lp`, `/event`, and `/events`, and separately check
   the Stripe dashboard / admin dashboard for any charge dated 2026-09-02 or
   later.** Per the HEADLINE: GA4's transaction ledger and Meta's own pixel
   both show zero purchases anywhere on the site for at least 8 consecutive
   days, while checkout-starts and field interactions kept climbing on
   every landing page and ad spend kept flowing (~$130/week) to the two
   pages where that growth concentrated (`/lp`, `/event`). This coincides
   almost exactly with the 09-02 commit that rebuilt all three checkout
   surfaces (#419), and survives a follow-up audit (#456, merged 09-06)
   whose own closeout admits "no purchase was completed end to end" during
   its verification. **This cannot be resolved from GA4/Meta data alone,
   and this unattended session has no way to check it further**: no
   Stripe or admin-dashboard connector is attached (`get_connectors`
   returns only `tiktok`), and there is no browser access in this run. The
   two live possibilities are meaningfully different in urgency — (a) real
   revenue is being lost right now on every paid click, or (b) sales are
   fine and only the client-side reporting broke — and only a live check
   (an actual purchase attempt, or the Stripe dashboard's own record of
   charges) can tell them apart. **Re-check trigger: as soon as either check
   is done** — a completed test purchase confirms the checkout still works
   (pointing to (b)), a Stripe dashboard check for 09-02-onward charges
   settles it directly either way.

**Retired, not re-asked a third time:** the Facebook/Instagram session-
delivery collapse on 09-06/09-07 that the last two reports carried as an
open ask (1st ask 09-09, "2nd ask, downgraded" 09-10). Session volume
recovered by 09-08 (97 sessions) and has shown no recurrence through
tonight's data (09-08–09-10 all read as ordinary or tail-lag-affected days,
not a second collapse); there is no new evidence to add, and per this
prompt's own guidance an ask that repeats without new evidence is an unpaid
debt rather than a finding. If a similar single-channel, multi-day collapse
recurs, re-open it fresh rather than treating this entry as still live.

## Zero-risk fixes, described and not applied

1. **Internal-link UTM stripping** — remove `utm_source`/`utm_medium` from
   the `get_tickets_block` element and the internal `/matches` links (UTM
   item 3): 263 sessions of live, ongoing self-misattribution, the single
   clearest one-call-site fix in the worklist. Described in at least the
   last four reports; not yet applied.
2. **`facebook`/`instagram` source casing normalization** at the
   destination-URL / referral-tagging level (UTM items 1–2, 4) — highest
   combined session volume in the worklist (~2019 + 826 LIVE sessions), but
   the fix touches however these six-plus row variants get produced (ad
   UTMs, referral handling) rather than one call site, so it's flagged, not
   fully scoped, here.

Nothing about the checkout freeze belongs on this list — the mechanism is
not yet known, so there is no fix to describe yet, only an investigation to
run (NEEDS TAYLOR INPUT #1).

## Caveats

- ANALYTICS_METHOD §1: 20260909 and 20260910 excluded from every closed-week
  figure as not-yet-final. The HEADLINE's evidence does not depend on either
  excluded day — the freeze is established from 09-01 through the fully
  closed 09-08, and corroborated by Meta pulls through 09-10.
- ANALYTICS_METHOD §8 governs every reading of `ads_conversion_About_Us_1`
  in this report — never treated as a real conversion.
- ANALYTICS_METHOD §12: `add_payment_info` (n=10, frozen), the recent-week
  purchase/transaction counts (n=0), and the `transaction_id`-reuse figures
  are all small-sample or exactly-zero; read as direction/fact, not rate.
- ANALYTICS_METHOD §7: all revenue figures above are own-site GA4 only, not
  business revenue. This matters more than usual tonight — GA4 showing $0
  does NOT by itself prove the business took in $0, only that the own-site
  Stripe path recorded nothing; see HEADLINE for why this still needs a
  direct check rather than being read as settled either way.
- ANALYTICS_METHOD §9: no Meta week-over-week comparison drawn — the
  $132.53/initiate_checkout figures cited in the HEADLINE and Meta spend
  section are current-state snapshots from overlapping rolling windows, not
  a trend claim.
- ANALYTICS_METHOD §10: no comparison spans the 08-21, 08-25, 08-28 series-
  break dates. The 09-03 boundary IS discussed at length (it's the
  HEADLINE), but as a correlation with a specific commit, not as a naive
  before/after volume comparison across the instrumentation change itself.

**What I did not verify:** did not attempt a real or test-mode purchase
against the live checkout — this unattended, report-only run should not
take an action against production payment infrastructure without
authorization, which is exactly why this is routed to NEEDS TAYLOR INPUT
#1 rather than resolved here. Did not check the Stripe dashboard or the
admin dashboard directly (no connector attached to this session). Did not
read the full diff of `c600dce7` or `6877cf67` line by line — the
correlation and mechanism above is built from their commit messages and
GA4/Meta's own numbers, which is strong circumstantial evidence but is not
the same as reading the shipped code and confirming a specific bug. Did not
check whether `checkout_field_started`'s `field` parameter (gender / name /
email / card / two_for_one) or `source` parameter (lp / events) are
queryable yet — ANALYTICS_METHOD §10 notes these event-scoped custom
dimensions needed manual GA4 Admin registration as of 09-03, and no pulled
table breaks the event down by either parameter, so I cannot say tonight
whether abandonment is concentrated at the card field specifically or
earlier. Did not open any other `public/` page source tonight — the three
already-settled zero-key-event pages got no fresh look, since all
investigation effort went to the checkout freeze. Did not re-verify the
LancasterOnline/Evvnt obfuscated-tag fix beyond observing this pull's
volume is flat versus recent reports' account of it. Did not check the IP
or user-agent evidence for the `(not set)`/`ZZ` datacenter-traffic bucket.

## Coverage

**46 of 46** tables represented in the standing summary (script's own
ledger). No table was skimmed-and-skipped.

| table | rows | in standing summary |
| --- | ---: | --- |
| attribution-credit | 53 | yes |
| audiences | 2 | yes |
| by-day-hour | 168 | yes |
| by-device | 3 | yes |
| channel-groups | 11 | yes |
| checkout-error-reasons | 2 | yes |
| checkout-errors | 4 | yes |
| cities | 1032 | yes |
| cohort-retention | 18 | yes |
| daily-by-source | 795 | yes |
| daily-trend | 104 | yes |
| events | 36 | yes |
| events-by-source | 739 | yes |
| first-user-tagging | 136 | yes |
| funnel-by-channel | 36 | yes |
| funnel-by-device | 13 | yes |
| funnel-checkout-by-landing-page | 34 | yes |
| funnel-waitlist-sequence | 2 | yes |
| funnel-webview-vs-normal | 8 | yes |
| geo-country-language | 65 | yes |
| google-ads-by-network | 4 | yes |
| google-ads-cost | 2 | yes |
| google-ads-cost-daily | 24 | yes |
| google-ads-creatives | 2 | yes |
| items-daily | 30 | yes |
| key-events | 7 | yes |
| key-events-by-source | 132 | yes |
| key-events-daily | 104 | yes |
| landing-by-source | 258 | yes |
| landing-pages | 31 | yes |
| new-vs-returning | 4 | yes |
| os-browser | 29 | yes |
| page-views | 74 | yes |
| paid-cost-vs-sessions | 127 | yes |
| promotions | 8 | yes |
| revenue-by-item | 7 | yes |
| revenue-by-source | 14 | yes |
| revenue-daily | 67 | yes |
| session-quality-daily | 104 | yes |
| traffic-by-source | 70 | yes |
| transactions | 32 | yes |
| users-daily | 104 | yes |
| utm-ad-detail | 314 | yes |
| utm-content | 100 | yes |
| webview-by-event | 80 | yes |
| weekly-trend | 16 | yes |

Beyond the standing summary, tonight's report is additionally built from:
nine consecutive nightly `ga4-api-events-*.csv` and
`ga4-api-key-events-*.csv` pulls (09-01 through 09-11), diffed by hand to
isolate the freeze's exact start and confirm it as a persistent flatline
rather than a single bad day; two `ga4-api-funnel-checkout-by-landing-page-
*.csv` pulls (09-02, 09-09), diffed the same way; six `meta-insights-*.csv`
pulls (08-29 through 09-10) for the independent Meta-pixel corroboration;
`git log` against `api/purchase-ticket.js`, `public/lp.html`,
`public/event.html`, `public/events.html` for the commit-timing correlation
and the #419/#456 commit messages in full; and tonight's own unattended run
log (`Night Tasks/logs/2026-09-11.log`) for the confirmed 7-active-ad
utm_content uniqueness check (UTM item 10).
