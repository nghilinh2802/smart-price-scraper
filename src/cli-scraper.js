// #!/usr/bin/env node

// const { initializeFirebase } = require('./firebase-config');
// const { performScraping } = require('./scraper');

// // Initialize Firebase
// let db;

// // Timezone offset for Vietnam (UTC+7)
// const VN_TIMEZONE_OFFSET = 7 * 60; // minutes

// // Convert Vietnam time to UTC
// function vnTimeToUTC(vnHour, vnMinute) {
//     const utcHour = (vnHour - 7 + 24) % 24;
//     return { hour: utcHour, minute: vnMinute };
// }

// // Convert UTC to Vietnam time for logging
// function utcToVNTime(utcDate) {
//     const vnDate = new Date(utcDate.getTime() + VN_TIMEZONE_OFFSET * 60 * 1000);
//     return vnDate;
// }

// async function shouldRun() {
//     try {
//         console.log('🔍 Checking schedule configuration...');
        
//         const doc = await db.collection('scheduleConfig').doc('main').get();
//         if (!doc.exists) {
//             console.log('❌ No schedule config found in Firestore');
//             return false;
//         }
        
//         const config = doc.data();
//         console.log(`📋 Config: ${JSON.stringify(config, null, 2)}`);
        
//         if (!config.isActive) {
//             console.log('⏸️ Schedule is paused');
//             return false;
//         }
        
//         const { frequency, startTime, lastRun } = config;
//         if (!frequency || !startTime) {
//             console.log('❌ Invalid schedule configuration');
//             return false;
//         }
        
//         const now = new Date();
//         console.log(`🕐 Current UTC time: ${now.toISOString()}`);
//         console.log(`🇻🇳 Current VN time: ${utcToVNTime(now).toLocaleString('vi-VN')}`);
        
//         // Parse Vietnam start time
//         const [vnHour, vnMinute] = startTime.split(':').map(Number);
//         const { hour: utcHour, minute: utcMinute } = vnTimeToUTC(vnHour, vnMinute);
        
//         console.log(`⏰ Target VN time: ${vnHour}:${vnMinute.toString().padStart(2, '0')}`);
//         console.log(`⏰ Target UTC time: ${utcHour}:${utcMinute.toString().padStart(2, '0')}`);
        
//         // Calculate frequency in milliseconds
//         const freqMs = {
//             '1h': 60 * 60 * 1000,      // 1 hour
//             '6h': 6 * 60 * 60 * 1000,  // 6 hours
//             '12h': 12 * 60 * 60 * 1000, // 12 hours
//             '24h': 24 * 60 * 60 * 1000  // 24 hours
//         }[frequency];
        
//         if (!freqMs) {
//             console.log('❌ Invalid frequency:', frequency);
//             return false;
//         }
        
//         console.log(`📅 Frequency: ${frequency} (${freqMs / 1000 / 60} minutes)`);
        
//         // Calculate next run time in UTC
//         let nextRunUTC = new Date(now);
//         nextRunUTC.setUTCHours(utcHour, utcMinute, 0, 0);
        
//         // If we've passed today's scheduled time, move to next cycle
//         while (nextRunUTC <= now) {
//             nextRunUTC = new Date(nextRunUTC.getTime() + freqMs);
//         }
        
//         console.log(`⏭️ Next scheduled run UTC: ${nextRunUTC.toISOString()}`);
//         console.log(`⏭️ Next scheduled run VN: ${utcToVNTime(nextRunUTC).toLocaleString('vi-VN')}`);
        
//         // Check if we're within the 15-minute window before the scheduled time
//         const timeUntilNext = nextRunUTC.getTime() - now.getTime();
//         const windowMs = 16 * 60 * 1000; // 16 minutes window (slightly larger than 15-min cron)
        
//         console.log(`⏱️ Time until next run: ${Math.round(timeUntilNext / 1000 / 60)} minutes`);
        
//         if (timeUntilNext > windowMs) {
//             console.log(`⏭️ Too early - need to wait ${Math.round(timeUntilNext / 1000 / 60)} more minutes`);
//             return false;
//         }
        
//         // Check if we already ran this cycle
//         if (lastRun) {
//             const lastRunTime = lastRun.toDate();
//             const timeSinceLastRun = now.getTime() - lastRunTime.getTime();
//             const halfCycle = freqMs / 2;
            
//             console.log(`📈 Last run: ${lastRunTime.toISOString()}`);
//             console.log(`📈 Time since last run: ${Math.round(timeSinceLastRun / 1000 / 60)} minutes`);
//             console.log(`📈 Half cycle: ${Math.round(halfCycle / 1000 / 60)} minutes`);
            
//             if (timeSinceLastRun < halfCycle) {
//                 console.log('✋ Already ran this cycle - skipping');
//                 return false;
//             }
//         }
        
//         console.log('✅ Should run - all conditions met!');
//         return true;
        
//     } catch (error) {
//         console.error('❌ Error checking schedule:', error);
//         return false;
//     }
// }

// async function updateLastRun() {
//     try {
//         const admin = require('firebase-admin');
//         await db.collection('scheduleConfig').doc('main').update({
//             lastRun: admin.firestore.FieldValue.serverTimestamp(),
//             updatedAt: admin.firestore.FieldValue.serverTimestamp()
//         });
//         console.log('✅ Updated lastRun timestamp');
//     } catch (error) {
//         console.error('❌ Error updating lastRun:', error);
//     }
// }

// async function main() {
//     try {
//         console.log('🚀 Smart Price Scraper CLI Starting...');
//         console.log(`📍 Arguments: ${process.argv.join(' ')}`);
//         console.log(`🌍 Environment: ${process.env.GITHUB_ACTIONS ? 'GitHub Actions' : 'Local'}`);
        
//         // Initialize Firebase first
//         console.log('🔥 Initializing Firebase...');
//         db = initializeFirebase();
//         console.log('✅ Firebase connection established!');
        
//         const isDecideMode = process.argv.includes('--decide');
//         const isManual = process.argv.includes('--manual');
//         const isTest = process.argv.includes('--test');
//         const forceRun = process.env.FORCE_SCRAPE === 'true';
        
//         if (isTest) {
//             console.log('🧪 Test mode - checking Firebase connection...');
//             try {
//                 const testDoc = await db.collection('scheduleConfig').doc('main').get();
//                 console.log(`✅ Firebase connected successfully! Config exists: ${testDoc.exists}`);
                
//                 // Test products collection
//                 const productsSnapshot = await db.collection('products').limit(1).get();
//                 console.log(`✅ Products collection accessible! Has data: ${!productsSnapshot.empty}`);
                
//                 return;
//             } catch (testError) {
//                 console.error('❌ Firebase test failed:', testError.message);
//                 process.exit(1);
//             }
//         }
        
//         let shouldExecute = false;
//         let runType = 'unknown';
        
//         if (forceRun || isManual) {
//             shouldExecute = true;
//             runType = forceRun ? 'forced' : 'manual';
//             console.log(`🚨 ${runType.toUpperCase()} execution triggered`);
//         } else if (isDecideMode) {
//             shouldExecute = await shouldRun();
//             runType = 'scheduled';
//             console.log(`🤖 DECISION: ${shouldExecute ? 'EXECUTE' : 'SKIP'}`);
//         } else {
//             shouldExecute = true;
//             runType = 'default';
//             console.log('🔄 Default execution mode');
//         }
        
//         if (!shouldExecute) {
//             console.log('⏭️ Skipping execution - conditions not met');
//             return;
//         }
        
//         // Create session ID
//         const sessionId = `session_${Date.now()}_${runType}`;
//         console.log(`🔍 Session ID: ${sessionId}`);
        
//         // Execute scraping
//         console.log('🏃‍♂️ Starting scraping process...');
//         const startTime = new Date();
        
//         const results = await performScraping(runType === 'scheduled');
        
//         const endTime = new Date();
//         const duration = endTime - startTime;
        
//         // Save session to Firestore
//         const admin = require('firebase-admin');
//         const sessionData = {
//             id: sessionId,
//             start_time: admin.firestore.Timestamp.fromDate(startTime),
//             end_time: admin.firestore.Timestamp.fromDate(endTime),
//             duration_ms: duration,
//             run_type: runType,
//             total_results: results.length,
//             success_count: results.filter(r => r.status === 'found_with_price').length,
//             total_products: Math.ceil(results.length / 3), // 3 websites per product
//             total_suppliers: 3,
//             is_scheduled: runType === 'scheduled',
//             status: 'completed',
//             created_at: admin.firestore.FieldValue.serverTimestamp()
//         };
        
//         console.log('💾 Saving session to Firestore...');
//         await db.collection('scrapeSessions').doc(sessionId).set(sessionData);
//         console.log(`✅ Session saved: ${sessionId}`);
        
//         // Save price data if any
//         if (results.length > 0) {
//             console.log('💾 Saving price data to Firestore...');
//             const batch = db.batch();
//             results.forEach((result, index) => {
//                 const docRef = db.collection('priceData').doc(`${sessionId}_${index}`);
//                 batch.set(docRef, {
//                     ...result,
//                     sessionId: sessionId,
//                     created_at: admin.firestore.FieldValue.serverTimestamp()
//                 });
//             });
            
//             await batch.commit();
//             console.log(`✅ Saved ${results.length} price records to Firestore`);
//         }
        
//         // Update lastRun for scheduled runs
//         if (runType === 'scheduled') {
//             await updateLastRun();
//         }
        
//         // Final summary
//         console.log('\n🎯 EXECUTION COMPLETED SUCCESSFULLY!');
//         console.log(`⏱️  Duration: ${Math.round(duration / 1000)} seconds`);
//         console.log(`📊 Results: ${sessionData.success_count}/${sessionData.total_results} successful`);
//         console.log(`🔗 Session: ${sessionId}`);
//         console.log(`💾 Data saved to Firestore collections: scrapeSessions, priceData`);
        
//     } catch (error) {
//         console.error('❌ Critical error in main:', error);
//         console.error('📋 Error details:', {
//             message: error.message,
//             stack: error.stack?.substring(0, 500),
//             environment: process.env.GITHUB_ACTIONS ? 'GitHub Actions' : 'Local',
//             timestamp: new Date().toISOString()
//         });
//         process.exit(1);
//     }
// }

// // Execute main function
// main().catch(error => {
//     console.error('💥 Unhandled error:', error);
//     process.exit(1);
// });
#!/usr/bin/env node

const admin = require('firebase-admin');
const { performScraping, getScrapingDataFromFirestore, saveToFirestore } = require('./scraper');

// Initialize Firebase (giữ nguyên config từ code cũ)
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
  serviceAccount = require('./firebase-config.json');
}

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

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
    
    // Initialize Firebase
    console.log('🔥 Initializing Firebase...');
    const db = initializeFirebase();
    console.log('✅ Firebase connection established!');
    
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
    
    // Save to Firestore - Giữ giống code cũ
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

