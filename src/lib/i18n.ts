// Bilingual (Arabic / English) string catalogue for the crew-facing UI.
// Keys are shared; `dir` drives RTL layout for Arabic.

import type { Language } from './types';

export const LANGUAGES: { code: Language; label: string; dir: 'rtl' | 'ltr' }[] = [
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'ar', label: 'العربية', dir: 'rtl' },
];

export function dir(lang: Language): 'rtl' | 'ltr' {
  return lang === 'ar' ? 'rtl' : 'ltr';
}

type Dict = Record<string, string>;

const en: Dict = {
  brand: 'Bayanati',
  brand_by: 'Over Exposure Productions',
  form_title: 'Crew Intake',
  form_subtitle: 'Join the crew — takes about 3 minutes.',

  step_personal: 'Personal',
  step_documents: 'Documents',
  step_banking: 'Banking',
  step_review: 'Review',

  first_name: 'First name',
  last_name: 'Last name',
  email: 'Email',
  phone: 'Phone',
  nationality: 'Nationality',
  dob: 'Date of birth',

  emirates_id: 'Emirates ID number',
  passport: 'Passport number',
  emirates_id_front: 'Emirates ID — front',
  emirates_id_back: 'Emirates ID — back',
  passport_image: 'Passport photo page',
  upload_hint: 'JPG or PNG, up to 5MB',
  choose_file: 'Choose file',
  file_selected: 'Selected',

  iban: 'IBAN',
  iban_hint: 'Your bank IBAN — starts with AE for UAE banks.',

  review_title: 'Review your details',
  review_hint: 'Check everything is correct, then submit.',

  next: 'Next',
  back: 'Back',
  submit: 'Submit',
  submitting: 'Submitting…',

  success_title: 'Submitted!',
  success_body: 'Thanks — we have your details. We will email your contracts soon.',

  required: 'This field is required',
  fix_errors: 'Please fix the highlighted fields.',
  select_language: 'Language',

  err_email: 'Enter a valid email address',
  err_phone: 'Use UAE format, e.g. +9715XXXXXXXX',
  err_emirates_id: 'Enter a valid 15-digit Emirates ID',
  err_passport: 'Passport must be 6–10 letters/numbers',
  err_iban: 'Enter a valid IBAN (AE… for UAE banks)',
  err_dob: 'Enter a valid date of birth (18+)',
};

const ar: Dict = {
  brand: 'بياناتي',
  brand_by: 'أوفر إكسبوجر برودكشنز',
  form_title: 'تسجيل طاقم العمل',
  form_subtitle: 'انضم إلى الطاقم — يستغرق حوالي ٣ دقائق.',

  step_personal: 'المعلومات الشخصية',
  step_documents: 'المستندات',
  step_banking: 'المعلومات البنكية',
  step_review: 'المراجعة',

  first_name: 'الاسم الأول',
  last_name: 'اسم العائلة',
  email: 'البريد الإلكتروني',
  phone: 'رقم الهاتف',
  nationality: 'الجنسية',
  dob: 'تاريخ الميلاد',

  emirates_id: 'رقم الهوية الإماراتية',
  passport: 'رقم جواز السفر',
  emirates_id_front: 'الهوية الإماراتية — الوجه الأمامي',
  emirates_id_back: 'الهوية الإماراتية — الوجه الخلفي',
  passport_image: 'صفحة صورة جواز السفر',
  upload_hint: 'JPG أو PNG، بحد أقصى ٥ ميجابايت',
  choose_file: 'اختر ملفاً',
  file_selected: 'تم الاختيار',

  iban: 'رقم الآيبان',
  iban_hint: 'رقم الآيبان الخاص بحسابك البنكي — يبدأ بـ AE للبنوك الإماراتية.',

  review_title: 'راجع بياناتك',
  review_hint: 'تأكد من صحة كل المعلومات ثم أرسل.',

  next: 'التالي',
  back: 'السابق',
  submit: 'إرسال',
  submitting: 'جارٍ الإرسال…',

  success_title: 'تم الإرسال!',
  success_body: 'شكراً لك — لقد استلمنا بياناتك. سنرسل لك العقود قريباً عبر البريد الإلكتروني.',

  required: 'هذا الحقل مطلوب',
  fix_errors: 'يرجى تصحيح الحقول المحددة.',
  select_language: 'اللغة',

  err_email: 'أدخل بريداً إلكترونياً صحيحاً',
  err_phone: 'استخدم صيغة الإمارات، مثال +9715XXXXXXXX',
  err_emirates_id: 'أدخل رقم هوية إماراتية صحيحاً (١٥ رقماً)',
  err_passport: 'رقم الجواز من ٦ إلى ١٠ أحرف/أرقام',
  err_iban: 'أدخل رقم آيبان صحيحاً (يبدأ بـ AE للبنوك الإماراتية)',
  err_dob: 'أدخل تاريخ ميلاد صحيحاً (١٨+ عاماً)',
};

const catalog: Record<Language, Dict> = { en, ar };

export function t(lang: Language, key: string): string {
  return catalog[lang]?.[key] ?? en[key] ?? key;
}
