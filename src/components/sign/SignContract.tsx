'use client';

// The crew-facing signing screen: read the contract, draw a signature, submit.
// Deliberately self-contained and mobile-first — most crew open this from the
// email on a phone, often on patchy data, and are not signed in to anything.

import { useRef, useState } from 'react';
import { SignaturePad, type SignaturePadHandle } from './SignaturePad';

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
  const canSubmit = hasInk && agree && fullName.trim().length >= 2 && !busy;

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
      <main className="mx-auto max-w-lg px-5 pb-16 pt-6">
        <div className="card p-7 text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-green-500/15 text-3xl">
            ✓
          </div>
          <h1 className="text-xl font-bold">Signed — thank you</h1>
          <p className="mt-2 text-sm leading-relaxed text-paper/70">
            Contract {p.contractLabel} for “{p.projectName}” has been signed and filed
            with the production. A copy is on its way to your inbox.
          </p>
          <p className="mt-4 text-sm text-paper/50" dir="rtl">
            تم توقيع العقد بنجاح، وسنرسل لكم نسخة على بريدكم الإلكتروني. شكراً لكم.
          </p>
          <p className="mt-6 text-xs text-paper/40">Reference {p.reference}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-5 pb-16 pt-6">
      <h1 className="text-2xl font-bold leading-tight">Sign your contract</h1>
      <p className="mt-1 text-sm text-paper/60">
        Dear {p.crewName}, please review the contract below and sign it.
      </p>

      <section className="card mt-5 divide-y divide-ink-800">
        <Row label="Project" value={p.projectName} />
        <Row label="Role" value={p.role} />
        <Row label="Period" value={p.period} />
        <Row label="Contract" value={`${p.contractLabel} · ${p.amount} AED`} />
        <Row label="Reference" value={p.reference} />
      </section>

      <a
        href={pdfUrl}
        target="_blank"
        rel="noreferrer"
        className="btn-ghost mt-4 w-full"
      >
        📄 Open the full contract (PDF)
      </a>
      <p className="mt-2 text-center text-xs text-paper/45">
        Please read it before signing. / يُرجى قراءة العقد قبل التوقيع.
      </p>

      <div className="mt-7">
        <label className="field-label">Your signature</label>
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

      <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-ink-700 bg-ink-900/50 p-4">
        <input
          type="checkbox"
          checked={agree}
          onChange={(e) => setAgree(e.target.checked)}
          disabled={busy}
          className="mt-0.5 h-5 w-5 shrink-0 accent-exposure"
        />
        <span className="text-sm leading-relaxed text-paper/80">
          I have read contract {p.contractLabel} and I agree to it. I accept that this
          drawn signature is my legally binding signature.
          <span className="mt-1 block text-paper/50" dir="rtl">
            أقرّ بأنني اطّلعت على العقد وأوافق عليه، وأن هذا التوقيع مُلزم قانوناً.
          </span>
        </span>
      </label>

      {error && (
        <p className="mt-4 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>
      )}

      <button className="btn-primary mt-5 w-full" disabled={!canSubmit} onClick={submit}>
        {busy ? 'Signing…' : '✍️ Sign and submit'}
      </button>
      {!canSubmit && !busy && (
        <p className="mt-2 text-center text-xs text-paper/45">
          Draw your signature and tick the box to continue.
        </p>
      )}

      <p className="mt-8 text-center text-xs leading-relaxed text-paper/40">
        Prefer to sign on paper? Print the PDF, sign it, scan it and reply to the
        email we sent you. Only a scanned PDF is accepted — photographs of the
        contract cannot be accepted.
      </p>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <span className="text-sm text-paper/60">{label}</span>
      <span className="text-right text-sm font-medium">{value}</span>
    </div>
  );
}
