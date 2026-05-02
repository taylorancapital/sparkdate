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

// Serve HTML files
app.get('/*.html', (req, res) => {
  res.sendFile(path.join(__dirname, req.path));
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

// ==================== START SERVER ====================

app.listen(PORT, () => {
  console.log(`🎯 SparkDate API running on http://localhost:${PORT}`);
  console.log('✅ Database initialized (in-memory)');
});