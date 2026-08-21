# Tonight's Claude Code Prompt — 2026-07-24

**Prompt chosen:** Prompt 9 — GA4 Analysis → Site Improvement Suggestions

**Why this one:** Fresh GA4 CSV exports are already sitting in the Night Tasks folder
(24 `download*.csv` files) and no Prompt 9 run appears yet in the library file's
"NIGHTLY RUN LOG." Per the file's own "ROTATION SUGGESTION" section, Prompt 9 is the
flagship pick whenever a fresh GA4 export is present. Prompts 3, 4, 5 are still explicitly
blocked (non-GA4 data drop paths unresolved) and were not considered.

**Paste everything between the lines below into Claude Code, unedited:**

---
I drop GA4 Analytics CSV exports into the Night Tasks folder
(C:\Users\penns\source\repos\sparkdate\Business Plan\files\Night Tasks\).
Read whatever GA4 CSV(s) are currently in that folder — do NOT assume a
specific filename or date; list the folder first and use what's actually
there (there may be one file or several different GA4 report types:
traffic acquisition, pages and screens, events, landing pages, etc.).

GA4 CSV quirks to handle so you don't misread the data:
- GA4 exports usually begin with commented metadata lines starting with
  "#" (report name, date range, filters), then a blank line, THEN the
  real header row and data. Skip the # block; parse from the real header.
- A single export often contains MULTIPLE tables stacked in one file,
  each with its own "# " title and header row. Detect and parse each
  separately rather than treating it as one flat table.
- Column names vary by report ("Session primary channel group",
  "Page path and screen class", "Event name", "Sessions", "Engaged
  sessions", "Engagement rate", "Average engagement time", "Total
  users", "Key events", "Conversions", etc.). Read the actual headers;
  don't hardcode.
- If the export is empty, malformed, or you can't confidently identify
  the columns, STOP and say so in the PR rather than guessing at numbers.
- GA4 REVENUE IS NOT TOTAL REVENUE — it is own-site revenue only. Never
  present a GA4 revenue figure as the business's sales, and never treat a
  gap between it and the admin dashboard as a tracking bug without
  checking this first. Tickets sold ON Eventbrite or Meetup are imported
  server-side by enrollEventbriteOne() in api/lead-signup.js, which fires
  no gtag, no fbq, and no Meta CAPI Purchase (its only CAPI calls are
  Lead events). Those buyers never load a page of ours, so there is
  nothing client-side to fire and they are structurally invisible to both
  GA4 and Meta. Measured 2026-08-21: Firestore held $1,629.90 across 97
  tickets, of which $870.18 (61 tickets) was eventbrite_import and $24.99
  was meetup_import — 55% of revenue that GA4 cannot see. GA4 reported
  $743.73, which reconciles to within ~1% of the $734.73 of genuinely
  own-site sales. GA4 was accurate for its scope; the scope is the point.
  The admin dashboard (Firestore) is the revenue source of truth. Also
  note the "eventbrite / listing" source row in GA4 is NOT those imported
  sales — it is people who clicked an Eventbrite listing and then bought
  on our own site.
- Meta's campaign-level purchase counts are AD-ATTRIBUTED conversions, a
  deliberately stricter measure than "all purchases." A number far below
  the site's total purchase count is expected and is not on its own
  evidence that the pixel or CAPI is broken.

Then analyze with SparkDate's actual goal in mind — organic traffic that
converts to TICKET SALES, not just newsletter signups — and produce
concrete, specific improvement suggestions tied to the numbers:
- Which pages get real traffic but underperform on engagement rate /
  average engagement time / conversions? For each, open the actual page
  source in public/ and form a specific hypothesis (weak or missing
  above-the-fold CTA, message mismatch vs. the traffic source, slow or
  render-blocking assets, no visible path to /event, mobile-specific
  problems if the data is segmented by device).
- Which channels/landing pages drive the traffic that actually converts
  vs. bounces — and does the site make the most of the good ones (clear
  path to a bookable event) and shore up the bad ones?
- Any page with meaningful organic traffic whose only conversion path is
  a newsletter signup rather than a ticket — flag it; that's leaving
  ticket sales on the table.
- Compare against a prior GA4 export if one is in the folder, so you can
  call out real week-over-week movement instead of a single snapshot.

Split your output into (a) zero-risk fixes you can safely make directly
— a dead link, a missing/weak meta description, a missing alt text, an
obviously broken or absent CTA on a high-traffic page — and (b)
judgment-call suggestions (copy changes, tone, layout, pricing-adjacent,
anything touching brand voice or legal-sensitive areas) which go in the
PR description under "NEEDS TAYLOR INPUT" rather than being decided
unilaterally. For every suggestion, cite the specific GA4 number that
justifies it and say what to re-check in GA4 in ~1 week to confirm it
worked.

Write a short markdown summary (GA4_ANALYSIS_2026-07-24.md) capturing the
read of the data and the ranked suggestions, and commit it alongside any
zero-risk code fixes. Branch off main (nightly/2026-07-24), open a PR, do not
merge. Do NOT move, rename, or delete the source GA4 CSVs.
---

**Repo:** `C:\Users\penns\source\repos\sparkdate` (GitHub: `taylorancapital/sparkdate`)

**Note on branch naming:** this file says `nightly/2026-07-24` per the prompt library's
stated convention, but the repo's actual branch history (90+ branches) uses
`claude/<short-description>` exclusively — no `nightly/*` branch has ever been created.
Use whichever convention your local Claude Code setup actually follows; the important
part is a fresh branch off `main`, a PR, and no auto-merge.
