'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth';
import { firebaseAuth, googleProvider } from '@/lib/firebase/client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function withEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signInWithEmailAndPassword(firebaseAuth(), email.trim(), password);
      router.push('/crew/dashboard');
    } catch {
      setError('Invalid email or password.');
    } finally {
      setBusy(false);
    }
  }

  async function withGoogle() {
    setBusy(true);
    setError('');
    try {
      await signInWithPopup(firebaseAuth(), googleProvider());
      router.push('/crew/dashboard');
    } catch {
      setError('Google sign-in was cancelled or failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-sm p-7">
        <p className="text-center text-sm uppercase tracking-[0.3em] text-exposure">
          Over Exposure
        </p>
        <h1 className="mt-2 text-center text-2xl font-bold">Bayanati Admin</h1>
        <p className="mt-1 text-center text-sm text-paper/60">
          Sign in to manage crew &amp; contracts.
        </p>

        <button onClick={withGoogle} disabled={busy} className="btn-ghost mt-6 w-full">
          Continue with Google
        </button>

        <div className="my-5 flex items-center gap-3 text-xs text-ink-500">
          <span className="h-px flex-1 bg-ink-700" />
          or
          <span className="h-px flex-1 bg-ink-700" />
        </div>

        <form onSubmit={withEmail} className="grid gap-3">
          <input
            className="field-input"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <input
            className="field-input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        {error && (
          <p className="mt-4 rounded-lg bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
