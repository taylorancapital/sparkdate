// server-render.js - SparkDate Backend optimized for Render deployment
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Simple in-memory database (for Render free tier)
const db = {
  users: [],
  events: [],
  rsvps: [],
  matches: [],
  messages: [],
  checkins: []
};

// PA Bars list for dropdown
const BARS = [
  { name: "Tavern on Broad", address: "1801 Broad St", city: "Philadelphia" },
  { name: "The Alchemy Bar", address: "260 S 15th St", city: "Philadelphia" },
  { name: "Continental Restaurant & Martini Bar", address: "1801 Chestnut St", city: "Philadelphia" },
  { name: "Butcher & The Egg", address: "1500 S 15th St", city: "Philadelphia" },
  { name: "Dirty Frank's", address: "347 South St", city: "Philadelphia" },
  { name: "Fergie's Pub", address: "1214 Sansom St", city: "Philadelphia" },
  { name: "Lokal", address: "537 S 4th St", city: "Philadelphia" },
  { name: "Vintage", address: "130 N 2nd St", city: "Philadelphia" },
  { name: "Rittenhouse Tavern", address: "1811 Rittenhouse Sq", city: "Philadelphia" },
  { name: "Parc", address: "1829 Chestnut St", city: "Philadelphia" },
  { name: "The Draught Horse", address: "1115 S Broad St", city: "Philadelphia" },
  { name: "Cavanaugh's Rittenhouse", address: "1800 Rittenhouse Sq", city: "Philadelphia" },
  { name: "Manayunk Brewery", address: "4120 Main St", city: "Philadelphia" },
  { name: "The Bourse", address: "111 S Independence Hall W", city: "Philadelphia" },
  { name: "Frankford Hall", address: "1210 Frankford Ave", city: "Philadelphia" },
  { name: "Kung Fu Necktie", address: "1250 Frankford Ave", city: "Philadelphia" },
  { name: "Barbuzzo", address: "110 S 13th St", city: "Philadelphia" },
  { name: "Lacroix at The Rittenhouse", address: "210 W Rittenhouse Sq", city: "Philadelphia" },
  { name: "Walnut Room", address: "1800 Walnut St", city: "Philadelphia" },
  { name: "Woody's", address: "202 S 13th St", city: "Philadelphia" },
  { name: "City Tavern", address: "138 S 2nd St", city: "Philadelphia" },
  { name: "The Plough and The Stars", address: "123 Chestnut St", city: "Philadelphia" },
  { name: "Ebar", address: "212 S Camac St", city: "Philadelphia" },
  { name: "The Gypsy Saloon", address: "614 S 7th St", city: "Philadelphia" },
  { name: "Bridget Foy's", address: "200 S Columbus Blvd", city: "Philadelphia" },
  { name: "Nodding Head Brewery", address: "1516 Sansom St", city: "Philadelphia" },
  { name: "The Tavern", address: "3402 Sansom St", city: "Philadelphia" },
  { name: "Jing Fong", address: "1001 Cherry St", city: "Philadelphia" },
  { name: "McGlinchey's Tavern", address: "1310 Drury St", city: "Philadelphia" },
  { name: "South Bowl", address: "550 S 2nd St", city: "Philadelphia" },
  { name: "Mama's on South St", address: "1234 South St", city: "Philadelphia" },
  { name: "The Raven Grill", address: "200 Lawrence Rd", city: "Haverford" },
  { name: "Vino Rosso", address: "149 W Lancaster Ave", city: "Wayne" },
  { name: "Bridget's", address: "200 Conestoga Rd", city: "Wayne" },
  { name: "Issei Noodle", address: "22 N Queen St", city: "Lancaster" },
  { name: "Lola's Market", address: "237 N Queen St", city: "Lancaster" },
  { name: "Mojo Asian Cuisine", address: "456 Walnut St", city: "Lancaster" },
  { name: "The Foundry", address: "123 Main St", city: "Lancaster" },
  { name: "Bellanave", address: "52 N Queen St", city: "Lancaster" }
];

// Serve HTML files
app.get('/*.html', (req, res) => {
  res.sendFile(path.join(__dirname, req.path));
});

// Get all bars for dropdown
app.get('/api/bars', (req, res) => {
  res.json(BARS);
});

// ==================== AUTH ROUTES ====================

app.post('/api/auth/register', (req, res) => {
  const { email, name, gender, seeking, age, city, password, role } = req.body;

  // Check if user exists
  if (db.users.find(u => u.email === email)) {
    return res.status(400).json({ error: 'User already exists' });
  }

  const userId = db.users.length + 1;
  const hashedPassword = bcrypt.hashSync(password, 10);

  const user = {
    id: userId,
    email,
    password: hashedPassword,
    name,
    gender,
    seeking,
    age,
    city,
    role: role || 'participant',
    bio: '',
    created_at: new Date().toISOString()
  };

  db.users.push(user);

  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role }
  });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  const user = db.users.find(u => u.email === email);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const validPassword = bcrypt.compareSync(password, user.password);
  if (!validPassword) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role }
  });
});

app.get('/api/auth/me', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.users.find(u => u.id === decoded.id);
    res.json(user);
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// ==================== EVENTS ROUTES ====================

app.get('/api/events', (req, res) => {
  res.json(db.events);
});

app.post('/api/events', (req, res) => {
  const { title, description, date, time, venue_name, venue_address, city, capacity } = req.body;
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'No token' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const event = {
      id: db.events.length + 1,
      title,
      description,
      date,
      time,
      venue_name,
      venue_address,
      city,
      capacity: capacity || 30,
      attendees_count: 0,
      status: 'upcoming',
      created_by: decoded.id,
      created_at: new Date().toISOString()
    };

    db.events.push(event);
    res.json(event);
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

app.get('/api/events/:id', (req, res) => {
  const event = db.events.find(e => e.id === parseInt(req.params.id));
  if (!event) return res.status(404).json({ error: 'Event not found' });
  res.json(event);
});

app.put('/api/events/:id', (req, res) => {
  const event = db.events.find(e => e.id === parseInt(req.params.id));
  if (!event) return res.status(404).json({ error: 'Event not found' });

  Object.assign(event, req.body);
  res.json(event);
});

app.delete('/api/events/:id', (req, res) => {
  const idx = db.events.findIndex(e => e.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Event not found' });

  const deleted = db.events.splice(idx, 1);
  res.json(deleted[0]);
});

// ==================== RSVP ROUTES ====================

app.post('/api/events/:id/rsvp', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const eventId = parseInt(req.params.id);
    const event = db.events.find(e => e.id === eventId);

    if (!event) return res.status(404).json({ error: 'Event not found' });

    const rsvp = {
      id: db.rsvps.length + 1,
      event_id: eventId,
      user_id: decoded.id,
      status: 'confirmed',
      created_at: new Date().toISOString()
    };

    db.rsvps.push(rsvp);
    event.attendees_count++;

    res.json(rsvp);
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

app.get('/api/events/:id/attendees', (req, res) => {
  const eventId = parseInt(req.params.id);
  const rsvps = db.rsvps.filter(r => r.event_id === eventId);
  const attendees = rsvps.map(r => {
    const user = db.users.find(u => u.id === r.user_id);
    return { ...user, rsvp_id: r.id };
  });

  res.json(attendees);
});

// ==================== MATCHES ROUTES ====================

app.post('/api/matches', (req, res) => {
  const { event_id, user2_id, liked } = req.body;
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'No token' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user1_id = decoded.id;

    let match = db.matches.find(m =>
      (m.user1_id === user1_id && m.user2_id === user2_id && m.event_id === event_id) ||
      (m.user1_id === user2_id && m.user2_id === user1_id && m.event_id === event_id)
    );

    if (!match) {
      match = {
        id: db.matches.length + 1,
        event_id,
        user1_id,
        user2_id,
        user1_liked: liked,
        user2_liked: false,
        matched: false,
        created_at: new Date().toISOString()
      };
      db.matches.push(match);
    } else {
      if (match.user1_id === user1_id) {
        match.user1_liked = liked;
      } else {
        match.user2_liked = liked;
      }

      if (match.user1_liked && match.user2_liked) {
        match.matched = true;
      }
    }

    res.json(match);
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

app.get('/api/matches/user/:userId', (req, res) => {
  const userId = parseInt(req.params.userId);
  const userMatches = db.matches.filter(m =>
    (m.user1_id === userId || m.user2_id === userId) && m.matched
  );

  const matches = userMatches.map(m => {
    const otherId = m.user1_id === userId ? m.user2_id : m.user1_id;
    const otherUser = db.users.find(u => u.id === otherId);
    return { ...m, other_user: otherUser };
  });

  res.json(matches);
});

// ==================== MESSAGES ROUTES ====================

app.post('/api/messages', (req, res) => {
  const { match_id, content } = req.body;
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'No token' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const message = {
      id: db.messages.length + 1,
      match_id,
      sender_id: decoded.id,
      content,
      read: false,
      created_at: new Date().toISOString()
    };

    db.messages.push(message);
    res.json(message);
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

app.get('/api/messages/:matchId', (req, res) => {
  const matchId = parseInt(req.params.matchId);
  const messages = db.messages.filter(m => m.match_id === matchId);
  res.json(messages);
});

// ==================== ADMIN ROUTES ====================

app.get('/api/admin/stats', (req, res) => {
  res.json({
    users: db.users.length,
    events: db.events.length,
    matches: db.matches.filter(m => m.matched).length,
    messages: db.messages.length,
    revenue: 0,
    premiumUsers: 0
  });
});

app.get('/api/admin/users', (req, res) => {
  res.json(db.users.map(u => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    created_at: u.created_at
  })));
});

app.get('/api/admin/events', (req, res) => {
  res.json(db.events);
});

app.put('/api/admin/events/:id', (req, res) => {
  const event = db.events.find(e => e.id === parseInt(req.params.id));
  if (!event) return res.status(404).json({ error: 'Event not found' });

  Object.assign(event, req.body);
  res.json(event);
});

app.delete('/api/admin/events/:id', (req, res) => {
  const idx = db.events.findIndex(e => e.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Event not found' });

  const deleted = db.events.splice(idx, 1);
  res.json(deleted[0]);
});

// ==================== INITIALIZE DUMMY DATA ====================

function initializeDummyData() {
  // Participants
  const participants = [
    { id: 1, email: 'alice@test.com', password: bcrypt.hashSync('password123', 10), name: 'Alice Johnson', gender: 'F', seeking: 'M', age: 27, city: 'Philadelphia', role: 'participant', bio: 'Adventure seeker' },
    { id: 2, email: 'bob@test.com', password: bcrypt.hashSync('password123', 10), name: 'Bob Mitchell', gender: 'M', seeking: 'F', age: 29, city: 'Philadelphia', role: 'participant', bio: 'Tech enthusiast' },
    { id: 3, email: 'sarah@test.com', password: bcrypt.hashSync('password123', 10), name: 'Sarah Davis', gender: 'F', seeking: 'M', age: 26, city: 'Philadelphia', role: 'participant', bio: 'Artist' },
  ];

  // Bartenders
  const bartenders = [
    { id: 4, email: 'bartender1@test.com', password: bcrypt.hashSync('password123', 10), name: 'Joe Santos', role: 'bartender', gender: null, seeking: null, age: null, city: null, bio: '' },
    { id: 5, email: 'bartender2@test.com', password: bcrypt.hashSync('password123', 10), name: 'Maria Garcia', role: 'bartender', gender: null, seeking: null, age: null, city: null, bio: '' },
  ];

  // Admin
  const admin = [
    { id: 6, email: 'admin@test.com', password: bcrypt.hashSync('admin123', 10), name: 'Admin User', role: 'admin', gender: null, seeking: null, age: null, city: null, bio: '' },
  ];

  // Events
  const events = [
    { id: 1, title: 'Speed Dating Night - Philadelphia', description: 'Meet new singles!', date: '2026-05-15', time: '19:00', venue_name: 'The Foundry', venue_address: '123 Main St', city: 'Philadelphia', capacity: 30, attendees_count: 0, status: 'upcoming', created_by: 6, created_at: new Date().toISOString() },
    { id: 2, title: 'Singles Mixer - Center City', description: 'Casual meetup for singles', date: '2026-05-20', time: '18:30', venue_name: 'Mojo Asian Cuisine', venue_address: '456 Walnut St', city: 'Philadelphia', capacity: 25, attendees_count: 0, status: 'upcoming', created_by: 6, created_at: new Date().toISOString() },
  ];

  db.users = [...participants, ...bartenders, ...admin];
  db.events = events;

  console.log('✅ Dummy data initialized');
}

initializeDummyData();

// ==================== START SERVER ====================

app.listen(PORT, () => {
  console.log(`🎯 SparkDate API running on http://localhost:${PORT}`);
  console.log(`Visit: http://localhost:${PORT}/participant-landing-revamped.html`);
});

