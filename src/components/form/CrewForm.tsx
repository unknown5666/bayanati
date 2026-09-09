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
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';

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

  const rtl = dir(lang) === 'rtl';

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
      <div
        dir={dir(lang)}
        className="card mx-auto mt-10 max-w-md p-8 text-center animate-scale-in"
      >
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-exposure-gradient text-ink-950 shadow-flare-lg">
          <Icon name="check" className="h-8 w-8" strokeWidth={3} />
        </span>
        <h2 className="mt-5 text-2xl text-display">{t(lang, 'success_title')}</h2>
        <p className="mt-3 leading-relaxed text-paper/[0.72]">{t(lang, 'success_body')}</p>
      </div>
    );
  }

  return (
    <div dir={dir(lang)} className="mx-auto max-w-xl pb-10">
      {/* Language switch stays reachable at every step — someone who realises
          at step 3 that they would rather read Arabic should not have to
          start over to change it. */}
      <div className="sticky top-[var(--header-h)] z-30 -mx-4 mb-5 flex items-center justify-between gap-3 border-b border-ink-800/70 bg-ink-950/85 px-4 py-2.5 backdrop-blur-xl">
        <span className="flex items-center gap-1.5 truncate text-sm font-semibold text-paper/[0.72]">
          <Icon name="globe" className="h-4 w-4" />
          <span className="truncate">{t(lang, 'form_title')}</span>
        </span>
        <div className="segmented shrink-0" role="group" aria-label={t(lang, 'select_language')}>
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => setLang(l.code)}
              className="segmented-item"
              aria-pressed={lang === l.code}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-6 text-center">
        <h1 className="text-3xl text-display">{t(lang, 'form_title')}</h1>
        <p className="mt-1.5 text-sm text-paper/[0.72]">{t(lang, 'form_subtitle')}</p>
      </div>

      <div className="mb-7">
        <Stepper steps={steps} current={step} />
      </div>

      <div className="card p-5 sm:p-6">
        {step === 0 && (
          <div key="step-0" className="grid gap-4 animate-rise-in sm:grid-cols-2">
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
          <div key="step-1" className="grid gap-4 animate-rise-in">
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
          <div key="step-2" className="grid gap-4 animate-rise-in">
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
          <div key="step-3" className="animate-rise-in">
            <Review lang={lang} data={data} />
          </div>
        )}

        {submitError && (
          <Alert tone="error" className="mt-4">
            {submitError}
          </Alert>
        )}

        <div className="mt-7 flex items-center justify-between gap-3 border-t border-ink-800 pt-5">
          <button
            type="button"
            onClick={back}
            disabled={step === 0 || submitting}
            className="btn-ghost"
          >
            {/* The arrow follows reading direction, so it points back towards
                the start in Arabic too. */}
            <Icon name={rtl ? 'arrowRight' : 'arrowLeft'} className="h-4 w-4" />
            {t(lang, 'back')}
          </button>
          {step < 3 ? (
            <button type="button" onClick={next} className="btn-primary">
              {t(lang, 'next')}
              <Icon name={rtl ? 'arrowLeft' : 'arrowRight'} className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onSubmit}
              disabled={submitting}
              className="btn-primary"
            >
              {submitting ? <Spinner /> : <Icon name="send" className="h-4 w-4" />}
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
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Icon name="checkCircle" className="h-5 w-5 text-exposure" />
        {t(lang, 'review_title')}
      </h2>
      <p className="mt-1 text-sm text-paper/[0.72]">{t(lang, 'review_hint')}</p>
      <dl className="mt-4 divide-y divide-ink-800 overflow-hidden rounded-xl border border-ink-800 bg-ink-900/40">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="shrink-0 text-sm text-paper/[0.72]">{k}</dt>
            <dd
              className={`min-w-0 truncate text-sm font-medium ${v ? '' : 'text-paper/[0.55]'}`}
              dir="ltr"
            >
              {v || '—'}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
