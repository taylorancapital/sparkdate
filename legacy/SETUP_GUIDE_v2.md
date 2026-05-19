# SparkDate v2.0 — Complete Setup Guide

## Overview

SparkDate is a speed dating app where participants meet at real bar events, check in via QR code, and match with people they connected with. The app supports three user roles: **Participants**, **Bartenders**, and **Admins**.

---

## Architecture

```
sparkdate-app/
├── server-v2.js                 ← Backend API (Express + SQLite)
├── package-v2.json              ← Dependencies (rename to package.json)
├── seed-pa-bars.js              ← Seed script (85+ PA bars & 200+ events)
│
├── participant-landing.html     ← Participant sign-up/login page
├── participant-dashboard.html   ← Participant: browse, RSVP, check-in, match, message
│
├── bartender-landing.html       ← Bartender sign-up/login page
├── bartender-dashboard.html     ← Bartender: QR scanner, check-in, attendee list
│
├── admin-landing.html           ← Admin login page
├── admin-dashboard-v2.html      ← Admin: stats, events, users, matches management
│
├── sparkdate-landing.html       ← Public marketing landing page
└── COMPLETE_SETUP_GUIDE.md      ← This file
```

---

## Quick Start (5 minutes)

### 1. Install Dependencies

```bash
# Rename package-v2.json to package.json
cp package-v2.json package.json

# Install
npm install
```

### 2. Start the Server

```bash
npm start
```

Server runs on **http://localhost:3001**

### 3. Seed the Database (Optional)

```bash
node seed-pa-bars.js
```

This adds 85+ real bars from Greater Philadelphia & Lancaster, PA with 200+ speed dating events.

### 4. Create an Admin Account

```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Admin","email":"admin@sparkdate.com","password":"admin123","role":"admin"}'
```

### 5. Open the App

| Role | URL |
|------|-----|
| Public Landing | http://localhost:3001/sparkdate-landing.html |
| Participant | http://localhost:3001/participant-landing.html |
| Bartender | http://localhost:3001/bartender-landing.html |
| Admin | http://localhost:3001/admin-landing.html |

---

## User Flows

### Participant Flow

```
1. Sign up → participant-landing.html
2. Browse events → participant-dashboard.html (Browse Events tab)
3. RSVP to an event → Click "RSVP" button
4. Arrive at bar → Show QR code to bartender (Check-In tab)
5. Mingle freely at the event
6. Select matches → Match tab (during or after event)
7. Mutual match revealed → Both users liked each other
8. Message match → Messages tab
```

### Bartender Flow

```
1. Sign up → bartender-landing.html
2. Select tonight's event → bartender-dashboard.html
3. As attendees arrive → Scan QR or enter email to check them in
4. Monitor real-time attendee list (auto-refreshes every 10s)
5. Track check-in count vs RSVPs vs capacity
```

### Admin Flow

```
1. Login → admin-landing.html
2. View platform stats → Dashboard tab
3. Create/manage events → Events tab
4. Manage users → Users tab
5. Monitor matches → Matches tab
```

---

## API Reference

### Authentication

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/register` | POST | Register new user |
| `/api/auth/login` | POST | Login and get JWT token |

**Register body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securepass",
  "age": 28,
  "gender": "male",
  "city": "Philadelphia",
  "bio": "Love craft cocktails",
  "role": "participant"
}
```

**Roles:** `participant`, `bartender`, `admin`

### Events

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/events` | GET | No | List all events |
| `/api/events` | POST | Yes | Create event |
| `/api/events/:id` | GET | No | Get event details |
| `/api/events/:id/rsvp` | POST | Yes | RSVP to event |
| `/api/events/:id/checkin` | POST | Yes | Self check-in |
| `/api/events/:id/checkin-qr` | POST | Yes | Bartender QR check-in |
| `/api/events/:id/checked-in` | GET | No | Get checked-in attendees |
| `/api/events/:id/attendees` | GET | No | Get all RSVPs |

### Matching

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/matches` | POST | Yes | Submit like/pass |
| `/api/matches` | GET | Yes | Get user's matches |
| `/api/matches/mutual` | GET | Yes | Get mutual matches only |

**Match body:**
```json
{
  "event_id": 1,
  "other_user_id": 5,
  "liked": true
}
```

### Messages

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/messages/:matchId` | GET | Yes | Get conversation |
| `/api/messages/:matchId` | POST | Yes | Send message |

### Admin

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/admin/stats` | GET | No | Platform statistics |
| `/api/admin/events` | GET | Admin | All events with details |
| `/api/admin/events/:id` | DELETE | Admin | Delete event |
| `/api/admin/users` | GET | Admin | All users |

---

## QR Code Check-in System

### How It Works

1. **Participant RSVPs** to an event
2. **At the bar**, participant opens "Check-In" tab and selects their event
3. **QR code is generated** containing their user ID and event ID
4. **Bartender scans** the QR code (or manually enters email)
5. **System confirms** check-in and updates the real-time attendee list

### Bartender Check-in Methods

**Method 1: QR Scan** (Primary)
- Bartender opens their dashboard
- Points camera at participant's phone screen
- System auto-checks them in

**Method 2: Manual Email** (Backup)
- Bartender types participant's email
- Clicks "Check In"
- System confirms

**Method 3: Name Lookup** (Backup)
- Bartender clicks "Check In" button next to name in attendee list

---

## Matching System

### During the Event (Free-form Mingling)

1. Participants mingle freely at the bar — no structured rotations
2. At any time during or after the event, they open the "Match" tab
3. They see all checked-in attendees from their event
4. They tap ♥ (like) or ✕ (pass) for each person

### Mutual Match Detection

- When User A likes User B **AND** User B likes User A → **Mutual Match**
- Both users are immediately notified
- They can now message each other in the app

### Post-Event Window

- Users can continue submitting likes for **24 hours** after the event ends
- This gives time for people who want to reflect before deciding

---

## Database Schema

The app uses **SQLite** (file: `sparkdate.db`, auto-created on first run).

### Tables

| Table | Purpose |
|-------|---------|
| `users` | All user accounts (participants, bartenders, admins) |
| `events` | Speed dating events |
| `rsvps` | Event RSVPs |
| `checkins` | Event check-ins (with timestamps) |
| `likes` | Like/pass decisions |
| `matches` | Confirmed mutual matches |
| `messages` | Chat messages between matches |

---

## Deployment Options

### Option 1: Local Development
```bash
npm start
# Open http://localhost:3001
```

### Option 2: Railway
```bash
# Push to GitHub, connect to Railway
# Set PORT env variable (Railway provides this)
```

### Option 3: DigitalOcean / AWS
```bash
# Use PM2 for process management
npm install -g pm2
pm2 start server-v2.js --name sparkdate
```

### Option 4: Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .
EXPOSE 3001
CMD ["node", "server-v2.js"]
```

---

## Claude AI Integration

### Feeding Files to Claude

When working with Claude, provide these files in this order:

1. **server-v2.js** — Full backend (Claude can modify endpoints)
2. **COMPLETE_SETUP_GUIDE.md** — Context about the architecture
3. **The specific HTML file** you want to modify

### Example Claude Prompts

**Add a new feature:**
> "Here's my server-v2.js. Add an endpoint that lets participants see who else is attending an event before they RSVP."

**Fix a bug:**
> "Here's my bartender-dashboard.html. The manual check-in isn't showing success messages. Fix it."

**Extend matching:**
> "Here's my server-v2.js. Add a 'super like' feature that notifies the other person immediately."

---

## Customization

### Change Port
Edit `server-v2.js` line 1:
```js
const PORT = process.env.PORT || 3001;
```

### Change JWT Secret
Edit `server-v2.js`:
```js
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-here';
```

### Add More Cities
Edit `seed-pa-bars.js` and add entries to the `bars` array.

### Change Colors
Each HTML file has a `<style>` block. Key gradient values:
- Participant: `#667eea → #764ba2` (purple)
- Bartender: `#f093fb → #f5576c` (pink)
- Admin: `#667eea → #764ba2` (purple)

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Cannot find module 'better-sqlite3'" | Run `npm install` |
| "EADDRINUSE: port 3001" | Kill existing process: `lsof -i :3001` then `kill <PID>` |
| "Database locked" | Only one server instance should run at a time |
| "Invalid token" | Token expired (7 days). Login again. |
| Seed script fails | Make sure server is running first (`npm start`) |

---

## Security Notes

- JWT tokens expire after 7 days
- Passwords are hashed with bcrypt (10 rounds)
- Admin endpoints require admin role verification
- CORS is enabled for local development (restrict in production)
- SQLite database file should not be publicly accessible in production

---

## Next Steps

1. **Add real QR scanning** — Integrate a camera library (e.g., `html5-qrcode`) for the bartender dashboard
2. **Add push notifications** — Notify users of mutual matches in real-time
3. **Add payment processing** — Stripe integration for paid events
4. **Add photo uploads** — Profile photos and event images
5. **Mobile app wrapper** — Use Capacitor or React Native for native apps
