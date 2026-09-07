'use client';

import { useMemo, useState } from 'react';
import { signOut } from 'firebase/auth';
import { firebaseAuth } from '@/lib/firebase/client';
import { useCrewList } from '@/lib/use-crew-list';
import type { ContractStatus, CrewMember } from '@/lib/types';
import { StatusBadge, statusLabel } from './StatusBadge';
import { Modal } from './Modal';
import { CrewDetails } from './CrewDetails';

const STATUSES: ContractStatus[] = [
  'submitted',
  'pending',
  'sent',
  'signed_x',
  'signed_y',
  'both_signed',
];

function startOfMonth(): number {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

export function Dashboard({ adminEmail }: { adminEmail: string }) {
  const { crew, loading, error } = useCrewList();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ContractStatus | 'all'>('all');
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const stats = useMemo(() => {
    const monthStart = startOfMonth();
    return {
      thisMonth: crew.filter((c) => (c.createdAt ?? 0) >= monthStart).length,
      sent: crew.filter((c) =>
        ['sent', 'signed_x', 'signed_y', 'both_signed'].includes(c.contract.status),
      ).length,
      bothSigned: crew.filter((c) => c.contract.status === 'both_signed').length,
      pendingSignature: crew.filter((c) =>
        ['sent', 'signed_x', 'signed_y'].includes(c.contract.status),
      ).length,
    };
  }, [crew]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return crew.filter((c) => {
      if (status !== 'all' && c.contract.status !== status) return false;
      if (!q) return true;
      const hay = `${c.personal.firstName} ${c.personal.lastName} ${c.personal.email} ${c.contract.role ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [crew, search, status]);

  const selected = crew.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-exposure">
            Over Exposure
          </p>
          <h1 className="text-2xl font-bold">Bayanati Dashboard</h1>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden text-paper/60 sm:inline">{adminEmail}</span>
          <button className="btn-ghost px-3 py-2" onClick={() => signOut(firebaseAuth())}>
            Sign out
          </button>
        </div>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Submitted this month" value={stats.thisMonth} />
        <Stat label="Contracts sent" value={stats.sent} />
        <Stat label="Both signed" value={stats.bothSigned} accent />
        <Stat label="Pending signatures" value={stats.pendingSignature} />
      </section>

      <section className="mb-4 flex flex-wrap items-center gap-2">
        <input
          className="field-input max-w-xs flex-1"
          placeholder="Search name, email, role…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="field-input w-auto"
          value={status}
          onChange={(e) => setStatus(e.target.value as ContractStatus | 'all')}
        >
          <option value="all">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </select>
        <div className="ml-auto flex overflow-hidden rounded-xl border border-ink-600">
          {(['cards', 'table'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-2 text-sm ${
                view === v ? 'bg-exposure text-ink-950' : 'text-paper/70 hover:bg-ink-800'
              }`}
            >
              {v === 'cards' ? 'Cards' : 'Table'}
            </button>
          ))}
        </div>
      </section>

      {error && (
        <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">
          Could not load crew: {error}. Check your Realtime DB rules allow admin reads.
        </p>
      )}

      {loading ? (
        <p className="py-16 text-center text-paper/50">Loading crew…</p>
      ) : filtered.length === 0 ? (
        <p className="py-16 text-center text-paper/50">No crew match your filters yet.</p>
      ) : view === 'cards' ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <CrewCard key={c.id} crew={c} onOpen={() => setSelectedId(c.id)} />
          ))}
        </div>
      ) : (
        <CrewTable crew={filtered} onOpen={setSelectedId} />
      )}

      <Modal
        open={Boolean(selected)}
        title="Crew details"
        onClose={() => setSelectedId(null)}
      >
        {selected && <CrewDetails crew={selected} />}
      </Modal>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`card p-4 ${accent ? 'border-exposure/40' : ''}`}>
      <p className="text-3xl font-bold">{value}</p>
      <p className="mt-1 text-xs text-paper/60">{label}</p>
    </div>
  );
}

function CrewCard({ crew, onOpen }: { crew: CrewMember; onOpen: () => void }) {
  const name = `${crew.personal.firstName} ${crew.personal.lastName}`.trim();
  return (
    <button onClick={onOpen} className="card p-4 text-left transition hover:border-exposure/50">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{name}</p>
          <p className="text-sm text-paper/60">{crew.personal.email}</p>
        </div>
        <StatusBadge status={crew.contract.status} />
      </div>
      <div className="mt-3 flex items-center gap-3 text-xs text-paper/50">
        <span>{crew.contract.role ?? 'No role yet'}</span>
      </div>
    </button>
  );
}

function CrewTable({
  crew,
  onOpen,
}: {
  crew: CrewMember[];
  onOpen: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-ink-800">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-ink-900 text-paper/60">
          <tr>
            <th className="px-4 py-3 font-medium">Name</th>
            <th className="px-4 py-3 font-medium">Email</th>
            <th className="px-4 py-3 font-medium">Role</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-800">
          {crew.map((c) => (
            <tr key={c.id} className="hover:bg-ink-900/60">
              <td className="px-4 py-3 font-medium">
                {c.personal.firstName} {c.personal.lastName}
              </td>
              <td className="px-4 py-3 text-paper/70">{c.personal.email}</td>
              <td className="px-4 py-3 text-paper/70">{c.contract.role ?? '—'}</td>
              <td className="px-4 py-3">
                <StatusBadge status={c.contract.status} />
              </td>
              <td className="px-4 py-3 text-right">
                <button
                  onClick={() => onOpen(c.id)}
                  className="rounded-lg bg-ink-700 px-3 py-1.5 text-xs font-medium hover:bg-ink-600"
                >
                  Open
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
