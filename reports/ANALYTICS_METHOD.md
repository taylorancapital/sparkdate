# How to read this property's data — measurement traps only

**Standing file. Tracked in git deliberately**, so that anything reading this
repo — the nightly Cowork review, a future session, a person — gets these
guardrails automatically instead of via a manual copy that drifts.

**This is the METHOD half of a two-file split.** Its private sibling,
`Business Plan/files/Night Tasks/ANALYTICS_CONTEXT.md`, is gitignored and
holds the candid commercial assessment: which campaigns are failing, venue
economics, CAC, spend tables, and the internal-traffic filter's IP
conditions. That file stays private *because* it is candid — publishing it
would make the next version of it more careful and less useful.

Nothing here is commercially sensitive. Everything here is "this number does
not mean what it looks like."

> **Why the split exists:** the private file forked from its Cowork copy
> twice in two days. The 2026-08-26 nightly report re-asked three questions
> that file had already answered, and separately proposed a change that would
> have regressed working link previews — both because it was reading a stale
> copy. Every failure in that pair was methodological, not commercial, so the
> methodological half is now version-controlled and cannot drift.

---

## 1. The tail of every export is unreliable — for THREE separate reasons

An earlier version of this section treated the unreliable tail as one
phenomenon. It is three, with different causes and different remedies, and only
one of them is a processing lag. (a) and (b) are about the last *days* of a
daily series; (c) is about the last *bucket* of a weekly one, and the two-day
rule does not help you there.

**(a) Engagement lags one to two days.** The most recent day reports engagement
near zero or not at all. The second-most-recent day is *sometimes* fine and
sometimes not. Drop two days to be safe; if you need the second day, say that
you used it.

Measured: an export showed 2026-08-24 as 96 sessions / 3 engaged (3.1%); one
export later the same day read 135 / 62 (45.9%) — an ordinary day. In the
2026-08-27 export the artifact was confined to a **single** day (08-27 read 142
sessions / 2 engaged, 1.4%) while 08-26 read an ordinary 42.4%. So the two-day
drop is **safe but conservative**, not wrong.

**(b) The final day's session and user counts are incomplete in proportion to
how much of that day had elapsed when the export was pulled.** This is NOT a
GA4 lag and no waiting period fixes it. **Record the export's pull time.**

This is where the old "undercounts sessions by roughly 30%" figure came from,
and it was an artifact of one pull time rather than a property of the data. The
08-26 export was pulled ~13:12 and recorded that day as **54** sessions; the
08-27 export, pulled ~23:19, reads the same day as **172**. That is a 69%
shortfall, not 30% — because the first export captured about half the day. An
export pulled at 13:00 captures roughly half the final day; one pulled at 23:15
captures nearly all of it. **Comparing the same day across two exports pulled at
different clock times will show "growth" that is only elapsed time.**

**Control, and it holds.** Days three or more back do not move: 2026-08-24 read
135 sessions / 62 engaged identically in both the 08-26 and 08-27 exports.

This single trap caused three retractions in one report: a phantom engagement
collapse, a phantom `in_app_browser` regression, and a premature retention read.

**(c) A cohort's newest week cell is partial until that week closes — and no
amount of waiting a day or two fixes it.** This is a bucket-boundary problem,
not a lag. `cohort-retention` is built by `cohortSpec()` in
`scripts/fetch-ga4-tables.js`, which anchors every cohort to a **Monday**:

```js
monday.setUTCDate(monday.getUTCDate() - ((endDate.getUTCDay() + 6) % 7));
```

So cohort `wk of YYYY-MM-DD` starts on a Monday, and its `cohortNthWeek` cell
`n` covers **Monday + 7n through Sunday + 7n + 6**. That cell keeps filling
until its Sunday passes. Every cohort in the file therefore ends on an open
cell, and the largest, newest, most interesting cohort is always the one whose
latest cell is emptiest.

**The arithmetic, so you do not have to guess.** A cell is closed only if
`cohort_start + 7n + 6 < pull_date`. Anything else is partial, and a partial
cell measured against closed ones will *always* read lowest — that is the
shape of the artifact, not a finding.

**Measured, and it produced a false conclusion.** The 2026-09-02 report read
the `wk of 2026-08-24` cohort's week-1 cell as `4 / 891 = 0.45%`, called it
"fully elapsed," and reported it as "the lowest complete reading yet" against
four cohorts running 1.65%–3.37%. Week 1 of that cohort is Mon 08-31 → Sun
09-06; the pull ran 09-02 05:23 UTC, so **~2.2 of 7 days had elapsed**. The
four comparators were all full 7-day cells. There was no retention decline —
there was a third of a week compared against four whole ones. The counts
themselves were correct; only the completeness claim was wrong.

**Rule.** Never compare an open cell to a closed one. State a cohort cell's
elapsed fraction whenever you quote it, and if you need a week-1 number, take
it from a cohort whose week 1 has actually closed. Note also that "one day
short of a full week" is a claim worth checking twice — in the case above the
cell was five days short, and the phrase came from assuming the cohort week
started on the pull's own weekday rather than on Monday.

## 2. Seven routes are server-rendered — the file in `public/` is not what ships

Before proposing any change to a page's `<head>` — meta tags, OG/Twitter
cards, canonical, JSON-LD, title — **fetch the live URL and read the
response**. For these routes the HTML in `public/` is a template, not what is
served:

| route | served by |
|---|---|
| `/event`, `/event/:id` | `api/next-event.js?render=page` |
| `/philadelphia`, `/lancaster`, `/colorado-springs`, `/wilmington` | `api/next-event.js?render=city` |
| `/sitemap.xml` | `api/next-event.js?render=sitemap` |

Source: the `rewrites` block in `vercel.json`. Everything else in `public/`
is served as-is.

**The failure this prevents, which already happened.** A report proposed
adding static OG/Twitter tags to `public/event.html`, reasoning that link
scrapers do not run JavaScript so a shared `/event` link must preview
generically. The mechanism is real; the premise was never checked and is
false. A live fetch returns a complete, event-specific head injected
server-side.

**The proposed fix would have regressed it.** `render=page` injects by
*appending* before `</head>`, not replacing — so static tags would have been
served *alongside* the injected ones. Running the real injection against the
modified file produced `og:title` ×2, `og:image` ×2, `twitter:card` ×2, with
the **generic one first**. Scrapers take the first occurrence, so every shared
event link would have degraded from the real event title to a generic one.

Note the branches are **not symmetric**: `render=city` *does* replace
title/description/canonical in place; `render=page` does not. Do not reason
from one to the other.

## 3. `begin_checkout` changed meaning on 2026-08-21

PRs #204 and #229 redefined it. Any date range spanning 2026-08-21 mixes two
incompatible definitions, and a volume change across that boundary measures
the deploy, not user behaviour. Refuse the comparison rather than caveat it.

`add_payment_info` did not exist at all before the same date.

## 4. `view_item` does not fire on `/lp` — until 2026-09-03

**Before 2026-09-03:** `/lp` is a landing page, not a product page. A funnel
that expects `view_item` before `add_to_cart` will read `/lp` traffic as
skipping a step it was never instrumented to take.

**From 2026-09-03:** `/lp` sells the targeted event inline (the Get Tickets
tap opens a checkout form under the card instead of navigating to the
`/events` dialog). When that form opens, `/lp` fires `view_item`,
`begin_checkout` and `checkout_form_started` (`source: lp`,
`skipped_details: true`), then `add_to_cart` on the first gender pick,
`add_payment_info` once Stripe accepts the card, and `purchase`. The
`/events?event=…&checkout=1` path still exists for sold-out events, for a
landing page whose event never resolved, and for browsing. Any window
spanning 2026-09-03 mixes the two shapes: the checkout-by-landing-page
funnel's `/lp` row rises first for instrumentation reasons and only then, if
at all, for demand.

## 5. `form_start` and `lead_form_started` are different things

- **`form_start`** is GA4 enhanced measurement, firing automatically on *any*
  form on the page. There are 16 forms across the lead pages; `getaways.html`
  alone has 7.
- **`lead_form_started`** is a custom event at eight hand-placed call sites.

Seeing `form_start` = 58 against `lead_form_started` = 25 in the same sessions
is expected, not a misfire.

**Historical pairing gap.** `lead_form_started` did not pair with
`generate_lead` — 30 of 51 completed leads had no recorded form start. The
cause was not random event loss: `getaways.html` fired `generate_lead` and had
seven notify forms but **no `lead_form_started` call site at all**. Fixed
2026-08-28 (PR #311).

## 6. Engagement time is unreliable inside webviews

`user_engagement` misfires in in-app browsers (Instagram, Facebook, TikTok).
Do not draw behavioural conclusions from engagement time or bounce rate split
by webview vs direct browser — the split may be measuring instrumentation
rather than people. Use key-event counts instead.

Related: two `in_app_browser_*` events are ghosts and should not be counted as
user actions.

## 7. GA4 revenue is own-site only

Eventbrite and Meetup imports fire no analytics at all. A large share of real
revenue is invisible to GA4 by construction. **The admin dashboard is revenue
truth; GA4 is not.** A GA4 revenue figure is a floor, not a total.

## 8. An event's name can lie about what it measures

`ads_conversion_About_Us_1` does **not** fire on an About Us page. Its GA4
definition is `Page load: /lp?utm_source=googleads` — a landing-page view on
the paid-search LP. It was read literally in three consecutive reports.

Check a custom event's *definition* before trusting its name.

## 9. Rolling windows fake trends

Meta campaigns on this account are short-lived and get resumed. Three figures
from three different rolling windows are not a trend, and a "last spend" date
is a snapshot, not a tombstone — a campaign that stopped may be running again.
Re-check the account rather than reading a stale table.

## 10. Series breaks — comparisons spanning these dates are invalid

| date | what changed |
|---|---|
| 2026-08-21 | `begin_checkout` redefined; `add_payment_info` introduced |
| 2026-08-21 | **Items-sold rises without more sales** (#205). A 2-for-1 delivers two seats on one payment, and `purchase` previously sent no `quantity`, so GA4 counted it as one unit. It now sends the real seat count. Roughly one in five own-site purchases is a 2-for-1, so items-purchased steps up by about that much at the cutover. **Not demand.** Revenue is unaffected — `value` was always the amount charged. |
| 2026-08-21 | **Sold-out events start appearing where they did not before** (#207). `events.html` and `city.html` used to read sold-out from the hand-typed `status === 'full'` label, which nobody sets in practice; they now compute it from real capacity, as `event.html` always did. A fall in Reserve clicks or event-page traffic after an event fills is **that fix working, not demand falling** — cross-check the event's `confirmed` against `spots` before reading it as a decline. |
| 2026-08-22 | site changes shipped (see PR history) |
| 2026-08-23 | **`in_app_browser` began riding on every event (#265).** Before this it fired on 4–17 events a day; 229 on 08-23, then 651+ from 08-24. So the webview segments in `funnel-webview-vs-normal` and `webview-by-event` are a measurement that STARTS on 2026-08-24, no matter how far back the export window runs. A 95-day window shown against those segments is really a ten-day one. **Do not read the pre-08-23 portion as "few webview users" — it is "the flag was not attached yet."** Raised by `GA4_ANALYSIS_2026-09-01`. |
| 2026-08-25 | GA4 internal-traffic filter went **Active** — users/sessions/engagement step down because internal visits stopped counting. **Not a traffic decline.** |
| 2026-08-28 | `lead_form_started` added to getaways (#311) — volume steps **up** because a whole surface began reporting, and the pairing gap above improves for that reason alone. **Not a funnel improvement.** |
| 2026-08-28 | `view_promotion` introduced (#310) — a brand-new event, so all of its "growth" is instrumentation arriving. |
| 2026-08-28 | `fbclid` no longer carried to `/events` (#309) — distinct landing URLs collapse sharply. 93.6% of paid rows previously held exactly one session because every visitor had a unique URL. **Cleanup, not a traffic drop.** |
| 2026-09-01 | **Funnel purchase counts step UP without more sales (#380).** `add_to_cart` was a mandatory step in every purchase funnel for one night. A closed funnel counts only users who completed every step in order, and on this property most buyers skip the cart — `begin_checkout` has 146 users against `add_to_cart`'s 57. Measured over `20260519-20260901`: `session_start→purchase` finds 34 buyers, `+view_item` 24, `+begin_checkout` 12, `+add_to_cart` **5**, against GA4's own 37 transactions / 34 purchasing users. Dropping the step moved the channel funnel's purchase row from 5 to 12 — Paid Social 2→5, Direct 1→3, Email **0→1**. **That jump is the definition changing, not conversion improving.** `GA4_ANALYSIS_2026-09-01` quoted the pre-fix chain counts as purchases; do not trend against them. |
| 2026-09-03 | **The paid path changed shape (paid funnel fixes, after `reports/PAID_FUNNEL_AUDIT_2026-09-02.md`).** (a) `/lp` sells inline — see §4; `view_item`, `begin_checkout`, `add_to_cart`, `add_payment_info` and `purchase` appear on `/lp` from this date, and `select_promotion` on `/lp` no longer implies a navigation. (b) The `/events` dialog and the `/lp` form no longer ask for **phone**, and their Reserve button is enabled from the first frame, so `add_to_cart` (first gender pick) is the first field interaction on both. (c) The **2-for-1** is offered to every buyer (marketed to women only); the women-only gate that existed for part of 2026-09-02 is gone. (d) New events: `checkout_field_started` (`field`: gender / name / email / card / two_for_one; `source`: lp / events), `lp_visible` (`started_hidden`), and a config-level `page_started_hidden` on `/lp`. All three parameters need registering as event-scoped custom dimensions in GA4 Admin before they are queryable — the Admin API is disabled on this project, so that is a UI step; until then they read `(not set)`. (e) `in_app_browser_copy_link` gains `source: lp_checkout`; the in-app **warning** on the checkout step is gone, so `in_app_browser_*` volume from the dialog falls for that reason alone. (f) A new `checkout_error` category, `gender_missing`, replaces what the disabled "Select Gender" button used to prevent silently. |

**A funnel's last step is never a conversion count.** It counts complete chains,
so it undercounts by however many buyers skipped a step — 12 of 34 even after
the #380 fix. The residual is not a mystery: **§4 above is the reason.** `/lp`
does not fire `view_item`, so every buyer who came through the landing page is
discarded by a funnel that starts there. §4 predicted exactly this failure and
it happened anyway, because the prediction lived in one section and the funnel
was built in another.

Read `ga4-api-revenue-daily-*.csv` and the `purchase` row of
`ga4-api-events-*.csv` for the real numbers. Every funnel CSV now carries this
warning in its own header.

## 11. Ads Manager drops video when you EDIT an ad, and keeps it when you CREATE one

Measured across seven attempts on 2026-08-29, building four video ads.

**Swapping the creative on an existing ad silently reverts to a still.** The
composer accepts the video, appears to save, and writes a creative with
`link_data` and no `video_id`. Text changes on the same save DO commit, which is
what makes it convincing: the caption, headline and URL are all correct, so the
ad looks updated. Three consecutive attempts on the Good Good retargeting ad
failed this way, and one of them left a **900x496 landscape image from a
previous campaign** on a 4:5 placement.

**Creating a new ad works first time.** Both new Marion Court ads attached video
on the first attempt. The one Marion Court ad that failed was, again, an edit of
the existing ad.

**So: to change an ad's video, duplicate it and pause the original.** Do not
edit in place. Pausing rather than deleting keeps the original's delivery
history.

**Two related traps from the same session:**

- **A duplicated ad inherits the source ad's destination URL**, `utm_content`
  included. Two Marion Court ads briefly reported as the same creative because
  V2 was duplicated from the Quang ad and kept `utm_content=mc_rt_quang`.
  Change the URL immediately after duplicating.
- **A thumbnail added as *media* replaces the video.** It has to be set as the
  video's cover/poster frame. Adding the PNG alongside is what produced the
  still-image ads above.

**Verify from the API, not the preview.** None of the above is visible in the
composer preview -- a still-image ad with the right caption previews exactly
like the video ad you meant to build. The check is whether the creative's
`object_story_spec` has `video_data` with a real `video_id`, and whether the
thumbnail is 1080x1350 rather than something inherited.

**When checking, treat `IN_PROCESS` and `PENDING_REVIEW` as live.** A check that
filters on `effective_status == 'ACTIVE'` silently skips the ad you just built,
which is exactly when you are looking. That produced a false "all clear" on the
duplicate `utm_content` above.

## 12. Sample sizes

Most cells below the top of the funnel are single digits. **Do not convert
small counts into percentages without stating the count.** Anything at or
below `add_to_cart` generally lacks the volume to carry a rate.

---

## When a number here conflicts with one you compute

Say so explicitly rather than silently trusting either. If you establish that
something here is wrong, correct it in the same change that reports it — and
if the correction is commercial rather than methodological, it belongs in the
private `ANALYTICS_CONTEXT.md` instead.
