'use client';

// Multi-select status filter: tick any mix of overall and per-contract states.
// Ticks in one group widen the match (OR); ticks across groups narrow it (AND),
// so "Contract A: signed, not stamped" + "Contract R: sent, not signed" finds
// exactly the people in both states.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CrewMember } from '@/lib/types';
import {
  STATUS_FILTER_GROUPS,
  crewContractState,
  type CrewContractState,
} from '@/lib/contract-state';
import { Icon } from '@/components/ui/Icon';

export function StatusFilter({
  crew,
  value,
  onChange,
}: {
  crew: CrewMember[];
  value: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const states = useMemo<CrewContractState[]>(() => crew.map(crewContractState), [crew]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of STATUS_FILTER_GROUPS) {
      for (const o of g.options) m.set(o.key, states.filter(o.test).length);
    }
    return m;
  }, [states]);

  const toggle = (key: string) => {
    const next = new Set(value);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(next);
  };

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        className={`field-input flex w-auto items-center gap-2 py-2.5 ${
          value.size ? 'border-exposure/60 text-exposure' : ''
        }`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Icon name="checkCircle" className="h-4 w-4" />
        Status
        {value.size > 0 && (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-exposure px-1.5 text-[11px] font-bold text-ink-950 nums">
            {value.size}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute left-0 z-40 mt-2 w-[min(92vw,40rem)] animate-scale-in rounded-2xl border border-ink-700 bg-ink-900/95 p-3 shadow-float backdrop-blur-xl"
          role="dialog"
          aria-label="Filter by status"
        >
          <div className="grid gap-3 sm:grid-cols-3">
            {STATUS_FILTER_GROUPS.map((g) => (
              <fieldset key={g.key} className="min-w-0">
                <legend className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-paper/[0.55]">
                  {g.label}
                </legend>
                <div className="grid gap-0.5">
                  {g.options.map((o) => {
                    const on = value.has(o.key);
                    const n = counts.get(o.key) ?? 0;
                    return (
                      <label
                        key={o.key}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition duration-150 ${
                          on ? 'bg-exposure/10 text-paper' : 'text-paper/[0.78] hover:bg-ink-800/70'
                        } ${n === 0 && !on ? 'opacity-50' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggle(o.key)}
                          className="h-4 w-4 shrink-0 cursor-pointer rounded accent-exposure"
                        />
                        <span className="min-w-0 flex-1 leading-snug">{o.label}</span>
                        <span className="nums text-xs text-paper/[0.5]">{n}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-ink-800 pt-2.5">
            <p className="text-xs text-paper/[0.5]">
              Ticks in a column match any; across columns, all must match.
            </p>
            <div className="flex gap-1.5">
              <button
                type="button"
                className="btn-quiet btn-sm"
                onClick={() => onChange(new Set())}
                disabled={!value.size}
              >
                Clear
              </button>
              <button type="button" className="btn-primary btn-sm" onClick={() => setOpen(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
