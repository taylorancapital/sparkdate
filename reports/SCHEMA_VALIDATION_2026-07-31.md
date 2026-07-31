# Schema.org Re-validation — 2026-07-31 (Nightly Automation, Prompt M2)

**This run made zero code changes.** It is a read-only audit of every JSON-LD
structured-data block in the codebase. No files in `public/`, `api/`, or `lib/` were
touched. The only change in this branch is this report.

## Why Prompt M2 tonight, not Prompt 9 (GA4)

The 17 GA4 CSVs + `data.pdf` currently sitting in the Night Tasks folder all carry the
identical `# 20260519-20260730` date-range header, and the "Key Events Breakdown" /
"Campaign Performance" totals (150 key events, $432.85 revenue, 1,154 active users) match
`reports/GA4_ANALYSIS_2026-07-30.md` number-for-number — this is the same export already
analyzed last night, not a fresh drop. Per this file's own rule ("don't repeat the same
stale analysis two nights running") and Prompt 9's stated exception ("run it whenever a
fresh GA4 export is sitting there"), neither condition favors re-running Prompt 9 tonight.
GA4 (Prompt 9) has now run six consecutive nights (07-24, 26, 27, 28, 29, 30); Prompt M1
(dead link sweep) ran once (07-28); nothing else in the maintenance rotation (M2-M8) or
the business-prompt rotation (1, 2, 6\*, 7, 8) has run yet. Picked **M2 (Schema.org
Re-validation)** — no data drop required, ties directly into the "hardcoded value that
silently stops matching reality" bug class this file explicitly calls out, and is timely
given the Colorado Springs launch prep already underway in the codebase.

\*Prompt 6 (SEO/CTA) technically ran 2026-07-28 but was never committed to the repo (blocked
on repo-root access that session) — its findings live only in
`Night Tasks/SEO_CTA_HEALTH_CHECK_2026-07-28.md`, not in `reports/`. Not re-run tonight;
flagged under "NEEDS TAYLOR INPUT" below as worth a follow-up commit.

## Scope

Every `<script type="application/ld+json">` block, static and JS-injected, across:
- `public/*.html` (17 files) and `public/blog/*.html` (11 files) — 28 pages total
- The server-rendered injection in `api/next-event.js` (Event schema for `/event`)

19 pages carry at least one JSON-LD block (28 blocks total: 11 BlogPosting, 2 Organization,
1 Blog, 2 in `getaways.html` (ItemList + FAQPage), plus the dynamically-injected Event/
ItemList/EntertainmentBusiness/FAQPage blocks in `event.html`, `events.html`, and
`city.html`, which are built client-side via `document.createElement` rather than present
as static `<script>` tags in source — extracted and inspected separately). **All 28 static
blocks parse as valid JSON. No malformed JSON-LD found anywhere in the codebase.**

## Finding 1 (real, launch-blocking-adjacent): Colorado Springs' `addressRegion` fix is
## triplicated, and the documented punch list only covers one of the three copies

`api/next-event.js`'s `CITY_SEO`/`STATE_BY_CITY_NAME` map (lines 249-265) is the
documented, commented "add colorado-springs here and it fixes the schema" location —
this is item 1 of the `Night Tasks/sparkdate-nightly-claude-code-prompts.md` Prompt 7
("Colorado Springs Launch Punch List") and is confirmed correct: adding
`{ 'colorado-springs': { name: 'Colorado Springs', state: 'CO' } }` there would correctly
fix `addressRegion` for the **server-rendered** `/event` page via `stateForCity()`.

But `public/event.html:732` and `public/events.html:842` each carry their own,
independent, literal copy of the same map:
```
const STATE_BY_CITY_NAME = { philadelphia: 'PA', lancaster: 'PA' };
```
Both files' own comments ("keep all three in sync when a new city is added") confirm this
is known, intentional duplication — not an oversight in the code itself — but Prompt 7's
punch list (item 1) only names `api/next-event.js`. If item 1 is executed exactly as
written, the **server-rendered** initial HTML for a Colorado Springs event will correctly
carry `addressRegion: "CO"`, but the moment the page's own client-side JS re-renders the
schema tag (which happens on every page load, after Firestore data resolves — see
`event.html`'s and `events.html`'s own schema-injection functions), it will silently
overwrite that correct value with one that omits `addressRegion` entirely, because those
two files' local `STATE_BY_CITY_NAME` maps still won't have a `colorado-springs` entry.
Net effect for a real user/crawler: correct schema for a fraction of a second, then a
degraded one — a subtle, hard-to-notice regression at the exact moment Colorado Springs
goes live.

`public/city.html` does **not** have this problem — it derives `addressRegion` from its
own `CITIES` config's `state` field directly (already `'CO'` for the drafted
`colorado-springs` entry, confirmed at `public/city.html:409`), not from a separate
hardcoded map. No fix needed there.

**Proposed zero-risk fix (NOT applied):** when Prompt 7 item 1 is executed, also add
`colorado-springs: 'CO'` to the two literal maps at `public/event.html:732` and
`public/events.html:842` in the same commit — otherwise the punch list's stated "single
edit... fixes the addressRegion schema for Colorado Springs events" claim is incomplete.
**Re-check in ~1 week:** once Colorado Springs events exist, load a `/event?id=...`
Colorado Springs event page, wait for the client-side re-render, and confirm
`document.getElementById('event-jsonld').textContent` still shows `addressRegion: "CO"`
after the initial paint — not just in the server-rendered source.

## Finding 2 (real, mechanical): `Organization` schema's `areaServed` is a 2-city hardcode
## in both `about.html` and `index.html` — `index.html` isn't even on Prompt 7's list

Both `public/about.html` and `public/index.html` carry an identical `Organization`
JSON-LD block whose `areaServed` array lists exactly two `City` entries (Lancaster, PA and
Philadelphia, PA), hardcoded. Prompt 7 item 5 ("Philadelphia and Lancaster" →
three-city copy) already flags `about.html` for its **visible** marketing copy, but its
file list for that item is `about.html, events.html, getaways.html` — `index.html` isn't
named there, and neither file's list covers the **structured-data** `areaServed` field
specifically (a different, non-visible piece of content that needs the same update).

**Proposed zero-risk fix (NOT applied):** once Colorado Springs is ready to go live, add a
third `areaServed` entry (`{"@type":"City","name":"Colorado Springs","address":{"@type":
"PostalAddress","addressRegion":"CO"}}`) to the `Organization` schema in both
`about.html` and `index.html`, and note `index.html` alongside `about.html` in Prompt 7's
item 5 file list so it isn't missed. **Re-check in ~1 week (post-launch):** Google's Rich
Results Test on `/` and `/about` should show all three cities in the parsed
`areaServed` field.

## Finding 3 (zero-risk, mechanical): all 11 `BlogPosting` schemas omit `image`, despite
## every post already having a real image via `og:image`

None of the 11 blog posts' `BlogPosting` JSON-LD blocks include an `image` field — Google
explicitly lists `image` as a recommended property for `BlogPosting`/`Article` rich
results (missing it doesn't invalidate the schema, but can affect rich-result
eligibility). All 11 posts already have exactly one `og:image` meta tag with a real image
URL — this is a pure mechanical copy, no new asset or copy needed.

**Proposed zero-risk fix (NOT applied):** add `"image": ["<the post's own og:image URL>"]`
to each of the 11 `BlogPosting` blocks, pulled directly from that same page's existing
`<meta property="og:image">` tag. **Re-check in ~1 week:** re-run Google's Rich Results
Test against 2-3 posts and confirm `image` now parses; no traffic-side metric to check
since this doesn't change what's rendered, only what's declared.

## Finding 4 (zero-risk, mechanical): `mainEntityOfPage` is inconsistent across the 11
## `BlogPosting` schemas — 4 posts don't match the other 7's own established pattern

7 of 11 posts (`conversation-starters`, `dating-app-burnout`, `how-same-night-matching-works`,
`how-to-ask-for-a-second-date`, `lancaster-date-night-spots`,
`signs-your-first-date-is-going-well`, `singles-weekend-getaways-near-philadelphia`) include
both `url` and `mainEntityOfPage` (set to the same canonical post URL). 4 posts don't match
that pattern:
- `first-timer-guide-lancaster.html` — has `url`, missing `mainEntityOfPage`
- `first-timer-guide.html` — has `url`, missing `mainEntityOfPage`
- `philly-date-night-spots.html` — has `url`, missing `mainEntityOfPage`
- `what-to-wear.html` — missing **both** `url` and `mainEntityOfPage`

Not a hard schema-validity error (`mainEntityOfPage` isn't strictly required), but it's an
established, repeated in-codebase convention that these 4 posts have simply drifted from —
the same kind of silent inconsistency this file's bug-class warning is about, just in
structured data instead of page copy.

**Proposed zero-risk fix (NOT applied):** add `"mainEntityOfPage": "<canonical URL>"` to
the 4 posts above (and `"url"` too for `what-to-wear.html`), matching the other 7 posts'
exact pattern. **Re-check in ~1 week:** no GA4 metric applies here (schema-only, not a
ranking/traffic lever on its own) — verify via Rich Results Test instead.

## Reconfirmed clean

- **No `EntertainmentBusiness`, `Event`, `ItemList`, or `FAQPage` block anywhere is
  missing a required field** for its `@type` (`Event` needs `name`/`startDate`/`location`
  at minimum — all four Event-emitting locations, `api/next-event.js`, `event.html`,
  `events.html`, and `city.html`, satisfy this and additionally include
  `eventAttendanceMode`, `eventStatus`, `organizer`, and `image` consistently).
- **No hardcoded ticket price anywhere in schema-adjacent code.** Every `Offer.price` in
  every Event schema is computed from the event's own live `price`/`ev.price` field, not a
  separate literal — the $2.50 `SERVICE_FEE` revenue-gap issue flagged in every recent GA4
  report is unrelated to structured data and doesn't appear here. (The `24.99` literals
  found in `admin.html` are default form-input values for the admin's "create event" UI,
  not schema output — not a bug.)

## NEEDS TAYLOR INPUT

- **`getaways.html`'s FAQPage answer to "Is this only for people near Philadelphia and
  Lancaster?"** is accurate today (mixers are Philadelphia/Lancaster-based) but will read
  strangely once Colorado Springs mixers exist — this is copy, a judgment call, not a
  mechanical fix. Worth a look whenever Colorado Springs marketing copy gets its pass
  (Prompt 7 item 5), not urgent tonight.
- **Prompt 6's 2026-07-28 findings were never committed to the repo** — 5 of 11 blog posts
  reportedly lack the direct-to-ticket `/event` CTA pattern (per
  `Night Tasks/SEO_CTA_HEALTH_CHECK_2026-07-28.md`, saved locally only because that
  session's Cowork connection didn't include the repo root). Tonight's session had normal
  repo/token access throughout — worth a dedicated re-run of Prompt 6 to re-verify those
  findings are still accurate (3 days old) and commit them properly this time, since the
  underlying analysis work is likely still valid but was never surfaced as a PR for review.
- **Prompt 7 (Colorado Springs punch list) itself needs a small documentation update**
  once Taylor reviews Findings 1 and 2 above — its file lists for items 1 and 5 are
  each missing a location that structured-data audit above surfaced. Recommend folding
  Findings 1 and 2's specific file/line references into that prompt's text the next time
  someone edits the prompts library, so the punch list is complete when it's actually run.

## Caveats / method note

- Static JSON-LD blocks were extracted via regex (`<script type="application/ld+json">...
  </script>`) and parsed with Python's `json.loads` — this catches malformed JSON
  reliably but is not a full schema.org vocabulary validator (e.g. it won't catch a
  structurally-valid-JSON block using a property name schema.org doesn't recognize for
  that `@type`). No external validator (Google's Rich Results Test, schema.org validator)
  was reachable from this sandbox — same network-egress caveat noted in the 07-28 dead-link
  sweep report.
- The three JS-injected schema blocks (`event.html`, `events.html`, `city.html`) were
  reviewed as source code (the object-construction logic), not by rendering the page and
  inspecting the live DOM — no browser/headless-Chrome tool was available in this sandbox.
  The server-rendered `api/next-event.js` injection was reviewed the same way.
- No live GA4/traffic data was needed for this analysis (unlike Prompt 9), so there's no
  sample-size or freshness caveat beyond the source code itself, which was read from a
  fresh `--depth 1` clone of `main` at the time of this run.
- This report does not re-verify Findings that prior reports (dead-link sweep 07-28,
  GA4 reports) already covered — e.g. it doesn't re-check `SERVICE_FEE` sync, which those
  reports already confirmed current.
