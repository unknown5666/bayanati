'use client';

// The crew-facing signing screen: read the contract, draw a signature, submit.
// Deliberately self-contained and mobile-first — most crew open this from the
// email on a phone, often on patchy data, and are not signed in to anything.

import { useRef, useState } from 'react';
import { SignaturePad, type SignaturePadHandle } from './SignaturePad';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';

export interface SignContractProps {
  token: string;
  crewName: string;
  projectName: string;
  role: string;
  period: string;
  amount: string;
  contractLabel: string;
  reference: string;
}

export function SignContract(p: SignContractProps) {
  const pad = useRef<SignaturePadHandle>(null);
  const [hasInk, setHasInk] = useState(false);
  const [fullName, setFullName] = useState(p.crewName);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const pdfUrl = `/api/sign/${p.token}/pdf`;
  const nameOk = fullName.trim().length >= 2;
  const canSubmit = hasInk && agree && nameOk && !busy;

  async function submit() {
    const signature = pad.current?.toDataUrl();
    if (!signature) {
      setError('Please draw your signature in the box above.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sign/${p.token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature, fullName: fullName.trim(), agree }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Could not sign (${res.status})`);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <main className="mx-auto max-w-lg px-5 pb-16 pt-8">
        <div className="card p-7 text-center animate-scale-in">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-ok/30 bg-ok/15 text-ok">
            <Icon name="check" className="h-8 w-8" strokeWidth={3} />
          </span>
          <h1 className="mt-5 text-xl text-display">Signed — thank you</h1>
          <p className="mt-2.5 text-sm leading-relaxed text-paper/[0.72]">
            Contract {p.contractLabel} for &ldquo;{p.projectName}&rdquo; has been signed
            and filed with the production. A copy is on its way to your inbox.
          </p>
          <p
            className="mt-4 text-sm leading-relaxed text-paper/[0.72]"
            dir="rtl"
            lang="ar"
          >
            تم توقيع العقد بنجاح، وسنرسل لكم نسخة على بريدكم الإلكتروني. شكراً لكم.
          </p>
          <p className="mt-6 border-t border-ink-800 pt-4 text-xs text-paper/[0.55]">
            Reference <span className="nums">{p.reference}</span>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-5 pb-24 pt-6">
      <div className="animate-rise-in">
        <span className="chip border-exposure/25 bg-exposure/10 text-exposure">
          <Icon name="signature" className="h-3.5 w-3.5" />
          Contract {p.contractLabel}
        </span>
        <h1 className="mt-4 text-3xl leading-tight text-display">Sign your contract</h1>
        <p className="mt-1.5 text-sm text-paper/[0.72]">
          Dear {p.crewName}, please review the contract below and sign it.
        </p>
      </div>

      <section className="card mt-6 divide-y divide-ink-800">
        <Row label="Project" value={p.projectName} />
        <Row label="Role" value={p.role} />
        <Row label="Period" value={p.period} />
        {/* The amount is the number people actually check — it gets the size
            and the accent to match its importance. */}
        <div className="flex items-center justify-between gap-4 px-4 py-3.5">
          <span className="text-sm text-paper/[0.72]">Fee</span>
          <span className="text-lg font-bold text-exposure nums" dir="ltr">
            {p.amount} AED
          </span>
        </div>
        <Row label="Reference" value={p.reference} mono />
      </section>

      <a href={pdfUrl} target="_blank" rel="noreferrer" className="btn-ghost mt-4 w-full">
        <Icon name="document" className="h-4 w-4" />
        Open the full contract (PDF)
        <Icon name="external" className="h-3.5 w-3.5 opacity-60" />
      </a>
      <p className="mt-2 text-center text-xs leading-relaxed text-paper/[0.55]">
        Please read it before signing.
        <span className="mx-1.5 opacity-40">/</span>
        <span dir="rtl" lang="ar">
          يُرجى قراءة العقد قبل التوقيع.
        </span>
      </p>

      <div className="mt-8">
        <span className="field-label">Your signature</span>
        <SignaturePad ref={pad} onChange={setHasInk} disabled={busy} />
      </div>

      <div className="mt-5">
        <label className="field-label" htmlFor="fullName">
          Full name
        </label>
        <input
          id="fullName"
          className="field-input"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          disabled={busy}
          autoComplete="name"
        />
      </div>

      <label
        className={`mt-5 flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition duration-200 ${
          agree
            ? 'border-exposure/45 bg-exposure/[0.06]'
            : 'border-ink-700 bg-ink-900/50 hover:border-ink-600'
        }`}
      >
        <input
          type="checkbox"
          checked={agree}
          onChange={(e) => setAgree(e.target.checked)}
          disabled={busy}
          className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded accent-exposure"
        />
        <span className="text-sm leading-relaxed text-paper/[0.82]">
          I have read contract {p.contractLabel} and I agree to it. I accept that this
          drawn signature is my legally binding signature.
          <span className="mt-2 block text-paper/[0.72]" dir="rtl" lang="ar">
            أقرّ بأنني اطّلعت على العقد وأوافق عليه، وأن هذا التوقيع مُلزم قانوناً.
          </span>
        </span>
      </label>

      {error && (
        <Alert tone="error" className="mt-4">
          {error}
        </Alert>
      )}

      <button className="btn-primary mt-6 w-full" disabled={!canSubmit} onClick={submit}>
        {busy ? <Spinner /> : <Icon name="signature" className="h-4 w-4" />}
        {busy ? 'Signing…' : 'Sign and submit'}
      </button>

      {/*
        Rather than a flat "you can't submit yet", name the steps that are
        still outstanding and tick off the ones that are done. On a phone the
        signature box and the checkbox can be a scroll apart, so "what is left"
        is a genuine question.
      */}
      {!canSubmit && !busy && (
        <ul className="mt-3 grid gap-1.5 text-xs text-paper/[0.72]" aria-live="polite">
          <Requirement met={hasInk}>Draw your signature</Requirement>
          <Requirement met={nameOk}>Enter your full name</Requirement>
          <Requirement met={agree}>Tick the agreement box</Requirement>
        </ul>
      )}

      <p className="mt-8 border-t border-ink-800 pt-5 text-center text-xs leading-relaxed text-paper/[0.55]">
        Prefer to sign on paper? Print the PDF, sign it, scan it and reply to the
        email we sent you. Only a scanned PDF is accepted — photographs of the
        contract cannot be accepted.
      </p>
    </main>
  );
}

function Requirement({ met, children }: { met: boolean; children: React.ReactNode }) {
  return (
    <li className={`flex items-center gap-2 ${met ? 'text-ok' : ''}`}>
      <Icon
        name={met ? 'checkCircle' : 'clock'}
        className="h-3.5 w-3.5"
        strokeWidth={2}
      />
      <span className={met ? 'line-through opacity-70' : ''}>{children}</span>
    </li>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <span className="shrink-0 text-sm text-paper/[0.72]">{label}</span>
      <span className={`min-w-0 text-right text-sm font-medium ${mono ? 'nums' : ''}`}>
        {value}
      </span>
    </div>
  );
}
