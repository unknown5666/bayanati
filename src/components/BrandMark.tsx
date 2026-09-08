// Over Exposure Productions logo mark, redrawn as inline SVG so it stays crisp
// at any size and needs no image asset. Black squircle badge, white field, and
// the two-tone (maroon over black) "X". Swap for the real PNG later if desired.

export function BrandMark({
  size = 32,
  className,
  title = 'Over Exposure Productions',
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={title}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      {/* Badge */}
      <rect
        x="2"
        y="2"
        width="96"
        height="96"
        rx="23"
        fill="#0b0b0d"
        stroke="rgba(255,255,255,0.14)"
        strokeWidth="1.5"
      />
      {/* White field */}
      <rect x="21" y="21" width="58" height="58" fill="#f6f5f2" />
      {/* X — black depth layer, then maroon on top */}
      <g strokeLinecap="butt">
        <path d="M33 33 L71 71 M71 33 L33 71" stroke="#111114" strokeWidth="12" />
        <path d="M31 31 L69 69 M69 31 L31 69" stroke="#8e1f3f" strokeWidth="11" />
      </g>
    </svg>
  );
}
