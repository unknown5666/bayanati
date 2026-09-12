import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/firebase/admin';
import { readXlsx } from '@/lib/xlsx';
import { parseCrewSheet, parseDelimited, type GridCell } from '@/lib/crew-sheet';

export const runtime = 'nodejs';

// Admin-only: read a crew sheet (.xlsx, .csv or .tsv) and return what it says,
// row by row, with every doubt it raises attached to the row it came from.
//
// This endpoint WRITES NOTHING. Reading a sheet and trusting a sheet are two
// different decisions: the amounts and dates here end up on a signed contract,
// and a name in a spreadsheet is not an identity. The dashboard shows the
// parsed rows next to the crew they appear to match, and the admin confirms
// each one before anything is saved through the normal update endpoints.

const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    await requireAdmin(req.headers.get('authorization'));
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const filename = String(body?.filename ?? 'sheet');
  const base64 = String(body?.data ?? '');
  if (!base64) return bad('No file was uploaded.');

  const bytes = Buffer.from(base64, 'base64');
  if (!bytes.length) return bad('The uploaded file is empty.');
  if (bytes.length > MAX_BYTES) return bad('That file is larger than 5 MB.');

  try {
    const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
    let grid: GridCell[][];
    let sheetName = filename;

    if (isZip) {
      const sheet = readXlsx(bytes);
      sheetName = sheet.name;
      // An error cell (#REF!, #VALUE!) holds no value a contract could use —
      // it reads as empty, and the row says so through its own issues.
      grid = sheet.rows.map((row) => row.map((cell) => (cell.error ? null : cell.value)));
    } else if (/\.(csv|tsv|txt)$/i.test(filename) || !bytes.includes(0)) {
      grid = parseDelimited(bytes.toString('utf8'));
    } else {
      return bad('Unsupported file. Upload the sheet as .xlsx, .csv or .tsv.');
    }

    const parsed = parseCrewSheet(grid, sheetName);
    if (!parsed.rows.length) return bad('The sheet has a header row but no crew under it.');

    return NextResponse.json({ ok: true, filename, ...parsed });
  } catch (err) {
    return bad(err instanceof Error ? err.message : 'Could not read that sheet.');
  }
}

function bad(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}
