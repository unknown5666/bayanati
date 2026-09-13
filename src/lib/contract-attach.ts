import 'server-only';

// Appends ID scans (Emirates ID front/back, passport) to a contract PDF, and
// merges many PDFs into one. Scans may be JPEG, PNG or PDF; anything else is
// skipped rather than failing the download.

import { PDFDocument } from 'pdf-lib';

export type AttachmentKey = 'eidFront' | 'eidBack' | 'passport';
export const ATTACHMENT_KEYS: AttachmentKey[] = ['eidFront', 'eidBack', 'passport'];

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 36;
const GAP = 18;

function kindOf(b: Uint8Array): 'png' | 'jpg' | 'pdf' | null {
  if (b[0] === 0x89 && b[1] === 0x50) return 'png';
  if (b[0] === 0xff && b[1] === 0xd8) return 'jpg';
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'pdf';
  return null;
}

/** Contract pages, then one page holding every image scan, then any PDF scans. */
export async function appendAttachments(
  contract: Uint8Array,
  scans: Uint8Array[],
): Promise<Uint8Array> {
  if (!scans.length) return contract;
  const doc = await PDFDocument.load(contract);
  const images = [];
  const pdfs: Uint8Array[] = [];
  for (const s of scans) {
    const k = kindOf(s);
    if (k === 'png') images.push(await doc.embedPng(s));
    else if (k === 'jpg') images.push(await doc.embedJpg(s));
    else if (k === 'pdf') pdfs.push(s);
  }

  if (images.length) {
    const page = doc.addPage(A4);
    const slotW = A4[0] - MARGIN * 2;
    const slotH = (A4[1] - MARGIN * 2 - GAP * (images.length - 1)) / images.length;
    images.forEach((img, i) => {
      const scale = Math.min(slotW / img.width, slotH / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      const top = A4[1] - MARGIN - i * (slotH + GAP);
      page.drawImage(img, { x: (A4[0] - w) / 2, y: top - slotH + (slotH - h) / 2, width: w, height: h });
    });
  }

  for (const p of pdfs) {
    const src = await PDFDocument.load(p, { ignoreEncryption: true });
    for (const pg of await doc.copyPages(src, src.getPageIndices())) doc.addPage(pg);
  }
  return doc.save();
}

export async function mergePdfs(files: Uint8Array[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  for (const f of files) {
    const src = await PDFDocument.load(f, { ignoreEncryption: true });
    for (const pg of await out.copyPages(src, src.getPageIndices())) out.addPage(pg);
  }
  return out.save();
}
