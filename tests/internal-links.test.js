// tests/internal-links.test.js
//
// UTM parameters belong on links that ARRIVE from somewhere else. Putting
// them on a link between two of our own pages is self-referral: GA4 treats
// the click as a new campaign session and overwrites the channel that
// actually brought the person to the site.
//
// This is not theoretical. /matches tagged five internal links with
// `utm_source=matches&utm_medium=web`, and GA4's traffic report grew rows for
// "matches / web" and "matches / (not set)" -- 52 sessions of Facebook, email
// and direct traffic relabelled as though the matches page had acquired them.
// Paid social was undercredited by exactly that amount.
//
// The click was already being measured by a select_content event, so the UTMs
// bought nothing and cost the acquisition data.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const PUBLIC = path.join(process.cwd(), 'public');

// Links that legitimately carry UTMs because they leave the site and come
// back: a member sharing their referral link, or an event share URL. Both
// are pasted into someone else's feed or inbox, which is exactly the case
// UTMs exist for.
const EXTERNAL_BY_DESIGN = ['utm_source=referral', 'utm_source=share'];

const htmlFiles = fs.readdirSync(PUBLIC)
  .filter((f) => f.endsWith('.html'))
  .map((f) => path.join(PUBLIC, f));

describe('internal links do not carry UTM parameters', () => {
  it('finds no self-referral tagging in any page', () => {
    const offenders = [];

    for (const file of htmlFiles) {
      const src = fs.readFileSync(file, 'utf8');
      const lines = src.split('\n');

      lines.forEach((line, i) => {
        if (!line.includes('utm_source=')) return;
        if (EXTERNAL_BY_DESIGN.some((ok) => line.includes(ok))) return;

        // Comments describe links, they do not create them. lp.html documents
        // the old '/lp?eventId=&utm_source=...' shape in prose, and flagging
        // that would train people to ignore this test.
        const trimmed = line.trim();
        if (/^(\/\/|\*|\/\*|<!--)/.test(trimmed)) return;

        // A relative href, or an absolute one pointing back at our own
        // domain, is an internal link. Anything else is leaving the site.
        const internal = /href=["'][^"']*\/(events|getaways|lp|account|matches|event|signup|city|blog)\b[^"']*utm_source=/.test(line)
          || /['"]\/(events|getaways|lp|account|matches|event|signup)[^'"]*utm_source=/.test(line)
          || /ticketPath[^;]*utm_source=/.test(line);

        if (internal) {
          offenders.push(`${path.basename(file)}:${i + 1}  ${line.trim().slice(0, 110)}`);
        }
      });
    }

    // Printed rather than just counted: a failure here needs to name the
    // line, or the next person has to re-derive the search.
    expect(offenders, `Internal links must not be UTM-tagged:\n  ${offenders.join('\n  ')}\n`)
      .toEqual([]);
  });

  it('still allows referral and share links to be tagged', () => {
    // The guard must not be so broad that it bans the legitimate case --
    // otherwise the next person deletes the test instead of the tag.
    const matches = fs.readFileSync(path.join(PUBLIC, 'matches.html'), 'utf8');
    expect(matches).toContain('utm_source=referral');
  });
});
