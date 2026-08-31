// lib/enroll.js
//
// Marketplace buyer enrollment, extracted VERBATIM from api/lead-signup.js
// (2026-08-29) so that it has two callers instead of one:
//
//   api/lead-signup.js       the /admin Enroll tab's enroll_eventbrite action
//   scripts/sync-eventbrite  the Eventbrite API sync (GitHub Actions), which
//                            runs with the Admin SDK and cannot mint the
//                            Firebase admin ID token the HTTP endpoint needs
//
// Everything below the requires is a straight move -- same idempotency
// (ticket keyed by uid+eventId via query), same seat-counter transaction,
// same welcome emails, same gender normalization. If enrollment behaviour
// needs to change, change it HERE and both callers follow.

'use strict';

const crypto = require('crypto');
const { Resend } = require('resend');
const { admin } = require('./auth');
const { makeProfileUrl } = require('./profile-link');
const { seatFields } = require('./seat-model');
const { EMAIL_FROM, EMAIL_REPLY_TO } = require('./email-sender');
const { logTicketEnrolled } = require('./activity-log');

const db = admin.firestore();

// ── Eventbrite buyer enrollment (folded in here to stay under Vercel's
// 12-function cap) ──────────────────────────────────────────────────────────
// Admin-only. The /admin "Enroll" tab POSTs action:'enroll_eventbrite' with a
// batch of buyers. For each: create (or reuse) a Firebase Auth user, write
// users/tickets/event_registrations atomically, and email a magic profile link.
function ebEsc(s) {
  // new RegExp, not a regex literal: a literal quote inside a regex breaks
  // Vercel's build-time entrypoint scanner and drops this file from deploys.
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(new RegExp('"', 'g'), '&quot;');
}

function ebWelcomeHTML({ firstName, eventName, profileUrl, resetLink }) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f3f0;margin:0;padding:0;color:#0a0e27}
.container{max-width:600px;margin:0 auto;background:#fff}
.header{background:#0a0e27;padding:40px 30px;text-align:center}
.logo{font-family:Georgia,serif;font-size:32px;font-weight:900;color:#fff;letter-spacing:-1px}
.logo span{color:#ff6b6b}
.content{padding:40px 30px}
h1{font-family:Georgia,serif;font-size:26px;color:#0a0e27;margin:0 0 18px;font-weight:900}
p{font-size:15px;line-height:1.6;color:#1a1f3a;margin:0 0 16px}
.cta{display:inline-block;background:#ff6b6b;color:#fff !important;font-weight:800;font-size:15px;padding:14px 34px;border-radius:4px;text-decoration:none;margin:8px 0 20px}
.fine{font-size:12px;color:#666;line-height:1.6}
.footer{background:#0a0e27;padding:24px;text-align:center;color:#888;font-size:12px}
.footer a{color:#ff6b6b;text-decoration:none}
</style></head>
<body><div class="container">
  <div class="header"><div class="logo">Spark<span>Date</span></div></div>
  <div class="content">
    <h1>See you at ${ebEsc(eventName)} 🎉</h1>
    <p>Hey ${ebEsc(firstName)} — your ticket is confirmed. We created a SparkDate account for you so we can match you with other attendees after the event.</p>
    <p><strong>One quick thing:</strong> fill out your profile (takes 60 seconds) so the matching actually works:</p>
    <p style="text-align:center;"><a class="cta" href="${ebEsc(profileUrl)}">Complete my profile →</a></p>
    <p class="fine">You can also set a password to manage your account at <a href="https://sparkdate.date/account">sparkdate.date/account</a>:<br><a href="${ebEsc(resetLink)}" style="color:#ff6b6b;">${ebEsc(resetLink)}</a></p>
  </div>
  <div class="footer">
    <p>SparkDate · Lancaster &amp; Philadelphia · Real people. Real venues.</p>
    <p><a href="https://sparkdate.date">sparkdate.date</a></p>
  </div>
</div></body></html>`;
}

// Existing SparkDate users: NO "we created an account" copy and NO password
// reset link (that reads like a phishing/takeover email to someone who already
// has an account). Just confirm the ticket; include the profile link only if
// they haven't completed it yet.
function ebExistingHTML({ firstName, eventName, profileUrl }) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f3f0;margin:0;padding:0;color:#0a0e27}
.container{max-width:600px;margin:0 auto;background:#fff}
.header{background:#0a0e27;padding:40px 30px;text-align:center}
.logo{font-family:Georgia,serif;font-size:32px;font-weight:900;color:#fff;letter-spacing:-1px}
.logo span{color:#ff6b6b}
.content{padding:40px 30px}
h1{font-family:Georgia,serif;font-size:26px;color:#0a0e27;margin:0 0 18px;font-weight:900}
p{font-size:15px;line-height:1.6;color:#1a1f3a;margin:0 0 16px}
.cta{display:inline-block;background:#ff6b6b;color:#fff !important;font-weight:800;font-size:15px;padding:14px 34px;border-radius:4px;text-decoration:none;margin:8px 0 20px}
.fine{font-size:12px;color:#666;line-height:1.6}
.footer{background:#0a0e27;padding:24px;text-align:center;color:#888;font-size:12px}
.footer a{color:#ff6b6b;text-decoration:none}
</style></head>
<body><div class="container">
  <div class="header"><div class="logo">Spark<span>Date</span></div></div>
  <div class="content">
    <h1>See you at ${ebEsc(eventName)} 🎉</h1>
    <p>Hey ${ebEsc(firstName)} — your ticket is confirmed. You already have a SparkDate account, so you're all set.</p>
    ${profileUrl
      ? `<p><strong>One quick thing:</strong> finish your profile so we can match you with other attendees after the event:</p>
    <p style="text-align:center;"><a class="cta" href="${ebEsc(profileUrl)}">Complete my profile →</a></p>`
      : ''}
    <p class="fine">Manage your tickets and account anytime at <a href="https://sparkdate.date/account">sparkdate.date/account</a>.</p>
  </div>
  <div class="footer">
    <p>SparkDate · Lancaster &amp; Philadelphia · Real people. Real venues.</p>
    <p><a href="https://sparkdate.date">sparkdate.date</a></p>
  </div>
</div></body></html>`;
}

// Check-in (walk-in / door) profile nudge. Sent right after check-in to people
// whose profile isn't complete, so the same-night 9pm "who did you click with"
// matching has real data. NO password-reset link — matching is a no-login magic
// link, and a reset link reads like phishing to a walk-in who never signed up.
function checkinProfileHTML({ firstName, eventName, profileUrl }) {
  const hi = firstName ? `Hey ${ebEsc(firstName)}` : 'Hey';
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f3f0;margin:0;padding:0;color:#0a0e27}
.container{max-width:600px;margin:0 auto;background:#fff}
.header{background:#0a0e27;padding:40px 30px;text-align:center}
.logo{font-family:Georgia,serif;font-size:32px;font-weight:900;color:#fff;letter-spacing:-1px}
.logo span{color:#ff6b6b}
.content{padding:40px 30px}
h1{font-family:Georgia,serif;font-size:26px;color:#0a0e27;margin:0 0 18px;font-weight:900}
p{font-size:15px;line-height:1.6;color:#1a1f3a;margin:0 0 16px}
.cta{display:inline-block;background:#ff6b6b;color:#fff !important;font-weight:800;font-size:15px;padding:14px 34px;border-radius:4px;text-decoration:none;margin:8px 0 20px}
.fine{font-size:12px;color:#666;line-height:1.6}
.footer{background:#0a0e27;padding:24px;text-align:center;color:#888;font-size:12px}
.footer a{color:#ff6b6b;text-decoration:none}
</style></head>
<body><div class="container">
  <div class="header"><div class="logo">Spark<span>Date</span></div></div>
  <div class="content">
    <h1>Great meeting you at ${ebEsc(eventName)} 🎉</h1>
    <p>${hi} — thanks for coming out tonight. Here's the one thing left to do: tell us a little about yourself so we can match you with the people you clicked with.</p>
    <p><strong>Takes 60 seconds.</strong> We'll email you your matches afterward — no app, no login needed.</p>
    <p style="text-align:center;"><a class="cta" href="${ebEsc(profileUrl)}">Complete my profile →</a></p>
    <p class="fine">This link is just for you — no password required.</p>
  </div>
  <div class="footer">
    <p>SparkDate · Lancaster &amp; Philadelphia · Real people. Real venues.</p>
    <p><a href="https://sparkdate.date">sparkdate.date</a></p>
  </div>
</div></body></html>`;
}

// Marketplace channels we can bulk-import buyers from. `source` is what the
// admin P&L classifies by; `prefix` keys the ticket doc id.
//
// Eventbrite's prefix stays 'eb' deliberately. The ticket id is the idempotency
// key for re-running an import, so renaming it would make every previously
// imported Eventbrite buyer look new and write a duplicate ticket doc.
// `comp: true` marks a seat that was given away — a +1, a friend, a make-good.
// It still produces a registration (they're really attending, and the roster and
// post-event matching must know that), but the admin P&L keeps it out of
// revenue-per-buyer and out of the first-time-buyer count CAC divides by:
// nobody paid, and no ad spend bought them.
//
// `preserveSource: true` on 'correction' is the important one. A correction is a
// FIX to an existing record, not a new sale, so it must not rewrite the ticket's
// `source` — otherwise correcting the spelling of an Eventbrite buyer's name
// would silently move their revenue out of the Eventbrite column and into
// Direct, and Eventbrite's fee on that sale would stop being charged.
// Name cleaning lives with normalizeEmail in lib/eventbrite: both are
// boundary normalisers for data arriving from Eventbrite, and neither
// should sit behind this file's firebase-admin import.
const { cleanName, normalizeGender, hasGender } = require('./eventbrite');

const IMPORT_CHANNELS = {
  eventbrite: { source: 'eventbrite_import', prefix: 'eb',   comp: false },
  meetup:     { source: 'meetup_import',     prefix: 'mu',   comp: false },
  direct:     { source: 'manual_import',     prefix: 'dir',  comp: false },
  comp:       { source: 'comp',              prefix: 'comp', comp: true  },
  correction: { source: 'manual_import',     prefix: 'cor',  comp: false, preserveSource: true },
};

async function enrollEventbriteOne({ email, name, gender, eventId, eventName, priceCents, channel, ebFeeCents }) {
  // Normalize gender at the boundary: the rest of the system speaks lowercase
  // 'woman'/'man', and seatFields picks a seat COUNTER off this value.
  // Anything unrecognized becomes null rather than guessing.
  //
  // The allowlist used to be exactly ['woman','man'], which meant Eventbrite's
  // own "Male"/"Female" spellings -- the ones on the gendered ticket classes
  // this business actually sells -- normalised to null.
  gender = normalizeGender(gender);
  const norm = String(email || '').toLowerCase().trim();
  if (!norm) return { email, status: 'skipped', reason: 'empty email' };

  // Unknown/absent channel falls back to Eventbrite so an older client that
  // doesn't send the field keeps behaving exactly as before.
  const chan = IMPORT_CHANNELS[String(channel || '').toLowerCase()] || IMPORT_CHANNELS.eventbrite;

  // Same boundary discipline as `gender` above: normalise once, here, so every
  // downstream use (the stored member name, the ticket, the welcome email)
  // reads the cleaned value instead of each re-deriving it from `name`.
  name = cleanName(name);
  const nameParts = name.split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] || '';
  const lastName  = nameParts.slice(1).join(' ') || '';
  const amount    = parseInt(priceCents, 10) || 0;
  // Actual Eventbrite fee for this attendee, in cents, when the caller has
  // it (the API sync does; the CSV-driven Enroll tab does not). Stored on
  // the ticket so the P&L can use the REAL fee instead of the estimate --
  // absent means "not known", which is different from zero.
  const feeCents = Number.isFinite(parseInt(ebFeeCents, 10)) ? parseInt(ebFeeCents, 10) : null;
  const monthKey  = new Date().toISOString().slice(0, 7); // "2026-06"

  // 1. Reuse existing Firebase Auth user or create one.
  let userRecord = null;
  let isExisting = false;
  try {
    userRecord = await admin.auth().getUserByEmail(norm);
    isExisting = true;
  } catch (e) {
    if (e.code !== 'auth/user-not-found') throw e;
  }
  if (!isExisting) {
    userRecord = await admin.auth().createUser({
      email: norm,
      password: crypto.randomBytes(32).toString('hex'),
      emailVerified: false,
    });
  }
  const uid = userRecord.uid;
  const FieldValue = admin.firestore.FieldValue;

  // 2. Atomic Firestore writes (idempotent — keyed by uid+event).
  // wasNewUserDoc / alreadyCompleted drive which welcome email goes out below.
  // Set inside the txn (reset on each retry) so they reflect the final state.
  //
  // Ticket idempotency is by (uid, eventId) via a QUERY, not by guessing the doc
  // id from the current channel's prefix. That matters now that more than one
  // channel can touch the same person: importing someone via Eventbrite writes
  // eb_{uid}_{event}, and a later Correction on that person would write
  // cor_{uid}_{event} — a SECOND ticket doc for one seat, double-counting the
  // revenue. Finding whatever ticket already exists and updating it makes every
  // channel safe against every other, including any added later.
  //
  // reg id stays a deterministic channel-agnostic doc id: one person attending
  // one event is ONE registration no matter who sold the ticket.
  const regId = `reg_${uid}_${eventId}`;
  let wasNewUserDoc = false;
  let alreadyCompleted = false;
  // Whether THIS call created the ticket, as opposed to updating one that was
  // already there. Same reason the seat counter needs it: re-running an import
  // must not write the sale to the activity feed a second time. Set inside the
  // transaction (and so reset on each retry) for the same reason the two flags
  // above are.
  let wasNewTicket = false;
  let ticketId = `${chan.prefix}_${uid}_${eventId}`;
  await db.runTransaction(async (txn) => {
    const userRef  = db.collection('users').doc(uid);
    const regRef   = db.collection('event_registrations').doc(regId);
    // All reads must precede all writes inside a Firestore transaction.
    const existingTix = await txn.get(
      db.collection('tickets')
        .where('eventId', '==', eventId || null)
        .where('firebaseUid', '==', uid)
        .limit(1)
    );
    const userSnap = await txn.get(userRef);
    // Read the event too, so the seat counter can be bumped in the same
    // transaction as the ticket write (see the increment below). Read even
    // when we may not write it — a Firestore txn forbids reading after a
    // write, so it cannot be deferred until we know whether it's needed.
    const eventRef = eventId ? db.collection('events').doc(eventId) : null;
    const eventSnap = eventRef ? await txn.get(eventRef) : null;

    const ticketRef = existingTix.empty
      ? db.collection('tickets').doc(ticketId)
      : existingTix.docs[0].ref;
    if (!existingTix.empty) ticketId = existingTix.docs[0].id;

    wasNewUserDoc = !userSnap.exists;
    wasNewTicket = existingTix.empty;
    alreadyCompleted = userSnap.exists && userSnap.data().profileCompleted === true;

    if (!userSnap.exists) {
      txn.set(userRef, {
        email: norm, firstName, lastName, phone: '', gender: gender || null,
        tier: 'free', stripeCustomerId: null, subscriptionId: null, subscriptionStatus: null,
        source: chan.source, profileCompleted: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    } else if (gender && !hasGender(userSnap.data().gender)) {
      // The profile's gender used to be written ONLY at doc creation, so
      // somebody whose account already existed before we learned their gender
      // kept a null profile for ever, no matter how many gendered tickets they
      // went on to buy. scripts/backfill-gender.js found exactly two of these
      // and could only repair them after the fact; this stops more being made.
      //
      // ONLY WHEN BLANK, and that is the whole rule. `gender` here may have
      // been inferred from an Eventbrite ticket class, which is a good guess
      // and nothing more -- it must never overwrite a value the member set
      // themselves or an admin corrected by hand. Same predicate the backfill
      // uses, so the two agree on what "already answered" means.
      txn.update(userRef, { gender });
    }

    // A correction leaves `source` alone on a ticket that already exists, so it
    // can't relocate revenue between channels. On a ticket it's CREATING there's
    // nothing to preserve, so it falls back to the channel's own source.
    const keepSource = chan.preserveSource && !existingTix.empty;
    txn.set(ticketRef, {
      firebaseUid: uid, email: norm, name: name, phone: '',
      gender: gender || null, eventId: eventId || null, eventName: eventName || '',
      amount, paymentIntentId: null, paidWithCardOnFile: false, status: 'confirmed',
      ...(feeCents !== null ? { ebFeeCents: feeCents } : {}),
      ...(keepSource ? {} : { source: chan.source }),
      isComp: !!chan.comp,
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    txn.set(regRef, {
      userId: uid, email: norm, name: name, phone: '',
      gender: gender || null, eventId: eventId || null, eventTitle: eventName || '',
      ticketId, paymentIntentId: null, status: 'confirmed', month: monthKey,
      ...(keepSource ? {} : { source: chan.source }),
      isComp: !!chan.comp,
      registeredAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    // Take the seat. Until now only api/purchase-ticket.js touched this
    // counter, so every admin-enrolled ticket was invisible to it — and
    // `spotsRemaining()` (lib/seat-model.js), which is what /api/next-event
    // and the landing pages advertise, is capacity MINUS this counter. With
    // Eventbrite at roughly half of all volume the counter drifted far below
    // reality and the site advertised seats that did not exist: Tellus
    // AfterDark sat at counter 10 against 24 real ticket-holders in a
    // 30-seat room, i.e. 20 more on sale for 6 actual places.
    //
    // Two guards:
    //   existingTix.empty — enrollment is idempotent by (uid, eventId) and
    //     re-running an import must not bump the counter a second time.
    //   !chan.comp — a comp is a free seat that earns nothing, and the only
    //     comps today are the host's own. Counting them would let a host
    //     seat displace a paying customer. purchase-ticket.js likewise only
    //     ever counts real purchases, so "sold" keeps one meaning across
    //     both writers. NOTE: this does mean a comp given to a real GUEST
    //     occupies a chair without consuming inventory — if comping guests
    //     becomes routine, either count them here or raise `spots`.
    if (existingTix.empty && !chan.comp && eventRef && eventSnap && eventSnap.exists) {
      const { counterField } = seatFields(eventSnap.data(), gender);
      txn.update(eventRef, { [counterField]: FieldValue.increment(1) });
    }
  });

  // 3. Best-effort: record the sale on the admin Activity feed.
  //
  // Without this, `activity` has exactly one ticket writer -- the web
  // checkout in api/purchase-ticket.js -- so the feed reads as a complete
  // log of sales while showing only the direct ones. Eventbrite alone is
  // roughly half of all volume; those buyers got a ticket, a registration,
  // a seat off the counter and a welcome email, and left no trace on the
  // page an admin actually watches.
  //
  // Gated on wasNewTicket for the same reason the seat counter is: the sync
  // re-reads a 45-day window every six hours, and an update to an existing
  // ticket is not a new sale. Deterministic doc id inside logTicketEnrolled
  // is the second guard. Wrapped like every other post-transaction step --
  // a feed write must never cost an enrollment that already succeeded.
  if (wasNewTicket) {
    try {
      await logTicketEnrolled(db, FieldValue, {
        ticketId, uid, email: norm, name,
        eventId, eventName,
        amountCents: amount,
        channel: chan.source,
        isComp: !!chan.comp,
      });
    } catch (e) {
      console.error(`[enroll-${chan.prefix}] activity log failed for ${norm}:`, e.message);
    }
  }

  // 4. Best-effort: create a `leads` doc so this person enters the
  // engagement pipeline. day2/5/14/25 nurture, the newsletter, the
  // post-nurture campaign, and the returning-attendee "Back for more?"
  // invite all read from `leads` and nothing else — without this, an
  // Eventbrite-enrolled buyer is invisible to all of it, for this event
  // and every future one. Wrapped in its own try/catch so a Firestore
  // hiccup here can never break ticket enrollment.
  // Held so step 5 can record the welcome it actually sends against this lead.
  // Null only if the lookup below threw — the send then skips the write.
  let leadRef = null;
  // Whether this lead already carries a tracked welcome from an earlier send
  // (the site's own signup form writes one). Step 5 must not overwrite that
  // with a ticket confirmation.
  let leadHasTrackedWelcome = false;
  try {
    const leadDupe = await db.collection('leads').where('email', '==', norm).limit(1).get();
    if (!leadDupe.empty) {
      leadRef = leadDupe.docs[0].ref;
      leadHasTrackedWelcome = !!leadDupe.docs[0].data().resend_id;
    }
    if (leadDupe.empty) {
      let eventIsPast = false;
      if (eventId) {
        const evSnap = await db.collection('events').doc(String(eventId)).get();
        if (evSnap.exists) {
          const d = evSnap.data().date;
          const dt = d && d.toDate ? d.toDate() : (d ? new Date(d) : null);
          eventIsPast = !!dt && !isNaN(dt.getTime()) && dt.getTime() < Date.now();
        }
      }
      await db.collection('leads').add({
        name: name,
        email: norm,
        phone: '',
        source: chan.source,
        referredBy: null,
        createdAt: FieldValue.serverTimestamp(),
        subscribed: true,
        // Already welcomed via the ticket-confirmation email below — don't
        // also send the generic "Your app matched you" welcome pitch.
        welcome_sent: true,
        // Already has a ticket, so skip the pre-purchase persuasion
        // pitches (day2 "70% exchange contact info", day5 "spots are
        // limited") — irrelevant to someone who already converted. day14
        // ("what to expect") and day25 ("don't miss the next one") still
        // apply while the event is upcoming. If the event already
        // happened (common for backfilled past registrations), none of
        // the day2-25 bucket applies — future re-engagement is
        // sendReturningAttendeeInvites's job, which has its own
        // independent per-event dedup.
        day2_sent: true,
        day5_sent: true,
        day14_sent: eventIsPast,
        day25_sent: eventIsPast,
      }).then((ref) => { leadRef = ref; });
    }
  } catch (e) {
    console.error(`[enroll-eventbrite] leads doc creation failed for ${norm}:`, e.message);
  }

  // Backfill a missing email onto a users doc that already existed. A Firebase
  // Auth account can predate enrollment -- check-in creates one -- and when it
  // does, the users doc is written without an email field. Nothing downstream
  // repairs it, and cron-send-emails.js:498 drops those people on the floor:
  //   if (u.profileCompleted === true || !u.email) { skipped++; continue; }
  // That is a `continue` with a counter, not an error, so a buyer who never
  // receives a single nurture email looks identical to one who opted out.
  //
  // Re-read outside the transaction rather than trusting the snapshot taken
  // inside it: enrollment is not the only writer, and the only case being
  // repaired here is the one where the field is still genuinely absent.
  // Best-effort, like the leads doc above -- a failure here must not cost the
  // enrollment that already succeeded.
  if (!wasNewUserDoc && norm) {
    try {
      const freshSnap = await db.collection('users').doc(uid).get();
      if (freshSnap.exists && !freshSnap.data().email) {
        await db.collection('users').doc(uid).update({ email: norm });
        console.log(`[enroll-${chan.prefix}] backfilled missing email on users/${uid}`);
      }
    } catch (e) {
      console.error(`[enroll-${chan.prefix}] email backfill failed for ${uid}:`, e.message);
    }
  }

  // 5. Magic profile link + welcome email (best-effort). New SparkDate users
  // get account-creation copy + a set-password link; users who already had a
  // doc get a ticket-confirmation only (no "we made you an account", no reset
  // link), with the profile CTA only if they haven't completed it.
  let profileUrl = null, emailSent = false;
  try {
    profileUrl = makeProfileUrl(uid);
    if (process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      let subject, html;
      if (wasNewUserDoc) {
        const resetLink = await admin.auth().generatePasswordResetLink(norm);
        subject = `Your SparkDate ticket — ${eventName}`;
        html = ebWelcomeHTML({ firstName: firstName || name, eventName, profileUrl, resetLink });
      } else {
        subject = `Your ticket for ${eventName} is confirmed`;
        html = ebExistingHTML({ firstName: firstName || name, eventName, profileUrl: alreadyCompleted ? null : profileUrl });
      }
      // The result was previously discarded and `emailSent` set to true
      // unconditionally. The Resend SDK RETURNS `{ data, error }` for an API
      // failure rather than throwing, so a rejected send was recorded as a
      // successful one — the catch below only ever saw transport errors.
      const result = await resend.emails.send({ from: EMAIL_FROM, reply_to: EMAIL_REPLY_TO, to: norm, subject, html });
      emailSent = !(result && result.error);
      if (result && result.error) {
        console.error(`[enroll-${chan.prefix}] Resend rejected the welcome for ${norm}:`, result.error.message);
      }

      // Record the send AS EVIDENCE on the lead, the same three fields
      // api/lead-signup.js writes for the site's own welcome.
      //
      // WHY: the admin Leads tracker deliberately trusts evidence over flags —
      // a tick requires `welcome_sent_at` or `welcome_resend_id`, because
      // `welcome_sent: true` is also written purely to SUPPRESS the cron.
      // Enrollment set that suppression flag and then really did send an
      // email, but threw the Resend id away — so every imported buyer showed
      // the dim "flag set, nothing delivered" tick, under a tooltip claiming
      // Eventbrite had sent its own confirmation. We sent it, through Resend,
      // and had the id in hand.
      //
      // The field is `resend_id`, NOT `welcome_resend_id`: that bare name is
      // what lib/resend-webhook.js's ID_FIELDS looks the welcome bucket up by.
      // Writing the prefixed name instead would store the id somewhere the
      // webhook never queries, and opens/clicks would never come back.
      //
      // Skipped when the lead already carries a tracked welcome: this is a
      // ticket confirmation, and it must not take over the tracking slot (or
      // the tooltip) belonging to the real welcome someone got from the form.
      if (emailSent && leadRef && !leadHasTrackedWelcome) {
        try {
          await leadRef.update({
            welcome_sent: true,
            welcome_sent_at: new Date().toISOString(),
            resend_id: (result && result.data && result.data.id) || null,
          });
        } catch (e) {
          console.error(`[enroll-${chan.prefix}] could not record the welcome on the lead for ${norm}:`, e.message);
        }
      }
    }
  } catch (e) {
    console.error(`[enroll-eventbrite] email failed for ${norm}:`, e.message);
  }

  return {
    email: norm, name: name, uid,
    // "enrolled" = we created the SparkDate user doc; "existing_user" = it
    // already existed (keyed off the user doc, not just the Auth record).
    status: wasNewUserDoc ? 'enrolled' : 'existing_user', emailSent, profileUrl,
  };
}

module.exports = { enrollEventbriteOne, IMPORT_CHANNELS };
