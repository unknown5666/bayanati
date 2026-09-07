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
import { CONTRACT_TEMPLATES, contractTitleFor } from './contract-templates';

const AMBER = rgb(0.91, 0.69, 0.29);
const INK = rgb(0.1, 0.1, 0.11);
const GREY = rgb(0.35, 0.35, 0.4);

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
    // Optional dependency; only needed for Arabic PDFs.
    const mod: any = await import('arabic-reshaper');
    const fn = mod.reshape ?? mod.default?.reshape ?? mod.default ?? mod;
    reshaper = typeof fn === 'function' ? fn : null;
  } catch {
    reshaper = null;
  }
  return reshaper ?? null;
}

/** Reshape + visually reverse an Arabic line for pdf-lib's LTR drawing. */
function shapeArabicLine(line: string, reshape: (s: string) => string): string {
  const reshaped = reshape(line);
  // Reverse to visual RTL order. Numbers/Latin runs stay approximate; keep the
  // real legal Arabic in Docuseal templates for exact bidi.
  return Array.from(reshaped).reverse().join('');
}

async function embedArabicFont(pdf: PDFDocument): Promise<PDFFont> {
  const fontkit = (await import('@pdf-lib/fontkit')).default;
  pdf.registerFontkit(fontkit);
  const fontPath = path.join(
    process.cwd(),
    'src',
    'assets',
    'fonts',
    'NotoNaskhArabic-Regular.ttf',
  );
  let bytes: Buffer;
  try {
    bytes = await readFile(fontPath);
  } catch {
    throw new Error(
      `Arabic contract font not found at ${fontPath}. Download ` +
        'NotoNaskhArabic-Regular.ttf (Google Fonts, OFL) into src/assets/fonts/, ' +
        'or generate Arabic contracts via a Docuseal template instead.',
    );
  }
  return pdf.embedFont(bytes, { subset: true });
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
    cur.y -= size * 1.5;
  };

  const ensureSpace = (needed: number) => {
    if (cur.y - needed < MARGIN) {
      cur = { page: pdf.addPage([A4.w, A4.h]), y: A4.h - MARGIN };
    }
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
    cur.y -= size * 0.5;
  };

  // Header brand strip.
  cur.page.drawRectangle({
    x: 0,
    y: A4.h - 8,
    width: A4.w,
    height: 8,
    color: AMBER,
  });

  const brand = rtl ? 'أوفر إكسبوجر برودكشنز' : 'OVER EXPOSURE PRODUCTIONS';
  drawLine(brand, bold, 10, GREY);
  cur.y -= 6;

  // Title.
  drawLine(contractTitleFor(lang, type), bold, 20);
  cur.y -= 8;

  // Intro + sections.
  paragraph(fillPlaceholders(tpl.intro, placeholders), regular, 11);
  cur.y -= 6;

  for (const section of tpl.sections) {
    ensureSpace(40);
    drawLine(section.heading, bold, 12);
    cur.y -= 2;
    paragraph(fillPlaceholders(section.body, placeholders), regular, 11);
  }

  // Signature block near the bottom of the current page.
  ensureSpace(120);
  cur.y = Math.max(cur.y, MARGIN + 110);
  const blockY = MARGIN + 70;
  const lineY = blockY;
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
    y: lineY - 16,
    size: 10,
    font: regular,
    color: GREY,
  });
  cur.page.drawText(shape(`${tpl.dateLabel}: ${placeholders.TODAY}`), {
    x: sigX,
    y: lineY - 34,
    size: 10,
    font: regular,
    color: GREY,
  });

  // Footer note identifying the contract variant.
  cur.page.drawText(`Contract ${type} · ${placeholders.CREW_NAME}`, {
    x: MARGIN,
    y: MARGIN - 20,
    size: 8,
    font: bold,
    color: GREY,
  });

  return pdf.save();
}
