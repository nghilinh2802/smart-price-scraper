const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const admin = require('firebase-admin');
const cron = require('node-cron');
const { performScraping, saveToFirestore } = require('./scraper');  // Import from scraper.js

// Initialize Firebase (giữ nguyên)
let serviceAccount = {};
// (Giữ config từ query của bạn)
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 3000;

// Schedule management - Giữ và fix
let scheduleConfig = { enabled: false, frequency: '24h', startTime: '09:00' };

// Cron to check and run scraping
cron.schedule('* * * * *', async () => {
  if (scheduleConfig.enabled) {
    const now = new Date();
    const [h, m] = scheduleConfig.startTime.split(':');
    if (now.getHours() === parseInt(h) && now.getMinutes() === parseInt(m)) {
      console.log('🔄 Auto schedule triggered!');
      await performScraping(true);  // Run with isScheduled = true
    }
  }
}, { timezone: 'Asia/Ho_Chi_Minh' });

// Endpoints - Giữ, thêm call performScraping
app.post('/api/scrape', async (req, res) => {
  try {
    const results = await performScraping(false);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// (Giữ các endpoint khác như /health, /schedule/save, etc.)

app.listen(PORT, () => console.log(`Server running on ${PORT}`));
