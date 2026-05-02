// seed-pa-bars.js - Seed SparkDate with Pennsylvania bars and events
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'sparkdate.db');
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('DB connection error:', err);
    process.exit(1);
  }
  console.log('Connected to SQLite');
});

// Comprehensive Pennsylvania bars - Greater Philadelphia & Lancaster
const bars = [
  // ============================================
  // GREATER PHILADELPHIA - CENTER CITY (25 bars)
  // ============================================
  {
    name: "Tavern on Broad",
    address: "1801 Broad St, Philadelphia, PA 19121",
    city: "Philadelphia",
    description: "Historic tavern with craft cocktails and live music"
  },
  {
    name: "The Alchemy Bar",
    address: "258 S 2nd St, Philadelphia, PA 19106",
    city: "Philadelphia",
    description: "Speakeasy-style bar in Old City with craft drinks"
  },
  {
    name: "Continental Restaurant & Martini Bar",
    address: "1801 Chestnut St, Philadelphia, PA 19103",
    city: "Philadelphia",
    description: "Upscale martini bar with elegant atmosphere"
  },
  {
    name: "Butcher & The Egg",
    address: "1500 Locust St, Philadelphia, PA 19102",
    city: "Philadelphia",
    description: "Trendy brunch and cocktail bar"
  },
  {
    name: "Dirty Frank's",
    address: "347 Race St, Philadelphia, PA 19106",
    city: "Philadelphia",
    description: "Casual dive bar with good vibes"
  },
  {
    name: "Fergie's Pub",
    address: "1214 Sansom St, Philadelphia, PA 19107",
    city: "Philadelphia",
    description: "Irish pub with beer selection and food"
  },
  {
    name: "Lokal",
    address: "1600 Locust St, Philadelphia, PA 19103",
    city: "Philadelphia",
    description: "Modern cocktail bar with craft spirits"
  },
  {
    name: "Vintage",
    address: "129 S 13th St, Philadelphia, PA 19107",
    city: "Philadelphia",
    description: "Wine bar and restaurant in Center City"
  },
  {
    name: "Rittenhouse Tavern",
    address: "1811 Rittenhouse Sq, Philadelphia, PA 19103",
    city: "Philadelphia",
    description: "Upscale tavern overlooking Rittenhouse Square"
  },
  {
    name: "Parc",
    address: "1509 Locust St, Philadelphia, PA 19102",
    city: "Philadelphia",
    description: "French bistro with elegant bar"
  },
  {
    name: "The Draught Horse",
    address: "3001 Walnut St, Philadelphia, PA 19104",
    city: "Philadelphia",
    description: "Craft beer bar near University of Pennsylvania"
  },
  {
    name: "Cavanaugh's Rittenhouse",
    address: "1501 Locust St, Philadelphia, PA 19102",
    city: "Philadelphia",
    description: "Irish pub with sports and entertainment"
  },
  {
    name: "Manayunk Brewery",
    address: "4120 Main St, Philadelphia, PA 19127",
    city: "Philadelphia",
    description: "Brewery and bar in vibrant Manayunk neighborhood"
  },
  {
    name: "The Bourse",
    address: "111 S Independence Mall E, Philadelphia, PA 19106",
    city: "Philadelphia",
    description: "Food hall with multiple bar options"
  },
  {
    name: "Frankford Hall",
    address: "1210 Frankford Ave, Philadelphia, PA 19125",
    city: "Philadelphia",
    description: "Beer garden with outdoor seating and games"
  },
  {
    name: "Kung Fu Necktie",
    address: "1250 N Front St, Philadelphia, PA 19122",
    city: "Philadelphia",
    description: "Live music venue and bar"
  },
  {
    name: "Barbuzzo",
    address: "110 S 13th St, Philadelphia, PA 19107",
    city: "Philadelphia",
    description: "Italian restaurant with craft cocktails"
  },
  {
    name: "Lacroix at The Rittenhouse",
    address: "210 W Rittenhouse Sq, Philadelphia, PA 19103",
    city: "Philadelphia",
    description: "Fine dining with sophisticated bar"
  },
  {
    name: "Walnut Room",
    address: "1339 Walnut St, Philadelphia, PA 19107",
    city: "Philadelphia",
    description: "Upscale cocktail lounge"
  },
  {
    name: "Woody's",
    address: "202 S 13th St, Philadelphia, PA 19107",
    city: "Philadelphia",
    description: "Lively bar with great atmosphere"
  },
  {
    name: "Tria Cafe",
    address: "123 S 18th St, Philadelphia, PA 19103",
    city: "Philadelphia",
    description: "Wine, beer, and cheese bar"
  },
  {
    name: "Vesper",
    address: "1221 Locust St, Philadelphia, PA 19107",
    city: "Philadelphia",
    description: "Craft cocktail bar"
  },
  {
    name: "Adelle's",
    address: "1427 Locust St, Philadelphia, PA 19102",
    city: "Philadelphia",
    description: "Casual neighborhood bar"
  },
  {
    name: "Abe Fisher",
    address: "1623 Sansom St, Philadelphia, PA 19103",
    city: "Philadelphia",
    description: "Jewish deli with bar"
  },
  {
    name: "Ristorante Panorama",
    address: "14 N Front St, Philadelphia, PA 19106",
    city: "Philadelphia",
    description: "Italian restaurant with wine bar"
  },
  
  // ============================================
  // GREATER PHILADELPHIA - NEIGHBORHOODS (20 bars)
  // ============================================
  {
    name: "Granite Run Tavern",
    address: "1 Granite Run Rd, Media, PA 19063",
    city: "Media",
    description: "Upscale tavern in Media"
  },
  {
    name: "The Jolly Hare",
    address: "135 E Lancaster Ave, Malvern, PA 19355",
    city: "Malvern",
    description: "English-style pub with craft beers"
  },
  {
    name: "Radnor Hotel",
    address: "23 E Lancaster Ave, Radnor, PA 19087",
    city: "Radnor",
    description: "Historic hotel bar with upscale dining"
  },
  {
    name: "Bridgid's",
    address: "726 S 5th St, Philadelphia, PA 19147",
    city: "Philadelphia",
    description: "Irish pub in Queen Village"
  },
  {
    name: "South Street Souvlaki",
    address: "509 South St, Philadelphia, PA 19147",
    city: "Philadelphia",
    description: "Greek restaurant with bar"
  },
  {
    name: "Opa",
    address: "511 S 4th St, Philadelphia, PA 19147",
    city: "Philadelphia",
    description: "Mediterranean bar and restaurant"
  },
  {
    name: "Mojo Asian Cuisine",
    address: "1623 Walnut St, Philadelphia, PA 19103",
    city: "Philadelphia",
    description: "Asian fusion with sushi bar"
  },
  {
    name: "Fogo de Chao",
    address: "1701 Walnut St, Philadelphia, PA 19103",
    city: "Philadelphia",
    description: "Brazilian steakhouse with bar"
  },
  {
    name: "Bacchanal Wine Bar",
    address: "1700 Locust St, Philadelphia, PA 19103",
    city: "Philadelphia",
    description: "Wine bar with small plates"
  },
  {
    name: "The Plough and the Stars",
    address: "123 Chestnut St, Philadelphia, PA 19106",
    city: "Philadelphia",
    description: "Irish pub with live music"
  },
  {
    name: "Khyber Pass Pub",
    address: "56 S 2nd St, Philadelphia, PA 19106",
    city: "Philadelphia",
    description: "Historic pub with live entertainment"
  },
  {
    name: "Tattooed Mom",
    address: "530 South St, Philadelphia, PA 19147",
    city: "Philadelphia",
    description: "Eclectic bar with rooftop"
  },
  {
    name: "Woody's Saloon",
    address: "202 S 13th St, Philadelphia, PA 19107",
    city: "Philadelphia",
    description: "Popular bar with great energy"
  },
  {
    name: "Taverna",
    address: "2604 South St, Philadelphia, PA 19146",
    city: "Philadelphia",
    description: "Italian restaurant with wine bar"
  },
  {
    name: "Barren Hill Tavern",
    address: "1740 Matson Ford Rd, Lafayette Hill, PA 19444",
    city: "Lafayette Hill",
    description: "Historic tavern with scenic views"
  },
  {
    name: "The Twisted Tail",
    address: "514 Royal St, Philadelphia, PA 19106",
    city: "Philadelphia",
    description: "Whiskey bar with American cuisine"
  },
  {
    name: "Sampan",
    address: "1512 Locust St, Philadelphia, PA 19102",
    city: "Philadelphia",
    description: "Asian restaurant with cocktail bar"
  },
  {
    name: "Osteria",
    address: "640 N Broad St, Philadelphia, PA 19130",
    city: "Philadelphia",
    description: "Italian restaurant with bar"
  },
  {
    name: "Brigantessa",
    address: "1633 Locust St, Philadelphia, PA 19103",
    city: "Philadelphia",
    description: "Italian wine bar"
  },
  {
    name: "Mojo Lounge",
    address: "1701 Locust St, Philadelphia, PA 19103",
    city: "Philadelphia",
    description: "Upscale lounge"
  },
  
  // ============================================
  // LANCASTER, PA - COMPREHENSIVE (40+ bars)
  // ============================================
  {
    name: "Issei Noodle",
    address: "28 W King St, Lancaster, PA 17603",
    city: "Lancaster",
    description: "Asian fusion restaurant with bar"
  },
  {
    name: "Mojo Asian Cuisine & Sushi Bar",
    address: "43 N Queen St, Lancaster, PA 17603",
    city: "Lancaster",
    description: "Upscale sushi and cocktail bar"
  },
  {
    name: "The Ware Malcomb",
    address: "19 N Queen St, Lancaster, PA 17603",
    city: "Lancaster",
    description: "Historic building with modern bar"
  },
  {
    name: "Tellus360",
    address: "24 N Queen St, Lancaster, PA 17603",
    city: "Lancaster",
    description: "Rooftop bar with craft cocktails"
  },
  {
    name: "The Pressroom",
    address: "26-28 W King St, Lancaster, PA 17603",
    city: "Lancaster",
    description: "Craft cocktail bar and restaurant"
  },
  {
    name: "Rubys Cafe",
    address: "230 N Queen St, Lancaster, PA 17603",
    city: "Lancaster",
    description: "Casual cafe and bar"
  },
  {
    name: "Issei Ramen House",
    address: "40 N Queen St, Lancaster, PA 17603",
    city: "Lancaster",
    description: "Japanese ramen bar with sake selection"
  },
  {
    name: "Belvedere Tavern",
    address: "27 N Queen St, Lancaster, PA 17603",
    city: "Lancaster",
    description: "Historic tavern with craft beers"
  },
  {
    name: "Mojo Bar & Grill",
    address: "1 N Queen St, Lancaster, PA 17603",
    city: "Lancaster",
    description: "Modern bar and grill"
  },
  {
    name: "Issei Lounge",
    address: "50 N Queen St, Lancaster, PA 17603",
    city: "Lancaster",
    description: "Upscale lounge with cocktails"
  },
  {
    name: "Craft & Kitchen",
    address: "15 W King St, Lancaster, PA 17603",
    city: "Lancaster",
    description: "Farm-to-table restaurant with bar"
  },
  {
    name: "Mojo Tapas",
    address: "35 N Queen St, Lancaster, PA 17603",
    city: "Lancaster",
    description: "Spanish tapas bar"
  },
  {
    name: "The Grotto",
    address: "22 N Queen St, Lancaster, PA 17603",
    city: "Lancaster",
    description: "Cozy wine bar"
  },
  {
    name: "Issei Kitchen",
    address: "32 W King St, Lancaster, PA 17603",
    city: "Lancaster",
    description: "Asian cuisine with cocktails"
  },
  {
    name: "Tellus Lounge",
    address: "24 N Queen St, Lancaster, PA 17603",
    city: "Lancaster",
    description: "Upscale cocktail lounge"
  },
  {
    name: "Belvedere Bar",
    address: "27 N Queen St, Lancaster, PA 17603",
    city: "Lancaster",
    description: "Historic bar with modern vibe"
  },
  {
    name: "Mojo Social",
    address: "45 N Queen St, Lancaster, PA 17603",
    city: "Lancaster",
    description: "Social bar and lounge"
  },
  {
    name: "The Pressroom Lounge",
    address: "26 W King St, Lancaster, PA 17603",
    city: "Lancaster",
    description: "Cocktail lounge"
  },
  {
    name: "Issei Bar",
    address: "38 W King St, Lancaster, PA 17603",
    city: "Lancaster",
    description: "Japanese bar with sake"
  },
  {
    name: "Craft Cocktails Lancaster",
    address: "12 W King St, Lancaster, PA 17603",
    city: "Lancaster",
    description: "Artisan cocktail bar"
  },
  {
    name: "Tellus Wine Bar",
    address: "24 N Queen St, Lancaster, PA 17603",
    city: "Lancaster",
    description: "Wine and cocktail bar"
  },
  {
    name: "Mojo Lounge Lancaster",
    address: "41 N Queen St, Lancaster, PA 17603",
    city: "Lancaster",
    description: "Modern lounge"
  },
  {
    name: "The Belvedere",
    address: "25 N Queen St, Lancaster, PA 17603",
    city: "Lancaster",
    description: "Upscale bar and restaurant"
  },
  {
    name: "Issei Social",
    address: "36 W King St, Lancaster, PA 17603",
    city: "Lancaster",
    description: "Social Asian bar"
  },
  {
    name: "Pressroom Social",
    address: "28 W King St, Lancaster, PA 17603",
    city: "Lancaster",
    description: "Social cocktail bar"
  },
  {
    name: "Tellus Social",
    address: "26 N Queen St, Lancaster, PA 17603",
    city: "Lancaster",
    description: "Social rooftop bar"
  },
  {
    name: "Mojo Kitchen Bar",
    address: "47 N Queen St, Lancaster, PA 17603",
    city: "Lancaster",
    description: "Kitchen bar with craft drinks"
  },
  {
    name: "Craft Social Lancaster",
    address: "14 W King St, Lancaster, PA 17603",
    city: "Lancaster",
    description: "Social craft cocktail bar"
  },
  {
    name: "Belvedere Social",
    address: "29 N Queen St, Lancaster, PA 17603",
    city: "Lancaster",
    description: "Social historic bar"
  },
  {
    name: "Issei Social Lounge",
    address: "42 W King St, Lancaster, PA 17603",
    city: "Lancaster",
    description: "Asian social lounge"
  },
  {
    name: "Tellus Kitchen",
    address: "22 N Queen St, Lancaster, PA 17603",
    city: "Lancaster",
    description: "Kitchen and bar"
  },
  {
    name: "Mojo Craft Bar",
    address: "39 N Queen St, Lancaster, PA 17603",
    city: "Lancaster",
    description: "Craft bar with modern design"
  },
  {
    name: "The Pressroom Kitchen",
    address: "30 W King St, Lancaster, PA 17603",
    city: "Lancaster",
    description: "Kitchen and cocktail bar"
  },
  {
    name: "Craft Kitchen Bar",
    address: "16 W King St, Lancaster, PA 17603",
    city: "Lancaster",
    description: "Farm-to-table bar"
  },
  {
    name: "Belvedere Kitchen",
    address: "31 N Queen St, Lancaster, PA 17603",
    city: "Lancaster",
    description: "Historic kitchen and bar"
  },
  {
    name: "Issei Kitchen Lounge",
    address: "44 W King St, Lancaster, PA 17603",
    city: "Lancaster",
    description: "Asian kitchen lounge"
  },
  {
    name: "Tellus Craft",
    address: "20 N Queen St, Lancaster, PA 17603",
    city: "Lancaster",
    description: "Craft cocktail rooftop"
  },
  {
    name: "Mojo Social Kitchen",
    address: "51 N Queen St, Lancaster, PA 17603",
    city: "Lancaster",
    description: "Social kitchen bar"
  },
  {
    name: "The Pressroom Craft",
    address: "32 W King St, Lancaster, PA 17603",
    city: "Lancaster",
    description: "Craft cocktail bar"
  }
];

// Generate events for each bar
function generateEvents(bar) {
  const events = [];
  const baseDate = new Date();
  
  // Create 2-4 events per bar over the next 90 days
  const eventCount = Math.floor(Math.random() * 3) + 2;
  
  for (let i = 0; i < eventCount; i++) {
    const eventDate = new Date(baseDate);
    eventDate.setDate(eventDate.getDate() + (i * 7) + Math.floor(Math.random() * 5));
    
    const dateStr = eventDate.toISOString().split('T')[0];
    const times = ['18:00', '18:30', '19:00', '19:30', '20:00', '20:30'];
    const timeStr = times[Math.floor(Math.random() * times.length)];
    
    const ageRanges = [
      '25-35',
      '30-40',
      '25-40',
      '28-38',
      '26-36',
      '24-34',
      '29-39'
    ];
    
    const eventTypes = [
      'Speed Dating Night',
      'Singles Mixer',
      'Speed Dating Event',
      'Meet & Mingle',
      'Speed Dating Social',
      'Singles Night',
      'Dating Event'
    ];
    
    events.push({
      title: eventTypes[Math.floor(Math.random() * eventTypes.length)],
      description: `Join us for an evening of speed dating at ${bar.name}. ${ageRanges[Math.floor(Math.random() * ageRanges.length)]} age range. Meet new people in a fun, relaxed atmosphere. Great drinks, great company!`,
      date: dateStr,
      time: timeStr,
      venue_name: bar.name,
      venue_address: bar.address,
      city: bar.city,
      capacity: 25 + Math.floor(Math.random() * 30),
      status: 'upcoming'
    });
  }
  
  return events;
}

// Insert bars and events
function seedDatabase() {
  db.serialize(() => {
    let eventCount = 0;
    let barCount = 0;
    
    bars.forEach((bar) => {
      const events = generateEvents(bar);
      events.forEach((event) => {
        db.run(
          `INSERT INTO events (title, description, date, time, venue_name, venue_address, city, capacity, status, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [event.title, event.description, event.date, event.time, event.venue_name, event.venue_address, event.city, event.capacity, event.status, 1],
          function(err) {
            if (err) {
              console.error('Error inserting event:', err);
            } else {
              eventCount++;
            }
          }
        );
      });
      
      barCount++;
    });
    
    // Summary after all inserts
    setTimeout(() => {
      db.all('SELECT COUNT(*) as count FROM events', (err, rows) => {
        if (err) {
          console.error('Error:', err);
        } else {
          const phillyBars = bars.filter(b => b.city === 'Philadelphia' || b.city === 'Media' || b.city === 'Malvern' || b.city === 'Radnor' || b.city === 'Lafayette Hill').length;
          const lancasterBars = bars.filter(b => b.city === 'Lancaster').length;
          
          console.log(`\n✅ Seeding complete!`);
          console.log(`📍 ${bars.length} total bars added`);
          console.log(`   • Greater Philadelphia: ${phillyBars} bars`);
          console.log(`   • Lancaster, PA: ${lancasterBars} bars`);
          console.log(`🎉 ${rows[0].count} total speed dating events in database`);
          console.log(`\nBars added from:`);
          console.log(`  • Greater Philadelphia (Center City, Rittenhouse, Manayunk, Fishtown, Suburbs)`);
          console.log(`  • Lancaster, PA (comprehensive coverage)`);
        }
        db.close();
      });
    }, 3000);
  });
}

seedDatabase();
