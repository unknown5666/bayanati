import 'server-only';

/**
 * A small read-only XLSX reader.
 *
 * The app only ever needs to read a crew sheet someone exported from Excel or
 * Google Sheets — a single grid of text, numbers and dates. That does not
 * justify a spreadsheet dependency, so the bytes are unpacked here: an .xlsx is
 * a ZIP holding XML, and Node already ships the two things that takes (zlib for
 * the entries, and enough string handling for the handful of XML shapes Excel
 * writes for a cell).
 *
 * What is deliberately NOT supported: writing, styles beyond "is this number
 * format a date?", charts, and anything outside the first worksheet's cell
 * values. Formulas are read as their CACHED value — the result Excel last
 * calculated — which is what a human reading the sheet sees.
 */

import { inflateRawSync } from 'node:zlib';

export type CellValue = string | number | boolean | null;

export interface SheetCell {
  /** The value as Excel holds it. Dates arrive as ISO yyyy-mm-dd strings. */
  value: CellValue;
  /** True when the cell's number format makes it a date rather than a number. */
  isDate: boolean;
  /** Set when the cell holds an error such as #REF! or #DIV/0!. */
  error?: string;
  /** The formula text, when the cell has one. */
  formula?: string;
}

export interface Worksheet {
  name: string;
  /** Row-major grid, padded so every row has the same number of columns. */
  rows: SheetCell[][];
}

const EMPTY: SheetCell = { value: null, isDate: false };

// ---------------------------------------------------------------------------
// ZIP
// ---------------------------------------------------------------------------

interface ZipEntry {
  name: string;
  method: number;
  offset: number;
  compressedSize: number;
}

/**
 * Read the ZIP central directory. The central directory is authoritative for
 * sizes (a local header may defer them to a trailing data descriptor), so entry
 * data is located from the local header but sized from here.
 */
function readZip(buf: Buffer): Map<string, ZipEntry> {
  const EOCD_SIG = 0x06054b50;
  // The end-of-central-directory record sits in the last 22 bytes unless the
  // archive carries a comment, so scan backwards over the comment's max length.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i >= buf.length - 22 - 0xffff; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a valid .xlsx file (no ZIP end record).');

  const count = buf.readUInt16LE(eocd + 10);
  let ptr = buf.readUInt32LE(eocd + 16);
  const entries = new Map<string, ZipEntry>();

  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(ptr) !== 0x02014b50) break;
    const method = buf.readUInt16LE(ptr + 10);
    const compressedSize = buf.readUInt32LE(ptr + 20);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const offset = buf.readUInt32LE(ptr + 42);
    const name = buf.toString('utf8', ptr + 46, ptr + 46 + nameLen);
    entries.set(name, { name, method, offset, compressedSize });
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function readEntry(buf: Buffer, entry: ZipEntry): string {
  if (buf.readUInt32LE(entry.offset) !== 0x04034b50) {
    throw new Error(`Corrupt .xlsx entry: ${entry.name}`);
  }
  const nameLen = buf.readUInt16LE(entry.offset + 26);
  const extraLen = buf.readUInt16LE(entry.offset + 28);
  const start = entry.offset + 30 + nameLen + extraLen;
  const raw = buf.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return raw.toString('utf8');
  if (entry.method === 8) return inflateRawSync(raw).toString('utf8');
  throw new Error(`Unsupported compression in .xlsx (method ${entry.method}).`);
}

// ---------------------------------------------------------------------------
// XML
// ---------------------------------------------------------------------------

const XML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function unescapeXml(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (whole, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
    }
    return XML_ENTITIES[code] ?? whole;
  });
}

/** Concatenate every <t> run inside a chunk — a shared string may be split. */
function textRuns(xml: string): string {
  const out: string[] = [];
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(unescapeXml(m[1] ?? ''));
  return out.join('');
}

function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? unescapeXml(m[1]) : undefined;
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

// Excel's built-in date/time number formats.
const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

function isDateFormatCode(code: string): boolean {
  // Strip quoted literals and colour/condition blocks before looking for date
  // tokens, so a format like "0.00\" m\"" is not mistaken for minutes.
  const bare = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '');
  return /[dmyhs]/i.test(bare) && !/^[^dmyhs]*$/i.test(bare);
}

/**
 * Excel serial → ISO date. Serial 1 is 1900-01-01, and serials above 59 carry
 * Excel's deliberate 1900-leap-year bug, which the 1899-12-30 epoch absorbs.
 */
function serialToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2_958_465) return null;
  const days = Math.floor(serial);
  const ms = Date.UTC(1899, 11, 30) + days * 86_400_000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** numFmtId per style index, from styles.xml. */
function readDateStyles(xml: string): Set<number> {
  const dateFormatIds = new Set<number>(BUILTIN_DATE_FORMATS);
  const numFmtRe = /<numFmt\b[^>]*\/>/g;
  let m: RegExpExecArray | null;
  while ((m = numFmtRe.exec(xml))) {
    const id = Number(attr(m[0], 'numFmtId'));
    const code = attr(m[0], 'formatCode') ?? '';
    if (Number.isFinite(id) && isDateFormatCode(code)) dateFormatIds.add(id);
  }

  const dateStyleIndexes = new Set<number>();
  const cellXfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml)?.[1] ?? '';
  const xfRe = /<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g;
  let index = 0;
  while ((m = xfRe.exec(cellXfs))) {
    const id = Number(attr(m[0], 'numFmtId') ?? '0');
    if (dateFormatIds.has(id)) dateStyleIndexes.add(index);
    index++;
  }
  return dateStyleIndexes;
}

// ---------------------------------------------------------------------------
// Worksheet
// ---------------------------------------------------------------------------

/** "BC12" → 54 (0-based column index). */
function columnIndex(ref: string): number {
  const letters = /^([A-Z]+)/.exec(ref)?.[1] ?? '';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return Math.max(0, n - 1);
}

function parseSheet(
  xml: string,
  shared: string[],
  dateStyles: Set<number>,
): SheetCell[][] {
  const rows: SheetCell[][] = [];
  let width = 0;

  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>|<row\b[^>]*\/>/g;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRe.exec(xml))) {
    const cells: SheetCell[] = [];
    const body = rowMatch[1] ?? '';
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRe.exec(body))) {
      const tag = `<c${cellMatch[1]}>`;
      const inner = cellMatch[2] ?? '';
      const ref = attr(tag, 'r');
      const at = ref ? columnIndex(ref) : cells.length;
      while (cells.length < at) cells.push(EMPTY);
      cells[at] = parseCell(tag, inner, shared, dateStyles);
    }
    width = Math.max(width, cells.length);
    rows.push(cells);
  }

  for (const row of rows) while (row.length < width) row.push(EMPTY);
  return rows;
}

function parseCell(
  tag: string,
  inner: string,
  shared: string[],
  dateStyles: Set<number>,
): SheetCell {
  const type = attr(tag, 't') ?? 'n';
  const styleIndex = Number(attr(tag, 's') ?? '-1');
  const formula = /<f(?:\s[^>]*)?>([\s\S]*?)<\/f>/.exec(inner)?.[1];
  const rawValue = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(inner)?.[1];
  const value = rawValue === undefined ? undefined : unescapeXml(rawValue);
  const cell: SheetCell = { value: null, isDate: false };
  if (formula !== undefined) cell.formula = unescapeXml(formula);

  switch (type) {
    case 's': {
      const i = Number(value);
      cell.value = Number.isInteger(i) ? shared[i] ?? '' : '';
      break;
    }
    case 'inlineStr':
      cell.value = textRuns(inner);
      break;
    case 'str':
      cell.value = value ?? '';
      break;
    case 'b':
      cell.value = value === '1';
      break;
    case 'e':
      // An error cell (#REF!, #VALUE!) has no usable value — keep the code so
      // the caller can tell the difference between "empty" and "broken".
      cell.error = value ?? '#ERROR!';
      cell.value = null;
      break;
    default: {
      if (value === undefined || value === '') break;
      const n = Number(value);
      if (!Number.isFinite(n)) {
        cell.value = value;
        break;
      }
      if (dateStyles.has(styleIndex)) {
        const iso = serialToIso(n);
        if (iso) {
          cell.value = iso;
          cell.isDate = true;
          break;
        }
      }
      cell.value = n;
    }
  }
  return cell;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/** Read the first worksheet of an .xlsx file. */
export function readXlsx(bytes: Buffer | Uint8Array): Worksheet {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const zip = readZip(buf);

  const read = (name: string): string | null => {
    const entry = zip.get(name);
    return entry ? readEntry(buf, entry) : null;
  };

  const workbook = read('xl/workbook.xml');
  if (!workbook) {
    throw new Error('That file is not an .xlsx workbook (xl/workbook.xml is missing).');
  }

  // The first <sheet> in the workbook is the first tab an admin sees; its
  // r:id maps to a part name through the workbook relationships.
  const sheetTag = /<sheet\b[^>]*\/>/.exec(workbook)?.[0] ?? '';
  const sheetName = attr(sheetTag, 'name') ?? 'Sheet1';
  const relId = attr(sheetTag, 'r:id');

  let target: string | null = null;
  const rels = read('xl/_rels/workbook.xml.rels');
  if (rels && relId) {
    const relRe = /<Relationship\b[^>]*\/>/g;
    let m: RegExpExecArray | null;
    while ((m = relRe.exec(rels))) {
      if (attr(m[0], 'Id') === relId) {
        const t = attr(m[0], 'Target') ?? '';
        target = t.startsWith('/') ? t.slice(1) : `xl/${t.replace(/^\.\//, '')}`;
        break;
      }
    }
  }

  const sheetXml =
    (target ? read(target) : null) ??
    read('xl/worksheets/sheet1.xml') ??
    // Some producers name the part differently; fall back to the first one.
    (() => {
      for (const name of zip.keys()) {
        if (name.startsWith('xl/worksheets/') && name.endsWith('.xml')) return read(name);
      }
      return null;
    })();

  if (!sheetXml) throw new Error('The workbook has no readable worksheet.');

  const sharedXml = read('xl/sharedStrings.xml');
  const shared: string[] = [];
  if (sharedXml) {
    const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g;
    let m: RegExpExecArray | null;
    while ((m = siRe.exec(sharedXml))) shared.push(textRuns(m[1] ?? ''));
  }

  const stylesXml = read('xl/styles.xml');
  const dateStyles = stylesXml ? readDateStyles(stylesXml) : new Set<number>();

  return { name: sheetName, rows: parseSheet(sheetXml, shared, dateStyles) };
}
