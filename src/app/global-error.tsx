'use client';

import { useEffect } from 'react';

/**
 * Last-resort boundary that replaces the whole document when a render throws
 * before any nested error UI can catch it — including a `ChunkLoadError` from a
 * stale-deploy cache mismatch. On a chunk error we reload once (guarded) to
 * pull fresh HTML + chunks; otherwise we show a recoverable message.
 */
const RELOAD_FLAG = 'chunk-reload-attempted';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isChunkError =
    /ChunkLoadError/i.test(`${error?.name}: ${error?.message}`) ||
    /Loading chunk [\w-]+ failed/i.test(error?.message ?? '');

  useEffect(() => {
    if (!isChunkError) return;
    try {
      if (sessionStorage.getItem(RELOAD_FLAG)) return;
      sessionStorage.setItem(RELOAD_FLAG, '1');
    } catch {
      /* ignore */
    }
    window.location.reload();
  }, [isChunkError]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0a0b',
          color: '#e8e8ea',
          fontFamily: 'system-ui, sans-serif',
          padding: '1rem',
        }}
      >
        <div style={{ textAlign: 'center', maxWidth: 420 }}>
          <p style={{ fontSize: '1.1rem', fontWeight: 600 }}>
            {isChunkError ? 'Updating to the latest version…' : 'Something went wrong'}
          </p>
          <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', opacity: 0.7 }}>
            {isChunkError
              ? 'A new version was deployed. Reloading now.'
              : error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={() => (isChunkError ? window.location.reload() : reset())}
            style={{
              marginTop: '1.25rem',
              padding: '0.5rem 1.25rem',
              borderRadius: 8,
              border: '1px solid rgba(232,232,234,0.25)',
              background: 'transparent',
              color: 'inherit',
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
