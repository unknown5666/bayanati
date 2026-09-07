'use client';

// Firebase Web SDK for the browser. Uses NEXT_PUBLIC_* config, which is safe to
// expose. Services are created lazily on first use so that server-side rendering
// of client components during `next build` never calls getAuth() with an empty
// config (which throws auth/invalid-api-key). All real usage happens in the
// browser inside effects/handlers.

import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth';
import { getDatabase, type Database } from 'firebase/database';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let cachedAuth: Auth | undefined;
let cachedDb: Database | undefined;
let cachedStorage: FirebaseStorage | undefined;

function app(): FirebaseApp {
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

export function firebaseAuth(): Auth {
  return (cachedAuth ??= getAuth(app()));
}

export function firebaseDb(): Database {
  return (cachedDb ??= getDatabase(app()));
}

export function firebaseStorage(): FirebaseStorage {
  return (cachedStorage ??= getStorage(app()));
}

export function googleProvider(): GoogleAuthProvider {
  return new GoogleAuthProvider();
}
