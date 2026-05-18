// api/seed-venues.js
// One-shot seeder: pushes the hardcoded venue list into Firestore.
// Admin-only — caller must present a Firebase ID token with the
// `admin: true` custom claim. Skips venues that already exist (by
// case-insensitive name) so it's safe to call repeatedly.

const { admin, requireAdmin } = require('../lib/auth');
const { applyCors } = require('../lib/cors');

const db = admin.firestore();

// ⚠️ VERIFY addresses before sending outreach. The Philly venues below
// are real institutions, but a few addresses may be wrong (the seed was
// AI-assisted). Trust the NAMES, double-check the ADDRESSES against
// Google before contacting.
//
// Lancaster section was stripped — it was 30+ obviously AI-generated
// repeats ("Mojo Social", "Mojo Social Kitchen", "Issei Bar", "Issei
// Social", "Issei Social Lounge", etc., all sharing addresses on
// the same two blocks). Add real Lancaster venues manually as you
// research them.
const venues = [
  // ── PHILADELPHIA CENTER CITY (real venues — verify addresses) ──
  { name: "Tavern on Broad", address: "200 S Broad St, Philadelphia, PA 19102", city: "Philadelphia", type: "Historic Tavern" },
  { name: "Continental Restaurant & Martini Bar", address: "138 Market St, Philadelphia, PA 19106", city: "Philadelphia", type: "Upscale Martini Bar" },
  { name: "Dirty Frank's", address: "347 S 13th St, Philadelphia, PA 19107", city: "Philadelphia", type: "Dive Bar" },
  { name: "Fergie's Pub", address: "1214 Sansom St, Philadelphia, PA 19107", city: "Philadelphia", type: "Irish Pub" },
  { name: "Lokal", address: "139 N 3rd St, Philadelphia, PA 19106", city: "Philadelphia", type: "Cocktail Bar" },
  { name: "Vintage Wine Bar", address: "129 S 13th St, Philadelphia, PA 19107", city: "Philadelphia", type: "Wine Bar" },
  { name: "Rittenhouse Tavern", address: "208 S 13th St, Philadelphia, PA 19107", city: "Philadelphia", type: "Upscale Tavern" },
  { name: "Parc", address: "227 S 18th St, Philadelphia, PA 19103", city: "Philadelphia", type: "French Bistro" },
  { name: "Cavanaugh's Rittenhouse", address: "1823 Sansom St, Philadelphia, PA 19103", city: "Philadelphia", type: "Irish Pub" },
  { name: "Manayunk Brewing Co.", address: "4120 Main St, Philadelphia, PA 19127", city: "Philadelphia", type: "Brewery" },
  { name: "The Bourse Food Hall", address: "111 S Independence Mall E, Philadelphia, PA 19106", city: "Philadelphia", type: "Food Hall" },
  { name: "Frankford Hall", address: "1210 Frankford Ave, Philadelphia, PA 19125", city: "Philadelphia", type: "Beer Garden" },
  { name: "Kung Fu Necktie", address: "1250 N Front St, Philadelphia, PA 19122", city: "Philadelphia", type: "Live Music Venue" },
  { name: "Barbuzzo", address: "110 S 13th St, Philadelphia, PA 19107", city: "Philadelphia", type: "Mediterranean" },
  { name: "Lacroix at The Rittenhouse", address: "210 W Rittenhouse Sq, Philadelphia, PA 19103", city: "Philadelphia", type: "Fine Dining" },
  { name: "Woody's", address: "202 S 13th St, Philadelphia, PA 19107", city: "Philadelphia", type: "Bar" },
  { name: "Tria Cafe Rittenhouse", address: "123 S 18th St, Philadelphia, PA 19103", city: "Philadelphia", type: "Wine Bar" },
  { name: "Vesper Boys' Club", address: "223 S Sydenham St, Philadelphia, PA 19102", city: "Philadelphia", type: "Cocktail Lounge" },
  { name: "Abe Fisher", address: "1623 Sansom St, Philadelphia, PA 19103", city: "Philadelphia", type: "Modern Deli" },
  { name: "Ristorante Panorama", address: "14 N Front St, Philadelphia, PA 19106", city: "Philadelphia", type: "Italian Restaurant" },

  // ── PHILADELPHIA NEIGHBORHOODS / OUTSKIRTS ──
  { name: "Opa", address: "1311 Sansom St, Philadelphia, PA 19107", city: "Philadelphia", type: "Greek Restaurant" },
  { name: "Fogo de Chão", address: "1337 Chestnut St, Philadelphia, PA 19107", city: "Philadelphia", type: "Brazilian Steakhouse" },
  { name: "The Plough and the Stars", address: "123 Chestnut St, Philadelphia, PA 19106", city: "Philadelphia", type: "Irish Pub" },
  { name: "Khyber Pass Pub", address: "56 S 2nd St, Philadelphia, PA 19106", city: "Philadelphia", type: "Historic Pub" },
  { name: "Tattooed Mom", address: "530 South St, Philadelphia, PA 19147", city: "Philadelphia", type: "Bar with Rooftop" },
  { name: "The Twisted Tail", address: "509 S 2nd St, Philadelphia, PA 19147", city: "Philadelphia", type: "Whiskey Bar" },
  { name: "Sampan", address: "124 S 13th St, Philadelphia, PA 19107", city: "Philadelphia", type: "Asian Restaurant" },
  { name: "Osteria", address: "640 N Broad St, Philadelphia, PA 19130", city: "Philadelphia", type: "Italian Restaurant" },
  { name: "Radnor Hotel", address: "591 E Lancaster Ave, St Davids, PA 19087", city: "Radnor", type: "Historic Hotel Bar" },
  { name: "Barren Hill Tavern", address: "646 Germantown Pike, Lafayette Hill, PA 19444", city: "Lafayette Hill", type: "Historic Tavern" },
];

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
  };
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
    if (Array.isArray(bodyVenues)) {
      if (bodyVenues.length > 1000) {
        return res.status(413).json({ error: 'Too many venues in one request (max 1000)' });
      }
      source = bodyVenues.map(normalizeVenue).filter(Boolean);
      if (source.length === 0) {
        return res.status(400).json({ error: 'No valid venues in payload (each row needs at least a name)' });
      }
    } else {
      source = venues;
    }

    // De-dup against existing docs by case-insensitive name. Safe to call
    // repeatedly — only NEW venues get added.
    const existingSnap = await db.collection('venues').get();
    const existingNames = new Set(
      existingSnap.docs.map(d => (d.data().name || '').toLowerCase().trim())
    );

    let added = 0;
    let skipped = 0;

    for (const venue of source) {
      const key = venue.name.toLowerCase().trim();
      if (existingNames.has(key)) { skipped++; continue; }

      await db.collection('venues').add({
        ...venue,
        status: 'not_contacted',
        contacted_at: null,
        responded_at: null,
        booked_at: null,
        event_id: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      existingNames.add(key);
      added++;
    }

    const sourceLabel = Array.isArray(bodyVenues) ? 'uploaded list' : 'default Philly list';
    console.log(`🎉 Seeded from ${sourceLabel}: ${added} added, ${skipped} skipped`);

    return res.status(200).json({
      success: true,
      venues_added: added,
      venues_skipped: skipped,
      source: sourceLabel,
      message: `${added} new venues seeded; ${skipped} already existed.`,
    });

  } catch (err) {
    console.error('[seed-venues] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
