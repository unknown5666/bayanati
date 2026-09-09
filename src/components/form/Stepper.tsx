'use client';

import { Icon } from '@/components/ui/Icon';

interface StepperProps {
  steps: string[];
  current: number; // 0-based
}

/**
 * Progress through the intake form.
 *
 * The connector between two steps fills as you advance, so the control reads
 * as one continuous track rather than four separate dots — the thing that
 * makes a stepper feel like progress instead of decoration. State is carried
 * by shape (ring / fill / tick) as well as colour, and announced through an
 * `aria-label` on each step rather than left to the visual alone.
 */
export function Stepper({ steps, current }: StepperProps) {
  return (
    <ol className="flex items-start gap-1" aria-label="Progress">
      {steps.map((label, i) => {
        const state = i < current ? 'done' : i === current ? 'active' : 'todo';
        return (
          <li key={label} className="flex flex-1 flex-col items-center gap-2">
            <div className="flex w-full items-center">
              <span
                className={[
                  'relative grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-semibold transition duration-300 ease-entrance',
                  state === 'done' && 'bg-exposure-gradient text-ink-950 shadow-flare',
                  state === 'active' &&
                    'border-2 border-exposure bg-exposure/10 text-exposure shadow-flare',
                  state === 'todo' && 'border border-ink-600 text-paper/[0.55]',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-current={state === 'active' ? 'step' : undefined}
              >
                {/* A slow halo on the current step — the one place in the form
                    where motion is doing work, pointing at where you are. */}
                {state === 'active' && (
                  <span className="absolute inset-0 animate-pulse-ring rounded-full border-2 border-exposure" />
                )}
                {state === 'done' ? (
                  <Icon name="check" className="h-4 w-4" strokeWidth={3} />
                ) : (
                  <span className="nums">{i + 1}</span>
                )}
                <span className="sr-only">
                  {`Step ${i + 1} of ${steps.length}: ${label} — ${
                    state === 'done' ? 'completed' : state === 'active' ? 'current' : 'not started'
                  }`}
                </span>
              </span>

              {i < steps.length - 1 && (
                <span className="relative mx-1.5 h-0.5 flex-1 overflow-hidden rounded-full bg-ink-700">
                  <span
                    className="absolute inset-y-0 left-0 rounded-full bg-exposure transition-[width] duration-500 ease-entrance"
                    style={{ width: i < current ? '100%' : '0%' }}
                  />
                </span>
              )}
            </div>

            {/* Kept visible at every width — four short labels fit on a 360px
                screen at 10px, and dropping them would leave bare numbers with
                nothing to say what each step contains. */}
            <span
              aria-hidden="true"
              className={`text-center text-[10px] leading-tight transition-colors duration-200 sm:text-xs ${
                state === 'todo'
                  ? 'text-paper/[0.55]'
                  : state === 'active'
                    ? 'font-medium text-exposure'
                    : 'text-paper/[0.72]'
              }`}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
