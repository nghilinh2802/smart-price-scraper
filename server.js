const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const admin = require('firebase-admin');

// Initialize Firebase Admin
let serviceAccount = {};
if (process.env.FIREBASE_PRIVATE_KEY) {
  serviceAccount = {
    type: 'service_account',
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: 'https://oauth2.googleapis.com/token',
    auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
    client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
    universe_domain: 'googleapis.com'
  };
} else {
 // Development - từ file local (đã có trong .gitignore)
  try {
    serviceAccount = require('./firebase-service-account.json');
  } catch (error) {
    console.error('❌ Firebase service account file not found for local development');
    process.exit(1);
  }
}

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// Initialize Express app
const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Import scraper functions
const { performScraping } = require('./src/scraper');

// Existing scrape endpoint (manual scraping)
app.post('/api/scrape', async (req, res) => {
  try {
    console.log('🚀 Manual scrape triggered from Angular UI');
    const results = await performScraping(false); // false = manual
    res.json(results);
  } catch (error) {
    console.error('❌ Manual scrape error:', error);
    res.status(500).json({ error: error.message });
  }
});

// NEW: Schedule management endpoints
app.post('/api/schedule/save', async (req, res) => {
  try {
    const { frequency, startTime } = req.body;
    console.log('📅 Saving schedule config:', { frequency, startTime });
    
    if (!['1h', '6h', '12h', '24h'].includes(frequency)) {
      return res.status(400).json({ error: 'Invalid frequency' });
    }
    if (!/^\d{2}:\d{2}$/.test(startTime)) {
      return res.status(400).json({ error: 'Invalid start time format (HH:mm)' });
    }

    const scheduleConfig = {
      frequency,
      startTime, // Vietnam time
      isActive: true,
      timezone: 'Asia/Ho_Chi_Minh',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastRun: null // Reset when config changes
    };

    await db.collection('scheduleConfig').doc('main').set(scheduleConfig, { merge: true });
    
    console.log('✅ Schedule config saved');
    res.json({
      success: true,
      message: 'Schedule saved! GitHub Actions will pick up changes within 15 minutes.',
      config: scheduleConfig
    });

  } catch (error) {
    console.error('❌ Error saving schedule:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/schedule/toggle', async (req, res) => {
  try {
    const { isActive } = req.body;
    await db.collection('scheduleConfig').doc('main').update({
      isActive,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`📅 Schedule ${isActive ? 'activated' : 'paused'}`);
    res.json({ success: true, isActive });
  } catch (error) {
    console.error('❌ Error toggle schedule:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/schedule/config', async (req, res) => {
  try {
    const doc = await db.collection('scheduleConfig').doc('main').get();
    if (!doc.exists) {
      return res.json({
        frequency: '24h',
        startTime: '09:00',
        isActive: false,
        timezone: 'Asia/Ho_Chi_Minh'
      });
    }
    const config = doc.data();
    res.json({
      ...config,
      lastRun: config.lastRun ? config.lastRun.toDate().toISOString() : null,
      updatedAt: config.updatedAt ? config.updatedAt.toDate().toISOString() : null
    });
  } catch (error) {
    console.error('❌ Error getting schedule config:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Smart Price Scraper API is running!',
    timestamp: new Date().toISOString()
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Smart Price Scraper API running on port ${PORT}`);
  console.log(`📍 Health: http://localhost:${PORT}/api/health`);
  console.log('🔄 Manual scraping: POST /api/scrape');
  console.log('⚙️  Schedule config: POST /api/schedule/save');
});

process.on('SIGINT', () => {
  console.log('🛑 Shutting down gracefully...');
  process.exit(0);
});
