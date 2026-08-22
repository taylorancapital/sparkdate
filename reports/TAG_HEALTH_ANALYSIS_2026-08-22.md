# Tag Health Regression Check — 2026-08-22 (Nightly Automation, Cowork Session)

**This run made zero code changes.** Every finding below is a read-only observation against a
fresh clone of `main` (HEAD `91d2a51`, 2026-08-22). The only file added to this branch is this
report. Nothing was fixed, not even a one-character change — including the two items that would
qualify as one-line fixes. They are written up for a human to apply or reject.

---

## Why this focus tonight

**Prompt 9 (GA4) was skipped: the export is stale for a third consecutive night.** All 18
`download*.csv` files in `Business Plan/files/Night Tasks/` still carry `# 20260519-20260819` in
their own header block and still total **$743.73 / 28 transactions** — byte-identical to what the
08-20 and 08-21 runs already analyzed. Per the 07-28 lesson recorded in the prompt library, this
was checked by reading each file's own `#` date-range header, not filenames or mount timestamps.
No newer Meta pull landed either: the freshest is `meta-insights-2026-08-20.csv` (window
`20260814-20260820`), which the 08-21 paid-efficiency run already consumed. Re-running either
would have repeated a report two nights running.

With no fresh data drop, the prompt library's rotation rule applies: *"Fill every remaining night
with the M1-M8 maintenance rotation — it needs no data drop and no queued task."* Rotation state
from the run log: **M1 ran 2026-07-28, M2 ran 2026-07-31, M3 ran 2026-08-10, and M4–M8 have never
run.** M4 is next in sequence and is the highest-value of the unrun five here, because its stated
target — *"this repo has had a stale/wrong Pixel ID slip onto pages before"* and *"no page that
HAS these tags is missing one that a sibling page has"* — is the exact bug class behind the
attribution mystery that 10+ consecutive GA4 reports have been circling.

**Deliberate overlap note:** the 08-21 paid-efficiency report incidentally found that `ViewContent`
fires on only 2 of 17 pages. That was a side observation inside a spend analysis, not a systematic
tag sweep. This run extends rather than repeats it — Pixel/GA4 ID consistency, `<noscript>`
parity, CAPI deduplication, and per-page event parity across all **33 pages** (17 top-level + 16
blog) were not covered there.

**Scope:** `public/*.html`, `public/blog/*.html`, `api/*.js`, `lib/meta-capi.js`, `lib/tiers.js`.
Source-level only — see Caveats.

---

## Headline

**The historical bug M4 exists to catch is not present — but `public/checkin.html` carries the
Meta Pixel and no GA4 tag at all, and anonymous getaway poll votes are reported to Meta as
`Lead` conversions.** Both ID values are perfectly consistent across every page, and Meta CAPI
deduplication is correct on both server-sent events. The defects are asymmetries, not drift.

---

## Clean passes (verified negatives — worth recording so they aren't re-investigated)

| Check | Result | Evidence |
|---|---|---|
| GA4 measurement ID consistency | **PASS** | 67 occurrences across `public/`, **1 distinct value** (`G-21YLCC35F1`). No stale ID anywhere. |
| Meta Pixel ID consistency | **PASS** | 27 `fbq('init', …)` calls, **1 distinct value** (`4390442851170732`). The "stale Pixel ID slipped onto pages" bug M4 names is not present. |
| Pixel `<noscript>` fallback parity | **PASS** | 27 `facebook.com/tr?id=` `<noscript>` tags vs 27 `fbq('init')` — exact match, no page has the script without the fallback. |
| Meta CAPI deduplication | **PASS** | CAPI sends exactly two events — `Lead` (`api/lead-signup.js:187`, `:1053`, `:1101`) and `Purchase` (`api/stripe-webhook.js:241`). Both pass `eventId`, and both have a browser twin passing the identical `eventID` (`event.html:1622`/`:1983`, `events.html:987`/`:1929`/`:2207`, `signup.html:824`, `index.html:1367`, `lp.html:633`, `city.html:1014`). Purchase uses the Stripe PaymentIntent id on both sides. **No double-counting.** |
| Subscription tier price consistency | **PASS** | `lib/tiers.js:11-13` (999 / 1999 / 3999 cents) matches `account.html:916,922,928` ($9.99 / $19.99 / $39.99), `signup.html:843,859,876`, and `admin.html:2176`. Four copies, zero drift — notable given this repo's history with hardcoded-value drift. |
| `in_app_browser_checkout_blocked` / `_override` removal | **PASS, reconfirmed** | Still absent from `public/`, `api/`, `lib/`. The 12 + 2 occurrences in the export remain pre-PR-#165 historical residue, as the 08-17 report concluded. |

---

## Findings

### F1 — `public/checkin.html` has the Meta Pixel but no GA4 tag at all *(the clearest M4 hit)*

Of 33 pages, **31 carry `gtag('config', 'G-21YLCC35F1', …)`**. The two that don't are
`public/404.html` (see F2) and **`public/checkin.html`** — which nevertheless carries the complete
Meta Pixel block: base code at `checkin.html:60-71`, `fbq('init', …)` at `:69`, `fbq('track',
'PageView')` at `:70`, `<noscript>` at `:72-75`, and a conversion event at `:240`.

This is precisely M4's stated target — a page that has one tag system and is missing the sibling
system every comparable page has. Consequence: the at-the-door check-in flow fires Meta
`CompleteRegistration` but is **completely invisible to GA4**. GA4's `profile_complete` (42 events)
comes from `public/profile.html`, not from here, so there is no GA4 substitute reading this flow.

Worth stating plainly because it reads like a defect and isn't: the Meta side is *carefully*
correct. `checkin.html:238-241` gates `CompleteRegistration` on `createdUser`, with a comment
explaining that a returning attendee checking in again shouldn't inflate the count. The problem
is one-sided — GA4 is blind, Meta is not.

### F2 — `public/404.html` has neither GA4 nor the Meta Pixel

The only user-facing page in the repo with **zero measurement of any kind**: 0 `gtag`, 0 `fbq`,
0 `<noscript>`. It is not a stub — 240 lines, full navigation (`:200-205`) and two CTAs at
`:230-231` pointing to `/` and `/events`.

Net effect: **404 rate is unmeasurable.** There is no way to see how much traffic lands on a
broken URL, or which sources send it. That matters more than usual right now — the 08-21 report
found 67 of 824 campaign-targeted `/lp` landings (**8.1%**) were degraded or misrouted
(`next_event_fetch_failed` 60, `targeted_event_not_found` 6, `targeted_event_missing_id` 1). A
blind 404 page is the one place that class of failure would otherwise surface.

### F3 — Anonymous getaway poll votes are reported to Meta as `Lead` conversions

`public/events.html:2405` and `public/getaways.html:617` both fire:

```js
if (typeof fbq !== 'undefined') fbq('track', 'Lead', { content_name: 'getaway_' + packageId });
```

…on the **anonymous vote** path — a button click that captures no email. Traced server-side:
`api/lead-signup.js`'s anonymous `getaway_interest` branch increments a counter on the
`getaway_interest` collection and returns `{ success: true }` with **no `lead_id` and no lead
document created**. Nothing about that interaction is a lead in any ordinary sense.

GA4 gets this right and Meta doesn't — the same two code paths fire the *custom*, non-conversion
event `gtag('event', 'getaway_interest', …)`, while Meta gets the *standard* `Lead` event that its
optimization and reporting treat as a genuine conversion.

**Scale, from GA4's own event counts (`download (1).csv`, 90-day window):**

| GA4 event | Count | Meta counterpart |
|---|---|---|
| `getaway_interest` (anonymous vote, no email) | **203** | `Lead` |
| `generate_lead` (real email captured) | **77** | `Lead` (with `eventID`) |

If that ratio carries to the pixel, roughly **203 of ~280 browser `Lead` events (72.5%) are poll
clicks with no contact information behind them.**

Bounding the practical impact honestly: the campaign-attributed slice is small. Both Meta pulls
show **16 `lead` actions each** (Aug 13–19 and Aug 14–20), all `offsite_conversion.fb_pixel_lead`.
The split of those 16 between votes and real signups is **not determinable from these files** —
the export is campaign-level and carries no `content_name` breakdown.

Secondary observation: these two calls are the **only two `Lead` sites in the repo without an
`eventID`**. Harmless today, since the anonymous path sends no CAPI twin — but it means that if
CAPI is ever added to that path, it will silently double-count.

### F4 — Two GA4 events have been in source for 7 weeks with zero fires

Four GA4 event names exist in source but appear nowhere in a 19,978-event, 90-day export. Two
are fully explained; two are not.

**Explained — the code is newer than the export.** `select_promotion` (`index.html:1097`, `:1429`,
`lp.html:600`) and `add_payment_info` (`event.html:1787`, `events.html:2133`) were introduced by
**PR #204 `ea7faa8` (2026-08-21)** and **PR #205 `46ba87b` (2026-08-21)**, both landing *after*
this export's Aug 19 cutoff. Zero fires is expected; nothing to do but wait for a fresh export.

**Not explained — `checkout_3ds_required` and `checkout_3ds_completed`.** Present at
`event.html:1852`/`:1863` and `events.html:2166`/`:2172`, first added **2026-07-03 (PR #56
`11a5c69`)** and re-added **2026-08-05 (PR #148 `6bc9438`)** — roughly **7 weeks inside** the
May 19 – Aug 19 window. Over that window the site recorded **28 purchases** and **18
`checkout_error` events** (`card_incomplete` 9, `card_declined` 1, `(not set)` 8), and **not one
3DS event of either kind.**

Two readings, and this data cannot separate them: (a) genuinely zero — 3DS/SCA is largely a
European requirement and a US-card, US-audience business can plausibly go 90 days without a single
challenge; or (b) the branch is unreachable and the site is blind to a real drop-off. Reading (a)
is the more likely one, but it is worth ten minutes in Stripe rather than an assumption, because
these reports have repeatedly attributed lost checkouts to in-app-browser 3DS failure — a theory
that, if 3DS never fires at all, needs revisiting.

### F5 — The subscription funnel completed zero signups in 90 days *(not a tag defect)*

`gtag('event', 'sign_up', …)` at `signup.html:1221` shows **zero** fires. Three independent
sources agree rather than one:

1. No `sign_up` row in the 19,978-event GA4 count table.
2. No subscription tier name (`SparkDate Spark` / `Kindling` / `Fire`) in Revenue by Item — all
   six items are events (`download (10).csv`).
3. No `complete_registration` action in either Meta campaign pull.

The tag is wired correctly; nobody completed the flow. Flagged as a business observation, not a
measurement bug — but it means the subscription product has produced **$0.00 across the entire
90-day window** while occupying a top-level nav slot.

### F6 — Latent: a subscription upgrade would contaminate ticket-revenue reporting *(not firing yet)*

`public/account.html:1046` fires GA4 **`purchase`** for a subscription tier change:

```js
gtag('event', 'purchase', {
    transaction_id: `subscription_${currentUser.uid}_${newTier}`,
    value: tierInfo.price,
    currency: 'USD',
    items: [{ item_name: tierInfo.name }]     // <- no `price` field
});
```

Two problems if it ever fires. First, subscription revenue lands in the same `purchase` metric
that every nightly report reads as **ticket** revenue — the third `gtag purchase` site alongside
`event.html:1956` and `events.html:2192`, indistinguishable in the export. Second, the `items[]`
entry carries `item_name` but **no `price`**, so the amount would appear in Revenue-by-Source and
**not** in Revenue-by-Item.

That second point matters specifically because these reports use the source-vs-item gap as a
data-integrity check. Tonight it reconciles cleanly: **$743.73 − $678.73 = $65.00**, exactly
26 × the $2.50 `SERVICE_FEE` — consistent with the 2 legacy fee-free transactions the 08-18 and
08-19 reports identified, out of 28 total. A subscription upgrade would widen that gap by the
full ticket price and look exactly like a new fee anomaly.

**Confirmed not firing today** (F5, and no tier names in the item table), so this is a forward
risk rather than live contamination.

### F7 — The 08-20 headline finding is fixed in code, unverified in data

The 08-20 report's lead finding — *"`begin_checkout` is not a checkout event"*, firing from
`index.html:1089`, `index.html:1413`, `lp.html:592` — **has been resolved.** In current `main`,
`begin_checkout` fires from exactly two places, both real checkout pages: `event.html:1647` and
`events.html:1883`. The three marketing-page CTAs now fire `select_promotion` instead
(`index.html:1097`, `index.html:1429`, `lp.html:600`), with in-source comments naming the reason.
Shipped in **PR #204 (`ea7faa8`, 2026-08-21)**.

Since the fix postdates the export cutoff, **every funnel number in the 08-19/08-20/08-21 reports
still reflects the old, broken ordering.** The next fresh export is the first one that can confirm
the funnels now behave.

---

## Recommendations

### NEEDS TAYLOR INPUT (judgment, money, or platform-side access)

1. **Should an anonymous getaway vote count as a Meta `Lead`? (F3)** This is a marketing-strategy
   call, not a code call. Feeding Meta 203 zero-information "conversions" trains delivery toward
   people who click polls rather than people who buy tickets — but if the votes were deliberately
   wired as Leads to give a thin pixel more optimization signal, that is a defensible trade and
   should stay. **Cannot be decided from source.** If it should change, the standard substitute
   is a `trackCustom` event (e.g. `GetawayVote`), which keeps the signal without claiming the
   standard-event semantics.
   *Re-check in ~1 week:* pixel `Lead` volume in Events Manager split by `content_name` — the
   `getaway_*` share is the number that settles it.

2. **Verify in Stripe whether 3DS has ever triggered for this account. (F4)** Ten minutes in the
   Stripe dashboard distinguishes "correctly zero" from "instrumented but unreachable," and this
   sandbox cannot. If 3DS genuinely never fires, several prior reports' in-app-browser-3DS theory
   needs revisiting as a cause of lost checkouts.
   *Re-check in ~1 week:* `checkout_3ds_required` in the GA4 event count table — still absent
   against a non-zero Stripe 3DS count means the branch is dead.

3. **Decide whether the subscription product stays. (F5)** $0.00 across 90 days, zero completions,
   confirmed three ways. Pricing/product strategy — explicitly out of scope for this automation.

4. **Decide how subscription revenue should be reported. (F6)** Options range from a separate GA4
   event name to adding `price` to the `items[]` entry. This touches revenue reporting, so it is
   a Taylor call, not a mechanical fix.
   *Re-check in ~1 week:* whether Revenue-by-Source minus Revenue-by-Item still equals
   (transactions − 2) × $2.50. It does tonight ($65.00 / 26).

### Proposed zero-risk fixes — **NOT APPLIED**, for a human to make

Both are copy-paste of an existing block from a sibling page. Neither was made; this run's hard
rule forbids it.

1. **Add the GA4 snippet to `public/checkin.html`. (F1)** Copy the `gtag` block from
   `public/profile.html:22` (same shape: `{ 'page_path': window.location.pathname }`) into
   `checkin.html`'s `<head>` beside the existing Pixel block at `:60`. Optionally pair the Meta
   `CompleteRegistration` at `:240` with a GA4 event, matching the pattern at
   `signup.html:1221-1223`.
   *Re-check in ~1 week:* a non-zero `/checkin` row in Pages and Screens.

2. **Add both tags to `public/404.html`. (F2)** Same GA4 block; the Pixel block can be copied
   verbatim from `checkin.html:60-75`.
   *Re-check in ~1 week:* a `/404` row in Pages and Screens, and its referrer breakdown — if
   `targeted_event_not_found` (6) and the 60 `next_event_fetch_failed` events have a 404
   component, this is where it becomes visible.

**Not recommended as a fix:** nothing about the Pixel ID, the GA4 ID, the `<noscript>` tags, the
CAPI deduplication, or the tier prices. All verified consistent.

---

## Caveats and method

- **Source-level only.** M4 asks for runtime verification (loading pages and confirming `fbq()`
  and `gtag()` actually fire via console/network) *if a browser tool is available*. No browser or
  network egress is available in this sandbox, so this is a static analysis of committed source.
  A tag present in source can still be blocked at runtime by a consent gate, an ad blocker, or a
  CSP header — none of which this check can see. Stated explicitly rather than skipped silently.
- **The GA4 export is 3 days old and stale** (window `20260519-20260819`, unchanged since 08-20).
  Every event count cited is from that window. Because **PR #204 and #205 both landed 2026-08-21**,
  the export is older than the current code — which is why F4's "zero fires" needs the
  commit-date check to interpret, and why F7 cannot be confirmed from data yet.
- **Counts come from `grep` over committed source.** Dynamically constructed event names, or
  events fired from a CDN/tag-manager container rather than the repo, would not be seen. No tag
  manager container was found in source.
- **F3's 203-vs-77 ratio is a GA4 measurement, applied to Meta by inference.** The two systems
  fire from the same code paths and both conditionals are identical (`res.ok`), so the ratio
  should carry — but the Meta export is campaign-level with no `content_name` split, so the
  16 campaign-attributed leads per window cannot be decomposed. Stated as inference, not fact.
- **Prior-period comparison:** no prior tag-health report exists — M4 has never run, so there is
  **no baseline to trend against.** This report is the baseline. Cross-references to the 08-17,
  08-18, 08-19, 08-20 and 08-21 reports were read from `main` and from the two run logs.
- **Nothing in the Night Tasks folder was moved, renamed, or deleted.** All CSVs read in place.
- **The prompt-library fragmentation is unchanged** (11th consecutive run): the path this task's
  instructions hardcode — `Business Plan/files/Night Tasks/sparkdate-nightly-claude-code-prompts.md`
  — still does not exist. The real library is at the top-level `Night Tasks/`, while the GA4 CSVs
  and a *second, separate* run log live in `Business Plan/files/Night Tasks/TONIGHT_PROMPT.md`.
  Neither log is complete on its own; the 08-20 and 08-21 runs are recorded only in the latter.
  Still worth picking one canonical location.

---

## Verification of this run's own constraint

`git diff --cached --name-only` was checked before commit and lists exactly one path:
`reports/TAG_HEALTH_ANALYSIS_2026-08-22.md`. No file under `public/`, `api/`, `lib/`, `scripts/`,
`content/`, `vercel.json`, `package.json`, or `firestore.rules` was modified, added, or deleted.
