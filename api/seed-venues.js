// api/seed-venues.js
// One-shot seeder: pushes a venue list into Firestore.
// Admin-only — caller must present a Firebase ID token with the
// `admin: true` custom claim. Skips venues that already exist (by
// case-insensitive name) so it's safe to call repeatedly.

const path = require('path');
const fs = require('fs');
const { admin, requireAdmin } = require('../lib/auth');
const { applyCors } = require('../lib/cors');

const db = admin.firestore();

// Default Philly venue list lives in data/default-venues.json (audit L3:
// extracted from inline so it can be edited without redeploying code,
// and so the API file stays small enough to skim).
//
// ⚠️ VERIFY addresses before sending outreach. The Philly venues are
// real institutions, but a few addresses may be wrong (the seed was
// AI-assisted). Trust the NAMES, double-check the ADDRESSES against
// Google before contacting.
//
// Lancaster section was stripped — it was 30+ obviously AI-generated
// repeats ("Mojo Social", "Mojo Social Kitchen", etc.). Add real
// Lancaster venues manually as you research them.
let _defaultVenues = null;
function getDefaultVenues() {
  if (_defaultVenues) return _defaultVenues;
  const filePath = path.join(__dirname, '..', 'data', 'default-venues.json');
  _defaultVenues = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return _defaultVenues;
}

// Parse a stars value (Google reviews rating). Accepts strings like
// "4.7", "4,7" (Euro locale), or numbers. Returns null for empty/junk so
// upsert can tell "user did not provide a value" from "user said 0".
function parseStars(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = parseFloat(String(raw).replace(',', '.'));
  if (!isFinite(n)) return null;
  return Math.max(0, Math.min(5, n));
}

// Normalize a single venue object from any source (hardcoded list, CSV
// upload, JSON paste). Returns null if invalid (no name) so the caller
// can skip rather than write garbage.
function normalizeVenue(raw) {
  const name = String(raw.name || '').trim();
  if (!name) return null;
  return {
    name,
    address: String(raw.address || '').trim(),
    city: String(raw.city || '').trim(),
    type: String(raw.type || '').trim(),
    contact_email: raw.contact_email ? String(raw.contact_email).trim() : null,
    contact_name:  raw.contact_name  ? String(raw.contact_name).trim()  : null,
    contact_phone: raw.contact_phone ? String(raw.contact_phone).trim() : null,
    notes: raw.notes ? String(raw.notes).trim() : '',
    // `description` is the customer-facing blurb (shown to members,
    // pulled into event descriptions). `notes` stays internal/operational.
    description: raw.description ? String(raw.description).trim() : '',
    stars: parseStars(raw.stars),
  };
}

// Build the patch for upsert: only include keys where the new row has
// non-empty data. Critically: pipeline state (status, contacted_at,
// responded_at, booked_at, event_id, createdAt) is NEVER touched —
// otherwise re-uploading a CSV would wipe out the work you've done.
//
// Returns null if the row has nothing to merge, so the caller can count
// it as "skipped" rather than firing a no-op write.
function buildUpdatePatch(venue) {
  const patch = {};
  // Strings — only overwrite if non-empty.
  for (const key of ['address', 'city', 'type', 'contact_email', 'contact_name', 'contact_phone', 'notes', 'description']) {
    const v = venue[key];
    if (v !== null && v !== undefined && String(v).trim() !== '') {
      patch[key] = v;
    }
  }
  // Stars — only overwrite if a parseable value was provided.
  if (venue.stars !== null && venue.stars !== undefined) {
    patch.stars = venue.stars;
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // Admin-only — no anonymous bulk-seed.
  try {
    await requireAdmin(req);
  } catch (e) {
    return res.status(e.statusCode || 401).json({ error: e.message });
  }

  try {
    // Pick the source list:
    //   - If the caller passed a `venues` array in the body, use that (CSV
    //     upload from the admin UI). Cap at 1000 to prevent abuse.
    //   - Otherwise, fall back to the hardcoded curated Philly list.
    let source;
    const bodyVenues = req.body?.venues;
    // Upsert mode: when true, rows that match an existing venue by name
    // get their non-empty fields merged into the existing doc instead of
    // being skipped. Used by the admin CSV upload to backfill emails on
    // venues that were seeded without contact info.
    const upsert = req.body?.upsert === true;

    if (Array.isArray(bodyVenues)) {
      if (bodyVenues.length > 1000) {
        return res.status(413).json({ error: 'Too many venues in one request (max 1000)' });
      }
      source = bodyVenues.map(normalizeVenue).filter(Boolean);
      if (source.length === 0) {
        return res.status(400).json({ error: 'No valid venues in payload (each row needs at least a name)' });
      }
    } else {
      source = getDefaultVenues();
    }

    // Build a name → docRef map of existing venues once so we don't
    // round-trip Firestore on every loop iteration.
    const existingSnap = await db.collection('venues').get();
    const existingByName = new Map(); // lowercase-name → { ref, data }
    for (const d of existingSnap.docs) {
      const key = (d.data().name || '').toLowerCase().trim();
      if (key) existingByName.set(key, { ref: d.ref, data: d.data() });
    }

    let added = 0;
    let updated = 0;
    let skipped = 0;

    // Batch all writes (audit L2). Firestore batches commit up to 500
    // operations in a single round-trip; previously this code did one
    // round-trip per venue, which for a 1000-row CSV upload meant 1000
    // sequential RPCs. Flush whenever the batch fills up.
    const BATCH_LIMIT = 500;
    let batch = db.batch();
    let opsInBatch = 0;
    const flush = async () => {
      if (opsInBatch === 0) return;
      await batch.commit();
      batch = db.batch();
      opsInBatch = 0;
    };

    for (const venue of source) {
      const key = venue.name.toLowerCase().trim();
      const existing = existingByName.get(key);

      if (existing) {
        // Match found.
        if (!upsert) { skipped++; continue; }
        const patch = buildUpdatePatch(venue);
        if (!patch) { skipped++; continue; } // upload row had no new info
        batch.update(existing.ref, patch);
        opsInBatch++;
        updated++;
      } else {
        // New venue: full insert with default pipeline state. We pre-
        // allocate the doc ref so we can stash it back into the
        // existingByName map for in-batch dedup of duplicate rows.
        const newRef = db.collection('venues').doc();
        batch.set(newRef, {
          ...venue,
          status: 'not_contacted',
          contacted_at: null,
          responded_at: null,
          booked_at: null,
          event_id: null,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        opsInBatch++;
        existingByName.set(key, { ref: newRef, data: venue });
        added++;
      }

      if (opsInBatch >= BATCH_LIMIT) await flush();
    }
    await flush();

    const sourceLabel = Array.isArray(bodyVenues) ? 'uploaded list' : 'default Philly list';
    console.log(`🎉 Seeded from ${sourceLabel} (upsert=${upsert}): ${added} added, ${updated} updated, ${skipped} skipped`);

    return res.status(200).json({
      success: true,
      venues_added: added,
      venues_updated: updated,
      venues_skipped: skipped,
      source: sourceLabel,
      upsert,
      message: `${added} added · ${updated} updated · ${skipped} skipped`,
    });

  } catch (err) {
    console.error('[seed-venues] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
