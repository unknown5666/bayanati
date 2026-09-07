'use client';

import { useState } from 'react';
import { Field } from './Field';
import { FileField } from './FileField';
import { Stepper } from './Stepper';
import { dir, LANGUAGES, t } from '@/lib/i18n';
import type { Language } from '@/lib/types';
import {
  validateDob,
  validateEmail,
  validateEmiratesId,
  validateIban,
  validatePassport,
  validatePhone,
  validateRequired,
} from '@/lib/validation';
import { submitCrew, type CrewFormData } from '@/lib/submit-crew';

type Errors = Partial<Record<keyof CrewFormData, string>>;

const EMPTY: CrewFormData = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '+971',
  nationality: '',
  dob: '',
  emiratesId: '',
  passport: '',
  iban: '',
  language: 'en',
  emiratesIdFront: null,
  emiratesIdBack: null,
  passportImage: null,
};

export function CrewForm() {
  const [lang, setLang] = useState<Language>('en');
  const [step, setStep] = useState(0);
  const [data, setData] = useState<CrewFormData>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>('');
  const [done, setDone] = useState(false);

  const steps = [
    t(lang, 'step_personal'),
    t(lang, 'step_documents'),
    t(lang, 'step_banking'),
    t(lang, 'step_review'),
  ];

  function set<K extends keyof CrewFormData>(key: K, value: CrewFormData[K]) {
    setData((d) => ({ ...d, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function validateStep(current: number): boolean {
    const e: Errors = {};
    if (current === 0) {
      if (!validateRequired(data.firstName, 'First name').ok) e.firstName = t(lang, 'required');
      if (!validateRequired(data.lastName, 'Last name').ok) e.lastName = t(lang, 'required');
      if (!validateEmail(data.email).ok) e.email = t(lang, 'err_email');
      if (!validatePhone(data.phone).ok) e.phone = t(lang, 'err_phone');
      if (!validateRequired(data.nationality, 'Nationality').ok)
        e.nationality = t(lang, 'required');
      if (!validateDob(data.dob).ok) e.dob = t(lang, 'err_dob');
    } else if (current === 1) {
      if (!validateEmiratesId(data.emiratesId).ok) e.emiratesId = t(lang, 'err_emirates_id');
      if (!validatePassport(data.passport).ok) e.passport = t(lang, 'err_passport');
      if (!data.emiratesIdFront) e.emiratesIdFront = t(lang, 'required');
      if (!data.emiratesIdBack) e.emiratesIdBack = t(lang, 'required');
      if (!data.passportImage) e.passportImage = t(lang, 'required');
    } else if (current === 2) {
      if (!validateIban(data.iban).ok) e.iban = t(lang, 'err_iban');
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function next() {
    if (validateStep(step)) setStep((s) => Math.min(s + 1, steps.length - 1));
  }

  function back() {
    setStep((s) => Math.max(s - 1, 0));
  }

  async function onSubmit() {
    // Re-validate every step before the final write.
    for (let s = 0; s < 3; s++) {
      if (!validateStep(s)) {
        setStep(s);
        return;
      }
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      await submitCrew({ ...data, language: lang });
      setDone(true);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Something went wrong. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div dir={dir(lang)} className="card mx-auto max-w-md p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-exposure text-2xl text-ink-950">
          ✓
        </div>
        <h2 className="text-2xl font-bold">{t(lang, 'success_title')}</h2>
        <p className="mt-3 text-paper/70">{t(lang, 'success_body')}</p>
      </div>
    );
  }

  return (
    <div dir={dir(lang)} className="mx-auto max-w-xl">
      {/* Sticky language selector */}
      <div className="sticky top-0 z-10 -mx-4 mb-4 flex items-center justify-between border-b border-ink-800 bg-ink-950/90 px-4 py-3 backdrop-blur">
        <span className="text-sm font-semibold text-exposure">{t(lang, 'brand')}</span>
        <div className="flex gap-1" role="group" aria-label={t(lang, 'select_language')}>
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => setLang(l.code)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                lang === l.code
                  ? 'bg-exposure text-ink-950'
                  : 'text-paper/70 hover:bg-ink-800'
              }`}
              aria-pressed={lang === l.code}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-2 text-center">
        <h1 className="text-2xl font-bold">{t(lang, 'form_title')}</h1>
        <p className="mt-1 text-sm text-paper/60">{t(lang, 'form_subtitle')}</p>
      </div>

      <div className="mb-6">
        <Stepper steps={steps} current={step} />
      </div>

      <div className="card p-5 sm:p-6">
        {step === 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t(lang, 'first_name')}
              name="firstName"
              value={data.firstName}
              error={errors.firstName}
              onChange={(e) => set('firstName', e.target.value)}
              autoComplete="given-name"
            />
            <Field
              label={t(lang, 'last_name')}
              name="lastName"
              value={data.lastName}
              error={errors.lastName}
              onChange={(e) => set('lastName', e.target.value)}
              autoComplete="family-name"
            />
            <Field
              label={t(lang, 'email')}
              name="email"
              type="email"
              inputMode="email"
              dir="ltr"
              value={data.email}
              error={errors.email}
              onChange={(e) => set('email', e.target.value)}
              autoComplete="email"
            />
            <Field
              label={t(lang, 'phone')}
              name="phone"
              type="tel"
              inputMode="tel"
              dir="ltr"
              value={data.phone}
              error={errors.phone}
              onChange={(e) => set('phone', e.target.value)}
              autoComplete="tel"
            />
            <Field
              label={t(lang, 'nationality')}
              name="nationality"
              value={data.nationality}
              error={errors.nationality}
              onChange={(e) => set('nationality', e.target.value)}
              autoComplete="country-name"
            />
            <Field
              label={t(lang, 'dob')}
              name="dob"
              type="date"
              dir="ltr"
              value={data.dob}
              error={errors.dob}
              onChange={(e) => set('dob', e.target.value)}
              autoComplete="bday"
            />
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-4">
            <Field
              label={t(lang, 'emirates_id')}
              name="emiratesId"
              inputMode="numeric"
              dir="ltr"
              placeholder="784-XXXX-XXXXXXX-X"
              value={data.emiratesId}
              error={errors.emiratesId}
              onChange={(e) => set('emiratesId', e.target.value)}
            />
            <Field
              label={t(lang, 'passport')}
              name="passport"
              dir="ltr"
              value={data.passport}
              error={errors.passport}
              onChange={(e) => set('passport', e.target.value.toUpperCase())}
            />
            <FileField
              label={t(lang, 'emirates_id_front')}
              hint={t(lang, 'upload_hint')}
              chooseLabel={t(lang, 'choose_file')}
              selectedLabel={t(lang, 'file_selected')}
              value={data.emiratesIdFront}
              error={errors.emiratesIdFront}
              onChange={(f) => set('emiratesIdFront', f)}
              onReject={(m) => setErrors((e) => ({ ...e, emiratesIdFront: m }))}
            />
            <FileField
              label={t(lang, 'emirates_id_back')}
              hint={t(lang, 'upload_hint')}
              chooseLabel={t(lang, 'choose_file')}
              selectedLabel={t(lang, 'file_selected')}
              value={data.emiratesIdBack}
              error={errors.emiratesIdBack}
              onChange={(f) => set('emiratesIdBack', f)}
              onReject={(m) => setErrors((e) => ({ ...e, emiratesIdBack: m }))}
            />
            <FileField
              label={t(lang, 'passport_image')}
              hint={t(lang, 'upload_hint')}
              chooseLabel={t(lang, 'choose_file')}
              selectedLabel={t(lang, 'file_selected')}
              value={data.passportImage}
              error={errors.passportImage}
              onChange={(f) => set('passportImage', f)}
              onReject={(m) => setErrors((e) => ({ ...e, passportImage: m }))}
            />
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-4">
            <Field
              label={t(lang, 'iban')}
              name="iban"
              dir="ltr"
              placeholder="AE07 0331 2345 6789 0123 456"
              hint={t(lang, 'iban_hint')}
              value={data.iban}
              error={errors.iban}
              onChange={(e) => set('iban', e.target.value.toUpperCase())}
            />
          </div>
        )}

        {step === 3 && (
          <Review lang={lang} data={data} />
        )}

        {submitError && (
          <p className="mt-4 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {submitError}
          </p>
        )}

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={back}
            disabled={step === 0 || submitting}
            className="btn-ghost"
          >
            {t(lang, 'back')}
          </button>
          {step < 3 ? (
            <button type="button" onClick={next} className="btn-primary">
              {t(lang, 'next')}
            </button>
          ) : (
            <button
              type="button"
              onClick={onSubmit}
              disabled={submitting}
              className="btn-primary"
            >
              {submitting ? t(lang, 'submitting') : t(lang, 'submit')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Review({ lang, data }: { lang: Language; data: CrewFormData }) {
  const rows: [string, string][] = [
    [t(lang, 'first_name'), data.firstName],
    [t(lang, 'last_name'), data.lastName],
    [t(lang, 'email'), data.email],
    [t(lang, 'phone'), data.phone],
    [t(lang, 'nationality'), data.nationality],
    [t(lang, 'dob'), data.dob],
    [t(lang, 'emirates_id'), data.emiratesId],
    [t(lang, 'passport'), data.passport],
    [t(lang, 'iban'), data.iban],
  ];
  return (
    <div>
      <h2 className="text-lg font-semibold">{t(lang, 'review_title')}</h2>
      <p className="mt-1 text-sm text-paper/60">{t(lang, 'review_hint')}</p>
      <dl className="mt-4 divide-y divide-ink-800 rounded-xl border border-ink-800">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-4 px-4 py-2.5">
            <dt className="text-sm text-paper/60">{k}</dt>
            <dd className="text-sm font-medium" dir="ltr">
              {v || '—'}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
