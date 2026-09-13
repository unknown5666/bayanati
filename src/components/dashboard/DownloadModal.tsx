'use client';

// One place to download contracts for one or many crew: pick the contract,
// fresh or signed copy, which ID scans to attach after the contract, and
// whether to get a ZIP of separate files or a single combined PDF.

import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { downloadContracts, type AttachmentKey, type ContractType } from '@/lib/api-client';
import type { CrewMember } from '@/lib/types';
import { Segmented } from '@/components/ui/Segmented';
import { Spinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';
import { Icon } from '@/components/ui/Icon';

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
  const [kind, setKind] = useState<'contract' | 'signed'>('contract');
  const [attach, setAttach] = useState<Set<AttachmentKey>>(new Set());
  const [format, setFormat] = useState<'zip' | 'pdf'>('zip');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = Boolean(crew?.length);
  const count = crew?.length ?? 0;
  useEffect(() => {
    if (open) setError(null);
  }, [open]);

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
      const res = await downloadContracts(crew.map((c) => c.id), {
        types: CONTRACTS.find((c) => c.value === contract)!.types,
        kind,
        attach: [...attach],
        format,
      });
      const base = `Downloaded ${res.count} contract${res.count === 1 ? '' : 's'}${format === 'pdf' ? ' as one PDF' : ' as a ZIP'}.`;
      onDone(res.skipped ? `${base} Skipped — ${res.skipped}` : base, 'ok');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setBusy(false);
    }
  }

  const name =
    count === 1 ? `${crew![0].personal.firstName} ${crew![0].personal.lastName}`.trim() : `${count} crew`;

  return (
    <Modal open={open} title={`Download contracts — ${name}`} onClose={onClose}>
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
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
              ]}
            />
          </div>
        </div>

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
          <button className="btn-primary" onClick={submit} disabled={busy}>
            {busy ? <Spinner /> : <Icon name="download" className="h-4 w-4" />}
            {busy ? 'Compiling…' : 'Download'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
