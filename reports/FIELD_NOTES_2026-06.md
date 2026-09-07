# Field notes — June 2026

**Three incidents. Two were caught the same day they shipped; the third sat
live for five days before anyone found it.** SparkDate went live with real
Stripe payments on 2026-06-02. This is the first month with anything real to
lose.

*Retroactive edition, written 2026-09-07. Continues numbering from
`reports/FIELD_NOTES_2026-05.md` — see that edition's numbering note.*

## Detection

| Detection | This month | Cumulative |
|---|---:|---:|
| `GATE` — a deterministic check refused it | 0 | 0 |
| `THREW` — an actual error surfaced | 2 | 2 |
| `HUMAN` — someone distrusted a number | 1 | 2 |
| `OPERATOR` — reported as "data went missing" | 0 | 0 |
| `LATER` — found by an unrelated dig | 0 | 0 |
| **Total** | **3** | **4** |

Both `THREW` catches this month were genuine — a syntax error and a broken
initialization both fail loudly by nature. Do not read this as evidence that
"the system catches most things": both of June's automated catches were bugs
of a kind that is nearly impossible to ship silently. May's and August's
incidents are the more representative case.

---

## A. The agent was confidently wrong

### 24 — Two checkout gaps shipped with the original build, found five days after go-live · `HUMAN`

Fixed 2026-06-07 (`2b9a0f6d`), labeled P1 and P2:

- **P1 — 3-D Secure guests fell out of the funnel.** A guest paying with a
  3DS card gets `requiresAction` back from `purchase-ticket` *before* the
  inline `enrollGuestAsMember`/`recordLead` calls run. The ticket still
  confirmed correctly once the card cleared, but the guest got no welcome
  email, no 30-day Spark trial, and no nurture lead — the entire
  post-purchase funnel silently did not apply to anyone who hit a 3DS
  challenge.
- **P2 — a duplicate submit could hold a phantom seat.** Re-submitting a
  purchase reused the same Stripe idempotency key and got the same
  PaymentIntent back, but the seat counter had already been bumped a second
  time by the new request before the duplicate was recognised.

**Cost:** the 3DS-guest gap was live with real payments from 2026-06-02
(Stripe went live) to 2026-06-07 — five days. Any guest who hit a 3DS
challenge in that window has no record of ever receiving the trial-enrollment
funnel; there is no way to reconstruct after the fact how many that was. The
phantom-seat gap's worst case, per the fix commit, was "an over-counted seat,
never an oversell or double charge" — real but bounded.

**Anchor:** commit `2b9a0f6d` (2026-06-07, `Co-Authored-By: Claude Opus 4.8`).
The gap traces to the original 3DS/trial-enrollment build around 2026-05-22–23
(`cbb8f5c6`, `a09ef885`); Stripe went live 2026-06-02 (`d8b90115`).

### 25 — A placeholder Google Ads tag broke GA4 sitewide for about four hours · `THREW`

`a4c64bc8` (2026-06-09, 10:37 EDT) installed Facebook Pixel and Google Ads
conversion tracking together. The Google Ads tag shipped with the literal
placeholder `AW-GOOGLE_CONVERSION_ID` — not a real ID — which is not a valid
tag and broke `gtag()` initialization across all 7 public pages that carry
it. GA4 itself failed to load: `window.gtag = undefined`.

Fixed the same day, `921a39b3` (2026-06-09, 14:48 EDT) — a 4-hour-11-minute
gap. The fix removed the Google Ads tag from all 7 pages rather than
supplying a real ID, deferring Google Ads conversion tracking "per the plan
(payment UI is unstable)." Facebook Pixel, installed in the same commit, was
unaffected — it does not depend on the Google Ads tag.

**Cost:** GA4 analytics — the only telemetry the business had at the time,
eight days after go-live — was dark sitewide for roughly four hours during
active business hours. Whatever real traffic arrived in that window is
unmeasured and unrecoverable.

**Anchor:** commits `a4c64bc8` and `921a39b3`, both 2026-06-09,
`Co-Authored-By: Claude Opus 4.8`.

### 26 — A fatal syntax error shipped with the city pages, same day as the page itself · `THREW`

`f1fca4f8` (2026-06-22) added `public/city.html`. Two FAQ entries used
single-quoted JavaScript strings containing an unescaped apostrophe ("What's
the age range…", "What's the vibe…") — a fatal `SyntaxError` that broke the
entire module script on both `/philadelphia` and `/lancaster`. No events
loaded, no meta tags, FAQ, or schema rendered; the page fell back to static,
hardcoded "Philadelphia" copy regardless of which city it was.

A second, independent defect in the same file: the schema.org markup tagged
every event with the *page's* city rather than the event's own, so a city
page in fallback mode (showing events from elsewhere because it has none of
its own) emitted structured data claiming those events were local — false
information handed directly to Google.

Fixed the same day, `b5542eee` (2026-06-22).

**Cost:** near zero. A fatal syntax error in a `<script type="module">` tag
fails immediately and visibly on load; same-day introduction and fix is
consistent with this being caught in ordinary testing rather than by a real
visitor. Recorded because "shipped same day as a new page, broke the whole
page" is a pattern worth having on file even when the catch was fast.

**Anchor:** commits `f1fca4f8` and `b5542eee`, both 2026-06-22,
`Co-Authored-By: Claude Opus 4.8`.

---

## What this is and is not

- **June is the first month with real money live.** Incident 24's cost is the
  most concrete of the three precisely because of that — it is the first
  incident in this whole catalog (by calendar date) with a real, if
  unquantifiable, customer-facing gap.
- **Two same-day catches do not make an automated system.** Neither 25 nor 26
  was caught by a check that runs on every change; both are bugs that happen
  to announce themselves the moment anyone looks. Do not extrapolate June's
  detection mix forward.
- **"Cost" means what was lost or nearly lost.** Where an incident's damage
  cannot be sized after the fact — incident 24's missed enrollments — that is
  stated rather than guessed at.
- **Names, account identifiers and customer records are omitted throughout.**
