# Nightly run — 2026-08-24
## Focus: Prompt M6 (Performance / Core Web Vitals) + a Meta follow-up on the now-complete Aug 23

**This run made ZERO code changes.** The only file added to this branch is this report.
Nothing in `public/`, `api/`, `lib/`, `scripts/`, `vercel.json`, `package.json` or the
Firestore rules was touched, and no GA4 or Meta CSV in the Night Tasks folder was moved,
renamed, edited or deleted. Every recommendation below is described for Taylor to apply
or reject; none of it has been applied.

---

## Plain-English summary

Two things came out of tonight.

**One, a correction to last night's headline.** The 2026-08-23 report said Meta spend was
"down six consecutive days, $62.38 → $21.13, −66%." That last figure was a partial day.
The nightly pull that ran at **02:00 this morning overwrote `meta-insights-2026-08-23.csv`
with the finalised numbers**, and the complete Aug 23 is **$35.95, not $21.13**. The
six-day slide ended on the 23rd — spend went **up** 51% day over day, impressions nearly
doubled, and the real Aug 17 → Aug 23 change is **−42%, not −66%**. What last night could
only call "likely" is now confirmed on a full day: **Marion Court's two prospecting
campaigns both spent exactly $0.00 on Aug 23** while the brand-new cheap `Marion Court |
Traffic` buy took over.

**Two, the first performance pass this repo has ever had.** Prompt M6 has never run, and
the rotation says to run it after a CSS/layout-heavy change — one shipped on 2026-08-22
(#243/#248/#250). The finding is narrow and concrete: **the layout-shift mitigations that
shipped in that batch went onto `lp.html` and onto no other page.** Nine pages ship the
same polaroid-collage block. One of the nine reserves space for it before JavaScript
runs. The other eight — including the homepage, the checkout page and `/events` — still
get their collage height from an inline script at runtime, which is the exact pattern
`lp.html`'s own source comment says PageSpeed Insights flagged as a "Layout shift culprit."

Neither finding needs money spent. The Meta one needs Taylor to say whether the Marion
Court swap was deliberate. The performance one is a copy-paste of one CSS declaration
onto eight files — but it is still a code change, so it is written up here, not applied.

---

## Part 1 — M6: Performance / Core Web Vitals

### Method, and what could not be done

**Lighthouse could not be run, and this is stated rather than silently skipped, as the
M6 prompt requires.** `npx lighthouse@11` installs fine (version 11.7.1 confirmed), but
there is no Chrome or Chromium binary in this sandbox (`/usr/bin` has none, `~/.cache/
puppeteer` is empty), and `npx @puppeteer/browsers install chrome@stable` fails at DNS —
`getaddrinfo EAI_AGAIN googlechromelabs.github.io`. There is also no network egress to
the live site, so even a working browser would have had nothing to point at.

So this is the M6 prompt's stated fallback: a manual read-through of the `<head>` and
asset loading on a fixed page rotation, plus byte-level measurement of the assets on
disk. Pages audited: **`index.html`, `lp.html`, `event.html`, `city.html`, and
`blog/first-timer-guide.html`** — the rotation the prompt names, plus `lp.html` because
it takes roughly half of all sessions and is where the 08-22 layout batch landed.

**There is no prior baseline.** `reports/` contains 20 files and none mentions
Lighthouse, LCP, CLS or Core Web Vitals. **This report is the M6 baseline.** No
regression claim is made below, because there is nothing to regress against.

**Everything below is source-level.** No LCP, CLS, INP or TBT number was measured. Where
this report says a pattern causes layout shift, that is a mechanical reading of the code
plus the repo's own documented history, not a measurement.

---

### Finding 1 (the main one) — the 08-22 CLS fix landed on 1 of the 9 pages that need it

Nine pages ship the polaroid-scatter collage: `about.html`, `blog.html`, `city.html`,
`event.html`, `events.html`, `getaways.html`, `index.html`, `lp.html`, `signup.html`.
All nine carry the same markup (7 `<img>` from `/images/social/`), the same
`.sp-polaroid-scatter-wrap` / `.sp-polaroid-scatter` CSS, and the same inline
`fitPolaroidScatter()` script.

| Page | `aspect-ratio` on the wrap | `width`/`height` on the 7 imgs | mobile scale block |
|---|---|---|---|
| `lp.html` | **yes** | **7 of 7** | yes (`MOBILE_SCALE`) |
| `index.html` | no | 0 of 7 | no |
| `event.html` | no | 0 of 7 | no |
| `events.html` | no | 0 of 7 | no |
| `city.html` | no | 0 of 7 | no |
| `signup.html` | no | 0 of 7 | no |
| `about.html` | no | 0 of 7 | no |
| `blog.html` | no | 0 of 7 | no |
| `getaways.html` | no | 0 of 7 | no |

**Why the missing `aspect-ratio` matters.** `.sp-polaroid-scatter` is `position: absolute`,
so it contributes zero height to its parent. On the eight pages without the fix,
`.sp-polaroid-scatter-wrap` is `position: relative; width: 100%; max-width: 850px;
padding-top: 24px` and nothing else — it has **no height at all** until
`fitPolaroidScatter()` runs and executes `wrap.style.height = (500 * scale + 24) + 'px'`.
That inserts up to **524px** on desktop, and **~253px** at a 390px-wide viewport
(scale = 390/850 = 0.459, so 500 × 0.459 + 24). Everything below the collage moves down
by that amount when the script runs.

`lp.html` fixes this in CSS with `aspect-ratio: 850 / 524` on the wrap, and its source
comment (lp.html:159–166) says exactly why:

> *"aspect-ratio reserves the right amount of vertical space from the very first paint,
> purely via CSS — before fitPolaroidScatter() below has even run. Without it the browser
> had no idea how tall this box would be until JS measured the container and set an
> inline height, which showed up as a real, measurable layout shift (PageSpeed Insights
> flagged this exact box under 'Layout shift culprits')."*

So the mitigation is proven — by an external tool, on this exact box — and it is on one
page of nine. The eight without it include the **homepage**, the **checkout page**
(`event.html`) and **`/events`**.

**Do NOT also copy the `width="240" height="240"` attributes.** `lp.html`'s comment at
lines 173–182 documents that adding those attributes without a matching `height: auto`
in CSS pinned the box to 240px tall while `width: 100%` shrank it to the polaroid's 216px
content box — every photo rendered 216×240, portrait, and the declared `aspect-ratio: 1/1`
was ignored. The other eight pages have `.sp-polaroid img { display: block; width: 100%;
aspect-ratio: 1 / 1; object-fit: cover; }` with **no** attributes, which renders square
correctly. **The eight pages do not have the stretching bug** — they only lack the
space reservation. The safe change is the one CSS declaration on the wrap, nothing else.

**Re-check in ~1 week:** run PageSpeed Insights (or Lighthouse once a browser is
available) on `/` and `/event` and look at CLS and the "Layout shift culprits" list. If
the collage box still appears there, the fix did not carry.

---

### Finding 2 — every one of 34 pages loads its own render-blocking Google Fonts stylesheet, in four different flavours

Every HTML file under `public/` (34 of 34) has a render-blocking
`<link rel="stylesheet" href="https://fonts.googleapis.com/css2?...">`. There is no
self-hosting, no `preload`, no `media="print" onload` swap. This is the exact pattern the
M6 prompt calls out ("every page loads its own, independently — see the font-unification
work in git history"), and the font-unification work did **not** eliminate it.

Worse, the request is fragmented into **four distinct URLs**, which are four distinct
HTTP cache entries:

| Font URL variant | Pages |
|---|---|
| Playfair 700;900 + Inter 400;500;600 | 20 (all 16 blog posts, `privacy`, `profile`, `terms`, `404`) |
| …+ `Caveat:600;700` | 9 (`index`, `lp`, `events`, `signup`, `getaways`, `careers`, `blog`, `about`, `city`) |
| Playfair 700;900 + Inter 400;500;600;**700** | 4 (`admin`, `checkin`, `matches`, `account`) |
| …+ Inter 700 **and** Caveat | 1 (`event`) |

A visitor going `/lp` → `/events` → `/event` (the actual paid-traffic path to a ticket)
hits **three different font URLs**, and `/event` is the only page in the codebase on its
own variant. `event.html` asks for Inter 700 and Caveat together; nothing else does.

**Also:** 26 pages carry the `fonts.googleapis.com` / `fonts.gstatic.com` preconnect
pair, but 34 load the stylesheet — so **8 pages request Google Fonts with no preconnect**:
`privacy`, `profile`, `admin`, `checkin`, `matches`, `terms`, `account`, `404`. Low-traffic
pages, but it is a free two-line fix and an inconsistency worth knowing about.

**Re-check in ~1 week:** not a GA4 metric. Re-run this count, or a Lighthouse
"Eliminate render-blocking resources" audit, on `/`, `/lp` and `/event`.

---

### Finding 3 — the collage JPEGs are ~900px wide serving a 240px box

The seven `/images/social/*.jpg` files are the only content images on the marketing pages.
Measured intrinsic dimensions against the CSS box they render into:

| File | Bytes | Intrinsic | CSS box |
|---|---|---|---|
| `rooftop-magic.jpg` | 73,677 | 900×496 | 240×240 |
| `party-vibes.jpg` | 90,860 | 900×675 | 240×240 |
| `matched-house.jpg` | 65,820 | 900×675 | 240×240 |
| `summer-nights.jpg` | 53,026 | 791×900 | 240×240 |
| `fire-vibes.jpg` | 50,030 | 900×507 | 240×240 |
| `cheeky-peek.jpg` | 43,958 | 900×675 | 240×240 |
| `buzzing.jpg` | 35,340 | 900×666 | 240×240 |
| **total** | **412,711** | | |

At 240 CSS px a 2× display needs 480px of source. 900px is roughly **2× linear / 3.5×
area** oversized on desktop, and much worse on mobile, where `lp.html`'s `MOBILE_SCALE`
of 0.72 combined with the container scale renders each polaroid at well under 120px.
Re-encoding at 480px wide would plausibly remove ~60–70% of those bytes.

**Two honest caveats that keep this from being a big finding:**

1. **All 7 are `loading="lazy"` on every page, and all 7 sit below the fold.** On
   `lp.html` the ticket CTA is at line 310, the press strip at 331–337, testimonials at
   351, and the collage at 420. `ANALYTICS_CONTEXT.md` records that only ~11–14% of
   sessions ever fire `scroll`, so **most visitors never download these at all.** This is
   not a first-paint or LCP cost. It is a cost paid by the minority who scroll — which is
   also the minority most likely to buy.
2. There is no format modernisation here either — 230 JPEGs, 7 PNGs, 2 SVGs, zero WebP or
   AVIF repo-wide — but that is a build-pipeline change, not a zero-risk fix.

**Re-check in ~1 week:** nothing in GA4 measures this directly. If the images are
re-encoded, confirm `scroll` and `select_promotion` volume did not move (they should not);
the point is bytes, not behaviour.

---

### Finding 4 — the animated-card pattern is currently contained (no action needed)

The M6 prompt asks whether any page has since added an animated-card pattern without the
`content-visibility: auto` fix that was applied to `blog.html`. **It has not.** Three
pages have card grids with always-running icon animations, and all three carry the fix:

| Page | `@keyframes` | `animation:` decls | infinite | `content-visibility` |
|---|---|---|---|---|
| `events.html` | 6 | 9 | 7 | **yes** (`.getaway-card`, `contain-intrinsic-size: 0 400px`) |
| `blog.html` | 5 | 8 | 7 | **yes** (`.post-card`, `0 480px`) |
| `getaways.html` | 5 | 8 | 6 | **yes** (`.getaway-card`, `0 460px`) |
| `event.html` | 5 | 7 | 6 | no — **and correctly so** |

`event.html` looks like an outlier on the raw count but is not: all six of its infinite
animations are `.hero-scene .anim-*` — a single in-viewport hero SVG, not repeated cards —
and they are guarded by `prefers-reduced-motion` at event.html:198. Flagging it would
have been a false positive.

**One real gap, minor:** `admin.html` has 2 animations and **no `prefers-reduced-motion`
block**, the only animated page without one. It is a staff-only page.

---

### Finding 5 — Stripe v3 loads render-blocking on all four commerce pages

`<script src="https://js.stripe.com/v3/"></script>` — no `async`, no `defer` — on
`account.html:942`, `event.html:997`, `events.html:1425`, `signup.html:1048`. It sits
late in the body (line 997 of 2,278 on `event.html`; 1,048 of 1,327 on `signup.html`),
so it blocks less than a `<head>` tag would, but it still halts parsing at that point.
There is **no `preconnect` to `js.stripe.com`** anywhere, and none to
`connect.facebook.net` or `www.gstatic.com` either — the only preconnects in the entire
codebase are the two Google Fonts ones.

For contrast, the two other third parties are loaded correctly: GTM is
`<script async src=".../gtag/js?id=G-21YLCC35F1">` on every page, and the Meta Pixel uses
the standard async-injection snippet. Firebase is 17 dynamic ESM `import()` calls from
`gstatic.com/firebasejs/10.7.0/` across 6 pages (`account`, `admin`, `city`, `event`,
`events`, `signup`) — not blocking, but note the **M5 report from 2026-08-23 flagged that
the pinned 10.7.0 CDN version is what users actually run while the lockfile resolves
`^10.7.0` to 10.14.1.** That finding stands and is unrelated to performance.

**Re-check in ~1 week:** Lighthouse "Reduce render-blocking / preconnect to required
origins" on `/event`, once a browser is available.

---

### Page weight, for the baseline record

| Page | HTML | inline CSS | inline JS | ext JS | blocking |
|---|---|---|---|---|---|
| `admin.html` | 346,922 | 47,789 | 241,125 | 1 | 0 |
| `events.html` | 168,129 | 38,524 | 101,653 | 2 | 1 |
| `event.html` | 130,281 | 24,143 | 85,835 | 2 | 1 |
| `account.html` | 97,168 | 22,092 | 53,069 | 2 | 1 |
| `city.html` | 74,553 | 13,263 | 53,983 | 1 | 0 |
| `index.html` | 67,723 | 26,590 | 18,126 | 1 | 0 |
| `signup.html` | 60,006 | 16,471 | 26,047 | 2 | 1 |
| `lp.html` | 59,378 | 15,071 | 33,694 | 1 | 0 |
| `blog/conversation-starters.html` | 25,755 | 6,635 | 4,166 | 1 | 0 |

Everything is inlined — no external CSS or JS bundle exists anywhere. That is a defensible
choice for a site this size (zero extra round-trips), and it is noted for the baseline
rather than criticised. `event.html` at 130KB of HTML with 86KB of inline JS is the one
worth watching: it is the checkout page and it is the third-heaviest thing on the site.

---

## Part 2 — Meta follow-up: the complete Aug 23 corrects last night's headline

### A filename trap worth recording

`meta-insights-2026-08-23.csv` **has an mtime of 2026-08-24 02:00:06.** The local
PowerShell nightly ran this morning, pulled Meta for Aug 17–23, and overwrote that file
in place — its own log says `Wrote 11 row(s) to ...meta-insights-2026-08-23.csv`. So a
file whose *name* says the 23rd contains data pulled on the **24th**, and the Aug 23 in
it is **final, not partial**. Verified by parsing `logs/2026-08-24.log` (UTF-16) and
confirming all 11 campaign rows match the CSV to the cent. This is precisely why the
standing rule says to read a file's own content for freshness and never its filename.

### The finalised Aug 23

Complete Aug 23 was derived as (Meta API Aug 17–23 total) − (Windsor daily CSV Aug 17–22
sum), per campaign. **The method validates itself:** four of eleven campaigns came out at
exactly **$0.00** and a fifth at −$0.00 rounding, with no negative residuals anywhere. Two
independent sources agreeing to the cent on 5 of 11 rows is strong corroboration — but
this is still a Windsor-sourced subtrahend against an API-sourced minuend, which the
2026-08-23 report warned are "not byte-comparable," so the derivation is stated as a
derivation.

| Day | Spend | Clicks | Impressions |
|---|---|---|---|
| 2026-08-17 | $62.38 | 98 | 2,239 |
| 2026-08-18 | $57.48 | 75 | 1,844 |
| 2026-08-19 | $43.56 | 49 | 1,497 |
| 2026-08-20 | $37.64 | 46 | 1,371 |
| 2026-08-21 | $30.91 | 53 | 1,491 |
| 2026-08-22 | $23.85 | 63 | 1,699 |
| **2026-08-23 (complete)** | **$35.95** | **88** | **3,371** |
| *(2026-08-23 as reported last night, partial)* | *$21.13* | *50* | *1,758* |

**Three corrections to the 2026-08-23 report:**

1. **The six-day decline ended.** Aug 22 → Aug 23 is **+$12.10, +50.7%**, not a seventh
   down day.
2. **−66% was wrong; the real Aug 17 → Aug 23 change is −42%.** The larger figure was an
   artifact of comparing a full day to a 59%-complete one ($21.13 of $35.95).
3. **Impressions nearly doubled** on Aug 23 (1,699 → 3,371, **+98%**) while spend rose
   half as fast, so CPM **fell from $14.04 to $10.66**. Clicks 63 → 88 (+40%); CPC edged
   up $0.379 → $0.409.

This is a live instance of the rolling-window trap `ANALYTICS_CONTEXT.md` §1 documents —
the same class of error, just with a partial day instead of a partial campaign window. It
is worth adding to that file that **the current day is partial until the following
morning's 02:00 pull overwrites it**, and that day-over-day claims should therefore stop
at yesterday-minus-one.

### The Marion Court swap: confirmed, not "likely"

Last night's report saw no Aug 23 rows for `Marion Court All Genders` / `Female` and said
"a swap looks likely but one partial day isn't enough to call it." On the complete day:

| Campaign | Aug 23 (complete) | Aug 17–23 | Impr | Clicks | CPM | CPC |
|---|---|---|---|---|---|---|
| `Marion Court \| Traffic` | **$7.05** | $7.23 | 1,146 | 27 | **$6.31** | $0.27 |
| `Campaign 1 Event 3 Good Good Campaign` | **$6.41** | $10.21 | 1,781 | 66 | **$5.73** | $0.15 |
| `Campaign 1 Event 4 Good Good Campaign-Retargeting` | $6.61 | $38.73 | 1,456 | 62 | $26.60 | $0.62 |
| `Marion Court Retargeting` | $5.65 | $32.72 | 1,302 | 30 | $25.13 | $1.09 |
| `Tellus AfterDark @ Tellus360 -All Genders` | $4.19 | $34.97 | 1,347 | 42 | $25.96 | $0.83 |
| `Tellus AfterDark @ Tellus360 -Sales-Obj-Women` | $3.79 | $32.31 | 1,246 | 33 | $25.93 | $0.98 |
| `Campaign 1 Tellus AfterDark Retargeting` | $2.25 | $24.96 | 1,130 | 96 | $22.09 | $0.26 |
| `Marion Court All Genders` | **$0.00** | $18.23 | 841 | 18 | $21.68 | $1.01 |
| `Marion Court Female` | **$0.00** | $17.35 | 826 | 11 | $21.01 | $1.58 |
| `Good Good Campaign-Sale Obj All Genders` | **$0.00** | $29.37 | 923 | 42 | $31.82 | $0.70 |
| `Good Good Campaign-Sale Obj Women` | **$0.00** | $45.69 | 1,514 | 45 | $30.18 | $1.02 |
| **Total** | **$35.95** | **$291.77** | **13,512** | **472** | | |

**Four of eleven campaigns spent exactly nothing on a complete Aug 23** — both Marion
Court prospecting campaigns and both Event 4 Good Good sales-objective campaigns. The two
cheap traffic buys are **37.4% of Aug 23 spend** ($13.46 of $35.95). The CPM gap last
night reported on a partial day holds on the full one: **~$6 for the traffic buys against
$21–32 for everything else**, a 3.5–5× difference.

Note also that `Campaign 1 Event 3 Good Good Campaign` is now unambiguously live again —
`ANALYTICS_CONTEXT.md`'s campaign table still lists its last spend as **2026-08-13**, and
`Marion Court | Traffic` is **not in that table at all**. Both entries are stale.

### Marion Court is now $75.53 with zero purchases

Across all four Marion Court campaigns, Aug 17–23: **$75.53 spend, 86 clicks, 4,115
impressions, 0 purchases.** (Last night's $69.80 was the same figure on a partial day.)
The daily CSV rollup for Aug 17–22 alone shows 2 leads and 1 `initiate_checkout` against
$62.83. The `| Traffic` campaign's action list contains **no purchase, no lead, no
initiate_checkout, no add_to_cart** — only `link_click=27, landing_page_view=21,
post_engagement=60, page_engagement=60, video_view=33`. That is expected of a traffic
objective, and it means Marion Court's cheapest clicks are also its least qualified.

**Purchases in the window are unchanged and remain scarce:** 3 in Aug 17–23 (1 on
`Tellus @Tellus360 -All Genders`, 2 on `Good Good -Retargeting`), and the daily table
shows zero on Aug 20, 21, 22 and 23. Meta dates a purchase to the ad interaction, not the
transaction, so these do not line up with GA4 dates. Per `ANALYTICS_CONTEXT.md`, GA4
revenue is own-site only and misses ~55% of real ticket revenue; **the admin dashboard is
still the only revenue truth** and nothing here should be read as a revenue figure.

**Re-check in ~1 week:** whether `Marion Court | Traffic` accumulated any
`initiate_checkout` or `purchase` action at all, and whether the two prospecting campaigns
stayed at $0.00 or came back.

---

## Which `ANALYTICS_CONTEXT.md` caveats applied tonight

- **Rolling windows fake trends (§1).** Applied directly, and it fired: the −66% figure
  above is that trap in partial-day form.
- **Campaign table is stale (§1).** Confirmed twice — `Campaign 1 Event 3 Good Good
  Campaign` is live past its listed 2026-08-13 last spend, and `Marion Court | Traffic`
  is absent entirely.
- **GA4 revenue is own-site only (§1).** No revenue conclusion drawn from GA4 tonight.
- **`begin_checkout` changed meaning 2026-08-21 (§1).** Not applicable — no GA4 funnel
  was computed. Flagged so it is on record that the trap was checked, not forgotten.
- **`view_item` does not fire on `/lp` (§1).** Relevant to Finding 3: `/lp` scroll and
  CTA behaviour cannot be inferred from `view_item`.
- **Only ~11–14% of sessions fire `scroll` (§3).** Used to temper Finding 3 down from
  "400KB of waste" to "400KB most visitors never fetch."
- **Sample sizes (§5).** Aug 23's four zero-spend campaigns are exact counts, not rates.
  No small count was converted to a percentage without showing the count.

---

## NEEDS TAYLOR INPUT

1. **Was the Marion Court prospecting shut-off deliberate?** Both `All Genders` and
   `Female` went to $0.00 on a complete Aug 23 after $35.58 combined and zero purchases,
   while a new $6-CPM traffic buy launched. If deliberate, `ANALYTICS_CONTEXT.md`'s
   campaign table needs updating. If not, something turned them off.
2. **Are the $6-CPM traffic buys the strategy now, or a stopgap?** They are 37% of spend
   and buy 3.5–5× more impressions per dollar, but `Marion Court | Traffic` has recorded
   zero checkout-intent actions of any kind. Cheap unqualified traffic against a page
   whose whole job is one tap is a real trade-off, not obviously a good one.
3. **Kill or rebuild Marion Court** — $75.53, four campaigns, seven days, zero purchases.
   This is the third consecutive report raising it.
4. **Should `ANALYTICS_CONTEXT.md` gain a "current day is partial" rule?** Tonight's
   correction would have been avoided by one sentence in that file. Adding it is an edit
   to a doc in the Business Plan folder, not to code — Taylor's call whether I should make
   that edit on a future run.
5. **Font strategy.** Self-hosting the three families, or collapsing the four URL variants
   into one, removes a render-blocking third-party request from all 34 pages. That is a
   real refactor touching every page, and it is a design/brand-adjacent decision (which
   weights actually get used), so it is not a nightly-run change.

---

## Proposed zero-risk fixes — NOT APPLIED, for a human to do

Each of these is a code change and therefore out of scope for this run. Listed smallest-
risk first.

1. **Add `aspect-ratio: 850 / 524;` to `.sp-polaroid-scatter-wrap` on the eight pages
   missing it** (`index`, `event`, `events`, `city`, `signup`, `about`, `blog`,
   `getaways`). One declaration per file, copied verbatim from `lp.html:167`. This is the
   single highest-value item in this report. **Do not also add the `width="240"
   height="240"` image attributes** — see Finding 1 for why that combination broke the
   render on `lp.html`.
2. **Add the two `fonts.googleapis.com` / `fonts.gstatic.com` preconnect lines** to the
   eight pages that request the stylesheet without them (`privacy`, `profile`, `admin`,
   `checkin`, `matches`, `terms`, `account`, `404`), matching the existing pattern.
3. **Add `async` to the four Stripe `<script>` tags** — Stripe's own documentation
   recommends it, and each page already guards its Stripe usage behind an event handler.
   Worth a quick manual check on `signup.html` (line 1,048 of 1,327) that nothing
   references `Stripe` at parse time before flipping this.
4. **Add `<link rel="preconnect" href="https://js.stripe.com">`** to the same four pages,
   and consider one for `https://www.gstatic.com` on the six Firebase pages.
5. **Add a `prefers-reduced-motion` block to `admin.html`**, the only animated page
   without one. Staff-only, so low impact, but it is two lines and completes the pattern.
6. **Re-encode the seven `/images/social/*.jpg` at 480px wide** (~412KB → an estimated
   ~120–160KB). Lower priority than it looks — they are lazy and below the fold on every
   page — and it needs a visual check that the polaroids still look right, so it is not
   truly zero-risk.
7. **Longer term, and not for a nightly run:** align the four Google Fonts URL variants,
   and add an `npm audit` step to CI (still outstanding from the 2026-08-23 M5 report and
   from `AUDIT.md`'s own recommendation of 2026-05-24).

---

## Caveats and method notes

- **Zero code changes.** Verified with `git status --porcelain` and
  `git diff --cached --name-only` before commit; both showed only this report.
- **No Lighthouse.** No Chrome binary, no egress to fetch one, no egress to the live site.
  Every performance claim is source-level and none of LCP, CLS, INP or TBT was measured.
  The M6 prompt's stated fallback was used.
- **No baseline to compare against.** `reports/` has no prior performance artifact of any
  kind. This report is the baseline; a future M6 run should diff against it.
- **The Windsor MCP was not used tonight.** A live pull for Aug 24 was attempted and the
  permission handshake failed in this non-interactive session. It was not retried, and
  that is fine: the 02:00 API pull already provided a complete, single-source Aug 23, and
  mixing a Windsor pull back in would have reintroduced the source-mismatch noise the
  2026-08-23 report warned about. **There is therefore no Aug 24 data in this report.**
- **The complete-Aug-23 figures are derived**, not read from one source — see Part 2 for
  the method and the five exact-zero residuals that corroborate it.
- **GA4 was deliberately skipped and is stale.** All 38 `download*.csv` in the Night Tasks
  folder carry window `20260519-20260823`, read from each file's own `#` header — the same
  window the 2026-08-23 report already analysed, so re-running Prompt 9 would have
  duplicated it. Two differences from that run were noted and are not data changes: the
  folder now holds **38** files rather than 36, and **three md5 duplicate pairs** exist
  (`(15)`≡`(18)`, `(23)`≡`(31)`, `(3)`≡`(4)`) where the 08-23 export had none. Same
  reports, re-downloaded. No GA4 CSV was moved, renamed or modified.
- **Both run logs were checked** before picking tonight's focus — this file's own
  `## NIGHTLY RUN LOG` and the one in `TONIGHT_PROMPT.md`. M1 ran 07-28, M2 07-31,
  M3 08-10, M4 08-22, M5 08-23; **M6, M7 and M8 have never run.** M6 was chosen over M7
  and M8 because the rotation note says M6 "is most useful after any CSS/layout-heavy
  change rather than on a fixed clock," and exactly such a change shipped on 2026-08-22
  (#243 CTA move + sticky bar, #248 waitlist de-emphasis + button restyle, #250 collage
  resize).
- **Report backlog.** `main` at `bd7be40` does not contain `GA4_ANALYSIS_2026-08-23.md`
  or `DEPENDENCY_AUDIT_2026-08-23.md` — those PRs are still open. Worth knowing when
  reading this one.
