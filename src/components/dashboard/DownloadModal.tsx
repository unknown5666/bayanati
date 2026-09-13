'use client';

// One place to download contracts for one or many crew: pick the contract,
// fresh, signed or stamped copy, which ID scans to attach after the contract,
// and whether to get a ZIP of separate files or a single combined PDF.

import { useEffect, useMemo, useState } from 'react';
import { Modal } from './Modal';
import { downloadContracts, type AttachmentKey, type ContractType } from '@/lib/api-client';
import type { CrewMember } from '@/lib/types';
import { Segmented } from '@/components/ui/Segmented';
import { Spinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';
import { Icon } from '@/components/ui/Icon';

type Kind = 'contract' | 'signed' | 'stamped';
type StampMissing = 'save' | 'apply' | 'skip';

const CONTRACTS: { value: 'A' | 'R' | 'both'; label: string; types: ContractType[] }[] = [
  { value: 'A', label: 'A', types: ['X'] },
  { value: 'R', label: 'R', types: ['Y'] },
  { value: 'both', label: 'A+R', types: ['X', 'Y'] },
];

const ATTACH: { key: AttachmentKey; label: string }[] = [
  { key: 'eidFront', label: 'Emirates ID — front' },
  { key: 'eidBack', label: 'Emirates ID — back' },
  { key: 'passport', label: 'Passport' },
];

const MISSING_OPTIONS: { value: StampMissing; title: string; hint: string }[] = [
  {
    value: 'save',
    title: 'Stamp & file in Drive',
    hint: 'Seal the signed copy now and keep it — next time it is ready.',
  },
  {
    value: 'apply',
    title: 'Stamp this download only',
    hint: 'Seal the copies you get, leave Drive untouched.',
  },
  { value: 'skip', title: 'Skip them', hint: 'Only download contracts already stamped.' },
];

/** Where each selected contract stands on the way to a stamped copy. */
function tally(crew: CrewMember[], types: ContractType[]) {
  let stamped = 0;
  let unstamped = 0;
  let unsigned = 0;
  for (const c of crew) {
    for (const t of types) {
      const sig = t === 'X' ? c.signatures?.contractX : c.signatures?.contractY;
      const stampLink = t === 'X' ? c.contract?.stampLinkX : c.contract?.stampLinkY;
      if (stampLink) stamped++;
      else if (sig?.signed) unstamped++;
      else unsigned++;
    }
  }
  return { stamped, unstamped, unsigned, signed: stamped + unstamped };
}

export function DownloadModal({
  crew,
  onClose,
  onDone,
}: {
  crew: CrewMember[] | null;
  onClose: () => void;
  onDone: (message: string, kind: 'ok' | 'err') => void;
}) {
  const [contract, setContract] = useState<'A' | 'R' | 'both'>('both');
  const [kind, setKind] = useState<Kind>('contract');
  const [stampMissing, setStampMissing] = useState<StampMissing>('save');
  const [attach, setAttach] = useState<Set<AttachmentKey>>(new Set());
  const [format, setFormat] = useState<'zip' | 'pdf'>('zip');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = Boolean(crew?.length);
  const count = crew?.length ?? 0;
  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  const types = CONTRACTS.find((c) => c.value === contract)!.types;
  const t = useMemo(() => tally(crew ?? [], types), [crew, types]);
  const total = t.stamped + t.unstamped + t.unsigned;
  const willStamp = kind === 'stamped' && t.unstamped > 0 && stampMissing !== 'skip';

  const toggle = (k: AttachmentKey) =>
    setAttach((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  async function submit() {
    if (!crew || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await downloadContracts(
        crew.map((c) => c.id),
        { types, kind, stampMissing, attach: [...attach], format },
      );
      let base = `Downloaded ${res.count} contract${res.count === 1 ? '' : 's'}${format === 'pdf' ? ' as one PDF' : ' as a ZIP'}.`;
      if (res.stampedNow) {
        base += ` Stamped ${res.stampedNow} on the spot${stampMissing === 'save' ? ' and filed them in Drive' : ''}.`;
      }
      onDone(res.skipped ? `${base} Skipped — ${res.skipped}` : base, 'ok');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setBusy(false);
    }
  }

  const name =
    count === 1 ? `${crew![0].personal.firstName} ${crew![0].personal.lastName}`.trim() : `${count} crew`;

  const nothingReady =
    (kind === 'signed' && t.signed === 0) ||
    (kind === 'stamped' && (stampMissing === 'skip' ? t.stamped === 0 : t.signed === 0));

  return (
    <Modal open={open} title={`Download contracts — ${name}`} onClose={onClose}>
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
          <div>
            <p className="field-label">Contract</p>
            <Segmented label="Contract" value={contract} onChange={setContract} options={CONTRACTS} />
          </div>
          <div>
            <p className="field-label">Copy</p>
            <Segmented
              label="Copy"
              value={kind}
              onChange={setKind}
              options={[
                { value: 'contract', label: 'Unsigned' },
                { value: 'signed', label: 'Signed' },
                { value: 'stamped', label: 'Stamped', title: 'Signed and carrying the company seal' },
              ]}
            />
          </div>
        </div>

        {kind === 'signed' && (
          <p className="flex items-center gap-2 text-sm text-paper/[0.7]">
            <Icon name="signature" className="h-4 w-4 text-exposure" />
            <span>
              <span className="nums font-semibold text-paper">{t.signed}</span> of{' '}
              <span className="nums">{total}</span> selected contract{total === 1 ? '' : 's'} signed.
            </span>
          </p>
        )}

        {kind === 'stamped' && (
          <StampPanel
            tally={t}
            total={total}
            stampMissing={stampMissing}
            onStampMissing={setStampMissing}
          />
        )}

        <div>
          <p className="field-label">Attach after the contract</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {ATTACH.map((a) => (
              <label
                key={a.key}
                className="flex cursor-pointer items-center gap-2 rounded-xl border border-ink-700/80 bg-ink-900/50 px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={attach.has(a.key)}
                  onChange={() => toggle(a.key)}
                  className="h-[18px] w-[18px] cursor-pointer rounded accent-exposure"
                />
                {a.label}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-paper/[0.55]">
            Image scans share one page after the contract; PDF scans follow as their own pages.
          </p>
        </div>

        <div>
          <p className="field-label">Output</p>
          <Segmented
            label="Output"
            value={format}
            onChange={setFormat}
            options={[
              { value: 'zip', label: 'Separate files (ZIP)' },
              { value: 'pdf', label: 'One combined PDF' },
            ]}
          />
        </div>

        {error && <Alert tone="error">{error}</Alert>}

        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-quiet" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} disabled={busy || nothingReady}>
            {busy ? (
              <Spinner />
            ) : (
              <Icon name={willStamp ? 'stamp' : 'download'} className="h-4 w-4" />
            )}
            {busy ? (willStamp ? 'Stamping…' : 'Compiling…') : willStamp ? 'Stamp & download' : 'Download'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function StampPanel({
  tally: t,
  total,
  stampMissing,
  onStampMissing,
}: {
  tally: ReturnType<typeof tally>;
  total: number;
  stampMissing: StampMissing;
  onStampMissing: (v: StampMissing) => void;
}) {
  const stampedPct = total ? (t.stamped / total) * 100 : 0;
  const unstampedPct = total ? (t.unstamped / total) * 100 : 0;

  return (
    <div className="relative animate-rise-in overflow-hidden rounded-2xl border border-exposure/20 bg-gradient-to-br from-ink-850 via-ink-900 to-brand-deep/30 p-4 shadow-lift">
      {/* Warm light leak behind the seal. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-10 -top-12 h-44 w-44 rounded-full bg-exposure/10 blur-3xl"
      />

      <div className="relative flex items-center gap-4">
        <div className="relative grid h-24 w-24 shrink-0 place-items-center rounded-full bg-paper/[0.93] shadow-float ring-1 ring-exposure/30">
          <span
            aria-hidden
            className="absolute inset-2 animate-ink-bloom rounded-full bg-brand/40 blur-md"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/oep-stamp.png"
            alt="Over Exposure Productions company seal"
            className="relative h-[84px] w-[84px] animate-stamp-press object-contain mix-blend-multiply"
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-exposure">
            Company seal
          </p>
          <p className="mt-0.5 text-sm text-paper/[0.8]">
            {t.signed === 0
              ? 'Nothing selected is signed yet — a seal goes on top of a signed copy.'
              : t.unstamped === 0
                ? 'Every signed contract here already carries the seal.'
                : `${t.unstamped} signed contract${t.unstamped === 1 ? '' : 's'} still missing the seal.`}
          </p>

          <div
            className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-ink-700"
            role="img"
            aria-label={`${t.stamped} stamped, ${t.unstamped} signed without stamp, ${t.unsigned} not signed`}
          >
            <span className="bg-ok transition-all duration-500 ease-entrance" style={{ width: `${stampedPct}%` }} />
            <span
              className="bg-exposure-gradient transition-all duration-500 ease-entrance"
              style={{ width: `${unstampedPct}%` }}
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="chip nums border-ok/25 bg-ok/10 text-ok">
              <Icon name="checkCircle" className="h-3.5 w-3.5" /> {t.stamped} stamped
            </span>
            <span className="chip nums border-exposure/30 bg-exposure/10 text-exposure">
              <Icon name="signature" className="h-3.5 w-3.5" /> {t.unstamped} signed, no seal
            </span>
            <span className="chip nums border-ink-600 bg-ink-800/60 text-paper/[0.6]">
              <Icon name="clock" className="h-3.5 w-3.5" /> {t.unsigned} unsigned
            </span>
          </div>
        </div>
      </div>

      {t.unstamped > 0 && (
        <fieldset className="relative mt-4 grid gap-2 sm:grid-cols-3">
          <legend className="sr-only">Signed contracts without a stamp</legend>
          {MISSING_OPTIONS.map((o) => {
            const active = stampMissing === o.value;
            return (
              <label
                key={o.value}
                className={`group cursor-pointer rounded-xl border px-3 py-2.5 transition duration-150 ease-entrance ${
                  active
                    ? 'border-exposure/60 bg-exposure/[0.08] shadow-flare'
                    : 'border-ink-700 bg-ink-900/60 hover:border-ink-500'
                }`}
              >
                <input
                  type="radio"
                  name="stamp-missing"
                  value={o.value}
                  checked={active}
                  onChange={() => onStampMissing(o.value)}
                  className="sr-only"
                />
                <span className="flex items-center gap-1.5 text-sm font-medium text-paper">
                  <span
                    className={`grid h-4 w-4 place-items-center rounded-full border ${
                      active ? 'border-exposure bg-exposure text-ink-950' : 'border-ink-500'
                    }`}
                  >
                    {active && <Icon name="check" className="h-2.5 w-2.5" strokeWidth={3} />}
                  </span>
                  {o.title}
                </span>
                <span className="mt-1 block text-xs leading-snug text-paper/[0.55]">{o.hint}</span>
              </label>
            );
          })}
        </fieldset>
      )}
    </div>
  );
}
