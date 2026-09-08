'use client';

import { useEffect } from 'react';

/**
 * Recovers from stale-deploy ChunkLoadErrors.
 *
 * After a redeploy, a browser holding a cached HTML shell asks for JS chunks
 * whose hashes no longer exist on the server (e.g. `page-cf62d121…js` → 404).
 * Next.js throws a `ChunkLoadError`, which surfaces as a blank page /
 * "Minified React error #423". A single hard reload pulls the fresh HTML +
 * matching chunks and fixes it.
 *
 * We reload at most once per session (guarded via sessionStorage) so a genuine
 * network failure can't trap the user in a reload loop.
 */
const RELOAD_FLAG = 'chunk-reload-attempted';

function isChunkLoadError(value: unknown): boolean {
  if (!value) return false;
  const message =
    typeof value === 'string'
      ? value
      : value instanceof Error
        ? `${value.name}: ${value.message}`
        : String((value as { message?: unknown })?.message ?? '');
  return /ChunkLoadError/i.test(message) || /Loading chunk [\w-]+ failed/i.test(message);
}

function reloadOnce() {
  try {
    if (sessionStorage.getItem(RELOAD_FLAG)) return; // already tried this session
    sessionStorage.setItem(RELOAD_FLAG, '1');
  } catch {
    // sessionStorage unavailable (private mode etc.) — fall through and reload anyway.
  }
  // Reload from the server, bypassing the stale cached document.
  window.location.reload();
}

export function ChunkReloadGuard() {
  useEffect(() => {
    // A clean load means the current chunks are healthy — clear the guard so a
    // future stale-deploy can recover again.
    try {
      sessionStorage.removeItem(RELOAD_FLAG);
    } catch {
      /* ignore */
    }

    const onError = (event: ErrorEvent) => {
      if (isChunkLoadError(event.error) || isChunkLoadError(event.message)) {
        reloadOnce();
      }
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      if (isChunkLoadError(event.reason)) {
        reloadOnce();
      }
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
