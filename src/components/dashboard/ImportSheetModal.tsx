'use client';

/**
 * Import a production's crew sheet into contract R.
 *
 * The sheet is the producer's document, not the app's: it lists people by
 * whatever spelling was to hand, and its dates have been through Excel. So this
 * dialog never writes what it read — it shows each row beside the crew member
 * it appears to be, with every doubt the parser raised spelled out, and waits
 * for the admin to confirm. Rows nobody confirms are simply not written.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from './Modal';
import { importCrewSheet, updateCrew, bulkContracts } from '@/lib/api-client';
import { rankNames, uk, type SheetRow } from '@/lib/crew-sheet';
import type { CrewMember } from '@/lib/types';
import { Spinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';
import { Icon } from '@/components/ui/Icon';

const NEWLINE = '\n';

/** Below this, a name is too weak to pre-select for someone. */
const AUTO_MATCH_SCORE = 0.6;

function crewName(c: CrewMember): string {
  return `${c.personal.firstName} ${c.personal.lastName}`.trim() || c.id;
}

function money(n: number): string {
  return n.toLocaleString('en-AE', { maximumFractionDigits: 2 });
}

/**
 * Pair sheet rows with crew records, best matches first.
 *
 * Greedy over every (row, crew) pair rather than per row: on a unit with a
 * Mohamed and a Mohammed, letting the strongest pair claim its person first is
 * what stops the second row from taking the first row's match.
 */
function autoAssign(rows: SheetRow[], crew: CrewMember[]): Record<number, string> {
  const pairs: Array<{ line: number; crewId: string; score: number }> = [];
  for (const row of rows) {
    if (!row.name) continue;
    for (const candidate of rankNames(row.name, crew, crewName)) {
      if (candidate.score >= AUTO_MATCH_SCORE) {
        pairs.push({ line: row.line, crewId: candidate.record.id, score: candidate.score });
      }
    }
  }
  pairs.sort((a, b) => b.score - a.score);

  const assignment: Record<number, string> = {};
  const taken = new Set<string>();
  for (const pair of pairs) {
    if (assignment[pair.line] || taken.has(pair.crewId)) continue;
    assignment[pair.line] = pair.crewId;
    taken.add(pair.crewId);
  }
  return assignment;
}

export function ImportSheetModal({
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
  const [rows, setRows] = useState<SheetRow[] | null>(null);
  const [source, setSource] = useState('');
  // Sheet row number → crew id, or '' for "do not import this row".
  const [assignment, setAssignment] = useState<Record<number, string>>({});
  const [setRole, setSetRole] = useState(true);
  const [setDates, setSetDates] = useState(true);
  const [generate, setGenerate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) return;
    setRows(null);
    setSource('');
    setAssignment({});
    setGenerate(false);
    setError(null);
    setProgress(null);
  }, [open]);

  async function onPick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const res = await importCrewSheet(file);
      setRows(res.rows);
      setSource(`${res.filename} · ${res.sheetName}`);
      setAssignment(autoAssign(res.rows, crew));
    } catch (err) {
      setRows(null);
      setError(err instanceof Error ? err.message : 'Could not read that sheet.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  // A row can only be written if it has an amount and someone to write it to.
  const importable = useMemo(
    () => (rows ?? []).filter((r) => assignment[r.line] && r.amount !== null),
    [rows, assignment],
  );

  const blocked = useMemo(
    () => (rows ?? []).filter((r) => assignment[r.line] && r.amount === null),
    [rows, assignment],
  );

  // Two rows pointing at one person would leave whichever wrote last on the
  // record, silently. Say so instead.
  const duplicates = useMemo(() => {
    const seen = new Map<string, number>();
    const clashing = new Set<string>();
    for (const row of rows ?? []) {
      const id = assignment[row.line];
      if (!id) continue;
      if (seen.has(id)) clashing.add(id);
      else seen.set(id, row.line);
    }
    return clashing;
  }, [rows, assignment]);

  async function apply() {
    setBusy(true);
    setError(null);
    setProgress({ done: 0, total: importable.length });

    const written: string[] = [];
    const failed: string[] = [];

    for (const [index, row] of importable.entries()) {
      const crewId = assignment[row.line];
      const person = crew.find((c) => c.id === crewId);
      const label = person ? crewName(person) : crewId;
      try {
        await updateCrew(crewId, {
          amountY: row.amount as number,
          ...(setRole && row.role ? { role: row.role } : {}),
          ...(setDates && row.dateFrom ? { dateFrom: row.dateFrom } : {}),
          ...(setDates && row.dateTo ? { dateTo: row.dateTo } : {}),
        });
        written.push(crewId);
      } catch (err) {
        failed.push(`• ${label}: ${err instanceof Error ? err.message : 'failed'}`);
      }
      setProgress({ done: index + 1, total: importable.length });
    }

    const parts = [`Contract R set for ${written.length} of ${importable.length} crew`];

    // Generating is a second, slower round trip per person, and it is only
    // worth attempting for the crew whose amounts actually landed.
    if (generate && written.length) {
      try {
        const res = await bulkContracts(written, 'generate', ['Y']);
        const ok = res.results.filter((r) => r.ok).length;
        parts.push(`contract R generated for ${ok} of ${written.length}`);
        for (const r of res.results.filter((x) => !x.ok)) {
          failed.push(`• ${r.name}: ${r.error ?? 'contract R could not be generated'}`);
        }
      } catch (err) {
        failed.push(`• Generating contracts failed: ${err instanceof Error ? err.message : 'failed'}`);
      }
    }

    let text = `${parts.join(' · ')}.`;
    if (failed.length) {
      text += [
        '',
        'Not done:',
        ...failed.slice(0, 8),
        ...(failed.length > 8 ? [`• …and ${failed.length - 8} more`] : []),
      ].join(NEWLINE);
    }

    setBusy(false);
    setProgress(null);
    onDone(text, written.length ? 'ok' : 'err');
  }

  const canApply = importable.length > 0 && !duplicates.size && !busy;

  return (
    <Modal open={open} title="Import crew sheet → contract R" onClose={onClose} wide>
      {!rows && (
        <>
          <p className="-mt-1 mb-4 text-sm leading-relaxed text-paper/[0.72]">
            Upload the production&rsquo;s crew sheet (.xlsx, .csv or .tsv). It is read
            with a NAME column and an AMOUNT column, plus ROLE, START DATE, END DATE and
            a day count when they are there. Nothing is saved until you review the rows
            and apply them.
          </p>
          <label className="btn-primary w-full cursor-pointer justify-center">
            {busy ? <Spinner /> : <Icon name="upload" className="h-4 w-4" />}
            {busy ? 'Reading the sheet…' : 'Choose a sheet'}
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept=".xlsx,.csv,.tsv,.txt"
              disabled={busy}
              onChange={(e) => onPick(e.target.files?.[0])}
            />
          </label>
        </>
      )}

      {rows && (
        <>
          <div className="-mt-1 mb-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-paper/[0.72]">
              <span className="font-medium text-paper">{rows.length} rows</span> from{' '}
              {source} · {importable.length} matched to crew
            </p>
            <button className="btn-quiet btn-sm" onClick={() => setRows(null)} disabled={busy}>
              <Icon name="refresh" className="h-3.5 w-3.5" />
              Another sheet
            </button>
          </div>

          <div className="grid gap-2">
            {rows.map((row) => {
              const assigned = assignment[row.line];
              const clash = assigned && duplicates.has(assigned);
              const candidates = row.name ? rankNames(row.name, crew, crewName) : [];
              return (
                <div
                  key={row.line}
                  className={`rounded-xl border px-3 py-2.5 ${
                    clash
                      ? 'border-danger/60 bg-danger/5'
                      : assigned
                        ? 'border-ink-700 bg-ink-900/40'
                        : 'border-ink-800 bg-transparent opacity-70'
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="w-6 shrink-0 text-xs tabular-nums text-paper/40">
                      {row.line}
                    </span>
                    <span className="font-medium">{row.name || '(no name)'}</span>
                    {row.role && (
                      <span className="text-sm text-paper/[0.6]">{row.role}</span>
                    )}
                    <span className="ml-auto text-sm tabular-nums" dir="ltr">
                      {row.amount === null ? (
                        <em className="text-danger not-italic">no amount</em>
                      ) : (
                        `AED ${money(row.amount)}`
                      )}
                    </span>
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-9">
                    <span className="text-xs tabular-nums text-paper/[0.55]" dir="ltr">
                      {row.dateFrom ? uk(row.dateFrom) : '—'} →{' '}
                      {row.dateTo ? uk(row.dateTo) : '—'}
                      {row.days ? ` · ${row.days} days` : ''}
                    </span>
                    <select
                      className="field-input ml-auto h-9 max-w-[16rem] py-1 text-sm"
                      value={assigned ?? ''}
                      disabled={busy}
                      aria-label={`Crew member for sheet row ${row.line}`}
                      onChange={(e) =>
                        setAssignment((prev) => ({ ...prev, [row.line]: e.target.value }))
                      }
                    >
                      <option value="">— do not import —</option>
                      {/* Ranked names first, so the likely person is one key away,
                          then everyone else for the cases ranking cannot reach. */}
                      {candidates.map((c) => (
                        <option key={c.record.id} value={c.record.id}>
                          {crewName(c.record)}
                          {c.confidence === 'exact' ? '' : ' (?)'}
                        </option>
                      ))}
                      {crew
                        .filter((c) => !candidates.some((x) => x.record.id === c.id))
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {crewName(c)}
                          </option>
                        ))}
                    </select>
                  </div>

                  {clash && (
                    <p className="mt-1.5 pl-9 text-xs text-danger">
                      Another row is already importing into this crew member.
                    </p>
                  )}
                  {row.issues.map((issue, i) => (
                    <p
                      key={i}
                      className={`mt-1.5 pl-9 text-xs ${
                        issue.level === 'error'
                          ? 'text-danger'
                          : issue.level === 'warn'
                            ? 'text-warn'
                            : 'text-paper/[0.55]'
                      }`}
                    >
                      {issue.message}
                    </p>
                  ))}
                </div>
              );
            })}
          </div>

          <div className="mt-4 grid gap-2 text-sm">
            <Check checked={setRole} onChange={setSetRole} disabled={busy}>
              Set each crew member&rsquo;s role from the sheet
            </Check>
            <Check checked={setDates} onChange={setSetDates} disabled={busy}>
              Set start and end dates from the sheet
            </Check>
            <Check checked={generate} onChange={setGenerate} disabled={busy}>
              Generate contract R afterwards (files the PDF in Drive; nothing is emailed)
            </Check>
          </div>

          {blocked.length > 0 && (
            <Alert tone="info" className="mt-4">
              {blocked.length} matched row(s) have no usable amount and will be skipped:{' '}
              {blocked.map((r) => r.name || `row ${r.line}`).join(', ')}.
            </Alert>
          )}
        </>
      )}

      {error && (
        <Alert tone="error" className="mt-4">
          {error}
        </Alert>
      )}

      {rows && (
        <div className="mt-5 flex gap-2">
          <button className="btn-ghost flex-1" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn-primary flex-1" disabled={!canApply} onClick={apply}>
            {busy && <Spinner />}
            {busy
              ? progress
                ? `Applying ${progress.done}/${progress.total}…`
                : 'Applying…'
              : `Apply to ${importable.length}`}
          </button>
        </div>
      )}
    </Modal>
  );
}

function Check({
  checked,
  onChange,
  disabled,
  children,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-paper/[0.78]">
      <input
        type="checkbox"
        className="h-4 w-4 accent-exposure"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {children}
    </label>
  );
}
