'use client';

// Firebase Web SDK for the browser. Uses NEXT_PUBLIC_* config, which is safe to
// expose. Services are created lazily on first use so that server-side rendering
// of client components during `next build` never calls getAuth() with an empty
// config (which throws auth/invalid-api-key). All real usage happens in the
// browser inside effects/handlers.

import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth';
import { getDatabase, type Database } from 'firebase/database';

// Firebase web config is public by design (it is shipped to every browser), so
// the real values are safe to keep in source as fallbacks. Env vars still win
// when present — this just guarantees the client works even if the deploy host
// didn't inject NEXT_PUBLIC_* at build time (which silently breaks auth).
const firebaseConfig = {
  apiKey:
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY ??
    'AIzaSyAshRnHQecoLKT-dwZh7baURmpYBplQqQQ',
  authDomain:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? 'oep-crew-system.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'oep-crew-system',
  databaseURL:
    process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL ??
    'https://oep-crew-system-default-rtdb.firebaseio.com',
  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ??
    'oep-crew-system.firebasestorage.app',
  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '634616860348',
  appId:
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID ??
    '1:634616860348:web:5b0ade95643c727f19cab9',
};

let cachedAuth: Auth | undefined;
let cachedDb: Database | undefined;

function app(): FirebaseApp {
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

export function firebaseAuth(): Auth {
  return (cachedAuth ??= getAuth(app()));
}

export function firebaseDb(): Database {
  return (cachedDb ??= getDatabase(app()));
}

export function googleProvider(): GoogleAuthProvider {
  return new GoogleAuthProvider();
}
