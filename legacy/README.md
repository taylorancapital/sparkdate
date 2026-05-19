# legacy/

These files are leftover from the Render + Express + JWT era (before the
move to Vercel serverless + Firebase). They are NOT loaded by the live
site. They are kept here for archaeology — delete if you don't need
them.

| file                       | what it was                                          |
| -------------------------- | ---------------------------------------------------- |
| `server-v2.js`             | Old Express server. Hardcoded JWT_SECRET fallback.   |
| `seed-pa-bars.js`          | Original Pennsylvania bars dataset.                  |
| `create-dummy-accounts.js` | Stub for seeding test users.                         |
| `Procfile.txt`             | Heroku/Render process declaration.                   |
| `FirebaseConfig.txt`       | Stray Firebase config snippet — duplicated in HTML.  |
| `API_REFERENCE.json`       | Old Express API surface — does not match Vercel API. |
| `SETUP_GUIDE_v2.md`        | Render-era setup walkthrough.                        |

## Current architecture

- Serverless functions in `api/` (Vercel)
- Shared helpers in `lib/`
- Static HTML in `public/`
- Firestore as the database; Firebase Admin SDK on the server side
- Stripe for payments + 3-D Secure
- Resend for email
- Firestore Security Rules in `firestore.rules` (deploy with
  `firebase deploy --only firestore:rules`)
- Cron in `vercel.json` (just `cron-send-emails` for now)
