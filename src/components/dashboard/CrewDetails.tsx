'use client';

import { useState } from 'react';
import { Modal } from './Modal';
import { StatusBadge } from './StatusBadge';
import type { CrewMember } from '@/lib/types';
import {
  generateContracts,
  sendContracts,
  stampContracts,
  updateCrew,
  type ContractLang,
  type ContractLinks,
} from '@/lib/api-client';

function maskIban(iban?: string): string {
  if (!iban) return '—';
  const last4 = iban.slice(-4);
  return `${'•'.repeat(Math.max(iban.length - 4, 4))} ${last4}`;
}

function Row({ label, value, dir }: { label: string; value?: string; dir?: 'ltr' }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <span className="text-sm text-paper/60">{label}</span>
      <span className="text-sm font-medium" dir={dir}>
        {value || '—'}
      </span>
    </div>
  );
}

type ActiveModal = 'role' | 'amounts' | 'dates' | null;

export function CrewDetails({ crew }: { crew: CrewMember }) {
  const [modal, setModal] = useState<ActiveModal>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const c = crew.contract;
  const [links, setLinks] = useState<ContractLinks>({ X: c.pdfLinkX, Y: c.pdfLinkY });
  const [stampLinks, setStampLinks] = useState<ContractLinks>({
    X: c.stampLinkX,
    Y: c.stampLinkY,
  });
  const [lang, setLang] = useState<ContractLang>(c.language === 'ar' ? 'ar' : 'en');
  const name = `${crew.personal.firstName} ${crew.personal.lastName}`.trim();
  const signedAny =
    crew.signatures.contractX.signed || crew.signatures.contractY.signed;
  const ready =
    Boolean(c.role) &&
    c.amountX != null &&
    c.amountY != null &&
    Boolean(c.dateFrom) &&
    Boolean(c.dateTo) &&
    Boolean(c.iban);
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
      setModal(null);
      return result;
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Failed' });
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  const langName = lang === 'ar' ? 'Arabic' : 'English';

  async function onGenerate() {
    const res = await run(
      () => generateContracts(crew.id, lang),
      `Contracts generated in ${langName} — open them below to review. Nothing was sent.`,
    );
    if (res?.links) setLinks(res.links);
  }

  async function onSend() {
    const verb = alreadySent ? 'resent' : 'sent';
    const res = await run(
      () => sendContracts(crew.id, lang),
      `Contracts generated in ${langName} and ${verb} to the crew member ✓`,
    );
    if (res?.links) setLinks(res.links);
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">{name}</h2>
          <p className="text-sm text-paper/60">{crew.personal.email}</p>
        </div>
        <StatusBadge status={c.status} />
      </div>

      <section className="rounded-xl border border-ink-800 divide-y divide-ink-800">
        <Row label="Phone" value={crew.personal.phone} dir="ltr" />
        <Row label="Nationality" value={crew.personal.nationality} />
        <Row label="Date of birth" value={crew.personal.dob} dir="ltr" />
        <Row label="Emirates ID" value={crew.documents.emiratesId} dir="ltr" />
        <Row label="Passport" value={crew.documents.passport} dir="ltr" />
        <Row label="IBAN" value={maskIban(c.iban)} dir="ltr" />
        <Row label="Language" value={c.language === 'ar' ? 'العربية' : 'English'} />
      </section>

      <section className="rounded-xl border border-ink-800 divide-y divide-ink-800">
        <Row label="Role" value={c.role} />
        <Row
          label="Amount X"
          value={c.amountX != null ? `${c.amountX.toLocaleString()} AED` : undefined}
          dir="ltr"
        />
        <Row
          label="Amount Y"
          value={c.amountY != null ? `${c.amountY.toLocaleString()} AED` : undefined}
          dir="ltr"
        />
        <Row label="Period" value={c.dateFrom && c.dateTo ? `${c.dateFrom} → ${c.dateTo}` : undefined} dir="ltr" />
        <Row
          label="Contract X"
          value={crew.signatures.contractX.signed ? '✓ Signed' : c.status === 'sent' || c.status === 'signed_y' ? 'Awaiting signature' : 'Not sent'}
        />
        <Row
          label="Contract Y"
          value={crew.signatures.contractY.signed ? '✓ Signed' : c.status === 'sent' || c.status === 'signed_x' ? 'Awaiting signature' : 'Not sent'}
        />
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

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <button className="btn-ghost" onClick={() => setModal('role')}>
          📋 Assign Role
        </button>
        <button className="btn-ghost" onClick={() => setModal('amounts')}>
          💰 Set Amounts
        </button>
        <button className="btn-ghost" onClick={() => setModal('dates')}>
          📅 Set Dates
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

      {/* Contract language: name always stays in English, the rest follows this. */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-paper/60">Contract language</span>
        <div className="flex overflow-hidden rounded-xl border border-ink-600">
          {(['en', 'ar'] as ContractLang[]).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              className={`px-4 py-2 text-sm ${
                lang === l ? 'bg-exposure text-ink-950' : 'text-paper/70 hover:bg-ink-800'
              }`}
            >
              {l === 'en' ? 'English' : 'العربية'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <button
          className="btn-ghost w-full"
          disabled={busy || !ready}
          onClick={onGenerate}
          title={ready ? 'Build the PDFs and view them — nothing is sent' : 'Set role, both amounts, dates and IBAN first'}
        >
          {busy ? 'Working…' : '📄 Generate & View'}
        </button>
        <button
          className="btn-primary w-full"
          disabled={busy || !ready}
          onClick={onSend}
          title={ready ? 'Generate, create signing requests and email the crew member' : 'Set role, both amounts, dates and IBAN first'}
        >
          {busy ? 'Working…' : alreadySent ? '🔄 Generate & Resend' : '✉️ Generate & Send'}
        </button>
      </div>
      {!ready && (
        <p className="-mt-1 text-center text-xs text-paper/50">
          Set role, both amounts, dates and IBAN to enable generating or sending.
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

      {/* Modals */}
      <RoleModal
        open={modal === 'role'}
        initial={c.role ?? ''}
        busy={busy}
        onClose={() => setModal(null)}
        onSave={(role) => run(() => updateCrew(crew.id, { role }), 'Role saved ✓')}
      />
      <AmountsModal
        open={modal === 'amounts'}
        initialX={c.amountX}
        initialY={c.amountY}
        busy={busy}
        onClose={() => setModal(null)}
        onSave={(amountX, amountY) =>
          run(() => updateCrew(crew.id, { amountX, amountY }), 'Amounts saved ✓')
        }
      />
      <DatesModal
        open={modal === 'dates'}
        initialFrom={c.dateFrom ?? ''}
        initialTo={c.dateTo ?? ''}
        busy={busy}
        onClose={() => setModal(null)}
        onSave={(dateFrom, dateTo) =>
          run(() => updateCrew(crew.id, { dateFrom, dateTo }), 'Dates saved ✓')
        }
      />
    </div>
  );
}

function RoleModal({
  open,
  initial,
  busy,
  onClose,
  onSave,
}: {
  open: boolean;
  initial: string;
  busy: boolean;
  onClose: () => void;
  onSave: (role: string) => void;
}) {
  const [role, setRole] = useState(initial);
  return (
    <Modal open={open} title="Assign Role" onClose={onClose}>
      <label className="field-label">Role</label>
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
      <button
        className="btn-primary mt-4 w-full"
        disabled={busy || !role.trim()}
        onClick={() => onSave(role.trim())}
      >
        Save
      </button>
    </Modal>
  );
}

function AmountsModal({
  open,
  initialX,
  initialY,
  busy,
  onClose,
  onSave,
}: {
  open: boolean;
  initialX?: number;
  initialY?: number;
  busy: boolean;
  onClose: () => void;
  onSave: (x: number, y: number) => void;
}) {
  const [x, setX] = useState(initialX?.toString() ?? '');
  const [y, setY] = useState(initialY?.toString() ?? '');
  const valid = Number(x) >= 0 && Number(y) >= 0 && x !== '' && y !== '';
  return (
    <Modal open={open} title="Set Amounts (AED)" onClose={onClose}>
      <div className="grid gap-3">
        <div>
          <label className="field-label">Amount X</label>
          <input
            className="field-input"
            type="number"
            min={0}
            value={x}
            onChange={(e) => setX(e.target.value)}
          />
        </div>
        <div>
          <label className="field-label">Amount Y</label>
          <input
            className="field-input"
            type="number"
            min={0}
            value={y}
            onChange={(e) => setY(e.target.value)}
          />
        </div>
      </div>
      <button
        className="btn-primary mt-4 w-full"
        disabled={busy || !valid}
        onClick={() => onSave(Number(x), Number(y))}
      >
        Save
      </button>
    </Modal>
  );
}

function DatesModal({
  open,
  initialFrom,
  initialTo,
  busy,
  onClose,
  onSave,
}: {
  open: boolean;
  initialFrom: string;
  initialTo: string;
  busy: boolean;
  onClose: () => void;
  onSave: (from: string, to: string) => void;
}) {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const valid = from && to && from <= to;
  return (
    <Modal open={open} title="Set Dates" onClose={onClose}>
      <div className="grid gap-3">
        <div>
          <label className="field-label">From</label>
          <input
            className="field-input"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div>
          <label className="field-label">To</label>
          <input
            className="field-input"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
      </div>
      {!valid && from && to && (
        <p className="field-error">End date must be on or after start date.</p>
      )}
      <button
        className="btn-primary mt-4 w-full"
        disabled={busy || !valid}
        onClick={() => onSave(from, to)}
      >
        Save
      </button>
    </Modal>
  );
}
