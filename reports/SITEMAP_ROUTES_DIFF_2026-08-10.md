# Sitemap vs. Live Routes Diff — 2026-08-10 (Nightly Automation, Prompt M3)

**This run made zero code changes.** It is a read-only diff of `lib/sitemap-xml.js`'s
`STATIC_PATHS`, `vercel.json`'s rewrites, and the real files under `public/`. Nothing in
`public/`, `api/`, or `lib/` was touched. The only change in this branch is this report.

## Why M3 tonight, not GA4 again

A fresh GA4 export (window `20260519-20260809`) is sitting in the Night Tasks folder, but
its numbers are identical to what's already been analyzed and pushed: branch
`claude/ga4-analysis-2026-08-10` (pushed earlier tonight, commit `4d367f9`, PR not yet
opened) already covers this data — Revenue by Source/Revenue Trend/Key Events Breakdown in
tonight's freshest CSVs still read **$481.83 / 18 purchases / 166 key events**, exactly
matching that report's headline numbers. No new transaction landed between the `...-20260808`
window that report analyzed and the `...-20260809` window sitting in the folder now, so
re-running Prompt 9 tonight would just duplicate that work. Per this file's own rotation
guidance (fill nights with no *new* data with the M1–M8 maintenance rotation), and since M1
(dead-link sweep) ran 2026-07-28 and M2 (schema re-validation) ran 2026-07-31, tonight picks
**M3 — Sitemap vs. Live Routes Diff**, which hasn't run yet.

## Method

Compared three sources directly in a fresh clone of `main` (commit `dbbb6e7`):
1. `lib/sitemap-xml.js`'s `STATIC_PATHS` array (21 entries)
2. `vercel.json`'s `rewrites` array (the actual live routing table)
3. The real file tree under `public/` (17 top-level `.html` files, 11 `public/blog/*.html`
   files)

Plus a `noindex` meta-tag sweep across every page reachable via a live route, to check for
the specific contradiction M3 asks about (a page both noindexed and sitemap-listed) and its
mirror image (a page deliberately excluded from the sitemap but not actually noindexed).

## Result 1: Sitemap → live routes — clean, no dead sitemap entries

All 21 `STATIC_PATHS` entries resolve to a real `vercel.json` rewrite and a real file in
`public/`: `/`, `/events`, `/about`, `/signup`, `/philadelphia`, `/lancaster`, `/blog`, the 11
`/blog/*` posts, `/getaways`, `/terms`, `/privacy`. Zero broken sitemap entries.

Event pages (`/event?id=...`) are correctly absent from `STATIC_PATHS` — they're added
dynamically by `api/next-event.js`'s `renderSitemap()` (line 348-375), which queries Firestore
for events with a future `date`, excludes past ones, and appends each as its own `<url>` with
a real `lastmod`. This wiring was read directly and confirmed live (not just assumed from the
code comment): `renderSitemap()` is called from the `?render=sitemap` branch of the handler,
which `vercel.json`'s `/sitemap.xml` rewrite points at. Past events are correctly excluded from
both the sitemap (line 360's cutoff) and get their own `noindex` tag from `renderEventPage`
(line 138) — the two exclusions are consistent with each other, not a partial fix.

## Result 2: Live routes → sitemap — six pages correctly excluded, all mechanically sound

Routes present in `vercel.json` but absent from `STATIC_PATHS`: `/account`, `/admin`,
`/profile`, `/lp`, `/checkin`, `/matches` (plus `/event`, `/event/:id`, `/sitemap.xml` itself,
which are handled separately as above). All six are personal-data or app-functionality pages
(account settings, admin panel, user profile, paid-campaign landing page, event check-in tool,
matches view) that should not be indexed — correctly excluded, not an oversight.

## Result 3: noindex audit — found a real, specific gap

Checked every page reachable by a live route for a `<meta name="robots" content="noindex">`
tag. Of the six pages correctly excluded from the sitemap above:

- **Have `noindex`:** `checkin.html` (`noindex, nofollow`), `lp.html` (`noindex, nofollow`),
  `matches.html` (`noindex, nofollow`), `profile.html` (`noindex, nofollow`) — 4 of 6.
- **Missing `noindex` entirely:** **`account.html` and `admin.html`** — confirmed by a
  full-file grep for `robots` on both files, zero matches. Both pages have the canonical-domain
  guard script (www→apex redirect) but no robots meta tag at all.

This is the inverse of the "noindexed but still in the sitemap" case the M3 prompt names, but
the same underlying bug class it's checking for: a page that was clearly meant to stay out of
search (it's excluded from `STATIC_PATHS`, and its four siblings in the same
"personal/functional, not for indexing" category all carry `noindex`) has no server-side
signal telling a crawler that. Sitemap exclusion alone does not stop a search engine from
indexing a page if it discovers the URL another way (a stray internal link, a browser-history
leak, a third-party crawl of the live site); `noindex` is the actual instruction that prevents
that. `/admin` is the higher-priority of the two — it's the site's admin panel; being merely
"not in the sitemap" is not the same protection as `noindex`, and this is a defense-in-depth
gap on top of whatever auth already gates the page (not a replacement for auth, but a real
missing layer).

No fix was applied — under this task's standing hard rule, code changes are out of scope for
this automation regardless of how small. The fix itself would be a one-line addition to each
file's `<head>` (`<meta name="robots" content="noindex, nofollow">`, matching the exact string
already used on `checkin.html`/`matches.html`/`profile.html`), directly analogous to the
existing pattern — flagging as a proposed zero-risk fix for a human to apply, not applying it.

## Result 4: canonical tags — no issues found

Every `STATIC_PATHS` page (8 top-level + 11 blog posts) has exactly one `<link rel="canonical">`
tag, and every value is correct and page-specific (e.g. `blog/dating-app-burnout` canonicalizes
to `.../blog/dating-app-burnout`, not copy-pasted from another post). No duplicate-canonical or
missing-canonical issues.

## Side note (not this prompt's scope, logged for continuity)

`api/next-event.js`'s `CITY_SEO` map still only has `philadelphia` and `lancaster` — no
`colorado-springs` entry yet. This is Prompt 7's punch list item 1, still open, not
attempted here (M3 is routes/sitemap only; Prompt 7 is a separate, deliberately-scoped task
per the prompt library, and its own instructions say not to half-wire a city with no live
venue/event data — status unchanged from prior reports, mentioned only so this doesn't read as
a missed finding).

## Proposed zero-risk fixes (NOT applied — for a human to do)

1. Add `<meta name="robots" content="noindex, nofollow">` to `public/account.html`'s `<head>`,
   matching the pattern already on `profile.html`/`matches.html`/`checkin.html`.
2. Add the same tag to `public/admin.html`'s `<head>` — highest priority of the two given it's
   the admin panel.

## NEEDS TAYLOR INPUT

None — both findings above are mechanical (missing a tag that four sibling pages already have
in the same category) rather than judgment calls. Flagging them as proposed fixes rather than
applying them only because of this task's blanket no-code-changes rule tonight, not because
either is ambiguous.

## What to re-check in ~1 week

- Confirm `account.html`/`admin.html` picked up `noindex` (once applied) by checking Google
  Search Console's "Page indexing" report for either URL, or a `site:sparkdate.date/admin`
  search.
- Re-run this same M3 diff after any new page/route is added (e.g. once Colorado Springs goes
  live) to confirm the sitemap and route table stay in sync as the site grows past three cities.

## Caveats / method notes

- Source-level check only, no live network egress in this sandbox (consistent with every prior
  nightly report) — everything above comes from a fresh read-only clone of `main` at commit
  `dbbb6e7`, not a live crawl of sparkdate.date.
- Did not re-verify GA4 numbers beyond the specific spot-check needed to justify skipping
  Prompt 9 tonight (see "Why M3 tonight" above) — the full GA4 analysis for this window already
  exists in branch `claude/ga4-analysis-2026-08-10`.
- Scope was strictly sitemap/routes/canonical/noindex, per Prompt M3's own text — did not
  re-audit meta descriptions, alt text, or schema.org blocks (those are M2/M7's job, M2 already
  ran 2026-07-31).
