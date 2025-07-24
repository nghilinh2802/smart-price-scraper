#!/usr/bin/env node

const admin = require('firebase-admin');
const { performScraping, getScrapingDataFromFirestore, saveToFirestore } = require('./scraper');
const { initializeFirebase } = require('./firebase-config');  // FIXED: Import the missing module

// Initialize Firebase with error handling
let db;
try {
  console.log('🔥 Initializing Firebase...');
  db = initializeFirebase();
  console.log('✅ Firebase connection established!');
} catch (error) {
  console.error('❌ Failed to initialize Firebase:', error.message);
  process.exit(1);  // Exit if Firebase fails
}

// Timezone offset for Vietnam (UTC+7)
const VN_TIMEZONE_OFFSET = 7 * 60; // minutes

// Convert Vietnam time to UTC
function vnTimeToUTC(vnHour, vnMinute) {
  const utcHour = (vnHour - 7 + 24) % 24;
  return { hour: utcHour, minute: vnMinute };
}

// Convert UTC to Vietnam time for logging
function utcToVNTime(utcDate) {
  const vnDate = new Date(utcDate.getTime() + VN_TIMEZONE_OFFSET * 60 * 1000);
  return vnDate;
}

async function shouldRun() {
  try {
    console.log('🔍 Checking schedule configuration...');
    
    const doc = await db.collection('scheduleConfig').doc('main').get();
    if (!doc.exists) {
      console.log('❌ No schedule config found in Firestore');
      return false;
    }
    
    const config = doc.data();
    console.log(`📋 Config: ${JSON.stringify(config, null, 2)}`);
    
    if (!config.isActive) {
      console.log('⏸️ Schedule is paused');
      return false;
    }
    
    const { frequency, startTime, lastRun } = config;
    if (!frequency || !startTime) {
      console.log('❌ Invalid schedule configuration');
      return false;
    }
    
    const now = new Date();
    console.log(`🕐 Current UTC time: ${now.toISOString()}`);
    console.log(`🇻🇳 Current VN time: ${utcToVNTime(now).toLocaleString('vi-VN')}`);
    
    // Parse Vietnam start time
    const [vnHour, vnMinute] = startTime.split(':').map(Number);
    const { hour: utcHour, minute: utcMinute } = vnTimeToUTC(vnHour, vnMinute);
    
    console.log(`⏰ Target VN time: ${vnHour}:${vnMinute.toString().padStart(2, '0')}`);
    console.log(`⏰ Target UTC time: ${utcHour}:${utcMinute.toString().padStart(2, '0')}`);
    
    // Calculate frequency in milliseconds
    const freqMs = {
        '1h': 60 * 60 * 1000,
        '6h': 6 * 60 * 60 * 1000,
        '12h': 12 * 60 * 60 * 1000,
        '24h': 24 * 60 * 60 * 1000
    }[frequency];
    
    if (!freqMs) {
        console.log('❌ Invalid frequency:', frequency);
        return false;
    }
    
    console.log(`📅 Frequency: ${frequency} (${freqMs / 1000 / 60} minutes)`);
    
    // Calculate next run time in UTC
    let nextRunUTC = new Date(now);
    nextRunUTC.setUTCHours(utcHour, utcMinute, 0, 0);
    
    // If we've passed today's scheduled time, move to next cycle
    while (nextRunUTC <= now) {
        nextRunUTC = new Date(nextRunUTC.getTime() + freqMs);
    }
    
    console.log(`⏭️ Next scheduled run UTC: ${nextRunUTC.toISOString()}`);
    console.log(`⏭️ Next scheduled run VN: ${utcToVNTime(nextRunUTC).toLocaleString('vi-VN')}`);
    
    // Check if we're within the 15-minute window before the scheduled time
    const timeUntilNext = nextRunUTC.getTime() - now.getTime();
    const windowMs = 16 * 60 * 1000; // 16 minutes window
    
    console.log(`⏱️ Time until next run: ${Math.round(timeUntilNext / 1000 / 60)} minutes`);
    
    if (timeUntilNext > windowMs) {
        console.log(`⏭️ Too early - need to wait ${Math.round(timeUntilNext / 1000 / 60)} more minutes`);
        return false;
    }
    
    // Check if we already ran this cycle
    if (lastRun) {
        const lastRunTime = lastRun.toDate();
        const timeSinceLastRun = now.getTime() - lastRunTime.getTime();
        const halfCycle = freqMs / 2;
        
        console.log(`📈 Last run: ${lastRunTime.toISOString()}`);
        console.log(`📈 Time since last run: ${Math.round(timeSinceLastRun / 1000 / 60)} minutes`);
        console.log(`📈 Half cycle: ${Math.round(halfCycle / 1000 / 60)} minutes`);
        
        if (timeSinceLastRun < halfCycle) {
            console.log('✋ Already ran this cycle - skipping');
            return false;
        }
    }
    
    console.log('✅ Should run - all conditions met!');
    return true;
    
  } catch (error) {
    console.error('❌ Error checking schedule:', error);
    return false;
  }
}

async function updateLastRun() {
  try {
    await db.collection('scheduleConfig').doc('main').update({
      lastRun: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log('✅ Updated lastRun timestamp');
  } catch (error) {
    console.error('❌ Error updating lastRun:', error);
  }
}

async function main() {
  try {
    console.log('🚀 Smart Price Scraper CLI Starting...');
    console.log(`📍 Arguments: ${process.argv.join(' ')}`);
    console.log(`🌍 Environment: ${process.env.GITHUB_ACTIONS ? 'GitHub Actions' : 'Local'}`);
    
    const isDecideMode = process.argv.includes('--decide');
    const isManual = process.argv.includes('--manual');
    const isTest = process.argv.includes('--test');
    const forceRun = process.env.FORCE_SCRAPE === 'true';
    
    if (isTest) {
      console.log('🧪 Test mode - checking Firebase connection...');
      try {
        const testDoc = await db.collection('scheduleConfig').doc('main').get();
        console.log(`✅ Firebase connected successfully! Config exists: ${testDoc.exists}`);
        
        const productsSnapshot = await db.collection('products').limit(1).get();
        console.log(`✅ Products collection accessible! Has data: ${!productsSnapshot.empty}`);
        
        process.exit(0);
      } catch (testError) {
        console.error('❌ Firebase test failed:', testError.message);
        process.exit(1);
      }
    }
    
    let shouldExecute = false;
    let runType = 'unknown';
    
    if (forceRun || isManual) {
      shouldExecute = true;
      runType = forceRun ? 'forced' : 'manual';
      console.log(`🚨 ${runType.toUpperCase()} execution triggered`);
    } else if (isDecideMode) {
      shouldExecute = await shouldRun();
      runType = 'scheduled';
      console.log(`🤖 DECISION: ${shouldExecute ? 'EXECUTE' : 'SKIP'}`);
    } else {
      shouldExecute = true;
      runType = 'default';
      console.log('🔄 Default execution mode');
    }
    
    if (!shouldExecute) {
      console.log('⏭️ Skipping execution - conditions not met');
      process.exit(0);
    }
    
    // Create session ID
    const sessionId = `session_${Date.now()}_${runType}`;
    console.log(`🔍 Session ID: ${sessionId}`);
    
    // Execute scraping
    console.log('🏃‍♂️ Starting scraping process...');
    const startTime = new Date();
    
    const results = await performScraping(runType === 'scheduled');
    
    const endTime = new Date();
    const duration = endTime - startTime;
    
    // Save to Firestore
    await saveToFirestore(db, sessionId, results);
    
    // Update lastRun for scheduled runs
    if (runType === 'scheduled') {
        await updateLastRun();
    }
    
    // Final summary
    console.log('\n🎯 EXECUTION COMPLETED SUCCESSFULLY!');
    console.log(`⏱️  Duration: ${Math.round(duration / 1000)} seconds`);
    console.log(`📊 Results: ${results.filter(r => r.status === 'Còn hàng').length}/${results.length} successful`);
    console.log(`🔗 Session: ${sessionId}`);
    console.log(`💾 Data saved to Firestore collections: scrapeSessions, priceData`);
    
  } catch (error) {
    console.error('❌ Critical error in main:', error);
    process.exit(1);
  }
}

// Execute main function
main().catch(error => {
  console.error('💥 Unhandled error:', error);
  process.exit(1);
});
