'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminAuth } from '@/lib/use-admin-auth';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { signOut } from 'firebase/auth';
import { firebaseAuth } from '@/lib/firebase/client';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/ui/Spinner';

export default function DashboardPage() {
  const { loading, user, isAdmin } = useAdminAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/auth/login');
  }, [loading, user, router]);

  if (loading) {
    return (
      <Centered>
        <div className="flex items-center gap-3 text-paper/[0.72]">
          <Spinner className="h-5 w-5" />
          Checking access…
        </div>
      </Centered>
    );
  }

  if (user && !isAdmin) {
    return (
      <Centered>
        <div className="card max-w-sm p-7 text-center animate-scale-in">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-danger/30 bg-danger/10 text-danger">
            <Icon name="alert" className="h-6 w-6" />
          </span>
          <p className="mt-4 text-lg font-semibold">Not authorised</p>
          <p className="mt-1.5 text-sm leading-relaxed text-paper/[0.72]">
            <span className="font-medium text-paper">{user.email}</span> is not on
            the admin list. Ask a production admin to add you, then sign in again.
          </p>
          <button className="btn-ghost mt-5 w-full" onClick={() => signOut(firebaseAuth())}>
            <Icon name="logout" className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </Centered>
    );
  }

  if (!user) {
    return (
      <Centered>
        <div className="flex items-center gap-3 text-paper/[0.72]">
          <Spinner className="h-5 w-5" />
          Redirecting…
        </div>
      </Centered>
    );
  }

  return (
    <ErrorBoundary>
      <Dashboard adminEmail={user.email ?? ''} />
    </ErrorBoundary>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-[calc(100dvh-var(--header-h))] items-center justify-center px-4">
      {children}
    </main>
  );
}
