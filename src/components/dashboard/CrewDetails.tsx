'use client';

import { useState, type ReactNode } from 'react';
import { Modal } from './Modal';
import { StatusBadge } from './StatusBadge';
import type { CrewMember, SignatureRecord } from '@/lib/types';
import {
  generateContracts,
  sendContracts,
  stampContracts,
  updateCrew,
  type ContractType,
  type ContractLinks,
  type CrewPatch,
} from '@/lib/api-client';

const SCOPES: { key: string; label: string; types: ContractType[] }[] = [
  { key: 'A', label: 'Contract A', types: ['X'] },
  { key: 'B', label: 'Contract B', types: ['Y'] },
  { key: 'both', label: 'Both', types: ['X', 'Y'] },
];

function maskIban(iban?: string): string {
  if (!iban) return '—';
  const last4 = iban.slice(-4);
  return `${'•'.repeat(Math.max(iban.length - 4, 4))} ${last4}`;
}

function initials(first?: string, last?: string): string {
  return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase() || '👤';
}

/** A label/value row; shows a small amber dot when the value was edited by an admin. */
function Row({
  label,
  value,
  dir,
  edited,
}: {
  label: string;
  value?: string;
  dir?: 'ltr';
  edited?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <span className="flex items-center gap-1.5 text-sm text-paper/60">
        {label}
        {edited && (
          <span
            title="Edited for this contract"
            className="inline-block h-1.5 w-1.5 rounded-full bg-exposure"
          />
        )}
      </span>
      <span className="text-sm font-medium" dir={dir}>
        {value || '—'}
      </span>
    </div>
  );
}

const METHOD_LABELS: Record<string, string> = {
  online: 'signed on their phone',
  email_reply: 'scan received by email',
  manual: 'uploaded by an admin',
};

function methodLabel(method?: string): string {
  return method ? (METHOD_LABELS[method] ?? method) : 'signed';
}

/** One line summarising where a single contract has got to. */
function contractState(sig: SignatureRecord | undefined, signUrl?: string): string {
  if (sig?.signed) return `✓ Signed — ${methodLabel(sig.method)}`;
  return signUrl ? 'Emailed · awaiting signature' : 'Not sent';
}

/** Copies a signing link to the clipboard, confirming inline. */
function CopyButton({ value, disabled }: { value: string; disabled?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          // Clipboard blocked (insecure context / permissions) — the Open link
          // next to this button still gives the admin the URL.
        }
      }}
      className="rounded-lg border border-ink-600 px-2.5 py-1 text-xs text-paper/80 transition hover:border-exposure hover:text-exposure disabled:opacity-40"
    >
      {copied ? 'Copied ✓' : 'Copy'}
    </button>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-paper/40">
      {children}
    </p>
  );
}

export function CrewDetails({ crew }: { crew: CrewMember }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const c = crew.contract;
  const o = c.overrides ?? {};
  const [links, setLinks] = useState<ContractLinks>({ X: c.pdfLinkX, Y: c.pdfLinkY });
  const [stampLinks, setStampLinks] = useState<ContractLinks>({
    X: c.stampLinkX,
    Y: c.stampLinkY,
  });
  // One-time signing links — handy to paste into WhatsApp when a crew member
  // never opens their email.
  const [signLinks, setSignLinks] = useState<ContractLinks>({
    X: c.signUrlX,
    Y: c.signUrlY,
  });
  const [scopeKey, setScopeKey] = useState('both');
  const scope = SCOPES.find((s) => s.key === scopeKey) ?? SCOPES[2];
  const name = `${crew.personal.firstName} ${crew.personal.lastName}`.trim();

  // Effective values actually printed on the contract (admin override → intake).
  const effName = o.crewName?.trim() || name;
  const effNationality = o.nationality?.trim() || crew.personal.nationality;
  const effEmiratesId = o.emiratesId?.trim() || crew.documents.emiratesId;
  const effPassport = o.passport?.trim() || crew.documents.passport;

  const signedAny = Boolean(
    crew.signatures?.contractX?.signed || crew.signatures?.contractY?.signed,
  );

  // Ready = shared fields present, plus the amount for each selected contract.
  const ready =
    Boolean(c.role) &&
    Boolean(c.dateFrom) &&
    Boolean(c.dateTo) &&
    Boolean(c.iban) &&
    (!scope.types.includes('X') || c.amountX != null) &&
    (!scope.types.includes('Y') || c.amountY != null);
  const alreadySent =
    c.status === 'sent' ||
    c.status === 'signed_x' ||
    c.status === 'signed_y' ||
    c.status === 'both_signed';

  async function run<T>(fn: () => Promise<T>, okText: string): Promise<T | undefined> {
    setBusy(true);
    setMsg(null);
    try {
      const result = await fn();
      setMsg({ kind: 'ok', text: okText });
      setEditing(false);
      return result;
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Failed' });
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  async function onGenerate() {
    const res = await run(
      () => generateContracts(crew.id, scope.types),
      `Generated ${scope.label} — open below to review. Nothing was sent.`,
    );
    if (res?.links) setLinks((prev) => ({ ...prev, ...res.links }));
  }

  async function onSend() {
    const res = await run(
      () => sendContracts(crew.id, scope.types),
      `${scope.label} ${alreadySent ? 're-sent' : 'emailed'} with the PDF attached ✓`,
    );
    if (res?.links) setLinks((prev) => ({ ...prev, ...res.links }));
    if (res?.signLinks) setSignLinks((prev) => ({ ...prev, ...res.signLinks }));
  }

  async function onStamp() {
    const res = await run(
      () => stampContracts([crew.id]),
      'Company stamp applied to the signed contract(s) ✓',
    );
    const mine = res?.results?.find((r) => r.crewId === crew.id);
    if (mine && !mine.ok) {
      setMsg({ kind: 'err', text: mine.error ?? 'Stamping failed' });
    } else if (mine?.links) {
      setStampLinks(mine.links);
    }
  }

  return (
    <div className="grid gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-exposure to-brand text-lg font-bold text-ink-950 shadow-lg shadow-brand/20">
            {initials(crew.personal.firstName, crew.personal.lastName)}
          </div>
          <div>
            <h2 className="text-xl font-bold leading-tight">{name || 'Unnamed crew'}</h2>
            <p className="text-sm text-paper/60">{crew.personal.email}</p>
          </div>
        </div>
        <StatusBadge status={c.status} />
      </div>

      {/* Identity & documents */}
      <section className="overflow-hidden rounded-2xl border border-ink-800 bg-ink-900/40">
        <SectionLabel>Identity &amp; documents</SectionLabel>
        <div className="divide-y divide-ink-800">
          <Row label="Phone" value={crew.personal.phone} dir="ltr" />
          <Row label="Nationality" value={effNationality} edited={Boolean(o.nationality?.trim())} />
          <Row label="Date of birth" value={crew.personal.dob} dir="ltr" />
          <Row
            label="Emirates ID"
            value={effEmiratesId}
            dir="ltr"
            edited={Boolean(o.emiratesId?.trim())}
          />
          <Row
            label="Passport"
            value={effPassport}
            dir="ltr"
            edited={Boolean(o.passport?.trim())}
          />
          <Row label="IBAN" value={maskIban(c.iban)} dir="ltr" />
          {o.crewName?.trim() && <Row label="Name on contract" value={effName} edited />}
          {o.projectName?.trim() && (
            <Row label="Project on contract" value={o.projectName.trim()} edited />
          )}
        </div>
      </section>

      {/* Contract terms */}
      <section className="overflow-hidden rounded-2xl border border-ink-800 bg-ink-900/40">
        <div className="flex items-center justify-between">
          <SectionLabel>Contract terms</SectionLabel>
          <button
            type="button"
            onClick={() => {
              setMsg(null);
              setEditing(true);
            }}
            className="mr-3 mt-2 inline-flex items-center gap-1.5 rounded-lg border border-ink-600 px-2.5 py-1 text-xs font-medium text-paper/80 transition hover:border-exposure hover:text-exposure"
          >
            ✏️ Edit fields
          </button>
        </div>
        <div className="divide-y divide-ink-800">
          <Row label="Role" value={c.role} />
          <Row
            label="Amount A"
            value={c.amountX != null ? `${c.amountX.toLocaleString()} AED` : undefined}
            dir="ltr"
          />
          <Row
            label="Amount B"
            value={c.amountY != null ? `${c.amountY.toLocaleString()} AED` : undefined}
            dir="ltr"
          />
          <Row
            label="Period"
            value={c.dateFrom && c.dateTo ? `${c.dateFrom} → ${c.dateTo}` : undefined}
            dir="ltr"
          />
          <Row
            label="Contract A"
            value={contractState(crew.signatures?.contractX, c.signUrlX)}
          />
          <Row
            label="Contract B"
            value={contractState(crew.signatures?.contractY, c.signUrlY)}
          />
        </div>
      </section>

      {msg && (
        <p
          className={`rounded-lg px-4 py-2.5 text-sm ${
            msg.kind === 'ok' ? 'bg-green-500/10 text-green-300' : 'bg-red-500/10 text-red-400'
          }`}
        >
          {msg.text}
        </p>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <button className="btn-primary" onClick={() => { setMsg(null); setEditing(true); }}>
          ✏️ Edit Contract Fields
        </button>
        {crew.documents.driveFolder && (
          <a
            className="btn-ghost"
            href={crew.documents.driveFolder}
            target="_blank"
            rel="noreferrer"
          >
            👁️ Documents
          </a>
        )}
        <a className="btn-ghost" href={`tel:${crew.personal.phone}`}>
          📞 Call
        </a>
        <a className="btn-ghost" href={`mailto:${crew.personal.email}`}>
          ✉️ Email
        </a>
      </div>

      {(links.X || links.Y) && (
        <section className="rounded-xl border border-ink-800 divide-y divide-ink-800">
          <p className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-paper/50">
            Generated contracts
          </p>
          {links.X && (
            <a
              className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-ink-800"
              href={links.X}
              target="_blank"
              rel="noreferrer"
            >
              <span className="font-medium">📄 Contract A</span>
              <span className="text-paper/50">View ↗</span>
            </a>
          )}
          {links.Y && (
            <a
              className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-ink-800"
              href={links.Y}
              target="_blank"
              rel="noreferrer"
            >
              <span className="font-medium">📄 Contract B</span>
              <span className="text-paper/50">View ↗</span>
            </a>
          )}
        </section>
      )}

      {/* Live signing links. The crew member got these by email; copying one
          lets an admin re-send it over WhatsApp without re-issuing the email. */}
      {(signLinks.X || signLinks.Y) && (
        <section className="rounded-xl border border-ink-800 divide-y divide-ink-800">
          <p className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-paper/50">
            Signing links (phone)
          </p>
          {(['X', 'Y'] as ContractType[]).map((type) => {
            const url = signLinks[type];
            if (!url) return null;
            const signed =
              type === 'X'
                ? crew.signatures?.contractX?.signed
                : crew.signatures?.contractY?.signed;
            return (
              <div key={type} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-sm font-medium">
                  ✍️ Contract {type === 'X' ? 'A' : 'B'}
                  {signed && <span className="ml-2 text-xs text-green-400">signed</span>}
                </span>
                <div className="flex shrink-0 gap-2">
                  <CopyButton value={url} disabled={signed} />
                  <a
                    className="rounded-lg border border-ink-600 px-2.5 py-1 text-xs text-paper/80 hover:border-exposure hover:text-exposure"
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open ↗
                  </a>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* Signed copies, filed automatically however they arrived. */}
      {signedAny && (
        <section className="rounded-xl border border-ink-800 divide-y divide-ink-800">
          <p className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-paper/50">
            Signed contracts
          </p>
          {(['X', 'Y'] as ContractType[]).map((type) => {
            const sig =
              type === 'X' ? crew.signatures?.contractX : crew.signatures?.contractY;
            if (!sig?.signed) return null;
            return (
              <a
                key={type}
                className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-ink-800"
                href={sig.driveLink ?? '#'}
                target="_blank"
                rel="noreferrer"
              >
                <span>
                  <span className="font-medium">✅ Contract {type === 'X' ? 'A' : 'B'}</span>
                  <span className="ml-2 text-xs text-paper/50">
                    {methodLabel(sig.method)}
                    {sig.timestamp ? ` · ${new Date(sig.timestamp).toLocaleDateString()}` : ''}
                  </span>
                </span>
                <span className="shrink-0 text-paper/50">View ↗</span>
              </a>
            );
          })}
        </section>
      )}

      {/* Which contract(s) to act on. Every PDF is bilingual (EN | AR). */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-paper/60">Apply to</span>
        <div className="flex overflow-hidden rounded-xl border border-ink-600">
          {SCOPES.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setScopeKey(s.key)}
              className={`px-4 py-2 text-sm ${
                scopeKey === s.key ? 'bg-exposure text-ink-950' : 'text-paper/70 hover:bg-ink-800'
              }`}
            >
              {s.key === 'both' ? 'Both' : s.key}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <button
          className="btn-ghost w-full"
          disabled={busy || !ready}
          onClick={onGenerate}
          title={ready ? 'Build the PDF(s) and view them — nothing is sent' : 'Set role, amount(s), dates and IBAN first'}
        >
          {busy ? 'Working…' : `📄 Generate & View (${scope.key === 'both' ? 'A+B' : scope.key})`}
        </button>
        <button
          className="btn-primary w-full"
          disabled={busy || !ready}
          onClick={onSend}
          title={
            ready
              ? 'Email each contract separately: the PDF attached, plus a link to sign on a phone'
              : 'Set role, amount(s), dates and IBAN first'
          }
        >
          {busy
            ? 'Working…'
            : `${alreadySent ? '🔄 Resend' : '✉️ Email'} ${scope.key === 'both' ? 'A+B' : scope.key} for signature`}
        </button>
      </div>
      {!ready && (
        <p className="-mt-1 text-center text-xs text-paper/50">
          Set role, the selected amount(s), dates and IBAN to enable generating or sending.
        </p>
      )}

      {/* Company stamp — only meaningful once at least one contract is signed. */}
      {signedAny && (
        <button className="btn-ghost w-full" disabled={busy} onClick={onStamp}>
          {busy ? 'Working…' : '🏷️ Apply company stamp to signed contract(s)'}
        </button>
      )}

      {(stampLinks.X || stampLinks.Y) && (
        <section className="rounded-xl border border-ink-800 divide-y divide-ink-800">
          <p className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-paper/50">
            Stamped contracts
          </p>
          {stampLinks.X && (
            <a
              className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-ink-800"
              href={stampLinks.X}
              target="_blank"
              rel="noreferrer"
            >
              <span className="font-medium">🏷️ Contract A (stamped)</span>
              <span className="text-paper/50">View ↗</span>
            </a>
          )}
          {stampLinks.Y && (
            <a
              className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-ink-800"
              href={stampLinks.Y}
              target="_blank"
              rel="noreferrer"
            >
              <span className="font-medium">🏷️ Contract B (stamped)</span>
              <span className="text-paper/50">View ↗</span>
            </a>
          )}
        </section>
      )}

      <FieldsModal
        open={editing}
        crew={crew}
        busy={busy}
        onClose={() => setEditing(false)}
        onSave={(patch) => run(() => updateCrew(crew.id, patch), 'Contract fields saved ✓')}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Comprehensive contract-field editor
// ---------------------------------------------------------------------------

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="field-label">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-paper/45">{hint}</p>}
    </div>
  );
}

function FieldsModal({
  open,
  crew,
  busy,
  onClose,
  onSave,
}: {
  open: boolean;
  crew: CrewMember;
  busy: boolean;
  onClose: () => void;
  onSave: (patch: CrewPatch) => void;
}) {
  const c = crew.contract;
  const o = c.overrides ?? {};
  const derivedName = `${crew.personal.firstName} ${crew.personal.lastName}`.trim();
  const derivedEmiratesId = crew.documents.emiratesId ?? '';
  const derivedPassport = crew.documents.passport ?? '';
  const derivedNationality = crew.personal.nationality ?? '';

  // Pre-fill with the effective value; on save, a value equal to the intake
  // default is stored as blank so it keeps tracking the source.
  const [name, setName] = useState(o.crewName?.trim() || derivedName);
  const [role, setRole] = useState(c.role ?? '');
  const [project, setProject] = useState(o.projectName?.trim() || '');
  const [amountX, setAmountX] = useState(c.amountX?.toString() ?? '');
  const [amountY, setAmountY] = useState(c.amountY?.toString() ?? '');
  const [dateFrom, setDateFrom] = useState(c.dateFrom ?? '');
  const [dateTo, setDateTo] = useState(c.dateTo ?? '');
  const [iban, setIban] = useState(c.iban ?? '');
  const [emiratesId, setEmiratesId] = useState(o.emiratesId?.trim() || derivedEmiratesId);
  const [passport, setPassport] = useState(o.passport?.trim() || derivedPassport);
  const [nationality, setNationality] = useState(o.nationality?.trim() || derivedNationality);

  const datesValid = !dateFrom || !dateTo || dateFrom <= dateTo;
  const ibanClean = iban.replace(/\s/g, '').toUpperCase();
  const ibanValid = !ibanClean || /^AE\d{21}$/.test(ibanClean);
  const amountsValid =
    (amountX === '' || Number(amountX) >= 0) && (amountY === '' || Number(amountY) >= 0);
  const canSave = datesValid && ibanValid && amountsValid && !busy;

  function submit() {
    const eq = (a: string, b: string) => a.trim() === b.trim();
    const patch: CrewPatch = {
      overrides: {
        crewName: eq(name, derivedName) ? '' : name.trim(),
        projectName: project.trim(),
        emiratesId: eq(emiratesId, derivedEmiratesId) ? '' : emiratesId.trim(),
        passport: eq(passport, derivedPassport) ? '' : passport.trim(),
        nationality: eq(nationality, derivedNationality) ? '' : nationality.trim(),
      },
    };
    if (role.trim()) patch.role = role.trim();
    if (amountX !== '') patch.amountX = Number(amountX);
    if (amountY !== '') patch.amountY = Number(amountY);
    if (dateFrom) patch.dateFrom = dateFrom;
    if (dateTo) patch.dateTo = dateTo;
    if (ibanClean) patch.iban = ibanClean;
    onSave(patch);
  }

  return (
    <Modal open={open} title="Edit contract fields" onClose={onClose}>
      <p className="-mt-1 mb-4 text-sm text-paper/55">
        These values are printed on the bilingual contract and pre-filled into the
        signing request. Leave a document/identity field as-is to keep the crew's
        submitted value.
      </p>

      <div className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name on contract">
            <input className="field-input" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Role">
            <input
              className="field-input"
              list="role-suggestions"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. Drone Assistant"
            />
            <datalist id="role-suggestions">
              <option value="Drone Assistant" />
              <option value="Drone Operator" />
              <option value="Camera Operator" />
              <option value="Gaffer" />
              <option value="Production Assistant" />
              <option value="Sound Engineer" />
            </datalist>
          </Field>
        </div>

        <Field label="Project name" hint="Leave blank to use the crew's project name.">
          <input
            className="field-input"
            value={project}
            onChange={(e) => setProject(e.target.value)}
            placeholder="Defaults to the project name"
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Amount A — Contract X (AED)">
            <input
              className="field-input"
              type="number"
              min={0}
              dir="ltr"
              value={amountX}
              onChange={(e) => setAmountX(e.target.value)}
            />
          </Field>
          <Field label="Amount B — Contract Y (AED)">
            <input
              className="field-input"
              type="number"
              min={0}
              dir="ltr"
              value={amountY}
              onChange={(e) => setAmountY(e.target.value)}
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Start date">
            <input
              className="field-input"
              type="date"
              dir="ltr"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </Field>
          <Field label="End date">
            <input
              className={`field-input ${!datesValid ? 'field-input-error' : ''}`}
              type="date"
              dir="ltr"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </Field>
        </div>
        {!datesValid && <p className="-mt-2 field-error">End date must be on or after start date.</p>}

        <Field label="IBAN" hint="UAE IBAN — AE followed by 21 digits.">
          <input
            className={`field-input ${!ibanValid ? 'field-input-error' : ''}`}
            dir="ltr"
            value={iban}
            onChange={(e) => setIban(e.target.value)}
            placeholder="AE________________________"
          />
        </Field>
        {!ibanValid && <p className="-mt-2 field-error">Enter a valid UAE IBAN (AE + 21 digits).</p>}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Emirates ID">
            <input
              className="field-input"
              dir="ltr"
              value={emiratesId}
              onChange={(e) => setEmiratesId(e.target.value)}
              placeholder="784-YYYY-NNNNNNN-C"
            />
          </Field>
          <Field label="Passport">
            <input
              className="field-input"
              dir="ltr"
              value={passport}
              onChange={(e) => setPassport(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Nationality">
          <input
            className="field-input"
            value={nationality}
            onChange={(e) => setNationality(e.target.value)}
          />
        </Field>
      </div>

      <div className="mt-5 flex gap-2">
        <button className="btn-ghost flex-1" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button className="btn-primary flex-1" disabled={!canSave} onClick={submit}>
          {busy ? 'Saving…' : 'Save fields'}
        </button>
      </div>
    </Modal>
  );
}
