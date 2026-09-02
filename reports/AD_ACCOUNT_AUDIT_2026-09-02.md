# Meta ad account audit — ads, UTMs, audiences, pixel (2026-09-02)

**Read-only.** Every figure pulled live from `act_1672342180672647` via Graph
v21.0 between 13:40 and 14:10 local. This file changes no ad, no audience and no
site code.

Two changes *were* made to the account earlier today, before this audit, and
they are recorded here so the numbers read correctly: the pixel was attached to
the two Marion Court Traffic ads, and the buyer exclusion on "Visited but did
not order tickets" was repaired. Nothing else was touched. **No budget was
changed, and Loxleys was not touched at all** — its ladder ($3/day → $9 on
Sep 8 → $11.57 on Sep 15, retire after 09-22) is deliberate.

---

## The four things worth acting on

1. **`utm_content=proof_rsa1` is on 13 delivered ads**, $554.39 lifetime and
   $109.79 in the last seven days — **46% of all spend the account has ever
   made is a single undifferentiated bucket in GA4.** This is bigger than the
   two Traffic ads HANDOFF describes; it spans three events and both objectives.
2. **`GG Women - Traffic` tags its clicks `utm_source=Facebook` and serves
   98.6% on Instagram** ($60.99 Instagram vs $0.86 Facebook). Every one of its
   282 women's landing-page views is labelled with the wrong channel.
3. **All paid traffic lands on `/lp`**, the page the 09-01 GA4 report measured at
   $0.10 a session against `/event`'s $2.42.
4. **The pixel's own funnel is inconsistent**: `InitiateCheckout` (50) is nearly
   three times `AddToCart` (19) over seven days. Checkout is being reached
   without AddToCart firing.

## Not a problem, checked and cleared

**No money is going to events that already happened.** Five campaigns are still
`ACTIVE` for Tellus (08-26) and Good Good (08-31), which looks alarming in a
campaign list. Daily spend says the end dates are being honoured exactly:

| Ad set | 08-29 | 08-30 | 08-31 | 09-01 | 09-02 |
|---|---:|---:|---:|---:|---:|
| Good Good \| Female \| Traffic (ends 08-31) | $5.23 | $15.55 | $9.80 | — | — |
| Good Good Campaign-Retargeting (ends 08-31) | $3.52 | $5.63 | $7.02 | — | — |
| Campaign 1 Event 3 Good Good Ad set (ends 08-31) | $4.47 | $2.80 | — | — | — |
| All three Tellus sets (end 08-26) | — | — | — | — | — |

A 7-day spend column made these look live; they are not. It is a naming and
hygiene issue, not a spend issue.

---

## 1. Pixel — one dataset, healthy, one odd shape

`4390442851170732` "Sparkdate Date's Pixel - Active Version", created
2026-06-16. **It is the only dataset on the account.** Automatic matching is
**on**; data use is `advertising_and_analytics`.

Seven days to 2026-09-02:

| Event | Count |
|---|---:|
| PageView | 2,811 |
| Lead | 215 |
| ViewContent | 157 |
| InitiateCheckout | **50** |
| AddToCart | **19** |
| Purchase | 18 |
| AddPaymentInfo | 12 |
| Contact | 10 |
| CompleteRegistration | 8 |

Two inversions:

- **`InitiateCheckout` 50 > `AddToCart` 19.** A checkout should not be startable
  without a cart in a funnel where AddToCart precedes it, so either AddToCart is
  not firing on every path into checkout, or the two are wired to different
  actions than their names suggest. **NOT VERIFIED** — I did not read the
  client-side firing code.
- **`Purchase` 18 > `AddPaymentInfo` 12.** This one is explained: Purchase fires
  server-side as well as from the page, including the Eventbrite import path, so
  server-side purchases have no browser-side AddPaymentInfo before them. Same
  reason `Lead` is 215.

**Per-ad tracking:** 13 of 40 delivered ads carry no pixel in `tracking_specs`,
holding $389.85. All 13 are archived June/July ads plus `GG Women - Traffic`,
whose ad set ended 08-31 — none can serve again, so there is nothing to fix.
Both live Marion Court Traffic ads were attached this morning and now report.

## 2. UTMs — the measurement is worse than the last report said

### `proof_rsa1` is 46% of all spend, in one bucket

| Status | Lifetime | Ad |
|---|---:|---|
| ACTIVE | $73.06 | Tellus AfterDark: Singles Edition Retargeting |
| ACTIVE | $62.10 | GG Women - Traffic |
| ARCHIVED | $61.76 | Event 4 Good Good — Sales Object-Women |
| ACTIVE | $60.74 | Event 3 Tellus — Sales Obj Women |
| ACTIVE | $60.64 | Event 3 Tellus — Sales Obj All Genders |
| IN_PROCESS | $55.23 | MC Women - Video Ad (Traffic) |
| PAUSED | $51.44 | Event 3 Good Good Ad |
| ARCHIVED | $44.77 | Event 4 Good Good — Sale Obj Women |
| PAUSED | $20.92 | Event 3 Tellus — Women Ad |
| PAUSED | $19.01 | Event 3 Tellus Ad |
| ARCHIVED | $18.23 | MC All Genders - Video Ad |
| ARCHIVED | $17.35 | MC Women - Video Ad |
| IN_PROCESS | $9.14 | MC All Genders - Video Ad (Traffic) |
| | **$554.39** | **13 ads, $109.79 in the last 7 days** |

HANDOFF describes this as the two Marion Court Traffic ads sharing a tag. It is
three events, two objectives, prospecting and retargeting, women-only and
all-genders — all landing in one GA4 row. `week1_rsa1` repeats it on three
archived ads ($35.66).

**17 of 40 delivered ads carry no `utm_content` at all** ($436 lifetime), though
all are archived.

### `utm_source` is hand-typed and often wrong

| Value | Ads | Note |
|---|---:|---|
| `Facebook` | 17 | hardcoded |
| (none) | 12 | archived |
| `Instagram` | 5 | hardcoded |
| `facebook` | 4 | lowercase — the June shape HANDOFF watches for; all archived |
| `{{site_source_name}}` | 2 | **correct** — both Loxleys prime ads |

Hardcoding is not a style question here, it is wrong data:

- **`GG Women - Traffic`** tags `utm_source=Facebook`. Its delivery is **$60.99
  Instagram against $0.86 Facebook** — 98.6% of its clicks are mislabelled.
- **Both Marion Court Traffic ads** tag `utm_source=Instagram` while serving on
  both placements.

Only `scripts/meta-create-lx-prime-ads.js` gets this right, via the
`{{site_source_name}}` macro in `url_tags`, which Meta fills per placement.

**One thing that is clean:** no ad sets UTMs in both the link and `url_tags`.
The older ads use the link, the two Loxleys ads use `url_tags`, and none
overlap — so no click carries two `utm_source` values. Every delivered ad also
carries an `eventId`.

### Everything lands on `/lp`

Every live ad points at `/lp` except `Tellus AfterDark: Singles Edition
Retargeting`, which points at `/events`. Per the 09-01 GA4 report, `/lp` returns
$0.10 a session and `/event` $2.42. **This is the single largest gap between
where the money goes and where it converts**, and it is unchanged since #401
raised it.

## 3. Audiences — nine exist, one is wired up

| Audience | Type | Size | Meta's verdict | Used by |
|---|---|---:|---|---|
| MC Retargeting | video | 1000+ | ready | **MC Retargeting set** |
| Tellus360 Retargeting | video | 1000+ | ready | nothing |
| Good Good Thing Retargeting | video | 1000+ | ready | *(Event 4 RT set)* |
| Tellus AfterDark Retargeting | video | 1000+ | ready | *(Tellus RT set)* |
| Video Watched | video | 1000–1200 | ready | nothing |
| Visited but did not order tickets | website | 20 | ready | **nothing** |
| Loxleys Retargeting - Site Visitors | website | 20 | ready | **nothing** |
| Tellus AfterDark Retarget | website | 20 | ready | **nothing** |
| Event visitors – 30d, excl buyers | fb event | 1000 | **too small to use** | nothing |

- **No website audience is attached to any ad set.** The video audiences carry
  all the retargeting that exists.
- **Loxleys has no retargeting.** Its site-visitor audience was built 08-30 and
  never attached; `Loxley's Retargeting` (campaign, $5/day) and
  `LX Retargeting | Video Viewers + Site Visitors` are both PAUSED. Going into
  09-22 the account prospects Loxleys and does not retarget it.
- **The Marion Court retargeting set is named "Video Viewers + Site Visitors"
  and carries only the video audience.** Unchanged, deliberately — attaching an
  audience is a targeting edit and would restart learning six days from the
  event.
- **Sizes are unreadable.** Every website audience reports exactly 20 and every
  video audience exactly 1000; `Video Watched` reports 1000–1200, so Meta can
  return a real range when it has one. Treat 20 as a non-disclosure floor.
  `delivery_status` is the field that actually discriminates — it flags the
  fb_event audience as too small and none of the others.
- **"Visited but did not order tickets" excluded buyers by `url contains
  "order"`,** and this site has no such URL — checkout is an in-page Stripe
  Payment Intent (`api/purchase-ticket.js:709`, `allow_redirects: 'never'`). The
  exclusion matched nobody. Repaired this morning to exclude the `Purchase`
  event; inclusion untouched.

## 4. Campaigns and ad sets — naming, not spending

| Campaign | Status | Objective | Budget |
|---|---|---|---:|
| Marion Court \| Traffic | ACTIVE | Traffic | $10.00/day |
| Marion Court Retargeting | ACTIVE | Sales | $6.00/day |
| Loxleys \| Traffic | ACTIVE | Traffic | $3.00/day |
| Campaign 1 Event 4 Good Good Campaign-Retargeting | ACTIVE | Sales | $10.00/day |
| Campaign 1 Event 3 Tellus … -All Genders | ACTIVE | Sales | $3.00/day |
| Campaign 1 Event 3 Tellus … -Sales-Obj-Women | ACTIVE | Sales | $3.00/day |
| Campaign 1 Tellus AfterDark Retargeting | ACTIVE | Sales | $2.00/day |
| Campaign 1 Event 3 Good Good Campaign | ACTIVE | Traffic | at ad set |
| **Loxley's \| Traffic** | PAUSED | Traffic | $10.00/day |
| **Loxley's Retargeting** | PAUSED | Sales | $5.00/day |
| Campaign 1 Event 3 Tellus … Campaign | PAUSED | Traffic | at ad set |
| Campaign 1 Event 3 Tellus … Women Campaign | PAUSED | Traffic | at ad set |

- **Five ACTIVE campaigns belong to finished events.** They are not spending
  (§ above), but they carry live daily budgets — $18/day between them — behind
  ad sets whose end dates have passed. If an end date were ever cleared or
  extended, that budget starts immediately.
- **There are two Loxleys traffic campaigns**, distinguished only by an
  apostrophe: `Loxleys | Traffic` (ACTIVE, $3.00/day, the ladder) and
  `Loxley's | Traffic` (PAUSED, $10.00/day). Unpausing the wrong one costs
  3.3× the intended rate on day one.
- **Loxleys' current split, for information only:** over 08-30 to 09-02 the male
  set took $5.22 and the female set $4.64 of the $3/day campaign budget — about
  53/47 male. No change made or recommended here; the ladder is Taylor's.

## What I did not verify

- **Why `InitiateCheckout` exceeds `AddToCart`.** I read the counts, not the
  client-side firing code. The inversion is real; its cause is not established.
- **Whether the `Purchase`-event exclusion has repopulated** the repaired
  audience. Meta reported it "ready for use" immediately after the write, but
  membership rebuilds over the 60-day window and I did not re-read it later.
- **GA4's side of any UTM claim.** The mislabelling above is derived from Meta's
  placement delivery against the tag on the ad; I did not open GA4 to see how
  those sessions actually landed.
- **Audience true sizes.** Not obtainable — Meta returns floors.
- **Ad-set change history.** Still unpulled (`/{adset_id}/activities`), so the
  28% gender leak in #400 §1 remains mechanism-inferred.
- **Whether the two Marion Court Traffic ads have cleared review.** They were
  `PENDING_REVIEW` after this morning's pixel attach and had not returned to
  `ACTIVE` when this audit was pulled.
