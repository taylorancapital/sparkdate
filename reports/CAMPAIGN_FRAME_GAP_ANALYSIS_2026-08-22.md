# Campaign frame gap analysis — generated sheets vs. the Event 3 build

**2026-08-22.** Compares `Event3-Campaign-Export.html` (hand-built, Tellus) against
what `scripts/build-campaign-export.js` currently produces for all four events.

|  | Event 3 (hand-built) | Generated (all 4 events) |
|---|---|---|
| Frames | 68 | 90 |
| Organic / paid | 53 / **15** | 90 / **0** |
| Frame modes used | **10** | **3** |
| Photo-backed frames | **16** | 0 |
| Frames with a CTA button | 23 (34%) | 21 (23%) |
| Social-proof frames (`stat`, `quote`) | **8** | 0 |

The generated sheets are complete on *coverage* — every post, every event, correct
dates and prices. They are thin on *variety*: every carousel is `page` →
`elevated` → `endcard`, so 31 posts in a row look like the same post.

---

## The two rendering traps you asked about

### 1. `price` mode always strikes the price through

```js
const isPrice = s.mode === 'price';
...
(isPrice ? 'text-decoration:line-through;text-decoration-color:#ff6b6b;text-decoration-thickness:9px' : '')
```

Unconditional. Any frame in `price` mode gets **line1 struck through in coral, 9px
thick** — there is no "only when a second price is present" check.

That mode was built for a price *change*: old price struck out, new price beneath.
Used for a plain price it renders the live ticket price as **cancelled** — the exact
opposite of the intent, on the frame most likely to drive a sale.

The first generated run hit this: every fact frame showed `$29.99` with a line
through it. Fixed by switching those frames to `elevated` and putting the price in
the `sub` line. **`price` mode is now reserved for genuine price changes and must be
set by hand** — worth using deliberately on the early-bird cutoff posts (MC-04,
"Early bird's done"), where a struck `$18.99` above `$24.99` is precisely right.

### 2. Text colour follows the mode, not the background

The image is painted whenever `s.img` is set — **independently of mode**:

```js
if (s.img) { …<img>… + navy scrim… }
const p = PAL[s.mode] || PAL.page;
```

Only `photo` mode's palette is built for photography:

| Element | `photo` mode | `page` / `elevated` |
|---|---|---|
| line1 (`h1`) | `#fff` | `#fff` |
| **line2 (`h2`)** | `#fff` | **`#ff6b6b` coral** |
| sub | `rgba(255,255,255,.9)` | `rgba(245,243,240,.75)` |
| eyebrow | `#fff` | `#ff6b6b` (gold on `stat`/`price`) |

So **an image on any non-`photo` frame renders line2 in coral over the photograph.**
And the scrim is weakest exactly where the headline sits:

```
linear-gradient(180deg, rgba(10,14,39,.72) 0%, rgba(10,14,39,.45) 38%, rgba(10,14,39,.92) 100%)
```

45% navy at the 38% mark, with text vertically centred. Coral on a light or busy
photo at 45% scrim is a legibility problem, not a style preference.

**Rule: if a frame carries `img`, it must be `mode: 'photo'`.** Worth enforcing in
the builder rather than trusting it — a one-line guard, since the failure is silent
and only visible once you look at the exported PNG.

---

## What the hand-built sheet does that the generator does not

### Paid frames — 15 of 68, currently zero

Event 3 carried a full ad set alongside the organic calendar, and the sheet's
filter bar already has an **"Ads only"** view driven by `group: 'ads'`. The
generator emits `group: 'organic'` for everything, so that filter is empty.

Paid creative is a different brief — shorter copy, harder CTA, no "link in bio" —
so this is not just a flag to flip. But the plumbing exists and is unused.

### Photography — 16 frames, currently zero

Every generated frame is type on a colour field. Event 3 alternated real event
photos through the run, which is what stopped it reading as a slide deck.

The 5 live-coverage rows are held back deliberately. But the *other* posts could
carry photos from the confirmed list (`IMG_8859`, `8861`, `8862`, `8865`, `9001`,
`9004`, `9005` — see `brand.json`; `IMG_9203/9204/9207` are pulled from all use).
Nothing in the generator can reference them, because `queue.csv` has no field for
"which photo goes on this frame".

**Suggestion:** add an optional `photo_refs` column. Where present, the builder
emits `mode:'photo'` with `img` set. Cheap, and it converts the single most
repetitive stretch of the calendar.

### Social proof — `stat` and `quote`, 8 frames, currently zero

Both facts are already in `brand.json` and neither is ever rendered:

- `approved_stat` — **22**, Event 1 attendance. `stat` mode sets it in **gold at
  300px** when the value is ≤3 characters. Event 3 used it 6 times.
- `approved_testimonials` — the Quang quote. `quote` mode exists for it, gold
  eyebrow, italic serif. Used twice in Event 3.

The 21-beat template already has beats for both (**T-6 social proof**, **T-4
testimonial**), and the captions for those rows exist. The builder just renders
them as ordinary statement frames.

**Suggestion:** map the beat to the mode. A row whose template beat is "Social
proof" → `stat`; "Testimonial" → `quote`. That is a lookup, not new content, and it
brings the two highest-converting frame types into the run.

### The crossed-out list — 1 frame, currently zero

`crossed` renders struck-through uppercase lines — Event 3 used it once for the
"no profiles / no swiping / no algorithm" differentiation beat. That beat appears
in the template at **T-8** and in several captions. It is the brand's sharpest
visual device and it is not being generated.

### CTA coverage — 34% vs 23%

Event 3 put a CTA button on a third of frames and varied the wording. The generator
puts one only on the closing frame, always "Get tickets". Mid-carousel CTAs on the
fact frame are worth adding.

---

## Priority

1. **Guard `img` → `photo` mode.** One line. Prevents coral-on-photo shipping silently.
2. **Map beats to `stat` / `quote` / `crossed`.** No new content — the facts and
   captions already exist, and it fixes most of the monotony.
3. **Use `price` mode deliberately** on the two early-bird-cutoff posts, where a
   struck-through old price is correct.
4. **Add `photo_refs` to the queue** so real photography can enter the run.
5. **Paid frames** — after the organic calendar is actually shipping.

Items 1–3 are changes to `build-campaign-export.js` alone and would land in an hour.
Item 4 needs a queue column and someone deciding which photo goes where.
