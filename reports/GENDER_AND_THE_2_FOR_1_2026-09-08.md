# The 2-for-1 never needed a women-only ad set — it self-selects at checkout

**2026-09-08.** `reports/LOXLEYS_RETARGETING_LAUNCH_2026-09-08.md` §6 left §8.3 and
the 2-for-1 rule deliberately unresolved, on the grounds that they contradict
each other: §8.3 bans gender-restricted ad sets, and
`brand.json.caption_rules.banned_outside_female_ad_set` forbids the 2-for-1 line
"outside an ad set that no longer exists."

They do contradict each other. But the contradiction dissolves once you measure
where the 2-for-1 actually does its work, and the answer is not where either
rule assumed. **It is not an acquisition lever you point at women. It is a
conversion-stage multiplier that mirrors whoever already bought** — and it is
already offered to every buyer at checkout, where it self-selects toward women
about 3.6 to 1 without any targeting at all.

So the honest answer to "should the 2-for-1 only go to that audience" is:
**it effectively already does, and the gating is not what makes it work.**

## Four numbers to hold in your head

| | |
|---|---|
| **7/7** | plus-ones that matched the buyer's own gender — five women brought women, two men brought men. Verified against Firestore, not inherited |
| **3.6×** | women's 2-for-1 takeup over men's when offered identically to both (55.6% vs 15.4%, n=22, Fisher p=0.074) |
| **~50%** | of reachable audience removed by a gender-restricted ad set — priced live today. The `Single` filter removed 78%. These are not the same kind of filter |
| **101%** | of its budget spent in 7 days by a women-only ad set — the measured counterexample to §8.3's load-bearing claim that gender-restricted ad sets cannot deliver |

---

## §1 EVIDENCE — §8.3 is written down and the account does not follow it

Read live this morning. Of eleven ACTIVE ad sets, **exactly one is broad** — the
Loxleys retargeting ad set built yesterday. Every other live ad set carries a
`genders` restriction:

| ad set | genders | status |
|---|---|---|
| `Marion Court \| Female \| Sales` | `[2]` | ACTIVE |
| `Loxleys \| male \| Sales` | `[1]` | ACTIVE |
| `Loxleys \| female \| Sales` | `[2]` | ACTIVE |
| `Loxleys \| male \| Traffic` | `[1]` | ACTIVE |
| `Loxleys \| female \| Traffic` | `[2]` | ACTIVE |
| `Marion Court \| Female \| Traffic` | `[2]` | ACTIVE |
| `MC Retargeting` | `[2]` | ACTIVE |
| `LX Retargeting` (built 09-08) | `[1,2]` | ACTIVE |

§8.3's own "immediate action" paragraph called for rebuilding Loxleys' two
gender-split ad sets into one broad ad set. That was six days ago and has not
happened. **This review is therefore not about whether to change a rule that is
running — it is about what to build, because the rule was never built.**

Lifetime, the imbalance is the whole basis of the negative correlation §8.3
rests on: **$822.83 spent through women-restricted ad sets against $132.33
through unrestricted ones — 6.2 to 1.** The account has barely tried broad.

## §2 EVIDENCE — what a gender restriction actually costs, priced not argued

Same method §2 of the launch report used on `relationship_statuses`: Meta's own
`delivery_estimate`, holding geo (Lancaster / Harrisburg / York, 20mi), age
(22–45) and optimization goal constant, varying only the gender key. Identical
results under `OFFSITE_CONVERSIONS` and `LINK_CLICKS`:

| targeting | monthly reachable |
|---|---:|
| broad — no `genders` key | **985,200 – 1,200,000** |
| `genders: [1,2]` (as the new retargeting ad set was built) | 971,300 – 1,100,000 |
| women only, `genders: [2]` | **493,200 – 580,300** |
| men only, `genders: [1]` | 476,000 – 560,000 |

**A gender restriction costs about half the market. The `Single` filter cost
78%.** That difference is the reason §6 was right to refuse a blanket "no
demographic filter beyond age and geography" rule: gender is a real, roughly
even demographic split, and `relationship_statuses` is a behavioural artifact
that selects for *the act of declaring a status*. Banning them in one sentence
would have conflated a 50% cut that buys something with a 78% cut that buys
nothing.

**A small finding in passing:** `genders: [1,2]` is not identical to omitting
the key — it excludes Meta's "unknown" bucket, worth 1.4% of estimated reach and
**0.3% of lifetime delivered spend ($4.36 of $1,326.61)**. Negligible in
practice, but `scripts/build-paid-campaign.js` asserts `genders === undefined`
on read-back, and yesterday's retargeting ad set was built with `[1,2]`. Those
two disagree. Worth reconciling on the next build; not worth an edit to a live
ad set.

## §3 EVIDENCE — gender targeting holds; the "women-only ad sets served men" story is a different bug

Delivered gender, trailing 7 days, every currently-active gender-restricted ad
set:

| ad set | targeted | delivered |
|---|---|---|
| `Marion Court \| Female \| Traffic` | `[2]` | **100.0%** female |
| `Marion Court \| Female \| Sales` | `[2]` | **100.0%** female |
| `Loxleys \| female \| Traffic` | `[2]` | **100.0%** female |
| `Loxleys \| female \| Sales` | `[2]` | **100.0%** female |
| `Loxleys \| male \| Traffic` | `[1]` | **100.0%** male |
| `Loxleys \| male \| Sales` | `[1]` | **100.0%** male |
| `MC Retargeting` | `[2]` | 96.7% female |

**Gender targeting works exactly as asked.** The recorded belief that women-only
ad sets bleed to men is true of **exactly one ad set in account history**, and
the cause is not gender targeting:

`Campaign 1 Event 4 Good Good Campaign-Retargeting` carries
`targeting_automation.individual_setting = {"age": 1, "gender": 1}` — gender
expansion switched **on**, underneath `genders: [2]`. It delivered **$63.73 of
$100.38 to men**, against a women-only targeting spec. That is consistent with
the ~$58 already recorded in memory (`gender-expansion-serves-men`) and it is a
*flag* bug, not a targeting one. Two other ad sets carry the same flag
(`Tellus -All Genders`, `Tellus Retargeting`) where it is moot because they are
already broad.

**This matters for the rule.** "Don't use gender targeting because it serves men
anyway" is not an argument this account's data supports. The argument has to be
made on cost and on what the restriction buys — not on leakage.

## §4 EVIDENCE — §8.3's load-bearing point is refuted by its own account

§8.3 named point 4 — the delivery-mechanics failure — as "the load-bearing
evidence," measured on 2026-09-06 as `Female | Sales` spending 4% of its budget.
Re-measured today, trailing 7 days:

| ad set | targeted | 7d spend | budget/day | % used |
|---|---|--:|--:|--:|
| `MC Retargeting` | `[2]` warm | $42.35 | $6.00 | **101%** |
| `Marion Court \| Female \| Sales` | `[2]` cold | $32.84 | $14.00 | 34% |
| `Loxleys \| female \| Sales` | `[2]` cold | $3.93 | $5.11 (shared) | 11% |
| `Loxleys \| male \| Sales` | `[1]` cold | $2.87 | $5.11 (shared) | 8% |

**A women-only, `PURCHASE`-optimized ad set spent 101% of its budget.** That is
a direct counterexample to "a gender-restricted ad set can't find enough
qualifying impressions to spend the budget assigned to it." The 4% figure from
09-06 has become 34% on the same campaign.

The two genuinely starved cells are Loxleys' cold pair — and they share **one
$5.11/day CBO between them, about $2.55 each, sitting on Meta's $2.00/day
floor**, optimizing for `PURCHASE` against a barely-populated pixel. The
plausible driver there is budget and optimization goal, not the gender checkbox;
a broad cold `PURCHASE` cell at $5.11/day would face the same floor. **That is
not proven** — the account has no broad cold `PURCHASE` cell running at
comparable budget to compare against.

**Point 4 should be retired from §8.3, or narrowed to "cold PURCHASE cells at
the budget floor."** As a general claim about gender restriction it is no longer
true of this account.

## §5 MECHANISM — the reason to keep gender out of retargeting is much better than the reason §8.3 gave

The single worst retargeting outcome this account has ever produced was a
**women-only** ad set:

> `MC Retargeting`, `genders: [2]` — **407 unique people reached, frequency
> 11.67, $103.14 spent, 0 purchases.**

That is the campaign the whole Loxleys retargeting launch was built to avoid,
and it was gender-restricted. A warm pool is small by construction; halving it
by gender is how you reach 407 people eleven times each instead of 800 people
six times each. Yesterday's `LX Retargeting` was correctly built broad.

**This is a far stronger argument against gender-splitting retargeting than
anything in §8.3**, and it is specific to the retargeting leg. It says nothing
about cold prospecting, where the pool is a million people and halving it is
survivable.

## §6 EVIDENCE — where the 2-for-1 actually does its work

This is the part that dissolves the contradiction. Pulled from Firestore
(tickets are truth; Meta's attributed conversions are not sales).

**The plus-one mirrors the buyer. Every time.**

| buyer | +1 | event |
|---|---|---|
| woman | woman | SparkDate: Real People, Real… |
| woman | woman | Sparkdate: The Loxley's Soci… |
| woman | woman | Tellus AfterDark |
| woman | woman | Tellus AfterDark |
| woman | woman | SparkDate: Round 2 |
| man | man | Good Good Night |
| man | man | Good Good Night |

**7 of 7 matched.** Five women brought women; two men brought men. This
confirms — independently, against the database rather than a code comment — the
claim in `scripts/meta-create-lx-sales-campaign.js` that the 2-for-1 is "the
only thing in the dataset that has put women in a room efficiently."

**And when it is offered identically to everyone, women take it 3.6× more
often.** The checkbox went live on our own checkout on 2026-07-24 (#112); a
hard gender gate existed for roughly one day (#388, 09-01) before being reversed
(#419, 09-02). Excluding that day, over every buyer who has actually seen the
checkbox:

| buyer gender | buyers | used the 2-for-1 | takeup |
|---|--:|--:|--:|
| women | 9 | 5 | **55.6%** |
| men | 13 | 2 | **15.4%** |

**Fisher's exact, two-tailed: p = 0.074, n = 22.** Suggestive, not significant —
and worth naming plainly that this is *the same evidentiary weight* as the
gender-paradox correlation (rho = −0.657, p = 0.088, n = 6) that §8.3 is built
on. Neither is proof. They should not be held to different standards.

**The effect on the room, in that same window:**

| | women | men | women's share |
|---|--:|--:|--:|
| buyers only | 9 | 13 | 40.9% |
| including plus-ones | 14 | 15 | **48.3%** |

**Offered to everyone, with no gender targeting anywhere, the 2-for-1 moved the
room 7.4 points toward parity.** It did that because women take it three and a
half times more often and because it duplicates whoever takes it — not because
anybody was excluded from seeing it.

## §7 DECISION — the rule I would write, and why the two rules were never really in tension

They looked contradictory because
`brand.json.caption_rules.banned_outside_female_ad_set` names an **ad set** as
the delivery vehicle for what the data says is a **checkout** mechanic. Fix that
category error and both rules survive intact.

**Proposed replacement for §8.3, in three parts.**

**1. Targeting — keep zero gender-restricted ad sets, on better reasons.**
Retire points 2 and 4 as written; they no longer hold. Replace with:

- Gender restriction costs ~50% of reachable audience, measured
  (`delivery_estimate`, 2026-09-08), for no conversion advantage this account
  can demonstrate.
- On a **warm/retargeting** pool it is actively destructive: `MC Retargeting`
  reached 407 people at frequency 11.67 for $103.14 and zero sales. Never split
  a retargeting audience by gender.
- The account has spent **6.2 : 1** in favour of women-restricted ad sets. The
  negative correlation is a description of that imbalance; the untested
  condition is broad, not more targeting.
- Write `genders` out entirely rather than `[1,2]`, so the ad set matches what
  `build-paid-campaign.js` asserts on read-back.

**2. The 2-for-1 — re-scope from "female ad set only" to "not in cold paid
copy."** A rule about funnel stage, not about ad set gender:

- It stays **universally available at checkout and never gated by gender in
  code** — unchanged, and the legal reasoning behind that (Taylor, 2026-09-02)
  is untouched by anything here.
- Its copy is **fine in retargeting and owned channels** (email, organic,
  Eventbrite listing). Those reach people who have already shown intent, which
  is the exact population where the 3.6× takeup was measured, and the measured
  room effect of showing it broadly is *positive*.
- It stays **out of cold prospecting copy** — `[judgment]`, not measured. A cold
  "bring a friend" pitch sells the event as a thing you attend in pairs, and
  paid tickets already run **75 men to 26 women (2.9 : 1)**. The takeup data
  describes people at checkout; it does not tell you what a cold "bring a
  friend" ad would recruit at the top of the funnel. That gap is the reason to
  stay conservative here rather than open it everywhere.

**3. Detection — one assertion, because a written rule did not catch the last
one.** In `scripts/meta-ads-review.js` or the ladder's `--check`, fail loudly
when a live ad set carries any of:

- `targeting.genders`
- `targeting.flexible_spec[].relationship_statuses`
- `targeting_automation.individual_setting.gender === 1`

That third is the one that would have caught the $63.73 Good Good leak, and it
appears in neither playbook. The budget ladder already proves this shape works —
an ACTIVE campaign in neither registry list exits non-zero, so it cannot be
silent.

**What this does not require:** no live ad set needs a targeting edit to adopt
this. The existing gender-split ad sets can be left to expire with their events;
§8.3 already ruled out touching Marion Court mid-Close, and Loxleys' cold pair
is spending $6.80/week between them.

## §8 NOT VERIFIED — what I did not check

- **Whether broad cold `PURCHASE` cells spend better than gender-split ones.**
  §4 argues the Loxleys under-delivery is a budget-floor effect rather than a
  gender effect. The account has never run a broad cold `PURCHASE` ad set at
  comparable budget, so this is unfalsified, not confirmed.
- **What a cold "bring a friend" ad recruits.** The entire case for keeping the
  2-for-1 out of cold copy is inference from the room's existing 2.9:1 skew. No
  ad has ever tested it.
- **Whether the takeup difference is real.** p = 0.074 on n = 22, with 5 and 2
  events in the two cells. One more man taking the offer moves it materially.
- **Historical targeting on older ad sets.** Meta's API returns *current*
  targeting, so the lifetime by-targeting-class buckets are contaminated for any
  ad set edited since it ran. `/activities` shows no targeting events on the
  pre-September ad sets, but absence there is not proof. **The trailing-7-day
  hold figures in §3 are the reliable ones**; the lifetime splits are indicative.
- **When gender expansion was switched on for Good Good Retargeting.**
  `/activities` returns no targeting events for it at all, so the flag cannot be
  dated and the $63.73 cannot be cleanly attributed to a period.
- **Whether any of this sells a ticket.** Six Meta-attributed purchases exist in
  the account's entire history. Nothing here is causally provable, and the
  correlation §8.3 rests on is not either.
- **Eventbrite's own 2-for-1 tier.** Takeup was measured on our own checkout
  only (37 buyers). The Eventbrite path has its own ticket types and is not in
  these numbers.
- **I made no changes.** No file in the §8 chain was edited, no brand.json rule
  was touched, and no live ad set or budget was modified by this work.
