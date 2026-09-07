import 'server-only';

// Email delivery via SMTP (Nodemailer). Sends the bilingual "contracts ready to
// sign" message with two signing buttons (one per contract amount).

import nodemailer from 'nodemailer';
import type { Language } from './types';

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
  lang: Language;
  crewName: string;
  projectName: string;
  role: string;
  dateFrom: string;
  dateTo: string;
  amountX: string;
  amountY: string;
  signUrlX: string;
  signUrlY: string;
}

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
  const ar = p.lang === 'ar';
  const dir = ar ? 'rtl' : 'ltr';

  const s = ar
    ? {
        subject: `عقود ${p.projectName} جاهزة للتوقيع`,
        greeting: `مرحباً ${p.crewName}،`,
        intro: `عقودك لمشروع "${p.projectName}" جاهزة للمراجعة والتوقيع.`,
        please: 'يرجى توقيع العقدين أدناه:',
        btnX: `توقيع العقد الأول (المبلغ: ${p.amountX} درهم)`,
        btnY: `توقيع العقد الثاني (المبلغ: ${p.amountY} درهم)`,
        infoTitle: 'بياناتك المسجّلة:',
        name: 'الاسم',
        roleL: 'الدور',
        period: 'الفترة',
        questions: 'لأي استفسار، يمكنك الرد على هذا البريد.',
        sign: 'مع التحية،\nأوفر إكسبوجر برودكشنز',
      }
    : {
        subject: `Your OEP Contracts Are Ready to Sign — ${p.projectName}`,
        greeting: `Hi ${p.crewName},`,
        intro: `Your contracts for project "${p.projectName}" are ready for your review and signature.`,
        please: 'Please sign both contracts below:',
        btnX: `Sign Contract 1 (Amount: ${p.amountX} AED)`,
        btnY: `Sign Contract 2 (Amount: ${p.amountY} AED)`,
        infoTitle: 'Your info on file:',
        name: 'Name',
        roleL: 'Role',
        period: 'Period',
        questions: 'Questions? Reply to this email.',
        sign: 'Best,\nOver Exposure Productions',
      };

  const button = (url: string, label: string) => `
    <a href="${url}" style="display:block;margin:10px 0;padding:14px 20px;background:#e8b04b;color:#0a0a0b;
       text-decoration:none;border-radius:12px;font-weight:600;text-align:center;font-family:Arial,sans-serif;">
      ${label}
    </a>`;

  const html = `
  <div dir="${dir}" style="max-width:560px;margin:0 auto;padding:24px;background:#111113;border-radius:16px;
       color:#f6f5f2;font-family:Arial,Helvetica,sans-serif;">
    <div style="height:6px;background:#e8b04b;border-radius:6px;margin-bottom:20px;"></div>
    <p style="font-size:16px;">${s.greeting}</p>
    <p style="color:#cfcfcf;line-height:1.6;">${s.intro}</p>
    <p style="color:#cfcfcf;">${s.please}</p>
    ${button(p.signUrlX, s.btnX)}
    ${button(p.signUrlY, s.btnY)}
    <div style="margin-top:20px;padding:16px;background:#1a1a1d;border-radius:12px;color:#cfcfcf;font-size:14px;">
      <strong>${s.infoTitle}</strong><br/>
      ${s.name}: ${p.crewName}<br/>
      ${s.roleL}: ${p.role}<br/>
      ${s.period}: ${p.dateFrom} — ${p.dateTo}
    </div>
    <p style="color:#9a9aa2;font-size:13px;margin-top:20px;">${s.questions}</p>
    <p style="color:#9a9aa2;font-size:13px;white-space:pre-line;">${s.sign}</p>
  </div>`;

  const text = [
    s.greeting,
    '',
    s.intro,
    '',
    `${s.btnX}: ${p.signUrlX}`,
    `${s.btnY}: ${p.signUrlY}`,
    '',
    `${s.name}: ${p.crewName}`,
    `${s.roleL}: ${p.role}`,
    `${s.period}: ${p.dateFrom} — ${p.dateTo}`,
    '',
    s.questions,
    s.sign,
  ].join('\n');

  return { subject: s.subject, html, text };
}
