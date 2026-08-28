// tests/analytics-dimensions.test.js
//
// A custom dimension is only as good as its least-tagged page.
//
// PR #265 moved `in_app_browser` to CONFIG level so it would ride on every
// event instead of the five that named it -- but it did that on lp.html,
// event.html and events.html only. The other thirteen pages that load GA4
// kept a bare config block, so their events carried no value at all. The
// 2026-08-26 GA4 report read 182 such events on a single finalised day and
// mistook the shortfall for a regression in the fix, because "the parameter
// is absent" and "the parameter is empty" look the same in a GA4 export.
//
// This project has no shared bundle (the 12-function Vercel Hobby cap is why),
// so every page carries its own copy of the GA4 bootstrap and a new page can
// silently omit the dimension. That is a structural risk, not a one-off
// mistake, so it gets a structural check.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const PUBLIC = path.join(process.cwd(), 'public');
const read = (f) => fs.readFileSync(path.join(PUBLIC, f), 'utf8');

const htmlFiles = fs.readdirSync(PUBLIC).filter((f) => f.endsWith('.html'));

// Derived from the source rather than hard-coded, so a NEW page that loads
// GA4 is covered the day it is added instead of the day someone remembers to
// update this list.
const ga4Pages = htmlFiles.filter((f) => /gtag\('config', 'G-/.test(read(f)));

// The webview UA test is duplicated per page out of necessity (no bundle), so
// the suite compares the pages against EACH OTHER rather than against a copy
// pinned in here -- a seventeenth transcription of the same regex is one more
// place for it to drift, and the copy in the test would be the one nobody
// notices is stale. A page that tests for a different set of webviews reports
// a dimension that means something different, which is worse than not
// reporting one at all.
const uaTestFor = (file) => {
  const m = read(file).match(/'in_app_browser':\s*(.+?),?\s*$/m);
  return m ? m[1] : null;
};

describe('GA4 custom dimensions', () => {
  it('finds the GA4 pages', () => {
    // A guard on the guard: if this ever returns nothing, every check below
    // passes vacuously and the suite proves nothing.
    expect(ga4Pages.length).toBeGreaterThan(0);
  });

  it.each(ga4Pages)('%s sets in_app_browser at config level', (file) => {
    const src = read(file);

    // Must be inside the config object, not merely present in the file --
    // event.html and events.html also pass in_app_browser to individual
    // events, and that is exactly the pattern #265 existed to replace.
    const config = src.match(/gtag\('config', 'G-[\w-]+',\s*\{[\s\S]*?\}\);/);
    expect(config, `${file} has a gtag config call that this test cannot parse`).toBeTruthy();

    expect(
      config[0].includes("'in_app_browser'"),
      `${file} loads GA4 but does not set 'in_app_browser' in its config block, so every `
      + `event from this page records the dimension as (not set).`,
    ).toBe(true);
  });

  it('classifies webviews identically on every page', () => {
    const found = ga4Pages.map((f) => [f, uaTestFor(f)]);
    const distinct = new Set(found.map(([, t]) => t));

    expect(
      distinct.size,
      `Expected one webview UA test across ${ga4Pages.length} GA4 pages, found ${distinct.size}:\n`
      + found.map(([f, t]) => `  ${f}: ${t}`).join('\n'),
    ).toBe(1);

    // Guards the extractor itself: if the regex above stops matching, every
    // page returns null, the set collapses to one, and the check above passes
    // while testing nothing.
    expect(
      [...distinct][0],
      'no in_app_browser UA test could be extracted from any page',
    ).toContain('navigator.userAgent');
  });
});
