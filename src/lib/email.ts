import 'server-only';

// Email delivery via SMTP (Nodemailer). Sends a bilingual (EN + AR) "contract
// ready to sign" message for ONE contract, with a single signing button. Each
// contract (A / B) is emailed separately.

import nodemailer from 'nodemailer';

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

export interface ContractEmailParams {
  to: string;
  crewName: string;
  projectName: string;
  role: string;
  dateFrom: string;
  dateTo: string;
  amount: string; // this contract's amount, formatted
  contractLabel: string; // "A" or "B"
  signUrl: string;
}

/** Send ONE bilingual (EN + AR) contract email with a single signing button. */
export async function sendContractEmail(p: ContractEmailParams): Promise<void> {
  const from = process.env.EMAIL_FROM ?? process.env.SMTP_USER!;
  const { subject, html, text } = buildContractEmail(p);
  await transporter().sendMail({ from, to: p.to, subject, html, text });
}

function buildContractEmail(p: ContractEmailParams): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Your OEP Contract ${p.contractLabel} — ${p.projectName} / عقدك جاهز للتوقيع`;

  const button = (url: string, label: string) => `
    <a href="${url}" style="display:block;margin:10px 0;padding:14px 20px;background:#e8b04b;color:#0a0a0b;
       text-decoration:none;border-radius:12px;font-weight:600;text-align:center;font-family:Arial,sans-serif;">
      ${label}
    </a>`;

  const html = `
  <div style="max-width:560px;margin:0 auto;padding:24px;background:#111113;border-radius:16px;
       color:#f6f5f2;font-family:Arial,Helvetica,sans-serif;">
    <div style="height:6px;background:#e8b04b;border-radius:6px;margin-bottom:20px;"></div>
    <p style="font-size:16px;">Hi ${p.crewName},</p>
    <p style="color:#cfcfcf;line-height:1.6;">Your contract <strong>${p.contractLabel}</strong>
      (Amount: ${p.amount} AED) for project "${p.projectName}" is ready to review and sign.</p>
    ${button(p.signUrl, `Sign Contract ${p.contractLabel} (${p.amount} AED)`)}
    <div style="margin-top:20px;padding:16px;background:#1a1a1d;border-radius:12px;color:#cfcfcf;font-size:14px;">
      Name: ${p.crewName}<br/>Role: ${p.role}<br/>Period: ${p.dateFrom} — ${p.dateTo}
    </div>
    <hr style="border:none;border-top:1px solid #2a2a2e;margin:20px 0;"/>
    <div dir="rtl" style="text-align:right;">
      <p style="font-size:16px;">مرحباً ${p.crewName}،</p>
      <p style="color:#cfcfcf;line-height:1.8;">عقدك <strong>${p.contractLabel}</strong>
        (المبلغ: ${p.amount} درهم) لمشروع "${p.projectName}" جاهز للمراجعة والتوقيع عبر الزر أعلاه.</p>
    </div>
    <p style="color:#9a9aa2;font-size:13px;margin-top:20px;">Questions? Reply to this email. / لأي استفسار، يمكنك الرد على هذا البريد.</p>
    <p style="color:#9a9aa2;font-size:13px;">Over Exposure Productions</p>
  </div>`;

  const text = [
    `Hi ${p.crewName},`,
    '',
    `Your contract ${p.contractLabel} (Amount: ${p.amount} AED) for project "${p.projectName}" is ready to sign:`,
    p.signUrl,
    '',
    `Name: ${p.crewName}`,
    `Role: ${p.role}`,
    `Period: ${p.dateFrom} — ${p.dateTo}`,
    '',
    `مرحباً ${p.crewName}، عقدك ${p.contractLabel} (المبلغ: ${p.amount} درهم) جاهز للتوقيع عبر الرابط أعلاه.`,
    '',
    'Over Exposure Productions',
  ].join('\n');

  return { subject, html, text };
}
