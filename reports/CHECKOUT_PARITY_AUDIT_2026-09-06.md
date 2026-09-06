# Finishing the three-checkout parity audit — 2026-09-06

> **Designed version:** https://claude.ai/code/artifact/52bd4bb1-8cd4-447f-aa6f-68671d45afc6
> Local path to this file:
> `C:\Users\penns\source\repos\sparkdate\reports\CHECKOUT_PARITY_AUDIT_2026-09-06.md`
> (after this branch merges and the main checkout is pulled)

**What this is.** PR #453 ran a 12-dimension audit across SparkDate's three
hand-copied checkouts, found 196 candidate divergences, adversarially verified
92 of them, and shipped fixes for the first-screen subset before hitting a usage
limit twice. Its own PR body says so: *"the audit ran 12 dimensions and found 196
divergences; 46 were adversarially confirmed before the run hit a usage limit
twice."* This is the rest of that work.

**The one-line finding: a second tap during checkout could charge a guest twice,
on both HTML checkouts, and #453 made it easier to reach.** Everything else in
here is smaller.

---

## EVIDENCE — where the audit actually stood

The prior session's raw output survived in its scratchpad, so nothing was
re-derived from scratch. Its shape:

| | count |
|---|---|
| Dimensions audited | 12 |
| Candidate findings produced | 196 |
| Findings that got a verdict before the limit | 92 |
| Confirmed real | 46 |
| **Findings that never got a verdict** | **104** |

(The resume queue carried the last 100 of those 104. The four outside it sit in
the same range as the verified set and were not separately chased — noted here
rather than rounded away.)

#453 then fixed the first-screen subset of those 46. Which ones, and what
happened to the other 150, was unknown — that is the gap this run closed.

Two passes were run over the current tree, each agent reading the code itself
rather than trusting a quoted line number (every line number in the original
findings had gone stale):

1. **Recheck** — all 46 confirmed findings, re-read against post-#453 `main`.
2. **Verify** — the never-verified findings, each checked and then attacked by
   two independent refuters with distinct lenses (*does the claim read the code
   correctly* / *is this a real divergence or an intended difference*), with a
   finding surviving only if neither refuted it.

### The 46 confirmed findings, re-checked

| | count |
|---|---|
| Fixed by #453 | 27 |
| Still present | 13 |
| Partly addressed | 6 |

So #453 closed 59% of what had been confirmed, and the remaining 19 were still
live on `main` as of this morning — including three rated high.

### The never-verified findings

All 100 in the queue now have a verdict. The run was interrupted by the usage
limit twice more and resumed each time.

| | count |
|---|---|
| Verified | 100 |
| Confirmed — survived both refute lenses | 52 |
| Split — one lens refuted, one did not | 5 |
| Refuted by both lenses | 13 |
| Not real on first read | 30 |

**43 of 100 did not survive.** That is the number to carry forward about bulk
audits generally: a little under half of what this one produced does not hold
up against the code. It is also why the second pass exists — a finding that
reads plausibly and cites line numbers is not yet a finding.

Several of the survivors turned out to be defects in the **reference**
(`events.html`), not in the target. That happened four times, which is worth
noting: "bring the target to the reference" is not always the right direction,
and an audit framed that way will propose the wrong fix.

---

## MECHANISM — the one that matters

### A second tap during checkout could charge a guest twice

Present on **both** `public/event.html` and `public/events.html`. Only
`public/lp.html` was guarded.

The submit handler disables the button and writes "Processing...". Then
`updatePricing()` writes it straight back on — both of its branches end in
`btn.disabled = false` — and `updatePricing()` is reachable *while the request is
in flight*, because the submit handler disables neither the gender buttons nor
the 2-for-1 checkbox.

For a guest, the second submit mints a fresh `paymentMethodId`. The server's
Stripe idempotency key is `(member | card × event)`, so a new payment method
means a new key, no collision, and a **second charge** — plus a second seat out
of inventory.

**This was reproduced in a browser against the shipped `origin/main` file, not
argued from the source.** Tapping the other gender button while the purchase was
in flight:

```
before submit                                Reserve Spot · $27.49   enabled
immediately after submit                     Processing...           disabled
after tapping the other gender mid-flight    Reserve Spot · $27.49   enabled   ← live again
```

Against the fixed tree, the same sequence holds at `Processing...`, disabled,
through a gender tap, a 2-for-1 tick and a second submit — and returns to a live
priced button once the request settles.

**#453 widened this.** Before it, `/event?id=`'s button shipped `disabled`
reading "Select Gender"; now it is live and priced from arrival. And the same
page was the only one of the three that left a live Reserve button standing
*after* a completed purchase, which the re-entrancy guard cannot help with once
the first request has settled. Both are closed here.

### The rest, grouped

**Nothing refused to sell an event that could not be sold.** Four separate
holes, all on the page every `/l/*` short link, every listing, every email and
every share link lands on:

- `status: 'full'` — the flag a host sets by hand to stop advertising an event —
  was honoured by `events.html`, `lp.html`, `api/next-event.js` and
  `lib/next-event.js`, and ignored by `event.html`, which kept a live checkout
  on the one page every listing redirect points at. (The endpoint ignores it
  too, and now deliberately so — see the decision below.)
- A host-flagged-full card on `/events` carried no `data-event-id`, so it was
  inert — and the waitlist lives inside the dialog that click opens. The gate
  tested the manual flag while the card's own badge tests `isSoldOut()` (flag OR
  no seats), so the two sold-out cases rendered identically and behaved
  differently.
- `event.html`'s Firestore catch only logged. Every static placeholder then
  stood as a claim of fact — including a hardcoded date now three months past —
  and nothing hid the form. `eventPricing()` returns 0 for an event that never
  loaded, so the buyer saw a $0.00 ticket and a live **"Reserve Spot · $2.50"**
  button, the service fee alone, while the server recomputes the real price from
  the doc and never reads the quote.
- An event that had already happened stayed fully purchasable. `events.html`
  cannot surface one (its query filters on date), but `/event?id=` had no date
  test at all and neither did the endpoint.

**The buyer was not told what happened.** Only `lp.html` marked its checkout
message as a live region, so a screen reader got no word of a decline or a
confirmation on the other two. And the existing focus-move on error fired only
for `gender_missing` — a declined card, a network drop, an incomplete card and a
capacity refusal all rendered a message above the whole form with the button the
buyer was watching far below it. `event.html` also never said *which* email it
sent the ticket to, and said "your ticket" after a 2-for-1 bought two.

**A signed-in member could be locked out of the form.** `event.html`'s profile
pass early-returned before touching anything, so every lock it set was one-way;
`form.reset()` then blanked the inputs and left `disabled` alone. Signing out
never cleared `userProfile` on **either** page.

**`/lp` was the surface still shouting, and the one telling an untruth.** It
promised "no account needed" while `api/purchase-ticket.js` creates a Firebase
Auth user for every guest buyer and emails them *"We created a SparkDate account
for you"* — the string is in the template. Same claim on `index.html` and
`signup.html`. It also carried a hardcoded `$2.50` service fee that no script
touched, above the fold, while the other two paint every fee figure from their
constant.

**The gender control declared `role="radiogroup"` and did not implement one** on
all three surfaces: two plain tab stops, no arrow keys, no `aria-required`, and
nothing marking the group invalid when it was the error. The checkout dialog
declared `aria-modal="true"` and let Tab walk out into the events grid behind it.

### Three that only fire when something goes wrong

These have no symptom in normal operation, which is why they survived this long.

**One blocked third-party script took the whole page down.** Both HTML checkouts
called `Stripe(pk)` bare at ES-module top level, so a blocked or failed
`js.stripe.com` — an ad blocker, a corporate proxy, a bad network — threw a
`ReferenceError` *there*, before `loadEvent()` ever ran, and killed the module.
Reproduced against the shipped file with the script pointed at a 404:

| | shipped `origin/main` | after |
|---|---|---|
| title | SparkDate Mixer *(placeholder)* | Sparkdate: The Loxley's Social |
| date | **June 12, 2026** *(three months past)* | September 22, 2026 |
| venue | TBA · Center City | Loxley's Restaurant & Patio Bar |
| button | **Reserve Spot — enabled** | Checkout unavailable — disabled |

A page advertising a fictional event on a past date, with a live buy button, at
the URL every listing points at. `lp.html` has guarded this all along.

**The sold-out error nobody could see.** `api/purchase-ticket.js` answers a
sold-out 409 with `{ error: 'Event full' }`. Both HTML checkouts matched
`'full on'` and `'event is full'` — strings the server has never sent — so the
one capacity error that actually fires fell through to *"contact
support@sparkdate.date"* and was logged to GA4 as `category: 'other'`. A buyer
who lost the last seat was told to email support. The early-bird re-quote
(*"the price changed, tap again"*) was swallowed the same way.

**Every referred buyer was written with `referredBy: null`.** Both surfaces
capture `?ref=` into localStorage — `event.html`'s capture block explains why it
exists — and then omitted it from the purchase payload. Only `lp.html` sent it.
The sharpest edge: `/lp`'s own Get Tickets link deliberately carries `ref` into
`/events`, straight into the surface that dropped it.

---

## DECISION — what shipped, and the one judgment call

Thirteen commits. `api/next-event.js`, `api/purchase-ticket.js`,
`public/event.html`, `public/events.html`, `public/lp.html`,
`public/index.html`, `public/signup.html`, plus
`tests/checkout-closed-states.test.js` (new) and `tests/pricing.test.js`.

**1049 tests pass, up from 962.** The new file's assertions were checked against
an `origin/main` extract, not assumed: 16 of its first 20 failed against the
shipped files, and the 4 that passed both ways are the reference-side rules that
already held plus one deliberate regression pin. `tests/lp-checkout.test.js`
existed for exactly this class of regression and its scoping is what let the
drift happen; the new file follows its `CHECKOUTS` pattern so a rule that should
hold everywhere runs everywhere.

**The judgment call, and its answer: `status: 'full'` is a SOFT close.** A
server-side refusal was written — all three clients treat the flag as closed, so
an endpoint that still takes the money looked like a hole — and then **reverted
on Taylor's instruction**:

> *"I'd like it to be soft close, a lot of these venues could utilize more
> people."*

So the flag means *stop advertising this*, not *refuse money*. The clients still
honour it: the event comes off the grid, the checkout swaps for the waitlist,
`/api/next-event` stops promoting it. What the endpoint must not do is block a
sale that still reaches it — a direct link someone already holds, a tab opened
before the flag went on, or a walk-up the host is putting through by hand. Those
are the extra people the room can take, and they were exactly what a hard block
would have turned away.

Capacity is still enforced server-side, so an event genuinely out of seats is
refused on the numbers. That is the real backstop; the flag was never it. A test
now pins the *absence* of the block, so a future parity pass cannot "finish the
job" and quietly re-add it. If a hard close is ever wanted it needs its own flag
(`status: 'closed'`) so the soft one keeps working.

**Fixed on both surfaces, not just the one the audit named,** in three places —
the sign-out lock, the mid-flight re-entrancy, and the arrow-key radiogroup.
Fixing only the page a finding happened to name would have opened a fresh
divergence, which is the failure mode this whole exercise is about.

**One confirmed finding was built, measured, and thrown away.** The audit said
`event.html`'s sticky booking card leaves the Reserve button *"unreachable for
~62% of the page's scroll"* on short laptops. I wrote the fix — cap the height,
scroll internally, mirroring the modal — then measured the shipped file at
1366×768 with the 2-for-1 open before believing it. The button is on screen for
**32%** of the scroll range and first appears at scrollY 1400. The proportion is
about right; *"unreachable"* is not. The card is taller than the viewport, so
sticky never engages and it scrolls with the page like any long form. The fix
would have traded that for a nested scroll container on every laptop, which is
its own hazard. Reverted.

**One correction to my own work, caught by the verify pass.** The `role="alert"`
added earlier in this branch was written into while the node was still
`display:none` — and a live region that is not in the accessibility tree
announces nothing, so revealing it afterwards may never fire. Reveal first, then
write. `lp.html` never had this problem because its message node is never
hidden.

**One deliberate divergence resolved in the direction #453 named.** The modal
hardcoded `phone: ''`; `event.html` forwarded the member's stored number. #453
called `event.html` the correct side. The modal was raised to match — never the
reverse — and a test pins that neither sends a literal blank. Worth one
correction to the original finding's framing: the blank lands on the
**registration doc**, not the member's user profile. That write only happens on
the guest auto-enroll path.

---

## NOT VERIFIED

- **The refute stage did not finish for every confirmed finding.** All 100 have
  a verify verdict, but the usage limit cut the second-stage refuters short on
  the last batch, so some of the 52 "confirmed" carry one lens instead of two.
  The ones acted on in this branch were each re-read by hand against the code
  before any edit; the ones left alone were not.
- **Four findings sit outside the queue.** 196 − 92 verdicts = 104 unverified,
  and the resume queue held 100 of them. The other four were not chased.
- **Five split verdicts were left alone** — one lens refuted, one did not.
  Nothing in this branch rests on them.
- **No purchase was completed end to end.** The worktree dev preview refuses
  POSTs by design, so every runtime check exercised the pre-charge path and the
  error path. The double-charge fix was verified by observing the button state
  through the in-flight window on both the shipped and fixed files; the *charge*
  itself was never made twice, on either version.
- **No sold-out, flagged-full or past event was rendered live** — no such event
  exists in the data right now. Those paths were verified by reading the code
  and, for the date arithmetic, by lifting `isEventPast()` out of the shipped
  HTML and running it against `lib/next-event.js`'s `isEventOver()` across five
  date cases plus degenerate input. The *rendering* of those states was not
  observed in a browser. (The failed-load path **was** observed, via the Stripe
  block above, which kills the module the same way.)
- **The `status: 'full'` flag was not observed in any live event doc.** Nothing
  in the repo writes it, and no current event carries it. Its semantics are now
  settled by Taylor's instruction (soft close) rather than by anything in code —
  worth writing into `CLAUDE.md` if a second flag ever joins it.
- **`inert` browser support was not measured.** The Tab-wrap handler is there as
  the fallback; whether any real visitor hits it is unknown.
- **The refute lenses were adversarial, not exhaustive.** Two per finding, both
  prompted to default to refuted. A finding that survives both is well-supported,
  not proven.
- **Several confirmed low-severity findings were deliberately left.** The
  social-proof band sitting above `/event`'s `<h1>`, the non-refundable and
  safety copy existing only on `event.html`, `lp.html`'s single-line price
  disclosure versus the other two's three-row breakdown, and heading case. These
  are content and layout decisions, not defects — Taylor's call, not mine.
