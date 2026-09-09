'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth';
import { firebaseAuth, googleProvider } from '@/lib/firebase/client';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  // Tracked per method so only the button that was pressed shows a spinner —
  // a single `busy` flag makes both look like they are working.
  const [busy, setBusy] = useState<'google' | 'password' | null>(null);

  async function withEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy('password');
    setError('');
    try {
      await signInWithEmailAndPassword(firebaseAuth(), email.trim(), password);
      router.push('/crew/dashboard');
    } catch {
      setError('Invalid email or password.');
    } finally {
      setBusy(null);
    }
  }

  async function withGoogle() {
    setBusy('google');
    setError('');
    try {
      await signInWithPopup(firebaseAuth(), googleProvider());
      router.push('/crew/dashboard');
    } catch {
      setError('Google sign-in was cancelled or failed.');
    } finally {
      setBusy(null);
    }
  }

  const working = busy !== null;

  return (
    <main className="flex min-h-[calc(100dvh-var(--header-h))] items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm animate-scale-in">
        <div className="card p-7 sm:p-8">
          <div className="flex flex-col items-center text-center">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-exposure-gradient text-ink-950 shadow-flare">
              <Icon name="users" className="h-6 w-6" strokeWidth={2} />
            </span>
            <h1 className="mt-4 text-2xl text-display">Bayanati Admin</h1>
            <p className="mt-1.5 text-sm text-paper/[0.72]">
              Sign in to manage crew &amp; contracts.
            </p>
          </div>

          <button
            onClick={withGoogle}
            disabled={working}
            className="btn-ghost mt-7 w-full"
          >
            {busy === 'google' ? (
              <Spinner />
            ) : (
              <Icon name="google" className="h-[18px] w-[18px]" />
            )}
            Continue with Google
          </button>

          <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-paper/[0.55]">
            <span className="h-px flex-1 bg-ink-700" />
            or
            <span className="h-px flex-1 bg-ink-700" />
          </div>

          <form onSubmit={withEmail} className="grid gap-3">
            {/* Visible labels rather than placeholder-only: a placeholder
                disappears the moment someone starts typing, which is exactly
                when they need to check which field they are in. */}
            <div>
              <label className="field-label" htmlFor="login-email">
                Email
              </label>
              <input
                id="login-email"
                className="field-input"
                type="email"
                dir="ltr"
                placeholder="you@overexposure.ae"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                disabled={working}
                required
              />
            </div>
            <div>
              <label className="field-label" htmlFor="login-password">
                Password
              </label>
              <input
                id="login-password"
                className="field-input"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                disabled={working}
                required
              />
            </div>
            <button type="submit" disabled={working} className="btn-primary mt-1 w-full">
              {busy === 'password' && <Spinner />}
              {busy === 'password' ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          {error && (
            <Alert tone="error" className="mt-5">
              {error}
            </Alert>
          )}
        </div>

        <p className="mt-5 text-center text-xs uppercase tracking-[0.28em] text-paper/[0.55]">
          Over Exposure Productions
        </p>
      </div>
    </main>
  );
}
