// api/cron-send-emails.js
// CommonJS — Vercel Cron. Sends the Day 2 / 5 / 14 / 25 nurture emails.
//
// Scheduling note: Vercel crons are UTC-only and can't follow daylight
// saving. To land at 9:00 AM America/New_York all year, vercel.json
// registers TWO daily schedules — 13:00 UTC (= 9 AM EDT) and 14:00 UTC
// (= 9 AM EST). Whichever one is actually 9 AM Eastern today runs; the
// other no-ops via the hour guard in the handler below.
//
// Copy: the "app-supplement" positioning — "Your app matched you. We host
// the date." Every email shows the NEXT upcoming event (pulled live via
// lib/next-event) with a dynamic "X days away", falling back to an
// evergreen card when nothing is scheduled.

const { Resend } = require('resend');
const { admin } = require('../lib/auth');
const { makeUnsubscribeUrl } = require('../lib/unsubscribe');
const { makeProfileUrl, makeMatchUrl } = require('../lib/profile-link');
const { EMAIL_CAMPAIGNS: UTM, buildUtmUrl } = require('../lib/utm');
const { getNextEvent, eventCardHtml, ctaButtonHtml, urgencyBox, shell, h1, p, esc } = require('../lib/next-event');

const db = admin.firestore();
const resend = new Resend(process.env.RESEND_API_KEY);

// ── Email templates ──────────────────────────────────────────────────
// Each html(firstName, event, ctaUrl) returns a full HTML doc. `firstName`
// is pre-escaped by the caller; `event` may be null (evergreen fallback);
// `ctaUrl` is a UTM-tagged link to the next event (or /events).

const EMAILS = {
  // Email 2 (Day 7 in the spec): the conversion-math hook.
  day2: {
    subject: '70% of people exchange contact info',
    html: (firstName, event, ctaUrl) => shell(
      h1('70% exchange contact info.') +
      p(`${firstName}, quick stat: roughly <strong>70% of people who come to a SparkDate night</strong> leave having swapped contact info with someone.`) +
      p('On the apps? Match-to-date conversion is closer to 0.5%.') +
      p("The difference is simple — you're meeting face to face, where chemistry is instant, instead of texting for three weeks until the thread quietly dies.") +
      `<div style="background:#f5f3f0;border-left:3px solid #ff6b6b;padding:16px 20px;margin:16px 0;font-size:15px;line-height:1.8;color:#1a1f3a;">
        <strong>The apps:</strong> 6 months · 12 matches · 0 dates<br>
        <strong>SparkDate:</strong> one night · 12 conversations · a couple of real ones
      </div>` +
      p('One night beats six months. Every time.') +
      eventCardHtml(event) +
      ctaButtonHtml(ctaUrl, 'Get Tickets') +
      p('Questions? Just reply — we read every message.') +
      p('See you there,<br>The SparkDate Team')
    ),
  },

  // Email 3 (Day 14 in the spec): scarcity (generic — we don't track exact
  // remaining seats in this email).
  day5: {
    subject: 'Spots are limited for our next mixer',
    html: (firstName, event, ctaUrl) => shell(
      h1('Spots are limited.') +
      p(`${firstName}, our mixers are intentionally small — enough people to meet a dozen new faces, few enough that it never feels like a cattle call.`) +
      p("That also means seats go quickly. If you've been thinking about it, grab yours before it fills.") +
      eventCardHtml(event) +
      urgencyBox('⏰ <strong>We cap every event on purpose.</strong> Lock in your seat while there\'s room.') +
      ctaButtonHtml(ctaUrl, 'Reserve Your Spot') +
      p('See you there,<br>The SparkDate Team')
    ),
  },

  // Email 4 (Day 21 in the spec): what-to-expect / the format. Timing is
  // described relative to the real event time, not hardcoded clock stamps.
  day14: {
    subject: "Here's exactly what to expect",
    html: (firstName, event, ctaUrl) => {
      const doors = event && event.timeLabel ? esc(event.timeLabel) : 'the listed start time';
      return shell(
        h1("Here's exactly what to expect.") +
        p(`${firstName}, nervous? Don't be. Here's how a SparkDate night actually runs:`) +
        `<div style="background:#f5f3f0;border-left:3px solid #ff6b6b;padding:16px 20px;margin:16px 0;font-size:15px;line-height:1.8;color:#1a1f3a;">
          <strong>Doors at ${doors}.</strong> Check in, grab a name tag (first name only).<br>
          <strong>4 rounds, ~7 minutes each.</strong> A real conversation with a dozen-plus people.<br>
          <strong>A bell marks each switch.</strong> No scripts, no pressure.<br>
          <strong>Then: open mingling.</strong> Swap numbers with anyone you clicked with.
        </div>` +
        p('Bring yourself and an open mind. Leave the expectations (and the nerves — everyone\'s a little nervous) at the door.') +
        eventCardHtml(event) +
        ctaButtonHtml(ctaUrl, 'Get Tickets') +
        p('See you there,<br>The SparkDate Team')
      );
    },
  },

  // Email 5 (Day 28 in the spec): final nudge. (Replaces the old
  // trial-ending/upgrade email — leads aren't subscribers and subscriptions
  // are paused, so that copy was off-audience and off-message.)
  day25: {
    subject: "Don't miss our next mixer",
    html: (firstName, event, ctaUrl) => shell(
      h1("Don't miss the next one.") +
      p(`${firstName}, our next SparkDate night is <strong>${event ? esc(event.daysAwayLabel) : 'coming up'}</strong> — and we'd love to see you there.`) +
      eventCardHtml(event) +
      `<div style="background:#f5f3f0;border-left:3px solid #ff6b6b;padding:16px 20px;margin:16px 0;font-size:15px;line-height:1.8;color:#1a1f3a;">
        <strong>Quick reminders:</strong><br>
        • Arrive a few minutes early for check-in.<br>
        • Bring a way to swap contact info.<br>
        • Just be yourself — everyone's in the same boat.
      </div>` +
      ctaButtonHtml(ctaUrl, 'Get Tickets') +
      p("Can't make this one? Reply and let us know — we'll make sure you hear about the next.") +
      p('See you soon,<br>The SparkDate Team')
    ),
  },
};

// Max days an email may go out past its target day. Wide enough to ride
// out a missed cron run / a backlog; tight enough that the day25 mail
// never reaches someone who signed up months ago.
const MAX_LATE_DAYS = 21;

// ── Send one day-bucket's email to every eligible lead ───────────────
async function sendBucket(leads, dayNum, emailKey, nowMs, emailedThisRun, event) {
  let sent = 0;
  let skipped = 0;
  const errors = [];

  for (const leadDoc of leads) {
    // One nurture email per lead per run — a backlogged lead gets day2
    // today, day5 tomorrow, etc., instead of all four at once.
    if (emailedThisRun.has(leadDoc.id)) { skipped++; continue; }

    const lead = leadDoc.data();

    // Already sent? A MISSING `${emailKey}_sent` field reads as falsy
    // here, so leads created before those fields existed are picked up.
    if (lead[`${emailKey}_sent`]) { skipped++; continue; }

    const created = lead.createdAt?.toDate ? lead.createdAt.toDate()
                  : (lead.createdAt ? new Date(lead.createdAt) : null);
    if (!created || isNaN(created.getTime())) { skipped++; continue; }

    // Eligible from dayNum days old, up to dayNum + MAX_LATE_DAYS.
    const ageDays = (nowMs - created.getTime()) / 86400000;
    if (ageDays < dayNum || ageDays > dayNum + MAX_LATE_DAYS) { skipped++; continue; }

    const firstName = esc(lead.name ? lead.name.split(' ')[0] : 'there');
    const tmpl      = EMAILS[emailKey];
    const unsubUrl  = makeUnsubscribeUrl(leadDoc.id, lead.email);
    // CTA → the specific next event's checkout when we have one, else /events.
    const ctaUrl = event
      ? buildUtmUrl('/event?id=' + event.id, 'email', 'nurture', emailKey)
      : ((UTM[emailKey] && UTM[emailKey].events) || buildUtmUrl('/events', 'email', 'nurture', emailKey));

    try {
      const result = await resend.emails.send({
        from:    'SparkDate <hello@mail.sparkdate.date>',
        to:      lead.email,
        subject: tmpl.subject,
        // Per-lead unsubscribe URL is interpolated AFTER template render —
        // each Resend send gets its own signed token so a recipient can
        // unsubscribe themselves but can't unsubscribe anyone else.
        html:    tmpl.html(firstName, event, ctaUrl).replace(/__UNSUB__/g, unsubUrl),
        // RFC 8058: native one-click unsubscribe for Gmail / iOS / Outlook.
        headers: {
          'List-Unsubscribe':      `<${unsubUrl}>, <mailto:hello@sparkdate.date?subject=Unsubscribe>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      });

      if (!result.error) {
        await leadDoc.ref.update({
          [`${emailKey}_sent`]:      true,
          [`${emailKey}_sent_at`]:   new Date().toISOString(),
          [`${emailKey}_resend_id`]: result.data?.id || null
        });
        emailedThisRun.add(leadDoc.id);
        sent++;
        // Log doc id only, not email — avoids PII in Vercel logs.
        console.log(`✅ ${emailKey} → lead/${leadDoc.id}`);
      } else {
        errors.push(`lead/${leadDoc.id}: ${result.error.message}`);
      }
    } catch (e) {
      errors.push(`lead/${leadDoc.id}: ${e.message}`);
    }
  }

  return { emailKey, sent, skipped, errors };
}

// ── Pre-event chemistry-profile reminders ───────────────────────────────────
// Emails confirmed ticket-holders who haven't completed their profile, a few
// days before their event, with a no-login magic link (lib/profile-link).
// Idempotent via `profileReminderSent` on the user doc. Best-effort: a failure
// in here never breaks the lead nurture pass.
const PROFILE_REMINDER_WINDOW_DAYS = 4;

function profileReminderHTML({ eventName, profileUrl }) {
  const s = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f3f0;margin:0;padding:0;color:#0a0e27}
.container{max-width:600px;margin:0 auto;background:#fff}
.header{background:#0a0e27;padding:36px 30px;text-align:center}
.logo{font-family:Georgia,serif;font-size:30px;font-weight:900;color:#fff}.logo span{color:#ff6b6b}
.content{padding:36px 30px}h1{font-family:Georgia,serif;font-size:24px;margin:0 0 16px}
p{font-size:15px;line-height:1.6;color:#1a1f3a;margin:0 0 16px}
.cta{display:inline-block;background:#ff6b6b;color:#fff!important;font-weight:800;padding:14px 34px;border-radius:4px;text-decoration:none;margin:6px 0 18px}
.footer{background:#0a0e27;padding:22px;text-align:center;color:#888;font-size:12px}.footer a{color:#ff6b6b;text-decoration:none}
</style></head><body><div class="container">
<div class="header"><div class="logo">Spark<span>Date</span></div></div>
<div class="content">
<h1>${s(eventName)} is coming up.</h1>
<p>We're finalizing who meets who. Take 60 seconds to tell us a bit about yourself so we can make the introductions count — no login needed:</p>
<p style="text-align:center;"><a class="cta" href="${s(profileUrl)}">Complete my profile</a></p>
<p>See you soon.</p>
</div>
<div class="footer"><p>SparkDate · Philadelphia · Real people. Real venues.</p>
<p><a href="https://sparkdate.date">sparkdate.date</a></p></div>
</div></body></html>`;
}

async function sendProfileReminders(nowMs) {
  let sent = 0, skipped = 0;
  try {
    const horizon = new Date(nowMs + PROFILE_REMINDER_WINDOW_DAYS * 86400000);
    const evSnap = await db.collection('events')
      .where('date', '>=', new Date(nowMs))
      .where('date', '<=', horizon)
      .get();
    for (const evDoc of evSnap.docs) {
      const eventName = evDoc.data().title || 'your SparkDate event';
      // Single-field query (eventId is auto-indexed); filter status in code to
      // avoid needing a composite index (mirrors purchase-ticket sweepStale3ds).
      const tkSnap = await db.collection('tickets').where('eventId', '==', evDoc.id).get();
      const seen = new Set();
      for (const tk of tkSnap.docs) {
        const t = tk.data();
        if (t.status !== 'confirmed' || !t.firebaseUid || seen.has(t.firebaseUid)) { skipped++; continue; }
        seen.add(t.firebaseUid);
        const uref = db.collection('users').doc(t.firebaseUid);
        const usnap = await uref.get();
        if (!usnap.exists) { skipped++; continue; }
        const u = usnap.data();
        if (u.profileCompleted === true || u.profileReminderSent === true || !u.email) { skipped++; continue; }
        try {
          const profileUrl = makeProfileUrl(t.firebaseUid);
          const result = await resend.emails.send({
            from: 'SparkDate <hello@mail.sparkdate.date>',
            to: u.email,
            subject: `Before ${eventName} — a 60-second profile so we can match you`,
            html: profileReminderHTML({ eventName, profileUrl }),
          });
          if (!result.error) {
            await uref.update({ profileReminderSent: true, profileReminderSentAt: new Date().toISOString() });
            sent++;
            console.log(`✅ profile reminder → users/${t.firebaseUid}`);
          } else { skipped++; }
        } catch (e) { console.error('[profile-reminder]', t.firebaseUid, e.message); skipped++; }
      }
    }
  } catch (e) {
    console.error('[profile-reminder] pass failed:', e.message);
  }
  return { sent, skipped };
}

// ── Post-event "who did you click with" prompt ──────────────────────────────
// The morning after an event, email every confirmed attendee a link to their
// /account Connections section so they can pick who they clicked with. (Login
// required per product decision; password-less guests set one via the existing
// reset-password link.) Idempotent via `postEventPromptSent` on the ticket doc
// (per attendee × event, so a second event still prompts). Best-effort: a
// failure here never breaks the nurture or profile-reminder passes.
const POST_EVENT_LOOKBACK_DAYS = 3;

function postEventPromptHTML({ eventName, matchUrl }) {
  const s = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f3f0;margin:0;padding:0;color:#0a0e27}
.container{max-width:600px;margin:0 auto;background:#fff}
.header{background:#0a0e27;padding:36px 30px;text-align:center}
.logo{font-family:Georgia,serif;font-size:30px;font-weight:900;color:#fff}.logo span{color:#ff6b6b}
.content{padding:36px 30px}h1{font-family:Georgia,serif;font-size:24px;margin:0 0 16px}
p{font-size:15px;line-height:1.6;color:#1a1f3a;margin:0 0 16px}
.cta{display:inline-block;background:#ff6b6b;color:#fff!important;font-weight:800;padding:14px 34px;border-radius:4px;text-decoration:none;margin:6px 0 18px}
.footer{background:#0a0e27;padding:22px;text-align:center;color:#888;font-size:12px}.footer a{color:#ff6b6b;text-decoration:none}
</style></head><body><div class="container">
<div class="header"><div class="logo">Spark<span>Date</span></div></div>
<div class="content">
<h1>Who did you click with at ${s(eventName)}?</h1>
<p>Tell us who you'd like to see again. If they pick you too, we'll share contact info so you can meet up — no missed signals, no awkward Instagram hunt.</p>
<p style="text-align:center;"><a class="cta" href="${s(matchUrl)}">Pick your matches</a></p>
<p>No login needed — this link is just for you.</p>
</div>
<div class="footer"><p>SparkDate · Philadelphia · Real people. Real venues.</p>
<p><a href="https://sparkdate.date">sparkdate.date</a></p></div>
</div></body></html>`;
}

async function sendPostEventPrompts(nowMs) {
  let sent = 0, skipped = 0;
  try {
    const since = new Date(nowMs - POST_EVENT_LOOKBACK_DAYS * 86400000);
    const evSnap = await db.collection('events')
      .where('date', '>=', since)
      .where('date', '<=', new Date(nowMs))
      .get();
    for (const evDoc of evSnap.docs) {
      const eventName = evDoc.data().title || 'your SparkDate event';
      // Single-field query (eventId auto-indexed); filter status in code to
      // avoid a composite index (mirrors sendProfileReminders).
      const tkSnap = await db.collection('tickets').where('eventId', '==', evDoc.id).get();
      const seen = new Set();
      for (const tk of tkSnap.docs) {
        const t = tk.data();
        if (t.status !== 'confirmed' || !t.firebaseUid) { skipped++; continue; }
        if (t.postEventPromptSent === true) { skipped++; continue; }
        if (!t.firebaseUid) {
          console.warn(`[post-event-prompt] skipping tickets/${tk.id} — no firebaseUid`);
          skipped++; continue;
        }
        if (seen.has(t.firebaseUid)) { skipped++; continue; } // one prompt per person per event
        seen.add(t.firebaseUid);
        const usnap = await db.collection('users').doc(t.firebaseUid).get();
        const email = usnap.exists ? usnap.data().email : null;
        if (!email) { skipped++; continue; }
        try {
          const result = await resend.emails.send({
            from: 'SparkDate <hello@mail.sparkdate.date>',
            to: email,
            subject: `Who did you click with at ${eventName}?`,
            html: postEventPromptHTML({ eventName, matchUrl: makeMatchUrl(t.firebaseUid) }),
          });
          if (!result.error) {
            await tk.ref.update({ postEventPromptSent: true, postEventPromptSentAt: new Date().toISOString() });
            sent++;
            console.log(`✅ post-event prompt → tickets/${tk.id}`);
          } else { skipped++; }
        } catch (e) { console.error('[post-event-prompt]', tk.id, e.message); skipped++; }
      }
    }
  } catch (e) {
    console.error('[post-event-prompt] pass failed:', e.message);
  }
  return { sent, skipped };
}

// ── Handler ───────────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // ── 9 AM Eastern guard ───────────────────────────────────────────
  // vercel.json fires this at both 13:00 and 14:00 UTC so one of them is
  // always 9 AM in New York (EDT or EST). The off-hour invocation lands
  // here, sees it's not 9, and no-ops. Returns 200 — a non-200 would
  // make Vercel treat the cron as failed and retry.
  // `?force=1` skips the guard, for manual admin triggers at any hour.
  const force = req.query?.force === '1' || req.query?.force === 'true'
    || req.body?.force === true;
  if (!force) {
    const easternHour = parseInt(
      new Date().toLocaleString('en-US', {
        timeZone: 'America/New_York', hour: '2-digit', hour12: false,
      }), 10);
    if (easternHour !== 9) {
      console.log(`⏰ cron skipped — ${easternHour}:00 America/New_York, not 9 (other UTC schedule covers today)`);
      return res.status(200).json({ skipped: true, reason: `not 9 AM Eastern (hour=${easternHour})` });
    }
  }

  try {
    // The single next upcoming event shown in every email this run.
    const event = await getNextEvent(db);

    // Fetch every subscribed lead ONCE, then evaluate each day-bucket in
    // code. The query intentionally filters ONLY on `subscribed` — never
    // on `dayN_sent` — because a Firestore equality filter skips documents
    // that lack the field, which is exactly how the nurture sequence went
    // silently dead. Filtering in code treats a missing field as "not sent".
    const snap = await db.collection('leads').where('subscribed', '==', true).get();
    const leads = snap.docs;
    const nowMs = Date.now();

    // Buckets evaluated in order, sharing one `emailedThisRun` set so a
    // single lead never gets more than one nurture email per run.
    const emailedThisRun = new Set();
    const results = [];
    for (const [dayNum, key] of [[2, 'day2'], [5, 'day5'], [14, 'day14'], [25, 'day25']]) {
      results.push(await sendBucket(leads, dayNum, key, nowMs, emailedThisRun, event));
    }

    // Pre-event chemistry-profile reminders to confirmed ticket-holders.
    const profileReminders = await sendProfileReminders(nowMs);

    // Post-event "who did you click with" prompts to recent attendees.
    const postEventPrompts = await sendPostEventPrompts(nowMs);

    console.log(`✅ Cron complete (${leads.length} subscribed leads):`, JSON.stringify(results), 'profileReminders=', JSON.stringify(profileReminders), 'postEventPrompts=', JSON.stringify(postEventPrompts));
    return res.status(200).json({ success: true, leads: leads.length, event: event ? event.id : null, results, profileReminders, postEventPrompts, ts: new Date().toISOString() });

  } catch (err) {
    console.error('❌ Cron error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};

// Exported for unit tests (tests/email-render.test.js).
module.exports.EMAILS = EMAILS;
