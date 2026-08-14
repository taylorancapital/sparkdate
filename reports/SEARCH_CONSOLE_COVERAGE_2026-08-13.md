# Search Console Coverage Review — 2026-08-13

**This run made zero code changes, and none are proposed.** Read-only review of the
Google Search Console "Page indexing" export (`sparkdate.date-Coverage-2026-08-13/`:
`Chart.csv`, `Critical issues.csv`, `Non-critical issues.csv`, `Metadata.csv`), checked
line-by-line against the current codebase. Headline: **7 of the 9 non-indexed pages are
deliberate and correct**, and the technical SEO surface this export can see is clean.

## The data

| Date range | Indexed | Not indexed | Total known |
|---|---|---|---|
| 2026-07-23 | 20 | 4 | 24 |
| 2026-07-24 → 08-04 | 20 | 7 | 27 |
| 2026-08-05 → 08-06 | 19 | 9 | 28 |

Impressions ranged 7–39/day across the window with no visible trend (high 39 on 07-26,
low 7 on 08-06). `Non-critical issues.csv` is empty — header row only, zero rows.
`Metadata.csv` records the scope as "All known pages" (not sitemap-filtered), which
matters for reading the redirect and robots.txt rows below: they cover URLs Google
discovered by any means, not just ones we submitted.

### Critical issues (9 pages, all six reasons)

| Reason | Source | Validation | Pages |
|---|---|---|---|
| Page with redirect | Website | **Failed** | 3 |
| Excluded by 'noindex' tag | Website | Not started | 2 |
| Not found (404) | Website | Not started | 1 |
| Blocked by robots.txt | Website | Not started | 1 |
| Alternate page with proper canonical tag | Website | Not started | 1 |
| Duplicate, Google chose different canonical than user | Google systems | Not started | 1 |

## What's intentional (7 of 9 — no action)

**Page with redirect (3).** These are the marketing shortlinks in `vercel.json`:
`/flyer`, `/flyer/`, `/card` (→ `/lp` with UTM params, 302) and `/founding` (→ `/`, 301).
They redirect *by design* — that is the entire reason they exist. Confirmed none of them
appear in `lib/sitemap-xml.js`'s `STATIC_PATHS`, and a grep of `public/` found zero
internal `href` links to any of them, so Google is finding them from off-site (printed
flyers, QR codes, business cards — exactly as intended).

The **"Validation: Failed"** status on this row is the one thing worth explicitly
un-worrying about: it does not mean a fix broke. It means someone clicked "Validate fix"
in Search Console, Google re-crawled, and correctly found the URLs still redirecting.
Validation on an intentional redirect will fail every time it is run, forever. This row
should be left alone, not re-validated.

**Excluded by 'noindex' (2).** Six pages deliberately carry `<meta name="robots"
content="noindex, nofollow">`: `account.html`, `admin.html` (both added in #158),
`profile.html`, `checkin.html`, `lp.html`, `matches.html`. Only 2 show here because
Google reports only what it has actually crawled. Working as designed.

**Blocked by robots.txt (1).** `public/robots.txt` disallows exactly one path prefix,
`/api/`. Those endpoints return JSON, carry no meta tags, and have nothing to de-index.
Note this row is *not* evidence of the noindex-vs-robots conflict fixed in `41865ab` —
that commit stopped robots.txt from blocking `/account` and `/admin`, and the current
file correctly documents why those two are allowed to be crawled so their noindex tags
remain readable.

**Alternate page with proper canonical tag (1).** Normal canonical consolidation working
as intended — Google found a duplicate and honored our canonical. The phrase "with proper
canonical tag" is Google confirming we got it right.

## What can't be resolved from this export (2 of 9)

Both remaining rows need the actual URL, and **`Critical issues.csv` does not contain
URLs** — it only carries reason/source/validation/count. To act on either, open that row
in Search Console and copy the example URLs from the detail view.

**Not found — 404 (1).** Could be a genuinely stale inbound link, an old URL from before
a rename, or a typo'd external link. Harmless at this count either way; a 404 that
nothing links to costs nothing.

**Duplicate, Google chose different canonical than user (1).** This one is worth the
click, because it means Google actively disagreed with a canonical we asserted. The most
plausible candidate found by inspection: `/getaways` and `/events` carry substantially
overlapping getaway-package content (131 vs 92 occurrences of "getaway" respectively —
the package list is hand-duplicated across both, per this repo's no-shared-bundle
convention). If the flagged URL turns out to be `/getaways`, the fix is a content
decision (differentiate the two pages, or canonicalize one to the other), not a bug.
**Unverified** — stated as the leading hypothesis, not a finding.

## Canonical + sitemap audit (clean, no changes needed)

Checked directly rather than assumed:

- All 12 top-level `public/*.html` pages that should have one carry `rel="canonical"`;
  all 11 `public/blog/*.html` posts do too.
- `events.html`'s canonical is the bare `https://sparkdate.date/events`, with no query
  string. This matters more than it looks: every site-wide "Get Tickets" link now points
  at `/events?event=<id>` (the dialog deep-link retarget), so without a query-stripped
  canonical every event would spawn a duplicate `/events?event=…` URL. It resolves
  correctly as-is.
- `api/next-event.js` injects a real per-event canonical server-side (`:82`, `:122`) and
  a per-city canonical for `/philadelphia` and `/lancaster` (`:299`, `:307`) — both in the
  raw HTML, before JS runs.
- `renderSitemap` (`api/next-event.js:349-376`) excludes past events by start-time cutoff
  (`:362`), matching the `noindex` those same pages get from `renderEventPage`. So the
  sitemap never submits a URL it also tells Google not to index — the specific
  self-contradiction that would show up here as a real error, and doesn't.

## The finding that isn't in the "issues" list

Indexing health is not the problem. **20 indexed pages producing 7–39 impressions/day
is the problem.** Every technical gate a crawler passes through is working; there simply
isn't enough indexed content, or enough authority behind it, to surface in results at
meaningful volume. No amount of coverage-error cleanup moves that number — the 9 "errors"
above could all be resolved tomorrow and impressions would be unchanged, because 7 of
them are pages that *should* stay out of the index and the other 2 are single URLs.

Worth watching rather than acting on yet: indexed dropped 20 → 19 on 2026-08-05 while
total known rose 27 → 28. One page fell out of the index the same day one new page was
discovered. At n=1 that is noise, not a trend — but if indexed keeps drifting down while
not-indexed climbs, that becomes the thing to investigate.

### Source files
- `sparkdate.date-Coverage-2026-08-13/Chart.csv` (15 daily rows, 07-23 → 08-06)
- `sparkdate.date-Coverage-2026-08-13/Critical issues.csv` (6 reasons, 9 pages)
- `sparkdate.date-Coverage-2026-08-13/Non-critical issues.csv` (empty)
- `sparkdate.date-Coverage-2026-08-13/Metadata.csv` (scope: All known pages)
- Checked against: `public/robots.txt`, `lib/sitemap-xml.js`, `api/next-event.js`,
  `vercel.json`, and the canonical tags across `public/*.html` + `public/blog/*.html`
