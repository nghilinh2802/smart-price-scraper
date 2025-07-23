#!/usr/bin/env node

const { initializeFirebase } = require('./firebase-config');
const { performScraping } = require('./scraper');

// Initialize Firebase
const db = initializeFirebase();

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
            console.log('❌ No schedule config found');
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
            '1h': 60 * 60 * 1000,      // 1 hour
            '6h': 6 * 60 * 60 * 1000,  // 6 hours
            '12h': 12 * 60 * 60 * 1000, // 12 hours
            '24h': 24 * 60 * 60 * 1000  // 24 hours
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
        const windowMs = 16 * 60 * 1000; // 16 minutes window (slightly larger than 15-min cron)
        
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
            lastRun: new Date(),
            updatedAt: new Date()
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
        
        const isDecideMode = process.argv.includes('--decide');
        const isManual = process.argv.includes('--manual');
        const isTest = process.argv.includes('--test');
        const forceRun = process.env.FORCE_SCRAPE === 'true';
        
        if (isTest) {
            console.log('🧪 Test mode - checking Firebase connection...');
            const testDoc = await db.collection('scheduleConfig').doc('main').get();
            console.log(`✅ Firebase connected. Config exists: ${testDoc.exists}`);
            return;
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
            return;
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
        
        // Save session to Firestore
        const sessionData = {
            id: sessionId,
            start_time: startTime,
            end_time: endTime,
            duration_ms: duration,
            run_type: runType,
            total_results: results.length,
            success_count: results.filter(r => r.status === 'found_with_price').length,
            is_scheduled: runType === 'scheduled',
            status: 'completed',
            created_at: new Date()
        };
        
        await db.collection('scrapeSessions').doc(sessionId).set(sessionData);
        console.log(`💾 Session saved: ${sessionId}`);
        
        // Save price data
        if (results.length > 0) {
            const batch = db.batch();
            results.forEach((result, index) => {
                const docRef = db.collection('priceData').doc(`${sessionId}_${index}`);
                batch.set(docRef, {
                    ...result,
                    sessionId: sessionId,
                    created_at: new Date()
                });
            });
            
            await batch.commit();
            console.log(`💾 Saved ${results.length} price records`);
        }
        
        // Update lastRun for scheduled runs
        if (runType === 'scheduled') {
            await updateLastRun();
        }
        
        // Final summary
        console.log('\n🎯 EXECUTION COMPLETED!');
        console.log(`⏱️  Duration: ${Math.round(duration / 1000)} seconds`);
        console.log(`📊 Results: ${sessionData.success_count}/${sessionData.total_results} successful`);
        console.log(`🔗 Session: ${sessionId}`);
        
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
