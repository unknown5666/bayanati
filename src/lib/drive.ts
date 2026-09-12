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

/** Download a Drive file's bytes by id (the PDF we generated and emailed). */
export async function downloadFromDrive(fileId: string): Promise<Buffer> {
  const drive = driveClient();
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' },
  );
  return Buffer.from(res.data as ArrayBuffer);
}

/** Fetch a URL (e.g. Firebase Storage download link) into a Buffer. */
export async function fetchToBuffer(url: string): Promise<{ data: Buffer; contentType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed (${res.status}) for ${url}`);
  const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
  const data = Buffer.from(await res.arrayBuffer());
  return { data, contentType };
}
// ---------------------------------------------------------------------------
// Folder resolution, moving and downloading
// ---------------------------------------------------------------------------
//
// Canonical layout — ONE folder per crew member, living under their project:
//
//   Projects/{Project Name}/{Crew Name}/Documents/   ID images from intake
//   Projects/{Project Name}/{Crew Name}/Contracts/   generated + signed PDFs
//
// Earlier builds scattered a crew across `…/Crew/{name}` (intake) and
// `…/Contracts/Pending|Signed/{name}` (contracts), and unassigned crew landed
// under a different project folder than the one they were later assigned to.
// `resolveCrewFolder` adopts any of those legacy folders into the canonical
// place, so the structure self-heals the first time a crew member is touched.

export const DOCUMENTS_SUB = 'Documents';
export const CONTRACTS_SUB = 'Contracts';

/** Find a child folder by name under a parent. Returns null when absent. */
async function findFolder(
  drive: drive_v3.Drive,
  parentId: string,
  name: string,
): Promise<string | null> {
  const safeName = name.replace(/'/g, "\'");
  const res = await drive.files.list({
    q: `name = '${safeName}' and mimeType = '${FOLDER_MIME}' and '${parentId}' in parents and trashed = false`,
    fields: 'files(id)',
    spaces: 'drive',
    pageSize: 1,
  });
  return res.data.files?.[0]?.id ?? null;
}

/** Walk a path of folder names without creating anything. */
async function findFolderPath(
  drive: drive_v3.Drive,
  segments: string[],
): Promise<string | null> {
  let parent = rootFolderId();
  for (const seg of segments) {
    const next = await findFolder(drive, parent, seg);
    if (!next) return null;
    parent = next;
  }
  return parent;
}

/** Re-parent a Drive file/folder. Everything inside moves with it. */
async function moveInto(
  drive: drive_v3.Drive,
  fileId: string,
  newParentId: string,
): Promise<void> {
  const current = await drive.files.get({ fileId, fields: 'parents' });
  const previous = (current.data.parents ?? []).join(',');
  if (previous === newParentId) return;
  await drive.files.update({
    fileId,
    addParents: newParentId,
    ...(previous ? { removeParents: previous } : {}),
    fields: 'id, parents',
  });
}

export interface CrewFolders {
  /** The crew member's own folder: Projects/{project}/{crew}. */
  rootId: string;
  documentsId: string;
  contractsId: string;
  webViewLink: string;
}

/**
 * Resolve (creating or adopting) the canonical folder for one crew member.
 *
 * `legacyProjectNames` lets a caller name project folders the crew may have
 * previously lived under (e.g. the intake default) so their existing files are
 * pulled across rather than stranded.
 */
export async function resolveCrewFolder(params: {
  projectName: string;
  crewName: string;
  legacyProjectNames?: string[];
}): Promise<CrewFolders> {
  const drive = driveClient();
  const { projectName, crewName } = params;
  const projectId = await ensureFolderPath(['Projects', projectName]);

  let rootId = await findFolder(drive, projectId, crewName);

  if (!rootId) {
    // Look for the crew member in the legacy locations, newest layout first.
    const candidates: string[][] = [];
    const projects = [projectName, ...(params.legacyProjectNames ?? [])].filter(
      (p, i, a) => p && a.indexOf(p) === i,
    );
    for (const p of projects) {
      candidates.push(['Projects', p, crewName]);
      candidates.push(['Projects', p, 'Crew', crewName]);
    }
    for (const segments of candidates) {
      const found = await findFolderPath(drive, segments);
      if (found) {
        await moveInto(drive, found, projectId);
        // Adopting a folder named after a stale project keeps the crew name, so
        // no rename is needed — the folder IS the crew member.
        rootId = found;
        break;
      }
    }
  }

  if (!rootId) {
    rootId = await ensureFolder(drive, projectId, crewName);
  }

  const documentsId = await ensureFolder(drive, rootId, DOCUMENTS_SUB);
  const contractsId = await ensureFolder(drive, rootId, CONTRACTS_SUB);

  // Pull across any contracts left in the old Pending/Signed buckets, under the
  // current project and any project the crew may have been filed under before.
  const sweepProjects = [projectName, ...(params.legacyProjectNames ?? [])].filter(
    (p, i, a) => p && a.indexOf(p) === i,
  );
  const buckets = sweepProjects.flatMap((p) =>
    ['Pending', 'Signed'].map((b) => ['Projects', p, 'Contracts', b, crewName]),
  );
  for (const segments of buckets) {
    const legacy = await findFolderPath(drive, segments);
    if (!legacy) continue;
    const files = await drive.files.list({
      q: `'${legacy}' in parents and trashed = false`,
      fields: 'files(id)',
      spaces: 'drive',
      pageSize: 200,
    });
    for (const f of files.data.files ?? []) {
      if (f.id) await moveInto(drive, f.id, contractsId);
    }
  }

  return {
    rootId,
    documentsId,
    contractsId,
    webViewLink: `https://drive.google.com/drive/folders/${rootId}`,
  };
}

/** Upload a buffer straight into a known folder id. */
export async function uploadToFolder(params: {
  folderId: string;
  fileName: string;
  mimeType: string;
  data: Buffer | Uint8Array;
}): Promise<DriveUploadResult> {
  const drive = driveClient();
  // Supersede an existing file of the same name so regenerating a contract does
  // not litter the folder with duplicates. The old copy is moved to the Drive
  // trash rather than destroyed, so a wrong regenerate stays recoverable.
  const safeName = params.fileName.replace(/'/g, "\'");
  const existing = await drive.files.list({
    q: `name = '${safeName}' and '${params.folderId}' in parents and trashed = false`,
    fields: 'files(id)',
    spaces: 'drive',
    pageSize: 10,
  });
  for (const f of existing.data.files ?? []) {
    if (!f.id) continue;
    await drive.files
      .update({ fileId: f.id, requestBody: { trashed: true } })
      .catch(() => undefined);
  }

  const created = await drive.files.create({
    requestBody: { name: params.fileName, parents: [params.folderId] },
    media: {
      mimeType: params.mimeType,
      body: Readable.from(Buffer.from(params.data)),
    },
    fields: 'id, webViewLink',
  });
  const fileId = created.data.id!;
  return {
    fileId,
    folderId: params.folderId,
    webViewLink:
      created.data.webViewLink ?? `https://drive.google.com/file/d/${fileId}/view`,
  };
}

/** Extract a Drive file id from a webViewLink. */
export function driveFileIdFromLink(link?: string): string | null {
  if (!link) return null;
  const m = link.match(/\/d\/([a-zA-Z0-9_-]+)/) ?? link.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return m?.[1] ?? null;
}

/**
 * Move a Drive file or folder to the owner's trash. Used when a crew record is
 * deleted: trashing (rather than permanently deleting) means the paperwork can
 * still be recovered from Drive for 30 days if someone deletes the wrong person.
 */
export async function trashDriveFile(fileId: string): Promise<void> {
  const drive = driveClient();
  await drive.files.update({ fileId, requestBody: { trashed: true }, fields: 'id' });
}
