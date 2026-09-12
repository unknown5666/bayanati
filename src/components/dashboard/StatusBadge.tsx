'use client';

import type { ContractStatus } from '@/lib/types';
import { Icon, type IconName } from '@/components/ui/Icon';

/**
 * Contract status, shown as an icon + colour + word.
 *
 * All three carry the same information deliberately: colour alone fails for
 * the ~8% of men with a red/green deficiency, and these six states include
 * both an amber "pending" and a green "signed".
 */
const MAP: Record<ContractStatus, { label: string; cls: string; icon: IconName }> = {
  submitted: {
    label: 'Submitted',
    cls: 'border-ink-600 bg-ink-700/60 text-paper/[0.82]',
    icon: 'inbox',
  },
  pending: {
    label: 'Pending',
    cls: 'border-warn/25 bg-warn/10 text-warn',
    icon: 'clock',
  },
  sent: {
    label: 'Contracts Sent',
    cls: 'border-info/25 bg-info/10 text-info',
    icon: 'send',
  },
  signed_x: {
    label: 'Signed (A)',
    cls: 'border-ok/25 bg-ok/10 text-ok',
    icon: 'signature',
  },
  signed_y: {
    label: 'Signed (R)',
    cls: 'border-ok/25 bg-ok/10 text-ok',
    icon: 'signature',
  },
  both_signed: {
    label: 'Both Signed',
    cls: 'border-ok/40 bg-ok/15 text-ok',
    icon: 'checkCircle',
  },
};

export function StatusBadge({ status }: { status: ContractStatus }) {
  const s = MAP[status] ?? MAP.submitted;
  return (
    <span className={`chip ${s.cls}`}>
      <Icon name={s.icon} className="h-3.5 w-3.5" strokeWidth={2} />
      {s.label}
    </span>
  );
}

export function statusLabel(status: ContractStatus): string {
  return (MAP[status] ?? MAP.submitted).label;
}
