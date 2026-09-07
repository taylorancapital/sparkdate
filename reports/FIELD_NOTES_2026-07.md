# Field notes — July 2026

**Two incidents. One is this catalogue's first case of a failure that was
diagnosed correctly and reported honestly, every single night, and still went
unfixed for days.** Nightly automation started 2026-07-24
(`54eae136`) — this is the first month there was an unattended agent to fail.

*Retroactive edition, written 2026-09-07. Continues numbering from
`reports/FIELD_NOTES_2026-06.md`.*

## Detection

| Detection | This month | Cumulative |
|---|---:|---:|
| `GATE` — a deterministic check refused it | 0 | 0 |
| `THREW` — an actual error surfaced | 1 | 3 |
| `HUMAN` — someone distrusted a number | 0 | 2 |
| `OPERATOR` — reported as "data went missing" | 0 | 0 |
| `LATER` — found by an unrelated dig | 1 | 1 |
| **Total** | **2** | **6** |

---

## A. The agent was confidently wrong

### 27 — Filename and mtime were never a valid staleness check · `LATER`

The nightly's rotation logic re-uses a prior night's analysis when it decides
the underlying GA4 export is unchanged. On 2026-07-25 and 2026-07-26, and
again in a first pass on 2026-07-27, that decision was made by matching
**filenames and file modification times** against the previous night's
export and concluding "same data, don't repeat the analysis."

That signal was never valid. Browser downloads of GA4 CSVs are always named
`download.csv`, `download (1).csv`, `download (2).csv`… regardless of when
they were pulled — the naming convention is fixed, not derived from pull
date. The user had in fact deleted the old files and re-pulled a fresh
30-day export on 2026-07-27. Three consecutive nightly cycles treated
genuinely new data as a stale duplicate and skipped analyzing it.

Caught the same night it was written up, by reading each CSV's own `#
20260628-20260727`-style header line instead of trusting the filename — the
one reliable freshness signal that had been sitting in the files the whole
time.

**Cost:** at minimum two full nightly cycles (07-25, 07-26) where fresh
exported data was never actually analyzed, on the incorrect belief that
nothing had changed. The nightly's entire function — surface what changed —
did not happen for those nights.

**Anchor:** `reports/GA4_ANALYSIS_2026-07-27.md`, "Correction to the prior
nightly log entry" (lines 15–23): *"an earlier run tonight (and the two
before it) concluded this data was unchanged... That was wrong."*

---

## F. Correctly diagnosed, not fixed

*New class. Does not fit A–E: the agent was not wrong, nothing was silent, no
write occurred, and this was not a concurrency collision. The failure is that
an accurate, honestly-reported blocker recurred for days because reporting it
is not the same as escalating it, and nothing forced the fix.*

### 28 — Three consecutive nights with no way to open a pull request, each one correctly reported and none of them fixed · `THREW`

The nightly automation's Cowork session folder connection covered only
`Business Plan\files\Night Tasks\`, not the sparkdate repo root. That meant
`.claude-gh-token.txt` — expected at the repo root — was unreachable, so no
authenticated `git push` was possible. Per the run's own hard rule ("if
missing… STOP and report a token problem — do not improvise"), no substitute
credential was used; each report was written to the Night Tasks folder as a
plain file instead of a pull request.

This was not silent. `reports/SEO_CTA_HEALTH_CHECK_2026-07-28.md` names the
"same root cause as 2026-07-25 and 2026-07-26" explicitly, states the fix
needed ("confirm the Cowork folder connection... includes the repo root"),
and repeats that exact recommendation — because the two nights before it had
already made it and nothing had changed. At least three consecutive scheduled
runs (07-25, 07-26, 07-28) hit the identical wall and reported it accurately
each time.

**Cost:** three-plus nights of completed analysis stranded outside git,
invisible to anyone not looking directly in the Night Tasks folder. The
reports were eventually recovered and merged 2026-07-30 (`d3208d1d`, PR #125;
`6a6e2d74`, PR #128) — two days after the last of the three. This is the same
*shape* of failure as incident
11 (a finished report stranded with no PR, August 31) but a different root
cause: incident 11 was a shell-quoting bug in a script; this is a folder
permission scope on the automation platform itself. The pattern — a report
finishes, nothing opens a PR for it — recurred across two completely
different mechanisms and two completely different automation stacks (Cowork
here, the Windows/PowerShell nightly later) before either was actually fixed.

**Anchor:** `reports/SEO_CTA_HEALTH_CHECK_2026-07-28.md`, "Delivery note — why
there's no PR tonight"; same note in the 07-25 and 07-26 runs per its own
cross-reference; recovery commits 2026-07-30.

---

## What this is and is not

- **This is the first month with an unattended agent running at all**, and
  its two incidents bracket the whole space this catalogue cares about: one
  is a wrong conclusion (27), the other is a correct, repeated diagnosis that
  nobody with the ability to fix it acted on (28). Neither is the "silent
  failure" pattern that dominates August — that pattern needed live user-facing
  systems (Firestore, checkout) that didn't exist for the nightly to touch
  yet in July.
- **Class F is new, added this edition.** It does not retroactively apply to
  anything in edition 1's 18 or edition 2's 4; none of those are a good fit
  for it. If a future month produces nothing like incident 28, class F simply
  goes unused that month, the way class D or E already does in some months.
- **"Cost" means what was lost or nearly lost.** Incident 27's cost is stated
  as a minimum (two nights, possibly more depending on how the first
  attempt on 07-27 itself is counted) rather than a precise figure.
- **Names, account identifiers and customer records are omitted throughout.**
