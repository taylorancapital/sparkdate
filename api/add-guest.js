// api/add-guest.js
//
// Claim the free +1 AFTER the ticket was already bought.
//
//   GET  /api/add-guest?token=<hmac>   → the form
//   POST /api/add-guest                → creates the companion seat
//        body: token, name, email, phone, gender
//
// Signing lives in lib/add-guest.js. The endpoint is public because it has
// to be clickable from inside an email body; tampering fails the HMAC.
//
// ── WHAT THIS IS AND IS NOT GATED ON ─────────────────────────────────────
//
// The 2-for-1 is offered to EVERY buyer and only ADVERTISED to women. That
// distinction is load-bearing and it is not stylistic: for part of
// 2026-09-02 api/purchase-ticket.js rejected a male buyer's +1 outright and
// Taylor reversed it the same day on legal grounds — gender-conditioned
// pricing at a place of public accommodation is the riskier shape.
//
// So THIS FILE DOES NOT CHECK GENDER. A man holding a valid token gets his
// companion seat exactly like anyone else. The targeting lives entirely in
// who is sent a link (api/cron-send-emails.js renders it for women only),
// which is advertising — the same rule that governs the ad sets.
// Do not "tighten" this into a gender check here; that re-creates the
// product gate that was deliberately removed.

const { admin } = require('../lib/auth');
const { parseToken, verifySignature } = require('../lib/add-guest');
const { seatFields } = require('../lib/seat-model');
const { enrollGuestAsMember } = require('./purchase-ticket');

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

// HTML-escape. `new RegExp('"', 'g')`, NOT a regex literal: a literal quote
// inside a regex breaks Vercel's build-time entrypoint scanner and drops the
// whole file from the deploy. api/unsubscribe.js carries the same note for
// the same reason — this is not a style choice.
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(new RegExp('"', 'g'), '&quot;');
}

const norm = (s) => String(s || '').toLowerCase().trim();

// ── Page chrome ──────────────────────────────────────────────────────────
// Self-contained: no external CSS, no fonts, nothing that can fail to load
// on a phone on venue wifi. Brand tokens from docs/DESIGN_TOKENS.md.
function page({ title, bodyHtml }) {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(title)} — SparkDate</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 32px 20px 64px;
    background: linear-gradient(135deg, #0a0e27 0%, #1a1f3a 100%);
    color: #f5f3f0; min-height: 100vh;
    font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  }
  .card {
    max-width: 480px; margin: 0 auto; background: rgba(255,107,107,0.06);
    border: 1px solid rgba(255,107,107,0.22); border-radius: 12px; padding: 28px 24px 30px;
  }
  h1 { font-size: 24px; line-height: 1.2; margin: 0 0 12px; color: #fff; }
  p { margin: 0 0 16px; color: rgba(245,243,240,0.85); }
  label { display: block; font-size: 13px; letter-spacing: .04em; text-transform: uppercase;
          color: rgba(245,243,240,0.6); margin: 18px 0 6px; }
  input, select {
    width: 100%; padding: 12px 14px; font-size: 16px; color: #f5f3f0;
    background: rgba(10,14,39,0.6); border: 1px solid rgba(255,107,107,0.28);
    border-radius: 8px; appearance: none;
  }
  input:focus, select:focus { outline: 2px solid #ff6b6b; outline-offset: 1px; border-color: #ff6b6b; }
  button {
    width: 100%; margin-top: 26px; padding: 15px; font-size: 17px; font-weight: 800;
    color: #fff; background: linear-gradient(135deg, #ff6b6b 0%, #ff5252 100%);
    border: 0; border-radius: 8px; cursor: pointer;
  }
  button:hover { background: #fff; color: #ff5252; }
  button:focus-visible { outline: 3px solid #fff; outline-offset: 2px; }
  .note { font-size: 13.5px; color: rgba(245,243,240,0.55); margin-top: 18px; }
  .err { background: rgba(248,113,113,0.14); border: 1px solid rgba(248,113,113,0.4);
         border-radius: 8px; padding: 12px 14px; margin: 0 0 18px; color: #fecaca; font-size: 14.5px; }
  .ok { font-size: 40px; line-height: 1; margin: 0 0 14px; }
  a { color: #ff8f8f; }
</style>
</head><body><div class="card">${bodyHtml}</div></body></html>`;
}

function errorPage(res, status, heading, detail) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(status).send(page({
    title: heading,
    bodyHtml: `<h1>${esc(heading)}</h1><p>${esc(detail)}</p>
      <p class="note">Questions? Just reply to any SparkDate email and a human will read it.</p>`,
  }));
}

// ── Shared load + validate ───────────────────────────────────────────────
// Returns { ok:false, status, heading, detail } or { ok:true, ticket... }.
// GET and POST must agree on every rule, so both call this.
async function loadContext(rawToken) {
  const parsed = parseToken(rawToken);
  if (!parsed) {
    return { ok: false, status: 400, heading: 'That link looks incomplete',
             detail: 'Email clients sometimes chop long links in half. Try tapping it again from the original email.' };
  }

  const ticketRef = db.collection('tickets').doc(parsed.ticketId);
  const snap = await ticketRef.get();
  if (!snap.exists) {
    return { ok: false, status: 404, heading: 'We could not find that ticket',
             detail: 'This link is tied to one specific ticket, and that ticket is no longer on file.' };
  }
  const ticket = snap.data();

  if (!verifySignature(parsed.ticketId, ticket.email, parsed.sig)) {
    return { ok: false, status: 403, heading: 'That link is not valid',
             detail: 'The link did not pass its signature check. Use the one from your most recent SparkDate email.' };
  }
  if (ticket.status !== 'confirmed') {
    return { ok: false, status: 409, heading: 'That ticket is not active',
             detail: 'A +1 can only be added to a confirmed ticket.' };
  }
  if (ticket.isPlusOne) {
    return { ok: false, status: 409, heading: 'This is already a guest ticket',
             detail: 'You came in as someone’s +1, so there is no second seat to add on top of it.' };
  }

  // One companion per ticket. Single equality filter on purpose: two
  // equality filters would need a composite index, and a missing index
  // fails SILENTLY as an empty result — which here would mean handing out
  // a second free seat. Filter the flag in code instead.
  const existing = await db.collection('tickets')
    .where('linkedTicketId', '==', parsed.ticketId).get();
  const live = existing.docs.filter((d) => d.data().status !== 'failed');
  if (live.length) {
    return { ok: false, status: 409, heading: 'Your +1 is already booked',
             detail: `You have already added ${live[0].data().name || 'a guest'} to this event. Only one +1 per ticket.` };
  }

  if (!ticket.eventId) {
    return { ok: false, status: 409, heading: 'That ticket has no event on it',
             detail: 'We cannot work out which night to add your guest to. Reply to any SparkDate email and we will sort it by hand.' };
  }
  const evSnap = await db.collection('events').doc(String(ticket.eventId)).get();
  if (!evSnap.exists) {
    return { ok: false, status: 404, heading: 'That event is no longer listed',
             detail: 'The event this ticket belongs to is not on file any more.' };
  }
  const event = evSnap.data();

  const rawDate = event.date;
  const dt = rawDate && rawDate.toDate ? rawDate.toDate() : (rawDate ? new Date(rawDate) : null);
  if (dt && !isNaN(dt.getTime()) && dt.getTime() < Date.now()) {
    return { ok: false, status: 409, heading: 'That night has already happened',
             detail: 'You can bring someone to the next one — your +1 offer carries over.' };
  }

  return {
    ok: true,
    ticketId: parsed.ticketId,
    ticketRef,
    ticket,
    event,
    eventRef: evSnap.ref,
    eventName: event.title || ticket.eventName || 'the next SparkDate night',
  };
}

// ── GET: the form ────────────────────────────────────────────────────────
function formPage(ctx, token, errorHtml) {
  const first = String(ctx.ticket.name || '').trim().split(/\s+/)[0] || 'there';
  return page({
    title: 'Add your +1',
    bodyHtml: `
      <h1>Bring someone. Their seat is free.</h1>
      <p>${esc(first)}, you are already booked for <strong>${esc(ctx.eventName)}</strong>.
         Add one guest below and we will hold a seat for them at no charge.</p>
      ${errorHtml || ''}
      <form method="POST" action="/api/add-guest">
        <input type="hidden" name="token" value="${esc(token)}">
        <label for="g-name">Their name</label>
        <input id="g-name" name="name" required maxlength="200" autocomplete="off">
        <label for="g-email">Their email</label>
        <input id="g-email" name="email" type="email" required maxlength="200" autocomplete="off">
        <label for="g-phone">Their phone (optional)</label>
        <input id="g-phone" name="phone" type="tel" maxlength="50" autocomplete="off">
        <label for="g-gender">They are a…</label>
        <select id="g-gender" name="gender" required>
          <option value="">Choose one</option>
          <option value="woman">Woman</option>
          <option value="man">Man</option>
        </select>
        <button type="submit">Hold their seat</button>
      </form>
      <p class="note">We ask because the room is balanced by headcount, not because it changes the price —
        their seat is free either way. They will get their own confirmation email.</p>`,
  });
}

// ── POST: create the companion seat ──────────────────────────────────────
async function createCompanion(ctx, guest) {
  const eventId = String(ctx.ticket.eventId);

  // Reserve the seat first, in a transaction, against the SAME counters the
  // checkout uses. A free seat is still a seat: skipping this would let the
  // +1 flow overfill an event that the paid path correctly reports as sold
  // out. seatFields() resolves the single-pool vs legacy gender-split shape.
  const { capField, counterField } = seatFields(ctx.event, guest.gender);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ctx.eventRef);
    if (!snap.exists) { const e = new Error('Event vanished'); e.statusCode = 409; throw e; }
    const e = snap.data();
    const cap     = Number(e[capField] ?? 0);
    const current = Number(e[counterField] ?? 0);
    if (cap <= 0)              { const x = new Error('No spots available on this event'); x.statusCode = 409; throw x; }
    if (current + 1 > cap)     { const x = new Error('Event full');                       x.statusCode = 409; throw x; }
    tx.update(ctx.eventRef, { [counterField]: FieldValue.increment(1) });
  });

  // Deterministic ids so a double-submit (or a retry after a timeout) writes
  // the same two docs instead of a second free seat. Deliberately NOT the
  // `reg_guest_{paymentIntentId}_{eventId}_plusone` shape the checkout path
  // uses — these are separable on purpose, see addedAfterPurchase below.
  const ticketRef = db.collection('tickets').doc(`plusone_${ctx.ticketId}`);
  const regRef = db.collection('event_registrations').doc(`reg_addguest_${ctx.ticketId}`);

  const batch = db.batch();
  batch.set(ticketRef, {
    firebaseUid: null,
    email: guest.email,
    name: guest.name,
    phone: guest.phone,
    gender: guest.gender,
    eventId,
    eventName: ctx.eventName,
    amount: 0,
    paymentIntentId: ctx.ticket.paymentIntentId || null,
    paidWithCardOnFile: false,
    status: 'confirmed',
    isPlusOne: true,
    linkedTicketId: ctx.ticketId,
    // Separates a +1 claimed later from one taken at checkout. Without it the
    // "did reopening the offer actually work?" question is unanswerable —
    // both shapes look identical in the ticket records.
    addedAfterPurchase: true,
    createdAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  batch.set(regRef, {
    // Stamped with the real uid immediately after enrollment below. Left null
    // here only because the account may not exist yet.
    userId: null,
    email: guest.email,
    name: guest.name,
    phone: guest.phone,
    gender: guest.gender,
    eventId,
    eventTitle: ctx.eventName,
    ticketId: ticketRef.id,
    paymentIntentId: ctx.ticket.paymentIntentId || null,
    status: 'confirmed',
    month: new Date().toISOString().slice(0, 7),
    isPlusOne: true,
    addedAfterPurchase: true,
    linkedRegId: null,
    registeredAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  await batch.commit();
  return { ticketRef, regRef };
}

// The companion has historically been written with `userId: null` and left
// that way, and FOUR separate passes in api/cron-send-emails.js skip a
// registration without one: the chemistry-profile reminder (line ~491), the
// post-event prompt, the match flow, and the attendance log. A guest who
// never gets a profile arrives unmatched — she is in the room with nothing to
// pair her on. So resolve the uid enrollment just created and write it back.
// Best-effort: her seat is already real and must not be lost to this.
async function stampUserId(regRef, email) {
  try {
    const user = await admin.auth().getUserByEmail(norm(email));
    if (user && user.uid) {
      await regRef.update({ userId: user.uid });
      return user.uid;
    }
  } catch (e) {
    if (e.code !== 'auth/user-not-found') {
      console.error('[add-guest] uid stamp failed:', e.message);
    }
  }
  return null;
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const ctx = await loadContext(req.query && req.query.token);
      if (!ctx.ok) return errorPage(res, ctx.status, ctx.heading, ctx.detail);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(formPage(ctx, String(req.query.token)));
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const b = req.body || {};
    const token = b.token;
    const ctx = await loadContext(token);
    if (!ctx.ok) return errorPage(res, ctx.status, ctx.heading, ctx.detail);

    const guest = {
      name:   String(b.name  || '').trim().slice(0, 200),
      email:  norm(b.email),
      phone:  String(b.phone || '').trim().slice(0, 50),
      gender: b.gender === 'woman' || b.gender === 'man' ? b.gender : null,
    };

    const problems = [];
    if (!guest.name) problems.push('their name');
    if (!guest.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(guest.email)) problems.push('a valid email for them');
    if (!guest.gender) problems.push('whether they are a woman or a man');
    if (problems.length) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(400).send(formPage(ctx, String(token),
        `<p class="err">We still need ${esc(problems.join(', and '))}.</p>`));
    }
    // The buyer's own address would create a second seat for one person and
    // a duplicate roster row — the exact failure the door already produces.
    if (guest.email === norm(ctx.ticket.email)) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(400).send(formPage(ctx, String(token),
        '<p class="err">That is your own email — use your guest’s address so they get their own ticket and match link.</p>'));
    }

    let refs;
    try {
      refs = await createCompanion(ctx, guest);
    } catch (e) {
      if (e.statusCode === 409) {
        return errorPage(res, 409, 'That night just filled up',
          'The last seat went while you were on this page. Reply to any SparkDate email and we will see what we can do.');
      }
      throw e;
    }

    // Account + welcome + chemistry-profile link for the guest. Never let a
    // failure here cost a seat that is already reserved and written.
    await enrollGuestAsMember({
      email: guest.email, paymentMethodId: null, gender: guest.gender,
      eventName: ctx.eventName, name: guest.name, phone: guest.phone,
      eventId: String(ctx.ticket.eventId),
    }).catch((e) => console.error('[add-guest] enroll failed:', e.message));

    await stampUserId(refs.regRef, guest.email);

    console.log(`[add-guest] +1 added to ticket ${ctx.ticketId} for ${ctx.ticket.eventId}`);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(page({
      title: 'Your +1 is booked',
      bodyHtml: `
        <p class="ok">🎟️</p>
        <h1>${esc(guest.name)} is on the list.</h1>
        <p>Their seat for <strong>${esc(ctx.eventName)}</strong> is held and free. We have emailed them
           their own confirmation and a link to fill in their match profile.</p>
        <p class="note">Tell them to fill that profile in before the night — it is what we pair people on,
           and a blank one means they arrive unmatched.</p>`,
    }));
  } catch (err) {
    console.error('[add-guest] unhandled:', err);
    return errorPage(res, 500, 'Something went wrong on our end',
      'Your ticket is safe. Reply to any SparkDate email and we will add your guest by hand.');
  }
};

// Exported for tests and for rendering the page without a Firestore round
// trip. `page` and `formPage` are pure string builders — nothing in them
// touches the database.
module.exports.loadContext = loadContext;
module.exports.page = page;
module.exports.formPage = formPage;
