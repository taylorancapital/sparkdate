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

## 1. The tail of every export is unreliable — for TWO separate reasons

An earlier version of this section treated the unreliable tail as one
phenomenon. It is two, with different causes and different remedies, and only
one of them is a processing lag.

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

## 4. `view_item` does not fire on `/lp`

`/lp` is a landing page, not a product page. A funnel that expects
`view_item` before `add_to_cart` will read `/lp` traffic as skipping a step it
was never instrumented to take.

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
| 2026-08-25 | GA4 internal-traffic filter went **Active** — users/sessions/engagement step down because internal visits stopped counting. **Not a traffic decline.** |
| 2026-08-28 | `lead_form_started` added to getaways (#311) — volume steps **up** because a whole surface began reporting, and the pairing gap above improves for that reason alone. **Not a funnel improvement.** |
| 2026-08-28 | `view_promotion` introduced (#310) — a brand-new event, so all of its "growth" is instrumentation arriving. |
| 2026-08-28 | `fbclid` no longer carried to `/events` (#309) — distinct landing URLs collapse sharply. 93.6% of paid rows previously held exactly one session because every visitor had a unique URL. **Cleanup, not a traffic drop.** |

## 11. Sample sizes

Most cells below the top of the funnel are single digits. **Do not convert
small counts into percentages without stating the count.** Anything at or
below `add_to_cart` generally lacks the volume to carry a rate.

---

## When a number here conflicts with one you compute

Say so explicitly rather than silently trusting either. If you establish that
something here is wrong, correct it in the same change that reports it — and
if the correction is commercial rather than methodological, it belongs in the
private `ANALYTICS_CONTEXT.md` instead.
