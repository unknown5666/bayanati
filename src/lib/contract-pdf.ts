import 'server-only';

// Contract PDF generation with pdf-lib.
//
// English renders natively with a standard font. Arabic requires an embedded
// Unicode font AND contextual shaping (pdf-lib does not shape Arabic on its own),
// so we embed a Noto Arabic font from src/assets/fonts and reshape text with the
// optional `arabic-reshaper` dependency. If the font is missing the generator
// throws a clear, actionable error rather than producing broken glyphs.
//
// For pixel-perfect Arabic legal fidelity, prefer uploading the original Arabic
// PDF straight to Docuseal as a template (see DOCUSEAL_SETUP.md) instead of
// re-typesetting it here.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib';
import type { ContractPlaceholders, ContractType, CrewMember, Language } from './types';
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

const isArabicChar = (ch: string): boolean => {
  const c = ch.codePointAt(0) ?? 0;
  return (
    (c >= 0x0600 && c <= 0x06ff) || // Arabic
    (c >= 0x0750 && c <= 0x077f) || // Arabic Supplement
    (c >= 0x08a0 && c <= 0x08ff) || // Arabic Extended-A
    (c >= 0xfb50 && c <= 0xfdff) || // Arabic Presentation Forms-A
    (c >= 0xfe70 && c <= 0xfeff) // Arabic Presentation Forms-B
  );
};

/**
 * Lay out an Arabic line visually for pdf-lib (which does no bidi shaping).
 * arabic-reshaper's convertArabic both reshapes the letters AND reverses the
 * whole string to visual RTL order — which leaves any embedded Latin/number
 * runs (crew name, IBAN, dates) backwards. So we reshape, then un-reverse ONLY
 * the non-Arabic runs; Arabic runs are already correct. Verified by rendering.
 * For pixel-exact legal bidi, prefer a Docuseal Arabic template.
 */
function shapeArabicLine(line: string, reshape: (s: string) => string): string {
  const visual = reshape(line);
  const runs: Array<{ ar: boolean; text: string }> = [];
  for (const ch of Array.from(visual)) {
    const ar = isArabicChar(ch);
    const last = runs[runs.length - 1];
    if (last && last.ar === ar) last.text += ch;
    else runs.push({ ar, text: ch });
  }
  return runs
    .map((r) => (r.ar ? r.text : Array.from(r.text).reverse().join('')))
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
const MARGIN = 56;

interface Cursor {
  page: PDFPage;
  y: number;
}

export interface GenerateOptions {
  lang: Language;
  type: ContractType;
  placeholders: ContractPlaceholders;
}

export async function generateContractPdf(opts: GenerateOptions): Promise<Uint8Array> {
  const { lang, type, placeholders } = opts;
  const rtl = lang === 'ar';
  const tpl = CONTRACT_TEMPLATES[lang];

  const pdf = await PDFDocument.create();
  const regular = rtl
    ? await embedArabicFont(pdf)
    : await pdf.embedFont(StandardFonts.Helvetica);
  const bold = rtl ? regular : await pdf.embedFont(StandardFonts.HelveticaBold);

  const reshape = rtl ? await getReshaper() : null;
  if (rtl && !reshape) {
    throw new Error(
      'Arabic contracts require the optional "arabic-reshaper" package. ' +
        'Run: npm install arabic-reshaper — or use a Docuseal Arabic template.',
    );
  }

  const shape = (s: string): string =>
    rtl && reshape ? shapeArabicLine(s, reshape) : s;

  let cur: Cursor = { page: pdf.addPage([A4.w, A4.h]), y: A4.h - MARGIN };

  const drawLine = (
    text: string,
    font: PDFFont,
    size: number,
    color = INK,
  ) => {
    const shaped = shape(text);
    const width = font.widthOfTextAtSize(shaped, size);
    const x = rtl ? A4.w - MARGIN - width : MARGIN;
    cur.page.drawText(shaped, { x, y: cur.y, size, font, color });
    cur.y -= size * 1.55;
  };

  const drawCentered = (
    text: string,
    font: PDFFont,
    size: number,
    color = INK,
  ) => {
    const shaped = shape(text);
    const width = font.widthOfTextAtSize(shaped, size);
    cur.page.drawText(shaped, { x: (A4.w - width) / 2, y: cur.y, size, font, color });
    cur.y -= size * 1.55;
  };

  // Single-page contract: never spill onto a second page. Kept as a no-op so
  // the call sites still read as intent markers.
  const ensureSpace = (_needed: number) => {
    void _needed;
  };

  const wrap = (text: string, font: PDFFont, size: number): string[] => {
    const maxWidth = A4.w - MARGIN * 2;
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      const trial = line ? `${line} ${word}` : word;
      // Measure the shaped width so Arabic wrapping is roughly correct.
      const measured = shape(trial);
      if (font.widthOfTextAtSize(measured, size) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = trial;
      }
    }
    if (line) lines.push(line);
    return lines;
  };

  const paragraph = (text: string, font: PDFFont, size: number, color = INK) => {
    for (const line of wrap(text, font, size)) {
      ensureSpace(size * 1.6);
      drawLine(line, font, size, color);
    }
    cur.y -= size * 0.7;
  };

  // Header: thin brand strip, the OEP logo centred on top, wordmark, then title.
  cur.page.drawRectangle({ x: 0, y: A4.h - 6, width: A4.w, height: 6, color: AMBER });

  const logoBottom = await drawBrandLogo(pdf, cur.page, A4.w / 2, A4.h - 20);
  cur.y = logoBottom - 16;

  const brand = rtl ? 'أوفر إكسبوجر برودكشنز' : 'OVER EXPOSURE PRODUCTIONS';
  drawCentered(brand, bold, 9.5, GREY);
  cur.y -= 8;

  // Title — centred, and just the contract name (no "(X)"/"(Y)" suffix).
  drawCentered(tpl.title, bold, 17);
  cur.y -= 14;

  // Intro + sections — spaced to fill the page while staying on ONE page.
  paragraph(fillPlaceholders(tpl.intro, placeholders), regular, 10.5);
  cur.y -= 8;

  for (const section of tpl.sections) {
    ensureSpace(40);
    drawLine(section.heading, bold, 11);
    cur.y -= 3;
    paragraph(fillPlaceholders(section.body, placeholders), regular, 10.5);
  }

  // Signature block at a FIXED position near the bottom of the single page.
  const lineY = MARGIN + 64;
  const sigX = rtl ? MARGIN : A4.w - MARGIN - 220;

  cur.page.drawLine({
    start: { x: sigX, y: lineY },
    end: { x: sigX + 220, y: lineY },
    thickness: 1,
    color: GREY,
  });
  const sigLabel = shape(tpl.signatureLabel);
  cur.page.drawText(sigLabel, {
    x: sigX,
    y: lineY - 14,
    size: 9,
    font: regular,
    color: GREY,
  });
  cur.page.drawText(shape(`${tpl.dateLabel}: ${placeholders.TODAY}`), {
    x: sigX,
    y: lineY - 30,
    size: 9,
    font: regular,
    color: GREY,
  });

  // Footer note (no "Contract X" label — the two copies differ by amount).
  cur.page.drawText(`${placeholders.CREW_NAME} · ${placeholders.PROJECT_NAME}`, {
    x: MARGIN,
    y: MARGIN - 20,
    size: 8,
    font: bold,
    color: GREY,
  });

  return pdf.save();
}
