'use client';

// The "Details" view: every crew member on one wide, scrollable sheet with all
// the dates, terms, identity numbers and file links visible at a glance, so an
// admin never has to open a record just to read it.

import { useMemo, useState, type ReactNode } from 'react';
import type { CrewMember, SignatureRecord } from '@/lib/types';
import { StatusBadge } from './StatusBadge';
import { projectLabel } from '@/lib/use-projects';
import { Icon, type IconName } from '@/components/ui/Icon';

/** dd/mm/yyyy for a timestamp; em dash when absent. */
function fmtDate(ts?: number): string {
  return ts ? new Date(ts).toLocaleDateString('en-GB') : '—';
}

/** dd/mm/yyyy hh:mm — used for the title attribute behind a short date. */
function fmtDateTime(ts?: number): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return `${d.toLocaleDateString('en-GB')} ${d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

/** Intake dates arrive as yyyy-mm-dd; show them the way the contract prints. */
function fmtDay(value?: string): string {
  if (!value) return '—';
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : value;
}

function fmtAed(amount?: number): string {
  return amount == null ? '—' : `${amount.toLocaleString()} AED`;
}

function fmtEmiratesId(digits?: string): string {
  if (!digits) return '—';
  const d = digits.replace(/\D/g, '');
  if (d.length !== 15) return digits;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7, 14)}-${d.slice(14)}`;
}

const TH = 'whitespace-nowrap px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider';
const TD = 'whitespace-nowrap px-3 py-3 align-middle';

type SortKey = 'name' | 'created' | 'project' | 'role' | 'dateFrom' | 'status';

export function CrewSheet({
  crew,
  projectsById,
  onOpen,
  selectedIds,
  onToggle,
  allSelected,
  onToggleAll,
}: {
  crew: CrewMember[];
  projectsById: Record<string, string>;
  onOpen: (id: string) => void;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  allSelected: boolean;
  onToggleAll: () => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>('created');
  const [asc, setAsc] = useState(false);

  const rows = useMemo(() => {
    const value = (c: CrewMember): string | number => {
      switch (sortKey) {
        case 'name':
          return `${c.personal.firstName} ${c.personal.lastName}`.toLowerCase();
        case 'project':
          return projectLabel(projectsById, c.projectId).toLowerCase();
        case 'role':
          return (c.contract.role ?? '').toLowerCase();
        case 'dateFrom':
          return c.contract.dateFrom ?? '';
        case 'status':
          return c.contract.status;
        default:
          return c.createdAt ?? 0;
      }
    };
    return [...crew].sort((a, b) => {
      const av = value(a);
      const bv = value(b);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return asc ? cmp : -cmp;
    });
  }, [crew, sortKey, asc, projectsById]);

  function sortBy(key: SortKey) {
    if (key === sortKey) {
      setAsc((v) => !v);
    } else {
      setSortKey(key);
      // Text sorts read best A→Z; dates read best newest-first.
      setAsc(key !== 'created' && key !== 'dateFrom');
    }
  }

  return (
    // The sheet is the one element allowed to scroll sideways, and it does so
    // inside its own container so the page body never does.
    <div className="overflow-x-auto rounded-2xl border border-ink-700/80 bg-ink-900/50 shadow-lift">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-ink-800 bg-ink-900/80 text-paper/[0.55]">
          <tr>
            <th scope="col" className={`${TH} sticky left-0 z-10 w-12 bg-ink-900`}>
              <label className="grid h-11 w-8 cursor-pointer place-items-center">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onToggleAll}
                  aria-label="Select every crew member shown"
                  className="h-[18px] w-[18px] cursor-pointer rounded accent-exposure"
                />
              </label>
            </th>
            <SortTh active={sortKey === 'name'} asc={asc} onClick={() => sortBy('name')}>
              Name
            </SortTh>
            <th scope="col" className={TH}>
              Contact
            </th>
            <SortTh active={sortKey === 'project'} asc={asc} onClick={() => sortBy('project')}>
              Project
            </SortTh>
            <SortTh active={sortKey === 'role'} asc={asc} onClick={() => sortBy('role')}>
              Role
            </SortTh>
            <th scope="col" className={TH}>
              Amount A
            </th>
            <th scope="col" className={TH}>
              Amount B
            </th>
            <SortTh active={sortKey === 'dateFrom'} asc={asc} onClick={() => sortBy('dateFrom')}>
              Period
            </SortTh>
            <SortTh active={sortKey === 'created'} asc={asc} onClick={() => sortBy('created')}>
              Submitted
            </SortTh>
            <th scope="col" className={TH}>
              Generated
            </th>
            <th scope="col" className={TH}>
              Sent
            </th>
            <th scope="col" className={TH}>
              Signed A
            </th>
            <th scope="col" className={TH}>
              Signed B
            </th>
            <SortTh active={sortKey === 'status'} asc={asc} onClick={() => sortBy('status')}>
              Status
            </SortTh>
            <th scope="col" className={TH}>
              Identity
            </th>
            <th scope="col" className={TH}>
              IBAN
            </th>
            <th scope="col" className={TH}>
              Files
            </th>
            <th scope="col" className={`${TH} text-right`}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-800">
          {rows.map((c) => {
            const name = `${c.personal.firstName} ${c.personal.lastName}`.trim();
            const k = c.contract;
            const o = k.overrides ?? {};
            const isSelected = selectedIds.has(c.id);
            return (
              <tr
                key={c.id}
                className={`transition duration-150 ${
                  isSelected ? 'bg-exposure/[0.06]' : 'hover:bg-ink-800/50'
                }`}
              >
                <td
                  className={`${TD} sticky left-0 z-10 ${
                    isSelected ? 'bg-[#1b1813]' : 'bg-ink-950'
                  }`}
                >
                  <label className="grid h-11 w-8 cursor-pointer place-items-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggle(c.id)}
                      aria-label={`Select ${name || 'this crew member'}`}
                      className="h-[18px] w-[18px] cursor-pointer rounded accent-exposure"
                    />
                  </label>
                </td>

                <td className={TD}>
                  <p className="font-medium">{o.crewName?.trim() || name || 'Unnamed crew'}</p>
                  <p className="text-xs text-paper/[0.55]">
                    {o.nationality?.trim() || c.personal.nationality || '—'}
                  </p>
                </td>

                <td className={TD}>
                  <a
                    className="block text-paper/[0.72] transition hover:text-exposure"
                    href={`mailto:${c.personal.email}`}
                    dir="ltr"
                  >
                    {c.personal.email}
                  </a>
                  <a
                    className="block text-xs text-paper/[0.55] transition hover:text-exposure nums"
                    dir="ltr"
                    href={`tel:${c.personal.phone}`}
                  >
                    {c.personal.phone || '—'}
                  </a>
                </td>

                <td className={TD}>
                  <span className="chip">
                    {o.projectName?.trim() || projectLabel(projectsById, c.projectId)}
                  </span>
                </td>

                <td className={`${TD} text-paper/[0.72]`}>{k.role || '—'}</td>
                <td className={`${TD} text-paper/[0.72] nums`} dir="ltr">
                  {fmtAed(k.amountX)}
                </td>
                <td className={`${TD} text-paper/[0.72] nums`} dir="ltr">
                  {fmtAed(k.amountY)}
                </td>

                <td className={`${TD} nums`} dir="ltr">
                  {k.dateFrom || k.dateTo ? (
                    <span className="text-paper/[0.72]">
                      {fmtDay(k.dateFrom)} → {fmtDay(k.dateTo)}
                    </span>
                  ) : (
                    <span className="text-paper/[0.4]">Not set</span>
                  )}
                </td>

                <DateCell ts={c.createdAt} />
                <DateCell ts={k.generatedAt} />
                <DateCell ts={k.sentAt} />

                <td className={`${TD} nums`} dir="ltr">
                  <SignCell record={c.signatures?.contractX} sent={Boolean(k.signUrlX)} />
                </td>
                <td className={`${TD} nums`} dir="ltr">
                  <SignCell record={c.signatures?.contractY} sent={Boolean(k.signUrlY)} />
                </td>

                <td className={TD}>
                  <StatusBadge status={k.status} />
                </td>

                <td className={`${TD} text-xs text-paper/[0.72] nums`} dir="ltr">
                  <p>{fmtEmiratesId(o.emiratesId?.trim() || c.documents.emiratesId)}</p>
                  <p className="text-paper/[0.4]">
                    {o.passport?.trim() || c.documents.passport || '—'}
                  </p>
                </td>

                <td className={`${TD} text-xs text-paper/[0.72] nums`} dir="ltr">
                  {k.iban || '—'}
                </td>

                <td className={TD}>
                  <div className="flex items-center gap-1">
                    <FileLink href={c.documents.driveFolder} label="Drive folder" icon="google" />
                    <FileLink href={k.pdfLinkX} label="Contract A (generated)" text="A" />
                    <FileLink href={k.pdfLinkY} label="Contract B (generated)" text="B" />
                    <FileLink
                      href={c.signatures?.contractX?.driveLink}
                      label="Contract A (signed)"
                      text="A✓"
                    />
                    <FileLink
                      href={c.signatures?.contractY?.driveLink}
                      label="Contract B (signed)"
                      text="B✓"
                    />
                    <FileLink href={k.stampLinkX} label="Contract A (stamped)" icon="stamp" />
                    <FileLink href={k.stampLinkY} label="Contract B (stamped)" icon="stamp" />
                  </div>
                </td>

                <td className={`${TD} text-right`}>
                  <button
                    onClick={() => onOpen(c.id)}
                    className="btn-ghost btn-sm"
                    aria-label={`Open details for ${name || 'this crew member'}`}
                  >
                    Open
                    <Icon name="arrowRight" className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SortTh({
  children,
  active,
  asc,
  onClick,
}: {
  children: ReactNode;
  active: boolean;
  asc: boolean;
  onClick: () => void;
}) {
  return (
    <th scope="col" className={TH} aria-sort={active ? (asc ? 'ascending' : 'descending') : 'none'}>
      <button
        onClick={onClick}
        className={`inline-flex items-center gap-1 transition hover:text-exposure ${
          active ? 'text-exposure' : ''
        }`}
      >
        {children}
        {active && <span aria-hidden="true">{asc ? '↑' : '↓'}</span>}
      </button>
    </th>
  );
}

function DateCell({ ts }: { ts?: number }) {
  return (
    <td className={`${TD} text-paper/[0.72] nums`} dir="ltr" title={fmtDateTime(ts)}>
      {ts ? fmtDate(ts) : <span className="text-paper/[0.4]">—</span>}
    </td>
  );
}

function SignCell({ record, sent }: { record?: SignatureRecord; sent: boolean }) {
  if (record?.signed) {
    return (
      <span className="text-ok" title={fmtDateTime(record.timestamp)}>
        ✓ {fmtDate(record.timestamp)}
      </span>
    );
  }
  return (
    <span className={sent ? 'text-warn' : 'text-paper/[0.4]'}>
      {sent ? 'Awaiting' : 'Not sent'}
    </span>
  );
}

/**
 * One compact link per file. Absent files still render, greyed out, so the
 * column keeps a stable shape and you can see at a glance what is missing.
 */
function FileLink({
  href,
  label,
  text,
  icon,
}: {
  href?: string;
  label: string;
  text?: string;
  icon?: IconName;
}) {
  const body = icon ? <Icon name={icon} className="h-3.5 w-3.5" /> : text;
  const shape =
    'grid h-6 min-w-6 place-items-center rounded px-1 text-[11px] font-semibold';

  if (!href) {
    return (
      <span
        className={`${shape} bg-ink-800/60 text-paper/[0.25]`}
        title={`${label} — not available`}
      >
        {body}
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={label}
      aria-label={label}
      className={`${shape} bg-ink-700 text-paper/[0.85] transition hover:bg-exposure hover:text-ink-950`}
    >
      {body}
    </a>
  );
}
