'use client';

// Client hook: tracks the signed-in Firebase user and confirms admin status via
// /api/auth/session (which also grants the admin claim to whitelisted emails).

import { useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { firebaseAuth } from './firebase/client';

export interface AdminAuthState {
  loading: boolean;
  user: User | null;
  isAdmin: boolean;
  error?: string;
}

export function useAdminAuth(): AdminAuthState {
  const [state, setState] = useState<AdminAuthState>({
    loading: true,
    user: null,
    isAdmin: false,
  });

  useEffect(() => {
    return onAuthStateChanged(firebaseAuth(), async (user) => {
      if (!user) {
        setState({ loading: false, user: null, isAdmin: false });
        return;
      }
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/auth/session', {
          method: 'POST',
          headers: { authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        // If a claim was just granted, refresh the token so DB reads see it.
        if (data.claimUpdated) await user.getIdToken(true);
        setState({ loading: false, user, isAdmin: Boolean(data.isAdmin) });
      } catch (err) {
        setState({
          loading: false,
          user,
          isAdmin: false,
          error: err instanceof Error ? err.message : 'auth check failed',
        });
      }
    });
  }, []);

  return state;
}

/** Get a fresh ID token for authenticating API calls. */
export async function authHeader(): Promise<Record<string, string>> {
  const user = firebaseAuth().currentUser;
  if (!user) throw new Error('Not signed in');
  const token = await user.getIdToken();
  return { authorization: `Bearer ${token}` };
}
