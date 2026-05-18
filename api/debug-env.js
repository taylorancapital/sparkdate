// api/debug-env.js
// Temporary debug endpoint — shows which env vars are accessible
// DELETE THIS AFTER DEBUGGING

module.exports = async function handler(req, res) {
  return res.status(200).json({
    // We never return the actual values — just whether they exist
    has_RESEND_API_KEY:        !!process.env.RESEND_API_KEY,
    RESEND_API_KEY_length:     process.env.RESEND_API_KEY?.length || 0,
    RESEND_API_KEY_prefix:     process.env.RESEND_API_KEY?.substring(0, 3) || 'MISSING',
    
    has_FIREBASE_API_KEY:      !!process.env.FIREBASE_API_KEY,
    has_FIREBASE_CLIENT_EMAIL: !!process.env.FIREBASE_CLIENT_EMAIL,
    has_FIREBASE_PRIVATE_KEY:  !!process.env.FIREBASE_PRIVATE_KEY,
    FIREBASE_PRIVATE_KEY_length: process.env.FIREBASE_PRIVATE_KEY?.length || 0,
    
    has_CRON_SECRET:           !!process.env.CRON_SECRET,
    
    // List all env var NAMES (not values) that start with relevant prefixes
    all_relevant_env_names: Object.keys(process.env).filter(k => 
      k.startsWith('RESEND') || 
      k.startsWith('FIREBASE') || 
      k.startsWith('CRON') ||
      k.startsWith('STRIPE')
    ),
    
    node_version: process.version,
    vercel_env:   process.env.VERCEL_ENV || 'unknown',
    timestamp:    new Date().toISOString()
  });
};
