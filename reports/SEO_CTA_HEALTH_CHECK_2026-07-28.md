# SparkDate SEO / Conversion-Path Health Check — 2026-07-28

**This run made ZERO code changes.** Report-only, as required. No PR could be opened
tonight — same environmental blocker as the 2026-07-25 and 2026-07-26 runs. See
"Delivery note" at the bottom before anything else.

**Focus chosen:** Prompt 6 (SEO / Organic Traffic Health Check), not Prompt 9 (GA4).
Reasoning: the 16 GA4 CSVs + `data.pdf` currently sitting in this Night Tasks folder are
byte-for-byte the same export already analyzed in `GA4_ANALYSIS_2026-07-26.md` (identical
file timestamps, Jul 25 23:37–23:46, and identical file count/names). Re-running that
analysis would repeat the prior report rather than add anything new, and this file's own
rules say not to repeat an analysis two nights running. Per the ROTATION SUGGESTION
section, on a night with no fresh GA4 drop the rotation moves to Prompts 1/6/7 or the
M1-M8 maintenance list. Prompt 6 was picked because it's the most direct continuation of
the last two GA4 reports' open threads (the About-Us page, the Facebook/in-app-browser
checkout gap, and the "does every high-traffic page have a real path to a ticket"
question) and hadn't been run yet in this rotation.

**Scope:** `public/about.html`, `public/index.html`, `public/lp.html`, and all 11 posts in
`public/blog/` — audited via a fresh read-only clone of the repo (see delivery note). Did
not get to `public/events.html`/`public/event.html` or the city pages (`public/city.html`)
this run; those are reasonable picks for a future Prompt 6 or Prompt 7 night.

---

## Finding 1 (primary): 5 of 11 blog posts don't use the direct-to-ticket CTA pattern the other 6 use

The other 6 posts (`dating-app-burnout.html`, `what-to-wear.html`,
`conversation-starters.html`, `how-same-night-matching-works.html`,
`how-to-ask-for-a-second-date.html`, `signs-your-first-date-is-going-well.html`) all end
with the same `.post-cta` block:

```html
<div class="post-cta">
    <h3>...</h3>
    <p>...</p>
    <a href="/event" class="btn">Reserve Your Spot</a>
</div>
```

`/event` is the single bookable event page — the direct one-click path to checkout. Five
posts don't match that pattern:

| Post | Has `.post-cta` box? | Bottom CTA target |
|---|---|---|
| `first-timer-guide.html` | Yes | `/events` (browse page, not direct booking) |
| `first-timer-guide-lancaster.html` | **No** | none — only generic nav "Join"/"Events" links and a footer link |
| `lancaster-date-night-spots.html` | **No** | none — nav/footer only |
| `philly-date-night-spots.html` | **No** | none — nav/footer only |
| `singles-weekend-getaways-near-philadelphia.html` | **No** | none — nav/footer only (one inline `/events` mid-article link) |

`first-timer-guide.html` is the closest miss: it has a proper `.post-cta` box ("Reserve
your spot... $24.99, no account required to purchase") but the button reads "Browse
Upcoming Events" and points at `/events` (the multi-event browse page) instead of
`/event` (the single bookable event with the "Get Tickets" flow) — the exact "old
pattern" the 07-24/07-26 GA4 reports referenced as already fixed on "6 of 10" posts. The
other 4 posts don't even have that: no in-body conversion CTA at all, just the standard
nav ("Join" → `/events`) and footer link.

This isn't a broken link or a missing page — every one of these still routes to a real,
working page. It's a friction/consistency gap: a reader who finishes
`philly-date-night-spots.html` or `singles-weekend-getaways-near-philadelphia.html` has
to go find the nav or footer link themselves rather than hitting an obvious, dedicated
"buy a ticket" button the other 6 posts give them right where they stop reading.

**Why this is worth fixing:** these are exactly the kind of city/practical-guide posts
(date-night-spot roundups, first-timer guides, getaway ideas) most likely to pull organic
search traffic from people who are close to booking but haven't yet — the same audience
segment the `.post-cta` pattern was clearly built for on the other 6 posts.

## Finding 2: about.html, index.html, lp.html — no issues found

- **`about.html`**: unique title/description, correct canonical (`/about`), valid
  `Organization` schema with both `areaServed` cities, alt text on all 7 images, and a
  prominent `<a href="/events" class="btn-cta">Claim Your Spot</a>` CTA plus 2 more
  `/events` links in-body. This page is not the problem — the GA4-side finding that 69% of
  sitewide "key events" are a $0 `ads_conversion_About_Us_1` Google Ads action (see
  `GA4_ANALYSIS_2026-07-26.md`) is a Google Ads account-configuration issue, not a page
  UX/content problem; nothing here needs a code fix.
- **`index.html`**: unique title/description, correct canonical (`/`), valid
  `Organization` schema, 5 links to `/events` plus links to both city pages
  (`/philadelphia`, `/lancaster`) and `/blog`. No issues.
- **`lp.html`**: intentionally `<meta name="robots" content="noindex, nofollow">` with a
  code comment explaining why ("Paid-traffic landing page; keep out of the index — no
  duplicate-content / SEO competition"). This is correct, deliberate, and not a bug —
  flagging only so it's not mistaken for a missing-SEO-tags problem in a future audit.
  Worth noting: this page already has a built-out in-app-browser (Instagram/Facebook
  webview) detection and checkout-intercept system — a dismissible banner plus a
  full-block warning with a "Copy Link" fallback when the "Get Tickets" tap is caught
  inside an in-app browser (`public/lp.html`, `iabBanner`/`iabCheckoutBlock`). This is the
  exact mitigation the 07-24 and 07-26 GA4 reports hypothesized was needed for the
  Facebook/Instagram 3D-Secure checkout failure — it's already built. What the GA4 data
  still shows, though (per `GA4_ANALYSIS_2026-07-26.md`): `facebook / paid_social` (360
  users, 39.6% of all traffic) still converts at ~$0 revenue, and 17.1% of all page views
  are followed by an `in_app_browser_detected` event. That means either the mitigation
  isn't fully closing the gap (people see the warning and still don't complete checkout
  elsewhere) or the drop-off is happening before the banner ever shows. This report can't
  tell which without page-level/event-level GA4 data that isn't in the current export —
  flagged below as a data-gap recommendation.

## Finding 3: blog schema and metadata are consistently correct

All 11 posts (the 5 flagged above plus the 6 others) carry matching `BlogPosting` +
`Organization` JSON-LD, unique per-post meta titles and descriptions (spot-checked, no
copy-pasted boilerplate), correct canonical tags matching their own URL, and alt text on
every image in the 5 flagged posts (checked specifically since that's where I expected to
find gaps — found none). No action needed here.

---

## Recommendations

### NEEDS TAYLOR INPUT

1. **Confirm the CTA-consistency fix below is wanted before it's applied.** The change
   itself is mechanical (swap an href, add a missing CTA block using the existing
   `.post-cta` pattern/copy voice already used on the other 6 posts) but touches on-page
   copy and button placement, which this run's hard rule treats as a judgment call, not a
   pure zero-risk fix, since it involves writing new CTA copy for 4 of the 5 posts (only
   `first-timer-guide.html` is a pure href swap with no new copy needed).
   **Re-check in ~1 week:** once fixed, there's currently no GA4 page-level report in this
   export to verify it — see recommendation 2 below.
2. **Facebook `paid_social` still at ~$0 revenue despite the in-app-browser mitigation
   already being built.** This isn't a new finding (it's in the 07-24 and 07-26 reports
   too) but this run confirms the code-side fix Taylor may have been expecting already
   exists on `lp.html`. The open question is now behavioral/data, not "build the
   mitigation" — worth deciding whether it's worth instrumenting `iabBanner`/
   `iabCheckoutBlock` show/click events in GA4 to see if users are seeing the warning and
   not acting on it, or not reaching it at all.
   **Re-check in ~1 week:** `GA4_ANALYSIS` Revenue by Source — has `facebook /
   paid_social` or `facebook / social` produced any transactions since 07-26?

### Proposed zero-risk fixes (NOT applied — for a human, or a future approved code night)

3. **`first-timer-guide.html`: change the existing `.post-cta` button from `href="/events"`
   to `href="/event"`.** This is a pure href swap — the button text ("Browse Upcoming
   Events") and surrounding copy could stay as-is, or be updated to "Reserve Your Spot" to
   match the other 6 posts exactly. Lowest-risk item on this list since no new copy is
   strictly required.
4. **Add a `.post-cta` block (matching the other 6 posts' pattern and copy voice) to the
   end of `first-timer-guide-lancaster.html`, `lancaster-date-night-spots.html`,
   `philly-date-night-spots.html`, and `singles-weekend-getaways-near-philadelphia.html`,
   linking to `/event`.** Flagged as "proposed" rather than "zero-risk" above because it
   requires drafting new CTA copy for 4 posts — a small copy decision, not a mechanical
   change, so it's listed here for visibility but really belongs in the "NEEDS TAYLOR
   INPUT" copy-judgment bucket if the exact wording matters to you.
5. **Data-gap recommendation, not a code fix:** none of the 16 GA4 CSVs in this export
   include a "Pages and screens" / landing-page-level report, so neither this report nor
   the 07-24/07-26 GA4 reports could confirm which specific pages (these 5 posts
   included) are actually getting meaningful organic traffic before recommending a fix.
   The blog-CTA recommendation above is based on code-pattern inconsistency, not GA4
   numbers, unlike everything in the 07-26 report. Adding a landing-page/page-path GA4
   export to the nightly drop would let a future run tie specific-page recommendations to
   specific traffic/engagement numbers, per this file's own stated preference.
   **Re-check in ~1 week:** whether a "Pages and screens" or similar export lands in this
   folder alongside the usual GA4 CSVs.

---

## Method notes / caveats

- **No page-level GA4 data available.** This audit is structural/code-based (reading
  actual page source and comparing patterns across the 11 blog posts), not traffic-driven,
  because the GA4 export in this folder has no landing-page or pages-and-screens report.
  Per this file's own instructions, I did not guess at which pages get real traffic —
  Finding 1 is presented as a consistency/pattern gap, not a "this page underperforms by X%"
  claim.
- **Audit method:** grepped all 11 blog posts for `href="/event"` and `href="/events"`,
  then read the surrounding markup for every match to confirm CTA context (not just
  counting occurrences) before drawing Finding 1's table. Also spot-checked meta tags,
  canonical tags, JSON-LD schema type, and image alt text across the same 11 posts plus
  `about.html`, `index.html`, and `lp.html`.
- **Did not review:** `public/events.html`, `public/event.html`, `public/city.html`,
  `public/getaways.html`, or any of the account/checkout-flow pages this run — scope was
  limited to what a single night's SEO/CTA pass could reasonably cover thoroughly rather
  than skimming everything shallowly.
- **No prior Prompt 6 run exists** to diff against (checked the NIGHTLY RUN LOG — this is
  the first Prompt 6 execution), so there's no week-over-week comparison possible for this
  finding the way the GA4 reports compare across nights.
- No code files were modified for any purpose other than reading — confirmed via
  `git status`/`git diff` in the clone before writing this report (clean working tree, only
  this new report file exists locally, and even that was written outside the repo — see
  delivery note).

---

## Delivery note — why there's no PR tonight

Same root cause as 2026-07-25 and 2026-07-26: this Cowork session's folder connection
only includes `Business Plan\files\Night Tasks\`, not the `sparkdate` repo root. That
means `.claude-gh-token.txt` (expected at `<repo root>/.claude-gh-token.txt`) is not
reachable, so no authenticated `git push` was possible. Per this file's hard rule ("if
missing... STOP and report a token problem — do not improvise"), no substitute credential
was used.

I *was* able to `git clone https://github.com/taylorancapital/sparkdate.git` **without** a
token (the repo is publicly readable) — same workaround the 07-26 run used — which is how
all the code cross-references above were done. A tokenless clone has no push rights, so
this report could only be saved locally, not opened as a PR.

**Recommendation (repeating the last two nights' ask):** confirm the Cowork folder
connection for this scheduled task includes the repo root (not just Night Tasks) before
the next scheduled run, so the clone/branch/push workflow in this file's instructions can
actually execute end-to-end. Until that's fixed, expect every future run to land here as a
Night-Tasks-folder markdown file rather than a PR.

This report has been placed in the Night Tasks folder as
`SEO_CTA_HEALTH_CHECK_2026-07-28.md` for your morning review, and the run is being logged
in `sparkdate-nightly-claude-code-prompts.md`.
