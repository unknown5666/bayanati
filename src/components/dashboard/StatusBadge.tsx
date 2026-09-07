'use client';

import type { ContractStatus } from '@/lib/types';

const MAP: Record<ContractStatus, { label: string; cls: string }> = {
  submitted: { label: 'Submitted', cls: 'bg-ink-700 text-paper/80' },
  pending: { label: 'Pending', cls: 'bg-amber-500/15 text-amber-300' },
  sent: { label: 'Contracts Sent', cls: 'bg-blue-500/15 text-blue-300' },
  signed_x: { label: 'Signed (X)', cls: 'bg-teal-500/15 text-teal-300' },
  signed_y: { label: 'Signed (Y)', cls: 'bg-teal-500/15 text-teal-300' },
  both_signed: { label: 'Both Signed', cls: 'bg-green-500/20 text-green-300' },
};

export function StatusBadge({ status }: { status: ContractStatus }) {
  const s = MAP[status] ?? MAP.submitted;
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}

export function statusLabel(status: ContractStatus): string {
  return (MAP[status] ?? MAP.submitted).label;
}
