// lib/email-sender.js
//
// The outbound sender identity: who SparkDate mail comes from, and where a
// reply to it goes. One module so the two can never drift apart again.
//
// (Not to be confused with lib/email-identity.js, which answers "are these
// two addresses the same person" for check-in matching. Different job.)
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS: every reply to a SparkDate email was being thrown away.
// ---------------------------------------------------------------------------
//
// Mail is SENT from hello@mail.sparkdate.date -- the `mail.` subdomain, which
// is Resend's sending domain. That subdomain has no MX record, because a
// sending domain does not need one to send. So it cannot RECEIVE anything.
//
// No Reply-To header was ever set. With no Reply-To, a reply goes to the From
// address -- hello@mail.sparkdate.date -- which bounces. Every "yes I'm
// coming", every question about an event, every "please unsubscribe me" that
// a recipient sent by hitting Reply went nowhere, and the sender got a
// bounce that looked like SparkDate had vanished.
//
// Worse, the footer on marketing mail says "to unsubscribe manually, reply to
// any SparkDate email and we'll remove you within 24 hours", and the
// List-Unsubscribe header offers a mailto: as one of its two options. Those
// instructions were pointing at addresses that reject mail. (The URL half of
// List-Unsubscribe does work, so opt-out was never completely broken -- but
// the path we told people to use was.)
//
// The fix is two-sided and only one side is code:
//
//   1. HERE: set Reply-To on every send, pointing at the ROOT domain.
//   2. IN DNS: sparkdate.date must actually accept mail. It has no MX record
//      at all today, so hello@, support@, taylor@, privacy@, safety@,
//      security@ and admin@ -- every address the site advertises -- hard
//      bounce. Cloudflare Email Routing (the domain is already on Cloudflare)
//      forwards them to a real inbox for free. See docs/EMAIL_RUNBOOK.md, and
//      run scripts/check-email-dns.js to see the current state.
//
// Until step 2 is done, Reply-To points somewhere that still bounces -- no
// worse than today, and correct the moment routing is switched on. Set
// EMAIL_REPLY_TO to override it with a working address in the meantime.

'use strict';

// Resend's verified sending domain. Deliberately the `mail.` subdomain:
// keeping bulk sending off the root domain means a deliverability problem
// with marketing mail cannot damage the root domain's reputation for
// transactional mail. Do not "fix" this to the root -- it is correct.
const EMAIL_FROM = process.env.EMAIL_FROM || 'SparkDate <hello@mail.sparkdate.date>';

// Where replies land. The ROOT domain, because that is what a human would
// type and what Cloudflare Email Routing forwards. Bare address, no display
// name -- Resend's reply_to takes `string | string[]`.
const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO || 'hello@sparkdate.date';

// Address advertised to humans, e.g. in unsubscribe copy and mailto: links.
// Same mailbox as EMAIL_REPLY_TO; named separately so copy that shows an
// address to a reader is not silently repointed by an ops override of
// EMAIL_REPLY_TO.
const CONTACT_ADDRESS = 'hello@sparkdate.date';

/**
 * Spread into any resend.emails.send({...}) call:
 *
 *   await resend.emails.send({ ...senderFields(), to, subject, html });
 *
 * Callers that need a different From (venue outreach sends as a person, not
 * as the brand) can override it afterwards -- but should keep reply_to, so
 * the reply still reaches a mailbox that exists.
 */
function senderFields(overrides = {}) {
  return { from: EMAIL_FROM, reply_to: EMAIL_REPLY_TO, ...overrides };
}

/**
 * The List-Unsubscribe header value. RFC 8058 wants the URL form first --
 * that is the one Gmail and Outlook drive their one-click button from, and
 * the only half that works without inbound mail configured.
 */
function listUnsubscribeHeader(unsubUrl) {
  return `<${unsubUrl}>, <mailto:${CONTACT_ADDRESS}?subject=Unsubscribe>`;
}

module.exports = {
  EMAIL_FROM, EMAIL_REPLY_TO, CONTACT_ADDRESS,
  senderFields, listUnsubscribeHeader,
};
