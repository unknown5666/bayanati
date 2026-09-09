'use client';

// Route-level error handler (Next.js App Router). Catches any client render
// error anywhere in the app's routes — including page-level code that a
// component-scoped boundary would miss — and shows the message on screen
// instead of a blank page. This is what turns "blank screen" into a diagnosis.

import { useEffect } from 'react';
import { Icon } from '@/components/ui/Icon';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[route error]', error);
  }, [error]);

  return (
    <main className="flex min-h-[calc(100dvh-var(--header-h))] items-center justify-center px-4">
      <div className="card max-w-md p-7 text-center animate-scale-in">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-danger/30 bg-danger/10 text-danger">
          <Icon name="alert" className="h-6 w-6" />
        </span>
        <p className="mt-4 text-lg font-semibold">Something went wrong</p>
        <p className="mt-2 text-sm leading-relaxed text-paper/[0.72]">
          The page hit an error while loading. Details:
        </p>
        <pre className="mt-4 max-h-56 overflow-auto rounded-xl border border-ink-800 bg-ink-950/80 p-3 text-left text-xs leading-relaxed text-paper/[0.72]">
          {error?.message || 'Unknown error'}
          {error?.digest ? `\n\ndigest: ${error.digest}` : ''}
        </pre>
        <button className="btn-ghost mt-5 w-full" onClick={() => reset()}>
          <Icon name="refresh" className="h-4 w-4" />
          Try again
        </button>
      </div>
    </main>
  );
}
