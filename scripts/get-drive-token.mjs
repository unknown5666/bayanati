// One-time helper to mint a Google Drive refresh token for the account that owns
// the "Over Exposure Productions" Drive folder.
//
// Prerequisites:
//   1. Google Cloud → APIs & Services → enable "Google Drive API".
//   2. Create an OAuth 2.0 Client ID of type "Desktop app".
//   3. Put the client id/secret in .env.local (GOOGLE_DRIVE_CLIENT_ID/SECRET).
//   4. npm install googleapis  (already a dependency)
//
// Usage:
//   node --env-file=.env.local scripts/get-drive-token.mjs
//
// It opens (or prints) a URL — approve with the OEP Google account in the
// browser and Google redirects back to this script's temporary local server,
// which captures the code automatically and prints GOOGLE_DRIVE_REFRESH_TOKEN
// to paste into .env.local.
//
// Note: Google shut down the old "out-of-band" (copy/paste code) flow in 2023,
// so this uses a loopback redirect on http://127.0.0.1:<port>. A "Desktop app"
// OAuth client allows loopback redirects with no extra configuration.

import { google } from 'googleapis';
import http from 'node:http';
import { URL } from 'node:url';

const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error(
    'Missing GOOGLE_DRIVE_CLIENT_ID / GOOGLE_DRIVE_CLIENT_SECRET in .env.local.\n' +
      'Run with: node --env-file=.env.local scripts/get-drive-token.mjs',
  );
  process.exit(1);
}

// Bind to an ephemeral port on the loopback interface, then build the matching
// redirect URI so it always agrees with what we register on the OAuth client.
const server = http.createServer();
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const redirectUri = `http://127.0.0.1:${port}`;

const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

const authUrl = oauth2.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent', // force a refresh_token even on repeat runs
  scope: ['https://www.googleapis.com/auth/drive'],
});

console.log('\n1) Open this URL and approve with the OEP Google account:\n');
console.log(authUrl + '\n');
console.log('   (Waiting for the redirect back to ' + redirectUri + ' …)\n');

// Best-effort: try to open the browser automatically. Ignore if it fails.
try {
  const { platform } = process;
  const opener =
    platform === 'win32' ? ['cmd', ['/c', 'start', '""', authUrl]]
    : platform === 'darwin' ? ['open', [authUrl]]
    : ['xdg-open', [authUrl]];
  const { spawn } = await import('node:child_process');
  spawn(opener[0], opener[1], { stdio: 'ignore', detached: true }).unref();
} catch {
  /* user can open the URL manually */
}

const code = await new Promise((resolve, reject) => {
  server.on('request', (req, res) => {
    try {
      const url = new URL(req.url, redirectUri);
      const err = url.searchParams.get('error');
      const c = url.searchParams.get('code');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      if (err) {
        res.end(`<h1>Authorization failed</h1><p>${err}</p><p>You can close this tab.</p>`);
        reject(new Error(`Authorization error: ${err}`));
        return;
      }
      if (!c) {
        res.end('<p>Waiting for authorization…</p>');
        return;
      }
      res.end('<h1>Done ✓</h1><p>Return to the terminal — you can close this tab.</p>');
      resolve(c);
    } catch (e) {
      reject(e);
    }
  });
  // Safety timeout so the script doesn't hang forever.
  setTimeout(() => reject(new Error('Timed out waiting for Google redirect (5 min).')), 5 * 60_000);
});

server.close();

const { tokens } = await oauth2.getToken(code);
if (!tokens.refresh_token) {
  console.error(
    '\nNo refresh token returned. Remove the app from ' +
      'https://myaccount.google.com/permissions and retry (prompt=consent forces it).',
  );
  process.exit(1);
}

console.log('\n✓ Add this to .env.local:\n');
console.log(`GOOGLE_DRIVE_REFRESH_TOKEN=${tokens.refresh_token}\n`);
process.exit(0);
