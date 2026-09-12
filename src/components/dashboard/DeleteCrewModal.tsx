'use client';

// Permanently delete crew records. Deleting is the one action here that cannot
// be undone from the app, so it asks for the word DELETE to be typed rather
// than a single click — and it names everyone in the selection first, because
// the usual mistake is not "did I mean to delete?" but "did I mean these?".

import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { deleteCrew } from '@/lib/api-client';
import type { CrewMember } from '@/lib/types';
import { Spinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';
import { Icon } from '@/components/ui/Icon';

const CONFIRM_WORD = 'DELETE';

function fullName(c: CrewMember): string {
  return `${c.personal.firstName} ${c.personal.lastName}`.trim() || c.id;
}

export function DeleteCrewModal({
  open,
  crew,
  onClose,
  onDone,
}: {
  open: boolean;
  crew: CrewMember[];
  onClose: () => void;
  onDone: (message: string, kind: 'ok' | 'err') => void;
}) {
  const [confirm, setConfirm] = useState('');
  const [trashDrive, setTrashDrive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Never carry the typed confirmation — or a Drive choice — into the next
  // selection.
  useEffect(() => {
    if (!open) return;
    setConfirm('');
    setTrashDrive(false);
    setError(null);
  }, [open]);

  const count = crew.length;
  const armed = confirm.trim().toUpperCase() === CONFIRM_WORD && count > 0;

  async function onSubmit() {
    if (!armed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await deleteCrew(
        crew.map((c) => c.id),
        trashDrive,
      );
      const failed = res.results.filter((r) => !r.ok);
      let text = `Deleted ${res.deleted} of ${count} crew record${count === 1 ? '' : 's'}.`;
      if (trashDrive) {
        const trashed = res.results.filter((r) => r.driveTrashed).length;
        text += ` ${trashed} Drive folder${trashed === 1 ? '' : 's'} moved to the trash.`;
      }
      if (failed.length) {
        const lines = failed.slice(0, 8).map((r) => `• ${r.name}: ${r.error ?? 'failed'}`);
        if (failed.length > 8) lines.push(`• …and ${failed.length - 8} more`);
        text += `\nSkipped:\n${lines.join('\n')}`;
      }
      onDone(text, failed.length && !res.deleted ? 'err' : 'ok');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} title={`Delete ${count} crew record${count === 1 ? '' : 's'}`} onClose={onClose}>
      <div className="space-y-4">
        <Alert tone="error">
          This cannot be undone. The crew record, its contract terms and its signing
          links are removed — any signing link already emailed stops working.
        </Alert>

        <div>
          <p className="field-label">Deleting</p>
          <ul className="max-h-44 overflow-y-auto rounded-xl border border-ink-700/80 bg-ink-900/50 px-3 py-2 text-sm">
            {crew.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-1">
                <span className="truncate font-medium">{fullName(c)}</span>
                <span className="truncate text-xs text-paper/[0.55]" dir="ltr">
                  {c.personal.email}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-ink-700/80 bg-ink-900/50 px-3 py-3">
          <input
            type="checkbox"
            checked={trashDrive}
            onChange={(e) => setTrashDrive(e.target.checked)}
            className="mt-0.5 h-[18px] w-[18px] cursor-pointer rounded accent-exposure"
          />
          <span className="text-sm">
            Also move their Google Drive folder to the trash
            <span className="mt-0.5 block text-xs text-paper/[0.55]">
              IDs, passports and contracts go to Drive&apos;s trash, where they stay
              recoverable for 30 days. Leave this off to keep the paperwork.
            </span>
          </span>
        </label>

        <div>
          <label className="field-label" htmlFor="delete-confirm">
            Type {CONFIRM_WORD} to confirm
          </label>
          <input
            id="delete-confirm"
            className="field-input"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={CONFIRM_WORD}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        {error && <Alert tone="error">{error}</Alert>}

        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-quiet" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn-danger" onClick={onSubmit} disabled={!armed || busy}>
            {busy ? <Spinner /> : <Icon name="trash" className="h-4 w-4" />}
            {busy ? 'Deleting…' : `Delete ${count}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
