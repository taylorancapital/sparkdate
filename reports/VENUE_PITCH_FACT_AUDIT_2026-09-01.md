# Venue pitch — fact audit, 2026-09-01

The venue outreach package makes two numeric promises to business owners. One
survives contact with reality. The other does not, and it is the one printed in
every cold email, in the subject-line-adjacent opening paragraph, and in the
package header.

Triggered by drafting Phase 1 outreach to ten Philadelphia venues. Not covered by
`reports/FACT_AUDIT_2026-09-01.md`, which audits public marketing surfaces —
these claims live in outbound sales copy, which nothing audits.

---

## The two claims

From `Business Plan/files/Marketing & GTM/Venue_Outreach_Package.md` and its
five email templates, repeated verbatim across
`Business Plan/files/10_Venue_Cold_Emails_Ready_to_Send.md`:

1. *"We bring **25-40** pre-screened, paying young professionals"*
2. *"Most venues we partner with see **~$1,400** in incremental F&B per event"*

## Where $1,400 comes from

It is not a measurement. It is a multiplication, and both source documents show
their work:

> `04_GO_TO_MARKET_Freemium.md:183` — "Average event: **40 people, $35/person
> F&B spend** = $1,400 revenue."
>
> `06_QUICK_REFERENCE_Freemium.md:85` — "40 attendees × $35 F&B spend = $1,400"

So $1,400 requires **the top of the headcount range and $35 a head, simultaneously.**

---

## Claim 1 — headcount — HOLDS

| Event | In the room | Source |
|---|---|---|
| Event 1 | 22 | `approved_stat`, CAMPAIGN_FRAME_GAP_ANALYSIS_2026-08-22.md:108 |
| Good Good | ~20 | EVENT_DEBRIEF_GOOD_GOOD_2026-08-31.md ("two of twenty attendees") |
| Others (MC / TL / LX) | 30+ | Taylor, 2026-09-01 |

Good Good is the known weak one — dive bar, 19:1 gender ratio, its own debrief.
Treating it as typical would understate the business. **25-40 is a fair range to
put in front of a GM.** No change needed.

## Claim 2 — $1,400 — DOES NOT HOLD

The break is entirely in the **$35/person** assumption. Taylor's own read of the
room is **~$15/person**, on separate tabs.

| Headcount | × $15 (observed) | × $35 (assumed) |
|---|---|---|
| 20 | $300 | $700 |
| 25 | $375 | $875 |
| 30 | $450 | $1,050 |
| 40 | **$600** | **$1,400** |

**At $15 a head, $1,400 needs 93 people in the room.** At a realistic 30, it needs
$46.67 a head. The claim overstates by **2.3× at the most generous reading**
(40 people) and **3.1× at a typical one** (30 people).

---

## The deeper problem: this number is unmeasurable by us

Attendees **open separate tabs**. That means:

- F&B lands in the venue's POS, never in ours. We see ticket revenue only.
- No venue has ever reported an F&B figure back. Nothing in this repo contains
  one — `grep` across `reports/` and `content/brand.json` returns no measured
  F&B anywhere.
- Therefore *"most venues we partner with **see** ~$1,400"* describes an
  observation **nobody has ever made**. It is not a number that was measured
  and drifted. It is a number that was multiplied and then described as
  observed.

**And the venue can check it. We cannot.** The GM reads their own POS the next
morning. This is the rare overclaim where the recipient holds better data than
the claimant, and finds out on day one.

## Why this is worth fixing before Phase 1 sends

Philadelphia hospitality is small and the target list is concentrated:

- **JMac Hospitality** operates Rouge *and* Twenty Manning Grill — 2 of the 10.
- **Starr Restaurants** operates Parc *and* the Ranstead Room — 2 more.

Four of ten Phase 1 targets sit inside two groups. Overpromising to one GM burns
the group, not the room. A partnership that dies after event one because the
number missed by 3× also costs the reference — and references are the whole
Phase 2 plan.

---

## Recommended copy

Delete the F&B claim; keep the arithmetic and let it be checkable. Replace:

> Most venues we partner with see ~$1,400 in incremental F&B per event.

with:

> They open separate tabs and buy off your regular menu — figure a couple of
> drinks a head across a couple of hours on a night that would otherwise be
> quiet. You keep all of it.

This is defensible, it is still attractive for a dead Tuesday, and it cannot be
falsified by a POS report. **$450–600 of incremental F&B on a dead Tuesday is a
good pitch on its own.** The overclaim was never needed.

If a number is wanted, the honest form is a projection with its inputs exposed —
*"30 guests at roughly $15 a head is about $450"* — never "most venues see."

## Also fix

- `Venue_Outreach_Package.md` header: *"You make ~$1,400/event in F&B"* — same fix.
- `10_Venue_Cold_Emails_Ready_to_Send.md` — carries the claim **6 times** and is
  named *ready to send*. Highest risk file of the set.
- `04_GO_TO_MARKET_Freemium.md:183` and `06_QUICK_REFERENCE_Freemium.md:85` are
  the source of the arithmetic. Correcting the templates without correcting these
  means it gets re-derived next quarter.
