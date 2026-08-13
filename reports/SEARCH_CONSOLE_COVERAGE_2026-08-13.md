# Search Console Coverage — 2026-08-13

Read-only analysis of a Google Search Console "Page indexing" coverage export
(`sparkdate.date-Coverage-2026-08-13/`: `Chart.csv`, `Critical issues.csv`,
`Metadata.csv`, `Non-critical issues.csv`). One code change came out of it, described
under Finding 1 and shipped alongside this report; everything else is either expected
behavior or needs the actual URL lists from GSC before it can be acted on.

## Data used

- `Chart.csv` — daily Not indexed / Indexed / Impressions, **2026-07-23 → 2026-08-06**
  (15 rows). Note the chart data ends a week before the export date; GSC lags.
- `Critical issues.csv` — 6 issue rows, counts only.
- `Non-critical issues.csv` — **header row only, no issues**.
- `Metadata.csv` — `Sitemap: All known pages` (report is scoped to all discovered
  URLs, not filtered to the submitted sitemap).

**Important limitation, stated up front:** this export contains *counts only, no URLs*.
Every "which page is this?" below is a candidate, not a confirmation. To resolve them,
open each issue row in GSC and read its URL list, or run the offending URL through the
URL Inspection tool.

## The numbers

| Date | Indexed | Not indexed | Impressions |
|---|---|---|---|
| 07-23 | 20 | 4 | 14 |
| 07-24 → 08-04 | 20 | 7 | 8–39 |
| 08-05 | 19 | 9 | 30 |
| 08-06 | 19 | 9 | 7 |

Two step changes, both unexplained by anything in this export:

- **07-24: not-indexed 4 → 7** (+3), indexed unchanged at 20. Three newly-discovered
  URLs that were never going to be indexed — consistent with the 3 redirect pages
  below being crawled for the first time.
- **08-05: indexed 20 → 19, not-indexed 7 → 9.** One page left the index and two more
  became not-indexed.

**The 08-05 shift is NOT explained by the noindex work.** PR #158 (adding
`noindex, nofollow` to `account.html` / `admin.html`) came out of
`reports/SITEMAP_ROUTES_DIFF_2026-08-10.md` and shipped on/after 08-10 — four-plus days
after this shift, and after this chart's data ends entirely. Whatever moved on 08-05 is
something else, and this export doesn't say what. Worth pulling a fresh coverage export
once GSC data catches up past 08-11 to see the noindex change land separately.

Impressions are noisy and low (7–39/day) with no trend either direction. At this volume
day-to-day movement is not signal.

The issue counts reconcile exactly against the chart, which is a good sign the export is
internally consistent: 3 + 2 + 1 + 1 + 1 + 1 = **9 = the 08-06 not-indexed figure.**

## Findings

### 1. `robots.txt` was blocking the two pages we had just told to de-index — FIXED

`public/robots.txt` disallowed `/account` and `/admin`. Both pages also carry
`<meta name="robots" content="noindex, nofollow">` (added in PR #158, whose stated intent
was "never index").

These two mechanisms cancel each other out. Google's documented behavior: for a noindex
rule to take effect the page must be crawlable, because the crawler has to actually fetch
the page to see the tag. A robots.txt-disallowed URL is never fetched, so the noindex is
never read — and the URL can still appear in results as a bare link if anything points at
it, with no way to request removal.

So PR #158's tag was inert on exactly the two pages it was written for. GSC reporting
`Blocked by robots.txt: 1 page` is consistent with this, though as noted the export
doesn't name the URL.

**Fix applied:** dropped the `/account` and `/admin` Disallow lines so the noindex tags
are actually reachable and can do their job. `Disallow: /api/` is kept — those endpoints
return JSON, carry no meta tags, and have nothing to de-index. Both pages are auth-gated
client-side, so a crawl only ever reaches an empty shell.

Expect `Blocked by robots.txt` to go to 0 and `Excluded by 'noindex' tag` to rise
correspondingly over the next few crawl cycles. That is the intended outcome, not a
regression.

### 2. `Page with redirect` (3 pages, validation **Failed**) — expected, no action

`vercel.json` defines exactly the redirects that would produce this: `/flyer`, `/flyer/`,
`/card` → `/lp` (temporary), and `/founding` → `/` (permanent). Redirecting URLs are
correctly not indexed; the destination is what gets indexed.

The `Failed` validation state reads alarming but isn't: it means a fix was submitted for
re-checking and Google confirmed the URLs still redirect — which they do, deliberately
and permanently. There is nothing to fix, and re-requesting validation will fail again
for the same reason. These are campaign entry points (QR codes, flyers), not pages meant
to rank.

### 3. `Not found (404)` (1 page) — needs the URL, can't diagnose from counts

Something Google knows about returns 404. Without the URL this is not diagnosable from
the repo. Two plausible sources worth checking first when the URL is available: a
`/event?id=<id>` for an event since deleted from Firestore (`api/next-event.js` correctly
404s an unresolvable id), or a URL from an old campaign//external link that never existed.
If it's a dead event id, no action — that's correct behavior and the URL will age out.

### 4. Duplicate-URL surface: every page answers at both `/route` and `/route.html`

Verified live against production — all return 200:

```
/city.html 200   /index.html 200   /events.html 200
/about.html 200  /signup.html 200  /account.html 200
```

So `/events` and `/events.html` are two URLs serving identical content, and so on for
every page. This is standard Vercel static-file behavior alongside the `vercel.json`
rewrites, not a misconfiguration per se.

It is **mostly already handled**: each page carries a self-referencing canonical pointing
at the *clean* URL (`events.html` → `https://sparkdate.date/events`), so a crawl of the
`.html` variant consolidates correctly. That is almost certainly what
`Alternate page with proper canonical tag: 1 page` is reporting — the mechanism working
as designed.

**One exception worth flagging, deliberately not changed here:** `public/city.html:9`
defaults its canonical to `https://sparkdate.date/` — the homepage. The server-side
render in `api/next-event.js` replaces this with the correct per-city URL for
`/philadelphia` and `/lancaster`, so the real city pages are fine. But the raw
`/city.html`, which is publicly reachable, declares the homepage as its canonical, which
is simply false.

I did not change it, because the safe-looking fixes are the dangerous ones: `city.html`
is the same file the server renders from, so adding a `noindex` to the template would
propagate straight into `/philadelphia` and `/lancaster` and de-index two of the site's
actual money pages. Any fix here needs to happen in `renderCityPage()`'s replacement
logic, not the template's static defaults, and deserves its own change with its own
verification. Flagged rather than guessed at.

### 5. `Duplicate, Google chose different canonical than user` (1 page) — needs the URL

Google found a declared canonical it disagreed with and picked its own. Given Finding 4,
the leading candidate is `/city.html` (declaring the homepage as canonical while serving
different content — exactly the kind of mismatch Google overrides). But that is inference
from the counts, not evidence. Get the URL from GSC before acting.

## What to do next

1. **Merged/deployed already:** the `robots.txt` fix (Finding 1). Nothing else to do for it.
2. **Pull the URL lists** for `Not found (404)` and `Duplicate, Google chose different
   canonical` in GSC — those are the only two findings that might hide a real problem, and
   neither is diagnosable from counts alone.
3. **Re-export coverage once GSC data passes 2026-08-11** so the PR #158 noindex change
   and the robots.txt fix show up as distinct, attributable movements rather than blending
   into the unexplained 08-05 step.
4. **Leave the redirects alone** (Finding 2) and stop re-requesting validation on them.
5. **`city.html`'s default canonical** (Finding 4) — worth a separate, carefully-verified
   change if the 404/duplicate URLs turn out to implicate it.

### Files referenced
- `public/robots.txt` — changed (Finding 1)
- `public/city.html:9`, `api/next-event.js` (`renderCityPage`) — read-only, flagged not changed
- `vercel.json` — read-only, explains Finding 2
- `lib/sitemap-xml.js` — read-only; `STATIC_PATHS` correctly excludes all noindex routes
