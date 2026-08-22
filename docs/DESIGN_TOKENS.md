# SparkDate — Brand & Design Tokens

Brand guidance for Claude Design. SparkDate is a real-world singles-events brand
(Philadelphia & Lancaster, PA). The look is **dark, editorial, and warm**: a deep
navy canvas, a single coral action color, gold as a sparing accent, and a
serif/sans type pairing. Paste this whole document into Claude Design as brand
context; every value below is pulled directly from the live site's CSS.

---

## 1. Color

### Core palette

| Token | Hex | Role |
|---|---|---|
| Navy (primary background) | `#0a0e27` | The canvas. Nearly every screen sits on this. |
| Navy elevated | `#1a1f3a` | Second stop in background gradients; raised sections. |
| Navy tertiary | `#2a2f4a` | Third stop for the most-elevated sections. |
| Coral (primary action) | `#ff6b6b` | The one brand/action color — CTAs, links, highlights, accents. |
| Coral deep | `#ff5252` | Gradient end for coral (buttons, pills). |
| Coral shadow | `#c84b4b` | Darker coral, used only as a gradient end on imagery. |
| Gold (accent) | `#d4af37` | Sparing accent — numbers, small highlights, "premium" cues. Never a primary action. |
| Cream (body text) | `#f5f3f0` | Default text color on navy. |
| White | `#ffffff` | Headings and high-emphasis text. |

### Status colors

| Token | Hex |
|---|---|
| Success | `#4ade80` |
| Warning | `#facc15` |
| Danger | `#f87171` |
| Info | `#60a5fa` |

### Neutrals (rare)

| Token | Hex |
|---|---|
| Dark gray | `#1a1a1a` |
| Light gray | `#e8e4df` |

### Coral tints (surfaces & borders)

Cards and inputs are built from translucent coral over navy — this is the single
most recognizable pattern in the system:

- Surface fill: `rgba(255, 107, 107, 0.05)`
- Surface fill (hover): `rgba(255, 107, 107, 0.10)`
- Border: `rgba(255, 107, 107, 0.20)`
- Border (hover / focus): `#ff6b6b` (solid coral)
- Hairline dividers: `rgba(255, 107, 107, 0.10)`

### Text opacity ramp (cream on navy)

- Primary text: `#ffffff` or `#f5f3f0`
- Secondary text: `rgba(245, 243, 240, 0.80)`
- Muted text: `rgba(245, 243, 240, 0.70)`
- Faint / captions: `rgba(245, 243, 240, 0.40–0.50)`

### Signature gradients (always `135deg`)

| Name | Value | Use |
|---|---|---|
| Coral (action) | `linear-gradient(135deg, #ff6b6b 0%, #ff5252 100%)` | Buttons, CTA pills, form submits |
| Page dark | `linear-gradient(135deg, #0a0e27 0%, #1a1f3a 100%)` | Hero and section backgrounds |
| Section elevated | `linear-gradient(135deg, #1a1f3a 0%, #2a2f4a 100%)` | Raised content bands |
| Imagery coral | `linear-gradient(135deg, #ff6b6b 0%, #c84b4b 100%)` | Event/photo placeholders |
| Imagery purple (alt) | `linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)` | Alternating event tiles |
| Imagery green (alt) | `linear-gradient(135deg, #059669 0%, #065f46 100%)` | Alternating event tiles |

---

## 2. Typography

**Two families, loaded from Google Fonts:**

```
Playfair+Display:wght@700;900   →  all headings (serif, editorial)
Inter:wght@400;500;600          →  all body, UI, labels (sans-serif)
```

- **Headings:** `'Playfair Display', serif` — weights **700** and **900** only.
- **Body / UI:** `'Inter', sans-serif` — weights **400, 500, 600**.
- Body line-height: **1.6–1.8**. Heading line-height: **1.1**.

### Type scale (responsive, uses `clamp()`)

| Role | Size | Weight | Letter-spacing |
|---|---|---|---|
| Display H1 (homepage hero) | `clamp(52px, 12vw, 104px)` | 900 | `-2px` |
| Page H1 (interior heroes) | `clamp(40px, 7vw, 72px)` | 900 | `-1px` |
| Section title H2 | `clamp(36px, 8vw, 64px)` | 900 | `-1px` |
| Subsection H2 | `clamp(24px, 5vw, 34px)` | 700 | normal |
| Card title H3 | `22px` | 700 | normal |
| Logo wordmark | `24px` | 900 | `-1px` |
| Body | `14–18px` | 400–500 | normal |
| Eyebrow / label | `12px` | 600–700 | uppercase, `1–2px` |

**Rule of thumb:** big serif display type is tight (negative tracking, weight
900); small labels are uppercase Inter with wide positive tracking. Body copy is
cream, never pure white.

---

## 3. Components & patterns

### Buttons

**Primary CTA (nav pill) — the signature button:**
- Background: coral action gradient `linear-gradient(135deg, #ff6b6b 0%, #ff5252 100%)`
- Text: white, `12px`, weight 600, **uppercase**, letter-spacing ~1px
- Padding: `10px 24px`, radius `4px`
- **Hover inverts:** background → white, text → coral, plus `translateY(-2px)`

**Primary CTA (large / hero):**
- Same coral gradient, text white, weight **800**, `17px`
- Padding `16px 42px`, radius `6px`

### Cards

- Background: `rgba(255, 107, 107, 0.05)`
- Border: `1px solid rgba(255, 107, 107, 0.20)`
- Radius: `4px`
- Padding: ~`40px`
- **Hover:** fill → `rgba(255,107,107,0.10)`, border → solid coral `#ff6b6b`, lift `translateY(-5px)`

### Inputs

- Background: white `#ffffff`, text black
- Border: `2px solid rgba(255, 107, 107, 0.40)`, radius `4px`
- Padding: ~`12–14px 16px`

### Radii

| Element | Radius |
|---|---|
| Buttons, cards, inputs (default) | `4px` |
| Large / hero buttons | `6px` |
| Modals / dialogs | `14px` |

### Spacing & layout

- Section padding: ~`80px 40px` (generous vertical rhythm)
- Card padding: ~`40px`
- Max content width: ~`1200–1400px`, centered
- Sticky top nav: navy at 95% opacity with `backdrop-filter: blur(10px)`, coral hairline bottom border

### Motion

- Standard transition: `all 0.3s`
- Hover lifts: `translateY(-2px)` (buttons) / `translateY(-5px)` (cards)

---

## 4. Voice of the visual system (for the design agent)

- **One action color.** Coral is the only thing that invites a click. Don't
  introduce new accent hues; gold is for emphasis, never for buttons.
- **Dark-first.** Design on navy `#0a0e27`. Text is cream, not pure white,
  except headings.
- **Serif display + sans body.** Playfair Display for anything headline-sized,
  Inter for everything else. Never headline in Inter.
- **Translucent-coral surfaces.** Build cards and panels from coral-over-navy
  tints with a coral border — that low-contrast warm glow is the brand's
  signature, not flat gray cards.
- **Tight display type, wide little labels.** Huge serif headings with negative
  letter-spacing; tiny uppercase Inter eyebrows with wide tracking.
- **Restrained radius, soft lifts.** 4px corners, subtle hover elevation. Nothing
  pill-shaped except the nav CTA; nothing heavily rounded.
