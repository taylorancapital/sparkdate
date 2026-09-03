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
const { makeAddGuestUrl } = require('../lib/add-guest');
const { resolveLeadName } = require('../lib/lead-name');
const { logEventAttended } = require('../lib/activity-log');
const { makeProfileUrl, makeMatchUrl } = require('../lib/profile-link');
const { EMAIL_CAMPAIGNS: UTM, buildUtmUrl } = require('../lib/utm');
const { getNextEvent, normalizeEvent, eventCardHtml, ctaButtonHtml, ctaLinkHtml, urgencyBox, shell, h1, p, esc } = require('../lib/next-event');
const { buildAttendanceIndex } = require('../lib/attendance-index');
const { EMAIL_FROM, EMAIL_REPLY_TO, listUnsubscribeHeader } = require('../lib/email-sender');

const db = admin.firestore();
const resend = new Resend(process.env.RESEND_API_KEY);

// ── Email templates ──────────────────────────────────────────────────
// Each html(firstName, event, ctaUrl) returns a full HTML doc. `firstName`
// is pre-escaped by the caller; `event` may be null (evergreen fallback);
// `ctaUrl` is a UTM-tagged link to the next event (or /events).

// Opening-line builder: "Alex, quick stat: ..." when we know a first name,
// plain "Quick stat: ..." when we don't. Never "there, quick stat" — a
// generic placeholder greeting reads as a mail-merge failure, so with no
// name the sentence simply starts normally (capitalized).
const lede = (firstName, rest) => firstName
  ? `${firstName}, ${rest}`
  : rest.charAt(0).toUpperCase() + rest.slice(1);

const EMAILS = {
  // Email 2 (Day 7 in the spec): the conversion-math hook.
  day2: {
    subject: '70% of people exchange contact info',
    html: (firstName, event, ctaUrl) => shell(
      h1('70% exchange contact info.') +
      p(lede(firstName, `quick stat: roughly <strong>70% of people who come to a SparkDate night</strong> leave having swapped contact info with someone.`)) +
      p('On the apps? Match-to-date conversion is closer to 0.5%.') +
      p("The difference is simple — you're meeting face to face, where chemistry is instant, instead of texting for three weeks until the thread quietly dies.") +
      `<div style="background:#f5f3f0;border-left:3px solid #ff6b6b;padding:16px 20px;margin:16px 0;font-size:15px;line-height:1.8;color:#1a1f3a;">
        <strong>The apps:</strong> 6 months · 12 matches · 0 dates<br>
        <strong>SparkDate:</strong> one night · 12 conversations · a couple of real ones
      </div>` +
      p('One night beats six months. Every time.') +
      eventCardHtml(event) +
      ctaButtonHtml(ctaUrl, 'Get Tickets') +
      cantMakeItLine('nurture', 'day2_browse_all') +
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
      p(lede(firstName, `our mixers are intentionally small — enough people to meet a dozen new faces, few enough that it never feels like a cattle call.`)) +
      p("That also means seats go quickly. If you've been thinking about it, grab yours before it fills.") +
      eventCardHtml(event) +
      urgencyBox('⏰ <strong>We cap every event on purpose.</strong> Lock in your seat while there\'s room.') +
      ctaButtonHtml(ctaUrl, 'Reserve Your Spot') +
      cantMakeItLine('nurture', 'day5_browse_all') +
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
        p(lede(firstName, `nervous? Don't be. Here's how a SparkDate night actually runs:`)) +
        `<div style="background:#f5f3f0;border-left:3px solid #ff6b6b;padding:16px 20px;margin:16px 0;font-size:15px;line-height:1.8;color:#1a1f3a;">
          <strong>Doors at ${doors}.</strong> Check in and say hi to your host.<br>
          <strong>First 15&ndash;20 minutes: open mixing.</strong> Grab a drink, settle in, talk to whoever's nearby.<br>
          <strong>Then we break into tables.</strong> An icebreaker to get conversation going &mdash; cards and prompts, nothing you have to prepare for.<br>
          <strong>You'll move between conversations</strong> so you meet plenty of people &mdash; but it's relaxed. No bell, no stopwatch, no scorecard.<br>
          <strong>Then: open mingling.</strong> Swap numbers with anyone you clicked with.
        </div>` +
        p('Bring yourself and an open mind. Leave the expectations (and the nerves — everyone\'s a little nervous) at the door.') +
        eventCardHtml(event) +
        ctaButtonHtml(ctaUrl, 'Get Tickets') +
        cantMakeItLine('nurture', 'day14_browse_all') +
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
      p(lede(firstName, `our next SparkDate night is <strong>${event ? esc(event.daysAwayLabel) : 'coming up'}</strong> — and we'd love to see you there.`)) +
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

// ── Newsletter templates (weekly, rotating 12-week cycle) ─────────────
// Value-first content that stands on its own (a tip, a reframe, a story) —
// deliberately distinct from the day2/5/14/25 nurture hooks (the 70% stat,
// the scarcity nudge, the round-by-round format) so a lead who finished the
// sequence never gets the same content twice. The event card sits at the
// BOTTOM and degrades to an evergreen card when nothing is scheduled, so an
// issue still reads like a newsletter — not an ad — in a gap week.
const newsletterTip = (html) =>
  `<div style="background:#f5f3f0;border-left:3px solid #ff6b6b;padding:16px 20px;margin:18px 0;font-size:15px;line-height:1.8;color:#1a1f3a;">${html}</div>`;

// Secondary, low-commitment path for a reader who can't make the ONE
// specific event ctaButtonHtml points at (dated to a single next mixer).
// Takes its own (medium, campaign) — same shape as the primary CTA's
// buildUtmUrl call in each pass — so a nurture-email click isn't misattributed
// to utm_medium=newsletter in GA4, and each day-bucket/issue tracks separately.
const cantMakeItLine = (medium, campaign) =>
  p(`Can't make this one? ${ctaLinkHtml(buildUtmUrl('/events', 'email', medium, campaign), 'See all upcoming events')}.`);

const NEWSLETTER_EMAILS = [
  // 1 — Conversation starters (practical, evergreen)
  {
    subject: 'The question that always gets a real answer',
    html: (firstName, event, ctaUrl) => shell(
      h1('Skip the interview. Get curious.') +
      p(lede(firstName, `most first conversations stall for one reason: they turn into a job interview. "What do you do?" "Where are you from?" "How was your week?" Polite — and forgettable.`)) +
      p('The fix is to trade the résumé questions for genuinely curious ones. You already do this with people you love; you just forget to at the start with someone new.') +
      newsletterTip(`<strong>Try one of these:</strong><br>• "What have you been weirdly into lately?"<br>• "What's something you'd happily talk about for an hour?"<br>• "If you could teleport to dinner anywhere tonight, where?"`) +
      p("Real questions get real answers. That's where the spark actually lives.") +
      eventCardHtml(event) +
      ctaButtonHtml(ctaUrl, 'Put it into practice') +
      cantMakeItLine('newsletter', 'browse_all') +
      p('Talk soon,<br>The SparkDate Team')
    ),
  },
  // 2 — Chemistry > checklist (reframe; NOT the day2 numbers hook)
  {
    subject: 'Chemistry beats the checklist',
    html: (firstName, event, ctaUrl) => shell(
      h1('Perfect on paper, nothing in person?') +
      p(lede(firstName, `almost everyone has met someone who ticked every box — right job, right height, right taste in music — and felt absolutely nothing across the table.`)) +
      p("That's not a flaw in you. Attraction is something you feel in person: a laugh at the same moment, the way a conversation speeds up. No profile can predict it, which is exactly why scrolling one tells you so little.") +
      p('Meeting face to face just skips to the part that actually decides things.') +
      eventCardHtml(event) +
      ctaButtonHtml(ctaUrl, 'Meet someone in person') +
      cantMakeItLine('newsletter', 'browse_all') +
      p('Talk soon,<br>The SparkDate Team')
    ),
  },
  // 3 — Venue / regional spotlight (Lancaster & Philadelphia)
  {
    subject: 'Why we obsess over the room',
    html: (firstName, event, ctaUrl) => shell(
      h1('The room does half the work.') +
      p(lede(firstName, `a good night isn't an accident — it's mostly the room. Too loud and you're shouting. Too cavernous and it feels like a conference. Too dim and nobody can read the moment.`)) +
      p('So we\'re picky. Across Lancaster and Philadelphia we look for the same things: warm lighting, corners you can actually talk in, a bar that\'s busy but not a scrum, and staff who get what we\'re doing.') +
      p("Show up, and the hardest part — feeling at ease — is already handled.") +
      eventCardHtml(event) +
      ctaButtonHtml(ctaUrl, 'See where we\'re headed next') +
      cantMakeItLine('newsletter', 'browse_all') +
      p('Talk soon,<br>The SparkDate Team')
    ),
  },
  // 4 — Nerves reassurance (emotional angle; NOT the day14 format breakdown)
  {
    subject: 'Everyone there is a little nervous too',
    html: (firstName, event, ctaUrl) => shell(
      h1('The secret nobody says out loud.') +
      p(lede(firstName, `the number one thing people worry about before a mixer: "What if it's awkward?"`)) +
      p("Here's the part that changes everything — everyone in the room is feeling exactly that, and everyone chose to come anyway. Nobody's hiding behind a screen, nobody's half-watching their phone. You're all there for the same honest reason.") +
      p('That shared little flutter of nerves? It\'s the great equalizer. Ten minutes in, it\'s gone — and you\'re just two people talking.') +
      eventCardHtml(event) +
      ctaButtonHtml(ctaUrl, 'Come as you are') +
      cantMakeItLine('newsletter', 'browse_all') +
      p('Talk soon,<br>The SparkDate Team')
    ),
  },
  // 5 — What happens after you click (the matching loop)
  {
    subject: 'The best part happens later that night',
    html: (firstName, event, ctaUrl) => shell(
      h1('No awkward Instagram hunt.') +
      p(lede(firstName, `the night itself is fun — but the best part comes at 9pm, once you're home.`)) +
      p("You tell us, privately, who you'd like to see again. If they pick you too, we share contact info so you can actually meet up. No guessing whether they felt it. No tracking anyone down. No missed signals.") +
      p('It\'s the closure the apps never give you: you find out, and if it\'s mutual, you\'re connected.') +
      eventCardHtml(event) +
      ctaButtonHtml(ctaUrl, 'Find your next connection') +
      cantMakeItLine('newsletter', 'browse_all') +
      p('Talk soon,<br>The SparkDate Team')
    ),
  },
  // 6 — The case for IRL (warm, no stats dump)
  {
    subject: 'One evening vs. another month of swiping',
    html: (firstName, event, ctaUrl) => shell(
      h1('Put the phone down (lovingly).') +
      p(lede(firstName, `you could spend the next month swiping — sorting people into yes and no piles, scheduling dates that fall through, decoding three-word replies.`)) +
      p('Or you could spend one evening in a room full of people who also decided they\'d rather just meet someone. Same goal, wildly different odds.') +
      p("The apps are a waiting room. This is the actual appointment.") +
      eventCardHtml(event) +
      ctaButtonHtml(ctaUrl, 'Trade swiping for meeting') +
      cantMakeItLine('newsletter', 'browse_all') +
      p('Talk soon,<br>The SparkDate Team')
    ),
  },
  // 7 — First impressions, demystified (practical; NOT the day14 format walkthrough)
  {
    subject: "First impressions aren't what you think",
    html: (firstName, event, ctaUrl) => shell(
      h1('Nobody remembers your opening line.') +
      p(lede(firstName, `people stress for days about what to SAY in the first thirty seconds. Here's the relief: almost nobody remembers the words. What they remember is how the moment felt.`)) +
      p('And the feeling comes from things that cost you nothing: turning to face them fully, actually listening to the answer you asked for, laughing when something\'s funny instead of planning your next line.') +
      newsletterTip(`<strong>The whole cheat code:</strong><br>• Ask, then actually listen.<br>• React honestly — a real laugh beats a clever line.<br>• Let a pause be a pause. Comfort reads as confidence.`) +
      p('Presence beats polish. Every time.') +
      eventCardHtml(event) +
      ctaButtonHtml(ctaUrl, 'Practice on real people') +
      cantMakeItLine('newsletter', 'browse_all') +
      p('Talk soon,<br>The SparkDate Team')
    ),
  },
  // 8 — After the number swap (post-event follow-up; useful even to non-attendees)
  {
    subject: 'You got their number. Now what?',
    html: (firstName, event, ctaUrl) => shell(
      h1('The follow-up is simpler than you think.') +
      p(lede(firstName, `the most common place a real-life spark fizzles isn't the meeting — it's the two days after, when both people wait for the other to text first.`)) +
      p('So here\'s permission to be the one who moves: reference the actual conversation you had ("still thinking about your defense of pineapple pizza"), suggest one concrete plan, and give it a day and a time.') +
      newsletterTip(`<strong>The template:</strong> callback to your conversation + one specific invite + a real day. "Loved arguing about pizza with you — cocktails at that place you mentioned, Thursday?" Done.`) +
      p('Vague "we should hang out sometime" texts die. Specific ones turn into dates.') +
      eventCardHtml(event) +
      ctaButtonHtml(ctaUrl, 'Meet someone worth texting') +
      cantMakeItLine('newsletter', 'browse_all') +
      p('Talk soon,<br>The SparkDate Team')
    ),
  },
  // 9 — Small rooms beat big parties (why the format works; NOT the day5 scarcity nudge)
  {
    subject: 'Why 25 people beats 250',
    html: (firstName, event, ctaUrl) => shell(
      h1('Big parties are terrible for meeting people.') +
      p(lede(firstName, `it sounds backwards, but the giant singles party is where connections go to die: everyone clusters with the friends they came with, the room's too loud to talk, and you leave having "met" no one.`)) +
      p('A small room flips it. When there are twenty-five people and a structure that hands you the introduction, you actually talk to most of the room — and conversation, not proximity, is where anything real starts.') +
      p("We keep our mixers small on purpose. It's not exclusivity for its own sake; it's just what works.") +
      eventCardHtml(event) +
      ctaButtonHtml(ctaUrl, 'Grab a seat in the small room') +
      cantMakeItLine('newsletter', 'browse_all') +
      p('Talk soon,<br>The SparkDate Team')
    ),
  },
  // 10 — Dating burnout reset (empathy angle; meets tired-of-apps readers where they are)
  {
    subject: "If dating feels like a chore, read this",
    html: (firstName, event, ctaUrl) => shell(
      h1("Burnout isn't a you problem.") +
      p(lede(firstName, `if the whole thing has started to feel like a second job — the swiping, the small talk reruns, the ghosting — that's not because you're doing it wrong. It's because the format is exhausting by design.`)) +
      p('The reset isn\'t trying harder at the same thing. It\'s changing the setting: one low-stakes evening where the only task is to have a few good conversations. No profiles to maintain, no threads to keep alive.') +
      p('Worst case, you had a fun night out. That\'s the floor. The apps can\'t even promise that.') +
      eventCardHtml(event) +
      ctaButtonHtml(ctaUrl, 'Try the low-stakes version') +
      cantMakeItLine('newsletter', 'browse_all') +
      p('Talk soon,<br>The SparkDate Team')
    ),
  },
  // 11 — Bring a friend (social permission + referral behavior, no incentive program)
  {
    subject: 'The move: bring your single friend',
    html: (firstName, event, ctaUrl) => shell(
      h1('Everything is easier with a wingperson.') +
      p(lede(firstName, `the single biggest unlock for a nervous first-timer isn't a pep talk — it's walking in with a friend. You settle faster, you laugh more, and you both still rotate through the same conversations you came for.`)) +
      p('And there\'s a selfish bonus: your friend notices things you don\'t. "You two were vibing" from someone who knows you is worth ten maybes from your own second-guessing.') +
      p('So forward this to your favorite single person and make it a plan. Seriously — right now, while you\'re thinking of it.') +
      eventCardHtml(event) +
      ctaButtonHtml(ctaUrl, 'Get tickets for two') +
      cantMakeItLine('newsletter', 'browse_all') +
      p('Talk soon,<br>The SparkDate Team')
    ),
  },
  // 12 — What "chemistry" actually is (curiosity/science-lite; NOT issue 2's checklist reframe)
  {
    subject: 'Chemistry is faster than you think',
    html: (firstName, event, ctaUrl) => shell(
      h1('Ninety seconds.') +
      p(lede(firstName, `researchers who study attraction keep landing on the same uncomfortable-but-freeing finding: people sense whether there's *something there* within the first couple of minutes of meeting. Not from looks alone — from rhythm. Pace of the back-and-forth, shared timing on a laugh, whether silence feels easy.`)) +
      p("Uncomfortable, because no amount of profile-polishing can fake it. Freeing, because it means you don't need an hour-long date to find out — you need a few real minutes.") +
      p('Which is the entire logic of a mixer: a dozen ninety-second verdicts in one night, instead of a dozen dinner dates spread over a year.') +
      eventCardHtml(event) +
      ctaButtonHtml(ctaUrl, 'Run the experiment') +
      cantMakeItLine('newsletter', 'browse_all') +
      p('Talk soon,<br>The SparkDate Team')
    ),
  },
];

// Max days an email may go out past its target day. Wide enough to ride
// out a missed cron run / a backlog; tight enough that the day25 mail
// never reaches someone who signed up months ago.
const MAX_LATE_DAYS = 21;

// A lead older than this has aged past every nurture bucket (25 + 21) and
// can never receive another dayN email. Post-nurture eligibility below uses
// this to rescue leads that fell out of the sequence without day25_sent —
// otherwise they'd sit in a dead zone: too old for nurture, and excluded
// from the long-term campaign track that keys off a flag they never got.
const NURTURE_AGED_OUT_DAYS = 25 + MAX_LATE_DAYS;

// Firestore Timestamp | ISO string | Date → epoch ms (or null).
function leadCreatedMs(lead) {
  const created = lead.createdAt?.toDate ? lead.createdAt.toDate()
                : (lead.createdAt ? new Date(lead.createdAt) : null);
  return (created && !isNaN(created.getTime())) ? created.getTime() : null;
}

// Minimum days between the two MARKETING tracks (newsletter ↔ post-nurture
// event campaign) hitting the same inbox. Both tracks now run daily with
// per-lead 14-day cooldowns (self-healing — a missed cron day just delays a
// send instead of skipping a whole fortnight), so this spacing is what keeps
// one person from getting both marketing emails in the same week.
const CROSS_TRACK_SPACING_DAYS = 7;

// ── Send one day-bucket's email to every eligible lead ───────────────
async function sendBucket(leads, dayNum, emailKey, nowMs, emailedThisRun, event, attendedEmails, nameByEmail, registeredUpcomingEmails) {
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

    // Already attended a mixer? The day2/5/14/25 sequence is first-timer
    // education ("nervous? here's what to expect") — wrong audience for someone
    // who's already walked in the door. They get the returning-attendee invite
    // + newsletter instead. (attendedEmails is built from confirmed
    // event_registrations, the single source of truth for attendance.)
    if (attendedEmails && attendedEmails.has(email)) { skipped++; continue; }

    // Holding a ticket for an upcoming event? The whole sequence is wrong
    // for them too — day2/5/25 pitch a ticket they already own, and day14's
    // explainer reaches them better timed to their event via the pre-event
    // countdown pass (sendPreEventEmails). State-based, so if the ticket is
    // refunded this suppression lifts by itself and nurture resumes where
    // the flags left off.
    if (registeredUpcomingEmails && registeredUpcomingEmails.has(email)) { skipped++; continue; }

    // Already sent? A MISSING `${emailKey}_sent` field reads as falsy
    // here, so leads created before those fields existed are picked up.
    if (lead[`${emailKey}_sent`]) { skipped++; continue; }

    const createdMs = leadCreatedMs(lead);
    if (createdMs === null) { skipped++; continue; }

    // Eligible from dayNum days old, up to dayNum + MAX_LATE_DAYS.
    const ageDays = (nowMs - createdMs) / 86400000;
    if (ageDays < dayNum || ageDays > dayNum + MAX_LATE_DAYS) { skipped++; continue; }

    const firstName = esc(resolveLeadName(lead, nameByEmail, ''));
    const tmpl      = EMAILS[emailKey];
    const unsubUrl  = makeUnsubscribeUrl(leadDoc.id, lead.email);
    // CTA → the specific next event's checkout when we have one, else /events.
    const ctaUrl = event
      ? buildUtmUrl('/event?id=' + event.id, 'email', 'nurture', emailKey)
      : ((UTM[emailKey] && UTM[emailKey].events) || buildUtmUrl('/events', 'email', 'nurture', emailKey));

    try {
      const result = await resend.emails.send({
        from:    EMAIL_FROM,
        reply_to: EMAIL_REPLY_TO,
        to:      lead.email,
        subject: tmpl.subject,
        // Per-lead unsubscribe URL is interpolated AFTER template render —
        // each Resend send gets its own signed token so a recipient can
        // unsubscribe themselves but can't unsubscribe anyone else.
        html:    tmpl.html(firstName, event, ctaUrl).replace(/__UNSUB__/g, unsubUrl),
        // RFC 8058: native one-click unsubscribe for Gmail / iOS / Outlook.
        headers: {
          'List-Unsubscribe':      listUnsubscribeHeader(unsubUrl),
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
<div class="footer"><p>SparkDate · Lancaster &amp; Philadelphia · Real people. Real venues.</p>
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

      // Idempotency lock lives in a dedicated collection keyed per (uid,
      // eventId) — same pattern as post_event_prompts below, and for the
      // same reason: a flag on the shared users/{uid} doc has no eventId
      // in it, so once set for one event it silently blocks every future
      // event too. Belt-and-suspenders: also honour the legacy
      // profileReminderSent field on users/{uid} below via `u.profileCompleted`
      // co-check — but the lock itself now determines "already sent."
      const lockSnap = await db.collection('profile_reminders_sent').where('eventId', '==', evDoc.id).get();
      const alreadySent = new Set(lockSnap.docs.map((d) => d.data().userId).filter(Boolean));

      const seen = new Set();
      for (const reg of regSnap.docs) {
        const r = reg.data();
        if (r.status !== 'confirmed' || !r.userId || seen.has(r.userId)) { skipped++; continue; }
        seen.add(r.userId);
        if (alreadySent.has(r.userId)) { skipped++; continue; }
        const uref = db.collection('users').doc(r.userId);
        const usnap = await uref.get();
        if (!usnap.exists) { skipped++; continue; }
        const u = usnap.data();
        if (u.profileCompleted === true || !u.email) { skipped++; continue; }
        try {
          const profileUrl = makeProfileUrl(r.userId);
          const result = await resend.emails.send({
            from: EMAIL_FROM,
            reply_to: EMAIL_REPLY_TO,
            to: u.email,
            subject: `Before ${eventName} — a 60-second profile so we can match you`,
            html: profileReminderHTML({ eventName, profileUrl }),
          });
          if (!result.error) {
            const sentAt = new Date().toISOString();
            const lockRef = db.collection('profile_reminders_sent').doc(`${r.userId}_${evDoc.id}`);
            await Promise.all([
              lockRef.set({ userId: r.userId, eventId: evDoc.id, sentAt }),
              uref.update({ profileReminderSent: true, profileReminderSentAt: sentAt }),
            ]);
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

// ── Pre-event countdown for ticket-holders ──────────────────────────────────
// The buy-a-ticket pitches (day2/5/25 nurture + post-nurture campaign) are
// suppressed for anyone holding a ticket to an upcoming event (see
// lib/attendance-index.js), so this pass owns that audience instead: an
// event-date-anchored countdown that gets them ready rather than re-sold.
// Two stages per (registration × event):
//   t7 — enters the window 7 days out: "here's how the night works" (the
//        day14 explainer content, retimed to the event it's actually for).
//   t1 — the day before (also catches day-of for overnight buyers):
//        logistics + the 9pm matching explainer. The no-show killer.
// Transactional (they bought this event), so like the profile reminder and
// post-event prompt there's no unsubscribe footer. Sends to the
// registration's own email, which also covers guest buyers with no user
// doc. Idempotent via pre_event_emails/{regId}_{stage} (firestore.rules) —
// keyed by registration doc id, so it's per-person-per-event by construction.
const PRE_EVENT_WINDOW_DAYS = 7;
const PRE_EVENT_T1_DAYS = 1.5;

function preEventShellHTML({ heading, bodyHtml }) {
  const s = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f3f0;margin:0;padding:0;color:#0a0e27}
.container{max-width:600px;margin:0 auto;background:#fff}
.header{background:#0a0e27;padding:36px 30px;text-align:center}
.logo{font-family:Georgia,serif;font-size:30px;font-weight:900;color:#fff}.logo span{color:#ff6b6b}
.content{padding:36px 30px}h1{font-family:Georgia,serif;font-size:24px;margin:0 0 16px}
p{font-size:15px;line-height:1.6;color:#1a1f3a;margin:0 0 16px}
.footer{background:#0a0e27;padding:22px;text-align:center;color:#888;font-size:12px}.footer a{color:#ff6b6b;text-decoration:none}
</style></head><body><div class="container">
<div class="header"><div class="logo">Spark<span>Date</span></div></div>
<div class="content"><h1>${s(heading)}</h1>${bodyHtml}</div>
<div class="footer"><p>SparkDate · Lancaster &amp; Philadelphia · Real people. Real venues.</p>
<p><a href="https://sparkdate.date">sparkdate.date</a></p></div>
</div></body></html>`;
}

const infoBox = (html) =>
  `<div style="background:#f5f3f0;border-left:3px solid #ff6b6b;padding:16px 20px;margin:16px 0;font-size:15px;line-height:1.8;color:#1a1f3a;">${html}</div>`;

// The "your +1 is still free" block. Rendered ONLY when the caller passes a
// URL, and the caller passes one only for women — the 2-for-1 is offered to
// every buyer at checkout and ADVERTISED to women, and an email is
// advertising. content/brand.json enforces the same rule on ad copy via
// caption_rules.banned_outside_female_ad_set, which lists these exact words.
//
// The offer used to be reachable from exactly one place — the checkout modal
// — so it expired at the moment a buyer was least able to use it: deciding on
// her phone, before she had asked anyone. This is the path back.
function plusOneBlockHtml(addGuestUrl) {
  if (!addGuestUrl) return '';
  return infoBox(`<strong>Your +1 is still free.</strong><br>
Bringing someone makes the first ten minutes easier for both of you — and their seat costs nothing.<br>
<a href="${esc(addGuestUrl)}" style="color:#ff6b6b;font-weight:700">Add your guest &rarr;</a>`);
}

// stage: 't7' | 't1'. `ev` is a normalizeEvent() result; `firstName` is
// pre-escaped by the caller; `tonight` only matters for t1. `addGuestUrl` is
// null for anyone the offer is not advertised to — see plusOneBlockHtml.
function preEventEmailFor(stage, firstName, ev, tonight, addGuestUrl) {
  const doors = ev.timeLabel ? esc(ev.timeLabel) : 'the listed start time';
  if (stage === 't7') {
    return {
      subject: `You're in — here's how ${ev.title} works`,
      html: preEventShellHTML({
        heading: `${ev.title} is ${ev.daysAwayLabel || 'coming up'}.`,
        bodyHtml:
          p(lede(firstName, `your spot is locked in. Here's exactly how the night runs:`)) +
          infoBox(`<strong>Doors at ${doors}.</strong> Check in and say hi to your host.<br>
<strong>First 15&ndash;20 minutes: open mixing.</strong> Grab a drink, settle in, talk to whoever's nearby.<br>
<strong>Then we break into tables.</strong> An icebreaker to get conversation going &mdash; cards and prompts, nothing to prepare.<br>
<strong>You'll move between conversations</strong> so you meet plenty of people &mdash; but it's relaxed. No bell, no stopwatch.<br>
<strong>Then: open mingling.</strong> Stay as long as you like.`) +
          eventCardHtml(ev) +
          plusOneBlockHtml(addGuestUrl) +
          p(`And the best part: at <strong>9pm that night</strong>, we'll email you a private link to tell us who you clicked with. If they pick you too, we swap contact info — no missed signals, no awkward Instagram hunt.`) +
          p('Nothing to prep. Come as you are — everyone in the room chose to be there for the same reason.') +
          p('See you soon,<br>The SparkDate Team'),
      }),
    };
  }
  const when = tonight ? 'tonight' : 'tomorrow night';
  return {
    subject: `${tonight ? 'Tonight' : 'Tomorrow night'}: ${ev.title}`,
    html: preEventShellHTML({
      heading: `${tonight ? 'Tonight' : 'Tomorrow night'} is the night.`,
      bodyHtml:
        p(lede(firstName, `quick rundown so ${when} is effortless:`)) +
        infoBox(`<strong>Doors at ${doors}</strong> · ${esc(ev.venueLabel)}.<br>
Arrive a few minutes early to check in — the first 15&ndash;20 minutes are open mixing, so there's no hard start to miss.<br>
Just bring your phone — everything else is handled.`) +
        eventCardHtml(ev) +
        // t1 too, deliberately: "I'll ask my friend" on day seven becomes an
        // actual invitation on the last day, and the seat is still free.
        plusOneBlockHtml(addGuestUrl) +
        p(`At <strong>9pm ${when}</strong>, check your email: you'll get a private link to pick who you clicked with. Mutual picks swap contact info directly.`) +
        p('See you there,<br>The SparkDate Team'),
    }),
  };
}

async function sendPreEventEmails(nowMs, emailedThisRun) {
  let sent = 0, skipped = 0;
  try {
    const horizon = new Date(nowMs + PRE_EVENT_WINDOW_DAYS * 86400000);
    const evSnap = await db.collection('events')
      .where('date', '>', new Date(nowMs))
      .where('date', '<=', horizon)
      .get();
    for (const evDoc of evSnap.docs) {
      const ev = normalizeEvent(evDoc.id, evDoc.data());
      if (!ev.dt) continue;
      const daysUntil = (ev.dt.getTime() - nowMs) / 86400000;
      const stage = daysUntil <= PRE_EVENT_T1_DAYS ? 't1' : 't7';
      const tonight = daysUntil < 0.75;

      const [erSnap, lockSnap] = await Promise.all([
        db.collection('event_registrations').where('eventId', '==', evDoc.id).get(),
        db.collection('pre_event_emails').where('eventId', '==', evDoc.id).get(),
      ]);
      const sentLocks = new Set(lockSnap.docs.map((d) => d.id));

      const seenEmails = new Set();
      for (const er of erSnap.docs) {
        const r = er.data();
        const email = r.email ? String(r.email).toLowerCase().trim() : null;
        if (r.status !== 'confirmed' || !email) { skipped++; continue; }
        if (seenEmails.has(email)) { skipped++; continue; }
        seenEmails.add(email);
        if (sentLocks.has(`${er.id}_${stage}`)) { skipped++; continue; }
        if (emailedThisRun.has(email)) { skipped++; continue; }

        const firstName = esc((r.name ? String(r.name).trim().split(/\s+/)[0] : '') || '');

        // WHO GETS THE +1 LINK. Three conditions, all required:
        //
        //  1. gender === 'woman'. The 2-for-1 is offered to every buyer at
        //     checkout and ADVERTISED to women; an email is advertising. This
        //     is a targeting decision, NOT a product gate — api/add-guest.js
        //     deliberately does not check gender, because a product gate is
        //     the shape that was reversed on 2026-09-02 on legal grounds.
        //  2. A ticketId to hang it on. Check-in registrations carry
        //     `ticketId: null` (lead-signup.js handleCheckin), so there is no
        //     ticket for a companion to link to.
        //  3. Not a companion themselves — a +1 does not get a +1.
        //
        // Missing gender means UNKNOWN, and unknown does not get the link.
        // That is the honest reading: ~22% of leads have no gender on file at
        // all, and guessing is how a women-only offer reaches men.
        let addGuestUrl = null;
        if (r.gender === 'woman' && r.ticketId && !r.isPlusOne) {
          try {
            addGuestUrl = makeAddGuestUrl(r.ticketId, r.email);
          } catch (e) {
            // Unset signing secret. Loud, but never at the cost of the email
            // itself — the run of show matters more than the offer.
            console.error('[pre-event] add-guest link skipped:', e.message);
          }
        }

        const msg = preEventEmailFor(stage, firstName, ev, tonight, addGuestUrl);
        try {
          const result = await resend.emails.send({
            from: EMAIL_FROM,
            reply_to: EMAIL_REPLY_TO,
            to: r.email,
            subject: msg.subject,
            html: msg.html,
          });
          if (!result.error) {
            await db.collection('pre_event_emails').doc(`${er.id}_${stage}`).set({
              regId: er.id, userId: r.userId || null, email,
              eventId: evDoc.id, stage, sentAt: new Date().toISOString(),
            });
            emailedThisRun.add(email);
            sent++;
            console.log(`✅ pre-event ${stage} → reg/${er.id}`);
          } else { skipped++; }
        } catch (e) { console.error('[pre-event]', er.id, e.message); skipped++; }
      }
    }
  } catch (e) {
    console.error('[pre-event] pass failed:', e.message);
  }
  return { sent, skipped };
}

// ── Post-event "who did you click with" prompt ──────────────────────────────
// Fires the same evening (9 PM ET, via the dedicated ?only=postevent cron —
// see the handler's Eastern-hour guard) for any event whose date has already
// passed that day. Emails every confirmed attendee (event_registrations is the
// single source of truth) a no-login magic link (makeMatchUrl) to the /matches
// page where they pick who they clicked with. Idempotent via `postEventPromptSent`
// (per attendee × event). The general 9 AM pass also calls this as a same-day
// safety net for anyone missed by the evening run — the lock makes re-running
// it a no-op for everyone already sent. Best-effort: a failure here never
// breaks the nurture or profile-reminder passes.
const POST_EVENT_LOOKBACK_DAYS = 3;

function postEventPromptHTML({ eventName, matchUrl, nextEventHtml, getawaysUrl, referralUrl }) {
  const s = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Getaways mention: this is the single highest-attention email in the
  // cycle (people are actively watching for the matching link), so it's
  // also the best place to put a commercial mention that would otherwise
  // have no home. Previously lived in a separate ~8:55pm email fired by its
  // own cron 5 minutes ahead of this one — that second cron's guard needed
  // a narrow 8:50-8:59pm window (this email's guard tolerates the whole 9pm
  // hour), and a late cron invocation would silently miss that window and
  // skip the send entirely. Folding it in here means it rides this email's
  // much more forgiving guard instead of depending on its own.
  const getawaysHtml = getawaysUrl ? `
<p class="next-h">Multi-day getaways are coming</p>
<p>Vote for the trip you'd take, get first dibs on dates and pricing — and you could win it free when it launches. <a href="${s(getawaysUrl)}">Vote on Getaways</a></p>` : '';
  // Referral block: the highest-engagement email in the system (recipient
  // just got excited about a match), so it's the best moment to surface the
  // already-built referral link (same account.html invite-link convention —
  // no new tracking, just a new surface). No incentive attached yet — this
  // is purely a visibility push, not a reward program.
  const referralHtml = referralUrl ? `
<p class="next-h">Know someone who'd love this?</p>
<p>Bring a friend next time — <a href="${s(referralUrl)}">send them your invite link</a>.</p>` : '';
  // Same reasoning as the referral block above (highest-engagement moment,
  // reuse what already exists) applied to two gaps found in this session's
  // traffic research: nothing anywhere asks an attendee to post about their
  // own night (only the friend-invite above exists), and nothing collects
  // reviews/testimonials beyond the 3 already hardcoded on the homepage
  // (Alex/Molly/Quang), all sourced manually. "Just reply" mirrors the exact
  // pattern already used in day2's nurture email ("Questions? Just reply —
  // we read every message") -- zero new infrastructure, replies feed the
  // same manual-curation pipeline that produced those 3 testimonials. The
  // @sparkdate.date handle is the real Instagram profile already linked in
  // index.html's footer/schema, not a placeholder.
  const shareHtml = `
<p class="next-h">Had a great night?</p>
<p>Share a story and tag <a href="https://www.instagram.com/sparkdate.date">@sparkdate.date</a> — or just reply and tell us about it. We love featuring real ones.</p>`;
  // Same reasoning as shareHtml above (highest-engagement moment, reuse
  // what already exists) applied to a gap closed once a real Google
  // Business Profile existed to point at: nothing anywhere asked for a
  // Google review specifically, even though this is the email most likely
  // to produce a genuine, enthusiastic one. Separate block from shareHtml
  // (Instagram tag vs. Google review are different asks, different
  // platforms) rather than merging the copy.
  const reviewHtml = `
<p class="next-h">Loved the night?</p>
<p>A quick <a href="https://share.google/VFb2VHvRIY2wQUhUG">Google review</a> helps more people find us — takes 30 seconds, means a lot.</p>`;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f3f0;margin:0;padding:0;color:#0a0e27}
.container{max-width:600px;margin:0 auto;background:#fff}
.header{background:#0a0e27;padding:36px 30px;text-align:center}
.logo{font-family:Georgia,serif;font-size:30px;font-weight:900;color:#fff}.logo span{color:#ff6b6b}
.content{padding:36px 30px}h1{font-family:Georgia,serif;font-size:24px;margin:0 0 16px}
p{font-size:15px;line-height:1.6;color:#1a1f3a;margin:0 0 16px}
.cta{display:inline-block;background:#ff6b6b;color:#fff!important;font-weight:800;padding:14px 34px;border-radius:4px;text-decoration:none;margin:6px 0 18px}
.next-h{font-size:13px;text-transform:uppercase;letter-spacing:1px;color:#8a8fa3;margin:32px 0 0;border-top:1px solid #eee;padding-top:24px}
.footer{background:#0a0e27;padding:22px;text-align:center;color:#888;font-size:12px}.footer a{color:#ff6b6b;text-decoration:none}
</style></head><body><div class="container">
<div class="header"><div class="logo">Spark<span>Date</span></div></div>
<div class="content">
<h1>Who did you click with at ${s(eventName)}?</h1>
<p>Tell us who you'd like to see again. If they pick you too, we'll share contact info so you can meet up — no missed signals, no awkward Instagram hunt.</p>
<p style="text-align:center;"><a class="cta" href="${s(matchUrl)}">Pick your matches</a></p>
<p>No login needed — this link is just for you.</p>
${nextEventHtml || ''}${getawaysHtml}${referralHtml}${shareHtml}${reviewHtml}
</div>
<div class="footer"><p>SparkDate · Lancaster &amp; Philadelphia · Real people. Real venues.</p>
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

async function sendPostEventPrompts(nowMs, emailedThisRun, testUid = null, resendUids = null, nextEvent = null) {
  let sent = 0, skipped = 0;
  try {
    const since = new Date(nowMs - POST_EVENT_LOOKBACK_DAYS * 86400000);
    const evSnap = await db.collection('events')
      .where('date', '>=', since)
      .where('date', '<=', new Date(nowMs))
      .get();
    for (const evDoc of evSnap.docs) {
      const eventName = evDoc.data().title || 'your SparkDate event';
      // Secondary "while you're here — our next mixer" block. getNextEvent only
      // returns FUTURE events, so it can never be the event they just attended.
      // Drives rebooking off the highest-engagement email of the cycle.
      const nextEventHtml = (nextEvent && nextEvent.id !== evDoc.id)
        ? `<p class="next-h">While you're here — our next mixer</p>`
          + eventCardHtml(nextEvent)
          + ctaButtonHtml(buildUtmUrl('/event?id=' + nextEvent.id, 'email', 'postevent', 'next_mixer'), 'Reserve your spot')
        : '';
      const getawaysUrl = buildUtmUrl('/getaways', 'email', 'postevent', 'getaways');
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
            from: EMAIL_FROM,
            reply_to: EMAIL_REPLY_TO,
            to: email,
            subject: `Who did you click with at ${eventName}?`,
            html: postEventPromptHTML({
              eventName, matchUrl: makeMatchUrl(cand.uid), nextEventHtml, getawaysUrl,
              // Same link-building convention as account.html's setupInvite()
              // — no new attribution logic, just a new place it's surfaced.
              // Points at the homepage, not /events — index.html captures an
              // incoming ?ref= into localStorage (sparkdate_ref); events.html
              // has no equivalent capture logic, so attribution would be lost.
              referralUrl: `https://sparkdate.date/?ref=${encodeURIComponent(cand.uid)}&utm_source=referral&utm_medium=email&utm_campaign=post_event`,
            }),
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

// ── Real "attended" activity-feed logging ───────────────────────────────────
// Covers confirmed registrants who never used the digital check-in flow
// (lib/activity-log.js's other trigger). Deliberately scoped to the SAME
// past-event window as sendPostEventPrompts above — this can only ever run
// for events whose date has already passed, which is the whole point: it
// replaces the old purchase-time event_attended write that could fire days
// or weeks before the event happened. logEventAttended no-ops for anyone
// already logged via check-in, so re-running this is always safe.
async function logPastEventAttendance(nowMs) {
  let logged = 0, skipped = 0;
  try {
    const since = new Date(nowMs - POST_EVENT_LOOKBACK_DAYS * 86400000);
    const evSnap = await db.collection('events')
      .where('date', '>=', since)
      .where('date', '<=', new Date(nowMs))
      .get();
    for (const evDoc of evSnap.docs) {
      const eventName = evDoc.data().title || 'a SparkDate event';
      const erSnap = await db.collection('event_registrations').where('eventId', '==', evDoc.id).get();
      for (const er of erSnap.docs) {
        const r = er.data();
        if (r.status !== 'confirmed' || !r.userId) { skipped++; continue; }
        try {
          const result = await logEventAttended(db, admin.firestore.FieldValue, {
            uid: r.userId, email: r.email, name: r.name,
            eventId: evDoc.id, eventName, method: 'post_event_pass',
          });
          if (result.logged) logged++; else skipped++;
        } catch (e) {
          console.error('[attendance-log]', er.id, e.message);
          skipped++;
        }
      }
    }
  } catch (e) {
    console.error('[attendance-log] pass failed:', e.message);
  }
  return { logged, skipped };
}

// ── Returning-attendee invite ───────────────────────────────────────────────
// The retention engine: when a new event is on the calendar, invite everyone
// who attended a PAST mixer (and isn't already signed up for the next one) to
// come back. Warm, familiar-faces framing — NOT the first-timer nurture.
//
// Idempotent per (attendee × upcoming event): we stamp `returningInviteEventId`
// on the attendee's lead doc, so each person is invited at most once per event.
// As new people attend before the event, later runs pick them up.
//
// Why route through a `leads` doc: the unsubscribe endpoint writes leads/{id},
// so a marketing email legally needs one for a working one-click unsubscribe.
// Attendance is an existing business relationship, so we lazily create a
// subscribed lead (source:'attendee') for any attendee who isn't on the list —
// which also folds them into the newsletter audience. dayN_sent are pre-set so
// the first-timer sequence never fires at someone who's already attended.
// Copy that knows which mixer this would be for them. attendanceCountByUid
// (lib/attendance-index.js) counts DISTINCT past events, so someone holding
// two registrations for one night still reads as a first-timer.
//
// Deliberately conservative past 3: "you're a regular" holds true at 4, 7 or
// 12 without the email ever having to name a number it could get wrong. A
// missing/zero count falls through to the original round-agnostic wording
// rather than guessing.
function returningInviteCopy(count) {
  if (count === 1) return {
    subjectLead: 'Round two?',
    heading: 'Round two?',
    lede: `it was great having you at your first SparkDate night. The second one's usually easier — you know how it works, and the room's always better with familiar faces.`,
  };
  if (count === 2) return {
    subjectLead: 'Third time?',
    heading: "Third time's the charm",
    lede: `two mixers in and you're still showing up — that's the good kind of habit. Here's the next one.`,
  };
  if (count >= 3) return {
    subjectLead: 'Back again?',
    heading: "You're a regular now",
    lede: `you've been to a few of these, which makes you one of the faces people recognise when they walk in. Come make the next room feel like that too.`,
  };
  return {
    subjectLead: 'Back for more?',
    heading: 'Back for more?',
    lede: `it was great having you at a SparkDate night. We're lining up the next one — and the room's always better with familiar faces.`,
  };
}

async function sendReturningAttendeeInvites(nowMs, event, emailedThisRun, pastAttendeeUids, registeredForNextUids, attendeeNameByUid, attendanceCountByUid) {
  let sent = 0, skipped = 0;
  if (!event) return { sent, skipped, gated: true };
  try {
    for (const uid of pastAttendeeUids) {
      if (registeredForNextUids.has(uid)) { skipped++; continue; } // already coming
      const usnap = await db.collection('users').doc(uid).get();
      if (!usnap.exists) { skipped++; continue; }
      const u = usnap.data();
      const email = u.email ? String(u.email).toLowerCase().trim() : null;
      if (!email) { skipped++; continue; }
      if (emailedThisRun.has(email)) { skipped++; continue; }

      // Name: users.firstName, else the reg `name` (source of truth post-
      // consolidation), parsed to first word. Same fallback as the matches flow.
      const regName = attendeeNameByUid && attendeeNameByUid.get(uid);
      const firstNameRaw = u.firstName || (regName ? String(regName).trim().split(/\s+/)[0] : '') || '';

      // Find (or lazily create) the marketing lead for this attendee.
      const leadQ = await db.collection('leads').where('email', '==', email).limit(1).get();
      let leadRef, lead;
      if (!leadQ.empty) {
        leadRef = leadQ.docs[0].ref;
        lead = leadQ.docs[0].data();
      } else {
        leadRef = db.collection('leads').doc();
        lead = {
          email, name: firstNameRaw, source: 'attendee', subscribed: true,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          // Do NOT set welcome_sent/day2_sent/etc to true here — no such
          // emails were ever actually sent to this person (they were
          // lazily added to `leads` only for the unsubscribe link below),
          // and marking them "sent" made the admin Leads tab show green
          // checkmarks for emails that never went out, disagreeing with
          // Resend's own send log. sendBucket() already skips anyone in
          // `attendedEmails` (built from confirmed past registrations,
          // which is exactly who ends up here) — so the nurture sequence
          // is correctly suppressed without lying about what was sent.
        };
        await leadRef.set(lead);
      }
      if (lead.subscribed === false) { skipped++; continue; }           // respect opt-out
      if (lead.returningInviteEventId === event.id) { skipped++; continue; } // already invited to this event

      const firstName = esc(firstNameRaw || lead.name || '');
      const unsubUrl = makeUnsubscribeUrl(leadRef.id, email);
      const ctaUrl = buildUtmUrl('/event?id=' + event.id, 'email', 'returning', 'next_mixer');
      // How many mixers they've actually been to, so the copy can say "round
      // two" to a second-timer and "you're a regular" to someone on their
      // fifth, instead of one message that reads slightly wrong for everyone.
      const attendedCount = (attendanceCountByUid && attendanceCountByUid.get(uid)) || 0;
      const copy = returningInviteCopy(attendedCount);
      const html = shell(
        h1(copy.heading) +
        p(lede(firstName, copy.lede)) +
        eventCardHtml(event) +
        ctaButtonHtml(ctaUrl, 'Save my spot') +
        // The 2-for-1 already works end to end (api/purchase-ticket.js) and
        // costs nothing to mention. For someone deciding whether to come back
        // it turns a solo night into one they can bring a friend to.
        //
        // WOMEN ONLY, corrected 2026-09-03. This line previously went to every
        // returning attendee, men included — the one place in the product that
        // ADVERTISED the 2-for-1 outside a female audience, which is exactly
        // what content/brand.json's caption_rules.banned_outside_female_ad_set
        // forbids in ad copy. The offer itself stays open to everyone at
        // checkout; only the advertising is targeted. `u` is the users doc,
        // which carries gender from every enrollment path.
        (u.gender === 'woman'
          ? p(`Bringing someone? Your <strong>+1 comes free</strong> — add them at checkout.`)
          : '') +
        p('Hope to see you again,<br>The SparkDate Team')
      ).replace(/__UNSUB__/g, unsubUrl);

      try {
        const result = await resend.emails.send({
          from: EMAIL_FROM,
          reply_to: EMAIL_REPLY_TO,
          to: u.email,
          subject: `${copy.subjectLead} ${event.title} is coming up`,
          html,
          headers: {
            'List-Unsubscribe': listUnsubscribeHeader(unsubUrl),
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        });
        if (!result.error) {
          await leadRef.update({
            returningInviteEventId: event.id,
            returningInviteSentAt: new Date().toISOString(),
          });
          emailedThisRun.add(email);
          sent++;
          console.log(`✅ returning-attendee invite → users/${uid}`);
        } else { skipped++; }
      } catch (e) { console.error('[returning-invite]', uid, e.message); skipped++; }
    }
  } catch (e) {
    console.error('[returning-invite] pass failed:', e.message);
  }
  return { sent, skipped };
}

// ── Handler ───────────────────────────────────────────────────────────────────
// ── Weekly newsletter (separate from nurture sequence) ──────────────────────
// Sends to ALL subscribed leads (independent of nurture day/status).
// Tracks lastNewsletterSentAt; resends every 7+ days. Uses rotating templates.
// Note: a lead also on the post-nurture event track alternates weeks with it
// (via the 7-day cross-track spacing), so nobody gets more than one marketing
// email per week overall.
async function sendWeeklyNewsletter(leads, nowMs, event, emailedThisRun, nameByEmail) {
  let sent = 0, skipped = 0;

  // ONE issue for everyone this week. A GLOBAL index that advances every
  // 7 days — so the whole list receives the same newsletter in sequence,
  // instead of each lead getting a different issue seeded off their own signup
  // date (which is what made the sends look scattershot / out of order).
  const issueIndex = Math.floor(nowMs / (7 * 86400000)) % NEWSLETTER_EMAILS.length;
  const tpl = NEWSLETTER_EMAILS[issueIndex];
  // CTA → the specific next event when one's scheduled, else the events page.
  // The newsletter sends regardless: the templates lead with evergreen content
  // and eventCardHtml(null) degrades to an evergreen card, so a gap week still
  // gets a real issue instead of silence.
  const ctaUrl = event
    ? buildUtmUrl('/event?id=' + event.id, 'email', 'newsletter', 'weekly')
    : buildUtmUrl('/events', 'email', 'newsletter', 'weekly');

  for (const leadDoc of leads) {
    const lead = leadDoc.data();
    const email = (lead.email || '').toLowerCase().trim();
    if (!email) { skipped++; continue; }

    // Lowest-priority pass: yield to anyone already emailed this run.
    if (emailedThisRun.has(email)) { skipped++; continue; }

    // Per-lead 7-day cooldown — with the pass running daily, this IS the
    // weekly cadence (self-healing: a missed cron day delays a lead's
    // issue by a day instead of silencing the whole list for a week).
    const lastSent = lead.lastNewsletterSentAt
      ? (new Date(lead.lastNewsletterSentAt).getTime())
      : null;
    if (lastSent && (nowMs - lastSent) < 7 * 86400000) { skipped++; continue; }

    // Keep the two marketing tracks a week apart per inbox — if the
    // post-nurture event campaign reached them in the last 7 days, wait.
    const lastEvt = lead.lastEventEmailSentAt ? new Date(lead.lastEventEmailSentAt).getTime() : null;
    if (lastEvt && (nowMs - lastEvt) < CROSS_TRACK_SPACING_DAYS * 86400000) { skipped++; continue; }

    try {
      // shell()'s footer carries an __UNSUB__ placeholder — swap it for this
      // recipient's signed URL, same as sendBucket does. Without the replace
      // the body's Unsubscribe link goes out as a literal dead "__UNSUB__"
      // href (only the header unsubscribe worked).
      const unsubUrl = makeUnsubscribeUrl(leadDoc.id, lead.email);
      const html = tpl.html(esc(resolveLeadName(lead, nameByEmail, '')), event, ctaUrl)
        .replace(/__UNSUB__/g, unsubUrl);

      const result = await resend.emails.send({
        from: EMAIL_FROM,
        reply_to: EMAIL_REPLY_TO,
        to: lead.email,
        subject: tpl.subject,
        html,
        headers: {
          'List-Unsubscribe': `<${unsubUrl}>`,
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
// This is the event-promo channel for COLD leads who finished nurture and
// never attended. Attendees have their own (returning-attendee invite) track,
// so they're suppressed here to avoid two "come to the next one" emails.
async function sendPostNurtureEventCampaign(leads, nowMs, event, emailedThisRun, attendedEmails, nameByEmail, registeredUpcomingEmails) {
  let sent = 0, skipped = 0;

  for (const leadDoc of leads) {
    const lead = leadDoc.data();
    const email = (lead.email || '').toLowerCase().trim();
    if (!email) { skipped++; continue; }

    // Eligible once nurture is DONE with them — either it completed
    // (day25_sent) or they aged past every bucket without completing it.
    // The aged-out branch is the fix for the silent dead zone: a lead whose
    // day25 window was missed (cron outage, suppression at the time, or a
    // doc created before the flags existed) previously could never enter
    // this track, so the whole cold list went permanently quiet.
    const createdMs = leadCreatedMs(lead);
    const agedOut = createdMs !== null && (nowMs - createdMs) / 86400000 > NURTURE_AGED_OUT_DAYS;
    if (lead.day25_sent !== true && !agedOut) { skipped++; continue; }

    // Attendees get the returning-attendee invite instead — don't double up.
    if (attendedEmails && attendedEmails.has(email)) { skipped++; continue; }

    // Already holds a ticket for the upcoming event — nothing to pitch.
    // The pre-event countdown pass owns this audience until the event passes.
    if (registeredUpcomingEmails && registeredUpcomingEmails.has(email)) { skipped++; continue; }

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

    // Keep the two marketing tracks a week apart per inbox — if the
    // newsletter reached them in the last 7 days, this pass waits.
    const lastNl = lead.lastNewsletterSentAt ? new Date(lead.lastNewsletterSentAt).getTime() : null;
    if (lastNl && (nowMs - lastNl) < CROSS_TRACK_SPACING_DAYS * 86400000) { skipped++; continue; }

    if (!event) { skipped++; continue; } // Need event for card

    try {
      const ctaUrl = buildUtmUrl('/event?id=' + event.id, 'email', 'event_campaign', 'post_nurture');

      // Same __UNSUB__ interpolation as sendBucket/newsletter — shell()'s
      // footer link is a placeholder until this replace runs.
      const unsubUrl = makeUnsubscribeUrl(leadDoc.id, lead.email);
      const html = shell(
        h1('Our next mixer is coming') +
        p(lede(esc(resolveLeadName(lead, nameByEmail, '')), `we're hosting our next mixer soon.`)) +
        p('Same format: short conversations, real connections, no app swiping.') +
        eventCardHtml(event) +
        ctaButtonHtml(ctaUrl, 'Reserve your spot') +
        p('See you there,<br>The SparkDate Team')
      ).replace(/__UNSUB__/g, unsubUrl);

      const result = await resend.emails.send({
        from: EMAIL_FROM,
        reply_to: EMAIL_REPLY_TO,
        to: lead.email,
        subject: `${event.title} is coming up`,
        html,
        headers: {
          'List-Unsubscribe': `<${unsubUrl}>`,
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

  // ── Eastern-hour guard ───────────────────────────────────────────
  // vercel.json fires the general pass at both 13:00 and 14:00 UTC so one of
  // them is always 9 AM in New York (EDT or EST), and fires the post-event
  // pass at both 01:00 and 02:00 UTC so one of them is always 9 PM Eastern.
  // The off-hour invocation lands here, sees the wrong hour, and no-ops.
  // Returns 200 — a non-200 would make Vercel treat the cron as failed and retry.
  // `?force=1` skips the guard, for manual admin triggers at any hour.
  const force = req.query?.force === '1' || req.query?.force === 'true'
    || req.body?.force === true;
  // Scoped manual trigger. `?only=postevent` runs ONLY the post-event prompt
  // pass — so it can fire the SAME evening (9 PM ET) an event happens, rather
  // than waiting for the general 9 AM pass the next day. Also lets an admin
  // (re)send the match links on demand without firing the fortnightly
  // newsletter / nurture sequence to the whole leads list (which a bare
  // `?force=1` would do, since force bypasses those gates).
  const only = req.query?.only || req.body?.only || null;
  if (!force) {
    const easternHour = parseInt(new Date().toLocaleString('en-US', {
      timeZone: 'America/New_York', hour: '2-digit', hour12: false,
    }), 10);
    const targetHour = only === 'postevent' ? 21 : 9;
    if (easternHour !== targetHour) {
      const reason = `not ${targetHour === 21 ? '9 PM' : '9 AM'} Eastern (hour=${easternHour})`;
      console.log(`⏰ cron skipped — ${easternHour}:00 America/New_York, ${reason}`);
      return res.status(200).json({ skipped: true, reason });
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

    // ONE email per person per run, shared across EVERY pass and keyed by
    // (lowercased) email. Passes run in priority order below; whichever sends
    // first claims the address and the rest yield — no more double-emailing.
    const emailedThisRun = new Set();

    // Scoped trigger: run ONLY the post-event prompt pass and return. This is
    // what the dedicated 9 PM ET cron hits, and also lets an admin (re)send
    // the match links on demand without touching the marketing passes below.
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

      const postEventPrompts = await sendPostEventPrompts(nowMs, emailedThisRun, testUid, resendUids, event);
      const attendanceLog = await logPastEventAttendance(nowMs);
      console.log(`✅ Cron (only=postevent${testUid ? `, testUid=${testUid}` : ''}${resendUids ? `, resendUids=${resendUids.join(',')}` : ''}):`, JSON.stringify(postEventPrompts), 'attendanceLog=', JSON.stringify(attendanceLog));
      return res.status(200).json({ success: true, only: 'postevent', testUid: testUid || null, resendUids: resendUids || null, postEventPrompts, attendanceLog, ts: new Date().toISOString() });
    }

    // Attendance index (confirmed event_registrations = single source of truth).
    // Built once and reused: drives (a) nurture suppression for anyone who has
    // already attended, and (b) the returning-attendee invite. Best-effort —
    // wrapped so an index failure degrades gracefully rather than killing the run.
    // See lib/attendance-index.js: a confirmed registration only counts as
    // "attended" when its event is in the past — an upcoming event's confirmed
    // ticket-holders must stay eligible for the first-timer nurture sequence.
    let attendedEmails = new Set();
    let registeredUpcomingEmails = new Set();
    let pastAttendeeUids = new Set();
    let registeredForNextUids = new Set();
    let attendeeNameByUid = new Map();
    let nameByEmail = new Map();
    let attendanceCountByUid = new Map();
    try {
      const [regSnap, evAllSnap] = await Promise.all([
        db.collection('event_registrations').where('status', '==', 'confirmed').get(),
        db.collection('events').get(),
      ]);
      const registrations = regSnap.docs.map((d) => d.data());
      const events = evAllSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      ({ attendedEmails, registeredUpcomingEmails, pastAttendeeUids, registeredForNextUids, attendeeNameByUid, nameByEmail, attendanceCountByUid } =
        buildAttendanceIndex(registrations, events, nowMs, event));
    } catch (e) {
      console.error('[attendance-index] build failed:', e.message);
    }

    // ── General audit mode (?audit=1) — read-only, sends NOTHING ──────────
    // Answers "why is nobody getting email?" with numbers instead of silence:
    // classifies every subscribed lead into exactly one bucket per marketing
    // track, plus overall list-health counts. Safe to hit any time (it still
    // requires CRON_SECRET, and the hour guard is bypassed by ?force=1 or by
    // hitting it at 9 AM ET). Complements the existing only=postevent audit.
    if (req.query?.audit === '1' || req.body?.audit === '1') {
      const audit = {
        subscribedLeads: leads.length,
        nextEvent: event ? { id: event.id, title: event.title } : null,
        attendedEmails: attendedEmails.size,
        registeredUpcomingEmails: registeredUpcomingEmails.size,
        nurture: { day2: 0, day5: 0, day14: 0, day25: 0 },
        agedOutOfNurture: 0,       // older than day25 window — nurture done forever
        missingCreatedAt: 0,
        alreadyFullySent: 0,       // all four dayN flags set
        suppressedAttendee: 0,     // in attendedEmails (gets returning-invite track)
        suppressedTicketHolder: 0, // holds upcoming ticket (gets pre-event track)
        postNurture: { eligibleNow: 0, coolingDown: 0, cappedAt12: 0 },
        newsletter: { eligibleNow: 0, coolingDown: 0 },
      };
      for (const leadDoc of leads) {
        const lead = leadDoc.data();
        const email = (lead.email || '').toLowerCase().trim();
        if (!email) continue;
        const isAttendee = attendedEmails.has(email);
        const holdsTicket = registeredUpcomingEmails.has(email);
        if (isAttendee) audit.suppressedAttendee++;
        if (holdsTicket) audit.suppressedTicketHolder++;
        const createdMs = leadCreatedMs(lead);
        if (createdMs === null) { audit.missingCreatedAt++; }
        const ageDays = createdMs !== null ? (nowMs - createdMs) / 86400000 : null;
        if (ageDays !== null && ageDays > NURTURE_AGED_OUT_DAYS) audit.agedOutOfNurture++;
        if (lead.day2_sent && lead.day5_sent && lead.day14_sent && lead.day25_sent) audit.alreadyFullySent++;
        if (ageDays !== null && !isAttendee && !holdsTicket) {
          for (const [d, key] of [[2, 'day2'], [5, 'day5'], [14, 'day14'], [25, 'day25']]) {
            if (!lead[`${key}_sent`] && ageDays >= d && ageDays <= d + MAX_LATE_DAYS) audit.nurture[key]++;
          }
        }
        // Post-nurture track
        const pnDone = lead.day25_sent === true || (ageDays !== null && ageDays > NURTURE_AGED_OUT_DAYS);
        if (pnDone && !isAttendee && !holdsTicket) {
          if ((lead.eventEmailsCount || 0) >= 12) audit.postNurture.cappedAt12++;
          else {
            const last = lead.lastEventEmailSentAt ? new Date(lead.lastEventEmailSentAt).getTime() : null;
            if (last && (nowMs - last) < 14 * 86400000) audit.postNurture.coolingDown++;
            else audit.postNurture.eligibleNow++;
          }
        }
        // Newsletter track (7-day weekly cooldown)
        const lastNl = lead.lastNewsletterSentAt ? new Date(lead.lastNewsletterSentAt).getTime() : null;
        if (lastNl && (nowMs - lastNl) < 7 * 86400000) audit.newsletter.coolingDown++;
        else audit.newsletter.eligibleNow++;
      }
      console.log('✅ Cron general audit:', JSON.stringify(audit));
      return res.status(200).json({ success: true, audit: true, ...audit, ts: new Date().toISOString() });
    }

    // 1) Transactional, time-sensitive — always send, and claim the address so
    //    marketing yields to them. (These run over ticket-holders, not leads.)
    const profileReminders = await sendProfileReminders(nowMs, emailedThisRun);
    const preEvent = await sendPreEventEmails(nowMs, emailedThisRun);
    const postEventPrompts = await sendPostEventPrompts(nowMs, emailedThisRun, null, null, event);
    // Same-day safety net for the real "attended" log, mirroring
    // sendPostEventPrompts above: the dedicated 9pm ET cron already covers
    // this via the only==='postevent' branch, but re-running it here for
    // anyone the evening pass missed is a no-op for everyone already logged.
    const attendanceLog = await logPastEventAttendance(nowMs);

    // 1.5) Returning-attendee invite — warm, targeted, high priority (claims the
    //    address before the marketing passes). Self-limiting via the per-event
    //    stamp, so it can run every day without re-emailing the same person.
    const returningInvites = await sendReturningAttendeeInvites(
      nowMs, event, emailedThisRun, pastAttendeeUids, registeredForNextUids, attendeeNameByUid, attendanceCountByUid);

    // 2) Nurture sequence (day 2/5/14/25) — one bucket-email per lead per run.
    //    Suppressed for anyone who has already attended (wrong audience).
    const results = [];
    for (const [d, key] of [[2, 'day2'], [5, 'day5'], [14, 'day14'], [25, 'day25']]) {
      results.push(await sendBucket(leads, d, key, nowMs, emailedThisRun, event, attendedEmails, nameByEmail, registeredUpcomingEmails));
    }

    // 3) Post-nurture event campaign — runs DAILY; cadence comes from the
    //    per-lead 14-day cooldown plus 7-day cross-track spacing, not a
    //    single global gate day. (The old `dayNum % 14 === 7` gate meant one
    //    failed 9 AM run silenced the entire track for a fortnight with no
    //    catch-up — the main way "we used to send a lot, now nothing".)
    const postNurtureEvents = await sendPostNurtureEventCampaign(leads, nowMs, event, emailedThisRun, attendedEmails, nameByEmail, registeredUpcomingEmails);

    // 4) Weekly newsletter — same daily/self-healing model, lowest
    //    priority so it yields to all of the above. Issue selection stays
    //    global-week (see sendWeeklyNewsletter) so everyone still reads
    //    the same issue within a week.
    const newsletter = await sendWeeklyNewsletter(leads, nowMs, event, emailedThisRun, nameByEmail);

    console.log(`✅ Cron complete (${leads.length} subscribed leads):`, JSON.stringify(results), 'profileReminders=', JSON.stringify(profileReminders), 'preEvent=', JSON.stringify(preEvent), 'postEventPrompts=', JSON.stringify(postEventPrompts), 'attendanceLog=', JSON.stringify(attendanceLog), 'returningInvites=', JSON.stringify(returningInvites), 'newsletter=', JSON.stringify(newsletter), 'postNurtureEvents=', JSON.stringify(postNurtureEvents));
    return res.status(200).json({ success: true, leads: leads.length, event: event ? event.id : null, results, profileReminders, preEvent, postEventPrompts, attendanceLog, returningInvites, newsletter, postNurtureEvents, ts: new Date().toISOString() });

  } catch (err) {
    console.error('❌ Cron error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};

// Exported for render checks/tests.
module.exports.EMAILS = EMAILS;
module.exports.NEWSLETTER_EMAILS = NEWSLETTER_EMAILS;
module.exports.preEventEmailFor = preEventEmailFor;
