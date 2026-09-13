'use client';

import type { CrewMember } from '@/lib/types';
import {
  crewContractState,
  lettersIn,
  type CrewContractState,
  type OverallStage,
} from '@/lib/contract-state';
import { Icon, type IconName } from '@/components/ui/Icon';

/**
 * Contract status, shown as an icon + colour + word.
 *
 * All three carry the same information deliberately: colour alone fails for
 * the ~8% of men with a red/green deficiency, and these states include both an
 * amber "awaiting" and a green "signed".
 *
 * Worked out from the record's facts (see contract-state.ts), not the stored
 * status field, so a re-send or a stamp is always reflected.
 */
const MAP: Record<OverallStage, { cls: string; icon: IconName }> = {
  submitted: { cls: 'border-ink-600 bg-ink-700/60 text-paper/[0.82]', icon: 'inbox' },
  generated: { cls: 'border-warn/25 bg-warn/10 text-warn', icon: 'document' },
  sent: { cls: 'border-info/25 bg-info/10 text-info', icon: 'send' },
  partly_signed: { cls: 'border-warn/30 bg-warn/10 text-warn', icon: 'signature' },
  signed: { cls: 'border-ok/30 bg-ok/10 text-ok', icon: 'signature' },
  stamped: { cls: 'border-exposure/40 bg-exposure/15 text-exposure', icon: 'stamp' },
};

export function statusText(st: CrewContractState): string {
  const signed = lettersIn(st, (s) => s === 'signed' || s === 'stamped');
  switch (st.overall) {
    case 'submitted':
      return 'Submitted';
    case 'generated':
      return `Generated (${lettersIn(st, (s) => s === 'generated')})`;
    case 'sent':
      return `Sent (${lettersIn(st, (s) => s === 'sent')})`;
    case 'partly_signed':
      return `Signed ${signed} · awaiting ${lettersIn(st, (s) => s === 'sent')}`;
    case 'signed':
      return st.stampedCount
        ? `Signed ${signed} · stamped ${lettersIn(st, (s) => s === 'stamped')}`
        : `Signed (${signed})`;
    case 'stamped':
      return `Signed & stamped (${signed})`;
  }
}

export function StatusBadge({ crew }: { crew: CrewMember }) {
  const st = crewContractState(crew);
  const s = MAP[st.overall];
  return (
    <span className={`chip whitespace-nowrap ${s.cls}`}>
      <Icon name={s.icon} className="h-3.5 w-3.5" strokeWidth={2} />
      {statusText(st)}
    </span>
  );
}
