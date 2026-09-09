import 'server-only';

// Bilingual contract PDF generation with pdf-lib — English (left column) and
// Arabic (right column) split by a vertical divider, on a single A4 page.
//
// English uses a standard font. Arabic uses the embedded Amiri font (covers
// Arabic + Latin) and contextual shaping via `arabic-reshaper` (pdf-lib does no
// bidi), with a run-based visual reorder. This is good for a working bilingual
// doc; embedded Latin identifiers in the Arabic column can still order
// imperfectly — for pixel-exact legal Arabic, use a Docuseal Arabic template.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib';
import type { ContractPlaceholders, ContractType, CrewMember } from './types';
import { CONTRACT_TEMPLATES } from './contract-templates';

const AMBER = rgb(0.91, 0.69, 0.29);
const INK = rgb(0.1, 0.1, 0.11);
const GREY = rgb(0.35, 0.35, 0.4);

// Over Exposure Productions mark, drawn to match src/components/BrandMark.tsx.
const BRAND_BLACK = rgb(0.043, 0.043, 0.051);
const BRAND_WHITE = rgb(0.965, 0.961, 0.949);
const BRAND_MAROON = rgb(0.557, 0.122, 0.247);

/**
 * Draw the OEP logo centred with its top at `topY`. If `public/oep-logo.png`
 * exists it is embedded verbatim; otherwise the mark is drawn as vectors (black
 * squircle-ish badge, white field, two-tone maroon-over-black X). Returns the
 * y-coordinate of the bottom of the logo so the caller can continue below it.
 */
async function drawBrandLogo(
  pdf: PDFDocument,
  page: PDFPage,
  centerX: number,
  topY: number,
): Promise<number> {
  const B = 46; // badge size in points
  try {
    const bytes = await readFile(path.join(process.cwd(), 'public', 'oep-logo.png'));
    const img = await pdf.embedPng(bytes);
    const dims = img.scaleToFit(B, B);
    page.drawImage(img, {
      x: centerX - dims.width / 2,
      y: topY - dims.height,
      width: dims.width,
      height: dims.height,
    });
    return topY - dims.height;
  } catch {
    // No PNG on disk — draw the vector mark instead.
  }

  const x = centerX - B / 2;
  const y = topY - B;
  page.drawRectangle({ x, y, width: B, height: B, color: BRAND_BLACK });

  const inset = B * 0.2;
  const fx = x + inset;
  const fy = y + inset;
  const fs = B - inset * 2;
  page.drawRectangle({ x: fx, y: fy, width: fs, height: fs, color: BRAND_WHITE });

  const p1 = { x: fx, y: fy };
  const p2 = { x: fx + fs, y: fy + fs };
  const p3 = { x: fx + fs, y: fy };
  const p4 = { x: fx, y: fy + fs };
  page.drawLine({ start: p1, end: p2, thickness: B * 0.13, color: BRAND_BLACK });
  page.drawLine({ start: p3, end: p4, thickness: B * 0.13, color: BRAND_BLACK });
  page.drawLine({ start: p1, end: p2, thickness: B * 0.115, color: BRAND_MAROON });
  page.drawLine({ start: p3, end: p4, thickness: B * 0.115, color: BRAND_MAROON });
  return y;
}

export function formatAed(n?: number): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-AE').format(n);
}

/** Build the full placeholder set for a crew member + a given contract type. */
export function buildPlaceholders(
  crew: CrewMember,
  type: ContractType,
  projectName: string,
): ContractPlaceholders {
  const c = crew.contract;
  const amount = type === 'X' ? c.amountX : c.amountY;
  return {
    CREW_NAME: `${crew.personal.firstName} ${crew.personal.lastName}`.trim(),
    ROLE: c.role ?? '—',
    AMOUNT_X: formatAed(c.amountX),
    AMOUNT_Y: formatAed(c.amountY),
    AMOUNT: formatAed(amount),
    DATE_FROM: c.dateFrom ?? '—',
    DATE_TO: c.dateTo ?? '—',
    IBAN: c.iban ?? crew.documents.emiratesId ?? '—',
    PROJECT_NAME: projectName,
    EMIRATES_ID: formatEmiratesId(crew.documents.emiratesId),
    PASSPORT: crew.documents.passport ?? '—',
    NATIONALITY: crew.personal.nationality ?? '—',
    TODAY: new Date().toLocaleDateString('en-GB'),
  };
}

function formatEmiratesId(digits?: string): string {
  if (!digits || digits.length !== 15) return digits ?? '—';
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 14)}-${digits.slice(14)}`;
}

export function fillPlaceholders(text: string, p: ContractPlaceholders): string {
  return text.replace(/\{([A-Z_]+)\}/g, (_, key: string) => {
    const value = (p as unknown as Record<string, string>)[key];
    return value ?? `{${key}}`;
  });
}

// --- Arabic shaping (optional) --------------------------------------------

let reshaper: ((s: string) => string) | null | undefined;

async function getReshaper(): Promise<((s: string) => string) | null> {
  if (reshaper !== undefined) return reshaper;
  try {
    // Optional dependency; only needed for Arabic PDFs. arabic-reshaper exposes
    // its shaper as `convertArabic`; older/other builds may use `reshape`.
    const mod: any = await import('arabic-reshaper');
    const d = mod.default ?? {};
    const fn =
      mod.convertArabic ??
      mod.reshape ??
      d.convertArabic ??
      d.reshape ??
      (typeof d === 'function' ? d : undefined) ??
      (typeof mod === 'function' ? mod : undefined);
    reshaper = typeof fn === 'function' ? fn : null;
  } catch {
    reshaper = null;
  }
  return reshaper ?? null;
}

const NBSP = String.fromCharCode(160);

/**
 * Keep Latin/number words from breaking across lines in the RTL column by
 * joining intra-Latin spaces with NBSP (the wrapper splits on plain spaces).
 */
const protectLatinRuns = (s: string): string =>
  s.replace(/([A-Za-z0-9])[ ]+(?=[A-Za-z0-9])/g, `$1${NBSP}`);

const isArabicChar = (ch: string): boolean => {
  const c = ch.codePointAt(0) ?? 0;
  return (
    (c >= 0x0600 && c <= 0x06ff) ||
    (c >= 0x0750 && c <= 0x077f) ||
    (c >= 0x08a0 && c <= 0x08ff) ||
    (c >= 0xfb50 && c <= 0xfdff) ||
    (c >= 0xfe70 && c <= 0xfeff)
  );
};

// A strong right-to-left glyph: an Arabic *letter*, excluding Arabic-Indic
// digits (٠-٩) and Arabic punctuation (، ؛ ؟ ۔), which are weak/neutral for bidi.
const isArabicLetter = (ch: string): boolean => {
  const c = ch.codePointAt(0) ?? 0;
  if ((c >= 0x0660 && c <= 0x066d) || (c >= 0x06f0 && c <= 0x06f9)) return false; // digits + separators
  if (c === 0x060c || c === 0x061b || c === 0x061f || c === 0x06d4) return false; // ، ؛ ؟ ۔
  return isArabicChar(ch);
};

/**
 * Does this token's FIRST strong-directional character make it read
 * right-to-left? Leading neutrals (opening quote/bracket, digits, punctuation)
 * are skipped; the first Latin letter means LTR, the first Arabic letter means
 * RTL. A token with no strong letter at all (a bare number/date) is treated as
 * non-RTL so it gets glued and never leads a line.
 */
const startsRtl = (tok: string): boolean => {
  for (const ch of tok) {
    const c = ch.codePointAt(0) ?? 0;
    if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) return false; // Latin letter
    if (isArabicLetter(ch)) return true;
  }
  return false;
};

/**
 * Split an RTL paragraph into wrap tokens, gluing every token that does NOT
 * begin with a strong RTL letter (numbers, dates, IDs, IBAN, amounts, and Latin
 * words/names — including ones that merely carry a trailing Arabic comma like
 * "N1234567،") to a neighbouring Arabic word with a non-breaking space. This
 * guarantees no wrapped display line can BEGIN with a Latin/number run — which
 * matters because PDF viewers infer a line's base direction from its first
 * strong character, and a line led by Latin/digits flips to LTR base and renders
 * the whole line (Arabic included) reversed — the "point 3 / الأجر" bug. NBSP is
 * used so the glue survives the plain-space splitting in the wrapper.
 */
function bindRtlTokens(text: string): string[] {
  const raw = text.split(/[ \t]+/).filter(Boolean);
  const out: string[] = [];
  for (const tok of raw) {
    if (!startsRtl(tok) && out.length) {
      out[out.length - 1] = `${out[out.length - 1]}${NBSP}${tok}`;
    } else {
      out.push(tok);
    }
  }
  // If the paragraph opens with non-RTL tokens (no previous word to glue to),
  // merge them forward onto the first RTL word so nothing non-RTL ever leads.
  while (out.length > 1 && !startsRtl(out[0])) {
    out[1] = `${out[0]}${NBSP}${out[1]}`;
    out.splice(0, 1);
  }
  return out;
}

const isSpaceChar = (ch: string): boolean =>
  ch === ' ' || ch === '\t' || ch === NBSP;

/**
 * Shape one display line for pdf-lib, which draws glyphs strictly left-to-right.
 * convertArabic only reshapes to contextual/presentation forms — it keeps
 * LOGICAL order and does no reordering. The PDF viewer supplies the bidi at
 * render time: it reverses each embedded left-to-right run (numbers and Latin —
 * name, IBAN, dates, IDs) inside the RTL flow. To cancel that, we pre-reverse
 * each such run here so it reads correctly on screen.
 *
 * Spaces are classified by their neighbours:
 *   • a space BETWEEN two Latin/number runs stays part of that run and is
 *     reversed with it, so a multi-word value keeps its word order (viewer
 *     reverses the whole run back — "B.L. 1433/26", "Ravi Kumar" stay intact);
 *   • a space at an Arabic↔Latin boundary is kept in place as a neutral, so the
 *     gap between an Arabic word and an adjacent value doesn't hop to the wrong
 *     side (e.g. "سفرN1234567 ،" instead of "سفر N1234567،").
 *
 * The caller guarantees each line begins with a strong RTL letter so its base
 * direction stays RTL; a line led by a Latin/number run would otherwise flip and
 * reverse wholesale. Verified with PyMuPDF renders.
 */
function shapeArabicLine(line: string, reshape: (s: string) => string): string {
  const reshaped = reshape(line);
  type Kind = 'ar' | 'sp' | 'ltr';
  const kindOf = (ch: string): Kind =>
    isArabicChar(ch) ? 'ar' : isSpaceChar(ch) ? 'sp' : 'ltr';
  const runs: Array<{ kind: Kind; text: string }> = [];
  for (const ch of Array.from(reshaped)) {
    const kind = kindOf(ch);
    const last = runs[runs.length - 1];
    if (last && last.kind === kind) last.text += ch;
    else runs.push({ kind, text: ch });
  }
  // A space flanked by Latin/number runs on BOTH sides belongs to that run
  // (keeps multi-word values in order); re-tag it 'ltr' and coalesce.
  for (let i = 1; i < runs.length - 1; i++) {
    if (runs[i].kind === 'sp' && runs[i - 1].kind === 'ltr' && runs[i + 1].kind === 'ltr') {
      runs[i].kind = 'ltr';
    }
  }
  const merged: typeof runs = [];
  for (const r of runs) {
    const last = merged[merged.length - 1];
    if (last && last.kind === r.kind) last.text += r.text;
    else merged.push({ ...r });
  }
  return merged
    .map((r) => (r.kind === 'ltr' ? Array.from(r.text).reverse().join('') : r.text))
    .join('');
}

async function embedArabicFont(pdf: PDFDocument): Promise<PDFFont> {
  const fontkit = (await import('@pdf-lib/fontkit')).default;
  pdf.registerFontkit(fontkit);
  // Amiri: a Naskh font that covers Arabic (incl. presentation forms) AND
  // Latin/punctuation, so mixed contract text (crew name, IBAN, dates) renders
  // without missing-glyph crashes.
  const fontPath = path.join(process.cwd(), 'src', 'assets', 'fonts', 'Amiri-Regular.ttf');
  let bytes: Buffer;
  try {
    bytes = await readFile(fontPath);
  } catch {
    throw new Error(
      `Arabic contract font not found at ${fontPath}. Add Amiri-Regular.ttf ` +
        '(Google Fonts, OFL) into src/assets/fonts/, or generate Arabic ' +
        'contracts via a Docuseal template instead.',
    );
  }
  // subset:false — subsetting Amiri drops most Arabic glyphs (renders near-blank),
  // so embed the full font. ~450KB per Arabic PDF, which is fine.
  return pdf.embedFont(bytes, { subset: false });
}

// --- Layout ----------------------------------------------------------------

const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 42;
const GUTTER = 18; // gap between the two language columns
const DIVIDER = rgb(0.8, 0.8, 0.82);

export interface GenerateOptions {
  // `type` only affects which AMOUNT the placeholders already carry; the PDF
  // itself is always bilingual (English | Arabic), so no language is passed.
  placeholders: ContractPlaceholders;
}

/**
 * Render ONE bilingual contract page: English in the left column, Arabic in the
 * right column, split by a vertical divider, with signature blocks in both
 * languages. The company stamp is added to the SIGNED copy separately.
 */
export async function generateContractPdf(opts: GenerateOptions): Promise<Uint8Array> {
  const { placeholders } = opts;
  const en = CONTRACT_TEMPLATES.en;
  const ar = CONTRACT_TEMPLATES.ar;

  const pdf = await PDFDocument.create();
  const latin = await pdf.embedFont(StandardFonts.Helvetica);
  const latinBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const arabic = await embedArabicFont(pdf);

  const reshape = await getReshaper();
  if (!reshape) {
    throw new Error(
      'Arabic contracts require the "arabic-reshaper" package. Run: npm install arabic-reshaper.',
    );
  }
  const shapeAr = (s: string): string => shapeArabicLine(s, reshape);

  const page = pdf.addPage([A4.w, A4.h]);
  const centerX = A4.w / 2;
  const leftX0 = MARGIN;
  const leftX1 = centerX - GUTTER / 2;
  const rightX0 = centerX + GUTTER / 2;
  const rightX1 = A4.w - MARGIN;

  // ---- Shared header ----
  page.drawRectangle({ x: 0, y: A4.h - 6, width: A4.w, height: 6, color: AMBER });
  const logoBottom = await drawBrandLogo(pdf, page, centerX, A4.h - 16);
  let headY = logoBottom - 14;

  const wm = 'OVER EXPOSURE PRODUCTIONS';
  page.drawText(wm, {
    x: centerX - latinBold.widthOfTextAtSize(wm, 9) / 2,
    y: headY,
    size: 9,
    font: latinBold,
    color: GREY,
  });
  headY -= 18;

  // Bilingual titles side by side.
  page.drawText(en.title, {
    x: (leftX0 + leftX1) / 2 - latinBold.widthOfTextAtSize(en.title, 12.5) / 2,
    y: headY,
    size: 12.5,
    font: latinBold,
  });
  const arTitle = shapeAr(ar.title);
  page.drawText(arTitle, {
    x: (rightX0 + rightX1) / 2 - arabic.widthOfTextAtSize(arTitle, 12.5) / 2,
    y: headY,
    size: 12.5,
    font: arabic,
  });
  const bodyTop = headY - 20;
  const sigTop = MARGIN + 82; // reserve a bottom band for signatures + stamp

  // ---- One language column ----
  const BODY = 8;
  const HEAD = 9;
  const LH = 1.32;

  const renderColumn = (
    tpl: (typeof CONTRACT_TEMPLATES)['en'],
    x0: number,
    x1: number,
    rtl: boolean,
    font: PDFFont,
    bold: PDFFont,
  ): number => {
    const colW = x1 - x0;
    let y = bodyTop;

    const wrapCol = (text: string, size: number, f: PDFFont): string[] => {
      // Split on plain spaces only (NBSP is preserved so protected Latin runs
      // stay on one line). \s would eat NBSP, so it must not be used here.
      const words = (rtl ? protectLatinRuns(text) : text).split(/[ \t]+/);
      const lines: string[] = [];
      let line = '';
      for (const word of words) {
        const trial = line ? `${line} ${word}` : word;
        const measured = rtl ? shapeAr(trial) : trial;
        if (f.widthOfTextAtSize(measured, size) > colW && line) {
          lines.push(line);
          line = word;
        } else {
          line = trial;
        }
      }
      if (line) lines.push(line);
      return lines;
    };

    const drawColLine = (text: string, size: number, f: PDFFont, color = INK) => {
      const shaped = rtl ? shapeAr(text) : text;
      const w = f.widthOfTextAtSize(shaped, size);
      page.drawText(shaped, { x: rtl ? x1 - w : x0, y, size, font: f, color });
      y -= size * LH;
    };

    // RTL paragraph layout for pdf-lib (which has no bidi). Two rules keep it
    // correct in real PDF viewers, which infer each line's base direction from
    // its first strong character:
    //   1) Wrap on the LOGICAL text, then shape each resulting DISPLAY line as a
    //      whole (shapeAr reshapes glyphs and reorders embedded LTR runs). This
    //      keeps values intact — shaping the paragraph before wrapping splits an
    //      already-reordered value across the wrap and corrupts the last line.
    //   2) `bindRtlTokens` glues numbers/Latin (IBAN, amounts, dates, IDs) to an
    //      adjacent Arabic word so no wrapped line can START with a Latin run —
    //      which would flip the line to LTR base direction and reverse it.
    const paraRTL = (text: string, size: number, f: PDFFont) => {
      const words = bindRtlTokens(text);
      let line = '';
      const flush = () => {
        if (!line) return;
        const shaped = shapeAr(line);
        const w = f.widthOfTextAtSize(shaped, size);
        page.drawText(shaped, { x: x1 - w, y, size, font: f, color: INK });
        y -= size * LH;
        line = '';
      };
      for (const word of words) {
        const trial = line ? `${line} ${word}` : word;
        if (f.widthOfTextAtSize(shapeAr(trial), size) > colW && line) {
          flush();
          line = word;
        } else {
          line = trial;
        }
      }
      flush();
      y -= size * 0.55;
    };

    const para = (text: string, size: number, f: PDFFont) => {
      if (rtl) {
        paraRTL(text, size, f);
        return;
      }
      for (const l of wrapCol(text, size, f)) drawColLine(l, size, f);
      y -= size * 0.55;
    };

    para(fillPlaceholders(tpl.intro, placeholders), BODY, font);
    y -= 3;
    for (const section of tpl.sections) {
      drawColLine(section.heading, HEAD, bold);
      y -= 1;
      para(fillPlaceholders(section.body, placeholders), BODY, font);
    }
    return y;
  };

  renderColumn(en, leftX0, leftX1, false, latin, latinBold);
  renderColumn(ar, rightX0, rightX1, true, arabic, arabic);

  // ---- Divider between the two languages ----
  page.drawLine({
    start: { x: centerX, y: bodyTop + 8 },
    end: { x: centerX, y: sigTop - 6 },
    thickness: 0.75,
    color: DIVIDER,
  });

  // ---- Signature band (bilingual) ----
  // First Party (company, stamp goes here on the signed copy) on the left;
  // Second Party (crew) signature on the right — matching the Docuseal field.
  const bandY = sigTop;

  // Left: First Party / الطرف الأول
  page.drawText('First Party — Over Exposure Productions', {
    x: leftX0,
    y: bandY,
    size: 8,
    font: latinBold,
    color: GREY,
  });
  const fpAr = shapeAr('الطرف الأول — أوفر إكسبوجر برودكشنز');
  page.drawText(fpAr, {
    x: leftX1 - arabic.widthOfTextAtSize(fpAr, 8),
    y: bandY - 12,
    size: 8,
    font: arabic,
    color: GREY,
  });

  // Right: crew signature line + bilingual label + date.
  const sigLineX0 = rightX1 - 200;
  page.drawLine({
    start: { x: sigLineX0, y: bandY + 2 },
    end: { x: rightX1, y: bandY + 2 },
    thickness: 1,
    color: GREY,
  });
  page.drawText(en.signatureLabel, {
    x: sigLineX0,
    y: bandY - 12,
    size: 8,
    font: latin,
    color: GREY,
  });
  const sigAr = shapeAr(ar.signatureLabel);
  page.drawText(sigAr, {
    x: rightX1 - arabic.widthOfTextAtSize(sigAr, 8),
    y: bandY - 24,
    size: 8,
    font: arabic,
    color: GREY,
  });
  page.drawText(`${en.dateLabel} / ${placeholders.TODAY}`, {
    x: sigLineX0,
    y: bandY - 26,
    size: 8,
    font: latin,
    color: GREY,
  });

  // Footer note.
  const footer = `${placeholders.CREW_NAME} · ${placeholders.PROJECT_NAME}`;
  page.drawText(footer, {
    x: centerX - latinBold.widthOfTextAtSize(footer, 7.5) / 2,
    y: MARGIN - 22,
    size: 7.5,
    font: latinBold,
    color: GREY,
  });

  return pdf.save();
}
