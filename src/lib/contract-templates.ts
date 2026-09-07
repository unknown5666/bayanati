// Bilingual contract templates. Placeholders in {BRACES} are filled from crew
// data at generation time (see contract-pdf.ts).
//
// The company identity, "First Party / Second Party" framing, and Abu Dhabi
// governing-law clause below are taken from OEP's real house agreement (the
// Genesis Permits & Approvals Services Agreement): Over Exposure Productions
// FZ LLC, TRN 104814212700003, Licence B.L.1433/24 (Creative Media Authority,
// Abu Dhabi). The crew-specific clauses (role, term, compensation, confidentiality)
// are a professional default — confirm their exact wording against the real crew
// contract (مساعد_درون.pdf) before production. Keep the placeholder names intact.

import type { ContractType, Language } from './types';

export interface ContractSection {
  heading: string;
  body: string;
}

export interface ContractTemplate {
  title: string;
  intro: string;
  sections: ContractSection[];
  signatureLabel: string;
  dateLabel: string;
}

// The placeholders every template may reference:
//   {CREW_NAME} {ROLE} {AMOUNT} {AMOUNT_X} {AMOUNT_Y}
//   {DATE_FROM} {DATE_TO} {IBAN} {PROJECT_NAME} {EMIRATES_ID}
//   {PASSPORT} {NATIONALITY} {TODAY}
// {AMOUNT} resolves to X or Y depending on which contract is being rendered.

const en: ContractTemplate = {
  title: 'Crew Work Execution Contract',
  intro:
    'This Agreement is made on {TODAY} between Over Exposure Productions FZ LLC — TRN 104814212700003, Licence No. B.L.1433/24 (Creative Media Authority, Abu Dhabi) — ("the Company", First Party), and {CREW_NAME} ("the Crew Member", Second Party), Emirates ID {EMIRATES_ID}, passport {PASSPORT}, nationality {NATIONALITY}, for services on the project "{PROJECT_NAME}".',
  sections: [
    {
      heading: '1. Role & Scope',
      body: 'The Crew Member is engaged in the role of {ROLE}. The Crew Member shall perform all duties reasonably associated with this role to a professional standard and in line with the production schedule.',
    },
    {
      heading: '2. Term',
      body: 'The engagement runs from {DATE_FROM} to {DATE_TO}, inclusive, unless extended or terminated in writing by both parties.',
    },
    {
      heading: '3. Compensation',
      body: 'The Company shall pay the Crew Member a total of {AMOUNT} AED for the services under this contract. Payment shall be made by bank transfer to IBAN {IBAN} upon satisfactory completion and delivery of the agreed work.',
    },
    {
      heading: '4. Independent Engagement',
      body: 'The Crew Member acts as an independent contractor. Nothing in this Agreement creates an employment, partnership, or agency relationship beyond the scope described herein, and the Crew Member is responsible for their own applicable taxes and permits.',
    },
    {
      heading: '5. Confidentiality & Compliance',
      body: 'The Crew Member shall keep confidential all non-public information relating to the project and the Company, both during and after the engagement, and shall comply with all conditions, instructions, and restrictions contained in the permits and approvals issued by the competent authorities.',
    },
    {
      heading: '6. Governing Law & Jurisdiction',
      body: 'This Agreement is governed by the laws in force in the United Arab Emirates and the Emirate of Abu Dhabi. The competent courts of Abu Dhabi shall have jurisdiction over any dispute arising out of this Agreement.',
    },
  ],
  signatureLabel: 'Crew Member signature (Second Party)',
  dateLabel: 'Date',
};

const ar: ContractTemplate = {
  title: 'عقد تنفيذ عمل لطاقم الإنتاج',
  intro:
    'حُرِّر هذا العقد بتاريخ {TODAY} بين شركة أوفر إكسبوجر برودكشنز (منطقة حرة ذ.م.م) — الرقم الضريبي 104814212700003، رخصة رقم B.L.1433/24 (هيئة الإعلام الإبداعي، أبوظبي) — ("الشركة"، الطرف الأول)، والسيد/ة {CREW_NAME} ("عضو الطاقم"، الطرف الثاني)، هوية إماراتية رقم {EMIRATES_ID}، جواز سفر {PASSPORT}، الجنسية {NATIONALITY}، لتقديم خدمات في مشروع "{PROJECT_NAME}".',
  sections: [
    {
      heading: '١. الدور ونطاق العمل',
      body: 'يُكلَّف عضو الطاقم بدور {ROLE}، ويلتزم بأداء جميع المهام المرتبطة بهذا الدور وفق معايير مهنية وبما يتوافق مع جدول الإنتاج.',
    },
    {
      heading: '٢. مدة العقد',
      body: 'تسري مدة التكليف من {DATE_FROM} إلى {DATE_TO} شاملةً، ما لم تُمدَّد أو تُنهَ كتابةً باتفاق الطرفين.',
    },
    {
      heading: '٣. الأجر',
      body: 'تدفع الشركة لعضو الطاقم مبلغاً إجمالياً قدره {AMOUNT} درهم إماراتي مقابل الخدمات المنصوص عليها في هذا العقد، ويُسدَّد عبر تحويل بنكي إلى الآيبان {IBAN} عند إتمام العمل المتفق عليه وتسليمه بصورة مُرضية.',
    },
    {
      heading: '٤. طبيعة التعاقد',
      body: 'يعمل عضو الطاقم بصفته متعاقداً مستقلاً، ولا ينشئ هذا العقد أي علاقة توظيف أو شراكة أو وكالة خارج النطاق الموضح فيه، ويتحمّل عضو الطاقم ما يخصّه من ضرائب وتصاريح.',
    },
    {
      heading: '٥. السرية والالتزام',
      body: 'يلتزم عضو الطاقم بالحفاظ على سرية جميع المعلومات غير العامة المتعلقة بالمشروع والشركة أثناء التكليف وبعده، وبالامتثال لجميع الشروط والتعليمات والقيود الواردة في التصاريح والموافقات الصادرة عن الجهات المختصة.',
    },
    {
      heading: '٦. القانون الحاكم والاختصاص القضائي',
      body: 'يخضع هذا العقد للقوانين المعمول بها في دولة الإمارات العربية المتحدة وإمارة أبوظبي، وتختص محاكم أبوظبي المختصة بالنظر في أي نزاع ينشأ عنه.',
    },
  ],
  signatureLabel: 'توقيع عضو الطاقم (الطرف الثاني)',
  dateLabel: 'التاريخ',
};

export const CONTRACT_TEMPLATES: Record<Language, ContractTemplate> = { en, ar };

export function contractTitleFor(lang: Language, type: ContractType): string {
  const base = CONTRACT_TEMPLATES[lang].title;
  return lang === 'ar' ? `${base} (${type})` : `${base} (${type})`;
}
