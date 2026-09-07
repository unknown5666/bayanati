'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminAuth } from '@/lib/use-admin-auth';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { signOut } from 'firebase/auth';
import { firebaseAuth } from '@/lib/firebase/client';

export default function DashboardPage() {
  const { loading, user, isAdmin } = useAdminAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/auth/login');
  }, [loading, user, router]);

  if (loading) {
    return <Centered>Checking access…</Centered>;
  }

  if (user && !isAdmin) {
    return (
      <Centered>
        <div className="text-center">
          <p className="text-lg font-semibold">Not authorised</p>
          <p className="mt-1 text-sm text-paper/60">
            {user.email} is not on the admin list.
          </p>
          <button className="btn-ghost mt-4" onClick={() => signOut(firebaseAuth())}>
            Sign out
          </button>
        </div>
      </Centered>
    );
  }

  if (!user) return <Centered>Redirecting…</Centered>;

  return <Dashboard adminEmail={user.email ?? ''} />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 text-paper/70">
      {children}
    </main>
  );
}
