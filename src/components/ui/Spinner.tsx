// A determinate-looking busy indicator for buttons and inline waits.
//
// It sits inside the label rather than replacing it ("Sending…" keeps its
// text), because swapping a button's whole label out on click loses the
// context of what is being waited on.

export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={`animate-spin shrink-0 ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
