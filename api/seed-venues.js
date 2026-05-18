// api/seed-venues.js
// Adds all 65 venues to Firestore venues collection
// Run once: curl -X POST https://sparkdate.date/api/seed-venues

const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   'sparkdate-philly',
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
    })
  });
}

const db = admin.firestore();

// Your 65 bars
const venues = [
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
];

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  try {
    let added = 0;

    for (const venue of venues) {
      const docRef = await db.collection('venues').add({
        name: venue.name,
        address: venue.address,
        city: venue.city,
        type: venue.type,
        status: 'not_contacted', // not_contacted → contacted → interested → booked → event_created
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
      added++;
    }

    return res.status(200).json({
      success: true,
      venues_added: added,
      message: `${added} venues seeded to Firestore`
    });

  } catch (err) {
    console.error('❌ Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
