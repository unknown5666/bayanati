import { NextResponse } from 'next/server';
import { getCrew, getProjectName } from '@/lib/crew-db';
import { downloadFromDrive } from '@/lib/drive';
import { buildPlaceholders, generateContractPdf } from '@/lib/contract-pdf';
import { lookupSignToken } from '@/lib/sign-tokens';
import type { ContractType } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Serves the contract PDF behind a signing token, so the crew member can read
// what they are signing on the phone without the file having to be public in
// Drive. Anyone holding the token may read this one contract — the token is the
// capability, exactly as it is for signing.

const LETTER: Record<ContractType, 'A' | 'R'> = { X: 'A', Y: 'R' };

/**
 * The bytes we emailed, fetched back from Drive. If the file id is missing (an
 * older record, or the Drive file was moved), the contract is regenerated from
 * the same data so the signer always sees something.
 */
export async function GET(
  _req: Request,
  { params }: { params: { token: string } },
) {
  let lookup: Awaited<ReturnType<typeof lookupSignToken>>;
  try {
    lookup = await lookupSignToken(params.token);
  } catch (err) {
    console.error('[sign/pdf] token lookup failed', err);
    return NextResponse.json({ error: 'temporarily unavailable' }, { status: 503 });
  }
  if (!lookup.ok) {
    return NextResponse.json({ error: lookup.reason }, { status: 404 });
  }
  const { crewId, type } = lookup.record;

  const crew = await getCrew(crewId);
  if (!crew) return NextResponse.json({ error: 'crew not found' }, { status: 404 });

  const fileId = type === 'X' ? crew.contract.pdfFileIdX : crew.contract.pdfFileIdY;
  let bytes: Uint8Array | null = null;
  if (fileId) {
    try {
      bytes = await downloadFromDrive(fileId);
    } catch (err) {
      console.error('[sign/pdf] Drive fetch failed, regenerating', err);
    }
  }
  if (!bytes) {
    const projectName = await getProjectName(crew.projectId);
    bytes = await generateContractPdf({
      placeholders: buildPlaceholders(crew, type, projectName),
    });
  }

  const fileName = `Contract - ${crew.personal.firstName} - ${crew.personal.lastName} - ${LETTER[type]}.pdf`;
  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${fileName.replace(/"/g, '')}"`,
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
