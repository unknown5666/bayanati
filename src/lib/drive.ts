import 'server-only';

// Google Drive helper: resolves/creates the nested folder structure and uploads
// files. Uses an OAuth2 client with a long-lived refresh token (see DEPLOYMENT.md
// for how to mint it). All folders are created on-demand and cached per request.

import { Readable } from 'node:stream';
import { google, type drive_v3 } from 'googleapis';

function driveClient(): drive_v3.Drive {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Google Drive credentials missing. Set GOOGLE_DRIVE_CLIENT_ID, ' +
        'GOOGLE_DRIVE_CLIENT_SECRET and GOOGLE_DRIVE_REFRESH_TOKEN.',
    );
  }
  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });
  return google.drive({ version: 'v3', auth });
}

function rootFolderId(): string {
  const id = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  if (!id) throw new Error('GOOGLE_DRIVE_ROOT_FOLDER_ID is not set.');
  return id;
}

const FOLDER_MIME = 'application/vnd.google-apps.folder';

/** Find a child folder by name under a parent, creating it if absent. */
async function ensureFolder(
  drive: drive_v3.Drive,
  parentId: string,
  name: string,
): Promise<string> {
  const safeName = name.replace(/'/g, "\\'");
  const res = await drive.files.list({
    q: `name = '${safeName}' and mimeType = '${FOLDER_MIME}' and '${parentId}' in parents and trashed = false`,
    fields: 'files(id, name)',
    spaces: 'drive',
    pageSize: 1,
  });
  const existing = res.data.files?.[0]?.id;
  if (existing) return existing;

  const created = await drive.files.create({
    requestBody: { name, mimeType: FOLDER_MIME, parents: [parentId] },
    fields: 'id',
  });
  if (!created.data.id) throw new Error(`Failed to create Drive folder "${name}"`);
  return created.data.id;
}

/** Resolve a nested path (array of folder names) from the root, creating each. */
export async function ensureFolderPath(segments: string[]): Promise<string> {
  const drive = driveClient();
  let parent = rootFolderId();
  for (const seg of segments) {
    parent = await ensureFolder(drive, parent, seg);
  }
  return parent;
}

export interface DriveUploadResult {
  fileId: string;
  webViewLink: string;
  folderId: string;
}

/** Upload a buffer to a nested Drive path, returning a shareable link. */
export async function uploadToDrive(params: {
  pathSegments: string[]; // relative to root folder
  fileName: string;
  mimeType: string;
  data: Buffer | Uint8Array;
}): Promise<DriveUploadResult> {
  const drive = driveClient();
  const folderId = await ensureFolderPath(params.pathSegments);

  const created = await drive.files.create({
    requestBody: { name: params.fileName, parents: [folderId] },
    media: {
      mimeType: params.mimeType,
      body: Readable.from(Buffer.from(params.data)),
    },
    fields: 'id, webViewLink',
  });

  const fileId = created.data.id!;
  return {
    fileId,
    folderId,
    webViewLink:
      created.data.webViewLink ?? `https://drive.google.com/file/d/${fileId}/view`,
  };
}

/** Fetch a URL (e.g. Firebase Storage download link) into a Buffer. */
export async function fetchToBuffer(url: string): Promise<{ data: Buffer; contentType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed (${res.status}) for ${url}`);
  const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
  const data = Buffer.from(await res.arrayBuffer());
  return { data, contentType };
}
