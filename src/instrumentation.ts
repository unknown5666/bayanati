// Runs once when the Next.js server boots (see experimental.instrumentationHook
// in next.config.js).
//
// The real work lives in ./instrumentation-node — it is imported from INSIDE the
// runtime check so the edge compilation drops it entirely. Next replaces
// `process.env.NEXT_RUNTIME` with a literal per compilation, so this branch is
// dead code on the edge; hoisting the import out of the `if` would drag
// nodemailer/imapflow/firebase-admin into the edge bundle and fail the build.

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startInboxWatcher } = await import('./instrumentation-node');
    await startInboxWatcher();
  }
}
