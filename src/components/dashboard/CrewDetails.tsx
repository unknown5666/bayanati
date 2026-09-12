'use client';

import { useState, type ReactNode } from 'react';
import { Modal } from './Modal';
import { StatusBadge } from './StatusBadge';
import type { CrewMember, SignatureRecord } from '@/lib/types';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Spinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';
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
  { key: 'R', label: 'Contract R', types: ['Y'] },
  { key: 'both', label: 'Both', types: ['X', 'Y'] },
];

function maskIban(iban?: string): string {
  if (!iban) return '—';
  const last4 = iban.slice(-4);
  return `${'•'.repeat(Math.max(iban.length - 4, 4))} ${last4}`;
}

function initials(first?: string, last?: string): string {
  return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase() || '—';
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
      <span className="flex shrink-0 items-center gap-1.5 text-sm text-paper/[0.72]">
        {label}
        {edited && (
          <span
            title="Edited for this contract"
            className="inline-block h-1.5 w-1.5 rounded-full bg-exposure"
          >
            <span className="sr-only">edited for this contract</span>
          </span>
        )}
      </span>
      <span className="min-w-0 truncate text-sm font-medium" dir={dir}>
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
function ContractState({
  sig,
  signUrl,
}: {
  sig: SignatureRecord | undefined;
  signUrl?: string;
}) {
  if (sig?.signed) {
    return (
      <span className="inline-flex items-center gap-1.5 text-ok">
        <Icon name="check" className="h-3.5 w-3.5" strokeWidth={2.5} />
        Signed — {methodLabel(sig.method)}
      </span>
    );
  }
  return signUrl ? (
    <span className="inline-flex items-center gap-1.5 text-info">
      <Icon name="clock" className="h-3.5 w-3.5" />
      Emailed · awaiting signature
    </span>
  ) : (
    <span className="text-paper/[0.55]">Not sent</span>
  );
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
      className={`btn btn-sm border ${
        copied
          ? 'border-ok/40 bg-ok/10 text-ok'
          : 'border-ink-600 bg-ink-850/60 font-medium text-paper/[0.82] hover:border-exposure hover:text-exposure'
      }`}
    >
      <Icon name={copied ? 'check' : 'copy'} className="h-3.5 w-3.5" />
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function SectionLabel({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <p className="panel-heading">
      <Icon name={icon} className="h-3.5 w-3.5" />
      {children}
    </p>
  );
}

/** A panel of outbound links (generated / signing / signed / stamped copies). */
function LinkRow({
  icon,
  label,
  meta,
  href,
  tone = 'default',
}: {
  icon: IconName;
  label: string;
  meta?: string;
  href: string;
  tone?: 'default' | 'ok';
}) {
  return (
    <a className="panel-row group" href={href} target="_blank" rel="noreferrer">
      <span className="flex min-w-0 items-center gap-2.5">
        <Icon
          name={icon}
          className={`h-4 w-4 ${tone === 'ok' ? 'text-ok' : 'text-paper/[0.55]'}`}
        />
        <span className="min-w-0">
          <span className="font-medium">{label}</span>
          {meta && <span className="ml-2 text-xs text-paper/[0.55]">{meta}</span>}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1 text-xs text-paper/[0.55] transition group-hover:text-exposure">
        View
        <Icon name="external" className="h-3.5 w-3.5" />
      </span>
    </a>
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
      `${scope.label} ${alreadySent ? 're-sent' : 'emailed'} with the PDF attached.`,
    );
    if (res?.links) setLinks((prev) => ({ ...prev, ...res.links }));
    if (res?.signLinks) setSignLinks((prev) => ({ ...prev, ...res.signLinks }));
  }

  async function onStamp() {
    const res = await run(
      () => stampContracts([crew.id]),
      'Company stamp applied to the signed contract(s).',
    );
    const mine = res?.results?.find((r) => r.crewId === crew.id);
    if (mine && !mine.ok) {
      setMsg({ kind: 'err', text: mine.error ?? 'Stamping failed' });
    } else if (mine?.links) {
      setStampLinks(mine.links);
    }
  }

  const scopeSuffix = scope.key === 'both' ? 'A+R' : scope.key;

  return (
    <div className="grid gap-4">
      {/* Identity header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-gradient text-lg font-bold text-ink-950 shadow-lift"
            aria-hidden="true"
          >
            {initials(crew.personal.firstName, crew.personal.lastName)}
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-xl font-bold leading-tight tracking-display">
              {name || 'Unnamed crew'}
            </h2>
            <p className="truncate text-sm text-paper/[0.72]" dir="ltr">
              {crew.personal.email}
            </p>
          </div>
        </div>
        <StatusBadge status={c.status} />
      </div>

      {/* Contact shortcuts — the two things an admin reaches for most. */}
      <div className="grid grid-cols-2 gap-2">
        <a className="btn-ghost btn-sm" href={`tel:${crew.personal.phone}`}>
          <Icon name="phone" className="h-4 w-4" />
          Call
        </a>
        <a className="btn-ghost btn-sm" href={`mailto:${crew.personal.email}`}>
          <Icon name="mail" className="h-4 w-4" />
          Email
        </a>
      </div>

      {/* Identity & documents */}
      <section className="panel">
        <SectionLabel icon="user">Identity &amp; documents</SectionLabel>
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
        {crew.documents.driveFolder && (
          <div className="border-t border-ink-800">
            <LinkRow
              icon="eye"
              label="Uploaded documents"
              meta="Drive folder"
              href={crew.documents.driveFolder}
            />
          </div>
        )}
      </section>

      {/* Contract terms */}
      <section className="panel">
        <div className="flex items-center justify-between gap-2 pr-2">
          <SectionLabel icon="document">Contract terms</SectionLabel>
          <button
            type="button"
            onClick={() => {
              setMsg(null);
              setEditing(true);
            }}
            className="btn btn-sm mt-1 border border-ink-600 font-medium text-paper/[0.82] transition hover:border-exposure hover:text-exposure"
          >
            <Icon name="edit" className="h-3.5 w-3.5" />
            Edit
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
            label="Amount R"
            value={c.amountY != null ? `${c.amountY.toLocaleString()} AED` : undefined}
            dir="ltr"
          />
          <Row
            label="Period"
            value={c.dateFrom && c.dateTo ? `${c.dateFrom} → ${c.dateTo}` : undefined}
            dir="ltr"
          />
          <div className="flex items-center justify-between gap-4 px-4 py-2.5">
            <span className="text-sm text-paper/[0.72]">Contract A</span>
            <span className="text-sm font-medium">
              <ContractState sig={crew.signatures?.contractX} signUrl={c.signUrlX} />
            </span>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-2.5">
            <span className="text-sm text-paper/[0.72]">Contract R</span>
            <span className="text-sm font-medium">
              <ContractState sig={crew.signatures?.contractY} signUrl={c.signUrlY} />
            </span>
          </div>
        </div>
      </section>

      {msg && <Alert tone={msg.kind === 'ok' ? 'ok' : 'error'}>{msg.text}</Alert>}

      {(links.X || links.Y) && (
        <section className="panel">
          <SectionLabel icon="file">Generated contracts</SectionLabel>
          <div className="divide-y divide-ink-800 border-t border-ink-800">
            {links.X && <LinkRow icon="document" label="Contract A" href={links.X} />}
            {links.Y && <LinkRow icon="document" label="Contract R" href={links.Y} />}
          </div>
        </section>
      )}

      {/* Live signing links. The crew member got these by email; copying one
          lets an admin re-send it over WhatsApp without re-issuing the email. */}
      {(signLinks.X || signLinks.Y) && (
        <section className="panel">
          <SectionLabel icon="signature">Signing links (phone)</SectionLabel>
          <div className="divide-y divide-ink-800 border-t border-ink-800">
            {(['X', 'Y'] as ContractType[]).map((type) => {
              const url = signLinks[type];
              if (!url) return null;
              const label = `Contract ${type === 'X' ? 'A' : 'R'}`;
              const signed =
                type === 'X'
                  ? crew.signatures?.contractX?.signed
                  : crew.signatures?.contractY?.signed;
              return (
                <div key={type} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="flex min-w-0 items-center gap-2.5 text-sm font-medium">
                    <Icon name="signature" className="h-4 w-4 text-paper/[0.55]" />
                    {label}
                    {signed && (
                      <span className="chip border-ok/25 bg-ok/10 text-ok">signed</span>
                    )}
                  </span>
                  <div className="flex shrink-0 gap-2">
                    <CopyButton value={url} disabled={signed} />
                    <a
                      className="btn btn-sm border border-ink-600 bg-ink-850/60 font-medium text-paper/[0.82] hover:border-exposure hover:text-exposure"
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open the signing link for ${label}`}
                    >
                      Open
                      <Icon name="external" className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Signed copies, filed automatically however they arrived. */}
      {signedAny && (
        <section className="panel">
          <SectionLabel icon="checkCircle">Signed contracts</SectionLabel>
          <div className="divide-y divide-ink-800 border-t border-ink-800">
            {(['X', 'Y'] as ContractType[]).map((type) => {
              const sig =
                type === 'X' ? crew.signatures?.contractX : crew.signatures?.contractY;
              if (!sig?.signed) return null;
              return (
                <LinkRow
                  key={type}
                  icon="checkCircle"
                  tone="ok"
                  label={`Contract ${type === 'X' ? 'A' : 'R'}`}
                  meta={`${methodLabel(sig.method)}${
                    sig.timestamp ? ` · ${new Date(sig.timestamp).toLocaleDateString()}` : ''
                  }`}
                  href={sig.driveLink ?? '#'}
                />
              );
            })}
          </div>
        </section>
      )}

      {(stampLinks.X || stampLinks.Y) && (
        <section className="panel">
          <SectionLabel icon="stamp">Stamped contracts</SectionLabel>
          <div className="divide-y divide-ink-800 border-t border-ink-800">
            {stampLinks.X && (
              <LinkRow icon="stamp" label="Contract A (stamped)" href={stampLinks.X} />
            )}
            {stampLinks.Y && (
              <LinkRow icon="stamp" label="Contract R (stamped)" href={stampLinks.Y} />
            )}
          </div>
        </section>
      )}

      {/*
        The action bar. Scope first, then the two actions it governs — reading
        top to bottom gives you "apply to [both] → [generate | send]", which is
        the order the decision is actually made in. Every PDF is bilingual.
      */}
      <section className="rounded-2xl border border-ink-700 bg-ink-900/60 p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-paper/[0.72]">Apply to</span>
          <div className="segmented" role="group" aria-label="Which contract to act on">
            {SCOPES.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setScopeKey(s.key)}
                aria-pressed={scopeKey === s.key}
                className="segmented-item"
              >
                {s.key === 'both' ? 'Both' : s.key}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button
            className="btn-ghost w-full"
            disabled={busy || !ready}
            onClick={onGenerate}
            title={
              ready
                ? 'Build the PDF(s) and view them — nothing is sent'
                : 'Set role, amount(s), dates and IBAN first'
            }
          >
            {busy ? <Spinner /> : <Icon name="file" className="h-4 w-4" />}
            {busy ? 'Working…' : `Generate & view (${scopeSuffix})`}
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
            {busy ? (
              <Spinner />
            ) : (
              <Icon name={alreadySent ? 'refresh' : 'send'} className="h-4 w-4" />
            )}
            {busy
              ? 'Working…'
              : `${alreadySent ? 'Resend' : 'Email'} ${scopeSuffix} for signature`}
          </button>
        </div>

        {!ready && (
          <p className="mt-3 flex items-start gap-1.5 text-xs text-warn">
            <Icon name="info" className="mt-px h-3.5 w-3.5" />
            Set role, the selected amount(s), dates and IBAN to enable generating or
            sending.
          </p>
        )}

        {/* Company stamp — only meaningful once at least one contract is signed. */}
        {signedAny && (
          <button className="btn-ghost mt-2 w-full" disabled={busy} onClick={onStamp}>
            {busy ? <Spinner /> : <Icon name="stamp" className="h-4 w-4" />}
            {busy ? 'Working…' : 'Apply company stamp to signed contract(s)'}
          </button>
        )}
      </section>

      <FieldsModal
        open={editing}
        crew={crew}
        busy={busy}
        onClose={() => setEditing(false)}
        onSave={(patch) => run(() => updateCrew(crew.id, patch), 'Contract fields saved.')}
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
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="field-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-paper/[0.55]">{hint}</p>}
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
      <p className="-mt-1 mb-5 flex items-start gap-2 rounded-xl border border-ink-700 bg-ink-850/60 px-3.5 py-3 text-sm leading-relaxed text-paper/[0.72]">
        <Icon name="info" className="mt-0.5 h-4 w-4 text-exposure" />
        <span>
          These values are printed on the bilingual contract and pre-filled into the
          signing request. Leave a document/identity field as-is to keep the crew&apos;s
          submitted value.
        </span>
      </p>

      <div className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name on contract" htmlFor="f-name">
            <input
              id="f-name"
              className="field-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Role" htmlFor="f-role">
            <input
              id="f-role"
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

        <Field
          label="Project name"
          htmlFor="f-project"
          hint="Leave blank to use the crew's project name."
        >
          <input
            id="f-project"
            className="field-input"
            value={project}
            onChange={(e) => setProject(e.target.value)}
            placeholder="Defaults to the project name"
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Amount A — Contract A (AED)" htmlFor="f-amount-x">
            <input
              id="f-amount-x"
              className="field-input nums"
              type="number"
              min={0}
              dir="ltr"
              value={amountX}
              onChange={(e) => setAmountX(e.target.value)}
            />
          </Field>
          <Field label="Amount R — Contract R (AED)" htmlFor="f-amount-y">
            <input
              id="f-amount-y"
              className="field-input nums"
              type="number"
              min={0}
              dir="ltr"
              value={amountY}
              onChange={(e) => setAmountY(e.target.value)}
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Start date" htmlFor="f-date-from">
            <input
              id="f-date-from"
              className="field-input"
              type="date"
              dir="ltr"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </Field>
          <Field label="End date" htmlFor="f-date-to">
            <input
              id="f-date-to"
              className={`field-input ${!datesValid ? 'field-input-error' : ''}`}
              type="date"
              dir="ltr"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              aria-invalid={!datesValid || undefined}
              aria-describedby={!datesValid ? 'f-date-error' : undefined}
            />
          </Field>
        </div>
        {!datesValid && (
          <p id="f-date-error" className="-mt-2 field-error" role="alert">
            <Icon name="alert" className="mt-0.5 h-3.5 w-3.5" />
            End date must be on or after start date.
          </p>
        )}

        <Field label="IBAN" htmlFor="f-iban" hint="UAE IBAN — AE followed by 21 digits.">
          <input
            id="f-iban"
            className={`field-input nums ${!ibanValid ? 'field-input-error' : ''}`}
            dir="ltr"
            value={iban}
            onChange={(e) => setIban(e.target.value)}
            placeholder="AE________________________"
            aria-invalid={!ibanValid || undefined}
            aria-describedby={!ibanValid ? 'f-iban-error' : undefined}
          />
        </Field>
        {!ibanValid && (
          <p id="f-iban-error" className="-mt-2 field-error" role="alert">
            <Icon name="alert" className="mt-0.5 h-3.5 w-3.5" />
            Enter a valid UAE IBAN (AE + 21 digits).
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Emirates ID" htmlFor="f-eid">
            <input
              id="f-eid"
              className="field-input nums"
              dir="ltr"
              value={emiratesId}
              onChange={(e) => setEmiratesId(e.target.value)}
              placeholder="784-YYYY-NNNNNNN-C"
            />
          </Field>
          <Field label="Passport" htmlFor="f-passport">
            <input
              id="f-passport"
              className="field-input"
              dir="ltr"
              value={passport}
              onChange={(e) => setPassport(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Nationality" htmlFor="f-nationality">
          <input
            id="f-nationality"
            className="field-input"
            value={nationality}
            onChange={(e) => setNationality(e.target.value)}
          />
        </Field>
      </div>

      <div className="mt-6 flex gap-2 border-t border-ink-800 pt-5">
        <button className="btn-ghost flex-1" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button className="btn-primary flex-1" disabled={!canSave} onClick={submit}>
          {busy ? <Spinner /> : <Icon name="check" className="h-4 w-4" />}
          {busy ? 'Saving…' : 'Save fields'}
        </button>
      </div>
    </Modal>
  );
}
