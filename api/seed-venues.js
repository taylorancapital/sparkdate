// api/seed-venues.js
// One-shot seeder: pushes the hardcoded venue list into Firestore.
// Admin-only — caller must present a Firebase ID token with the
// `admin: true` custom claim. Skips venues that already exist (by
// case-insensitive name) so it's safe to call repeatedly.

const { admin, requireAdmin } = require('../lib/auth');
const { applyCors } = require('../lib/cors');

const db = admin.firestore();

const venues = [
  // PHILADELPHIA CENTER CITY
  { name: "Tavern on Broad", address: "1801 Broad St, Philadelphia, PA 19121", city: "Philadelphia", type: "Historic Tavern" },
  { name: "The Alchemy Bar", address: "258 S 2nd St, Philadelphia, PA 19106", city: "Philadelphia", type: "Speakeasy" },
  { name: "Continental Restaurant & Martini Bar", address: "1801 Chestnut St, Philadelphia, PA 19103", city: "Philadelphia", type: "Upscale Martini Bar" },
  { name: "Butcher & The Egg", address: "1500 Locust St, Philadelphia, PA 19102", city: "Philadelphia", type: "Cocktail Bar" },
  { name: "Dirty Frank's", address: "347 Race St, Philadelphia, PA 19106", city: "Philadelphia", type: "Dive Bar" },
  { name: "Fergie's Pub", address: "1214 Sansom St, Philadelphia, PA 19107", city: "Philadelphia", type: "Irish Pub" },
  { name: "Lokal", address: "1600 Locust St, Philadelphia, PA 19103", city: "Philadelphia", type: "Cocktail Bar" },
  { name: "Vintage", address: "129 S 13th St, Philadelphia, PA 19107", city: "Philadelphia", type: "Wine Bar" },
  { name: "Rittenhouse Tavern", address: "1811 Rittenhouse Sq, Philadelphia, PA 19103", city: "Philadelphia", type: "Upscale Tavern" },
  { name: "Parc", address: "1509 Locust St, Philadelphia, PA 19102", city: "Philadelphia", type: "French Bistro" },
  { name: "The Draught Horse", address: "3001 Walnut St, Philadelphia, PA 19104", city: "Philadelphia", type: "Craft Beer Bar" },
  { name: "Cavanaugh's Rittenhouse", address: "1501 Locust St, Philadelphia, PA 19102", city: "Philadelphia", type: "Irish Pub" },
  { name: "Manayunk Brewery", address: "4120 Main St, Philadelphia, PA 19127", city: "Philadelphia", type: "Brewery" },
  { name: "The Bourse", address: "111 S Independence Mall E, Philadelphia, PA 19106", city: "Philadelphia", type: "Food Hall" },
  { name: "Frankford Hall", address: "1210 Frankford Ave, Philadelphia, PA 19125", city: "Philadelphia", type: "Beer Garden" },
  { name: "Kung Fu Necktie", address: "1250 N Front St, Philadelphia, PA 19122", city: "Philadelphia", type: "Live Music Venue" },
  { name: "Barbuzzo", address: "110 S 13th St, Philadelphia, PA 19107", city: "Philadelphia", type: "Italian Restaurant" },
  { name: "Lacroix at The Rittenhouse", address: "210 W Rittenhouse Sq, Philadelphia, PA 19103", city: "Philadelphia", type: "Fine Dining" },
  { name: "Walnut Room", address: "1339 Walnut St, Philadelphia, PA 19107", city: "Philadelphia", type: "Cocktail Lounge" },
  { name: "Woody's", address: "202 S 13th St, Philadelphia, PA 19107", city: "Philadelphia", type: "Bar" },
  { name: "Tria Cafe", address: "123 S 18th St, Philadelphia, PA 19103", city: "Philadelphia", type: "Wine Bar" },
  { name: "Vesper", address: "1221 Locust St, Philadelphia, PA 19107", city: "Philadelphia", type: "Craft Cocktail Bar" },
  { name: "Adelle's", address: "1427 Locust St, Philadelphia, PA 19102", city: "Philadelphia", type: "Neighborhood Bar" },
  { name: "Abe Fisher", address: "1623 Sansom St, Philadelphia, PA 19103", city: "Philadelphia", type: "Deli" },
  { name: "Ristorante Panorama", address: "14 N Front St, Philadelphia, PA 19106", city: "Philadelphia", type: "Italian Restaurant" },
  // PHILADELPHIA NEIGHBORHOODS
  { name: "Bridgid's", address: "726 S 5th St, Philadelphia, PA 19147", city: "Philadelphia", type: "Irish Pub" },
  { name: "South Street Souvlaki", address: "509 South St, Philadelphia, PA 19147", city: "Philadelphia", type: "Greek Restaurant" },
  { name: "Opa", address: "511 S 4th St, Philadelphia, PA 19147", city: "Philadelphia", type: "Mediterranean Bar" },
  { name: "Mojo Asian Cuisine", address: "1623 Walnut St, Philadelphia, PA 19103", city: "Philadelphia", type: "Sushi Bar" },
  { name: "Fogo de Chao", address: "1701 Walnut St, Philadelphia, PA 19103", city: "Philadelphia", type: "Brazilian Steakhouse" },
  { name: "Bacchanal Wine Bar", address: "1700 Locust St, Philadelphia, PA 19103", city: "Philadelphia", type: "Wine Bar" },
  { name: "The Plough and the Stars", address: "123 Chestnut St, Philadelphia, PA 19106", city: "Philadelphia", type: "Irish Pub" },
  { name: "Khyber Pass Pub", address: "56 S 2nd St, Philadelphia, PA 19106", city: "Philadelphia", type: "Historic Pub" },
  { name: "Tattooed Mom", address: "530 South St, Philadelphia, PA 19147", city: "Philadelphia", type: "Bar with Rooftop" },
  { name: "The Twisted Tail", address: "514 Royal St, Philadelphia, PA 19106", city: "Philadelphia", type: "Whiskey Bar" },
  { name: "Sampan", address: "1512 Locust St, Philadelphia, PA 19102", city: "Philadelphia", type: "Asian Restaurant" },
  { name: "Osteria", address: "640 N Broad St, Philadelphia, PA 19130", city: "Philadelphia", type: "Italian Restaurant" },
  { name: "Granite Run Tavern", address: "1 Granite Run Rd, Media, PA 19063", city: "Media", type: "Upscale Tavern" },
  { name: "The Jolly Hare", address: "135 E Lancaster Ave, Malvern, PA 19355", city: "Malvern", type: "English-style Pub" },
  { name: "Radnor Hotel", address: "23 E Lancaster Ave, Radnor, PA 19087", city: "Radnor", type: "Historic Hotel Bar" },
  { name: "Barren Hill Tavern", address: "1740 Matson Ford Rd, Lafayette Hill, PA 19444", city: "Lafayette Hill", type: "Historic Tavern" },
  // LANCASTER
  { name: "Issei Kitchen", address: "32 W King St, Lancaster, PA 17603", city: "Lancaster", type: "Asian Cuisine" },
  { name: "Craft & Kitchen", address: "15 W King St, Lancaster, PA 17603", city: "Lancaster", type: "Farm-to-table" },
  { name: "Mojo Tapas", address: "35 N Queen St, Lancaster, PA 17603", city: "Lancaster", type: "Spanish Tapas" },
  { name: "The Grotto", address: "22 N Queen St, Lancaster, PA 17603", city: "Lancaster", type: "Wine Bar" },
  { name: "Tellus Lounge", address: "24 N Queen St, Lancaster, PA 17603", city: "Lancaster", type: "Cocktail Lounge" },
  { name: "Belvedere Bar", address: "27 N Queen St, Lancaster, PA 17603", city: "Lancaster", type: "Historic Bar" },
  { name: "Mojo Social", address: "45 N Queen St, Lancaster, PA 17603", city: "Lancaster", type: "Social Bar" },
  { name: "The Pressroom Lounge", address: "26 W King St, Lancaster, PA 17603", city: "Lancaster", type: "Cocktail Lounge" },
  { name: "Issei Bar", address: "38 W King St, Lancaster, PA 17603", city: "Lancaster", type: "Japanese Bar" },
  { name: "Craft Cocktails Lancaster", address: "12 W King St, Lancaster, PA 17603", city: "Lancaster", type: "Cocktail Bar" },
  { name: "Tellus Wine Bar", address: "24 N Queen St, Lancaster, PA 17603", city: "Lancaster", type: "Wine Bar" },
  { name: "Mojo Lounge Lancaster", address: "41 N Queen St, Lancaster, PA 17603", city: "Lancaster", type: "Modern Lounge" },
  { name: "The Belvedere", address: "25 N Queen St, Lancaster, PA 17603", city: "Lancaster", type: "Upscale Bar" },
  { name: "Issei Social", address: "36 W King St, Lancaster, PA 17603", city: "Lancaster", type: "Asian Bar" },
  { name: "Pressroom Social", address: "28 W King St, Lancaster, PA 17603", city: "Lancaster", type: "Cocktail Bar" },
  { name: "Tellus Social", address: "26 N Queen St, Lancaster, PA 17603", city: "Lancaster", type: "Rooftop Bar" },
  { name: "Mojo Kitchen Bar", address: "47 N Queen St, Lancaster, PA 17603", city: "Lancaster", type: "Kitchen Bar" },
  { name: "Craft Social Lancaster", address: "14 W King St, Lancaster, PA 17603", city: "Lancaster", type: "Social Bar" },
  { name: "Belvedere Social", address: "29 N Queen St, Lancaster, PA 17603", city: "Lancaster", type: "Historic Bar" },
  { name: "Issei Social Lounge", address: "42 W King St, Lancaster, PA 17603", city: "Lancaster", type: "Asian Lounge" },
  { name: "Tellus Kitchen", address: "22 N Queen St, Lancaster, PA 17603", city: "Lancaster", type: "Kitchen Bar" },
  { name: "Mojo Craft Bar", address: "39 N Queen St, Lancaster, PA 17603", city: "Lancaster", type: "Craft Bar" },
  { name: "The Pressroom Kitchen", address: "30 W King St, Lancaster, PA 17603", city: "Lancaster", type: "Kitchen Bar" },
  { name: "Craft Kitchen Bar", address: "16 W King St, Lancaster, PA 17603", city: "Lancaster", type: "Farm-to-table Bar" },
  { name: "Belvedere Kitchen", address: "31 N Queen St, Lancaster, PA 17603", city: "Lancaster", type: "Historic Kitchen" },
  { name: "Issei Kitchen Lounge", address: "44 W King St, Lancaster, PA 17603", city: "Lancaster", type: "Asian Kitchen" },
  { name: "Tellus Craft", address: "20 N Queen St, Lancaster, PA 17603", city: "Lancaster", type: "Craft Cocktails" },
  { name: "Mojo Social Kitchen", address: "51 N Queen St, Lancaster, PA 17603", city: "Lancaster", type: "Social Kitchen" },
  { name: "The Pressroom Craft", address: "32 W King St, Lancaster, PA 17603", city: "Lancaster", type: "Cocktail Bar" },
];

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
    // De-dup against existing docs by case-insensitive name. Safe to call
    // repeatedly — only NEW venues from the hardcoded list get added.
    const existingSnap = await db.collection('venues').get();
    const existingNames = new Set(
      existingSnap.docs.map(d => (d.data().name || '').toLowerCase().trim())
    );

    let added = 0;
    let skipped = 0;

    for (const venue of venues) {
      const key = venue.name.toLowerCase().trim();
      if (existingNames.has(key)) { skipped++; continue; }

      await db.collection('venues').add({
        name: venue.name,
        address: venue.address,
        city: venue.city,
        type: venue.type,
        status: 'not_contacted',
        contact_email: null,
        contact_name: null,
        contact_phone: null,
        notes: '',
        contacted_at: null,
        responded_at: null,
        booked_at: null,
        event_id: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      existingNames.add(key);
      added++;
    }

    console.log(`🎉 Seeded venues: ${added} added, ${skipped} skipped (duplicates)`);

    return res.status(200).json({
      success: true,
      venues_added: added,
      venues_skipped: skipped,
      message: `${added} new venues seeded; ${skipped} already existed.`,
    });

  } catch (err) {
    console.error('[seed-venues] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
