# HANDOFF — intent only

**Contract for this file. Read before editing it.**

This holds only what a machine cannot derive: what someone was mid-way through,
why, and what they would do next.

**Never write here:** open PRs, worktree inventories, stash lists, recent
commits, or "X is merged." `npm run brief` derives all of that live and is
correct; a typed copy is wrong within hours. The 2026-08-30 version of this file
listed two PRs as open (one had merged) and three worktrees that no longer
existed, while missing all four that did. **That is the rule this file exists
for.** It is about the KIND of content, not the amount.

**THE ~25 LINE CAP IS GONE (2026-09-04).** It was added in #357 when the file
was 29 lines, as shorthand for "intent only". It never held once: 29 → 48 → 94
→ 115 → 129 → 152 → 195 lines across seven sessions, and no session ever
trimmed to it. What it did instead was create pressure to delete live intent
from other people's chats to hit a number — which is a worse failure than
length, because a dropped thread is invisible and a long file is merely long.

**What replaces it, so the file cannot rot instead:**

1. **Date every entry** you add, `(MM-DD)`. Rot is then visible to a reader
   rather than requiring `git log`.
2. **Every entry names a next concrete step.** If you cannot write one, it is
   not in-flight intent — it is a finding (`reports/`), a fact (memory file) or
   a rule (`CLAUDE.md`). Move it and delete it here.
3. **Delete on completion, not on length.** Finishing a thread means removing
   its entry in the same PR.
4. **Never delete another session's entry to make room.** Correct it if you
   have evidence it is wrong or done, and say what the evidence was.

**Durable rules go in `CLAUDE.md`. Durable facts go in memory files. Findings go
in `reports/`.** If an entry here stops being "in flight," move it or delete it.

## In flight

- **TikTok organic is now plumbed but has NO CREDENTIALS — the remaining half
  is Taylor's and cannot be done by a machine.** (09-10) Confirmed by
  `gh secret list`: of ten repo secrets, none is TikTok, so
  `secrets.TIKTOK_ACCESS_TOKEN` in `social-publish.yml` has expanded to empty
  since #215 and **TikTok has never published from CI** — every `tiktok` row
  (17 of them) has silently skipped. The publishing code itself was already
  complete and always has been; only the credentials and the token store were
  missing. This PR adds the store, wires both entry points through it, and adds
  `scripts/tiktok-authorize.js`. **Next step, in order: (1) create the app at
  developers.tiktok.com with the Content Posting API product and the
  `video.publish` scope, and verify `sparkdate.date` as a property — publishing
  uses `PULL_FROM_URL` and TikTok refuses unverified domains, failing at publish
  time with an error that names nothing; (2) `node scripts/tiktok-authorize.js`
  signed in as SparkDate; (3) set `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET`
  as repo secrets; (4) `node scripts/social-preflight.js` to confirm.** Full
  sequence in `docs/SOCIAL_RUNBOOK.md` §9. Until then nothing changes — TikTok
  rows keep skipping and Meta is unaffected.
  - **Expect drafts, not posts, at first.** `UPLOAD_TO_DRAFT` needs no audit;
    `DIRECT_POST` needs TikTok's app review (2–4 weeks, and it can be rejected),
    and until that clears an unaudited app is capped at `SELF_ONLY`, so
    DIRECT_POST "succeeds" and posts privately to nobody. Preflight reports the
    account's real allowed privacy levels — read that before flipping the mode.
  - **MC-15's TikTok leg was lost to this on 09-10** and is past its 6h grace,
    so it would have to be posted by hand if it is wanted at all. Measured
    against `content/queue.csv` at `c87f8e2a`: 18 of 48 rows list `tiktok`, 11
    are already past their slot with the TikTok half never sent, and 7 are still
    ahead — LX-17 (09-12), LX-18 (09-14), LX-19 (09-15), LX-20 (09-16), LX-22
    (09-19), LX-23 (09-20), all `approved`, plus LX-27 (09-23), `pending` for
    its own reason below. Until step (3) above is done, every one of those
    publishes two surfaces instead of the three it was approved for.

- **The `*/15` publish cron is really running every 2–3.5 hours, and that
  should be measured rather than assumed.** (09-10) Observed run starts on
  09-09/09-10: 14:32, 17:58, 20:34, 22:44, 00:37, 05:15, 09:54 UTC. GitHub is
  throttling the schedule heavily. Instagram's 6h grace window is wider than
  the typical gap, which is why this has mostly worked and why nobody noticed —
  but the margin is far thinner than the cron implies, and a single longer
  outage drops an Instagram leg permanently. **Next step: decide whether to
  widen the cron deliberately to match reality, or move the trigger somewhere
  that fires reliably.** Do not "fix" it by shortening the interval; GitHub is
  already ignoring `*/15`.

- **Tellus produced 2 matches from 34 people, and the dashboard now says the
  likely reason is nobody answered the email — not the room. Tellus is booked
  again for Oct 6.** (09-10, #499 and #507) The Matches panel on the Retention
  tab reads `matches`, `connection_intents` and `post_event_prompts`, which no
  tab had ever read. It puts a number on what was previously an anecdote: Tellus
  had **10 women checked in, the most of any night, and 2 of them picked anyone
  — a 20% answer rate against 71%, 100% and 167% elsewhere.** 32 of its 34
  attendees were sent the prompt, so the email went out and was not acted on.
  That points at a **response** problem (prompt timing, the email itself, or the
  `/matches` page for that event) rather than the chemistry of the room, which
  was the earlier assumption and is now the less likely one. **Next step, before
  Oct 6: open `public/matches.html` against the Tellus event id and confirm it
  actually renders that night's co-attendees — the review lists a per-event bug
  there as an untested candidate, and it is the one explanation nobody has ruled
  out.** If it renders fine, the question is email timing and Taylor's call.
  The panel reports what is stored; it does not explain the gap.

- **The admin metrics review is a live worklist, and the last silent
  truncation on the dashboard is now in the sales heatmap rather than in the
  totals.** (09-10) The queue is the DECISION list in
  `reports/ADMIN_DASHBOARD_METRICS_REVIEW_2026-09-10.md`. Item 1 (a Matches
  panel, #499, plus women's answer rate in #507), item 3 (the 200-ticket cap in
  `loadPayments`, #502), item 4 (Sales Pace against past events at the same
  T-minus, #504), item 6 (door count and show rate, #505), item 9 (subscription
  surfaces retired, #505) and the three arithmetic defects of item 2 (#500) are
  done and need no revisiting; what is left is listed below so nobody
  re-derives it from the report.
  **`startLiveTickets()` still carries `limit(200)` and Taylor said on 09-10 it
  is being handled in another session — do not fix it here and do not re-raise
  it.** Recorded because it is the same class of bug #502 removed: past 200
  tickets, "when tickets sell" silently becomes "when the last 200 sold", and
  the cap is a deliberate cost decision about a listener held open for the whole
  session, so it is a billing call rather than an arithmetic one.
  **Next step for whoever picks the report back up, in the order the report
  ranks them:** (5) a women's acquisition strip on the Ads tab — **now only two
  of its three parts, cost per woman ticket and women's share at T-7. The
  third, women's share of pickers, shipped in #507** as a "women picked /
  checked in" column on the Matches panel, so build the Ads strip against that
  rather than recomputing it; (7) a `web_daily`
  sync beside the Google Ads pull, so landing-page-view → purchase stops living
  only in the nightly reports; (8) email aggregate rates on the Leads tab;
  (10) surface per-ticket attribution and a plain "referral leads: 0" line.
  **Show rate is built but has never been measured:** #505 put a door-count
  box at the foot of the run-of-show screen, shown once the event date has
  passed, and the Retention tab's Show rate card reads "not counted" until a
  count exists. No event carried one when #505 merged, so the first real
  figure arrives only when a host types a count in at the end of a night.
  **Also still undone from item 2: a per-event CAC on the Event P&L detail
  row**, where the synced spend already sits — the blended figure is all-time
  over all-time and can only drift.
  **Items 4, 6 and 9 are built — do not re-derive any of them from the report.**
  4 is #504 (09-10): the flat 1.5/day target is gone, the card is now **Sales
  Pace** and its trend line reads "vs past events at the same T-minus".
  *(Corrected 09-10 by the session that shipped #505; the evidence is #504's
  own diff, and the rename is also what turned main red — see #511.)*
  9 is #505: it removed all four subscription surfaces outright (the Active
  Subscriptions KPI on Revenue AND in the Full Report list, the Subscription
  Breakdown card, the subscription rows and chip in Payment History, and the
  Members-table LTV column) along with `TIER_PRICES` and `AVG_LIFETIME_MONTHS`;
  `loadPayments`'s read of `payments` and `kpiSnapshot.active` are deliberately
  kept, so bringing memberships back is a markup change and not an arithmetic
  one.
  6 is #505 too: it added the door-count box to the run-of-show screen and the
  Show rate card to the Retention tab. What 6 could NOT do is the entry
  immediately below.

- **The show rate finally has somewhere to be typed, and still has no number in
  it — five past events, not one with a `doorCount`.** (09-10, #505) `mixCell`
  has rendered "door N · %show" since #324 and the field has been empty for its
  entire life, so the one figure that decides whether to oversell 30 seats has
  never been measured once. There are now two places to enter it: a box at the
  foot of the run-of-show screen, shown only after the event date has passed
  (that screen is the one a host is holding at the end of the night, which is
  the only moment the number exists), and the Costs row on the Events tab that
  already existed. Both write `events/<id>.doorCount`, and blank is stored as
  NULL rather than 0 on purpose. The Retention tab's Show rate card reads
  **"not counted" rather than 0%** until a real number exists, because an
  uncounted night summed as zero reports a no-show crisis that never happened.
  **Next step is a human's, not a session's: type the door count for the five
  past events.** Nobody else knows the numbers and they cannot be reconstructed
  — digital check-in reached 91 of 140 past confirmed registrations and is a
  FLOOR, not attendance (`attended.txt` recorded 31 real heads against 26
  registered at Event 1; see [[checkin-counts-undercount-attendance]]), so
  back-filling from check-ins would be wrong by construction and in the
  flattering direction. Until a number is typed the card stays "not counted" and
  the Mix column keeps showing the gender split instead, which is the correct
  behaviour and not a bug to chase. **Delete this entry once any past event
  carries a count.**

- **A match email Resend refuses is now visible on the `matches` doc, but still
  nothing re-sends it.** (09-10, #492) `resend.emails.send()` RESOLVES with
  `{ error }` on a 4xx/5xx rather than throwing, so `notifyMatch` in
  `api/declare-connection.js` logged `match notified` for mail that never went
  out — behind an idempotency lock it had already claimed, so nothing would ever
  retry. That is the highest-value email SparkDate sends. It now reads each send
  result and records `notified` true/false plus `notifyError` on
  `matches/{eventId}_{sortedPair}`. **The lock deliberately still PRECEDES the
  send** — it closes the race between both directions of a mutual pick landing at
  once, and `handleUnpick` reads the same doc to refuse an undo once contact info
  is out, so a lock that only appeared on success would let someone unpick a real
  match. **Next step: query `matches` for `notified == false` carrying a
  `notifyError`. A non-empty result means those two people were told they matched
  and never learned who — the fix is a re-send sweep, and nothing does it
  today.** Same PR: the six silent `else { skipped++; }` branches in
  `api/cron-send-emails.js` now log and count rejections separately (`rejected:`
  in the `Cron complete` line), so a run being refused stops reading like a run
  with nothing to send.

- **Run-of-show audit fixes 2 and 3 are unbuilt, and Taylor has been asked twice
  without answering either way — do not treat silence as a no.** (09-10) From
  `reports/CHEMISTRY_RUN_OF_SHOW_AUDIT_2026-09-09.md`: **fix 2** prints
  `Men → Table N next` on the table card beside the `← men from N` already
  there (rotation is +1, so the number is free, and it answers "where next" for
  a whole table at once without anyone searching). **Fix 3** retires the
  `Intro order` tab, moves `printIntros()` into Priority Intros, and unions
  `_introsDone` with `_priorityDone` — those use identical key formats as two
  separate Sets today, so a pair ticked off in one view still reads as
  outstanding in the other, and whichever view the host happens to be holding is
  the one that is right. **Next step: put both to Taylor once more as a yes/no;
  each is self-contained, neither is started.** Fixes 1 and 4 are closed — 1 is
  built, 4 is retired rather than deferred (a standing 1-on-1 has no table to
  number, see [[one-on-ones-strand-a-third-of-a-skewed-room]]).

- **TL2's 14 queue rows are drafted and all `pending` — they need art, then
  Taylor's `approve`.** (09-10) TL2 had ZERO rows in `content/queue.csv` while
  being live on Eventbrite, Nextdoor, LancasterOnline and Facebook, so the event
  had no organic social at all. Cadence mirrors LX (TL2-01 .. TL2-14, Sep 11 →
  Oct 7). Lint is clean: 0 errors. **Next steps: (1) art — none exists, and
  TL2-01 posts 2026-09-11 12:30, so its three frames go first or the row moves.
  Both routes are ready as of 09-10: the export sheets
  (`node scripts/build-campaign-export.js --event=TL2`, then again with
  `--tiktok`: 35 frames from 13 posts, TL2-13 held for live photos) or the
  Claude Design brief (`node scripts/design-handoff.js --events=TL2`: 14 posts,
  35 slides). The PAID creative brief is a separate job
  (`node scripts/build-paid-campaign.js --event=TL2 --handoff`). Then
  `python scripts/prep-social-assets.py` — but not until prep's two 09-10 bugs
  are fixed: in a dry run on sample TL2 exports, a row's first prep appended
  every story and TikTok file twice (TL2-01's three `_tt` frames came out as
  `1of6`..`6of6`), and posted row TL-02's legacy key `tl2` claimed every TL2
  export.** `asset_files` is EMPTY on every TL2
  row, which is the convention: prep writes the names when art lands (LX-26 is
  the same). I had pre-filled 13 rows with names for art that did not exist,
  and that broke three things without an error: `design-handoff.js` skips any
  row with names, so the brief came out as 1 post and 0 slides; prep ignores a
  new export for a shape the row already names; and `approve`'s no-art guard
  only checks for an empty field, so art-less rows would have passed it.
  Cleared 09-10, in the same PR as the Loxleys price fix below.
  (2) `node scripts/social.js approve --through=<date>` — Taylor's click, not
  mine.** Three things deliberately decided, all reversible: **TL2-04 is the
  early-bird deadline post and moved to Sep 21 at Taylor's call**, off LX's
  event day. Its COPY changed with the date, which is the part worth
  remembering: `early_bird_through` is 2026-09-22, so the price still holds ON
  the 22nd and the original "ends tonight" would have been false a day early —
  it now reads "ends tomorrow / $24.99 through tomorrow / $29.99 from
  Wednesday". Sep 21 still carries LX-24, but at 18:30 against 12:30, so the
  linter warns on the day rather than erroring on a slot. **Every row from TL2-05 on says
  $29.99, never $24.99** — the lint only checks price MEMBERSHIP, not the date,
  so it would not have caught a stale early-bird price. **TL2-11 needs one
  1080x1080 feed frame plus one story frame.** Its format `Single image + Story`
  used to make `framesForRow` mark both frames as stories, and a story-only set
  is what makes `lib/social-publish.js` refuse the Facebook leg (MC-12, LX-24).
  Since 09-10 the sheet and the Design brief plan the same card twice, 1080x1080
  then 1080x1920 (Taylor's call: repeat the card, not a closing card), and prep
  names the pair `TL2-11.jpg` + `TL2-11_story.jpg`; no hand-made square. Two copy
  calls for Taylor, not bugs: TL2-03's four slides drop the caption's
  "one-on-ones" and "mutual interest is a match" lines, and TL2-14, the recap,
  still gets a fact frame and a "Get tickets" card for an event that is over.
  TL2-14 keeps a `[REAL NUMBER]` placeholder on purpose and cannot be approved
  until the counted check-in figure exists after 2026-10-06.

- **TL2 (Tellus AfterDark, Oct 6) is LIVE on Eventbrite and Nextdoor; three
  things about it still need a human.** (09-09) Eventbrite
  `2000197587829` is On Sale, 0/30, tiers copied from Loxleys
  ($29.99 / $29.99 / $14.99 Bring-A-Friend) with a **$5.00 automatic discount on
  the two GA tiers expiring Sep 22 11:30 PM** — that is how the early bird is
  implemented, per Taylor's instruction, NOT as separate Early Bird tiers (an
  earlier attempt at those was built and deleted). Nextdoor post is live at
  nextdoor.com/p/P3BcQxxgJXJp. **Next steps, in priority order: (1) the listing
  has NO COVER IMAGE — Eventbrite's uploader needs a native file picker, and
  AllEvents auto-imports from Eventbrite and freezes the banner at import time,
  so this wants doing before that crawl runs. (2) **Refund policy: CLOSED 09-10,
  no action needed. TL2 is "No refunds", matching Marion Court, which is what
  Taylor wants.** Recording this because I reported it wrong twice on 09-09 and
  the wrong version is the memorable one: I claimed the live value was "Refunds
  up to 7 days before event" and that the publish step had silently dropped my
  `no_refunds` selection. **Both false.** The selection persisted fine; the
  "7 days" reading came from a STALE CACHED public page. A `?cb=` param is not
  sufficient on its own — the reliable tell is the organizer stat line
  (`N followers · N events · N total attendees`). The read that had it says
  "No refunds"; the read that lacked it said 7 days. The admin page at
  `/manage/events/<id>/refund_policy` had also shown `no_refunds` checked and I
  talked myself out of it as an unhydrated default. **Trust the admin page and
  the stat-line tell over a bare cache-buster.** Corollary: the two failed
  attempts to set 14 days were almost certainly just Eventbrite 500s, not the
  "only make it more flexible after publishing" rule — no-refunds → 14 days is
  a LOOSENING and would have been permitted. That page lives under **Event
  Finances**, not Order Options. (3) **Evvnt / LancasterOnline: SUBMITTED 09-10
  by Taylor.** The "sign-in walled" note this entry used to carry was wrong and
  is corrected in `content/listing-sites.json` — only the direct Evvnt domains
  wall you; the "Promote Your Event" link in the LancasterOnline calendar FOOTER
  opens the whole form with no login, and the account gate is at the final
  submit only. Composed with the ticket URL set to
  `sparkdate.date/l/tl2-lancasteronline` (the path-only link, because their
  publisher's query-string rewrite is what produced 129 zero-conversion sessions
  in September). **Next step: this is a moderated calendar, so confirm the
  listing actually appears on lancasteronline.com/calendar within a few days,
  and around 09-17 check GA4 for `lancasteronline / listing` showing NON-ZERO
  `view_item` — that is the specific thing the `/l/` link was introduced to fix
  and it has never yet been observed working.**

- **Patch and Discover Lancaster for TL2 are composed-but-unposted, and Patch has
  a payment trap.** (09-09) Patch's step 2 pre-selects 8 paid communities at
  $14.00; choosing "I do not want to feature my event" flips the CTA from "Next"
  (→ payment) to "Post", but the panel still displays a price (it read
  "You pay $1.75" even with every community unchecked), so it was left unposted
  rather than risk an unauthorised charge overnight. Patch is SKIPPED for TL2 by
  Taylor's call on 09-10. **Discover Lancaster is re-filled as of 09-10 and
  waiting on three things only a human can do: a Business Phone (REQUIRED, and
  no number exists anywhere in this repo), the certification checkbox — "I
  certify that my event is tourism-related and will have the potential to bring
  visitors to Lancaster County", which is an attestation about the event and not
  mine to tick — and the reCAPTCHA.** Everything else is in: name, Oct 6
  6:30–8:30 PM, Tellus360 / 24 E King St / Lancaster / PA / 17602, categories
  After Five + Downtown Lancaster, admission, 839-char description, and both URL
  fields set to `sparkdate.date/l/tl2-discoverlancaster` (46 chars, under their
  100-char cap). Contact is Taylor Chambers / taylor.ancapital@gmail.com —
  change it if a tourism-board moderator should reply elsewhere. **Two traps
  found, both worth knowing before anyone refills this form: (1) the category
  checkboxes RENDER TWICE — 34 boxes for 17 categories, both blocks live — so
  ticking by label submits every category twice; untick the duplicate.
  (2) NO IMAGE was uploaded on purpose: their spec is 600x600 with "no logos and
  no words in the image", and the SparkDate cover art is exactly a logo with
  words, so uploading it invites a moderation rejection. The image field is not
  required. Art here has to be a photo of the venue or the room, not the brand
  card.** AllEvents needs no submission — it auto-imports from Eventbrite — but
  its imported body and link both need the manual fix afterwards.

- **LX-24's Facebook leg cannot publish and will fail silently on 09-21 — it
  needs a 1080x1080 export.** (09-10) Approved with the rest of the Loxleys run,
  but `plan` already skips `LX-24/fb` with "every asset is story-shaped". Its
  four files are two `_tt` and two `_story` frames; there is no feed-shaped one,
  so `lib/social-publish.js`'s guard refuses it every run. **This is MC-12's
  failure exactly**, and that one was only fixed because Taylor exported a square
  by hand. The Instagram Story half is fine and will go. **The planner makes the
  square now (09-10: `framesForRow` plans this format as one card at 1080x1080
  and again at 1080x1920), so no hand export is needed. Next step, before
  2026-09-21 18:30 and only once prep's two 09-10 bugs are fixed (see the TL2
  queue entry): `git pull`; `node scripts/build-campaign-export.js --event=LX`;
  export LX-24's two frames into `SourceArt`;
  `python scripts/prep-social-assets.py --rebuild`; check `git status` shows
  only the expected files; commit.** It has to be `--rebuild`: a plain run adds
  `LX-24.jpg` for Facebook but keeps the old two story frames (the hook, then
  "Last call") for the Story, because the row already has story art. The $24.99
  re-export in the next entry needs the same `--rebuild`, so one pass can do
  both. Or decide LX-24 is Story-only and drop `fb` from its platforms so it
  stops reading as a scheduled post that never happened.

- **Five approved Loxleys carousels show $24.99 in the image, but brand.json has
  had LX at $29.99 since 09-08. LX-17 posts first: 2026-09-12 16:00.** (09-10)
  The captions are right; the ART is stale. Each fact frame reads "Doors 6:30 PM
  · $24.99" in both the square and the `_tt` file: `LX-17_4of5` (09-12 16:00),
  `LX-18_5of6` (09-14 16:00), `LX-19_2of3` (09-15 12:30), `LX-22_3of4` (09-19
  19:00), `LX-23_2of3` (09-20 16:00). That is ten JPEGs, all on approved rows.
  Found by opening the fact frame of every approved LX carousel: LX-20 is a
  quote carousel with no fact frame, LX-25 names no price, and LX-11 posted
  09-07 while $24.99 was still true. Cause: `build-campaign-export.js` priced
  each fact frame by the day the SHEET was rendered, not the day the post goes
  out. The 09-10 fix has a regression test, but merging it does not repair art
  that is already rendered. **Next step, Taylor's, because it needs the sheet's
  in-browser export: after the fix merges, `git pull`; run
  `node scripts/build-campaign-export.js --event=LX` and again with `--tiktok`;
  export those five frames in both shapes into `SourceArt`; run
  `python scripts/prep-social-assets.py --rebuild`; check `git status` shows
  only the expected files; commit `public/social/`.** If that cannot happen
  before 09-12 16:00, hold LX-17.

- **LX-27 is deliberately still `pending` — it is the Loxleys recap and its
  caption still says `[REAL NUMBER]`.** (09-10) It cannot be approved until the
  counted check-in figure exists, which is after the event on 09-22. `social.js
  approve` now refuses it by itself rather than relying on someone noticing (see
  the guard added in this PR), so a bulk `approve --through=` cannot post the
  literal words. **Next step: after Loxleys on 2026-09-22, put the counted
  check-in number into LX-27's `caption` and `caption_x`, then
  `node scripts/social.js approve --row=LX-27`.** This is the same trap MC-15 was
  one keystroke from on 09-10.

- **MC-12's Instagram Story and MC-13's Instagram feed post are queued correctly
  but need `social.js run --execute` run again at their actual moments — nothing
  currently does that automatically.** (09-07, PR #471) Both are `state=approved`
  with real art; `social.js plan` confirms they're just not due yet, not stuck:
  MC-12's Story fires at 6:30 PM today (09-07), MC-13's Instagram post at 9:00 AM
  tomorrow (09-08). Facebook can be scheduled minutes ahead of time because Meta
  holds the scheduled post; Instagram cannot (no scheduling parameter exists), so
  its container can only be created once the slot actually arrives, within a 6h
  grace window after — this is why MC-09 and MC-10's Instagram legs upstream of
  this entry were permanently missed (nobody ran the publisher within 6h of their
  slots). **Next step: run `node scripts/social.js run --execute` again after each
  of those two times** (see `[[meta-tokens-live-in-shell-env]]` for the env vars
  it actually needs in this shell), or decide this needs a real recurring
  scheduled task rather than relying on a session happening to be open at the
  right moment — worth asking Taylor rather than building one unprompted, since
  it would be new standing infrastructure that also runs `--execute` live.
  **Separately, MC-12's Facebook leg is structurally blocked, not just
  unscheduled:** its only two source-art files are both 1080x1920 Story frames
  (confirmed in `~/OneDrive/SparkDate/SourceArt` — no square export was ever
  made), so `lib/social-publish.js`'s feed-shape guard correctly refuses it
  every time `run` executes. **Needs a real 1080x1080 export from Taylor/design
  before this leg can ever go out**, or a decision to leave MC-12 Facebook-less.
  **RESTORED AND CLOSED 09-08.** This entry was deleted by accident by the 09-08
  Loxleys session — an edit that replaced the span between its own entry and the
  next one swallowed this bullet, and #482 merged the deletion before anyone
  noticed. Recovered verbatim from `a5020a3b`. Everything above is the 09-07
  text; everything below is what is actually true now.
  - **Both rows are DONE.** MC-12 `state=posted`, ids for `fb`
    (`1139242662602769_122122424685340130`) and `ig_story`
    (`17906442375520962`). MC-13 `state=posted`, ids for `fb`
    (`122119894995340130`) and `ig` (`17970315816132176`), recorded by
    `github-actions[bot]` in `8175af27` at 13:45 UTC on 09-08.
  - **"MC-12's Facebook leg is structurally blocked" is retired.** The
    feed-shape guard was right and the fix was art: Taylor exported
    `MC-12FB_1of2.png` / `MC-12FB_2of2.png` into `SourceArt` at 10:28 on 09-07,
    and it published.
  - **The premise of this entry's "next step" was WRONG, and that is the part
    worth carrying forward.** It said "nothing currently does that
    automatically" and proposed asking Taylor whether to build a recurring
    scheduled task. **That task already existed** —
    `.github/workflows/social-publish.yml` has run `node scripts/social.js run
    --execute` on a `*/15 * * * *` cron since #215, and it is what published
    MC-13 unattended. Nobody needed to be at a keyboard.
    **So why were MC-09/MC-10's Instagram legs really missed?** Not absent
    automation — the corrupted `content/queue.csv` documented elsewhere in this
    file: dates round-tripped through a spreadsheet into M/D/YYYY, which the
    publisher cannot parse, so no row was schedulable until #471 fixed it.
    **Nothing to build. Close this thread.** See
    [[check-for-existing-system-first]] — this is that failure exactly, and it
    cost a proposal to build something that shipped months ago. *(09-08)*

- **§8.3 vs the women-only 2-for-1 — REVIEWED 09-10 at Taylor's ask; the
  decision is still his.** `reports/TWO_FOR_ONE_TO_EVERYONE_2026-09-10.md`.
  His question: *if we advertise it to all people do we get more women?* Answer
  from the account's own delivery data: no. Every broad cold sales cell spent
  60–68% on men; a women-locked cell lands 2.7× the women per dollar at the same
  cost per woman ($1.64 vs $1.61); men click the 2-for-1 creative as readily as
  women and produced its only attributed purchase; the +1 mirrors the buyer 7/7
  (09-08 Firestore figure, quoted). Recommends a carve-out (report §6, option
  A): one women-locked cold ad set, gender expansion off, as the only home for
  the 2-for-1; retargeting stays broad; §8.3 points 2 and 4 retired. Option B is
  an A/B if he wants it measured rather than ruled. **Nothing changed** — no §8,
  `brand.json` or live ad set edit. Firestore was NOT re-read (the production
  env pull was blocked in-session). **Next step: Taylor picks A or B. Then ONE
  PR: rewrite §8.3, fix `brand.json` `_no_gender_axis` (it says the female ad
  set "no longer exists" — it is live), and add the assertion to
  `scripts/meta-ads-review.js` that a 2-for-1 ad with women's share of spend
  under 97% fails loudly.** *(09-10)*

- **Loxleys retargeting went LIVE 09-08 — first spend since the shell was created
  2026-08-17. Three things to check, then it retires with the event.**
  **Next steps:** (1) confirm `LX-RT-PATIO` reached ACTIVE rather than
  DISAPPROVED — it was `IN_PROCESS` (Meta review) when this was written;
  (2) watch its FREQUENCY, the number that killed Marion Court's equivalent
  (11.7 lifetime, $103.04, zero purchases) — anything trending past ~3 on a pool
  this size is the same failure starting; (3) delete Marion Court's two now-dead
  `acknowledged` entries in `content/paid-campaigns.json`, that event having
  expired 09-08. What was done:
  Video audience `120251341306880542` created by API from the four LX dark-post
  reels; ad set `120250964028400542` lost an inherited `flexible_spec`
  (`relationship_statuses:[1]`, ~78% of reach, measured) and gained both
  audiences; ad **`LX-RT-PATIO`** (`120251342754360542`) built from the art
  Taylor delivered at 08:58; `content/paid-campaigns.json` migrated from one
  legacy `LX` entry to two `playbook: "v2"` entries (cold/retargeting, shared
  `total: 180`); ladder executed at the §8 Build split — **cold $9.00 -> $5.11,
  retargeting paused -> $3.40**, all three objects un-paused. 0 ungoverned.
  Remaining across both legs $137.41 vs the legacy ladder's $152.99, so the run
  got cheaper. `scripts/meta-launch-lx-retargeting.js --go-live` is idempotent and
  safe to re-run. Full write-up incl. what was NOT verified:
  `reports/LOXLEYS_RETARGETING_LAUNCH_2026-09-08.md` (#482).
  Retire this entry after 2026-09-22. *(09-08)*

- **DECIDED (09-06): Business Plan documents (financial models, the IP
  assignment agreement, legal analysis, the investor pitch deck, ~50 files)
  are untracked going forward; history is deliberately left alone.**
  They'd been tracked in this repo's git history, on a PUBLIC repo, since
  before the 07-15 reorg moved the working copies into subfolders without a
  `git mv` — found while making sure those new subfolder locations didn't
  also get committed. Taylor's read, having looked at the actual content:
  mostly a financial model and a routine founder-to-LLC IP assignment,
  "not very sensitive." **`git rm --cached` untracked all ~50 in this PR**
  (files stay on disk, nothing deleted) and `.gitignore` now denies
  `Business Plan/files/*` by default — the reorg subfolders and any future
  addition are covered too. Two files kept tracked on purpose:
  `Night Tasks/run-nightly-claude-code.ps1` and `REVIEW_PROMPT.md` (plus
  `TONIGHT_PROMPT.md` and `review-nightly-reports.ps1`) are the nightly
  automation's own scripts, not business documents — same reasoning as any
  other tracked script. **This does NOT remove anything from history** —
  every old commit still has the old content, and always will unless
  someone runs a history rewrite (`git filter-repo`/BFG) plus a force-push
  that every clone, worktree and open PR would then have to reconcile
  against. Not done, and not needed given the sensitivity call above. If
  that call ever changes, that's the next step — nothing further needed
  otherwise. *(09-06)*
- **~~The main checkout is behind `origin/main` with uncommitted edits on
  top~~ — CLOSED 09-08.** Pulled and now clean: `0 0` against `origin/main`,
  full suite green there (1141 at the time). Nothing was discarded on
  assumption — each of the seven files was checked against main first.
  `.gitignore` had **zero** lines main lacked; `HANDOFF.md`'s 27 local-only
  lines were 09-05 entries later sessions had already resolved and deleted;
  `content/queue.csv`'s 47 were the M/D/YYYY spreadsheet corruption #471 had
  already rebuilt. Four untracked files (`women-outreach.md`,
  `women-surfaces.json`, `build-outreach-pack.js`, `outreach-pack.test.js`)
  looked like genuinely unpushed work and were **not** — byte-different but
  content-identical to main, which is the line-ending trap in the next entry.
  All seven were backed up before removal. The plaintext Meta token file
  (`Business Plan/files/curl -X POST httpsgraph.facebook.co.txt`) is no longer
  on disk. *(09-08)*
- **`core.autocrlf=true` and NO `.gitattributes` — nothing pins line endings in
  this repo, and it has already corrupted `content/queue.csv` once.** Git
  converts LF to CRLF on checkout here, so a working-tree file is
  byte-different from its own committed blob. #471's queue.csv rebuild names
  "caption newlines turned to `\r\n`" as part of what it had to undo, and the
  publisher requires exact formatting — so `queue.csv` is the file that
  actually breaks, not a cosmetic concern. The same conversion makes a raw
  `diff` report an identical file as 100% changed, which cost this session two
  false alarms on 09-08, both in the alarming direction ("this holds unpushed
  work" when it held none). **Next step, Taylor's call because it renormalises
  the working tree: add a `.gitattributes` with `* text=auto eol=lf`, or at
  minimum `*.csv text eol=lf` to protect the queue.** Deliberately not done
  here — a repo-wide renormalisation is not something to slip into a handoff
  PR. Memory: `file-comparison-lies-on-this-machine`. *(09-10)*
- **A concurrent session's merge silently reverted an already-merged
  correction, and neither CI nor GitHub's own conflict check caught it.**
  Merging this handoff PR against PR #463 (merged first) found the Ticket
  Tailor / free-listing-surfaces entry below — corrected by #426 earlier the
  same evening — had reverted to its stale pre-#426 text. #463's own PR body
  never mentions touching that entry; its commit message documents a
  *different* stale-checkout problem the same evening (for a gitignored
  file, unrelated to this one), consistent with #463 having branched from a
  main checkout that predated #426 and carrying that section's old content
  through untouched, which a squash merge then applied over #426's fix
  without flagging a conflict — only one side's change was deliberate, so
  there was nothing for git to flag. Restored the correct text here rather
  than trusting `main`'s state at face value. **No general fix built** — flagging
  as a pattern: a squash-merge touching a heavily-churned file like this one
  can silently carry stale content on lines nobody meant to change, and nothing
  in this repo's CI checks for that. *(09-06)*
- **Both the ladder AND the campaign-builder now build the new playbook —
  the old shape is gone from this codebase's tools, not merely superseded.**
  Taylor, 09-06, verbatim: *"I don't want to retain the old shape fyi. I want
  the new playbook for go forward."* `reports/ADS_OBJECTIVE_GAP_ANALYSIS_2026-09-06.md`'s playbook
  (§8) found OUTCOME_TRAFFIC produced zero purchases across $740.23 lifetime
  spend and that heavier women-targeted ad spend correlates with a WORSE
  actual women's ticket share, plus a live delivery failure independent of
  that correlation — Marion Court's women-only ad set is spending ~4% of its
  assigned budget. **Built and offline-tested (22 new cases,
  `tests/budget-ladder.test.js`):** `content/brand.json`
  `paid_template.playbook_v2` — two campaigns per event (cold, retargeting),
  OUTCOME_SALES, broad targeting only, a cold:retarget split that VARIES by
  phase (80/20 Seed → 60/40 Build → 35/65 Close), a $2.00 floor-priority rule,
  and the cold-start rule for a runway shorter than 21 days. `scripts/
  budget-ladder.js` computes it (`phaseWindowsV2`, `roleRates`, `rateFor`
  dispatching on a registry entry's `playbook: 'v2'` field) with ZERO change
  to the legacy path Loxleys' live campaign depends on — same 28 legacy tests
  still pass, `--check`/`--forecast` against the real live registry print
  byte-identical output to before. **Correction to what this entry said when
  first written:** it claimed `content/paid-campaigns.json`'s `share` field
  already supported a Cold+Retargeting split with no change needed. Wrong —
  `share` is one flat fraction applied to every phase alike, and the
  playbook's split varies BY PHASE, which a flat fraction can't express. v2
  registry entries use `role` (`"cold"`/`"retargeting"`) instead — both
  `_fields` and `_playbook_ref` in `paid-campaigns.json` now say so. Also
  fixed in the same pass: `scripts/meta-budget-ladder.js`'s `printLadder`
  would have printed NaN for a v2 entry's ladder table (it called the legacy
  `rowRate()` against rows that don't carry a legacy `share`/`days` shape) —
  caught by an actual dry run against a scratch `--registry=`, not by the
  offline tests, since printing isn't part of what they cover.
  **`scripts/build-paid-campaign.js` is rewritten, same session, once Taylor
  said the line above.** It no longer knows how to build the legacy shape at
  all — no flag reverts to it. `--execute` now builds TWO PAUSED campaigns
  (`<Event> | Cold`, `<Event> | Retargeting`), each with one broad ad set,
  reusing the exact field values `scripts/meta-create-lx-sales-campaign.js`
  already proved live on 2026-09-05 (pixel `4390442851170732`,
  `OFFSITE_CONVERSIONS`/`PURCHASE`, 7-day-click+1-day-view attribution,
  `advantage_audience: 0`) plus the same read-back verification that script
  used to catch Meta silently enabling gender expansion server-side. Dry-run
  verified against Loxleys' real event (plan only — nothing was created
  against the live account): correct output at the default 21-day runway,
  correct cold-start skip at `--runway=10`, and a clean refusal from
  `--captions`/`--handoff` rather than rendering the retired female/male ad
  copy against a shape that no longer has those ad sets. **Not yet done:**
  new broad-targeting ad copy to replace the retired templates — nothing
  writes ads yet either way, so this only blocks the day someone attaches
  creative, not before. **Loxleys itself is untouched, on purpose** — its
  live campaign stays on the legacy fields in `paid_template` until it
  retires 2026-09-22 (rebuilding it now risks a cold-start at the worst
  time); those fields are wind-down scaffolding now, not a second supported
  shape, and are safe to delete once that entry retires. Also still
  unreconciled, smaller: the playbook's 73%/37% final-14/7-day sales-curve
  figures were cut across all 6 events including 2 still selling, while
  `paid_template._measured` deliberately used only the 2 completed events to
  avoid exactly that censoring bias — both currently read close (73% vs ~76%)
  but were never formally cross-checked. *(09-06)*
- **`status: 'full'` is a SOFT close — answered and shipped, do not re-raise.**
  Taylor, 09-06: *"I'd like it to be soft close, a lot of these venues could
  utilize more people."* The flag means stop advertising, not refuse money. The
  three client surfaces honour it (off the grid, checkout swapped for the
  waitlist, `/api/next-event` stops promoting); the purchase endpoint
  deliberately does NOT, so a direct link, a stale tab or a host putting a
  walk-up through still completes. A hard block was written in #456 and reverted
  before it shipped, and a test now pins its absence so a later parity pass
  cannot re-add it. A hard close, if ever wanted, needs its own flag
  (`status: 'closed'`) so the soft one keeps working. Capacity is still enforced
  server-side and remains the real backstop. *(09-06)*
- **The #453 audit's queue is closed but not empty.** All 100 findings that had
  never been checked now have a verify verdict (52 confirmed, 43 rejected, 5
  split), but the usage limit cut the second adversarial lens short on the last
  batch, so some "confirmed" carry one lens instead of two. Four findings also
  sit outside that queue (196 − 92 verdicts = 104; the resume queue held 100).
  Everything acted on in #456 was re-read by hand first; the rest was not.
  **Next step: nothing, unless someone wants the tail — the raw verdicts are in
  the run journal named in the report, and the confirmed-but-unfixed ones are
  content and layout decisions, not defects.** *(09-06)*

- **The nightly's data pull runs from the MAIN CHECKOUT's working tree, while its
  analysis cuts from `origin/main`.** So merging a change to
  `scripts/fetch-ga4-tables.js` does nothing until someone runs `git pull` there.
  This cost a whole run on 09-04: a change landed taking the pull 28 → 46 tables,
  the re-run still wrote 28, and the report was written by current code against
  stale data with nothing in the log saying so — exit 0, PR opened. **Fix not built:** have the launcher
  fast-forward the checkout, or run the pull scripts out of the nightly clone, so
  steps 1-3 and step 6 cannot disagree. Memory:
  `nightly-pulls-from-stale-main-checkout`.
- **Two Google Ads questions are Taylor's alone, in the Ads console, not code.**
  (1) `Website traffic-Search-1` spent **$35.35 for ZERO attributed sessions**
  while the 20 sessions GA4 credits to Google Ads carry no campaign and no cost.
  (2) An unreplaced `<campaign-name>` tracking-template placeholder is carrying
  **41 key events**. Cause untested for both — auto-tagging off, an off-property
  destination URL, and gclid stripping all fit the data. The tables state the
  fact and no cause; do not let a report assert one.
- **Taylor: bump `ANALYTICS_CONTEXT.md`'s `Last updated:` to 2026-08-28.** It
  says 08-26, its mtime is 08-28, and it contains a section headed "SPLIT
  2026-08-28". Under the rule in the stamp-check PR that is a TRUE positive and
  clears once bumped — the old rule compared the stamp to the newest nightly
  report, which is regenerated daily, so it fired every night by construction and
  had consumed seven consecutive NEEDS-TAYLOR-INPUT slots.
- **One line to redact:** `scripts/fetch-ga4-tables.js` carries a real Stripe
  payment-intent id in a comment, in a public repo. Not a credential and not what
  #434 was about, but needless. Fold into the next PR touching that file.
- **The paid path is rebuilt on main (09-03; `reports/PAID_FUNNEL_AUDIT_2026-09-02.md`
  §7 items 1–6) and the 2-for-1 is OPEN TO EVERY BUYER, advertised to women only
  — Taylor's call, 09-02 evening, on legal grounds; never gate it by gender again.**
  Two things remain, neither code. (1) **Taylor, in GA4 Admin → Custom
  definitions:** register event-scoped `field`, `skipped_details`,
  `page_started_hidden`, `started_hidden`. The Admin API is disabled on this
  project, so it is a UI click; until it is done `checkout_field_started` and
  the ghost-session split read `(not set)`. (2) **After 09-08, audit item 4:**
  three ads in one Loxleys set, same creative,
  `/lp?eventId=KL4onXm7hJbqiwI9quAZ`, `/events?event=KL4onXm7hJbqiwI9quAZ&checkout=1`,
  `/event?id=KL4onXm7hJbqiwI9quAZ`, url_tags via `scripts/ad-utm.js`. Still
  never done by anyone: **buy a real ticket through the new `/lp` form from
  inside the Instagram app** — the one test that settles the webview question.
- **~~Marion Court is hands-off~~ — SUPERSEDED 09-05 by Taylor's instruction.**
  Its Traffic campaign is now PAUSED and a Sales campaign runs in its place; the
  retargeting set was left untouched exactly as this entry asked. The rest of
  the entry still holds for what remains running:
  Four ad changes went live 09-02 (`reports/META_ADS_REVIEW_2026-09-02.md` §10)
  and the pixel was attached to the two Traffic ads; both campaigns are in
  learning and each edit restarts the clock. Two remaining items are deferred BY
  DECISION, not forgotten — the retargeting set's missing site-visitor audience,
  and the Traffic ads' shared `utm_content`, which cannot be fixed on a live
  creative. Do not re-raise them as findings. MC-RT-QUANG and MC-RT-NO-SCORECARDS
  stay running for the data; do not pause them as tidy-up.
- **Both live events are now on a SALES objective and every Traffic campaign is
  paused (09-05).** This closes the "objective question asked and never
  answered" entry that sat here since 09-04. Taylor directed it; the analysis
  that preceded it is `reports/META_ADS_ROOT_CAUSE_2026-09-04.md`. Live now:
  `Loxleys | Sales` ($2.00/day, stops 09-22), `Marion Court | Sales`
  ($10/day, stops 09-08), `Marion Court Retargeting` (untouched, $6/day).
  `Loxleys | Traffic` and `Marion Court | Traffic` are PAUSED.
  **Two things the next session must NOT re-derive.** (1) The objective's
  evidence changed: on *purchases* it is p=0.224 and worthless, but on
  *initiate_checkout* — 44 events instead of 6 — it is p=8e-18 and reproduces
  inside Instagram Stories and Facebook feed separately. Use the checkout
  endpoint. (2) **Placement was REFUTED as a lever** and my earlier
  recommendation to restrict it is withdrawn: Instagram's clicks arrive BETTER
  than Facebook's, and the in-app browser is a browser effect (FB app 71.5%,
  IG app 74.0%, p=0.31), not a placement one. Only Audience Network is
  genuinely bad. Memory: `automatic-placements-buy-stories`. *(09-05)*
- **`Marion Court | Sales` is a T-3 hail mary and must be scored as one.** Built
  09-05 on the 2-for-1 female creative because Taylor asked for women's sales.
  It has ~3 days minus review, and `purchase` had ZERO events in the prior 7
  days against the ~50/week Meta wants, so it will not leave the learning
  phase. **Judge it on whether women reach checkout, never on purchases** —
  there will be far too few to read. It also carries the first correct tags on
  a Marion Court ad (`mc_close_female_bringafriend`, CTA `LEARN_MORE`); the
  live MC Women ad still carries `proof_rsa1` and `BOOK_TRAVEL` frozen in.
  *(09-05)*
- **The budget ladder takes as many campaigns as you register, and it is now
  loud about the ones you do not.** The hardcoded `CAMPAIGNS` array is gone;
  the list lives in `content/paid-campaigns.json`, the arithmetic in
  `scripts/budget-ladder.js` (offline-tested, `tests/budget-ladder.test.js`),
  and any campaign that is ACTIVE in the account but in neither the registry
  nor its `acknowledged` list is reported as UNGOVERNED with a non-zero exit.
  One account-wide daily ceiling ($40) now covers all runs at once — today the
  account reads $22.00/day, $2.00 laddered plus $20.00 outside it.
  **Three next steps.** (1) **Taylor: `git pull` in the main
  checkout** — the 03:00 `SparkDate Budget Ladder` task runs `npm run
  ads:ladder -- --all --execute` from there, so this merge does nothing until
  it does (same flaw as the nightly's data pull, first entry above).
  (2) ~~Tellus Oct 6 needs a brand.json event entry before it can be
  registered... blocked on facts nobody has written down~~ — **wrong, corrected
  09-06.** The event was already fully specified in Firestore (event_id
  `h0F0ppRfqkNLyFXix9m7`, created 09-05: date, venue, both prices and the
  early-bird cutoff all present) at the moment this was written — found by
  querying Firestore directly rather than trusting the site's
  `/api/next-event`, which only ever returns the *soonest* event and so never
  surfaces a later one. Added as `brand.json` event key `TL2` this session.
  **Asked Taylor whether to build the Meta campaign (paused) now — answer: not
  yet, no creative assets exist for this event.** That was the real blocker,
  and stayed the ONLY one: the campaign-mechanics half (`paid_template`'s
  gender ad sets, flagged stale the same day this was written) is resolved
  as of `playbook_v2` and the rewritten `scripts/build-paid-campaign.js` —
  see the `playbook_v2` entry above. `node scripts/build-paid-campaign.js
  --event=TL2 --execute` now builds both campaigns (Cold, Retargeting;
  broad, no gender split) directly, the moment creative exists. The one-day
  early-bird/budget-step mismatch this entry originally flagged against the
  LEGACY model (early bird ends T-14, budget step at T-15) does not recur
  under `playbook_v2` — its Seed/Build boundary spans T-15..T-14, so TL2's
  T-14 cutoff lands cleanly inside it. Nothing to fix there; noted so it
  isn't re-flagged as a live problem.
  **Narrowed 09-07: "creative" was two things, and only one is still
  missing.** The SPEC half is done — `playbook_v2.creative` now holds the
  finished copy (three women's testimonials, referenced by id, no price by
  rule), `scripts/build-paid-campaign.js --event=TL2 --handoff` renders it as
  a Claude Design brief, and `scripts/ad-utm.js` computes the v2 tags. What is
  still missing is the ASSETS: six ads from three videos, 1080x1350 /
  1080x1080 / 1080x1920 plus thumbnails, which Claude Design has not built. So
  the blocker is now "no video files", not "no plan for what the ads say".
  **Next concrete step: run that `--handoff` command, hand the brief to Claude
  Design, and put the returned files somewhere the attach step can read.**
  Two things after that, neither done: `--execute` builds structure only and
  attaches no ads, and the account's one proven attach path
  (`scripts/meta-create-lx-sales-campaign.js`) is hard-coded to Loxleys'
  retired gender ad sets — a v2 attach script reusing its request shape does
  not exist. And nothing may go live without Taylor's word, per
  `confirm-before-new-live-campaign`. *(09-07)*
  **Re-verified 09-10, and there is a DATE on it now: Seed starts 2026-09-15.**
  `node scripts/build-paid-campaign.js --event=TL2` puts Seed 09-15..09-21
  ($8.00/day cold, $2.00 retarget), Build 09-22..09-28, Close 09-29..10-06,
  with the early bird ending 09-22 = T-14, cleanly inside the Seed/Build
  boundary. Checked against `origin/main` today: still **zero** `TL2` assets in
  `public/social/` and still **no TL2 entry** in `content/paid-campaigns.json`
  — so the first ad dollar is due in five days against creative that does not
  exist. This is the PAID side only; Eventbrite is live and selling (0/30) per
  the TL2 entry at the top of this file, and the ORGANIC calendar is being
  built in a separate chat as of 09-10 — do not duplicate it. *(09-10)*
  (3) **Both Marion Court acknowledgements expire 09-08** and
  will start reporting themselves as stale the next morning; retire them with
  the event. *(09-06)*
- **The "scrambled email UTM" ask is CLOSED — it was never an email-platform
  problem, and the report that closed it 404'd its own fix.** PR #449
  escalated it twice as needing the email vendor's send history. It decodes
  with a one-line cipher (a–f shift +1, g–z ROT13) to `Lancaster | Master
  List / email` — LNP | LancasterOnline's events newsletter, powered by
  Evvnt, where Taylor submitted both events on 09-02. GA4 carries the SAME
  channel twice, obfuscated (129 sessions) and plaintext (7): the 129 fired
  **zero** `view_item`, the 7 fired 6. **Taylor's fix, in the Evvnt
  dashboard: set each event's ticket URL to `sparkdate.date/l/lx-
  lancasteronline` and `/l/mc-lancasteronline`.** Those two links work —
  confirmed by loading each and reading the event title/date/venue/price out
  of the DOM, not just a `curl` 200 (see memory
  `lancasteronline-is-the-biggest-free-channel` for why a 200 alone doesn't
  prove it on this site). **What went wrong first:** the report printed each
  link with its destination on the next line starting `->`; copying both
  lines together mangles the URL into something the router correctly 404s.
  Taylor hit exactly this. Fixed in `reports/GA4_DEEP_READ_2026-09-06.md` and
  its artifact (commit `e6cc9513`, merged via #455) — the links now stand
  alone with an explicit warning not to paste the destination alongside them.
  Re-check in a week: `lancasteronline / listing` should show non-zero
  `view_item`. **The nightly GA4 report (PR #460, run by hand after the
  02:00 job hit a session limit) independently repeated the same wrong
  framing as a "3rd ask" — it never read this file. Caught by Taylor in
  review, corrected in place via PR #461.** Memory
  `always-check-memory-before-an-nth-ask` has the process fix: check
  `HANDOFF.md` and memory before writing any repeat-ask item, not just
  increment the counter. *(09-06)*
- **The nightly's depth problem is fixed in code, not in exhortation, and the
  first run under the new rules is tonight's 02:00.** Taylor, 09-06: the reports
  "are basically half a page and they really don't have great insights" — no
  traffic summary, no events summary, nothing on UTM gaps, against 46 tables
  pulled nightly (the 09-05 report read ~15 and named seven more as "skimmed").
  `scripts/ga4-nightly-summary.js` now computes the standing floor and prints a
  **coverage ledger naming every table and whether it was used**;
  `.claude/commands/nightly-ga4.md` makes TRAFFIC / EVENTS / UTM GAPS
  non-omittable and requires a numbers block in the PR body. **Partially
  validated already:** the 02:00 09-06 run itself hit a session limit before
  writing anything, so it was re-run by hand (PR #460) — that run used the
  new script and format end to end, hit 46/46 coverage, and the PR body
  carried numbers. That is not the same as an unattended pass, though: it
  also caught, in a fresh worktree, that the `Skill` tool served the OLD
  pre-#455 version of `nightly-ga4.md` from a stale main checkout (memory
  `nightly-pulls-from-stale-main-checkout`) — an interactive session has to
  notice and override that; an unattended one in the dedicated clone does
  not hit it. **Next step unchanged: read the 09-07 nightly PR** (the first
  genuinely unattended run under the new rules) **and check the ledger says
  46/46 and the body carries numbers.** If a run skips the script, that is
  the thing to fix, not the prose. *(09-06)*
- **The NIGHTLY RUN LOG never got tonight's 09-06 entry — a worktree-isolated
  session cannot write it, and someone needs to paste it in by hand.**
  `Business Plan\files\Night Tasks\sparkdate-nightly-claude-code-prompts.md`
  is gitignored, lives only in the main checkout, and both `Edit`/`Write` and
  compound `Bash` refuse any path there from inside a worktree ("Edit the
  worktree copy of this file instead" — except gitignored files have no
  worktree copy to redirect to). Memory `worktree-blocks-crosscheckout-writes`
  has the general rule. **Next step: from the main checkout (not a worktree),
  prepend this under the `## NIGHTLY RUN LOG` heading:**

  > - **2026-09-06 (local CLI run, interactive, recovering the 02:00 run that
  >   hit a session limit at 02:13)** — branches `worktree-ga4-nightly-manual-
  >   run` then `fix/ga4-2026-09-06-lancasteronline-retraction`, merged as
  >   #460 then #461. **HEADLINE:** sessions/users held (+10%) but
  >   purchasers/key events/transactions/revenue all fell ~33% w/w — two
  >   dated mechanisms, neither demand: a Facebook-tag fragmentation
  >   artifact from Loxleys' new campaign (already fixed via #450/#451), and
  >   an unexplained Eventbrite session cliff on 09-01. **ALSO:** caught and
  >   fixed a false "$14.46 accruing" Google Ads figure from a script bug
  >   (real: still dark since 07-24). **CORRECTED (#461):** first version
  >   wrongly re-asked the already-closed "scrambled email UTM" question as
  >   a 3rd ask — Taylor caught it; real cause was the LancasterOnline/Evvnt
  >   listing link, already fixed. **NEEDS TAYLOR INPUT (0):** none.
  >   **RETIRED:** the scrambled-UTM ask, for real this time.

  *(09-06)*
- **D3 is fixed: GA4 now has a Channel Group so `medium=listing` stops
  filing under Unassigned. Nothing left to do.** `reports/GA4_DEEP_READ_2026-
  09-06.md` flagged it as Taylor's call — `content/listing-sites.json`
  deliberately rejected `referral` as the medium (GA4 auto-assigns `referral`
  to any uncontrolled inbound link, so a hand-tagged listing would drown in
  it), which is exactly why GA4's Default Channel Group has no rule for
  `listing` and dumps it all into Unassigned. Taylor: "you do this." Built
  and saved live in GA4 Admin → Data display → Channel groups: **"SparkDate
  Channels"** — a copy of Default Channel Group plus one new rule, `Event
  Listings` = Session medium exactly matches `listing`. Confirmed against
  real data: the Traffic acquisition report, both groupings side by side,
  splits the old 283-session Unassigned bucket into 160 still-Unassigned and
  **123 sessions / $97.96 (16.91% of all revenue) now labeled "Event
  Listings."** This only changes GA4's own native reports —
  `ga4-nightly-summary.js` already parsed `eventbrite/listing` straight from
  source+medium and is unaffected. Data API dimension name for reference:
  `sessionCustomChannelGroupingSlot01`. *(09-06)*
- **Two Loxleys Traffic campaigns exist and only one carries the Single
  filter.** Pulled live 09-04 20:15: `Loxleys | Traffic` (`120251085229290542`)
  is ACTIVE at $3/day with **no `flexible_spec`**, while `Loxley's | Traffic`
  (`120251072593050542`) is PAUSED at $10/day **with
  `relationship_statuses:[1]`**. The active one matches the ladder in memory
  `lx-campaign-live`, so this reads as an intentional replacement rather than a
  duplicate — but it is why `single-filter-costs-80-percent` can say "Loxleys
  does not carry it" and a glance at the account can suggest otherwise. **Next
  step: confirm the paused pair is dead and archive it, or say why it is
  being kept, before the 09-22 retirement.** *(09-04)*
- **The score comes 09-09, not before.** ~~both Traffic sets still optimise
  `LINK_CLICKS`~~ — no longer true as of 09-05, both are PAUSED and the live
  campaigns are `OUTCOME_SALES`. Run `npm run ads:review` and read **purchases
  by gender per ad**, never landing-page views. Note the new ad sets carry a
  7-day click window; the paused ones were frozen at 1 day, so the two are not
  measured on the same instrument.
- **The UTM convention is enforced at BUILD time now (#411); its first real use was the three
  creatives built 09-05, not the Sep 8 retargeting.** `scripts/ad-utm.js` computes
  the tag from brand.json and refuses what GA4 cannot split;
  `tests/ad-utm.test.js` gates it with no token, which `ads:lint` never could.
  When those creatives are built, import `urlTags` and let it fail rather than
  typing a tag. Nothing live is retagged — `url_tags` is frozen at creation.
- **Taylor must pause the Cowork nightly task himself; nothing in the repo can.**
  Until then Cowork and the local run both fire and race for one branch name.
- **~~Loxleys is next, held for its own chat~~ — done 09-05, rebuilt on a sales
  objective.** Its retargeting is still unbuilt and the entry below still
  describes why that is by design: Its budget ladder is deliberate
  (memory `lx-campaign-live`) and the event is 09-22, so none of Marion Court's
  six-day pressure applies. Its retargeting is meant to be built at the Sep 8
  ladder step — the paused campaigns and unattached audience are by design.
- **Eight venue-outreach emails sit in Taylor's Gmail Drafts, unsent by his own
  choice (09-02).** Beer gardens and rooftops, per the revised criteria and the
  nine verified contacts in `Business Plan/files/Venue_Outreach_Package.md`. Two
  steps are his alone: **check the From line** — the signature says
  `hello@sparkdate.date`, and if that is not a send-as alias on that account all
  eight leave from his personal Gmail contradicting their own signature; and
  **Uptown Beer Garden is phone-only, (267) 639-4493** — 700 standing, the best
  room on the list, no published email anywhere. Yards and Silk City came from the
  old scraped CSV and are unverified; expect bounces.
- **That outdoor list expires with the season — late October, ~8 weeks from 09-02.**
  Cherry Street Pier, Frankford Hall and Evil Genius are the covered/year-round
  three that survive it. Independence and Morgan's Pier are already written as
  spring approaches rather than October fills; do not "fix" them back.
- **The F&B model files were relabelled, not recomputed.** `$1,400` still feeds
  net-profit per event, the `$10,000/month` venue figure and the `$11,200`
  eight-event total, all assuming a mid-tier room — while the new target list is
  casual tier (~$20-25/head). Taylor's decision to make, not a copy fix. Working:
  `reports/VENUE_PITCH_FACT_AUDIT_2026-09-01.md`.
- **Eleven free listing surfaces exist; nobody has confirmed the last eight
  landed.** Verified from outside: Eventbrite pricing and copy, and the
  Facebook, Google Business and AllEvents listings. NOT verified: the eight
  remaining calendars (LancasterOnline, LancasterPA, both Visit Lancasters,
  Fig, Nextdoor, Patch, Chamber) or the Meetup post to our own group.
  **Next step: open each claimed listing and read the actual `href` of its
  ticket link.** Do not trust a report that says it saved one — AllEvents
  HTML-escaped the ampersands and Discover Lancaster truncated at 100 chars,
  both silently, which is the entire reason `/l/` short links exist.
- **Ticket Tailor is abandoned, and two live pages still say "Sold out".**
  Both events posted 09-02, then held unsold — which makes Ticket Tailor title
  the page `Sold out – <event>` and emit `"offers": []`, defeating the only two
  reasons to be there. Taylor stopped 09-03: the dashboard wants a password he
  does not have, and the channel does not justify recovering one. **No action
  needed.** The pages are unlinked, in no sitemap, and both events pass by
  09-22, after which the titles are moot. If anyone ever wants it closed:
  reset the password and unpublish both — do NOT "fix" it by turning sales on,
  which reopens the third-checkout and nothing-syncs problems. Full finding in
  the `tickettailor` entry of `content/listing-sites.json`.
- **Philadelphia is quoted at $24.99 in a $29.99 market.** The city page and
  two Philly-targeted blog posts state a flat price; Good Good Things was
  $29.99. `reports/FACT_AUDIT_2026-09-01.md` §2. Deliberately not edited: the
  fix is a decision — stop quoting a number and point at the event page, or
  commit to maintaining per-city ones. First is cheaper to keep true.

## Open threads nobody owns

- **The door records the same person twice, and the existing audit cannot see
  it.** Confirmed at Good Good: two of twenty attendees held both a ticket
  marked absent and a door-created registration marked present.
  `scripts/audit-duplicate-attendees.js` groups by **email** and found neither —
  the door's email lookup missing is what creates the second account, so
  grouping by email cannot detect its own failure mode. Needs matching on more
  than an exact email. Full case: `reports/EVENT_DEBRIEF_GOOD_GOOD_2026-08-31.md`.
- **Someone issued a free Eventbrite ticket type for women.** It produced three
  of four female registrations at Good Good. Nothing in this repo created it or
  can see it — `isComp` is false on all of them. Who set it up, and is it still
  live for the next event?
- **An Eventbrite listing dated 2026-08-10 is refused by every sync run, and
  nobody has checked whether it holds buyers.** "SparkDate — Good Good Night @
  Good Good Things Philly (2026-08-10)" matches no event doc, so the sync skips
  it rather than guess — correct, and still refusing as of the 09-02 03:20 run.
  Our Philly doc is dated 08-31 under a *different* EB id (1994945955054), so
  this reads as a rescheduled or duplicate listing. If anyone bought on it and
  never transferred, they exist in no ticket, registration or lead record.
  Needs `EVENTBRITE_TOKEN` to count attendees; then either point the 08-31 doc
  at it, or confirm it is empty and leave it.
- **The 02:00 task can now catch up and wake the machine, but still will not
  wait for a network.** Taylor set `StartWhenAvailable` and `WakeToRun` to True
  in an elevated shell on 09-04, which closes the "8 of 23 nights never ran"
  hole. `RunOnlyIfNetworkAvailable` is still `False`, which is what made the
  08-29 run fail both network steps 14 minutes after a boot. Same elevated-shell
  fix, one more setting.
- **No woman's testimonial exists in any LIVE ad** — still true of the account,
  but the two reasons this entry gave are both gone. "Someone has to ask an
  attendee" was overtaken on 09-04: Helesha, Anonymous M. and Molly are in
  `brand.json` `universal.approved_testimonials`. And "for the women's prime"
  names an ad set `playbook_v2` retired — under the new playbook the answer to
  reaching women is creative inside the BROAD ad set, not a women-only one
  (report §8.3). As of 09-07 all three quotes are written as finished ad copy
  in `playbook_v2.creative` and render via `--handoff`. What remains is only
  the video files and an attach path. *(09-07)*
- `reports/META_CAPI_PROMPT.md` is untracked and has never been run.
- **One report branch the sweep still refuses as STALE and nobody has replayed
  onto main:** `claude/content-freshness-analysis-2026-08-29`. Cherry-pick or
  drop it. (`claude/ga4-analysis-2026-08-28` is resolved — its report reached
  main via #308 under a different branch; the branch itself is a duplicate and
  can be deleted.)
- **The pixel records more checkouts than carts.** Seven days to 09-02:
  `InitiateCheckout` 50 against `AddToCart` 19, so checkout is being reached
  without a cart firing. (`Purchase` 18 over `AddPaymentInfo` 12 is *explained* —
  server-side purchases.) Counts read, firing code not. Whoever picks this up
  starts in the client-side pixel calls, not in Meta.
- `/admin` took 13 sessions from 1 user attributed to `facebook / paid_social`
  with 5 key events. Looks like internal traffic wearing paid attribution;
  nobody has looked. Small, but it feeds the internal-traffic-filter question.
- **An attendee with no gender on file gets no seat at all.** The chemistry
  tool counts them in a coral "N excluded" warning and then leaves them out of
  every table and every round — at an event that is a person standing in the
  room with nowhere to go. Same root as the hetero-only pairing the code
  already flags as waiting on a "looking to meet" field. Decide: seat them
  anyway, or make gender required at checkout.
- **118 sessions report country `(not set)` / continentId `ZZ`, fire 82 key
  events and produce $0.** A 58% key-event rate against roughly 3%
  property-wide, one session per user. Consistent with automated traffic, not
  proof of it — no IP or user-agent evidence was examined. It inflates every
  engagement and conversion rate the nightly computes. `ga4-api-geo-country-
  language-*.csv` carries the annotation in its own header.
- **`transaction_id` is being reused.** 16 distinct ids for 39 transactions;
  Firestore-style doc ids carry up to 8 orders each while Stripe
  payment-intent ids carry exactly 1, and one id appears on two different days.
  That is what #200 set out to fix. Whether this is legacy data or a live
  regression was NOT established — the range straddles the fix and nobody
  bisected it.

## Watch signals

- **Marion Court retargeting frequency should fall 13.8 → ~2.5.** If it does not,
  the pool is delivery-limited rather than pool-limited — report §3b is explicitly
  unresolved on that — and the extra budget is buying repetition, not reach.
- **Marion Court Traffic cost per LP view at $10/day.** It ran $0.31 at $6/day and
  the model assumed ~$0.38 blended; above ~$0.68 the increment is not paying.
- **The `/lp`-vs-`/` gap was read with the channel control on 09-02**
  (`reports/PAID_FUNNEL_AUDIT_2026-09-02.md`): the two paid leaks are the tap
  (in-app 1.4% vs normal browser 26%) and the form's first field (23 of 77
  touched it; 8 of 8 who entered a card bought). Score any checkout-form change
  on `add_to_cart ÷ begin_checkout`, and the in-app cohort on
  `select_promotion ÷ view_promotion` (2.3% on 344 impressions, 08-28..31).
- GA4 `facebook / paid_social` should read near-zero sessions from here on. New
  sessions there mean an ad re-introduced June's hand-typed lowercase-no-
  `eventId` URL shape. Same for `Facebook / paid`. Context:
  `reports/GA4_ANALYSIS_2026-08-30.md`.
- Promotions CTR is only computable on windows starting 2026-08-28 or later
  (report §H1) — earlier rows read clicks > views.
- **The rebuilt checkout form is scored by two ratios, from 2026-09-03 on:**
  `add_to_cart ÷ begin_checkout` (24% paid, 30% all-channel before the rebuild)
  and `add_payment_info ÷ begin_checkout` (10%). A climbing `checkout_error`
  with category `gender_missing` means the two-button gender step is not being
  understood; `card_incomplete` was 8 users lifetime and should not grow faster
  than form views do.
- **A rise in the checkout-by-landing-page funnel's `/lp` row is instrumentation
  before it is demand (09-03 on).** `view_item`, `begin_checkout`, `add_to_cart`
  and `lp_visible` only started firing on `/lp` when it began selling inline, so
  the first reads after 09-03 measure new events, not new interest.
  `ANALYTICS_METHOD.md` §4 and the 2026-09-03 row in §10 say what to expect.
  *(Restored 09-04 — dropped during a prune to hit the old line cap, which is
  exactly the failure mode that cap caused.)*
- **Google Ads spend now lands in `ad_spend` as `{date}__google` documents.**
  Any third spend source must namespace its doc id the same way — the Meta sync
  writes `ad_spend/{date}` with a whole-document `set`, so a shared id silently
  deletes a day of Meta spend. Memory: `google-ads-spend-is-unread`.
