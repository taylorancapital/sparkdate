# SparkDate GA4 Analysis — 2026-07-24

**Data window:** 2026-06-23 → 2026-07-22 (28 days), GA4 property `sparkdate-philly`.
**Source:** 24 GA4 CSV exports in `Business Plan/files/Night Tasks/`.
**This run made ZERO code changes** — it is a read-and-report pass only. Every item below
is a recommendation for your review, not something that was changed. (Deliberate choice:
the nightly automation is new and you flagged it as risky, so this first real analysis run
proposes and does not touch code.)

---

## The one finding that matters

**Facebook paid social is 59% of your traffic and produces $0 in revenue.**

| Source / medium | Active users | Key events | Revenue |
|---|---|---|---|
| facebook / paid_social | **330** | 5 | **$0.00** |
| (direct) / (none) | 118 | 3 | $54.98 |
| tiktok / paid_social | 27 | 0 | $0.00 |
| eventbrite / listing | 20 | 4 | $109.96 |

Read that against where money actually comes from (Revenue by source/medium):
- **eventbrite / listing — 4 transactions — $109.96**
- **(direct) / (none) — 2 transactions — $54.98**
- Total: **6 purchases, $164.94.**

So the two paid channels you're presumably spending on (Facebook 330 users, TikTok 27
users = 357 people, ~63% of all traffic) generated **zero** purchases between them. All 6
sales came from Eventbrite's own listing (4) and direct/return visitors (2).

### Why — and the code already tells the story
`public/lp.html` (your Facebook ad landing page) contains explicit handling for a known
bug: **Stripe's 3D-Secure checkout physically breaks inside the Instagram/Facebook in-app
browser.** The page already tries to detect this and steer users to an email-capture
fallback (lines ~143-147, 255-271). But Facebook being your #1 source by far with $0
revenue strongly suggests that steer isn't catching enough of them — paid FB clicks open
in the FB webview, hit a checkout that can't complete, and leave. Eventbrite converts
because it's an external listing that opens in the real browser.

This is the highest-leverage thing on the board. It's also **NEEDS TAYLOR INPUT** territory,
because the fixes are strategic, not mechanical (see below).

---

## Funnel & device (supporting context)

- **Session-start → item-selected completion: ~2.4%** (552 session starts → 13 select-item).
  The drop-off is almost entirely at the very first step — people land and leave before
  engaging at all. Consistent with the checkout-breakage theory: they never get far enough
  to matter.
- **Mobile is 78% of users** (439 mobile / 117 desktop / 7 tablet). Anything that fixes the
  mobile-webview checkout problem is fixing it for the large majority of your traffic.
- **Purchases: 6** (key event `purchase`, $164.94). `generate_lead`: 10. The email-capture
  fallback IS catching some people (10 leads) — that pressure valve is working partially.

## Geography (sanity check, not an action)
Philadelphia 110, (not set) 81, Harrisburg 31, Lancaster 24, Reading 16, West Chester 16.
The `(not set)` bucket (81 users, 2nd largest) is worth a glance for bot/proxy traffic on a
future pass, but it isn't actionable from this export alone.

---

## Recommendations — ranked, all for your approval

### NEEDS TAYLOR INPUT (strategic — do not let automation decide these)
1. **Treat the Facebook in-app-browser checkout break as a revenue emergency, not an edge
   case.** Options worth weighing: (a) point Facebook/TikTok paid traffic at the Eventbrite
   listing directly instead of `lp.html`, since Eventbrite is what actually converts; or
   (b) make the "open in your normal browser" steer far more aggressive/earlier on `lp.html`
   for detected in-app browsers. (a) is a marketing-ops change; (b) is a code change. Both
   touch conversion strategy, so they're your call.
   Re-check in ~1 week: Facebook `revenue` in the Revenue-by-source report — currently $0.
2. **Question the paid spend allocation.** 357 paid users produced $0. Before optimizing the
   page, it is worth asking whether that budget is better spent driving to Eventbrite, or
   paused, until the checkout path for paid social is fixed. This is a money decision —
   flagging, not deciding.

### Zero-risk fixes (proposed, NOT applied this run — greenlight and a later run can do them)
3. Confirm every paid-social ad's destination URL. If any point at `/lp` while the FB
   webview checkout is broken, that alone explains the $0. (Verification task, then a
   possible one-line link change.)
4. Add server-visible logging/param to distinguish "checkout started in in-app browser" from
   normal checkout, so the size of this leak is measurable directly next month rather than
   inferred. (Small, additive.)

---

## Method notes / caveats
- GA4 exports carry a `#` metadata header and sometimes stacked tables; parsed accordingly.
- Revenue shows minor cross-report variance ($164.94 in key-events vs $149.94 in
  revenue-by-item) due to different date windows/attribution in each export — treated as
  "~6 purchases, ~$165," not reconciled to the cent.
- 28 days, 563 users, 6 purchases is a **small sample** — directional, not statistically
  tight. The Facebook-$0 signal is strong because of its size (330 users) and the
  corroborating code comment, but treat single-digit purchase counts cautiously.
- No prior-period GA4 export was present to diff week-over-week; drop one next to this
  folder and a future run can trend it.
