# Advertise the 2-for-1 to everyone, and you buy men

**2026-09-10.** Taylor asked for §8.3 of `reports/ADS_OBJECTIVE_GAP_ANALYSIS_2026-09-06.md`
to be reviewed from the data, on one question: *if we advertise the 2-for-1 to
all people, do we get more women?*

**No. On this account's own delivery data, a broad ad set gets fewer women and
adds men, and the 2-for-1 shown to a man produces a man.** Three independent
measurements say so, and none of them depends on the others:

1. **The auction buys men.** Every cold ad set Meta has ever served to both
   genders on this account spent the majority of its money on men. On the sales
   objective the playbook uses, a broad ad set put **36.7%** of its spend on
   women; a women-locked one put 100%. The cost of one woman landing on the site
   was the same either way (**$1.61 vs $1.64**), so a women-locked ad set lands
   **2.7× as many women per dollar** (6.1 vs 2.3 per $10). Broad does not find
   cheaper women. It finds fewer women and spends the rest on men.
2. **The creative does not filter.** The two times 2-for-1 copy reached men
   ($45.61 of $510.41 lifetime 2-for-1 spend), men clicked it at close to
   women's rate: 83% and 96% of women's link-click rate, no detectable
   difference on 2,317 male impressions (p = 0.6 and 0.8). That rules out
   "bring your girl" repelling men; it does not rule out men clicking a fifth
   less. On the Good Good cell the men produced 3 checkouts and the account's
   only Meta-attributed 2-for-1 purchase; the women produced 0. Those two
   counts are anecdotes, not rates.
3. **The +1 mirrors the buyer.** 7 of 7 plus-ones in account history matched the
   buyer's gender (measured against Firestore 2026-09-08, not re-read today —
   see §8). A man who takes the 2-for-1 brings a man.

So "advertise it to all" pushes the room the wrong way twice: fewer women see
it, and the men who act on it arrive in pairs.

The honest limit is in §5: on this account, *copy and targeting are perfectly
entangled* — every 2-for-1 ad ran women-locked, every broad ad ran social-proof
copy — so the account can say who a broad ad set **reaches** (measured, above)
but cannot cleanly separate which creative **converts** women. The reach answer
is the one the question asked. §7 says how much weight each finding bears.

Source for every Meta figure: `node scripts/meta-ads-review.js`, pulled
2026-09-10 22:53 UTC, 49 ads, 44 with delivery, lifetime window. Gender rows
reconciled to totals within 2% on every ad (the script's own check). Grouping
is by **delivered** gender split, not the targeting label, because Meta returns
current targeting, not historical (§8).

## Four numbers

| | |
|---|---|
| **2.7×** | women landing on the site per dollar, women-locked vs broad, cold sales objective |
| **63%** | of a broad cold sales ad set's spend goes to men — all four broad cells landed between 60% and 68% |
| **+46%** | what a woman's impression costs over a man's inside a broad ad set ($32.42 vs $22.26 CPM) — the reason the auction drifts male |
| **7 of 7** | plus-ones that matched the buyer's own gender (Firestore, 09-08) |

## §1 EVIDENCE — what $100 of cold spend buys, by who Meta delivered it to

Cold ad sets only (no custom audience), lifetime, grouped by the gender split
Meta actually delivered. "Women-only" = ≥97% of spend on women.

**Sales objective (OFFSITE_CONVERSIONS / PURCHASE) — the playbook's objective:**

| Delivered to | Ads | Spend | Women's share of spend | LPV women / men | Women's LPV per $10 | $ per woman's LPV | $ per man's LPV | CPM women / men | Checkouts W / M | Purchases W / M |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| Women only | 4 | $135.80 | 100% | 83 / 0 | **6.11** | $1.64 | – | $20.05 / – | 10 / 0 | 0 / 0 |
| Both (broad or expanded) | 4 | $185.40 | 36.7% | 42 / 66 | **2.27** | $1.61 | $1.76 | $32.42 / $22.26 | 8 / 7 | 1 / 1 |
| Men only | 1 | $15.10 | 0% | 0 / 36 | 0 | – | $0.42 | – / $11.80 | 0 / 5 | 0 / 0 |

Per **$100**: a women-locked ad set lands **61 women** on the site. A broad one
lands **23 women and 36 men**.

**Traffic objective (LINK_CLICKS / LANDING_PAGE_VIEWS), same grouping:**

| Delivered to | Ads | Spend | Women's share | LPV W / M | Women's LPV per $10 | $ per woman's LPV | $ per man's LPV |
|---|--:|--:|--:|--:|--:|--:|--:|
| Women only | 10 | $287.49 | 100% | 935 / 0 | **32.5** | $0.31 | – |
| Both | 13 | $372.00 | 62.3% | 571 / 340 | **15.4** | $0.40 | $0.41 |
| Men only | 1 | $10.01 | 0% | 0 / 97 | 0 | – | $0.10 |

The traffic "both" group is contaminated: eight of its thirteen ads are
labelled `women` in current targeting and delivered 57–65% women, which reads
as an ad set that was broad for part of its life and women-locked later (§8).
The sales table has no such ads — its four broad cells are labelled `all`,
`men+women`, or carry the gender-expansion flag — so it is the clean one. The
seven traffic cells whose label is genuinely broad ran 30–62% women, a wider
band than the sales cells' 32–40%.

**All cold, all objectives:** women-only 24.1 women's LPV per $10 (14 ads,
$423.29); both 11.0 (17 ads, $557.40); ratio **2.2×**.

**None of the four broad sales cells found women.** Their women's share of spend
was 34.6%, 37.5%, 40.4% and 31.7%. That is the band a broad cold ad set lands
in on this account, whatever the creative.

## §2 EVIDENCE — the same event, both ways

Four events ran a women-locked cell and a broad cell side by side, same dates,
same objective, comparable budget. This removes city and timing:

| Event, objective, dates | Women-locked cell (2-for-1 copy) | Broad cell (social-proof copy) |
|---|---|---|
| **Tellus**, sales, 08-13→08-26 | $60.74 → **27** women's LPV, 1 women's checkout, 0 purchases | $60.64 → **17** women's + 28 men's LPV, 5 women's + 2 men's checkouts, 1 women's purchase (37.5% of spend on women) |
| **Marion Court**, sales, 08-17→09-08 | $17.35 → **8** women's LPV, 1 checkout | $18.23 → **0** women's + 4 men's LPV, 0 checkouts (31.7%) |
| **Marion Court**, traffic, 08-22→09-08 | $81.19 → **246** women's LPV (30.3 per $10) | $15.13 → **16** women's + 18 men's LPV (10.6 per $10) (42.6%) |
| **Good Good**, sales, 08-13→08-31 | $61.76 → 14 women's + 22 men's LPV, 0 women's / 3 men's checkouts, 1 men's purchase — *this cell was women-targeted with gender expansion ON, so it delivered broad* | $44.77 → 11 women's + 12 men's LPV, 3 women's + 2 men's checkouts (40.4%) |

On reach, the locked cell wins every pair. On the one pair with enough
down-funnel events to read, **Tellus**, the broad social-proof cell produced
more women's checkouts (5 vs 1) from fewer women's visits (17 vs 27). That is
the `social-proof-pulls-women` signal already in memory, and it is a
**creative** effect, not evidence that broad targeting finds women — the same
cell still spent 62.5% of its money on men.

## §3 EVIDENCE — the 2-for-1 creative does not keep men out

Every 2-for-1 ad on the account (16 ads, $510.41) ran in a women-targeted ad
set. Men saw it twice anyway, for $45.61:

| Cell | Gender | Spend | Impr | CTR (all clicks) | Link-click rate | LPV | $/LPV | Checkouts | Purchases |
|---|---|--:|--:|--:|--:|--:|--:|--:|--:|
| Good Good "Sales Obj Women" — *"Bring your girl — 2-for-1"*, expansion on | men | $39.60 | 1,566 | 3.13% | 1.66% | 22 | $1.80 | **3** | **1** |
| | women | $20.96 | 603 | 3.65% | 1.99% | 14 | $1.50 | 0 | 0 |
| Landing Page Event 3 Women — *"You + a friend … 2-for-1 this week only"* | men | $6.01 | 751 | 8.39% | 7.06% | 48 | $0.13 | 0 | 0 |
| | women | $19.20 | 1,654 | 7.86% | 7.32% | 115 | $0.17 | 5 | 0 |

On link clicks, men ran at 83% of women's rate on the Good Good cell (p = 0.6)
and 96% on the Event 3 cell (p = 0.8). On 2,317 male impressions that is
enough to rule out the creative repelling men, and not enough to rule out men
clicking 20–30% less. Do not pool the two cells: Good Good is low-rate and
mostly men, Event 3 high-rate and mostly women, so a pooled rate reads as a
gender gap that neither cell shows.

Men click a "bring your girl" ad at close to women's rate, and on the Good Good
cell they were the only ones who got to checkout (3 to 0, an anecdote at that
size). The Good Good room finished 16 men to 4 ticketed women, and both of its
2-for-1 seats were men (`good-good-was-19-to-1`). The one Meta-attributed
2-for-1 purchase in account history is a man's.

## §4 MECHANISM — why it comes out this way

**The auction.** Inside a broad ad set a woman's impression costs 46% more than
a man's ($32.42 vs $22.26 CPM, cold sales; $9.05 vs $7.54 on traffic).
Optimising for the cheapest outcome, Meta spends where impressions are cheap.
Every broad cold sales cell on this account landed at 60–68% men. Gender
restriction does not make a woman cheaper — cost per woman's LPV is $1.64
locked vs $1.61 broad — it stops the money leaking to the cheaper half.

**The audience ceiling is not binding.** A women-only ad set halves the
reachable pool (985k–1.2M broad vs 493k–580k women, `delivery_estimate`,
09-08). The largest women-only cell the account has run reached 5,411 people
at frequency 1.86. Nothing here is close to exhausting half a million.

**The offer duplicates whoever takes it.** Firestore, 2026-09-08 (§8 — quoted,
not re-read today): 7 of 7 plus-ones matched the buyer's gender; women took the
offer 5 of 9 times, men 2 of 13 (Fisher p = 0.074, n = 22); paid tickets run
75 men to 26 women. An ad set that puts the 2-for-1 in front of 60% men is
asking for male pairs from the larger, more skewed half of the room.

**Retargeting is different, and §8.3 is right there.** The account's mixed
retargeting pools ran 56.6% women's share with 18 women's checkouts to 5 men's,
because the pools were fed by women-targeted prospecting and women click
retargeting harder (Tellus: 10.2% vs 5.7% CTR). The worst retargeting result
ever was a women-locked pool reaching 407 people 11.67 times each
(`MC Retargeting`, $103.14, 0 sales). Keep retargeting broad.

## §5 EVIDENCE — where §8.3's four points stand

| §8.3 point | Status on 09-10 |
|---|---|
| 1. Women-targeted budget share correlates inversely with women's ticket share (ρ = −0.657, p = 0.088, n = 6) | Unchanged and still confounded: the heaviest-targeted event (Good Good, 86.6%) is also the only Philadelphia event and the one whose "women" cells delivered 64% men through gender expansion. n = 6 cannot separate those. |
| 2. Men's LPV→purchase rate matches women's, so targeting buys no advantage | Answers a different question. Conversion *rate* per visit is similar; the *number* of women who visit per dollar is 2.7× higher locked (§1). The rate is beside the point when the share is the lever. |
| 3. The untargeted organic channel is 35.7% women | About a channel, not an ad set. A broad Meta ad set delivered 32–40% women on every sales cell (§1). |
| 4. Gender-restricted ad sets cannot spend their budget | Refuted 09-08 (`MC Retargeting`, women-only, 101% of budget) and again today: `Marion Court \| female \| close 2for1` spent $41.74 in its last four days against $14/day. Retire it. |
| The substitute: "the lever is what the ad shows, not who it's aimed at" | Half right. What the ad shows moves women's *checkouts* (Tellus pair, §2). Who it is aimed at decides whether women *see it at all* (§1). Both levers exist; the creative does not replace the ad set. |

**And the rule as written cannot be followed.** `brand.json`
`caption_rules.banned_outside_female_ad_set` forbids the 2-for-1 line outside a
female ad set, and `_no_gender_axis` says that ad set "no longer exists". On
the live account it exists (`Loxleys | female | Sales`, `Marion Court | Female
| Sales`), and it is where every dollar of 2-for-1 spend has ever gone. §8.3
and the copy rule are in tension because §8.3 has no cell for the one creative
the account cannot show to men without buying men.

## §6 DECISION — three ways to resolve it, and which the data supports

**A. Carve it out (what the data supports).** Rewrite §8.3 as:

- *Retargeting:* never gender-restricted. Unchanged, and better-grounded than
  before (§4).
- *Cold:* one broad ad set per event running the social-proof creative — for
  volume, knowing it will spend ~63% on men — **plus one women-locked cold ad
  set, gender expansion off (`targeting_automation.individual_setting.gender`
  = 0), that is the only place the 2-for-1 creative runs.** That is the sole
  gender-restricted ad set the playbook permits, and it exists because the
  offer mirrors whoever sees it.
- Retire points 2 and 4. Keep the correlation in point 1 as a caveat, not a
  basis.
- Fix `brand.json` `_no_gender_axis` so it stops describing the female ad set
  as gone, and add a `gender: women` axis to the 2-for-1 creative's `runs_in`.
- Detection, one assertion in `scripts/meta-ads-review.js`: any delivered ad
  whose copy matches `banned_outside_female_ad_set` with women's share of spend
  below 97%, or any live ad set with `individual_setting.gender = 1`, fails
  loudly. A written rule did not catch the $63.73 Good Good leak; a check would
  have.

**B. Test it, if a measured answer is worth one event's budget.** One event, two
cold sales ad sets, identical 2-for-1 creative and budget, same dates: one
women-locked with expansion off, one broad. Unique `utm_content` per ad. Read
the result in **Firestore** (`gender`, `isPlusOne`, `attribution.utm_content`),
never in Meta's attributed conversions. Kill rule for the broad cell: pause it
once women's share of spend is below 40% after $30, which is where all four
broad cells landed. The account's history predicts the broad cell spends about
63% on men and that any man who takes the offer brings a man; the test would
settle whether the creative changes that. Cost of the information: roughly one
Seed-phase budget.

**C. Leave §8.3 as written.** Then the 2-for-1 cannot be advertised at all,
which is the tension Taylor named on 09-08 and the state the live account is
already ignoring. Not recommended.

**Nothing was changed.** §8 was not edited, `brand.json` was not edited, no
live ad set, budget or creative was touched. This report is the review; the
rewrite is one PR once Taylor picks A or B.

## §7 EVIDENCE WEIGHT — how much each finding bears

Asked 09-10: *how thorough is this, and do we need a large dataset?* Computed
over the same pull.

| Finding | Rests on | How solid | What more data would change |
|---|---|---|---|
| A broad ad set spends ~63% on men | Women's CPM is above men's in **21 of 22** ads where both genders were served (sign test p ≈ 1 × 10⁻⁵; median ratio 1.30). Four broad sales cells, 7,309 impressions, women got 22–32% of impressions in every cell | **Direction: the strongest thing here.** Magnitude: 4 cells from 3 campaigns | Two or three more broad cells pin the share within ~5 points. 55–70% men is the plausible band |
| 2.7× women per dollar | Arithmetic on that share, given equal cost per woman ($1.64 vs $1.61) | "Equal cost" is a coincidence of two 4-ad averages. Per cell: $0.61–$2.25 locked, $1.34–$1.64 mixed | Anywhere from 2× to 4× with more cells. Not near 1× unless the CPM finding reverses |
| Men click the 2-for-1 at close to women's rate | Two cells, 2,317 male impressions. Within each cell men ran at 83% and 96% of women's link-click rate, p = 0.6 and 0.8 | Rules out men being repelled. Cannot rule out men clicking 20–30% less. The 3-to-0 checkouts and the one purchase are anecdotes | Both cells are Philadelphia; a Lancaster cell would help more than a bigger Philadelphia one |
| The +1 mirrors the buyer, 7 of 7 | 7 pairs, Firestore 09-08 | Rules out a coin flip (p = 0.008). Exact 95% lower bound on the mirror rate is **59%**. The prior — close friends are mostly same-gender — does most of the work | 14 of 14 lifts the bound to 80%. Every event adds pairs for free |

**Precision is not the problem; cell count is.** Each broad cell has thousands
of impressions, so its own gender share is known within a point. What is small
is the number of cells and the number of events they come from, which is what
leaves the finding open to "Philadelphia was different". The same-event pairs
in §2 carry more weight than the pooled table for that reason.

**No amount of observational data answers the conversion question.** The
account has never run the 2-for-1 creative in a broad ad set and will not by
accident, so passive data can only ever compare "locked with 2-for-1 copy"
against "broad with social-proof copy". Only the designed test in §6 option B
separates those, and it does so in one event for roughly $100–$200 on the broad
cell. The purchase half is worse: 26 paid women's tickets in the account's
history and 6 Meta-attributed purchases ever. No purchase-level comparison
reaches significance at this volume for a long time, which is why this report
argues from reach and mechanism rather than sales.

**In practice:** bullet 1 is safe to act on today; bullet 3 is safe to act on
because prior and data agree; bullet 2 is a "the creative is not a filter"
claim and should not be leaned on harder than that.

## §8 NOT VERIFIED — what I did not check

- **Firestore was not re-read today.** The production credential pull
  (`vercel env pull --environment=production`) was blocked by this session's
  permission classifier. The 7/7 mirror, the 5-of-9 vs 2-of-13 takeup and the
  75:26 paid split are quoted from
  `reports/GENDER_AND_THE_2_FOR_1_2026-09-08.md` (PR #484, closed) and were
  measured then, not now. Re-run: `node scripts/audit-event-gender-mix.js --list`
  after pulling the env into the main checkout.
- **Copy and targeting cannot be separated on this account.** There is no broad
  2-for-1 cell and no women-locked social-proof cell. The reach finding (§1)
  is a delivery effect that shows up identically on the broad social-proof ads,
  so it does not depend on copy. The checkout finding (§2, Tellus) could be
  creative, targeting, or the pool the cell happened to hit.
- **City.** The four women-locked sales cells are all Lancaster; two of the four
  broad sales cells are Philadelphia. The same-event pairs in §2 are the
  control for this, and they agree with the pooled numbers.
- **Targeting is current state.** Twelve delivered ads carry a `women` label
  and delivered 35–91% women (T6 in the working notes). Grouping was done on
  delivered split, so the tables are right about what happened but cannot say
  what the ad set was *set to* at the time.
- **Purchases.** Meta has attributed 6 purchases in the account's life. Nothing
  here is a purchase-level claim; the LPV and checkout counts carry the
  argument.
- **The 2% reconciliation** between gender rows and totals held today on every
  ad. The 09-02 case where it did not (a 105% women's share) closed within a
  day; a clean run is not proof it stays clean.
- **Eventbrite's own 2-for-1 tier** is outside all of this.
- The working tables (T1–T6) and the §7 statistics are the output of two
  throwaway scripts over the review JSON, kept in the session scratchpad, not
  the repo. The review script itself regenerates the underlying data in one
  command.
