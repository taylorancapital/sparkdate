// server-v2.js - Enhanced SparkDate Backend with QR Codes & Real-time Check-in
const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';
const DB_PATH = path.join(__dirname, 'sparkdate.db');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Serve HTML files
app.get('/*.html', (req, res) => {
  res.sendFile(path.join(__dirname, req.path));
});

// Initialize Database
const db = new Database(DB_PATH);
console.log('Connected to SQLite');
  if (err) console.error('DB connection error:', err);
  else console.log('Connected to SQLite');
});

// Database initialization
function initDB() {
  db.serialize(() => {
    // Users table (enhanced with role)
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      gender TEXT,
      seeking TEXT,
      age INTEGER,
      city TEXT,
      bio TEXT,
      photo_url TEXT,
      role TEXT DEFAULT 'participant',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Events table (enhanced with QR code)
    db.run(`CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      venue_name TEXT NOT NULL,
      venue_address TEXT,
      city TEXT,
      capacity INTEGER DEFAULT 30,
      attendees_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'upcoming',
      qr_code TEXT UNIQUE,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(created_by) REFERENCES users(id)
    )`);

    // Check-ins table (new)
    db.run(`CREATE TABLE IF NOT EXISTS checkins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      checked_in_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      checked_in_by INTEGER,
      UNIQUE(event_id, user_id),
      FOREIGN KEY(event_id) REFERENCES events(id),
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(checked_in_by) REFERENCES users(id)
    )`);

    // Event RSVPs table
    db.run(`CREATE TABLE IF NOT EXISTS rsvps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      status TEXT DEFAULT 'confirmed',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(event_id, user_id),
      FOREIGN KEY(event_id) REFERENCES events(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    // Matches table (enhanced with interaction tracking)
    db.run(`CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      user1_id INTEGER NOT NULL,
      user2_id INTEGER NOT NULL,
      user1_liked BOOLEAN DEFAULT 0,
      user2_liked BOOLEAN DEFAULT 0,
      matched BOOLEAN DEFAULT 0,
      interaction_notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(event_id) REFERENCES events(id),
      FOREIGN KEY(user1_id) REFERENCES users(id),
      FOREIGN KEY(user2_id) REFERENCES users(id)
    )`);

    // Messages table
    db.run(`CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id INTEGER NOT NULL,
      sender_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      read BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(match_id) REFERENCES matches(id),
      FOREIGN KEY(sender_id) REFERENCES users(id)
    )`);
  });
}

initDB();

// Helper functions
function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

function generateToken(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'Invalid token' });
  
  req.user = decoded;
  next();
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

// Generate QR code data (URL-based)
function generateQRCode(eventId) {
  return `${process.env.APP_URL || 'http://localhost:3001'}/event/${eventId}/checkin`;
}

// =============================================================================
// AUTH ROUTES
// =============================================================================

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name, gender, seeking, age, city, role } = req.body;
    
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const hashedPassword = hashPassword(password);
    const userRole = role || 'participant'; // Default to participant

    const result = await dbRun(
      `INSERT INTO users (email, password, name, gender, seeking, age, city, role) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [email, hashedPassword, name, gender, seeking, age, city, userRole]
    );

    const user = await dbGet('SELECT id, email, name, role FROM users WHERE id = ?', [result.id]);
    const token = generateToken(user);

    res.status(201).json({ user, token });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await dbGet('SELECT * FROM users WHERE email = ?', [email]);
    if (!user || !verifyPassword(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken(user);
    res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role }, token });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const user = await dbGet('SELECT id, email, name, bio, photo_url, age, city, role FROM users WHERE id = ?', [req.user.id]);
    res.json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// =============================================================================
// EVENTS ROUTES
// =============================================================================

app.get('/api/events', async (req, res) => {
  try {
    const events = await dbAll(
      `SELECT e.*, COUNT(r.id) as attendees_count, COUNT(c.id) as checked_in_count
       FROM events e 
       LEFT JOIN rsvps r ON e.id = r.event_id 
       LEFT JOIN checkins c ON e.id = c.event_id
       WHERE e.status = 'upcoming' 
       GROUP BY e.id 
       ORDER BY e.date ASC`
    );
    res.json(events);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/events/:id', async (req, res) => {
  try {
    const event = await dbGet(
      `SELECT e.*, COUNT(r.id) as attendees_count, COUNT(c.id) as checked_in_count
       FROM events e 
       LEFT JOIN rsvps r ON e.id = r.event_id 
       LEFT JOIN checkins c ON e.id = c.event_id
       WHERE e.id = ? 
       GROUP BY e.id`,
      [req.params.id]
    );
    res.json(event);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/events', authMiddleware, async (req, res) => {
  try {
    const { title, description, date, time, venue_name, venue_address, city, capacity } = req.body;
    
    const result = await dbRun(
      `INSERT INTO events (title, description, date, time, venue_name, venue_address, city, capacity, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, description, date, time, venue_name, venue_address, city, capacity, req.user.id]
    );

    // Generate QR code for the event
    const qrCode = uuidv4();
    await dbRun('UPDATE events SET qr_code = ? WHERE id = ?', [qrCode, result.id]);

    const event = await dbGet('SELECT * FROM events WHERE id = ?', [result.id]);
    res.status(201).json(event);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// =============================================================================
// RSVP ROUTES
// =============================================================================

app.post('/api/events/:id/rsvp', authMiddleware, async (req, res) => {
  try {
    const { event_id } = { event_id: req.params.id };
    
    await dbRun(
      `INSERT OR IGNORE INTO rsvps (event_id, user_id) VALUES (?, ?)`,
      [event_id, req.user.id]
    );

    const rsvp = await dbGet(
      'SELECT * FROM rsvps WHERE event_id = ? AND user_id = ?',
      [event_id, req.user.id]
    );

    res.json(rsvp);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/events/:id/attendees', async (req, res) => {
  try {
    const attendees = await dbAll(
      `SELECT u.id, u.name, u.age, u.city, u.bio 
       FROM users u 
       JOIN rsvps r ON u.id = r.user_id 
       WHERE r.event_id = ?`,
      [req.params.id]
    );
    res.json(attendees);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// =============================================================================
// CHECK-IN ROUTES (NEW)
// =============================================================================

app.post('/api/events/:id/checkin', authMiddleware, async (req, res) => {
  try {
    const eventId = req.params.id;
    const userId = req.user.id;

    // Verify user has RSVP'd
    const rsvp = await dbGet('SELECT * FROM rsvps WHERE event_id = ? AND user_id = ?', [eventId, userId]);
    if (!rsvp) {
      return res.status(400).json({ error: 'You must RSVP to check in' });
    }

    // Create check-in record
    const result = await dbRun(
      `INSERT OR IGNORE INTO checkins (event_id, user_id) VALUES (?, ?)`,
      [eventId, userId]
    );

    const checkin = await dbGet(
      'SELECT * FROM checkins WHERE event_id = ? AND user_id = ?',
      [eventId, userId]
    );

    res.json({ success: true, checkin });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Bartender check-in endpoint (scan QR code)
app.post('/api/events/:id/checkin-qr', authMiddleware, async (req, res) => {
  try {
    const { qr_code, user_email } = req.body;
    const eventId = req.params.id;

    // Verify bartender role
    if (req.user.role !== 'bartender' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only bartenders can check in users' });
    }

    // Find user by email
    const user = await dbGet('SELECT * FROM users WHERE email = ?', [user_email]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Create check-in record
    await dbRun(
      `INSERT OR IGNORE INTO checkins (event_id, user_id, checked_in_by) VALUES (?, ?, ?)`,
      [eventId, user.id, req.user.id]
    );

    const checkin = await dbGet(
      'SELECT * FROM checkins WHERE event_id = ? AND user_id = ?',
      [eventId, user.id]
    );

    res.json({ success: true, checkin, user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get checked-in attendees for an event
app.get('/api/events/:id/checked-in', async (req, res) => {
  try {
    const checkedIn = await dbAll(
      `SELECT u.id, u.name, u.age, u.city, u.bio, c.checked_in_at
       FROM users u 
       JOIN checkins c ON u.id = c.user_id 
       WHERE c.event_id = ?
       ORDER BY c.checked_in_at DESC`,
      [req.params.id]
    );
    res.json(checkedIn);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// =============================================================================
// MATCHES ROUTES
// =============================================================================

app.post('/api/matches', authMiddleware, async (req, res) => {
  try {
    const { event_id, other_user_id, liked, interaction_notes } = req.body;
    
    let match = await dbGet(
      `SELECT * FROM matches 
       WHERE event_id = ? AND 
       ((user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?))`,
      [event_id, req.user.id, other_user_id, other_user_id, req.user.id]
    );

    if (!match) {
      const result = await dbRun(
        `INSERT INTO matches (event_id, user1_id, user2_id, user1_liked, interaction_notes) 
         VALUES (?, ?, ?, ?, ?)`,
        [event_id, req.user.id, other_user_id, liked ? 1 : 0, interaction_notes]
      );
      match = await dbGet('SELECT * FROM matches WHERE id = ?', [result.id]);
    } else {
      const updateData = {};
      if (match.user1_id === req.user.id) {
        updateData.user1_liked = liked ? 1 : 0;
      } else {
        updateData.user2_liked = liked ? 1 : 0;
      }
      
      if (interaction_notes) {
        updateData.interaction_notes = interaction_notes;
      }

      await dbRun(
        `UPDATE matches SET user1_liked = ?, user2_liked = ?, interaction_notes = ? WHERE id = ?`,
        [
          match.user1_id === req.user.id ? (liked ? 1 : 0) : match.user1_liked,
          match.user2_id === req.user.id ? (liked ? 1 : 0) : match.user2_liked,
          interaction_notes || match.interaction_notes,
          match.id
        ]
      );

      match = await dbGet('SELECT * FROM matches WHERE id = ?', [match.id]);
    }

    // Check if mutual match
    if (match.user1_liked && match.user2_liked) {
      await dbRun('UPDATE matches SET matched = 1 WHERE id = ?', [match.id]);
    }

    res.json(match);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/matches/user/:userId', async (req, res) => {
  try {
    const matches = await dbAll(
      `SELECT * FROM matches 
       WHERE (user1_id = ? OR user2_id = ?) AND matched = 1
       ORDER BY created_at DESC`,
      [req.params.userId, req.params.userId]
    );
    res.json(matches);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// =============================================================================
// MESSAGES ROUTES
// =============================================================================

app.post('/api/messages', authMiddleware, async (req, res) => {
  try {
    const { match_id, content } = req.body;
    
    const result = await dbRun(
      `INSERT INTO messages (match_id, sender_id, content) VALUES (?, ?, ?)`,
      [match_id, req.user.id, content]
    );

    const message = await dbGet('SELECT * FROM messages WHERE id = ?', [result.id]);
    res.status(201).json(message);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/messages/:matchId', async (req, res) => {
  try {
    const messages = await dbAll(
      `SELECT * FROM messages WHERE match_id = ? ORDER BY created_at ASC`,
      [req.params.matchId]
    );
    res.json(messages);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// =============================================================================
// ADMIN ROUTES
// =============================================================================

app.get('/api/admin/stats', async (req, res) => {
  try {
    const stats = await dbGet(
      `SELECT 
        (SELECT COUNT(*) FROM users) as total_users,
        (SELECT COUNT(*) FROM events) as total_events,
        (SELECT COUNT(*) FROM matches WHERE matched = 1) as total_matches,
        (SELECT COUNT(*) FROM messages) as total_messages`
    );
    res.json(stats);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/admin/events', async (req, res) => {
  try {
    const events = await dbAll(
      `SELECT e.*, COUNT(r.id) as attendees_count, COUNT(c.id) as checked_in_count
       FROM events e 
       LEFT JOIN rsvps r ON e.id = r.event_id 
       LEFT JOIN checkins c ON e.id = c.event_id
       GROUP BY e.id 
       ORDER BY e.date DESC`
    );
    res.json(events);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/admin/events/:id', async (req, res) => {
  try {
    const { title, description, date, time, venue_name, city, capacity, status } = req.body;
    
    await dbRun(
      `UPDATE events SET title = ?, description = ?, date = ?, time = ?, venue_name = ?, city = ?, capacity = ?, status = ? WHERE id = ?`,
      [title, description, date, time, venue_name, city, capacity, status, req.params.id]
    );

    const event = await dbGet('SELECT * FROM events WHERE id = ?', [req.params.id]);
    res.json(event);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/admin/events/:id', async (req, res) => {
  try {
    await dbRun('DELETE FROM events WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/admin/users', async (req, res) => {
  try {
    const users = await dbAll(
      `SELECT id, email, name, age, city, gender, seeking, role, created_at FROM users ORDER BY created_at DESC`
    );
    res.json(users);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
