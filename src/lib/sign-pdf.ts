import 'server-only';

// Applies a signature captured on the /sign/{token} page (a finger-drawn PNG
// from a phone, or a mouse-drawn one on desktop) to the contract PDF that was
// emailed to the crew member.
//
// The drawing lands inside SIGNATURE_BOX — the same dashed box the generator
// prints on the page — so an online signature and a pen signature sit in
// exactly the same spot. Underneath it we print a short attestation line (who
// signed, when, from which IP, and the contract reference) so the signed copy
// carries its own audit trail.

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { SIGNATURE_BOX } from './contract-pdf';

const GREY = rgb(0.35, 0.35, 0.4);
const INK = rgb(0.1, 0.1, 0.11);

/** Matches MARGIN in contract-pdf.ts — the attestation may not cross it. */
const PAGE_MARGIN = 42;

/** Max decoded size of an uploaded signature image (a canvas PNG is ~10–60 KB). */
const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024;

export interface AppliedSignature {
  signerName: string;
  signedAt: number;
  ip?: string;
  reference?: string;
}

/**
 * Decode the `data:image/png;base64,...` payload a canvas produces. Only PNG is
 * accepted — that is what `canvas.toDataURL()` returns, and it keeps us from
 * embedding whatever else a caller might post.
 */
export function decodeSignatureDataUrl(dataUrl: string): Buffer {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl ?? '');
  if (!match) {
    throw new Error('The signature must be a PNG image drawn on the signing page.');
  }
  const bytes = Buffer.from(match[1].replace(/\s+/g, ''), 'base64');
  if (bytes.length === 0) throw new Error('The signature image was empty.');
  if (bytes.length > MAX_SIGNATURE_BYTES) {
    throw new Error('The signature image is too large.');
  }
  return bytes;
}

function formatStamp(ts: number): string {
  // Gulf Standard Time — the contract's jurisdiction, so the attestation reads
  // in the same timezone everyone involved works in.
  const d = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dubai',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(ts));
  return `${d} (GST)`;
}

/**
 * Draw `signaturePng` into the contract's signature box and add the attestation
 * line. Returns the signed PDF's bytes; the input buffer is left untouched.
 */
export async function applySignatureToPdf(params: {
  pdfBytes: Uint8Array;
  signaturePng: Uint8Array;
  signature: AppliedSignature;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(params.pdfBytes);
  const page = pdf.getPage(0);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Fit the drawing inside the box, keeping its aspect ratio and a little air.
  const png = await pdf.embedPng(params.signaturePng);
  const padX = 8;
  const padY = 5;
  const maxW = SIGNATURE_BOX.width - padX * 2;
  const maxH = SIGNATURE_BOX.height - padY * 2;
  const scale = Math.min(maxW / png.width, maxH / png.height);
  const w = png.width * scale;
  const h = png.height * scale;
  page.drawImage(png, {
    x: SIGNATURE_BOX.x + (SIGNATURE_BOX.width - w) / 2,
    // Sit the drawing ON the ruled line rather than floating mid-box.
    y: SIGNATURE_BOX.y + padY,
    width: w,
    height: h,
  });

  // Attestation, below the printed signature labels.
  const { signerName, signedAt, ip, reference } = params.signature;
  const nameLine = `Signed by: ${signerName}`;
  page.drawText(nameLine, {
    x: SIGNATURE_BOX.x,
    y: SIGNATURE_BOX.y - 42,
    size: 8,
    font: bold,
    color: INK,
  });

  const attest = [
    `Signed electronically on ${formatStamp(signedAt)}`,
    ip ? `IP ${ip}` : null,
    reference ? `Ref ${reference}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  // The attestation is longer than the signature box, so anchor it to the same
  // right edge and let it run leftwards — starting it under the box would push
  // the reference off the page.
  const attestSize = 6.5;
  const attestWidth = font.widthOfTextAtSize(attest, attestSize);
  const rightEdge = SIGNATURE_BOX.x + SIGNATURE_BOX.width;
  const attestX = Math.max(PAGE_MARGIN, Math.min(SIGNATURE_BOX.x, rightEdge - attestWidth));
  page.drawText(attest, {
    x: attestX,
    y: SIGNATURE_BOX.y - 52,
    size: attestSize,
    font,
    color: GREY,
  });

  return pdf.save();
}

/**
 * Is this really a PDF? Checks the `%PDF-` magic bytes rather than trusting a
 * filename or a declared MIME type — an emailed reply is whatever the sender's
 * phone decided to attach, and a photo renamed `contract.pdf` must not pass.
 */
export function looksLikePdf(bytes: Uint8Array): boolean {
  if (bytes.length < 5) return false;
  return (
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 && // F
    bytes[4] === 0x2d // -
  );
}
