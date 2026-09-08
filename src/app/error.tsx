'use client';

// Route-level error handler (Next.js App Router). Catches any client render
// error anywhere in the app's routes — including page-level code that a
// component-scoped boundary would miss — and shows the message on screen
// instead of a blank page. This is what turns "blank screen" into a diagnosis.

import { useEffect } from 'react';

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
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card max-w-md p-6 text-center">
        <p className="text-lg font-semibold text-red-400">Something went wrong</p>
        <p className="mt-2 text-sm text-paper/70">
          The page hit an error while loading. Details:
        </p>
        <pre className="mt-3 max-h-56 overflow-auto rounded-lg bg-ink-900 p-3 text-left text-xs text-paper/80">
          {error?.message || 'Unknown error'}
          {error?.digest ? `\n\ndigest: ${error.digest}` : ''}
        </pre>
        <button className="btn-ghost mt-4" onClick={() => reset()}>
          Try again
        </button>
      </div>
    </main>
  );
}
