'use client';

// Apply a project — and optionally a shared set of contract terms — to every
// selected crew member in one go. Setting the project also moves each crew
// member's Google Drive folder under that project, so Drive matches the app.

import { useEffect, useState, type ReactNode } from 'react';
import { Modal } from './Modal';
import { bulkUpdateCrew, type BulkPatch } from '@/lib/api-client';
import { Spinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';

const NEWLINE = '\n';

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label className="field-label">{label}</label>
      {children}
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}

export function BulkEditModal({
  open,
  crewIds,
  projectNames,
  onClose,
  onDone,
}: {
  open: boolean;
  crewIds: string[];
  projectNames: string[];
  onClose: () => void;
  onDone: (message: string, kind: 'ok' | 'err') => void;
}) {
  const [project, setProject] = useState('');
  const [role, setRole] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [amountX, setAmountX] = useState('');
  const [amountY, setAmountY] = useState('');
  const [iban, setIban] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Start from a clean slate each time — a bulk write should never carry over
  // a value the admin typed for a different selection.
  useEffect(() => {
    if (!open) return;
    setProject('');
    setRole('');
    setDateFrom('');
    setDateTo('');
    setAmountX('');
    setAmountY('');
    setIban('');
    setProgress(null);
    setError(null);
  }, [open]);

  const datesValid = !dateFrom || !dateTo || dateFrom <= dateTo;
  const ibanClean = iban.replace(/\s/g, '').toUpperCase();
  const ibanValid = !ibanClean || /^AE\d{21}$/.test(ibanClean);
  const amountsValid =
    (amountX === '' || Number(amountX) >= 0) && (amountY === '' || Number(amountY) >= 0);

  const patch: BulkPatch = {};
  if (project.trim()) patch.projectName = project.trim();
  if (role.trim()) patch.role = role.trim();
  if (dateFrom) patch.dateFrom = dateFrom;
  if (dateTo) patch.dateTo = dateTo;
  if (amountX !== '') patch.amountX = Number(amountX);
  if (amountY !== '') patch.amountY = Number(amountY);
  if (ibanClean) patch.iban = ibanClean;

  const hasChanges = Object.keys(patch).length > 0;
  const canSave = hasChanges && datesValid && ibanValid && amountsValid && !busy;

  async function submit() {
    setBusy(true);
    setError(null);
    setProgress({ done: 0, total: crewIds.length });
    try {
      const res = await bulkUpdateCrew(crewIds, patch, (done, total) =>
        setProgress({ done, total }),
      );
      const ok = res.results.filter((r) => r.ok);
      const failed = res.results.filter((r) => !r.ok);
      let text = `Updated ${ok.length} of ${res.results.length} crew`;
      if (patch.projectName) text += ` · project set to “${patch.projectName}”`;
      text += '.';
      // The Drive move is best-effort, so say plainly when it did not happen:
      // the edit is saved either way, and running this again retries only Drive.
      if (patch.projectName) {
        text += res.driveFailures
          ? ` ${res.driveFailures} Drive folder(s) could not be moved — the project is still set. Run this again to retry.`
          : ' Drive folders moved too.';
      }
      if (failed.length) {
        const lines = failed.slice(0, 8).map((r) => `• ${r.name}: ${r.error ?? 'failed'}`);
        if (failed.length > 8) lines.push(`• …and ${failed.length - 8} more`);
        text += ['', 'Skipped:', ...lines].join(NEWLINE);
      }
      onDone(text, ok.length === 0 ? 'err' : 'ok');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk update failed');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <Modal open={open} title={`Bulk edit — ${crewIds.length} crew`} onClose={onClose}>
      <p className="-mt-1 mb-4 text-sm leading-relaxed text-paper/[0.72]">
        Only the fields you fill in are written; everything left blank stays as it is on
        each crew member. Setting a project also files their Drive folder under it.
      </p>

      <div className="grid gap-4">
        <Field
          label="Project"
          hint="Pick an existing project or type a new name — it will be created."
        >
          <input
            className="field-input"
            list="bulk-project-names"
            value={project}
            onChange={(e) => setProject(e.target.value)}
            placeholder="e.g. How To Tame A Man"
          />
          <datalist id="bulk-project-names">
            {projectNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </Field>

        <Field label="Role">
          <input
            className="field-input"
            list="bulk-role-suggestions"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="Leave blank to keep each crew member's role"
          />
          <datalist id="bulk-role-suggestions">
            <option value="Drone Assistant" />
            <option value="Drone Operator" />
            <option value="Camera Operator" />
            <option value="Gaffer" />
            <option value="Production Assistant" />
            <option value="Sound Engineer" />
          </datalist>
        </Field>

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
        {!datesValid && (
          <p className="-mt-2 field-error">End date must be on or after start date.</p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Amount A — Contract A (AED)">
            <input
              className="field-input"
              type="number"
              min={0}
              dir="ltr"
              value={amountX}
              onChange={(e) => setAmountX(e.target.value)}
            />
          </Field>
          <Field label="Amount R — Contract R (AED)">
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

        <Field label="IBAN" hint="Only set this if every selected crew member shares an account.">
          <input
            className={`field-input ${!ibanValid ? 'field-input-error' : ''}`}
            dir="ltr"
            value={iban}
            onChange={(e) => setIban(e.target.value)}
            placeholder="Leave blank to keep each crew member's IBAN"
          />
        </Field>
        {!ibanValid && (
          <p className="-mt-2 field-error">Enter a valid UAE IBAN (AE + 21 digits).</p>
        )}
      </div>

      {error && (
        <Alert tone="error" className="mt-4">
          {error}
        </Alert>
      )}

      <div className="mt-5 flex gap-2">
        <button className="btn-ghost flex-1" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button className="btn-primary flex-1" disabled={!canSave} onClick={submit}>
          {busy && <Spinner />}
          {busy
            ? progress && progress.total > progress.done
              ? `Applying ${progress.done}/${progress.total}…`
              : 'Applying…'
            : `Apply to ${crewIds.length}`}
        </button>
      </div>
      {busy && patch.projectName && (
        <p className="mt-2 text-center text-xs text-paper/[0.55]" role="status">
          Moving Drive folders takes a few seconds per crew member — this stays open
          until it is done.
        </p>
      )}
      {!hasChanges && (
        <p className="mt-2 text-center text-xs text-paper/[0.55]">
          Fill in at least one field to enable applying.
        </p>
      )}
    </Modal>
  );
}
