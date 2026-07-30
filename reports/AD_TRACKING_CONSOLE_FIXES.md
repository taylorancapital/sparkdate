# Ad Platform Console Fixes — Google Ads Ghost Conversion + UTM Fragmentation

This is not a code issue. Five consecutive nightly GA4 reports (`reports/GA4_ANALYSIS_2026-07-24.md`
through `reports/GA4_ANALYSIS_2026-07-30.md`) have flagged the same two problems, and each
report's own grep of `public/`, `api/`, and `lib/` came back clean — nothing in the codebase
produces either issue. Both live entirely in the Google Ads / Meta / TikTok campaign consoles.
This doc translates the numbers into "here's what to click and check" for whoever manages
those accounts. No code changes are proposed or needed.

The two items below are the ones raised in the 07-30 report's headline finding. Two other
GA4 issues have also come up repeatedly in these reports — the GA4 Funnel Exploration
showing 0 purchases against real sales, and whether the Facebook in-app-browser checkout
warning needs to become a hard block — but those are separate questions and are
intentionally **not** covered here.

---

## 1. Google Ads ghost conversion — `ads_conversion_About_Us_1`

**The number:** In the 07-30 report's window, `ads_conversion_About_Us_1` (a Google-Ads-imported
conversion action that fires on an About-Us pageview) accounted for **96 of 149 sitewide GA4
key events (64.4%)**. Of those 96, **91 (~95%) trace specifically to Google Ads traffic**
(`googleads/paid` 50, `googleads/(not set)` 16, `googleads/offline` 14, `googleads/cpc` 11) —
not Facebook or any other channel. Every one of those four rows shows real key-event counts
at **$0 revenue**.

**Why it matters:** If this conversion action is set as a *primary* conversion in Google Ads,
the campaign's automated bidding is optimizing toward people who merely viewed the About page —
not people who bought a ticket. That would explain paid Google traffic that looks like it's
"converting" in the dashboard while producing no actual revenue.

**What to check, in order:**
1. Google Ads → Tools & Settings → **Conversions**.
2. Find the About-Us conversion action (likely named something with `About_Us_1` or similar).
3. Is it set to **Primary** (used for bid optimization) or **Secondary** (observation only)?
4. What's its value setting — is every occurrence counted as a $0-value conversion, inflating
   the conversion *count* even though the dollar total stays at zero?
5. Is the **Purchase** conversion action — which already carries real revenue, per the
   Revenue by Source numbers in every GA4 report — set as Primary? If both actions are
   Primary at once, bidding may be diluted between a real signal and a fake one.

**Likely fix (confirm before changing):** demote the About-Us action to Secondary so it stops
influencing bidding, and confirm Purchase is the one Primary conversion action driving
optimization. This is a recommendation to verify against the live account, not a
prescription — only whoever has access to the Google Ads dashboard can see the actual
current configuration.

**Re-check in ~1 week:** does the About-Us action's share of key events drop in the next GA4
pull, and does Purchase's share of key events rise correspondingly.

---

## 2. UTM fragmentation — 43 source/medium rows for ~3 real channels

**The numbers (from `reports/GA4_ANALYSIS_2026-07-30.md`, quoted exactly):**

- **Facebook/Meta — split 11 ways**, all the same underlying paid channel:
  `facebook / paid_social` (387), `Facebook / paid_social` (193 — pure capitalization
  variant of the row before it), `Facebook / paid` (22), plus organic variants
  `facebook / social` (38), `m.facebook.com / referral` (23), `facebook.com / referral` (18),
  `Facebook / organic` (2), `eventsmanager.facebook.com / referral` (1).
- **Google Ads — split 7 ways:** `googleads / paid` (55), `googleads / (not set)` (15),
  `googleads / offline` (14), `googleads / cpc` (11), `Google Ads / cpc` (15),
  `google / cpc` (9), `Google / (not set)` (1).
- **TikTok — split 3 ways:** `tiktok / paid_social` (27), `TikTok / social` (1),
  `tiktok.com / referral` (1).

**Confirmed not a codebase issue:** every nightly report's grep of `public/`, `api/`, and
`lib/` for `paid_social` returns zero matches. The site's one centralized UTM builder
(`lib/utm.js`) only ever receives plain string literals with no capitalization logic
applied anywhere. This fragmentation is generated entirely by how each ad platform's own
campaign and ad-set settings tag their outbound links.

**What to check per platform:**
- **Meta Ads Manager** — for each active ad set, check the URL parameters / tracking
  template. Standardize on one lowercase scheme (e.g. `utm_source=facebook&utm_medium=paid_social`)
  across every ad set; some are still tagging with a capitalized `Facebook`.
- **Google Ads** — check whether some campaigns rely on auto-tagging (which produces
  `google / cpc` via `gclid`) while others use a manual tracking template on the ad
  (which produces the various `googleads / *` rows). Pick one method and apply it
  consistently across every active campaign.
- **TikTok Ads Manager** — same check: standardize the URL tracking template across
  every ad group so it doesn't fragment between `tiktok / paid_social` and the
  referral-looking variants.

**The fix:** one canonical, lowercase `utm_source` / `utm_medium` pair per platform, applied
uniformly across every currently-active campaign or ad set — and set as the standing
template for any new campaign going forward, not just a one-time cleanup of what's live now.

**Re-check in ~1 week:** the Campaign Performance report's source/medium row count should
drop from ~43 toward roughly 4-6 for these three platforms once the templates are
standardized.

---

## Not covered here

Two related GA4 questions have come up in the same reports and are tracked separately —
raising them here only so nothing looks silently dropped:

- **GA4 Funnel Exploration showing 0 purchases** against the real transaction count (16 in
  the 07-30 window) — a GA4 Explore-configuration issue (funnel steps, date range/segment
  scoping), not covered by this doc.
- **Facebook in-app-browser checkout** — the site already has a warning-based mitigation
  (`public/lp.html`, `public/event.html`) for the known Stripe 3DS-in-webview failure, but
  `in_app_browser_detected` is trending up (17.1% → 20.5%) while Facebook paid traffic
  still converts near $0. Whether that mitigation needs to become a hard redirect instead
  of a dismissible warning is a product/code decision, not an ad-console setting.
