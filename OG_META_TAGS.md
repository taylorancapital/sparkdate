## Open Graph Meta Tags

Paste this block into the `<head>` of every public page (index.html, about.html, events.html, founding.html, signup.html, terms.html, privacy.html, event.html, account.html).

Insert it right after the existing `<title>` tag.

```html
<!-- Open Graph / social preview -->
<meta property="og:title" content="SparkDate — Stop swiping. Start living.">
<meta property="og:description" content="Real dates. Real venues. Real people. SparkDate is the IRL dating platform for Philadelphia.">
<meta property="og:image" content="https://sparkdate.date/og-image.svg">
<meta property="og:url" content="https://sparkdate.date">
<meta property="og:type" content="website">
<meta property="og:site_name" content="SparkDate">

<!-- Twitter card -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="SparkDate — Stop swiping. Start living.">
<meta name="twitter:description" content="Real dates. Real venues. Real people. The IRL dating platform for Philadelphia.">
<meta name="twitter:image" content="https://sparkdate.date/og-image.svg">

<!-- Favicon -->
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
```

## Notes

- For Twitter / iMessage, SVG works fine. For Facebook + LinkedIn, you may eventually want to convert to PNG (1200x630) — use https://cloudconvert.com/svg-to-png or any free converter.
- Each page can have a custom title/description if you want — these are defaults.
- For specific pages, override like this:

**signup.html:**
```html
<meta property="og:title" content="Join SparkDate — Your first event awaits">
<meta property="og:description" content="Sign up for SparkDate. Choose your tier. Meet real people at curated Philly events.">
```

**event.html:**
```html
<meta property="og:title" content="Founders Mixer · June 12 · SparkDate">
<meta property="og:description" content="An intimate evening of cocktails, conversation, and connection. Reserve your spot now.">
```

## Verifying Your OG Tags

After deploy, test with:
- **Twitter:** https://cards-dev.twitter.com/validator
- **Facebook:** https://developers.facebook.com/tools/debug/
- **LinkedIn:** https://www.linkedin.com/post-inspector/

Paste your URL → confirm preview looks right → if it doesn't, hit "scrape again" / "force refresh."
