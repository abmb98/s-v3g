import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, getDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDDO_7qvJvngCnJDopqfZEqTCsW39YqCFs",
  authDomain: "secteur-e639e.firebaseapp.com",
  projectId: "secteur-e639e",
  storageBucket: "secteur-e639e.firebasestorage.app",
  messagingSenderId: "834372572362",
  appId: "1:834372572362:web:f866cdd9d1519a2ec65033"
};

// Debug: Log Firebase config
console.log('Initializing Firebase with config:', {
  projectId: firebaseConfig.projectId,
  authDomain: firebaseConfig.authDomain,
  apiKey: firebaseConfig.apiKey.substring(0, 10) + '...'
});

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Add fetch diagnostics
const originalFetch = window.fetch;
window.fetch = async function(...args) {
  try {
    console.log('🌐 Fetch request:', args[0]);
    const result = await originalFetch.apply(this, args);
    console.log('✅ Fetch success:', args[0], result.status);
    return result;
  } catch (error) {
    console.error('❌ Fetch failed:', args[0], error);
    throw error;
  }
};

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);

// Initialize Cloud Firestore and get a reference to the service
export const db = getFirestore(app);

// Test Firebase connectivity with retry logic
export const testFirebaseConnection = async (retries = 3): Promise<{ success: boolean; error?: string }> => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`Testing Firebase connection... (attempt ${attempt}/${retries})`);

      // Test Firestore connection using a valid collection name
      const testDoc = doc(db, 'app_config', 'connection_test');

      // Add timeout to the request (increased timeout)
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Connection timeout')), 15000); // 15 seconds
      });

      const connectionPromise = getDoc(testDoc);
      await Promise.race([connectionPromise, timeoutPromise]);

      console.log('Firebase connection: SUCCESS');
      return { success: true };
    } catch (error: any) {
      console.error(`Firebase connection test failed (attempt ${attempt}):`, error);
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        code: error.code,
        stack: error.stack
      });

      // If this isn't the last attempt, wait before retrying
      if (attempt < retries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      let errorMessage = 'Unknown connection error';

      if (error.message === 'Connection timeout') {
        errorMessage = 'Connection timeout - Firebase service may be slow or unreachable';
      } else if (error.code) {
        switch (error.code) {
          case 'unavailable':
            errorMessage = 'Firebase service is temporarily unavailable';
            break;
          case 'permission-denied':
            errorMessage = 'Firebase permissions issue - this is normal for connection testing';
            // Permission denied is actually OK for connection testing - it means we can reach Firebase
            console.log('Permission denied is normal for connection test - Firebase is reachable');
            return { success: true };
          case 'failed-precondition':
            errorMessage = 'Firebase configuration error';
            break;
          case 'unauthenticated':
            errorMessage = 'Firebase authentication configuration issue';
            break;
          case 'invalid-argument':
            errorMessage = 'Invalid request - check collection/document names';
            break;
          case 'network-request-failed':
            errorMessage = 'Network request failed - check internet connection';
            break;
          default:
            errorMessage = `Firebase error: ${error.code}`;
        }
      } else if (error.message?.includes('fetch') || error.message?.includes('network') || error.message?.includes('Failed to fetch') || error.name === 'TypeError') {
        errorMessage = 'Network connectivity issue - This could be due to:\n• Firewall blocking Firebase\n• Proxy server issues\n• Internet connection problems\n• DNS resolution issues';
      } else if (error.message?.includes('CORS')) {
        errorMessage = 'CORS policy error - check Firebase domain configuration';
      }

      return { success: false, error: errorMessage };
    }
  }

  return { success: false, error: 'Connection failed after all retry attempts' };
};

// Connection recovery utility
export const attemptConnectionRecovery = async () => {
  console.log('🔄 Attempting connection recovery...');

  // Test basic network connectivity first
  try {
    await fetch('https://www.google.com/favicon.ico', {
      mode: 'no-cors',
      cache: 'no-cache'
    });
    console.log('✅ Basic internet connectivity: OK');
  } catch (error) {
    console.error('❌ No internet connectivity detected:', error);
    return { success: false, error: 'No internet connection' };
  }

  // Test Firebase endpoints
  try {
    const testResponse = await fetch('https://firestore.googleapis.com', {
      mode: 'no-cors',
      cache: 'no-cache'
    });
    console.log('✅ Firebase endpoints reachable');
  } catch (error) {
    console.error('❌ Firebase endpoints unreachable:', error);
    return { success: false, error: 'Firebase services blocked or unreachable' };
  }

  // Test actual Firestore connection
  return await testFirebaseConnection(3);
};

export default app;
