const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
function initializeFirebase() {
    if (admin.apps.length === 0) {
        let serviceAccount;
        
        // Check if running in GitHub Actions
        if (process.env.GITHUB_ACTIONS) {
            console.log('🔧 Initializing Firebase for GitHub Actions...');
            
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
            
            console.log('✅ GitHub Actions Firebase config loaded');
        } else {
            console.log('🔧 Initializing Firebase for local development...');
            
            // Local development - use service account file
            try {
                serviceAccount = require('../firebase-service-account.json');
                console.log('✅ Local Firebase config loaded from file');
            } catch (error) {
                console.error('❌ Firebase service account file not found for local development');
                console.error('Create firebase-service-account.json file in root directory');
                process.exit(1);
            }
        }

        try {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                projectId: serviceAccount.project_id
            });
            
            console.log('🔥 Firebase initialized successfully!');
        } catch (error) {
            console.error('❌ Failed to initialize Firebase:', error.message);
            throw error;
        }
    }
    
    return admin.firestore();
}

module.exports = { initializeFirebase };
