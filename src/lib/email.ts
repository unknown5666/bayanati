import 'server-only';

// Email delivery via SMTP (Nodemailer) — the whole signing flow now runs on
// email, so this module owns every message the system sends:
//
//   sendContractEmail          the contract itself, PDF attached, with a
//                              phone-signing link and reply-with-a-scan option
//   sendSignedConfirmation     "we received your signature", signed PDF attached
//   sendScanRejectedEmail      a reply arrived with photos instead of a PDF
//   sendAdminNotice            internal heads-up for the OEP team
//
// Every crew-facing message is bilingual: English first, Arabic underneath.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { adminEmails } from './firebase/admin';

let cached: nodemailer.Transporter | null = null;

function transporter(): nodemailer.Transporter {
  if (cached) return cached;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    throw new Error('SMTP config missing. Set SMTP_HOST, SMTP_USER, SMTP_PASS.');
  }
  cached = nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE !== 'false' && port === 465,
    auth: { user, pass },
  });
  return cached;
}

function fromAddress(): string {
  return process.env.EMAIL_FROM ?? process.env.SMTP_USER!;
}

/** The mailbox crew members reply to — the same one the inbox poller watches. */
function replyToAddress(): string {
  return process.env.EMAIL_REPLY_TO ?? process.env.SMTP_USER!;
}

// --- Shared look ------------------------------------------------------------
//
// A light, print-friendly layout: contracts get forwarded, printed and filed, so
// the message is styled like stationery rather than like the (dark) app UI.
// Colours match the brand — amber #e8b04b rule, maroon #8e1f3f headings.

const LOGO_CID = 'oep-logo';

const FONT = "'Helvetica Neue',Helvetica,Arial,sans-serif";

/** The OEP logo as an inline (CID) attachment, when the asset is on disk. */
async function logoAttachment(): Promise<nodemailer.SendMailOptions['attachments']> {
  try {
    const content = await readFile(path.join(process.cwd(), 'public', 'oep-logo.png'));
    return [{ filename: 'oep-logo.png', content, cid: LOGO_CID }];
  } catch {
    return [];
  }
}

function shell(inner: string): string {
  return `
<div style="margin:0;padding:24px 12px;background:#f4f3f0;font-family:${FONT};">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
         style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:14px;
                overflow:hidden;border:1px solid #e6e3dd;">
    <tr><td style="height:5px;background:#e8b04b;font-size:0;line-height:0;">&nbsp;</td></tr>
    <tr>
      <td style="padding:26px 32px 8px 32px;text-align:center;">
        <img src="cid:${LOGO_CID}" alt="Over Exposure Productions" width="54"
             style="display:block;margin:0 auto 10px auto;width:54px;height:auto;border:0;"/>
        <div style="font-size:11px;letter-spacing:1.4px;text-transform:uppercase;
                    color:#8e1f3f;font-weight:700;">Over Exposure Productions</div>
      </td>
    </tr>
    <tr><td style="padding:14px 32px 30px 32px;color:#1c1c1e;font-size:15px;line-height:1.6;">
      ${inner}
    </td></tr>
    <tr>
      <td style="padding:16px 32px 22px 32px;border-top:1px solid #eeece7;
                 color:#8a8781;font-size:11.5px;line-height:1.6;text-align:center;">
        Over Exposure Productions FZ LLC · Creative Media Authority, Abu Dhabi<br/>
        This message and any attachment are confidential and intended for the named recipient.
      </td>
    </tr>
  </table>
</div>`;
}

/** A label/value summary table used in the contract email. */
function detailTable(rows: Array<[string, string]>): string {
  const cells = rows
    .map(
      ([k, v]) => `
      <tr>
        <td style="padding:7px 0;color:#7a7770;font-size:13px;width:42%;">${escapeHtml(k)}</td>
        <td style="padding:7px 0;color:#1c1c1e;font-size:13px;font-weight:600;">${escapeHtml(v)}</td>
      </tr>`,
    )
    .join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
    style="margin:18px 0;border-top:1px solid #eeece7;border-bottom:1px solid #eeece7;">${cells}</table>`;
}

function button(url: string, label: string): string {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:20px auto;">
    <tr><td style="border-radius:10px;background:#8e1f3f;">
      <a href="${url}" style="display:inline-block;padding:14px 30px;font-family:${FONT};
         font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">
        ${escapeHtml(label)}
      </a>
    </td></tr>
  </table>`;
}

/** A boxed rule the crew member must not miss. */
function notice(html: string): string {
  return `<div style="margin:18px 0;padding:13px 16px;background:#fdf6e7;border:1px solid #f0dcae;
      border-radius:10px;color:#6b5312;font-size:13.5px;line-height:1.6;">${html}</div>`;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function rtl(html: string): string {
  return `<div dir="rtl" lang="ar" style="margin-top:26px;padding-top:20px;
    border-top:1px solid #eeece7;text-align:right;font-family:${FONT};">${html}</div>`;
}

// --- 1. The contract email --------------------------------------------------

export interface ContractEmailParams {
  to: string;
  crewName: string;
  projectName: string;
  role: string;
  dateFrom: string;
  dateTo: string;
  amount: string; // this contract's amount, formatted
  contractLabel: string; // "A" or "B"
  reference: string; // OEP-XXXXXX — printed in the subject, matches replies back
  signUrl: string; // {APP_URL}/sign/{token}
  pdf: { filename: string; content: Buffer | Uint8Array };
}

/**
 * Send ONE contract for signature: the PDF is attached, and the crew member can
 * either sign it on their phone through `signUrl` or print, sign, scan and
 * reply. The reference goes in the subject so their reply can be matched back
 * to this exact contract.
 */
export async function sendContractEmail(p: ContractEmailParams): Promise<void> {
  const { subject, html, text } = buildContractEmail(p);
  await transporter().sendMail({
    from: fromAddress(),
    to: p.to,
    replyTo: replyToAddress(),
    subject,
    html,
    text,
    attachments: [
      { filename: p.pdf.filename, content: Buffer.from(p.pdf.content), contentType: 'application/pdf' },
      ...((await logoAttachment()) ?? []),
    ],
  });
}

function buildContractEmail(p: ContractEmailParams): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Contract ${p.contractLabel} for your signature — ${p.projectName} [${p.reference}]`;

  const inner = `
    <p style="margin:0 0 14px 0;font-size:16px;">Dear ${escapeHtml(p.crewName)},</p>

    <p style="margin:0 0 14px 0;">
      Kindly find enclosed the contract for your signature.
    </p>

    ${detailTable([
      ['Project', p.projectName],
      ['Role', p.role],
      ['Period', `${p.dateFrom} — ${p.dateTo}`],
      ['Contract', `${p.contractLabel} · ${p.amount} AED`],
      ['Reference', p.reference],
    ])}

    <p style="margin:0 0 4px 0;font-weight:700;color:#8e1f3f;">Option 1 — sign on your phone</p>
    <p style="margin:0;color:#54524d;font-size:14px;">
      Open the link below, review the contract and sign with your finger. It takes
      under a minute and the signed copy is filed automatically.
    </p>
    ${button(p.signUrl, 'Review & sign the contract')}
    <p style="margin:-8px 0 20px 0;font-size:12px;color:#8a8781;word-break:break-all;text-align:center;">
      ${escapeHtml(p.signUrl)}
    </p>

    <p style="margin:0 0 4px 0;font-weight:700;color:#8e1f3f;">Option 2 — print, sign and reply</p>
    <p style="margin:0;color:#54524d;font-size:14px;">
      Print the attached PDF, sign it, scan it, and reply to this email with the
      scan attached. Please keep the subject line unchanged so we can match your
      reply to the right contract.
    </p>

    ${notice(
      '<strong>Please note:</strong> only a <strong>scanned PDF</strong> is accepted. ' +
        'Photographs or screenshots of the contract (JPG, PNG, HEIC) will not be accepted ' +
        'and will be returned to you.',
    )}

    <p style="margin:20px 0 0 0;">Thanks and regards,</p>
    <p style="margin:2px 0 0 0;font-weight:700;">Over Exposure Productions</p>

    ${rtl(`
      <p style="margin:0 0 14px 0;font-size:16px;">عزيزي/عزيزتي ${escapeHtml(p.crewName)}،</p>
      <p style="margin:0 0 14px 0;">تجدون طيّه العقد الخاص بكم للتوقيع.</p>
      <p style="margin:0 0 6px 0;color:#54524d;font-size:14px;">
        <strong style="color:#8e1f3f;">الخيار الأول:</strong>
        التوقيع من الهاتف مباشرةً عبر الرابط الموجود أعلاه.
      </p>
      <p style="margin:0 0 6px 0;color:#54524d;font-size:14px;">
        <strong style="color:#8e1f3f;">الخيار الثاني:</strong>
        طباعة العقد المرفق وتوقيعه ثم مسحه ضوئياً والرد على هذا البريد مع إرفاق النسخة الممسوحة،
        مع إبقاء عنوان الرسالة كما هو.
      </p>
      <p style="margin:12px 0 0 0;color:#6b5312;font-size:13.5px;">
        <strong>تنبيه:</strong> لا تُقبل إلا النسخة الممسوحة ضوئياً بصيغة PDF،
        ولن تُقبل الصور الفوتوغرافية أو لقطات الشاشة.
      </p>
      <p style="margin:18px 0 0 0;">مع خالص التحية،</p>
      <p style="margin:2px 0 0 0;font-weight:700;">أوفر إكسبوجر برودكشنز</p>
    `)}
  `;

  const text = [
    `Dear ${p.crewName},`,
    '',
    'Kindly find enclosed the contract for your signature.',
    '',
    `Project:   ${p.projectName}`,
    `Role:      ${p.role}`,
    `Period:    ${p.dateFrom} — ${p.dateTo}`,
    `Contract:  ${p.contractLabel} · ${p.amount} AED`,
    `Reference: ${p.reference}`,
    '',
    'Option 1 — sign on your phone:',
    p.signUrl,
    '',
    'Option 2 — print the attached PDF, sign it, scan it and reply to this email',
    'with the scan attached, keeping the subject line unchanged.',
    '',
    'Please note: only a scanned PDF is accepted. Photographs or screenshots of',
    'the contract (JPG, PNG, HEIC) will not be accepted and will be returned to you.',
    '',
    'Thanks and regards,',
    'Over Exposure Productions',
    '',
    '—',
    `عزيزي/عزيزتي ${p.crewName}، تجدون طيّه العقد الخاص بكم للتوقيع.`,
    'يمكنكم التوقيع من الهاتف عبر الرابط أعلاه، أو طباعة العقد وتوقيعه ومسحه ضوئياً والرد على هذا البريد.',
    'تنبيه: لا تُقبل إلا النسخة الممسوحة ضوئياً بصيغة PDF، ولن تُقبل الصور.',
  ].join('\n');

  return { subject, html: shell(inner), text };
}

// --- 2. Signature received --------------------------------------------------

export interface SignedConfirmationParams {
  to: string;
  crewName: string;
  projectName: string;
  contractLabel: string;
  reference?: string;
  pdf?: { filename: string; content: Buffer | Uint8Array };
}

/** Confirm a signature was received, with the signed copy attached. */
export async function sendSignedConfirmation(p: SignedConfirmationParams): Promise<void> {
  const subject = `Signed — Contract ${p.contractLabel}, ${p.projectName}${
    p.reference ? ` [${p.reference}]` : ''
  }`;

  const inner = `
    <p style="margin:0 0 14px 0;font-size:16px;">Dear ${escapeHtml(p.crewName)},</p>
    <p style="margin:0 0 14px 0;">
      Thank you — we have received your signed Contract ${escapeHtml(p.contractLabel)}
      for "${escapeHtml(p.projectName)}". A copy is attached for your records, and
      the original has been filed with the production.
    </p>
    <p style="margin:0 0 14px 0;color:#54524d;font-size:14px;">
      No further action is needed from you on this contract.
    </p>
    <p style="margin:20px 0 0 0;">Thanks and regards,</p>
    <p style="margin:2px 0 0 0;font-weight:700;">Over Exposure Productions</p>
    ${rtl(`
      <p style="margin:0 0 14px 0;font-size:16px;">عزيزي/عزيزتي ${escapeHtml(p.crewName)}،</p>
      <p style="margin:0;">
        شكراً لكم، وصلتنا نسختكم الموقّعة من العقد ${escapeHtml(p.contractLabel)}
        الخاص بمشروع "${escapeHtml(p.projectName)}"، ومرفق طيّه نسخة لسجلاتكم.
        لا يلزم منكم أي إجراء إضافي بخصوص هذا العقد.
      </p>
      <p style="margin:18px 0 0 0;">مع خالص التحية،</p>
      <p style="margin:2px 0 0 0;font-weight:700;">أوفر إكسبوجر برودكشنز</p>
    `)}
  `;

  const text = [
    `Dear ${p.crewName},`,
    '',
    `Thank you — we have received your signed Contract ${p.contractLabel} for "${p.projectName}".`,
    'A copy is attached for your records. No further action is needed.',
    '',
    'Thanks and regards,',
    'Over Exposure Productions',
  ].join('\n');

  await transporter().sendMail({
    from: fromAddress(),
    to: p.to,
    replyTo: replyToAddress(),
    subject,
    html: shell(inner),
    text,
    attachments: [
      ...(p.pdf
        ? [
            {
              filename: p.pdf.filename,
              content: Buffer.from(p.pdf.content),
              contentType: 'application/pdf',
            },
          ]
        : []),
      ...((await logoAttachment()) ?? []),
    ],
  });
}

// --- 3. Wrong attachment type ----------------------------------------------

export interface ScanRejectedParams {
  to: string;
  crewName: string;
  contractLabel?: string;
  reference?: string;
  signUrl?: string;
  /** What they actually sent, e.g. "photo.jpg" — quoted back so it's obvious. */
  received: string[];
}

/**
 * A reply came back with photos (or nothing) instead of a scanned PDF. Tell the
 * crew member plainly, and offer the one-tap phone signing route instead.
 */
export async function sendScanRejectedEmail(p: ScanRejectedParams): Promise<void> {
  const label = p.contractLabel ? ` ${p.contractLabel}` : '';
  const subject = `Action needed — your signed contract${label} was not accepted${
    p.reference ? ` [${p.reference}]` : ''
  }`;

  const inner = `
    <p style="margin:0 0 14px 0;font-size:16px;">Dear ${escapeHtml(p.crewName)},</p>
    <p style="margin:0 0 14px 0;">
      Thank you for your reply. Unfortunately we could not accept what you sent
      for contract${escapeHtml(label)}, so it has not been filed.
    </p>
    ${
      p.received.length
        ? `<p style="margin:0 0 14px 0;color:#54524d;font-size:14px;">
             You sent: ${escapeHtml(p.received.join(', '))}
           </p>`
        : ''
    }
    ${notice(
      '<strong>Only a scanned PDF is accepted.</strong> Photographs and screenshots ' +
        'of the contract (JPG, PNG, HEIC) cannot be accepted for a signed contract.',
    )}
    <p style="margin:0 0 6px 0;font-weight:700;color:#8e1f3f;">What to do next</p>
    <p style="margin:0 0 4px 0;color:#54524d;font-size:14px;">
      Scan the signed contract with a scanner or a free scanning app (Adobe Scan,
      Microsoft Lens, or the Files/Notes app on your phone), save it as a
      <strong>PDF</strong>, and reply to this email with that PDF attached.
    </p>
    ${
      p.signUrl
        ? `<p style="margin:14px 0 0 0;color:#54524d;font-size:14px;">
             Or skip the printing entirely and sign on your phone:
           </p>
           ${button(p.signUrl, 'Sign on my phone instead')}`
        : ''
    }
    <p style="margin:20px 0 0 0;">Thanks and regards,</p>
    <p style="margin:2px 0 0 0;font-weight:700;">Over Exposure Productions</p>
    ${rtl(`
      <p style="margin:0 0 14px 0;font-size:16px;">عزيزي/عزيزتي ${escapeHtml(p.crewName)}،</p>
      <p style="margin:0 0 10px 0;">
        شكراً لردّكم، إلا أنه لم يتم قبول ما تم إرساله ولم يُحفظ العقد.
      </p>
      <p style="margin:0 0 10px 0;color:#6b5312;">
        <strong>لا تُقبل إلا النسخة الممسوحة ضوئياً بصيغة PDF</strong>،
        ولن تُقبل الصور الفوتوغرافية أو لقطات الشاشة.
      </p>
      <p style="margin:0;color:#54524d;font-size:14px;">
        يُرجى مسح العقد الموقّع ضوئياً وحفظه بصيغة PDF ثم الرد على هذا البريد مع إرفاقه،
        أو التوقيع مباشرةً من الهاتف عبر الرابط أعلاه.
      </p>
      <p style="margin:18px 0 0 0;">مع خالص التحية،</p>
      <p style="margin:2px 0 0 0;font-weight:700;">أوفر إكسبوجر برودكشنز</p>
    `)}
  `;

  const text = [
    `Dear ${p.crewName},`,
    '',
    `Thank you for your reply. We could not accept what you sent for contract${label},`,
    'so it has not been filed.',
    p.received.length ? `You sent: ${p.received.join(', ')}` : '',
    '',
    'Only a scanned PDF is accepted. Photographs and screenshots of the contract',
    '(JPG, PNG, HEIC) cannot be accepted.',
    '',
    'Please scan the signed contract, save it as a PDF, and reply with that PDF attached.',
    p.signUrl ? `Or sign on your phone instead: ${p.signUrl}` : '',
    '',
    'Thanks and regards,',
    'Over Exposure Productions',
  ]
    .filter((l) => l !== '')
    .join('\n');

  await transporter().sendMail({
    from: fromAddress(),
    to: p.to,
    replyTo: replyToAddress(),
    subject,
    html: shell(inner),
    text,
    attachments: (await logoAttachment()) ?? [],
  });
}

// --- 4. Internal notices ----------------------------------------------------

/**
 * Tell the OEP team something happened (a signature landed, a reply could not be
 * matched). Best-effort: a failure here must never break the flow that
 * triggered it.
 */
export async function sendAdminNotice(params: {
  subject: string;
  heading: string;
  lines: string[];
  link?: { url: string; label: string };
}): Promise<void> {
  const to = adminEmails();
  if (!to.length) return;

  const inner = `
    <p style="margin:0 0 12px 0;font-size:16px;font-weight:700;color:#8e1f3f;">
      ${escapeHtml(params.heading)}
    </p>
    ${params.lines
      .map(
        (l) => `<p style="margin:0 0 6px 0;color:#54524d;font-size:14px;">${escapeHtml(l)}</p>`,
      )
      .join('')}
    ${params.link ? button(params.link.url, params.link.label) : ''}
    <p style="margin:18px 0 0 0;color:#8a8781;font-size:12.5px;">Bayanati · automated notice</p>
  `;

  try {
    await transporter().sendMail({
      from: fromAddress(),
      to: to.join(', '),
      subject: params.subject,
      html: shell(inner),
      text: [params.heading, '', ...params.lines, params.link?.url ?? ''].join('\n'),
      attachments: (await logoAttachment()) ?? [],
    });
  } catch (err) {
    console.error('[email] admin notice failed', params.subject, err);
  }
}

/** Surface SMTP misconfiguration early (used by the inbox poll diagnostics). */
export async function verifySmtp(): Promise<void> {
  await transporter().verify();
}
