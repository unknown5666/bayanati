'use client';

import { useMemo, useState } from 'react';
import { signOut } from 'firebase/auth';
import { firebaseAuth } from '@/lib/firebase/client';
import { useCrewList } from '@/lib/use-crew-list';
import { useProjects, projectLabel } from '@/lib/use-projects';
import type { CrewMember } from '@/lib/types';
import { StatusBadge } from './StatusBadge';
import { StatusFilter } from './StatusFilter';
import { contractStage, crewContractState, matchesStatusFilter } from '@/lib/contract-state';
import { Modal } from './Modal';
import { CrewDetails } from './CrewDetails';
import { CrewSheet } from './CrewSheet';
import { BulkEditModal } from './BulkEditModal';
import { ImportSheetModal } from './ImportSheetModal';
import { DeleteCrewModal } from './DeleteCrewModal';
import {
  bulkContracts,
  checkInbox,
  stampContracts,
  type ContractType,
} from '@/lib/api-client';
import { DownloadModal } from './DownloadModal';
import { downloadIbanCsv } from '@/lib/export-crew';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Spinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';
import { Segmented } from '@/components/ui/Segmented';
import { CrewCardSkeleton, StatSkeleton } from '@/components/ui/Skeleton';

/** Which contract(s) a bulk action applies to. Every PDF is bilingual. */
const SCOPES: { key: 'A' | 'R' | 'both'; label: string; types: ContractType[] }[] = [
  { key: 'A', label: 'A', types: ['X'] },
  { key: 'R', label: 'R', types: ['Y'] },
  { key: 'both', label: 'A+R', types: ['X', 'Y'] },
];

function startOfMonth(): number {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

function fullName(c: CrewMember): string {
  return `${c.personal.firstName} ${c.personal.lastName}`.trim();
}

function initials(c: CrewMember): string {
  const i = `${c.personal.firstName?.[0] ?? ''}${c.personal.lastName?.[0] ?? ''}`;
  return i.toUpperCase() || '—';
}

/**
 * Each crew member gets a stable colour from their id, so the same person is
 * the same colour on every visit and the grid reads as a set of distinct
 * people rather than a wall of identical amber tiles.
 */
const AVATAR_TINTS = [
  'from-exposure to-exposure-deep text-ink-950',
  'from-brand-soft to-brand text-paper',
  'from-info to-blue-700 text-paper',
  'from-ok to-emerald-700 text-ink-950',
  'from-purple-400 to-purple-700 text-paper',
  'from-orange-400 to-orange-700 text-ink-950',
];

function tintFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_TINTS[h % AVATAR_TINTS.length];
}

function Avatar({ crew, className = 'h-11 w-11' }: { crew: CrewMember; className?: string }) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-2xl bg-gradient-to-br text-sm font-bold shadow-soft ${tintFor(crew.id)} ${className}`}
      aria-hidden="true"
    >
      {initials(crew)}
    </span>
  );
}

export function Dashboard({ adminEmail }: { adminEmail: string }) {
  const { crew, loading, error } = useCrewList();
  const { names: projectNames, byId: projectsById, refresh: refreshProjects } = useProjects();
  const [search, setSearch] = useState('');
  const [statusTicks, setStatusTicks] = useState<Set<string>>(new Set());
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [projectFilter, setProjectFilter] = useState('all');
  const [view, setView] = useState<'cards' | 'table' | 'sheet'>('sheet');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [scopeKey, setScopeKey] = useState<'A' | 'R' | 'both'>('both');
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const scope = SCOPES.find((s) => s.key === scopeKey) ?? SCOPES[2];

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const clearSelection = () => setSelectedIds(new Set());

  const [inboxBusy, setInboxBusy] = useState(false);

  /**
   * The server already polls the contracts mailbox on a timer; this is the
   * "check right now" button for when someone is waiting on a scan.
   */
  async function onCheckInbox() {
    setInboxBusy(true);
    setBulkMsg(null);
    try {
      const r = await checkInbox();
      const parts = [`Checked the contracts mailbox: ${r.scanned} message(s) read`];
      if (r.filed) parts.push(`${r.filed} signed contract(s) filed`);
      if (r.rejected) parts.push(`${r.rejected} reply(ies) sent back (pictures, not a scanned PDF)`);
      if (r.unmatched) parts.push(`${r.unmatched} could not be matched — check your email`);
      if (!r.filed && !r.rejected && !r.unmatched) parts.push('nothing new to file');
      setBulkMsg({ kind: 'ok', text: `${parts.join(' · ')}.` });
    } catch (err) {
      setBulkMsg({
        kind: 'err',
        text: err instanceof Error ? err.message : 'Inbox check failed',
      });
    } finally {
      setInboxBusy(false);
    }
  }

  const ids = useMemo(() => [...selectedIds], [selectedIds]);
  const selectedCrew = useMemo(
    () => crew.filter((c) => selectedIds.has(c.id)),
    [crew, selectedIds],
  );

  /**
   * Every bulk action shares the same shape: disable the toolbar, run, and
   * report one summary. `key` is which button is spinning.
   */
  async function runBulk(key: string, fn: () => Promise<string>) {
    if (!ids.length) return;
    setBulkBusy(key);
    setBulkMsg(null);
    try {
      setBulkMsg({ kind: 'ok', text: await fn() });
    } catch (err) {
      setBulkMsg({
        kind: 'err',
        text: err instanceof Error ? err.message : 'Bulk action failed',
      });
    } finally {
      setBulkBusy(null);
      setBulkProgress(null);
    }
  }

  const progress = (done: number, total: number) => setBulkProgress({ done, total });

  const onBulkGenerate = () =>
    runBulk('generate', async () => {
      const res = await bulkContracts(ids, 'generate', scope.types, progress);
      return summarise(res.results, `Generated ${scope.label}`);
    });

  const onBulkSend = () =>
    runBulk('send', async () => {
      const res = await bulkContracts(ids, 'send', scope.types, progress);
      return summarise(res.results, `Emailed ${scope.label}`);
    });

  const [downloadFor, setDownloadFor] = useState<CrewMember[] | null>(null);

  const onBulkStamp = () =>
    runBulk('stamp', async () => {
      // Only people with a signed contract still missing its seal need a round
      // trip — everyone else is already done or has nothing to stamp.
      const needing = selectedCrew.filter((c) =>
        (['X', 'Y'] as ContractType[]).some((t) => contractStage(c, t) === 'signed'),
      );
      const done = selectedCrew.filter((c) => {
        const st = crewContractState(c);
        return st.signedCount > 0 && st.stampedCount === st.signedCount;
      }).length;
      const unsigned = selectedCrew.length - needing.length - done;
      if (!needing.length) {
        return done
          ? `Nothing to stamp — ${done} already stamped, ${unsigned} not signed yet.`
          : 'Nothing to stamp — none of the selected crew has a signed contract yet.';
      }
      const res = await stampContracts(
        needing.map((c) => c.id),
        { onlyMissing: true, onProgress: progress },
      );
      const ok = res.results.filter((r) => r.ok).length;
      const failed = res.results.filter((r) => !r.ok);
      const parts = [`Stamped ${ok} of ${needing.length} crew with a signed, unstamped contract`];
      if (done) parts.push(`${done} already stamped`);
      if (unsigned) parts.push(`${unsigned} not signed yet`);
      let text = `${parts.join(' · ')}.`;
      if (failed.length) {
        const nameOf = (id: string) => {
          const c = crew.find((x) => x.id === id);
          return c ? fullName(c) : id;
        };
        const lines = failed.slice(0, 8).map((r) => `• ${nameOf(r.crewId)}: ${r.error ?? 'failed'}`);
        if (failed.length > 8) lines.push(`• …and ${failed.length - 8} more`);
        text += `\nNot stamped:\n${lines.join('\n')}`;
      }
      return text;
    });

  const states = useMemo(() => new Map(crew.map((c) => [c.id, crewContractState(c)])), [crew]);

  const stats = useMemo(() => {
    const monthStart = startOfMonth();
    const all = [...states.values()];
    return {
      thisMonth: crew.filter((c) => (c.createdAt ?? 0) >= monthStart).length,
      sent: all.filter((s) => s.outCount > 0).length,
      fullySigned: all.filter((s) => s.overall === 'signed' || s.overall === 'stamped').length,
      pendingSignature: all.filter((s) => s.signedCount < s.outCount).length,
      needsStamp: all.filter((s) => s.signedCount > s.stampedCount).length,
    };
  }, [crew, states]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return crew.filter((c) => {
      const st = states.get(c.id);
      if (st && !matchesStatusFilter(st, statusTicks)) return false;
      if (projectFilter !== 'all' && projectLabel(projectsById, c.projectId) !== projectFilter) {
        return false;
      }
      if (!q) return true;
      const hay = [
        c.personal.firstName,
        c.personal.lastName,
        c.personal.email,
        c.personal.phone,
        c.contract.role ?? '',
        projectLabel(projectsById, c.projectId),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [crew, states, search, statusTicks, projectFilter, projectsById]);

  /**
   * Name + IBAN (and the rest of what a payment run needs) as a CSV. Everything
   * is already in memory, so this is instant and needs no API call. `subset` is
   * the current selection when there is one, otherwise the whole crew list.
   */
  function onExportIbans(subset: CrewMember[], hint: string) {
    setBulkMsg(null);
    try {
      const { count, skipped } = downloadIbanCsv(subset, projectsById, hint);
      if (!count) {
        setBulkMsg({ kind: 'err', text: 'Nobody in that list has an IBAN on file yet.' });
        return;
      }
      setBulkMsg({
        kind: 'ok',
        text:
          `Downloaded ${count} IBAN${count === 1 ? '' : 's'}.` +
          (skipped ? ` ${skipped} skipped — no IBAN on file.` : ''),
      });
    } catch (err) {
      setBulkMsg({
        kind: 'err',
        text: err instanceof Error ? err.message : 'Export failed',
      });
    }
  }

  const selected = crew.find((c) => c.id === selectedId) ?? null;
  const filtersActive = search.trim() !== '' || statusTicks.size > 0 || projectFilter !== 'all';

  const allVisibleSelected =
    filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id));
  const toggleSelectAll = () =>
    setSelectedIds(allVisibleSelected ? new Set() : new Set(filtered.map((c) => c.id)));

  const clearFilters = () => {
    setSearch('');
    setStatusTicks(new Set());
    setProjectFilter('all');
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl text-display sm:text-4xl">Dashboard</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-paper/[0.72]">
            <Icon name="user" className="h-3.5 w-3.5" />
            <span className="truncate">{adminEmail}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn-ghost btn-sm"
            onClick={() => {
              setBulkMsg(null);
              setImportOpen(true);
            }}
            aria-label="Import crew sheet"
            title="Read a production's crew sheet and set contract R amounts, roles and dates from it"
          >
            <Icon name="upload" className="h-4 w-4" />
            <span className="hidden sm:inline">Import sheet</span>
          </button>
          <button
            className="btn-ghost btn-sm"
            onClick={() => onExportIbans(crew, 'all-crew')}
            disabled={loading || crew.length === 0}
            aria-label="Export IBANs"
            title="Download a CSV of name and IBAN for every crew member who has one on file"
          >
            <Icon name="download" className="h-4 w-4" />
            <span className="hidden sm:inline">Export IBANs</span>
          </button>
          <button
            className="btn-ghost btn-sm"
            onClick={onCheckInbox}
            disabled={inboxBusy}
            // The label collapses to an icon on small screens, so the button
            // needs a name of its own there.
            aria-label="Check inbox"
            title="Check the contracts mailbox now for replies with signed scans (it is also checked automatically)"
          >
            {inboxBusy ? <Spinner /> : <Icon name="inbox" className="h-4 w-4" />}
            <span className="hidden sm:inline">
              {inboxBusy ? 'Checking…' : 'Check inbox'}
            </span>
          </button>
          <button
            className="btn-ghost btn-sm"
            onClick={() => signOut(firebaseAuth())}
            aria-label="Sign out"
          >
            <Icon name="logout" className="h-4 w-4" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }, (_, i) => <StatSkeleton key={i} />)
        ) : (
          <>
            <Stat icon="inbox" label="Submitted this month" value={stats.thisMonth} />
            <Stat icon="send" label="Contracts sent" value={stats.sent} tone="info" />
            <Stat
              icon="checkCircle"
              label={`Fully signed${stats.needsStamp ? ` · ${stats.needsStamp} need a stamp` : ''}`}
              value={stats.fullySigned}
              tone="ok"
              accent
              onClick={() => setStatusTicks(new Set(['needs_stamp']))}
            />
            <Stat
              icon="clock"
              label="Awaiting signatures"
              value={stats.pendingSignature}
              tone="warn"
              onClick={() => setStatusTicks(new Set(['awaiting']))}
            />
          </>
        )}
      </section>

      {/* Sticky toolbar: on a long crew list, search and the status filter are
          what you reach for after scrolling, so they follow you down. */}
      <section className="sticky top-[var(--header-h)] z-30 -mx-4 mb-5 border-y border-ink-800/70 bg-ink-950/80 px-4 py-3 backdrop-blur-xl">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] max-w-xs flex-1">
            <Icon
              name="search"
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
            />
            <label className="sr-only" htmlFor="crew-search">
              Search crew
            </label>
            <input
              id="crew-search"
              type="search"
              className="field-input py-2.5 pl-10"
              placeholder="Search name, email, role…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <StatusFilter crew={crew} value={statusTicks} onChange={setStatusTicks} />

          <label className="sr-only" htmlFor="crew-project">
            Filter by project
          </label>
          <select
            id="crew-project"
            className="field-input w-auto py-2.5"
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
          >
            <option value="all">All projects</option>
            {projectNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>

          {filtersActive && (
            <button className="btn-quiet btn-sm" onClick={clearFilters}>
              <Icon name="close" className="h-3.5 w-3.5" />
              Clear
            </button>
          )}

          <button
            className="btn-quiet btn-sm"
            onClick={toggleSelectAll}
            disabled={!filtered.length}
          >
            <Icon name={allVisibleSelected ? 'close' : 'check'} className="h-3.5 w-3.5" />
            {allVisibleSelected ? 'Deselect all' : `Select all ${filtered.length}`}
          </button>

          <Segmented
            className="ml-auto"
            label="Crew list view"
            value={view}
            onChange={setView}
            options={[
              { value: 'sheet', label: 'Details', title: 'Every date and term on one sheet' },
              { value: 'cards', label: 'Cards' },
              { value: 'table', label: 'Table' },
            ]}
          />
        </div>

        {/* Result count doubles as the live region announcing filter results. */}
        {!loading && (
          <p className="mt-2 text-xs text-paper/[0.55]" role="status">
            {filtered.length} of {crew.length} crew
            {filtersActive ? ' match your filters' : ''}
          </p>
        )}
      </section>

      {selectedIds.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-exposure/40 bg-exposure/[0.07] px-4 py-3 animate-rise-in">
          <span className="flex items-center gap-2 text-sm font-medium">
            <span className="grid h-6 min-w-6 place-items-center rounded-full bg-exposure px-1.5 text-xs font-bold text-ink-950 nums">
              {selectedIds.size}
            </span>
            selected
          </span>

          <Segmented
            label="Which contract bulk actions apply to"
            value={scopeKey}
            onChange={setScopeKey}
            options={SCOPES.map((sc) => ({
              value: sc.key,
              label: sc.label,
              title: `Act on contract ${sc.key === 'both' ? 'A and R' : sc.key}`,
            }))}
          />

          <div className="flex flex-wrap gap-2">
            <BulkBtn
              icon="download"
              primary
              disabled={Boolean(bulkBusy)}
              onClick={() => setDownloadFor(selectedCrew)}
              title="Download contracts (unsigned or signed), optionally with ID and passport scans, as a ZIP or one PDF"
            >
              Download…
            </BulkBtn>
            <BulkBtn
              icon="document"
              busy={bulkBusy === 'generate'}
              progress={bulkProgress}
              disabled={Boolean(bulkBusy)}
              onClick={onBulkGenerate}
              title="Build the PDFs for everyone selected and file them in Drive. Nothing is emailed."
            >
              {`Generate ${scope.label}`}
            </BulkBtn>
            <BulkBtn
              icon="send"
              busy={bulkBusy === 'send'}
              progress={bulkProgress}
              disabled={Boolean(bulkBusy)}
              onClick={onBulkSend}
              title="Generate and email each contract separately, with the PDF attached and its own signing link"
            >
              {`Send ${scope.label}`}
            </BulkBtn>
            <BulkBtn
              icon="download"
              disabled={Boolean(bulkBusy)}
              onClick={() => onExportIbans(selectedCrew, 'selected-crew')}
              title="Download name and IBAN for the selected crew as a CSV"
            >
              Export IBANs
            </BulkBtn>
            <BulkBtn
              icon="edit"
              disabled={Boolean(bulkBusy)}
              onClick={() => {
                setBulkMsg(null);
                setBulkEditOpen(true);
              }}
              title="Set the project and shared contract terms for everyone selected"
            >
              Project &amp; fields
            </BulkBtn>
            <BulkBtn
              icon="stamp"
              busy={bulkBusy === 'stamp'}
              progress={bulkProgress}
              disabled={Boolean(bulkBusy)}
              onClick={onBulkStamp}
              title="Apply the company stamp to every selected crew member whose contract is signed"
            >
              Stamp signed
            </BulkBtn>
            <button
              className="btn-danger btn-sm"
              onClick={() => {
                setBulkMsg(null);
                setDeleteOpen(true);
              }}
              disabled={Boolean(bulkBusy)}
              title="Permanently delete the selected crew records"
            >
              <Icon name="trash" className="h-4 w-4" />
              Delete
            </button>
            <button
              className="btn-quiet btn-sm"
              onClick={clearSelection}
              disabled={Boolean(bulkBusy)}
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {bulkMsg && (
        <Alert tone={bulkMsg.kind === 'ok' ? 'ok' : 'error'} className="mb-4">
          {bulkMsg.text}
        </Alert>
      )}

      {error && (
        <Alert tone="error" className="mb-4">
          Could not load crew: {error}. Check your Realtime DB rules allow admin reads.
        </Alert>
      )}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <CrewCardSkeleton key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState filtered={filtersActive} onClear={clearFilters} />
      ) : view === 'sheet' ? (
        <CrewSheet
          crew={filtered}
          projectsById={projectsById}
          onOpen={setSelectedId}
          selectedIds={selectedIds}
          onToggle={toggleSelect}
          allSelected={allVisibleSelected}
          onToggleAll={toggleSelectAll}
        />
      ) : view === 'cards' ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <CrewCard
              key={c.id}
              crew={c}
              project={projectLabel(projectsById, c.projectId)}
              onOpen={() => setSelectedId(c.id)}
              selected={selectedIds.has(c.id)}
              onToggle={() => toggleSelect(c.id)}
            />
          ))}
        </div>
      ) : (
        <CrewTable
          crew={filtered}
          onOpen={setSelectedId}
          selectedIds={selectedIds}
          onToggle={toggleSelect}
        />
      )}

      <DownloadModal
        crew={downloadFor}
        onClose={() => setDownloadFor(null)}
        onDone={(message, kind) => {
          setDownloadFor(null);
          setBulkMsg({ kind, text: message });
        }}
      />

      <DeleteCrewModal
        open={deleteOpen}
        crew={selectedCrew}
        onClose={() => setDeleteOpen(false)}
        onDone={(message, kind) => {
          setDeleteOpen(false);
          setBulkMsg({ kind, text: message });
          // The deleted rows are already gone from the realtime list; drop them
          // from the selection too so the toolbar does not act on ghosts.
          clearSelection();
        }}
      />

      <ImportSheetModal
        open={importOpen}
        crew={crew}
        onClose={() => setImportOpen(false)}
        onDone={(message, kind) => {
          setImportOpen(false);
          setBulkMsg({ kind, text: message });
        }}
      />

      <BulkEditModal
        open={bulkEditOpen}
        crewIds={ids}
        projectNames={projectNames}
        onClose={() => setBulkEditOpen(false)}
        onDone={(message, kind) => {
          setBulkEditOpen(false);
          setBulkMsg({ kind, text: message });
          void refreshProjects();
        }}
      />

      <Modal
        open={Boolean(selected)}
        title="Crew details"
        onClose={() => setSelectedId(null)}
      >
        {selected && (
          <>
            <CrewDetails key={selected.id} crew={selected} />
            {/* Deleting one person goes through the same confirmation as a bulk
                delete, so there is one place where the wording and the Drive
                choice live. */}
            <div className="mt-6 flex justify-between gap-2 border-t border-ink-800 pt-4">
              <button
                className="btn-primary btn-sm"
                onClick={() => {
                  setBulkMsg(null);
                  setSelectedId(null);
                  setDownloadFor([selected]);
                }}
              >
                <Icon name="download" className="h-4 w-4" />
                Download contract
              </button>
              <button
                className="btn-danger btn-sm"
                onClick={() => {
                  setSelectedIds(new Set([selected.id]));
                  setBulkMsg(null);
                  // Close the details sheet first: two stacked dialogs would
                  // fight over the focus trap.
                  setSelectedId(null);
                  setDeleteOpen(true);
                }}
              >
                <Icon name="trash" className="h-4 w-4" />
                Delete this record
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

/** Fold per-crew bulk results into one readable summary. */
function summarise(
  results: Array<{ ok: boolean; name: string; error?: string }>,
  what: string,
): string {
  const ok = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  let text = `${what} for ${ok.length} of ${results.length} crew.`;
  if (failed.length) {
    const lines = failed.slice(0, 8).map((r) => `• ${r.name}: ${r.error ?? 'failed'}`);
    if (failed.length > 8) lines.push(`• …and ${failed.length - 8} more`);
    text += `\nSkipped:\n${lines.join('\n')}`;
  }
  return text;
}

function BulkBtn({
  children,
  icon,
  onClick,
  busy,
  disabled,
  primary,
  title,
  progress,
}: {
  children: React.ReactNode;
  icon: IconName;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  primary?: boolean;
  title?: string;
  progress?: { done: number; total: number } | null;
}) {
  return (
    <button
      className={`${primary ? 'btn-primary' : 'btn-ghost'} btn-sm`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {busy ? <Spinner /> : <Icon name={icon} className="h-4 w-4" />}
      {busy ? (progress ? `Working ${progress.done}/${progress.total}…` : 'Working…') : children}
    </button>
  );
}

const STAT_TONE = {
  neutral: 'text-paper/[0.72] bg-ink-800 border-ink-700',
  info: 'text-info bg-info/10 border-info/20',
  ok: 'text-ok bg-ok/10 border-ok/20',
  warn: 'text-warn bg-warn/10 border-warn/20',
} as const;

function Stat({
  icon,
  label,
  value,
  accent,
  tone = 'neutral',
  onClick,
}: {
  icon: IconName;
  label: string;
  value: number;
  accent?: boolean;
  tone?: keyof typeof STAT_TONE;
  /** Tiles with an action filter the list down to what they count. */
  onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={`card p-4 text-left transition duration-200 ease-entrance hover:-translate-y-0.5 hover:shadow-float sm:p-5 ${
        accent ? 'border-exposure/40' : ''
      }`}
    >
      <span
        className={`grid h-8 w-8 place-items-center rounded-lg border ${STAT_TONE[tone]}`}
      >
        <Icon name={icon} className="h-4 w-4" strokeWidth={2} />
      </span>
      {/* Tabular figures so the four tiles' numbers line up as they change. */}
      <p className="mt-3 text-3xl font-bold nums sm:text-4xl">{value}</p>
      <p className="mt-1 text-xs leading-snug text-paper/[0.72]">{label}</p>
    </Tag>
  );
}

function EmptyState({ filtered, onClear }: { filtered: boolean; onClear: () => void }) {
  return (
    <div className="card flex flex-col items-center px-6 py-16 text-center animate-fade-in">
      <span className="grid h-14 w-14 place-items-center rounded-2xl border border-ink-700 bg-ink-800 text-paper/[0.55]">
        <Icon name={filtered ? 'search' : 'users'} className="h-6 w-6" />
      </span>
      <p className="mt-4 text-lg font-semibold">
        {filtered ? 'No crew match your filters' : 'No crew yet'}
      </p>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-paper/[0.72]">
        {filtered
          ? 'Try a different name, email or role — or clear the filters to see everyone.'
          : 'As soon as someone completes the intake form, they will appear here.'}
      </p>
      {filtered && (
        <button className="btn-ghost btn-sm mt-5" onClick={onClear}>
          <Icon name="refresh" className="h-4 w-4" />
          Clear filters
        </button>
      )}
    </div>
  );
}

function CrewCard({
  crew,
  project,
  onOpen,
  selected,
  onToggle,
}: {
  crew: CrewMember;
  project: string;
  onOpen: () => void;
  selected: boolean;
  onToggle: () => void;
}) {
  const name = fullName(crew);
  return (
    <div className="relative">
      {/*
        The checkbox sits outside the card button rather than inside it —
        nesting an interactive control in a button is invalid, and it means a
        tap meant for "select" cannot accidentally open the modal. It gets a
        44px hit area via padding while the box itself stays 18px.
      */}
      <label className="absolute right-2 top-2 z-10 grid h-11 w-11 cursor-pointer place-items-center rounded-xl transition hover:bg-ink-800/70">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`Select ${name}`}
          className="h-[18px] w-[18px] cursor-pointer rounded accent-exposure"
        />
      </label>

      <button
        onClick={onOpen}
        className={`card-interactive w-full p-4 pr-14 ${
          selected ? 'border-exposure/60 bg-exposure/[0.04]' : ''
        }`}
      >
        <div className="flex items-center gap-3">
          <Avatar crew={crew} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{name || 'Unnamed crew'}</p>
            <p className="truncate text-sm text-paper/[0.72]" dir="ltr">
              {crew.personal.email}
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <StatusBadge crew={crew} />
          <span className="truncate text-xs text-paper/[0.55]">
            {crew.contract.role ?? 'No role yet'}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-paper/[0.55]">
          <span className="chip truncate">{project}</span>
          <span className="nums" dir="ltr">
            {crew.contract.dateFrom && crew.contract.dateTo
              ? `${crew.contract.dateFrom} → ${crew.contract.dateTo}`
              : 'No dates set'}
          </span>
        </div>
      </button>
    </div>
  );
}

function CrewTable({
  crew,
  onOpen,
  selectedIds,
  onToggle,
}: {
  crew: CrewMember[];
  onOpen: (id: string) => void;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    // The table is the one element allowed to scroll sideways, and it does so
    // inside its own container so the page body never does.
    <div className="overflow-x-auto rounded-2xl border border-ink-700/80 bg-ink-900/50 shadow-lift">
      <table className="w-full min-w-[680px] text-left text-sm">
        <thead className="border-b border-ink-800 bg-ink-900/80 text-xs uppercase tracking-wider text-paper/[0.55]">
          <tr>
            <th scope="col" className="w-12 px-4 py-3">
              <span className="sr-only">Select</span>
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Name
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Email
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Role
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Status
            </th>
            <th scope="col" className="px-4 py-3 text-right font-semibold">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-800">
          {crew.map((c) => {
            const name = fullName(c);
            const isSelected = selectedIds.has(c.id);
            return (
              <tr
                key={c.id}
                className={`transition duration-150 hover:bg-ink-800/50 ${
                  isSelected ? 'bg-exposure/[0.06]' : ''
                }`}
              >
                <td className="px-4 py-2">
                  <label className="grid h-11 w-8 cursor-pointer place-items-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggle(c.id)}
                      aria-label={`Select ${name}`}
                      className="h-[18px] w-[18px] cursor-pointer rounded accent-exposure"
                    />
                  </label>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <Avatar crew={c} className="h-8 w-8 rounded-xl text-[11px]" />
                    <span className="font-medium">{name || 'Unnamed crew'}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-paper/[0.72]" dir="ltr">
                  {c.personal.email}
                </td>
                <td className="px-4 py-3 text-paper/[0.72]">{c.contract.role ?? '—'}</td>
                <td className="px-4 py-3">
                  <StatusBadge crew={c} />
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => onOpen(c.id)}
                    className="btn-ghost btn-sm"
                    aria-label={`Open details for ${name}`}
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
