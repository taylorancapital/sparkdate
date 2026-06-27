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

// ── Newsletter templates (bi-weekly, rotating 6-week cycle) ───────────
// Each returns HTML for a bi-weekly newsletter with curated content.
const NEWSLETTER_EMAILS = [
  // Week 1: Conversation starters
  {
    subject: 'What makes a great conversation?',
    html: (firstName, event, ctaUrl) => shell(
      h1('What makes a great conversation?') +
      p(`${firstName}, here's the truth: you already know how to have a great conversation. You do it all the time — with your best friend, your sibling, that barista who remembers your order.`) +
      p('The only difference at a mixer is you\'re talking to someone new. And the best way to start? Ask something genuine.') +
      p(`Instead of "What do you do?" try "What have you been excited about lately?" or "If you could move anywhere tomorrow, where would you go?"`) +
      p('Real questions lead to real conversations. Real conversations lead to real connections.') +
      eventCardHtml(event) +
      ctaButtonHtml(ctaUrl, 'Find your next connection') +
      p('See you there,<br>The SparkDate Team')
    ),
  },
  // Week 2: Dating reality check
  {
    subject: 'One night vs. six months (the numbers)',
    html: (firstName, event, ctaUrl) => shell(
      h1('One night vs. six months') +
      p(`${firstName}, let's talk about efficiency.`) +
      p('On the apps: 6 months, 12 matches, 3 unmatchable conversations, 0 dates.') +
      p('At a mixer: one night, 12 real conversations, instant chemistry (or lack thereof), a couple of genuine connections.') +
      p('You already know who you click with in the first 30 seconds. Why wait six months to find out?') +
      eventCardHtml(event) +
      ctaButtonHtml(ctaUrl, 'Skip the app limbo') +
      p('See you there,<br>The SparkDate Team')
    ),
  },
  // Week 3: Event insights
  {
    subject: 'What to expect at your next mixer',
    html: (firstName, event, ctaUrl) => shell(
      h1('What to expect at your next mixer') +
      p(`${firstName}, new to mixers? Here's the format:`) +
      p(`<strong>4 rounds × 7 minutes</strong>. You'll chat with 4 different people, bell signals the change, you move on.`) +
      p(`<strong>Open mingling</strong> after rounds wrap. If you clicked with someone, you can swap contact info and chat longer.`) +
      p(`<strong>Real people</strong>. No bots, no catfish, no dudes with fish photos. Just humans looking to meet humans.`) +
      p('Arrive early (check-in takes 2 min). Bring a phone or paper to swap numbers. Be yourself.') +
      eventCardHtml(event) +
      ctaButtonHtml(ctaUrl, 'See what the vibe is') +
      p('See you there,<br>The SparkDate Team')
    ),
  },
];

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
    const lead = leadDoc.data();
    const email = (lead.email || '').toLowerCase().trim();

    // One email per person per run, shared across ALL passes and keyed by
    // email (not doc id) so the same human can't be hit by nurture +
    // newsletter + post-nurture in a single run. No email → can't send.
    if (!email) { skipped++; continue; }
    if (emailedThisRun.has(email)) { skipped++; continue; }

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
        emailedThisRun.add(email);
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

async function sendProfileReminders(nowMs, emailedThisRun) {
  let sent = 0, skipped = 0;
  try {
    const horizon = new Date(nowMs + PROFILE_REMINDER_WINDOW_DAYS * 86400000);
    const evSnap = await db.collection('events')
      .where('date', '>=', new Date(nowMs))
      .where('date', '<=', horizon)
      .get();
    for (const evDoc of evSnap.docs) {
      const eventName = evDoc.data().title || 'your SparkDate event';
      // event_registrations is the single source of truth for attendance —
      // covers ticket buyers, check-ins, and admin-enrolled guests in one query.
      const regSnap = await db.collection('event_registrations').where('eventId', '==', evDoc.id).get();
      const seen = new Set();
      for (const reg of regSnap.docs) {
        const r = reg.data();
        if (r.status !== 'confirmed' || !r.userId || seen.has(r.userId)) { skipped++; continue; }
        seen.add(r.userId);
        const uref = db.collection('users').doc(r.userId);
        const usnap = await uref.get();
        if (!usnap.exists) { skipped++; continue; }
        const u = usnap.data();
        if (u.profileCompleted === true || u.profileReminderSent === true || !u.email) { skipped++; continue; }
        try {
          const profileUrl = makeProfileUrl(r.userId);
          const result = await resend.emails.send({
            from: 'SparkDate <hello@mail.sparkdate.date>',
            to: u.email,
            subject: `Before ${eventName} — a 60-second profile so we can match you`,
            html: profileReminderHTML({ eventName, profileUrl }),
          });
          if (!result.error) {
            await uref.update({ profileReminderSent: true, profileReminderSentAt: new Date().toISOString() });
            if (emailedThisRun) emailedThisRun.add(String(u.email).toLowerCase().trim());
            sent++;
            console.log(`✅ profile reminder → users/${r.userId}`);
          } else { skipped++; }
        } catch (e) { console.error('[profile-reminder]', r.userId, e.message); skipped++; }
      }
    }
  } catch (e) {
    console.error('[profile-reminder] pass failed:', e.message);
  }
  return { sent, skipped };
}

// ── Post-event "who did you click with" prompt ──────────────────────────────
// The morning after an event, email every confirmed attendee (from tickets OR
// event_registrations) a no-login magic link (makeMatchUrl) to the /matches
// page where they pick who they clicked with. Idempotent via `postEventPromptSent`
// (per attendee × event, deduped by uid across both collections, so a person is
// emailed once even with docs in both). Best-effort: a failure here never breaks
// the nurture or profile-reminder passes.
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

async function auditPostEventPrompts(nowMs, eventId) {
  const candidates = [];
  try {
    const since = new Date(nowMs - POST_EVENT_LOOKBACK_DAYS * 86400000);
    const evQuery = eventId
      ? await db.collection('events').doc(eventId).get().then(d => d.exists ? [d] : [])
      : await db.collection('events').where('date', '>=', since).where('date', '<=', new Date(nowMs)).get().then(s => s.docs);
    for (const evDoc of evQuery) {
      const [erSnap, lockSnap] = await Promise.all([
        db.collection('event_registrations').where('eventId', '==', evDoc.id).get(),
        db.collection('post_event_prompts').where('eventId', '==', evDoc.id).get(),
      ]);
      const sentLock = new Set(lockSnap.docs.map(d => d.data().userId).filter(Boolean));
      const seen = new Set();
      for (const er of erSnap.docs) {
        const r = er.data();
        if (r.status !== 'confirmed' || !r.userId || seen.has(r.userId)) continue;
        seen.add(r.userId);
        const usnap = await db.collection('users').doc(r.userId).get();
        const email = usnap.exists ? usnap.data().email : null;
        const phone = usnap.exists ? usnap.data().phone : null;
        candidates.push({
          uid: r.userId, email: email || null, hasPhone: !!(phone && phone.trim()),
          alreadySent: sentLock.has(r.userId) || !!r.postEventPromptSent, src: r.source || 'reg',
          eventId: evDoc.id, eventTitle: evDoc.data().title || evDoc.id,
        });
      }
    }
  } catch (e) { console.error('[post-event-audit] failed:', e.message); }
  return candidates;
}

async function sendPostEventPrompts(nowMs, emailedThisRun, testUid = null, resendUids = null) {
  let sent = 0, skipped = 0;
  try {
    const since = new Date(nowMs - POST_EVENT_LOOKBACK_DAYS * 86400000);
    const evSnap = await db.collection('events')
      .where('date', '>=', since)
      .where('date', '<=', new Date(nowMs))
      .get();
    for (const evDoc of evSnap.docs) {
      const eventName = evDoc.data().title || 'your SparkDate event';
      // event_registrations is the single source of truth for attendance.
      // Every confirmed attendee — ticket buyer, check-in, or admin-enrolled —
      // has exactly one reg_{uid}_{eventId} doc here. No need to query tickets.
      const erSnap = await db.collection('event_registrations').where('eventId', '==', evDoc.id).get();

      // resendUids bypasses alreadySent for listed uids — used to resend to
      // specific attendees who were missed without re-sending to everyone.
      const resendSet = resendUids ? new Set(resendUids) : null;

      // Primary idempotency lock lives in a dedicated collection that is ONLY
      // written by this code and never touched by migration scripts, check-in
      // handlers, or enrollment flows. Belt-and-suspenders: also honour the
      // legacy postEventPromptSent field on event_registrations docs.
      const lockSnap = await db.collection('post_event_prompts').where('eventId', '==', evDoc.id).get();
      const alreadySent = new Set();
      for (const lockDoc of lockSnap.docs) {
        const d = lockDoc.data();
        if (d.userId && !(resendSet && resendSet.has(d.userId))) alreadySent.add(d.userId);
      }
      for (const er of erSnap.docs) {
        const r = er.data();
        if (r.postEventPromptSent && r.userId && !(resendSet && resendSet.has(r.userId))) alreadySent.add(r.userId);
      }

      const seen = new Set();
      const candidates = [];
      for (const er of erSnap.docs) {
        const r = er.data();
        if (r.status !== 'confirmed' || !r.userId) { skipped++; continue; }
        if (alreadySent.has(r.userId) || seen.has(r.userId)) { skipped++; continue; }
        seen.add(r.userId);
        candidates.push({ uid: r.userId, ref: er.ref, src: 'reg' });
      }
      for (const cand of candidates) {
        // testUid: single-recipient dry-run before the real blast
        // resendUids: restrict to listed uids only
        if (testUid && cand.uid !== testUid) { skipped++; continue; }
        if (resendSet && !resendSet.has(cand.uid)) { skipped++; continue; }
        const usnap = await db.collection('users').doc(cand.uid).get();
        const email = usnap.exists ? usnap.data().email : null;
        if (!email) { skipped++; continue; }
        try {
          const result = await resend.emails.send({
            from: 'SparkDate <hello@mail.sparkdate.date>',
            to: email,
            subject: `Who did you click with at ${eventName}?`,
            html: postEventPromptHTML({ eventName, matchUrl: makeMatchUrl(cand.uid) }),
          });
          if (!result.error) {
            const sentAt = new Date().toISOString();
            const lockRef = db.collection('post_event_prompts').doc(`${cand.uid}_${evDoc.id}`);
            await Promise.all([
              lockRef.set({ userId: cand.uid, eventId: evDoc.id, sentAt }),
              cand.ref.update({ postEventPromptSent: true, postEventPromptSentAt: sentAt }),
            ]);
            if (emailedThisRun) emailedThisRun.add(String(email).toLowerCase().trim());
            sent++;
            console.log(`✅ post-event prompt → ${cand.src}/${cand.ref.id}`);
          } else { skipped++; }
        } catch (e) { console.error('[post-event-prompt]', cand.ref.id, e.message); skipped++; }
      }
    }
  } catch (e) {
    console.error('[post-event-prompt] pass failed:', e.message);
  }
  return { sent, skipped };
}

// ── Handler ───────────────────────────────────────────────────────────────────
// ── Bi-weekly newsletter (separate from nurture sequence) ───────────────────
// Sends to ALL subscribed leads (independent of nurture day/status).
// Tracks lastNewsletterSentAt; resends every 14+ days. Uses rotating templates.
async function sendBiweeklyNewsletter(leads, nowMs, event, emailedThisRun) {
  let sent = 0, skipped = 0;

  // ONE issue for everyone this fortnight. A GLOBAL index that advances every
  // 14 days — so the whole list receives the same newsletter in sequence,
  // instead of each lead getting a different issue seeded off their own signup
  // date (which is what made the sends look scattershot / out of order).
  const issueIndex = Math.floor(nowMs / (14 * 86400000)) % NEWSLETTER_EMAILS.length;
  const tpl = NEWSLETTER_EMAILS[issueIndex];
  const ctaUrl = buildUtmUrl('/events', 'email', 'newsletter', 'biweekly');

  for (const leadDoc of leads) {
    const lead = leadDoc.data();
    const email = (lead.email || '').toLowerCase().trim();
    if (!email) { skipped++; continue; }

    // Lowest-priority pass: yield to anyone already emailed this run.
    if (emailedThisRun.has(email)) { skipped++; continue; }

    // Per-lead 14-day cooldown (belt-and-suspenders with the fortnightly gate).
    const lastSent = lead.lastNewsletterSentAt
      ? (new Date(lead.lastNewsletterSentAt).getTime())
      : null;
    if (lastSent && (nowMs - lastSent) < 14 * 86400000) { skipped++; continue; }

    if (!event) { skipped++; continue; } // Need event for card

    try {
      const html = tpl.html(esc(lead.firstName || lead.name || 'there'), event, ctaUrl);

      const result = await resend.emails.send({
        from: 'SparkDate <hello@mail.sparkdate.date>',
        to: lead.email,
        subject: tpl.subject,
        html,
        headers: {
          'List-Unsubscribe': `<${makeUnsubscribeUrl(leadDoc.id, lead.email)}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      });

      if (!result.error) {
        await leadDoc.ref.update({
          lastNewsletterSentAt: new Date().toISOString(),
          newsletterSendCount: (lead.newsletterSendCount || 0) + 1,
        });
        emailedThisRun.add(email);
        sent++;
        console.log(`✅ newsletter[${issueIndex}] → leads/${leadDoc.id}`);
      } else {
        skipped++;
      }
    } catch (e) {
      console.error('[newsletter]', leadDoc.id, e.message);
      skipped++;
    }
  }

  return { sent, skipped, issueIndex };
}

// ── Post-nurture event campaigns (2-week cadence after Day 25) ──────────────
// Sends to leads with day25_sent=true, every 14+ days, max 12 times.
// Tracks lastEventEmailSentAt + eventEmailsCount.
async function sendPostNurtureEventCampaign(leads, nowMs, event, emailedThisRun) {
  let sent = 0, skipped = 0;

  for (const leadDoc of leads) {
    const lead = leadDoc.data();
    const email = (lead.email || '').toLowerCase().trim();
    if (!email || lead.day25_sent !== true) { skipped++; continue; }

    // Yield to higher-priority passes already run this cycle.
    if (emailedThisRun.has(email)) { skipped++; continue; }

    // Max 12 emails (6 months of bi-weekly)
    const count = lead.eventEmailsCount || 0;
    if (count >= 12) { skipped++; continue; }

    // Eligibility: no email sent yet, or last sent > 14 days ago
    const lastSent = lead.lastEventEmailSentAt
      ? (new Date(lead.lastEventEmailSentAt).getTime())
      : null;
    if (lastSent && (nowMs - lastSent) < 14 * 86400000) { skipped++; continue; }

    if (!event) { skipped++; continue; } // Need event for card

    try {
      const ctaUrl = buildUtmUrl('/event?id=' + event.id, 'email', 'event_campaign', 'post_nurture');

      const html = shell(
        h1('Our next mixer is coming') +
        p(`${esc(lead.firstName || lead.name || 'There')}, we're hosting our next mixer soon.`) +
        p('Same format: short conversations, real connections, no app swiping.') +
        eventCardHtml(event) +
        ctaButtonHtml(ctaUrl, 'Reserve your spot') +
        p('See you there,<br>The SparkDate Team')
      );

      const result = await resend.emails.send({
        from: 'SparkDate <hello@mail.sparkdate.date>',
        to: lead.email,
        subject: `${event.title} is coming up`,
        html,
        headers: {
          'List-Unsubscribe': `<${makeUnsubscribeUrl(leadDoc.id, lead.email)}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      });

      if (!result.error) {
        await leadDoc.ref.update({
          lastEventEmailSentAt: new Date().toISOString(),
          eventEmailsCount: count + 1,
        });
        emailedThisRun.add(email);
        sent++;
        console.log(`✅ post-nurture event → leads/${leadDoc.id}`);
      } else {
        skipped++;
      }
    } catch (e) {
      console.error('[post-nurture-event]', leadDoc.id, e.message);
      skipped++;
    }
  }

  return { sent, skipped };
}

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
  // Scoped manual trigger. `?only=postevent` runs ONLY the post-event prompt
  // pass — so an admin can (re)send the morning-after match links WITHOUT also
  // firing the fortnightly newsletter / nurture sequence to the whole leads
  // list (which a bare `?force=1` would do, since force bypasses those gates).
  const only = req.query?.only || req.body?.only || null;
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
    const dayNum = Math.floor(nowMs / 86400000); // UTC day index, for fortnight gates

    // ONE email per person per run, shared across EVERY pass and keyed by
    // (lowercased) email. Passes run in priority order below; whichever sends
    // first claims the address and the rest yield — no more double-emailing.
    const emailedThisRun = new Set();

    // Scoped trigger: run ONLY the post-event prompt pass and return. Lets an
    // admin (re)send the morning-after match links on demand without touching
    // the marketing passes below.
    // ?testUid=<uid>          — dry-run to one person before the real blast
    // ?resendUids=uid1,uid2   — resend to specific uids (bypasses alreadySent)
    // ?audit=1&eventId=X      — preview who WOULD receive the email (no sends)
    if (only === 'postevent') {
      const testUid    = req.query?.testUid    || req.body?.testUid    || null;
      const resendRaw  = req.query?.resendUids || req.body?.resendUids || null;
      const resendUids = resendRaw ? String(resendRaw).split(',').map(s => s.trim()).filter(Boolean) : null;
      const audit      = (req.query?.audit === '1' || req.body?.audit === '1');
      const auditEventId = req.query?.eventId || req.body?.eventId || null;

      if (audit) {
        // Return the candidate list without sending anything
        const candidates = await auditPostEventPrompts(nowMs, auditEventId);
        console.log(`✅ Cron audit (only=postevent, eventId=${auditEventId}):`, candidates.length, 'candidates');
        return res.status(200).json({ success: true, audit: true, eventId: auditEventId, candidates, ts: new Date().toISOString() });
      }

      const postEventPrompts = await sendPostEventPrompts(nowMs, emailedThisRun, testUid, resendUids);
      console.log(`✅ Cron (only=postevent${testUid ? `, testUid=${testUid}` : ''}${resendUids ? `, resendUids=${resendUids.join(',')}` : ''}):`, JSON.stringify(postEventPrompts));
      return res.status(200).json({ success: true, only: 'postevent', testUid: testUid || null, resendUids: resendUids || null, postEventPrompts, ts: new Date().toISOString() });
    }

    // 1) Transactional, time-sensitive — always send, and claim the address so
    //    marketing yields to them. (These run over ticket-holders, not leads.)
    const profileReminders = await sendProfileReminders(nowMs, emailedThisRun);
    const postEventPrompts = await sendPostEventPrompts(nowMs, emailedThisRun);

    // 2) Nurture sequence (day 2/5/14/25) — one bucket-email per lead per run.
    const results = [];
    for (const [d, key] of [[2, 'day2'], [5, 'day5'], [14, 'day14'], [25, 'day25']]) {
      results.push(await sendBucket(leads, d, key, nowMs, emailedThisRun, event));
    }

    // 3) Post-nurture event campaign — fortnightly, offset one week from the
    //    newsletter (dayNum % 14 === 7) so the two marketing tracks never blast
    //    on the same day. `force` (manual trigger) bypasses the cadence gate.
    const postNurtureEvents = (force || dayNum % 14 === 7)
      ? await sendPostNurtureEventCampaign(leads, nowMs, event, emailedThisRun)
      : { sent: 0, skipped: 0, gated: true };

    // 4) Bi-weekly newsletter — fortnightly issue day (dayNum % 14 === 0),
    //    lowest priority so it yields to all of the above.
    const newsletter = (force || dayNum % 14 === 0)
      ? await sendBiweeklyNewsletter(leads, nowMs, event, emailedThisRun)
      : { sent: 0, skipped: 0, gated: true };

    console.log(`✅ Cron complete (${leads.length} subscribed leads):`, JSON.stringify(results), 'profileReminders=', JSON.stringify(profileReminders), 'postEventPrompts=', JSON.stringify(postEventPrompts), 'newsletter=', JSON.stringify(newsletter), 'postNurtureEvents=', JSON.stringify(postNurtureEvents));
    return res.status(200).json({ success: true, leads: leads.length, event: event ? event.id : null, results, profileReminders, postEventPrompts, newsletter, postNurtureEvents, ts: new Date().toISOString() });

  } catch (err) {
    console.error('❌ Cron error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};

// Exported for unit tests (tests/email-render.test.js).
module.exports.EMAILS = EMAILS;
