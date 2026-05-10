# Landing Page — Deploy Guide (5 minutes)

**File:** `sparkdate_landing_page.html` (single file, no dependencies, fully responsive)

## Deploy in 5 minutes (free)

### Option A — Vercel (recommended)
1. Go to [vercel.com](https://vercel.com) → Sign up (free)
2. Click "Add New Project" → "Import"
3. Drag the HTML file into the upload area, OR upload to a GitHub repo first
4. Click Deploy. You get a `sparkdate-xxx.vercel.app` URL in 30 seconds.
5. Buy `sparkdate.com` from Namecheap/Cloudflare (~$12/yr) → connect domain in Vercel settings

### Option B — Netlify (drag-and-drop)
1. Go to [app.netlify.com/drop](https://app.netlify.com/drop)
2. Drag the HTML file onto the page
3. You get a live URL immediately
4. Connect a custom domain in Site Settings

### Option C — Cloudflare Pages
1. Go to [pages.cloudflare.com](https://pages.cloudflare.com)
2. Upload, deploy, done. Cloudflare also handles your domain registration cheaply.

---

## ⚠️ Before going public — wire up real form handling

The form currently shows a fake success message. To capture real emails, pick one and replace the placeholder code in the `<script>` block:

### Easiest: Formspree (free up to 50/mo)
1. Go to [formspree.io](https://formspree.io), sign up, create a new form
2. Copy your form endpoint (e.g. `https://formspree.io/f/xpzgkqyw`)
3. In `sparkdate_landing_page.html`, find this block:
   ```js
   setTimeout(() => { ... }, 800);
   ```
4. Replace with:
   ```js
   fetch('https://formspree.io/f/YOUR_FORM_ID', {
     method: 'POST',
     headers: {'Content-Type': 'application/json', 'Accept': 'application/json'},
     body: JSON.stringify({email: email})
   }).then(() => {
     btn.textContent = "✓ You're in";
     btn.style.background = '#02C39A';
     const success = document.getElementById('formSuccess');
     if (success) success.classList.add('show');
     form.querySelector('input').value = '';
   });
   ```

### Better long-term: ConvertKit, Mailchimp, or Resend
- ConvertKit and Mailchimp give you proper email automation (welcome sequence, broadcast, etc.) — important once you're sending updates to the waitlist.
- Resend is dev-friendly and pairs well if you build a real backend later.

---

## Customize before launch (search-and-replace)

| Find this | Replace with |
|---|---|
| `Join 247 Philadelphians on the waitlist.` | Real number once you have signups (or remove until you do) |
| `12` (in `<div class="counter-num">`) | Real founding member spots remaining |
| `width: 24%;` (in `.progress-fill`) | Real progress, e.g. `width: 76%;` if 38 of 50 spots filled |
| `hello@sparkdate.com` | Your real email |
| Instagram link `href="#"` | Your IG URL |
| `Q3 2026` | Your real launch quarter (only if it changes) |

---

## SEO checklist (5 min)

1. Buy `sparkdate.com` (or `.co` / `.app` if .com is gone)
2. Add a favicon — generate at [realfavicongenerator.net](https://realfavicongenerator.net), drop the files at the root
3. Add an Open Graph image (1200x630px) — first thing people see when you share a link. Hire on Fiverr for $20 or DIY in Figma.
4. Add this line to the `<head>`:
   ```html
   <meta property="og:image" content="https://sparkdate.com/og-image.png">
   ```
5. Submit to Google Search Console once domain is connected

---

## What's NOT on the landing page yet (intentional)

- **No about page** — adds nothing pre-launch
- **No press page** — nothing to put on it yet
- **No application form** — the email capture *is* the application; founding member screening happens in your reply email
- **No login** — there's nothing to log into yet
- **No app store badges** — app doesn't exist yet, don't promise what isn't built

Add these things only when you have something real to put behind them. Empty sections kill credibility.

---

## Recommended stack for the next 60 days

| Need | Tool | Cost |
|---|---|---|
| Hosting | Vercel | Free |
| Domain | Cloudflare Registrar | $10/yr |
| Email capture | Formspree → ConvertKit later | $0 → $15/mo |
| Analytics | Plausible or Cloudflare Web Analytics | $0 → $9/mo |
| Email sending | Resend (transactional) + ConvertKit (broadcasts) | $0 to start |

Total for first 60 days: **~$15-25/mo**

---

## What to do the day you go live

1. Send the URL to your 5 closest friends, ask them to sign up — gives you the first 5 emails so the form looks active
2. Update Instagram bio with the link
3. Soft-share in 2-3 niche Slack/Discord communities you're already in (don't blast)
4. Send DMs to 10 community organizers with the link (use scripts from `Founding_Member_Recruitment_Kit.md`)
5. Don't run paid ads yet. Wait until you've manually confirmed the funnel works.
