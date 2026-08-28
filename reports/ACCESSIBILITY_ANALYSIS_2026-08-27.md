# Accessibility Spot-Check — 2026-08-27

**THIS RUN MADE ZERO CODE CHANGES.** The only file added to the repo is this report.
Nothing in `public/`, `api/`, `lib/`, `vercel.json`, `package.json` or anywhere else was
edited, and no fix described below has been applied. Everything in the two
recommendation sections is a proposal awaiting Taylor's approval.

**Prompt:** M7 — Accessibility Spot-Check (maintenance rotation). **First M7 run ever.**
**Pages audited:** `public/lp.html`, `public/event.html`, `public/events.html`.
**`ANALYTICS_CONTEXT.md` as read tonight: "Last updated: 2026-08-26."** (Stated per that
file's own sync-warning instruction, so a stale sandbox copy is visible in the report
itself. This copy already contains the 08-26 corrections — the datacenter-traffic
section, the resumed Good Good campaign, the two-day export-tail rule — so it is current
as of last night, not forked.)

---

## Why M7 and not GA4

**The GA4 export is stale — it is byte-for-byte the same drop the 08-26 report already
analysed.** All 39 `download*.csv` files carry the window `20260519-20260826` in their own
`#` header (read from the headers, not filenames), and all 39 file mtimes are 2026-08-26
12:41–12:54 — the same 12:41 drop the 08-26 run described. All 39 md5s are distinct from
each other, i.e. no duplicate pairs within the export, but the export as a whole has not
moved. Per the run instruction ("if the export is unchanged from what a prior report
already analyzed, treat GA4 as stale"), re-running Prompt 9 would have reproduced last
night's numbers.

Meta is stale too: the newest Windsor/Meta pull in the folder is
`meta-insights-2026-08-25.csv` (written 08-26 06:59), which is exactly the file the 08-26
report used. No `meta-insights-2026-08-26.csv` exists.

**Rotation position.** Both run logs were checked (the prompt library's `## NIGHTLY RUN
LOG` and `TONIGHT_PROMPT.md`). Maintenance history: M1 2026-07-28, M2 07-31, M3 08-10,
M4 08-22, M5 08-23, M6 08-24. **M7 and M8 have never run.** M7 is next in sequence, and
it is the better of the two tonight for a specific reason: the 2026-08-22 deploy (#243,
#248, #250) restyled the `/lp` buy button, added a sticky ticket bar, and resized the
photo collage — button restyles and new fixed-position UI are exactly where contrast and
focus regressions enter. The 08-24 run picked M6 over M7/M8 for the same
"after-a-layout-change" logic; that logic now points at M7.

**Page selection.** `reports/SEO_CTA_HEALTH_CHECK_2026-07-28.md` already spot-checked alt
text on `index.html`, `about.html`, `lp.html` and all 11 blog posts, and explicitly
recorded that it **did not review `events.html` or `event.html`**. Those two have
therefore never been audited and are the highest-stakes pages on the site — `/event` is
where the entire email nurture sequence lands and where checkout starts. `lp.html` was
re-included despite its 07-28 pass because it takes ~50% of sessions and was substantially
rebuilt on 08-22.

---

## HEADLINE — the site's standard button treatment fails WCAG AA contrast, and the one button that was redesigned on 08-22 proves the fix

**White text on the coral brand gradient measures 2.78:1 against `#ff6b6b` and 3.19:1
against `#ff5252`. WCAG 2.1 AA (SC 1.4.3) requires 4.5:1 for text below 18.66px bold /
24px normal.** Every primary action on all three audited pages uses this treatment.

| Element | Page | Size / weight | Colors | Ratio | Needs | Verdict |
|---|---|---|---|---|---|---|
| `.checkout-btn` — **the pay button** | event.html:373, events.html:785 | 14px / 700 uppercase | `#fff` on coral grad | **2.78–3.19:1** | 4.5 | **FAIL** |
| `button` (waitlist "Notify Me") | lp.html:57 | 15px / 700 | `#fff` on coral grad | **2.78–3.19:1** | 4.5 | **FAIL** |
| `.lp-sticky a` — sticky-bar Get Tickets | lp.html:109 | 14px / 700 | `#fff` on coral grad | **2.78:1** | 4.5 | **FAIL** |
| `.cta-nav` — header CTA | event.html:120, events.html:137 | 12px / 600 uppercase | `#fff` on coral grad | **2.78–3.19:1** | 4.5 | **FAIL** |
| `.btn` — generic card CTA | events.html:354 | 13px / 600 | `#fff` on coral grad | **2.78–3.19:1** | 4.5 | **FAIL** |
| newsletter "Notify Me" (inline style) | events.html:1105 | inherit / 600 | `#fff` on coral grad | **2.78–3.19:1** | 4.5 | **FAIL** |

**The counter-example is in the same file and it is decisive.** PR #248 restyled the `/lp`
ticket button to a white background with navy text:

```
.event .ticket { background: #fff; color: #0a0e27; ... }   /* lp.html:73 */
```

That measures **19.00:1** — and the code comment above it claims "White wins the card at
roughly 17:1 contrast," so contrast was already an explicit consideration in that
decision. **The 08-22 work fixed the single most important button on the site and left
every other button on the old treatment.** This is not a new regression; it is a
long-standing pattern that one recent PR partially corrected.

**Blast radius (grep count, not a full audit): all 34 HTML files** — 16 in `public/` and
all 16 blog posts — contain at least one `linear-gradient(135deg, var(--coral)…)` rule.
Only the three audited pages were verified line-by-line; the other 31 are named here so
the scope of any fix is not underestimated.

### Two fixes that keep the brand color exactly as it is

Measured, not guessed:

- **Navy text on the existing coral gradient:** `#0a0e27` on `#ff6b6b` = **6.85:1**;
  on `#ff5252` = **5.96:1**. Both pass AA comfortably with **zero change to the palette**
  — and it is the same navy-on-light pairing #248 already chose for the ticket button.
- **Darken the coral, keep white text:** the darkest same-hue coral that passes 4.5:1
  with `#fff` is **`#c25151`** (4.58:1). This changes the brand color and is the weaker
  option; noted only so the trade-off is visible.

Both are design/brand decisions, so per M7's own instruction ("anything requiring a
color/design change, flag rather than change unilaterally") **neither was applied.**

---

## Second finding — body-copy contrast failures, worst of them on the checkout legal text

Same method: alpha-composited over the real background (`--primary-navy #0a0e27`;
`/lp`'s gradient runs to `#1a1f3a`, checked at both ends).

| Element | Page | Size | Color | Ratio | Verdict |
|---|---|---|---|---|---|
| `.event-meta-row .meta-label` (WHEN/WHERE/PRICE labels on event cards) | events.html:322 | 10px / 700 uppercase | cream @ **0.35** | **2.97:1** | **FAIL** — worst on the site |
| `.checkout-fineprint .fp-legal` — **legal text directly under the pay button** | event.html:453, events.html:868 | 11px | cream @ **0.42** | **3.77:1** | **FAIL** |
| `.foot` — footer | lp.html:81 | 12px | cream @ **0.45** | **4.17:1** (4.02:1 at the light end of the gradient) | **FAIL** |
| `(optional)` hints inside form labels | event.html:831,880; events.html:1229,1277 | inherit | cream @ **0.45** | **4.17:1** | **FAIL** |

**Where the alpha threshold sits, measured:** cream on navy passes 4.5:1 at **α ≥ 0.50**
(4.87:1) and fails below it (0.45 → 4.17:1, 0.42 → 3.77:1, 0.35 → 2.97:1). Every value at
0.50 and above that appears in these three files passes. So this is a small, bounded set:
**raising the four values above to 0.50 clears all of them**, and nothing else in the three
files needs to move.

Contrast checks that **passed** and need no action: coral `#ff6b6b` text on navy 6.85:1;
gold `#d4af37` on navy 9.04:1; the sticky bar's own text 9.82:1; `.lp-quote` italic
testimonial 13.40:1 (cream @0.92 on the quote's own translucent card); the `/lp` divider at α0.50 4.87:1; footer links at
α0.60 6.56:1; the in-app-browser dismiss "×" 6.56:1.

---

## Third finding — heading outlines are broken on two of three pages

- **`lp.html`: h1 → h3 → h2 → h2.** The ticket card's `<h3 id="lpTitle">SparkDate
  Mixer</h3>` (line 308) is the first heading after the `<h1>`, with no `<h2>` between
  them, and the page's actual `<h2>`s come *after* it. A screen-reader user navigating by
  heading level hits the primary revenue element at the wrong depth. Given that this card
  is the whole point of the page, this is the heading defect most worth fixing.
- **`events.html`: h1 → h3 (×3) → h2 …** The three "how it works" steps at lines
  1011/1016/1021 are `<h3>`s directly under the `<h1>` with no `<h2>`.
- **`event.html`: no skip, but the outline is out of order.** The first heading in the
  document is the social-proof `<h2>` at line 674; the page's `<h1>` (`.event-title`) does
  not appear until line 716. Levels never skip, so this passes the strict M7 check, but
  the `<h1>` is not the first heading a screen reader encounters.

All three pages have **exactly one `<h1>`** and a valid `lang="en"` — both correct.

---

## Fourth finding — no `<main>` landmark and no skip link, site-wide

- **`<main>` exists on exactly one page in the whole repo: `public/404.html`.** Not on
  `lp.html`, `event.html`, `events.html`, or the other 12 pages in `public/`.
- **No page on the site has a skip-to-content link** (`grep -ril 'skip.to.(main|content)'
  public/*.html` returns nothing).

For `event.html` and `events.html`, which carry a `<nav>`, this means a keyboard user tabs
through the whole header before reaching the content on every page load. `lp.html` has no
`<nav>` at all, so the cost there is lower — but it also has no landmark structure of any
kind. This is a real WCAG 2.4.1 (Bypass Blocks) gap, though a mild one on these
particular pages given how short the headers are.

---

## What was checked and is CLEAN — do not re-audit these

Recording these so a future M7 run does not spend the night rediscovering them.

- **Alt text: no genuine defects on any of the three pages.** All 7 press logos on `/lp`
  carry brand-name alt (`Google News`, `Eventbrite`, `Pinterest`, `Yahoo News`,
  `Facebook`, `Patch`, `Ticket Tailor`) — correct for a logo. All 7 social polaroids on
  each of the three pages carry descriptive, non-filename alt (`Rooftop mixer crowd`,
  `Candid moment at a mixer`, …). Confirms and extends the 07-28 finding to the two pages
  it had not reached.
- **Form labels: every visible control on all three pages has an accessible name.**
  `event.html` — 11 visible controls, 11 associated via `<label for>`. `events.html` — 13
  visible controls, 11 via `<label for>` and 2 via `aria-label`. `lp.html` — 1 visible
  control, via `aria-label="Email address"`. **Zero placeholder-only inputs.** This is the
  highest-stakes surface on the site (checkout, waitlist, newsletter) and it is done
  properly.
- **All five spam honeypots are implemented correctly.** `input[name="website"]` at
  `lp.html:478`, `event.html:795`, `events.html:1102` and `events.html:1186` in static
  markup, plus one more at `events.html:2537` injected at runtime by the getaways template
  literal. All five carry `aria-hidden="true"` + `tabindex="-1"` + off-screen positioning,
  so a screen-reader user cannot reach them and no assistive-tech user can trip the spam
  filter by filling one in. (My automated pass flagged the static four as "no accessible
  name" — **false positive**, they are correctly hidden. Worth stating because a future
  automated sweep will flag them again.)
- **The `events.html` event modal is genuinely well built.** `role="dialog"`,
  `aria-modal="true"`, `aria-labelledby="eventModalTitle"`, close button with
  `aria-label="Close"`, Escape-to-close (line 2067), backdrop-click-to-close (2064), and
  focus explicitly moved into the dialog on open with a comment explaining why. The
  `<h3 id="eventModalTitle">—</h3>` placeholder is populated (line 1949) **before** the
  dialog is shown (line 2002), so the dialog never announces "—". Checked specifically
  because a static em-dash as an `aria-labelledby` target looked like a defect; it is not.
- **No empty links or buttons.** Zero `<a>` or `<button>` on any of the three pages lacks
  both text and an `aria-label`/`title`. The four footer social icons use
  `aria-label="Instagram"/"TikTok"/"Facebook"/"Twitter / X"`.
- **The four 18×18 `fill="currentColor"` SVGs at `events.html:1412–1415` lack
  `aria-hidden`** — but they sit inside those labelled links, so the link's `aria-label`
  supplies the name and nothing is announced twice in a harmful way. **Cosmetic, not a
  defect.** The 4 larger decorative SVGs at 1464+ already carry `aria-hidden="true"`.
- **No viewport zoom locks.** No `user-scalable=no` or `maximum-scale` on any of the three
  pages.
- **`lp.html`'s `<h1>`** renders as `You show up.<br>We <span>handle the rest.</span>` — my
  text extraction collapsed this to "You show up.Wehandle the rest.", which is a
  **parser artifact, not a real reading problem**. Flagged only so the same false positive
  is not re-raised.

---

## NEEDS TAYLOR INPUT

These are brand, design or scope decisions. **None has been applied.**

1. **Button contrast — pick a direction.** White-on-coral is 2.78–3.19:1 against a 4.5:1
   requirement, on every primary action including the pay button. Two measured options:
   navy `#0a0e27` on the unchanged coral gradient (**6.85:1 / 5.96:1**, no palette change,
   already the treatment #248 chose for the `/lp` ticket button), or darken the coral to
   `#c25151` and keep white text (**4.58:1**, changes the brand color). **This is a
   brand-voice call and M7 explicitly says not to make it unilaterally.** Scope also needs
   deciding: the 3 audited pages, the 16 pages in `public/`, or all 34 including the blog.
   *Re-check in ~1 week:* not reliably measurable in GA4 at this volume — see caveats. The
   honest check is a manual re-measure after the change, plus watching `select_promotion`
   and `add_to_cart` for the absence of a *drop*, not for a lift.
2. **Is WCAG AA the target at all?** Everything above is scored against WCAG 2.1 AA. That
   is the normal commercial baseline and the standard most US public-accommodation
   arguments reference, but nobody has stated it as SparkDate's target. Worth one sentence
   of decision, because it determines whether items 1 and the α<0.50 text below are "bugs"
   or "nice to have." Related: the guardrails already treat PA public-accommodations law as
   a legal-risk area for gender-based logic — whether web accessibility sits in the same
   bucket is a question for counsel, not for this report. **I am not offering a legal
   opinion on it.**
3. **Skip link + `<main>` — worth doing site-wide, or not at all?** Adding these to 3 of 16
   pages is worse than not doing it (inconsistent keyboard behaviour between pages). This
   is a small but genuinely site-wide change, so it needs a yes/no on scope rather than a
   drive-by fix.

---

## Proposed zero-risk fixes — NOT APPLIED, for a human to do

Each of these is mechanical, has no design judgment in it, and touches one line. **None
has been made.**

1. **Raise the four sub-0.50 cream alphas to 0.50.** `events.html:322` (0.35 → 0.50),
   `event.html:453` and `events.html:868` (0.42 → 0.50), `lp.html:81` (0.45 → 0.50), and
   the four inline `(optional)` hints at `event.html:831,880` / `events.html:1229,1277`
   (0.45 → 0.50). Measured: 0.50 = 4.87:1, the lowest value that clears AA on this
   background. This is deliberately the minimum change — it preserves the visual hierarchy
   the low alphas were chosen for. *Re-check in ~1 week:* manual re-measure only; too small
   to show in GA4.
2. **`lp.html:308` — the ticket-card heading.** `<h3 id="lpTitle">` directly under the
   `<h1>` with no `<h2>`. Changing it to `<h2>` fixes the outline and changes nothing
   visually if the existing `.event h3` CSS selector is updated with it. Flagged rather
   than done because it touches both markup and a CSS selector, and because `#lpTitle` is
   written to by JS (`lp.html` next-event fetch) — the `id` must survive the change.
   *Re-check:* none needed; verify by re-running this audit.
3. **`events.html:1011,1016,1021` — the three "how it works" `<h3>`s** under the `<h1>`
   with no `<h2>`. Same shape as above.
4. **Add `alt=""` to the three Facebook-pixel `<noscript>` images** (`lp.html`,
   `event.html`, `events.html`). They are 1×1 tracking pixels with no `alt` attribute at
   all; `alt=""` marks them decorative. Trivial, but it is the only literal
   missing-`alt` in the audit and it will keep showing up in every automated sweep until
   it is fixed.
5. **Add `aria-hidden="true"` to the four social icons at `events.html:1412–1415`**, to
   match the pattern already used on the decorative SVGs at 1464+. Cosmetic consistency,
   no behaviour change.

Not proposed as zero-risk, deliberately: the `outline: none` on focused inputs
(`event.html:322`, `events.html:760`) substitutes a coral border-colour change as the focus
indicator. That is a real substitute rather than a naked removal, so it is defensible —
but whether the substituted indicator meets SC 1.4.11's 3:1 requirement depends on the
unfocused border colour it replaces, which varies by state. **I did not measure it
end-to-end and am not claiming it fails.** Worth a look in a future M7 run.

---

## Caveats and method

- **Static source analysis only. No browser was used.** Contrast ratios were computed from
  the declared CSS values, alpha-composited over the declared background, using the WCAG
  2.1 relative-luminance formula. Where a background is a gradient, both endpoints were
  computed and both are reported. **Nothing was verified against a rendered page**, so any
  value overridden at runtime by JS, a media query, or a cascade order I did not trace
  could differ. The button figures are the most solid — those are flat declared colors on
  the element itself.
- **Three pages out of 34.** `lp.html`, `event.html`, `events.html`. The 13 other pages in
  `public/` and all 16 blog posts were **not** audited; the only claim made about them is
  the grep count of coral-gradient rules, which is a count, not an audit.
- **The heading and label checks were parser-based** (BeautifulSoup over the raw source),
  so they see the static DOM only. `events.html` and `event.html` both build significant UI
  in JS; headings or controls injected at runtime were not evaluated.
- **Which `ANALYTICS_CONTEXT.md` caveats applied tonight:** almost none, because this run
  computed no GA4 numbers. Two touched it indirectly and are handled: the **`/lp` 50%-of-
  sessions** and **61–78% webview share** figures are quoted from §3/§5 as context for page
  selection, quoted as the range that file specifies rather than as a point estimate, and
  nothing in this report's conclusions depends on either. The **`begin_checkout`** trap,
  the **two-day export tail**, the **2026-08-25 internal-traffic cliff** and the **Meta
  rolling-window** trap did not apply — no date-range comparison was made at all.
- **No prior-period file to trend against.** M7 has never run, so there is no accessibility
  baseline in `reports/`. Tonight's numbers are the baseline.
- **On measuring an accessibility fix in GA4: mostly you can't, and I am not going to
  pretend otherwise.** Per §5, at ~29 purchases per 90 days everything below `add_to_cart`
  is single digits, and a contrast change is not an intervention GA4 can isolate from
  campaign churn. The recommendations above ask for manual re-measurement rather than a
  GA4 read wherever a GA4 read would be noise. The one partial exception: if the button
  contrast fix ships, `select_promotion` (including the `lp_sticky_bar` value) and
  `add_to_cart` are the events to watch — **for the absence of a regression**, not for a
  lift, and only on a window starting **2026-08-22 or later** so it does not span the
  `begin_checkout` redefinition.
- **Two automated false positives are disclosed above rather than dropped silently** (the
  honeypot inputs, the `<br>` in the `/lp` `<h1>`), plus two flagged-then-cleared items
  (the modal's `—` placeholder, the icon SVGs). Given this workflow's recent history of
  retractions, the cleared items are recorded as deliberately as the failures.
