# Venue pitch — fact audit, 2026-09-01

The venue outreach package makes two numeric promises to business owners. Both
survive better than a first pass suggested. What does not survive is **one word**
in how the second is stated.

Triggered by drafting Phase 1 outreach to ten Philadelphia venues. Not covered by
`reports/FACT_AUDIT_2026-09-01.md`, which audits public marketing surfaces —
these claims live in outbound sales copy, which nothing audits.

> **Revision note.** An earlier version of this file concluded the F&B claim ran
> 3.1× high. That was built on a first, hedged estimate of ~$15/head. Taylor then
> supplied the Tellus figure — about three drinks, **$18–22 a head plus tip** —
> and the Tier 1 check band was checked against the package itself. The claim is
> considerably more defensible than that draft said. The corrected finding is
> below; the wrong multiple is not preserved, because a wrong number left lying
> around is worse than none.

---

## The two claims

1. *"We bring **25-40** pre-screened, paying young professionals"*
2. *"Most venues we partner with see **~$1,400** in incremental F&B per event"*

## Claim 1 — headcount — HOLDS

| Event | In the room | Source |
|---|---|---|
| Event 1 | 22 | `approved_stat`, CAMPAIGN_FRAME_GAP_ANALYSIS_2026-08-22.md:108 |
| Good Good | ~20 | EVENT_DEBRIEF_GOOD_GOOD_2026-08-31.md ("two of twenty attendees") |
| Marion Court / Tellus / Loxleys | 30+ | Taylor, 2026-09-01 |

Good Good is the known weak one — dive bar, 19:1 gender ratio, its own debrief.
**25-40 is fair to put in front of a GM.** Unchanged.

## Claim 2 — the arithmetic — LARGELY HOLDS

$1,400 is `40 people × $35/person` (`04_GO_TO_MARKET_Freemium.md:183`,
`06_QUICK_REFERENCE_Freemium.md:85`). The $35 is not arbitrary: the package's own
Tier 1 criteria target venues with **"Avg Check: $25-50/person"**
(`Venue_Outreach_Package.md:15`). $35 sits mid-band. The model is internally
consistent with the venues it is aimed at.

**Incremental F&B, by headcount and the venue's own check average:**

| In the room | × $20 (Tellus-class) | × $25 (Tier 1 floor) | × $35 (Tier 1 mid) | × $50 (Tier 1 ceiling) |
|---|---|---|---|---|
| 25 | $500 | $625 | $875 | $1,250 |
| 30 — typical | $600 | $750 | **$1,050** | $1,500 |
| 40 — best case | $800 | $1,000 | **$1,400** | $2,000 |

So $1,400 is a **real top-of-range outcome at a properly selected Tier 1 venue** —
40 people at a mid-band check. It is not a fabrication. Two honest caveats:

- It needs the **top** of the headcount range, not the typical 30. At 30 in a
  mid-band room it is about **$1,050**.
- **Tip is not the venue's money.** Taylor's $18-22 is "plus tip"; the tip goes to
  staff, not the F&B line an owner counts. Worth keeping out of the quoted figure —
  though bartender goodwill on a dead shift is a genuine secondary sell to a GM.

## The actual defect: "see"

The arithmetic is sound. The **framing** is not.

- Attendees **open separate tabs**, so F&B lands in the venue's POS and never in
  ours. We see ticket revenue only.
- No venue has ever reported an F&B figure back. Nothing in this repo contains
  one — `grep` across `reports/` and `content/brand.json` returns no measured F&B.
- Therefore *"most venues we partner with **see** ~$1,400"* presents a **model
  output as observed history.** The model is reasonable. The observation has never
  been made.

**And the venue can check it; we cannot.** The GM reads their own POS the next
morning. This is the rare claim where the recipient holds better data than the
claimant.

## The Lancaster rooms do not validate the Philadelphia number

This cuts both ways and is the most useful finding here.

Tellus ran **$18-22 a head** — *below* the $25-50 Tier 1 band the Philadelphia
targets are selected for. So SparkDate's own event history **cannot confirm or
refute $35/head at a Rittenhouse cocktail bar.** Three drinks at Tellus and three
drinks at Parc are not the same transaction.

The per-head figure is a property of **the venue**, not of SparkDate. That is why
quoting one fixed dollar amount to every venue is the error — a dive bar and Parc
cannot both produce $1,400, and the pitch currently promises both the same number.

---

## Recommended copy

Keep the model, drop the false provenance, and let the GM supply the multiplier —
which is more persuasive to an operator than any number we assert. Replace:

> Most venues we partner with see ~$1,400 in incremental F&B per event.

with:

> They open separate tabs and buy off your regular menu — figure two or three
> drinks a head across a couple of hours. At your check average you can do that
> math faster than I can, and you keep all of it.

This is unfalsifiable by a POS report, it flatters the operator's own knowledge,
and at a Tier 1 room it lands the reader on a number **larger** than $1,400 — a
$50 check average at 40 people is $2,000. The overclaim was costing us the sale it
was meant to make.

If a figure is wanted in writing, the honest form exposes inputs and marks itself
a projection: *"30 guests at a $35 check is about $1,050"* — never "most venues see."

## Fixed — 19 instances across six files

It ran wider than the first pass reported: **19 occurrences**, not the six first
counted, **ten of them in `10_Venue_Cold_Emails_Ready_to_Send.md`** — a file whose
name says it is ready to send. A second verbatim pitch script was also found in
`Philadelphia_Financial_Model_FREEMIUM_VENUES_1.md:251`, which nothing had flagged.

Split by risk:

| File | Treatment |
|---|---|
| `10_Venue_Cold_Emails_Ready_to_Send.md` | 10 copies rewritten |
| `Venue_Outreach_Package.md` | header pitch, Template 1, Template 2 rewritten; banded estimate added at the top as the one place the number is stated |
| `04_GO_TO_MARKET_Freemium.md` | spoken pitch script rewritten; model input relabelled |
| `Philadelphia_Financial_Model_FREEMIUM_VENUES_1.md` | second pitch script rewritten; three model lines relabelled |
| `06_QUICK_REFERENCE_Freemium.md`, `02_BUSINESS_ANALYSIS_Freemium.md` | arithmetic kept, relabelled **ESTIMATE** |

`05_MODEL_COMPARISON_All_Versions.md:41` already said "estimated" and was left alone.

**The model files were relabelled, not recomputed.** Changing $1,400 there cascades
into net-profit per event, the $10,000/month venue figure and the $11,200 eight-event
total. That is a business decision, not a copy fix, and it is still open — see below.

## Measuring it was declined, deliberately

One partner reporting a tab total after an event would have converted this pitch
from a model into evidence. **Taylor considered it and declined on 2026-09-02** —
not worth bothering a venue over.

So the estimate is retained as an estimate, permanently, **by choice.** The mid
tier (~$35/head, **~$1,050 at 30 guests**) is confirmed as realistic and stands as
the default.

That makes the labelling in this commit the whole of the fix rather than a stopgap:
nothing downstream will ever arrive to replace these numbers, so every surface that
carries one must keep saying **ESTIMATE** and must keep handing the multiplier to
the operator. This is not an open thread. Do not re-raise it as a gap.
