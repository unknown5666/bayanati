// Where a crew member's contracts actually stand, worked out from the facts on
// the record — generated PDF, signing link, signature, stamp — rather than the
// single stored `contract.status`, which only moves on some paths (a re-send
// used to knock a signed contract back to "sent", and stamping never moved it).
//
// Shared by the dashboard badge, stats and filters so they can never disagree.

import type { ContractType, CrewMember } from './types';

export type ContractStage = 'none' | 'generated' | 'sent' | 'signed' | 'stamped';

export const CONTRACT_TYPES: ContractType[] = ['X', 'Y'];
export const LETTER: Record<ContractType, 'A' | 'R'> = { X: 'A', Y: 'R' };

export function contractStage(c: CrewMember, type: ContractType): ContractStage {
  const k = c.contract ?? ({} as CrewMember['contract']);
  const sig = type === 'X' ? c.signatures?.contractX : c.signatures?.contractY;
  if (sig?.signed && (type === 'X' ? k.stampLinkX : k.stampLinkY)) return 'stamped';
  if (sig?.signed) return 'signed';
  if (type === 'X' ? k.signUrlX : k.signUrlY) return 'sent';
  if (type === 'X' ? k.pdfLinkX : k.pdfLinkY) return 'generated';
  return 'none';
}

export type OverallStage =
  | 'submitted' // nothing generated yet
  | 'generated' // PDFs built, nothing sent
  | 'sent' // sent, nothing signed
  | 'partly_signed' // some sent contracts signed, some still out
  | 'signed' // every sent contract signed, not all stamped
  | 'stamped'; // every sent contract signed and stamped

export interface CrewContractState {
  X: ContractStage;
  Y: ContractStage;
  overall: OverallStage;
  /** Contracts that have gone out (sent, signed or stamped). */
  outCount: number;
  signedCount: number;
  stampedCount: number;
}

const isOut = (s: ContractStage) => s === 'sent' || s === 'signed' || s === 'stamped';
const isSigned = (s: ContractStage) => s === 'signed' || s === 'stamped';

export function crewContractState(c: CrewMember): CrewContractState {
  const X = contractStage(c, 'X');
  const Y = contractStage(c, 'Y');
  const stages = [X, Y];
  const outCount = stages.filter(isOut).length;
  const signedCount = stages.filter(isSigned).length;
  const stampedCount = stages.filter((s) => s === 'stamped').length;

  let overall: OverallStage;
  if (signedCount && signedCount === outCount) {
    overall = stampedCount === signedCount ? 'stamped' : 'signed';
  } else if (signedCount) overall = 'partly_signed';
  else if (outCount) overall = 'sent';
  else if (stages.some((s) => s === 'generated')) overall = 'generated';
  else overall = 'submitted';

  return { X, Y, overall, outCount, signedCount, stampedCount };
}

/** "A+R", "A", "R" — which contracts are in a stage. */
export function lettersIn(st: CrewContractState, test: (s: ContractStage) => boolean): string {
  return CONTRACT_TYPES.filter((t) => test(st[t]))
    .map((t) => LETTER[t])
    .join('+');
}

// ---------------------------------------------------------------------------
// Filters. Ticks inside one group are OR'd; groups are AND'd together.
// ---------------------------------------------------------------------------

export interface StatusFilterOption {
  key: string;
  label: string;
  test: (st: CrewContractState) => boolean;
}

export interface StatusFilterGroup {
  key: string;
  label: string;
  options: StatusFilterOption[];
}

const perContract = (type: ContractType): StatusFilterOption[] => {
  const L = LETTER[type];
  return [
    { key: `${L}:none`, label: 'Not generated', test: (s) => s[type] === 'none' },
    { key: `${L}:generated`, label: 'Generated, not sent', test: (s) => s[type] === 'generated' },
    { key: `${L}:sent`, label: 'Sent, not signed', test: (s) => s[type] === 'sent' },
    { key: `${L}:signed`, label: 'Signed, not stamped', test: (s) => s[type] === 'signed' },
    { key: `${L}:stamped`, label: 'Signed & stamped', test: (s) => s[type] === 'stamped' },
  ];
};

export const STATUS_FILTER_GROUPS: StatusFilterGroup[] = [
  {
    key: 'overall',
    label: 'Overall',
    options: [
      { key: 'submitted', label: 'Submitted — no contract yet', test: (s) => s.overall === 'submitted' },
      { key: 'generated', label: 'Generated, not sent', test: (s) => s.overall === 'generated' },
      { key: 'sent', label: 'Sent, nothing signed', test: (s) => s.overall === 'sent' },
      { key: 'awaiting', label: 'Awaiting any signature', test: (s) => s.signedCount < s.outCount },
      { key: 'partly_signed', label: 'Partly signed', test: (s) => s.overall === 'partly_signed' },
      {
        key: 'signed',
        label: 'Fully signed',
        test: (s) => s.overall === 'signed' || s.overall === 'stamped',
      },
      {
        key: 'needs_stamp',
        label: 'Signed, missing stamp',
        test: (s) => s.signedCount > s.stampedCount,
      },
      { key: 'stamped', label: 'Fully signed & stamped', test: (s) => s.overall === 'stamped' },
    ],
  },
  { key: 'A', label: 'Contract A', options: perContract('X') },
  { key: 'R', label: 'Contract R', options: perContract('Y') },
];

export function matchesStatusFilter(st: CrewContractState, ticked: Set<string>): boolean {
  if (!ticked.size) return true;
  return STATUS_FILTER_GROUPS.every((g) => {
    const on = g.options.filter((o) => ticked.has(o.key));
    return !on.length || on.some((o) => o.test(st));
  });
}
