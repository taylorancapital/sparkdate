// create-dummy-accounts.js - Generate test accounts for participants, bartenders, and admins
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'sparkdate.db');
const db = new sqlite3.Database(DB_PATH);

const dummyAccounts = {
  participants: [
    {
      email: 'alice@test.com',
      password: 'password123',
      name: 'Alice Johnson',
      gender: 'F',
      seeking: 'M',
      age: 27,
      city: 'Philadelphia',
      bio: 'Adventure seeker 🌍 Love hiking & craft cocktails'
    },
    {
      email: 'bob@test.com',
      password: 'password123',
      name: 'Bob Mitchell',
      gender: 'M',
      seeking: 'F',
      age: 29,
      city: 'Philadelphia',
      bio: 'Tech entrepreneur 💻 Foodie & travel enthusiast'
    },
    {
      email: 'sarah@test.com',
      password: 'password123',
      name: 'Sarah Davis',
      gender: 'F',
      seeking: 'M',
      age: 26,
      city: 'Philadelphia',
      bio: 'Artist 🎨 Coffee addict, always up for spontaneous adventures'
    },
    {
      email: 'mike@test.com',
      password: 'password123',
      name: 'Mike Chen',
      gender: 'M',
      seeking: 'F',
      age: 31,
      city: 'Philadelphia',
      bio: 'Fitness enthusiast ⚡ Love live music & good wine'
    },
    {
      email: 'emma@test.com',
      password: 'password123',
      name: 'Emma Wilson',
      gender: 'F',
      seeking: 'M',
      age: 25,
      city: 'Philadelphia',
      bio: 'Yoga instructor 🧘‍♀️ Passionate about sustainability'
    },
    {
      email: 'james@test.com',
      password: 'password123',
      name: 'James Rodriguez',
      gender: 'M',
      seeking: 'F',
      age: 28,
      city: 'Philadelphia',
      bio: 'Marketing strategist 📊 Podcast junkie & weekend cook'
    }
  ],
  bartenders: [
    {
      email: 'bartender1@test.com',
      password: 'password123',
      name: 'Joe Santos',
      role: 'bartender'
    },
    {
      email: 'bartender2@test.com',
      password: 'password123',
      name: 'Maria Garcia',
      role: 'bartender'
    },
    {
      email: 'bartender3@test.com',
      password: 'password123',
      name: 'Chris Thompson',
      role: 'bartender'
    }
  ],
  admins: [
    {
      email: 'admin@test.com',
      password: 'admin123',
      name: 'Admin User',
      role: 'admin'
    }
  ]
};

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function createAccount(email, password, name, role, additionalFields = {}) {
  return new Promise((resolve, reject) => {
    const hashedPassword = hashPassword(password);
    const query = `
      INSERT INTO users (email, password, name, role, gender, seeking, age, city, bio, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `;

    const values = [
      email,
      hashedPassword,
      name,
      role || 'participant',
      additionalFields.gender || null,
      additionalFields.seeking || null,
      additionalFields.age || null,
      additionalFields.city || null,
      additionalFields.bio || null
    ];

    db.run(query, values, function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          console.log(`⚠️  Account already exists: ${email}`);
        } else {
          console.error(`❌ Error creating account for ${email}:`, err.message);
        }
      } else {
        console.log(`✅ Created account: ${email} (${role || 'participant'}) - Password: ${password}`);
      }
      resolve();
    });
  });
}

async function createAllAccounts() {
  console.log('\n🚀 Creating Dummy Test Accounts for SparkDate...\n');

  // Participants
  console.log('👥 Creating PARTICIPANT accounts:');
  for (const account of dummyAccounts.participants) {
    await createAccount(
      account.email,
      account.password,
      account.name,
      'participant',
      {
        gender: account.gender,
        seeking: account.seeking,
        age: account.age,
        city: account.city,
        bio: account.bio
      }
    );
  }

  // Bartenders
  console.log('\n🍹 Creating BARTENDER accounts:');
  for (const account of dummyAccounts.bartenders) {
    await createAccount(account.email, account.password, account.name, 'bartender');
  }

  // Admins
  console.log('\n👨‍💼 Creating ADMIN accounts:');
  for (const account of dummyAccounts.admins) {
    await createAccount(account.email, account.password, account.name, 'admin');
  }

  console.log('\n' + '='.repeat(60));
  console.log('✨ All dummy accounts created successfully!');
  console.log('='.repeat(60) + '\n');

  console.log('📋 TEST ACCOUNT CREDENTIALS:\n');

  console.log('👥 PARTICIPANT ACCOUNTS:');
  dummyAccounts.participants.forEach(acc => {
    console.log(`   Email: ${acc.email} | Password: ${acc.password}`);
  });

  console.log('\n🍹 BARTENDER ACCOUNTS:');
  dummyAccounts.bartenders.forEach(acc => {
    console.log(`   Email: ${acc.email} | Password: ${acc.password}`);
  });

  console.log('\n👨‍💼 ADMIN ACCOUNT:');
  dummyAccounts.admins.forEach(acc => {
    console.log(`   Email: ${acc.email} | Password: ${acc.password}`);
  });

  console.log('\n' + '='.repeat(60));
  console.log('🌐 Access the app at:');
  console.log('   Participants: http://localhost:3001/participant-landing.html');
  console.log('   Bartenders:   http://localhost:3001/bartender-landing.html');
  console.log('   Admin:        http://localhost:3001/admin-landing.html');
  console.log('='.repeat(60) + '\n');

  db.close();
}

// Run
createAllAccounts().catch(err => {
  console.error('Fatal error:', err);
  db.close();
  process.exit(1);
});
