# Dead Link / Broken Asset Sweep — 2026-07-28

**This run made zero code changes.** Report only, per the nightly automation's hard rule.
The only file added by this run is this report.

## Why this focus was picked

Per the prompt library's rotation logic, the flagship data-driven pick (Prompt 9, GA4
analysis) was skipped: the same GA4 export in the Night Tasks folder had already been
analyzed twice (`GA4_ANALYSIS_2026-07-24.md`, `GA4_ANALYSIS_2026-07-26.md`), and the most
recent logged run (2026-07-28, Prompt 6 / SEO-CTA health check) had already re-confirmed
no fresh export had landed. Prompt 6 itself was also just run today, so repeating it would
violate the "don't repeat the same analysis two nights running" rule.

No item from the **M1–M8 maintenance rotation** has ever been run in this file's logged
history, despite the rotation guidance explicitly saying idle nights should default to
that list. **Prompt M1 (Dead Link / Broken Asset Sweep)** was picked as the most
mechanical, lowest-ambiguity option that needs no data drop.

## Method

Crawled all 28 public HTML pages — 17 top-level `public/*.html` files and 11
`public/blog/*.html` posts — and extracted every `href=`, `src=`, and CSS
`background-image: url(...)` reference via a regex-based scan (not a full DOM parser).

For each reference:
- **Internal links** (relative paths, or absolute `https://sparkdate.date/...` URLs) were
  checked against the union of: (a) every actual file under `public/`, (b) every `source`
  in `vercel.json`'s `rewrites` array (e.g. `/event`, `/blog/what-to-wear`, `/lancaster`),
  and (c) every `source` in `vercel.json`'s `redirects` array (`/flyer`, `/card`,
  `/founding`). This mirrors the prompt's instruction to check against Vercel's actual
  routing, not just "does a same-named file exist."
- **Images** (`<img src>` and CSS background-images) were resolved relative to their
  source file's own directory (so `public/blog/*.html` files resolve relative paths
  against `public/blog/`, not `public/`) and checked against the real file tree.
- **External links** (`mailto:`, `tel:`, `#anchor`, and `http(s)://` URLs on other
  domains) were counted but not individually checked for live status — see Caveats.

## Findings

**Zero broken internal links. Zero broken image references.** All 28 pages passed clean.

Three regex matches were initially flagged and then excluded as false positives after
reading the surrounding code — they're JavaScript template-literal hrefs generated at
runtime by client-side code, not static broken hardcoded links:
- `public/account.html:1362` — `` href="${t.href}" `` inside a share-link generator
  (`t` is a share-target object built in JS; the real href is populated at render time).
- `public/admin.html:3486` — `` href="${safe(r.profileUrl)}" `` inside the admin CRM
  table's row-rendering template.
- `public/event.html:1110` — `{href}` is inside a **code comment**
  (`// Upsert a <link rel="{rel}" href="{href}"> into <head>`), not markup at all.

None of these are static-crawl-checkable; a bug in the underlying data (e.g. a malformed
`profileUrl` in Firestore) wouldn't be caught by this method regardless.

Also spot-checked: no page currently links to `/founding`, `/flyer`, or `/card` from
internal nav/body content — those three `vercel.json` redirects exist for
external/offline use (QR codes, business cards, an old founding-member page) rather than
being referenced from the site's own pages, which is expected and not a bug.

Canonical tags on all 11 blog posts were spot-checked against `vercel.json`'s blog
rewrites and all resolve to a real route (e.g. `philly-date-night-spots.html`'s
canonical → `/blog/philly-date-night-spots` → rewrite exists).

## NEEDS TAYLOR INPUT

None. This is a clean-bill-of-health result — nothing surfaced that requires a judgment
call.

## Proposed zero-risk fixes (NOT applied — for a human to do)

None needed. Nothing broken was found to fix.

## What to re-check in ~1 week

Not GA4-driven this time (this wasn't a GA4 analysis), but the practical trigger is
**any change to nav/footer links, a new blog post, a new city page, or a `vercel.json`
edit** — re-run this same M1 sweep after those, since that's exactly the class of change
that creates dead links. The Colorado Springs launch (Prompt 7's punch list) in
particular will add several new internal links (footer links, a new city route) worth
re-sweeping once that ships.

## Caveats / method notes

- **Regex-based, not a full HTML/DOM parser.** Spot checks across several pages (view raw
  matches vs. rendered structure) found no cases where this missed a real link, but a
  parser could theoretically catch edge cases (unusual quoting, multi-line attributes)
  that a regex could miss. No such case was observed here.
- **External links were counted, not verified.** Each page carries 1–7 external links
  (social icons, the GA4/Meta Pixel `<script src>` tags, footer social links) that were
  not checked for live HTTP status.
- **No live production check was possible.** This analysis sandbox has no general
  network egress (a `curl` test against `https://sparkdate.date/*` for 12 representative
  routes returned connection failures across the board — only the git host is reachable).
  This is a **source-level** check only: `vercel.json`'s declared routing cross-referenced
  against the real file tree, not a live crawl of the deployed site. Same caveat as the
  07-26 and 07-28 (SEO/CTA) reports.
- **Coverage is complete, not a sample.** All 28 public HTML pages that exist in the repo
  were checked — 100%, not a subset.
