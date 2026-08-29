# Content Freshness Pass — 2026-08-29

**This run made ZERO code changes.** The only file added to this branch is this
report. Every fix described below is a recommendation for a human to apply, not
something that was applied. `git diff --cached --name-only` was verified to list
exactly one path before push.

**Focus:** Prompt **M8 — Content Freshness Pass**. First M8 run ever; there is no
prior M8 baseline to trend against, so tonight's numbers *are* the baseline.

**Why M8 and not GA4:** the GA4 export in the Night Tasks folder is **stale**. All
**38** `download*.csv` still carry window `20260519-20260827` (read from each file's
own `#` header, not filenames) with 2026-08-27 23:06–23:19 mtimes — byte-for-byte the
same drop `reports/GA4_ANALYSIS_2026-08-28.md` already analysed. Meta is stale too:
the newest pull is still `meta-insights-2026-08-27.csv` (`20260821-20260827`), also
already analysed on 08-28. Both nightly run logs were checked before choosing.
Rotation history from the log: M1 07-28, M2 07-31, M3 08-10, M4 08-22, M5 08-23,
M6 08-24, M7 08-27 — **M8 had never run**, so it was the only untouched slot.

`ANALYTICS_CONTEXT.md` was read in full; the copy in this sandbox is stamped
**"Last updated: 2026-08-26"** (quoted here per that file's own sync-warning rule).
It is NOT forked — it contains the 08-26 corrections. Note that its own §1 has since
been split into the git-tracked `reports/ANALYTICS_METHOD.md`, which was also read.

---

## HEADLINE — ALL FOUR CITY LANDING PAGES ARE SERVING THE GENERIC FALLBACK. ~3,400 WORDS OF CITY SEO COPY AND 40 FAQs HAVE NEVER RENDERED SINCE 2026-07-10.

This is the M8 bug class in its purest form — copy that was correct when written,
silently going wrong when something changed underneath it — except the thing that
changed was a routing config, not the business.

### What is actually live right now

Verified **in a browser against the live site**, not inferred from `public/`, per
`ANALYTICS_CONTEXT.md` §1's rule that these are server-rendered routes. All four
city routes were loaded and their rendered DOM read:

| route | `location.search` | rendered `<h1>` | badge | city body copy | FAQ blocks |
|---|---|---|---|---|---|
| `/philadelphia` | `""` | "Singles Mixer **Events Near You**" | "Upcoming Events" | 37 chars (empty) | 0 |
| `/lancaster` | `""` | "Singles Mixer **Events Near You**" | "Upcoming Events" | 37 chars (empty) | 0 |
| `/colorado-springs` | `""` | "Singles Mixer **Events Near You**" | "Upcoming Events" | 37 chars (empty) | 0 |
| `/wilmington` | `""` | "Singles Mixer **Events Near You**" | "Upcoming Events" | 37 chars (empty) | 0 |

All four are byte-identical in the body. On `/colorado-springs` the footer city
reads **"Philadelphia"**, the newsletter line reads **"your city"**, the live
`<title>` is the generic **"Singles Mixers — SparkDate"**, the live
`<meta name="description">` is **"Curated singles mixer events for real people.
Real venues, real connections."**, and the only JSON-LD on the page is
`["ItemList"]` — **no FAQPage schema at all**.

### The mechanism, located in source

`public/city.html:696-698`:

```js
// ── Read city from URL path ─────────────────────────────────────────
// Vercel rewrites /philadelphia → /city.html?city=philadelphia
const params = new URLSearchParams(location.search);
const cityParam = (params.get('city') || '').toLowerCase().trim();
const config = CITIES[cityParam] || DEFAULT_CITY;
```

**That comment describes a rewrite that no longer exists.** `vercel.json` now says:

```json
{ "source": "/philadelphia", "destination": "/api/next-event?render=city&city=philadelphia" }
```

A Vercel rewrite is server-side — the browser's address bar stays `/philadelphia`
with **no query string**. So `location.search` is `""`, `cityParam` is `""`,
`CITIES[""]` is `undefined`, and `config` falls through to `DEFAULT_CITY`
(`city.html:644-654`: `name: 'Your City'`, `displayName: 'Upcoming Events'`,
`content: ''`, `faqs: []`).

Measured live: `location.search === ""` on all four routes. That is the whole bug.

### It also silently un-does the server-side SEO fix that was the point of the change

`renderCityPage()` in `api/next-event.js:281-322` does its job correctly — it
replaces `<title>`, `<meta name="description">` and `<link rel="canonical">`
in place before responding. But then `injectMeta()` (`city.html:702-729`) runs in
the browser with `config = DEFAULT_CITY`, and because `config.canonicalSlug` is
`''` it takes the else-branch of all three ternaries and **overwrites** the
server's correct tags with the generic ones. Live `<title>` and
`og:title` are the generic strings; they match `DEFAULT_CITY`'s output exactly.

The canonical survives **only by accident**: `injectMeta()` reaches it via
`document.getElementById('canonicalTag')`, and the server's regex replacement
(`api/next-event.js:308`) emits a `<link rel="canonical">` **without** the
`id="canonicalTag"` attribute. So the lookup returns `null`, the assignment
no-ops, and the server's correct canonical is left standing. Measured live:
`document.getElementById('canonicalTag')` is **`null`**, and
`link[rel=canonical]` reads `https://sparkdate.date/colorado-springs` — right
value, wrong reason.

PR #77's commit message (`a3440d5`, 2026-07-10) states the assumption directly:

> "The existing client-side injectMeta() in city.html is untouched and still runs
> as defense-in-depth"

It is not defense-in-depth. It is an overwrite, and it fires on every load.

### Why it was not caught

That same commit message documents its verification path: a standalone script that
loads the real exported handler and calls it with mock `req`/`res` for
philadelphia, lancaster, an unknown city, and two `/event` cases. That proves the
**server** output is correct — and it is. It never executes the page's client JS on
a rewritten URL, which is the half that breaks. `vercel dev` was explicitly noted
as unusable in that worktree.

### When it broke, per city

`git log -S` on the rewrite strings, on an unshallowed clone:

- **`a3440d5` (PR #77, 2026-07-10)** changed `/philadelphia` and `/lancaster` from
  `/city.html?city=…` to `/api/next-event?render=city&city=…`. Those two have been
  serving the fallback for **50 days**.
- **`a8aa083` (PR #173, 2026-08-14)** added `/colorado-springs` and `/wilmington`
  already pointing at `render=city`. Those two have **never** rendered their copy —
  broken from birth, 15 days.

### Blast radius

| what | count |
|---|---|
| City pages affected | 4 of 4 |
| Words of city-specific body copy never rendered | **~3,377** (Philadelphia 873, Lancaster 779, Colorado Springs 915, Wilmington 810) |
| `<h2>` sections never rendered | 12 |
| FAQ Q&A pairs never rendered | **40** (10 per city) |
| FAQPage schema emitted | **0** |
| Internal links pointing at these four routes | **41** across 10 files |
| Sitemap entries | **4 of 32** — confirmed live in `/sitemap.xml` |

So Google is being handed four sitemap URLs and 41 internal links that all resolve
to the same generic page, differing only in canonical. The four pages are not just
under-optimised; they are **near-duplicates of each other**, which is the exact
failure PR #77 was opened to fix ("only / and /signup show up in Google search").

### Adjacent, NOT confirmed live: `/event/:id` probably has the same defect

`vercel.json` rewrites `/event/:id` → `/api/next-event?render=page&id=:id`, so the
browser URL is `/event/<id>` with no query string. `event.html:1212-1226` reads
`new URLSearchParams(window.location.search).get('id')` and, if empty, calls
`window.location.replace('/events')`. Mechanically that predicts an immediate
bounce to `/events` for any `/event/<id>` link.

**Stated honestly: I could not confirm this.** Two live navigation attempts to
`/event/<real id>` failed outright in the browser tool while `/events` and all four
city routes loaded fine on the same tab, so the failure is *suggestive* but not
proof. Mitigating: `/event/:id` is **not linked anywhere** in `public/`, `lib/`,
`api/`, `content/` or `scripts/` (grepped), and `/sitemap.xml` uses the `?id=` form
— confirmed live. So this is a latent trap, not a live leak. Do not fix it on the
strength of this paragraph; reproduce it first.

---

## SECOND FINDING — THE FOOTER CITY LIST HAS FRACTURED INTO 8 VARIANTS MID-MIGRATION

This is the literal example the M8 prompt names ("city-list phrases that need
updating once a new city goes live"). Someone began updating footers when Colorado
Springs and Wilmington were added and stopped partway. Across 34 HTML files:

| footer city line | files |
|---|---|
| `SparkDate · Philadelphia · Lancaster · Wilmington · Colorado Springs · 2026` | 7 |
| `SparkDate · Philadelphia & Lancaster · 2026` | 7 |
| (no city footer line) | 6 |
| `© 2026 SparkDate. Philadelphia. Real people. Real venues.` | 5 |
| `SparkDate · Philadelphia · 2026` | 3 |
| `SparkDate · Lancaster & Philadelphia · 2026` | 2 |
| `© 2026 SparkDate. Real people. Real venues.` | 2 |
| `© 2026 SparkDate. Lancaster & Philadelphia. Real people. Real venues.` | 1 |
| `© 2026 SparkDate.` | 1 |

Only the 7-file variant links the city routes as anchors; the rest are plain text.
`blog/wilmington-date-night-spots.html:256` is the fully-migrated shape and is the
obvious template to standardise on.

Related, same class:

- **`og:image:alt` on 23 files** reads `"SparkDate — Real people. Real venues.
  Philadelphia & Lancaster."`
- **`about.html:107` and `index.html:109`** JSON-LD `areaServed` lists **only**
  Lancaster and Philadelphia, while `CITY_SEO` (`api/next-event.js:257-262`) has
  four cities with sitemap-submitted landing pages.
- **`about.html:6-7`** title and meta description say "Philadelphia & Lancaster".

These are *arguably still accurate* — Colorado Springs and Wilmington have no live
events, and `content/brand.json` has only `lancaster` and `philadelphia` under
`markets`. That is a judgment call, not a mechanical fix, which is why it is
flagged rather than proposed as zero-risk.

---

## THIRD FINDING — COLORADO SPRINGS SAYS "AUGUST 2026" FIVE TIMES AND AUGUST 2026 ENDS IN TWO DAYS

`public/city.html`, Colorado Springs block, five separate places:

- L526 subtitle — "Curated mixers for Colorado Springs singles, **starting August 2026**"
- L529 body — "SparkDate is bringing our in-person mixer format to Colorado Springs **starting August 2026**"
- L536 body — "ahead of our **August 2026** launch"
- L541 FAQ — "adding more locations as the calendar fills in ahead of our **August 2026** launch"
- L553 FAQ — "We're **launching in Colorado Springs in August 2026**"

Today is **2026-08-29**. There is no Colorado Springs event in `/sitemap.xml`
(3 events, all with `?id=` — the same three in `content/brand.json`: Marion Court
2026-09-08, Tellus AfterDark 2026-08-26, Good Good Things 2026-08-31, all
Lancaster or Philadelphia), and `brand.json` has no Colorado Springs market at all.
So the launch date passes on Monday with nothing behind it.

**Silver lining, and it cuts both ways:** because of the headline bug, **nobody has
ever seen this copy**. It has been wrong-in-waiting on a page that renders generic
text. Fixing the routing bug without also fixing this date would ship a stale
promise to production the same day.

---

## FOURTH — SMALLER DATE/PRICE STALENESS

1. **`/blog/first-timer-guide.html:284`** — the CTA says *"The next Philadelphia
   SparkDate mixer is coming up… **$24.99**"*. The live Philadelphia event in
   `brand.json` (Good Good Things, 2026-08-31, Rittenhouse) is **$29.99**. The page
   understates the current Philadelphia price by $5.00. **Not proposed as a fix** —
   GUARDRAILS says never touch pricing without human sign-off.
   - Same page, L257, says "**$25**" — a rounding of the old price, now also wrong.
   - `city.html` quotes `$24.99` in **8** places across all four cities; those are
     invisible today because of the headline bug, but they become live copy the
     moment it is fixed.
2. **29 of 34 HTML files carry a hardcoded `2026` in the footer**, and there is **no
   `getFullYear()` anywhere in any footer** (grepped; the five `getFullYear()` hits
   in the repo are all in admin/event date-key logic). Every one of these goes wrong
   on 2027-01-01. That is 125 days out — flagged now precisely because M8 exists to
   catch scheduled staleness before it lands.
3. **`about.html:538`** — "why does meeting someone **in 2026** feel harder than
   ever" — hardcoded year in body prose, same expiry.
4. **"Memberships are coming soon"** appears on `about.html:607`,
   `account.html:744`, `signup.html:771` and `terms.html:129`. Per
   `ANALYTICS_CONTEXT.md` §1, `sign_up` "had fired **zero** times all year — not a
   broken tag… the membership product is **shelved**." Copy saying "coming soon" for
   a shelved product is stale in the direction that matters (it sets an expectation
   that is not going to be met). Whether to change it is a positioning call.

---

## WHAT IS CLEAN — recorded so it is not re-audited

- **Blog post dates are internally consistent.** All 16 posts: the visible
  month/year matches the JSON-LD `datePublished` month in every case. No post
  claims to be newer or older than its schema says.
- **The `JobPosting` schema on `careers.html` is in date-order and not expired** —
  `datePosted: "2026-08-24"`, `validThrough: "2026-12-31"`. The file even carries a
  comment (L443) reminding whoever edits it that `validThrough` must stay future.
  That is the correct pattern and the rest of the site could use it.
- **The "9 cities" hiring claim on `careers.html:220` reconciles exactly** — 9
  `jobLocation` Places: Philadelphia, Lancaster, Washington, Chicago, Dallas,
  Houston, Miami, Atlanta, Phoenix.
- **No stale hardcoded venue names in visible copy.** The only venue strings in
  `public/*.html` are social-photo captions (Exchange / Stereo-01), which are
  evergreen recaps, not forward-looking claims.
- **`getaways.html`'s eight "Coming Soon" labels are honest** — the packages are a
  vote-and-waitlist product with no purchase path, which matches the page.

---

## NEEDS TAYLOR INPUT

1. **The city-page fallback bug — scope and sequencing (1st ask, new).** The fix
   itself is small, but there are three defensible shapes and they are not
   equivalent: (a) have `city.html` read the city from `location.pathname` instead
   of `location.search`; (b) have `renderCityPage()` inject the resolved city into
   the HTML (e.g. a `data-city` attribute or a `window.__CITY__` literal) and have
   the client read that; (c) delete the client-side `injectMeta()` entirely and rely
   on the server, which is what #77 intended. **(c) is the smallest diff but the
   riskiest** — it makes the page fail blank on any route where the server branch
   does not run. This is an architecture call, not a mechanical fix, so it is not in
   the zero-risk list below.
2. **Should the Colorado Springs "August 2026" copy be pushed out, softened to
   "coming soon", or is a Colorado Springs launch actually imminent? (1st ask,
   new.)** This blocks fixing #1 cleanly — repairing the routing without deciding
   this ships a dead date to a page Google will finally start reading.
3. **The footer / `og:image:alt` / `areaServed` city list — two cities or four?
   (1st ask, new.)** Mechanically trivial once decided; genuinely ambiguous until
   then, because CS and Wilmington have landing pages and sitemap entries but no
   events and no `brand.json` market.
4. **`/blog/first-timer-guide.html` quotes $24.99 for a $29.99 Philadelphia event
   (1st ask, new).** Pricing is a GUARDRAILS-protected area — flagging only.

**No settled question was re-asked.** The internal-traffic filter,
`ads_conversion_About_Us_1`, Google Ads status, the Marion Court configuration and
`next_event_fetch_failed` (#299) were all checked against `ANALYTICS_CONTEXT.md`
§3b and left alone. The homepage "Your app matched you" headline (still present in
`index.html` ×5, `about.html`, `lp.html`, `signup.html`) is a **standing 3rd-ask
from prior GA4 reports** — noted as still-true, deliberately not re-raised as new.

---

## PROPOSED ZERO-RISK FIXES (NOT APPLIED — for a human to do)

Each of these is mechanical and reversible. None were made.

1. **Correct the stale comment at `public/city.html:697`.** It says the rewrite
   targets `/city.html?city=philadelphia`; `vercel.json` has said otherwise since
   2026-07-10. Even if the routing fix in "Needs input" #1 is deferred, the comment
   actively misleads the next reader. Comment-only change.
2. **Restore `id="canonicalTag"` in `api/next-event.js:308`'s canonical
   replacement.** Today the canonical is correct *because* this attribute is
   missing. That is a load-bearing accident — the moment someone fixes the city
   resolution, `injectMeta()` will find the element again and start writing to it.
   Restoring the id now makes the two paths agree instead of one silently winning.
3. **Standardise the footer city line on the `blog/wilmington-date-night-spots.html`
   shape** once question #3 is answered — 27 files, find-and-replace.
4. **Replace the 29 hardcoded footer `2026`s with a `getFullYear()` write**, or add
   a dated `TODO` so the January rollover is a scheduled task rather than a
   discovery. `careers.html`'s `validThrough` comment is the precedent.
5. **Add `dateModified` to the 16 blog posts' JSON-LD.** All 16 have
   `datePublished` and none has `dateModified`; several have been edited since
   publication. Purely additive.

---

## WHAT TO RE-CHECK IN ~1 WEEK

Deliberately hedged: **most of this is not measurable in GA4 at this sample size**,
and the site takes ~29 purchases per 90 days (`ANALYTICS_CONTEXT.md` §5). Do not
expect a conversion signal. What *is* checkable:

| recommendation | metric to re-check, ~1 week out | why it is weak |
|---|---|---|
| City-page routing fix | **Landing-page sessions on `/philadelphia`, `/lancaster`, `/colorado-springs`, `/wilmington`** in GA4 (Generate leads → Landing page). Baseline first — these four have never had real content, so any figure today is the floor. | Organic re-crawl takes longer than a week; Search Console impressions for those four URLs is the better instrument, and that is not in the CSV export. |
| City-page routing fix | **Search Console: impressions + average position for the four city URLs.** This is the number that actually moves. | Requires a Search Console pull, which the nightly export does not include. Flagged as a data gap. |
| FAQPage schema returning | Rich-result eligibility for the four city URLs in Search Console. | Google has de-emphasised FAQ rich results; treat presence, not traffic, as the success measure. |
| Colorado Springs date copy | Nothing quantitative. Re-read the page after the decision in ask #2. | No GA4 metric exists for "the copy is not lying." |
| Footer city list | Nothing quantitative. | Consistency fix, not a conversion fix. Do not invent a metric for it. |

---

## CAVEATS AND METHOD

- **Zero code changes.** One file added: this report.
- **Live verification was used, and it mattered.** Per `ANALYTICS_CONTEXT.md` §1's
  server-rendered-routes rule, `/philadelphia`, `/lancaster`, `/colorado-springs`,
  `/wilmington` and `/sitemap.xml` were loaded in a real browser and their rendered
  DOM read, rather than concluding anything from `public/city.html`. **This is the
  only reason the headline finding was found** — the file in `public/` contains all
  the city copy and looks entirely healthy; only the live page shows it never
  renders. Reading the source alone would have produced a clean bill of health.
- **The one thing I could not verify: `/event/:id`.** Two live navigations failed
  where five other routes on the same tab succeeded. Reported as a source-level
  prediction with the failure disclosed, not as a confirmed defect.
- **Which `ANALYTICS_CONTEXT.md` caveats applied tonight, and which did not.**
  Applied: §1's server-rendered-routes rule (drove the whole method); §1's
  membership/`sign_up`-is-shelved note (finding 4.4); §5's sample-size warning
  (drove the honest "not measurable" table above); §3b's settled-questions list
  (checked before writing any ask). **Not applicable, because no GA4 or Meta number
  was computed at all:** the `begin_checkout` 2026-08-21 boundary, the two-day
  export tail, the 2026-08-25 internal-traffic cliff, the Meta rolling-window
  composition trap, `lead_form_started` pairing, and the datacenter-inflated
  denominators. **No date-range comparison of any kind was made tonight.** Nothing
  in this report contradicts a number in that file.
- **Sample size / scope.** All 34 HTML files in `public/` and `public/blog/` were
  grepped for the M8 patterns; 4 routes were checked live. The counts in this report
  are grep counts and DOM reads, both reproducible. Word counts of unrendered copy
  are tag-stripped token counts of the `CITIES` object and are approximate.
- **No prior-period file to trend against** — M8 has never run. Every number here is
  a first measurement.
- **Two things were flagged and then cleared rather than dropped:** the 16 blog
  posts' visible dates (checked against JSON-LD, all consistent); and
  `careers.html`'s `validThrough` (checked, in the future, correct pattern).
- **Deliberately NOT proposed:** any change to the `$24.99` strings, any change to
  the "Your app matched you" headline, and any of the three candidate shapes for the
  city-routing fix. The first two are GUARDRAILS/standing-ask territory; the third
  is an architecture decision that belongs to a human.
