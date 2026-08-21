# Email runbook — sending, receiving, deliverability

## The problem this documents

**Measured 2026-08-21 against live DNS:**

```
sparkdate.date        MX: none      SPF: none    DMARC: none
mail.sparkdate.date   MX: none      SPF: none    DKIM: present
```

`sparkdate.date` has **no MX record**, so it accepts no mail at all. Every
address the site advertises hard bounces:

| Address | Advertised in |
|---|---|
| `hello@` | index.html, signup.html, terms.html, unsubscribe page, List-Unsubscribe header |
| `support@` | account.html, city.html, event.html, events.html, signup.html, cancel-subscription |
| `privacy@` | privacy.html |
| `safety@` | terms.html |
| `security@` | `.well-known/security.txt` |
| `taylor@` | SECURITY_RUNBOOK.md, venue outreach |
| `admin@` | admin.html |

Anyone who emailed any of them got a bounce that reads as though the business
had shut down. **Every bounce is a lead nobody knew was lost.**

Separately, mail was sent from `hello@mail.sparkdate.date` with **no Reply-To
header**, so hitting Reply also went to the sending subdomain — which has no
MX either, and never will, because a sending domain does not need one. So
replies bounced too.

The code half is fixed (`lib/email-sender.js` — every send now sets
`reply_to`). **The DNS half is below and has to be done by hand.**

---

## 1. Make `sparkdate.date` receive mail — Cloudflare Email Routing

The domain is already on Cloudflare (`leanna.ns.cloudflare.com`,
`zahir.ns.cloudflare.com`), so this is free and takes about ten minutes. It
forwards to an inbox you already have — there is no mailbox to buy or run.

1. Cloudflare dashboard → **sparkdate.date** → **Email** → **Email Routing**.
2. **Get started** / **Enable**. Cloudflare offers to add the required MX and
   SPF records automatically — accept.
3. Under **Destination addresses**, add the real inbox you want mail to land
   in, and click the verification link Cloudflare emails you. *Routing does
   nothing until the destination is verified.*
4. Under **Custom addresses**, add `hello@sparkdate.date` → that destination.
5. **Enable catch-all**, pointing at the same destination.

Step 5 is the one that matters most: the site advertises **seven** addresses,
and a catch-all makes all of them work at once — including `security@`, which
is what a researcher would use to report a vulnerability, and `privacy@`,
which is in the privacy policy as the route for data requests.

### Careful

- These MX records go on the **root** (`sparkdate.date`). **Do not add them to
  `mail.sparkdate.date`** — that subdomain belongs to Resend.
- Cloudflare Email Routing is **forward-only**. You can receive at
  `hello@sparkdate.date`, but you cannot *send* as it from Gmail without extra
  setup. That is fine: the app already sends via Resend.

---

## 2. Fix SPF on the sending domain — deliverability

DKIM is configured (`resend._domainkey.mail.sparkdate.date` resolves) but
there is **no SPF record** on `mail.sparkdate.date`. Missing SPF makes
marketing mail more likely to land in spam — another way leads disappear
without any visible error.

**Open the Resend dashboard → Domains → `mail.sparkdate.date`.** It lists the
exact records and flags which are missing. Use what it shows rather than the
values below, which are the common defaults and vary by region:

```
TXT   mail.sparkdate.date   v=spf1 include:amazonses.com ~all
MX    mail.sparkdate.date   feedback-smtp.us-east-1.amazonses.com   priority 10
```

That MX is Resend/SES **bounce and complaint handling**, not an inbox — which
is why it does not conflict with step 1, and why `mail.` still cannot receive
human mail afterwards.

---

## 3. DMARC — after the above, not before

Once SPF and DKIM both pass, add a monitor-only DMARC record. Do **not** start
at `p=reject`; you will silently bin your own mail if anything is
misconfigured.

```
TXT   _dmarc.sparkdate.date   v=DMARC1; p=none; rua=mailto:hello@sparkdate.date
```

Leave it at `p=none` for a few weeks, read the reports, then tighten to
`p=quarantine` only if they are clean.

---

## Verify

```bash
node scripts/check-email-dns.js
```

Checks MX, SPF, DKIM and DMARC on both domains and prints what is missing.
Exits non-zero while anything required is absent, so it is usable as a gate.

Manual equivalent, in PowerShell:

```powershell
Resolve-DnsName sparkdate.date -Type MX -Server 8.8.8.8
```

Then send yourself a real test: email `hello@sparkdate.date` from an outside
account and confirm it arrives. Reply to a SparkDate email and confirm that
arrives too — those are two different paths and step 1 only fixes the first
if `reply_to` is deployed.

---

## Sending identity, for reference

Defined once in `lib/email-sender.js`:

| | |
|---|---|
| `EMAIL_FROM` | `SparkDate <hello@mail.sparkdate.date>` — Resend's verified sending domain |
| `EMAIL_REPLY_TO` | `hello@sparkdate.date` — the root domain, routed by step 1 |

Bulk sending stays on the `mail.` subdomain deliberately: a deliverability
problem with marketing mail then cannot damage the root domain's reputation
for transactional mail (receipts, match notifications). **Do not "fix" the
From address to the root domain.**

Both are overridable by environment variable (`EMAIL_FROM`, `EMAIL_REPLY_TO`)
if you need to point replies somewhere else before step 1 is done.
