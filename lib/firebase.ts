import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyAMf5xTcaCXEDxIVtTU65xx4lM6gNJDr_A",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "vision8-e7683.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "vision8-e7683",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "vision8-e7683.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "648853694943",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:648853694943:web:75dbe0285a9d1b1bd4bc6a",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-V5C29SV35C"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Connect to emulators in development
if (import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true') {
  try {
    connectAuthEmulator(auth, 'http://localhost:9099');
    connectFirestoreEmulator(db, 'localhost', 8080);
    connectStorageEmulator(storage, 'localhost', 9199);
  } catch (error) {
    console.log('Firebase emulators already connected');
  }
}

export default app;