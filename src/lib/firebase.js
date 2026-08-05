// Firebase app + Auth (Google) + Firestore. The web config keys below are public
// client identifiers (safe to ship in the bundle) — access is guarded by Firebase
// Auth, the Authorized-domains list, and the Firestore security rules, not by these.
import { initializeApp } from 'firebase/app';
import { GoogleAuthProvider, getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyBbodL_TzmKMFbfF-Swg1SK2iaqjjqPvMo',
  authDomain: 'family-tree-3b760.firebaseapp.com',
  projectId: 'family-tree-3b760',
  storageBucket: 'family-tree-3b760.firebasestorage.app',
  messagingSenderId: '10858632027',
  appId: '1:10858632027:web:29e0a02158a4df968a407e',
  measurementId: 'G-W9JCJDYBQ9',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Offline cache so the tree keeps working with no signal and syncs when back online.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
