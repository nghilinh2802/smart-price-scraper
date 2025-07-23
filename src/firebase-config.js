const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
function initializeFirebase() {
    if (admin.apps.length === 0) {
        let serviceAccount;
        
        // Check if running in GitHub Actions
        if (process.env.GITHUB_ACTIONS) {
            // Use environment variables from GitHub Secrets
            serviceAccount = {
                type: "service_account",
                project_id: process.env.FIREBASE_PROJECT_ID,
                private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
                private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
                client_email: process.env.FIREBASE_CLIENT_EMAIL,
                client_id: process.env.FIREBASE_CLIENT_ID,
                auth_uri: "https://accounts.google.com/o/oauth2/auth",
                token_uri: "https://oauth2.googleapis.com/token",
                auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
                client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
                universe_domain: "googleapis.com"
            };
        } else {
            // Local development - use service account file
            serviceAccount = require('../firebase-service-account.json');
        }

        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: process.env.FIREBASE_PROJECT_ID || 'pricetracking-ad58d'
        });
        
        console.log('🔥 Firebase initialized successfully!');
    }
    
    return admin.firestore();
}

module.exports = { initializeFirebase };
