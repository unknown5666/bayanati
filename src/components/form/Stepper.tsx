'use client';

interface StepperProps {
  steps: string[];
  current: number; // 0-based
}

export function Stepper({ steps, current }: StepperProps) {
  return (
    <ol className="flex items-center gap-2" aria-label="Progress">
      {steps.map((label, i) => {
        const state = i < current ? 'done' : i === current ? 'active' : 'todo';
        return (
          <li key={label} className="flex flex-1 flex-col items-center gap-1.5">
            <div className="flex w-full items-center">
              <span
                className={[
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                  state === 'done' && 'bg-exposure text-ink-950',
                  state === 'active' && 'border-2 border-exposure text-exposure',
                  state === 'todo' && 'border border-ink-600 text-ink-500',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-current={state === 'active' ? 'step' : undefined}
              >
                {state === 'done' ? '✓' : i + 1}
              </span>
              {i < steps.length - 1 && (
                <span
                  className={`mx-1 h-0.5 flex-1 rounded ${
                    i < current ? 'bg-exposure' : 'bg-ink-700'
                  }`}
                />
              )}
            </div>
            <span
              className={`text-center text-xs ${
                state === 'todo' ? 'text-ink-500' : 'text-paper/80'
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
