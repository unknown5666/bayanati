'use client';

/**
 * A segmented control for switching between mutually exclusive views.
 *
 * Each segment is a real button with `aria-pressed`, so the active state is
 * exposed to assistive tech rather than only being implied by colour, and the
 * whole group is labelled for context.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className = '',
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; title?: string }[];
  label: string;
  className?: string;
}) {
  return (
    <div className={`segmented ${className}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          title={o.title}
          className="segmented-item"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
