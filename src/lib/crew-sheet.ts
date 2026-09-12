/**
 * Turning a production's crew sheet into contract data.
 *
 * A crew sheet is written by a line producer for other humans, not for an
 * importer: names are spelled the way someone remembers them, amounts carry
 * thousands separators, and the date column is whatever Excel made of what was
 * typed. The two jobs here are to read that as faithfully as possible, and to
 * be honest about every place where the sheet does not say enough — an admin
 * can answer "which Mohamed?" in seconds, but only if asked.
 *
 * Nothing in this file touches the database. It runs identically on the server
 * (parsing an uploaded workbook) and in the browser (matching the parsed rows
 * against the crew list already loaded in the dashboard).
 */

export type IssueLevel = 'error' | 'warn' | 'info';

export type IssueCode =
  | 'no-name'
  | 'no-amount'
  | 'bad-amount'
  | 'no-dates'
  | 'bad-date'
  | 'ambiguous-date'
  | 'date-fixed-by-days'
  | 'end-before-start'
  | 'days-mismatch'
  | 'no-days';

export interface SheetIssue {
  code: IssueCode;
  level: IssueLevel;
  message: string;
}

/** One crew member as the sheet describes them. */
export interface SheetRow {
  /** 1-based row number in the sheet, so an admin can find it again. */
  line: number;
  name: string;
  role: string;
  /** AED, for contract R. Null when the sheet's amount could not be read. */
  amount: number | null;
  amountRaw: string;
  /** ISO yyyy-mm-dd. */
  dateFrom: string | null;
  dateTo: string | null;
  dateFromRaw: string;
  dateToRaw: string;
  /** Day count as written in the sheet, when it is a number. */
  days: number | null;
  daysRaw: string;
  issues: SheetIssue[];
}

export interface ParsedSheet {
  sheetName: string;
  /** 1-based row number of the header row that was used. */
  headerLine: number;
  columns: Partial<Record<ColumnKey, number>>;
  rows: SheetRow[];
}

export type ColumnKey = 'name' | 'role' | 'amount' | 'dateFrom' | 'dateTo' | 'days';

/** One cell of a worksheet or a delimited file, as read. */
export type GridCell = string | number | boolean | null;

// ---------------------------------------------------------------------------
// Header detection
// ---------------------------------------------------------------------------

// Matched against the header cell, lowercased and stripped of punctuation.
// "NUUM DAYS" is in there on purpose: the header is whatever the producer typed.
const HEADER_PATTERNS: Array<[ColumnKey, RegExp]> = [
  ['name', /^(crew\s*)?(full\s*)?name$|^crew$/],
  ['role', /^(role|position|job|title|department)$/],
  ['amount', /amount|fee|rate|total|salary|aed|cost/],
  ['dateFrom', /^(start|from|begin)/],
  ['dateTo', /^(end|to|finish|until)/],
  ['days', /day/],
];

function headerKey(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function matchColumns(row: GridCell[]): Partial<Record<ColumnKey, number>> {
  const columns: Partial<Record<ColumnKey, number>> = {};
  row.forEach((cell, index) => {
    const key = headerKey(String(cell ?? ''));
    if (!key) return;
    for (const [column, pattern] of HEADER_PATTERNS) {
      if (columns[column] === undefined && pattern.test(key)) {
        columns[column] = index;
        return;
      }
    }
  });
  return columns;
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

/**
 * Read an amount written for a human: "40,000 ", "AED 12 000", "12000.50".
 * A non-breaking space is common when the cell was pasted from another sheet.
 */
export function parseAmount(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const text = String(raw ?? '')
    .replace(/[\s  ]/g, '')
    .replace(/aed|dhs?|درهم/gi, '')
    .replace(/,/g, '');
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const SLASHED_DATE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/;

function iso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Every date the sheet could mean, best guess first.
 *
 * The sheet in hand mixes both readings of the same column: some cells are
 * text Excel never touched ("18/09/2026" — unambiguously day/month), while
 * others were swallowed as US month/day and stored as real dates. So a cell is
 * not read as one date but as its candidates, and the day count decides which
 * one was meant (see `resolveDates`). Day/month leads, because that is what the
 * unambiguous cells in this sheet use.
 */
export function dateCandidates(raw: unknown): string[] {
  if (raw instanceof Date) {
    return withSwap(raw.getUTCFullYear(), raw.getUTCMonth() + 1, raw.getUTCDate());
  }
  const text = String(raw ?? '').trim();
  if (!text) return [];

  const isoMatch = ISO_DATE.exec(text);
  if (isoMatch) {
    // An ISO cell reached us because Excel already resolved it to a real date;
    // that resolution is exactly the one that may have swapped day and month.
    return withSwap(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  const slashed = SLASHED_DATE.exec(text);
  if (slashed) {
    const first = Number(slashed[1]);
    const second = Number(slashed[2]);
    let year = Number(slashed[3]);
    if (year < 100) year += year < 70 ? 2000 : 1900;
    // Written as text, so nobody's locale has reinterpreted it: day/month.
    return withSwap(year, second, first);
  }

  const parsed = Date.parse(text);
  if (Number.isFinite(parsed)) {
    const d = new Date(parsed);
    return [d.toISOString().slice(0, 10)];
  }
  return [];
}

function withSwap(year: number, month: number, day: number): string[] {
  const primary = iso(year, month, day);
  const swapped = iso(year, day, month);
  const out: string[] = [];
  if (primary) out.push(primary);
  if (swapped && swapped !== primary) out.push(swapped);
  return out;
}

/** Inclusive day count between two ISO dates, the way a call sheet counts. */
export function inclusiveDays(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}

interface ResolvedDates {
  from: string | null;
  to: string | null;
  issues: SheetIssue[];
}

/**
 * Pick one reading of the start and end dates.
 *
 * When the stated day count singles out exactly one combination, that is the
 * answer and the swap is reported as fixed. Otherwise the leading candidate is
 * used and the row is flagged — a wrong month on a contract is worth a
 * question, and the admin has the call sheet.
 */
export function resolveDates(
  fromRaw: unknown,
  toRaw: unknown,
  days: number | null,
): ResolvedDates {
  const fromOptions = dateCandidates(fromRaw);
  const toOptions = dateCandidates(toRaw);
  const issues: SheetIssue[] = [];

  const fromText = String(fromRaw ?? '').trim();
  const toText = String(toRaw ?? '').trim();
  if (fromText && !fromOptions.length) {
    issues.push({ code: 'bad-date', level: 'error', message: `Start date “${fromText}” is not a date.` });
  }
  if (toText && !toOptions.length) {
    issues.push({ code: 'bad-date', level: 'error', message: `End date “${toText}” is not a date.` });
  }
  if (!fromOptions.length || !toOptions.length) {
    if (!fromText && !toText) {
      issues.push({ code: 'no-dates', level: 'error', message: 'No start or end date in the sheet.' });
    }
    return { from: fromOptions[0] ?? null, to: toOptions[0] ?? null, issues };
  }

  // A reading that ends before it starts is never what was meant, so it only
  // survives if every reading is backwards.
  const pairs = combinations(fromOptions, toOptions);
  const forward = pairs.filter(([from, to]) => from <= to);
  const usable = forward.length ? forward : pairs;

  let [from, to] = usable[0];
  let decided = usable.length === 1;

  if (days && days > 0) {
    // Rank by how far each reading is from the stated day count. With day/month
    // and month/day cells mixed in one column, this is what tells them apart —
    // and when nothing lands exactly, the nearest reading is still a far better
    // default than whichever one Excel happened to store.
    const ranked = [...usable].sort(
      (a, b) =>
        Math.abs(inclusiveDays(a[0], a[1]) - days) - Math.abs(inclusiveDays(b[0], b[1]) - days),
    );
    const exact = usable.filter(([f, t]) => inclusiveDays(f, t) === days);

    if (exact.length === 1) {
      const swapped = exact[0][0] !== from || exact[0][1] !== to;
      [from, to] = exact[0];
      if (!decided && swapped) {
        issues.push({
          code: 'date-fixed-by-days',
          level: 'info',
          message:
            `Excel had read this row's dates as month/day. Using ${uk(from)} → ${uk(to)}, ` +
            `the only reading that matches the sheet's ${days} days.`,
        });
      }
      decided = true;
    } else {
      [from, to] = exact.length ? exact[0] : ranked[0];
      issues.push({
        code: 'days-mismatch',
        level: 'warn',
        message:
          `The sheet says ${days} days, but ${uk(from)} → ${uk(to)} is ` +
          `${inclusiveDays(from, to)}. Confirm the dates or the day count.`,
      });
    }
  } else if (!decided) {
    issues.push({
      code: 'no-days',
      level: 'warn',
      message: 'No day count in the sheet, so the dates could not be cross-checked.',
    });
  }

  if (!decided) {
    const alternatives = usable
      .filter(([f, t]) => f !== from || t !== to)
      .map(([f, t]) => `${uk(f)} → ${uk(t)}`);
    issues.push({
      code: 'ambiguous-date',
      level: 'warn',
      message:
        `Day and month could be either way round here. Reading it as ${uk(from)} → ${uk(to)}` +
        (alternatives.length ? ` rather than ${alternatives.join(' or ')}.` : '.'),
    });
  }

  if (from > to) {
    issues.push({
      code: 'end-before-start',
      level: 'error',
      message: `End date ${uk(to)} is before the start date ${uk(from)}.`,
    });
  }
  return { from, to, issues };
}

function combinations(from: string[], to: string[]): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const f of from) for (const t of to) out.push([f, t]);
  return out;
}

/** ISO → dd/mm/yyyy, the way dates are written on a UAE call sheet. */
export function uk(isoDate: string): string {
  const m = ISO_DATE.exec(isoDate);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : isoDate;
}

// ---------------------------------------------------------------------------
// Grid → rows
// ---------------------------------------------------------------------------

/**
 * Read a crew sheet out of a plain grid of values.
 *
 * The header row is found rather than assumed: crew sheets routinely carry a
 * production name or a blank line above the real headings.
 */
export function parseCrewSheet(grid: GridCell[][], sheetName = 'Sheet1'): ParsedSheet {
  let headerIndex = -1;
  let columns: Partial<Record<ColumnKey, number>> = {};

  for (let i = 0; i < Math.min(grid.length, 25); i++) {
    const found = matchColumns(grid[i]);
    if (found.name !== undefined && (found.amount !== undefined || found.role !== undefined)) {
      headerIndex = i;
      columns = found;
      break;
    }
  }

  if (headerIndex < 0) {
    throw new Error(
      'Could not find the header row. The sheet needs a row of column titles including ' +
        'a NAME column and an AMOUNT (or ROLE) column.',
    );
  }

  const rows: SheetRow[] = [];
  for (let i = headerIndex + 1; i < grid.length; i++) {
    const cells = grid[i];
    const at = (key: ColumnKey): GridCell => {
      const index = columns[key];
      return index === undefined ? null : cells[index] ?? null;
    };

    const name = String(at('name') ?? '').replace(/\s+/g, ' ').trim();
    const amountRaw = String(at('amount') ?? '').trim();
    const dateFromRaw = String(at('dateFrom') ?? '').trim();
    const dateToRaw = String(at('dateTo') ?? '').trim();
    const daysRaw = String(at('days') ?? '').trim();

    // A blank line in the middle of a sheet is a spacer, not a crew member.
    if (!name && !amountRaw && !dateFromRaw && !dateToRaw) continue;

    const issues: SheetIssue[] = [];
    if (!name) {
      issues.push({ code: 'no-name', level: 'error', message: 'This row has no name.' });
    }

    const amount = parseAmount(at('amount'));
    if (amount === null) {
      issues.push(
        amountRaw
          ? { code: 'bad-amount', level: 'error', message: `Amount “${amountRaw}” is not a number.` }
          : { code: 'no-amount', level: 'error', message: 'No amount in the sheet.' },
      );
    }

    const days = parseAmount(at('days'));
    const dates = resolveDates(at('dateFrom'), at('dateTo'), days);
    issues.push(...dates.issues);

    rows.push({
      line: i + 1,
      name,
      role: String(at('role') ?? '').replace(/\s+/g, ' ').trim(),
      amount,
      amountRaw,
      dateFrom: dates.from,
      dateTo: dates.to,
      dateFromRaw,
      dateToRaw,
      days: days !== null && Number.isInteger(days) ? days : null,
      daysRaw,
      issues,
    });
  }

  return { sheetName, headerLine: headerIndex + 1, columns, rows };
}

// ---------------------------------------------------------------------------
// Matching sheet names to crew records
// ---------------------------------------------------------------------------

/**
 * Fold a name to something comparable: lowercase, no diacritics, no Arabic
 * vowel marks, no punctuation. "ABD ULNASER ALSHIKH " and "Abdulnaser
 * Al-Shikh" still differ afterwards — that is what token matching is for.
 */
export function normalizeName(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ًͯ-ْ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9؀-ۿ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Transliteration noise that carries no identity: the same person is written
// with or without these, so they are dropped before comparing tokens.
const NAME_NOISE = new Set(['al', 'el', 'bin', 'ben', 'ibn', 'abu', 'abou', 'abd', 'ul', 'la', 'de']);

function nameTokens(raw: string): string[] {
  return normalizeName(raw)
    .split(' ')
    .filter((t) => t && !NAME_NOISE.has(t));
}

export type MatchConfidence = 'exact' | 'likely' | 'weak' | 'none';

export interface NameCandidate<T> {
  record: T;
  confidence: MatchConfidence;
  score: number;
}

/** Dice coefficient over character bigrams — 1 is identical, 0 shares nothing. */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const bigrams = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const g = a.slice(i, i + 2);
    bigrams.set(g, (bigrams.get(g) ?? 0) + 1);
  }
  let shared = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const g = b.slice(i, i + 2);
    const left = bigrams.get(g) ?? 0;
    if (left > 0) {
      bigrams.set(g, left - 1);
      shared++;
    }
  }
  return (2 * shared) / (a.length - 1 + (b.length - 1));
}

/** Below this two tokens are different names, not two spellings of one. */
const TOKEN_MATCH = 0.55;

/**
 * Rank crew records against a name from the sheet.
 *
 * Returns candidates rather than a decision. Names reach a crew sheet by ear:
 * Mohamed and Mohammed, "ABD ULNASER ALSHIKH" for a record that reads
 * "Abdulnaser Al-Shikh", two people called Shihan on one unit. So tokens are
 * compared by similarity rather than equality, the whole name is compared with
 * its spaces removed (which is what catches a first name split in two), and the
 * result is a ranking — the admin confirms who is who.
 */
export function rankNames<T>(
  sheetName: string,
  records: T[],
  nameOf: (record: T) => string,
): Array<NameCandidate<T>> {
  const target = normalizeName(sheetName);
  const targetTokens = nameTokens(sheetName);
  if (!target) return [];

  const scored = records.map((record) => {
    const other = normalizeName(nameOf(record));
    const otherTokens = nameTokens(nameOf(record));

    let score = 0;
    if (other === target) score = 1;
    else {
      // Each token counts for how well its best partner matches, over the
      // longer of the two names — so extra middle names cost, but do not sink.
      const used = new Set<number>();
      let earned = 0;
      for (const token of targetTokens) {
        let bestScore = 0;
        let bestIndex = -1;
        otherTokens.forEach((candidate, index) => {
          if (used.has(index)) return;
          const s = similarity(token, candidate);
          if (s > bestScore) {
            bestScore = s;
            bestIndex = index;
          }
        });
        if (bestScore >= TOKEN_MATCH && bestIndex >= 0) {
          used.add(bestIndex);
          earned += bestScore;
        }
      }
      const most = Math.max(targetTokens.length, otherTokens.length) || 1;
      const byToken = earned / most;

      // "ABD ULNASER" and "Abdulnaser" are the same name split differently, so
      // also compare the names as one run of letters. Only a near-identical run
      // counts: at lower similarities this measure rewards a shared first name
      // far too generously ("Mohamed Geamaa" against "Mohamed Gad"). Kept just
      // below a true token match so an exact record still outranks this one.
      const whole = similarity(target.replace(/\s/g, ''), other.replace(/\s/g, ''));
      const byWhole = whole >= 0.85 ? whole * 0.97 : 0;

      score = Math.max(byToken, byWhole);
      // One shared name out of several is a coincidence on a 25-person unit —
      // enough to offer in the list, never enough to pre-select.
      if (used.size === 1 && most > 1 && byToken >= byWhole) score = Math.min(score, 0.5);
    }

    const confidence: MatchConfidence =
      score >= 0.99 ? 'exact' : score >= 0.6 ? 'likely' : score >= 0.3 ? 'weak' : 'none';
    return { record, confidence, score };
  });

  return scored.filter((c) => c.confidence !== 'none').sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// CSV / TSV
// ---------------------------------------------------------------------------

/**
 * Read delimited text into the same grid shape as a worksheet, so a producer
 * who exports "CSV" instead of "Excel" is not turned away. Quoted fields,
 * doubled quotes and newlines inside quotes are handled; the delimiter is taken
 * from whichever of comma/semicolon/tab appears most in the first line.
 */
export function parseDelimited(text: string): GridCell[][] {
  const body = text.replace(/^﻿/, '');
  const firstLine = body.slice(0, body.indexOf('\n') + 1 || undefined);
  const delimiter = ([',', ';', '\t'] as const)
    .map((d) => ({ d, n: firstLine.split(d).length }))
    .sort((a, b) => b.n - a.n)[0].d;

  const rows: GridCell[][] = [];
  let row: GridCell[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quoted) {
      if (ch === '"') {
        if (body[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
