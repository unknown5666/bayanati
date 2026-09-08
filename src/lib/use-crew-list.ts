'use client';

// Real-time subscription to the /crew collection. Updates the returned array
// whenever anything changes in the DB (no polling).

import { useEffect, useState } from 'react';
import { onValue, ref } from 'firebase/database';
import { firebaseDb } from './firebase/client';
import type { CrewMember } from './types';

export function useCrewList(): { crew: CrewMember[]; loading: boolean; error?: string } {
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const r = ref(firebaseDb(), 'crew');
    const off = onValue(
      r,
      (snap) => {
        const val = (snap.val() ?? {}) as Record<string, CrewMember>;
        // Drop malformed/partial records (e.g. a stray test write) so the
        // dashboard's nested field access can never throw and blank the page.
        const list = Object.values(val)
          .filter(
            (c): c is CrewMember =>
              !!c && !!c.personal && !!c.contract && !!c.documents && !!c.signatures,
          )
          .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
        setCrew(list);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
    );
    return () => off();
  }, []);

  return { crew, loading, error };
}
