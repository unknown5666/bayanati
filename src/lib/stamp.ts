import 'server-only';

// Applies the Over Exposure Productions company seal to a signed contract PDF.
// The stamp image is a square PNG (ideally 472×472, transparent background) at
// public/oep-stamp.png. It is drawn in the bottom-left corner of page 1, sized
// relative to the page so it never dominates the layout.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';

let stampCache: Uint8Array | undefined;

/** Load public/oep-stamp.png (cached). Throws an actionable error if missing. */
export async function loadStampPng(): Promise<Uint8Array> {
  if (stampCache) return stampCache;
  const p = path.join(process.cwd(), 'public', 'oep-stamp.png');
  try {
    const bytes = await readFile(p);
    stampCache = new Uint8Array(bytes);
    return stampCache;
  } catch {
    throw new Error(
      `Company stamp image not found at ${p}. Save the stamp as a 472×472 ` +
        'transparent PNG at public/oep-stamp.png and redeploy.',
    );
  }
}

/**
 * Draw the stamp on the bottom-left of page 1 of `pdfBytes`. Size = 22% of the
 * page's shorter side (≈130pt on A4), inset from the corner, so it reads as an
 * official seal without covering the crew signature (which sits bottom-right).
 */
export async function applyStampToPdf(
  pdfBytes: Uint8Array,
  stampPng: Uint8Array,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(pdfBytes);
  const png = await pdf.embedPng(stampPng);
  const page = pdf.getPage(0);
  const { width, height } = page.getSize();
  const size = Math.min(width, height) * 0.22;
  const inset = 42;
  page.drawImage(png, { x: inset, y: inset, width: size, height: size });
  return pdf.save();
}
