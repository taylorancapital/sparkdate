// tests/email-sender.test.js
//
// Coverage for lib/email-sender.js — the outbound sender identity.
//
// The bug this module exists to prevent: SparkDate sent from
// hello@mail.sparkdate.date and set no Reply-To at all. A reply therefore went
// to the From address, on a sending subdomain with no MX record, and hard
// bounced. Every reply — "yes I'm coming", questions about an event, and
// "please unsubscribe me" — was discarded, and the person got a bounce that
// read as though the business had disappeared.
//
// The invariants below are the ones that were violated. They look almost too
// obvious to test, which is exactly why nobody noticed for months.

import { describe, it, expect } from 'vitest';
import {
  EMAIL_FROM, EMAIL_REPLY_TO, CONTACT_ADDRESS,
  senderFields, listUnsubscribeHeader,
} from '../lib/email-sender.js';

const domainOf = (addr) => String(addr).replace(/^.*</, '').replace(/>.*$/, '').split('@')[1];

describe('sender identity', () => {
  it('sends from the mail. subdomain, which is what Resend has verified', () => {
    expect(domainOf(EMAIL_FROM)).toBe('mail.sparkdate.date');
  });

  it('replies go to the ROOT domain, not the sending subdomain', () => {
    // THE BUG. mail.sparkdate.date has no MX record and never will — it is a
    // sending domain. Replies must go somewhere a mailbox can exist.
    expect(domainOf(EMAIL_REPLY_TO)).toBe('sparkdate.date');
    expect(domainOf(EMAIL_REPLY_TO)).not.toBe(domainOf(EMAIL_FROM));
  });

  it('reply-to is a bare address, since Resend types it as string | string[]', () => {
    expect(EMAIL_REPLY_TO).not.toMatch(/[<>]/);
    expect(EMAIL_REPLY_TO).toMatch(/^[^@\s]+@[^@\s]+$/);
  });

  it('the advertised contact address matches where replies actually land', () => {
    // If these drift, the site tells people to write to one mailbox while
    // replies land in another — and one of them is unmonitored.
    expect(CONTACT_ADDRESS).toBe(EMAIL_REPLY_TO);
  });
});

describe('senderFields', () => {
  it('always supplies both from and reply_to', () => {
    const f = senderFields();
    expect(f.from).toBe(EMAIL_FROM);
    expect(f.reply_to).toBe(EMAIL_REPLY_TO);
  });

  it('uses snake_case reply_to, which is what the Resend SDK reads', () => {
    // resend@3.5.0 types this as `reply_to`. A camelCase `replyTo` is not
    // rejected — it is silently ignored, which is how this stays broken
    // while looking fixed.
    const f = senderFields();
    expect(Object.keys(f)).toContain('reply_to');
    expect(Object.keys(f)).not.toContain('replyTo');
  });

  it('lets a caller override From without losing Reply-To', () => {
    // Venue outreach sends as a person rather than the brand, but a venue
    // replying "yes, let's talk" is a business lead and must still arrive.
    const f = senderFields({ from: 'Taylor <taylor@mail.sparkdate.date>' });
    expect(f.from).toBe('Taylor <taylor@mail.sparkdate.date>');
    expect(f.reply_to).toBe(EMAIL_REPLY_TO);
  });
});

describe('listUnsubscribeHeader', () => {
  const url = 'https://sparkdate.date/api/unsubscribe?t=abc';

  it('puts the URL first, ahead of the mailto', () => {
    // RFC 8058: the URL form is what Gmail and Outlook drive their one-click
    // button from, and the only half that works with no inbound mail set up.
    const h = listUnsubscribeHeader(url);
    expect(h.indexOf(`<${url}>`)).toBe(0);
    expect(h.indexOf('mailto:')).toBeGreaterThan(h.indexOf(url));
  });

  it('wraps both forms in angle brackets, comma-separated', () => {
    expect(listUnsubscribeHeader(url))
      .toBe(`<${url}>, <mailto:${CONTACT_ADDRESS}?subject=Unsubscribe>`);
  });

  it('points the mailto at the routable root domain', () => {
    const mailto = listUnsubscribeHeader(url).match(/mailto:([^?>]+)/)[1];
    expect(domainOf(mailto)).toBe('sparkdate.date');
  });
});
