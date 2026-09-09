import Link from 'next/link';
import { BrandMark } from './BrandMark';

/**
 * The brand lockup shown on every page (wired into the root layout).
 *
 * Sticky and translucent so the identity stays present while a long form or
 * crew list scrolls under it, with a hairline amber rule at the bottom edge
 * that ties the header to the page's warm light.
 */
export function BrandHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-ink-800/80 bg-ink-950/70 backdrop-blur-xl">
      <div className="mx-auto flex h-[var(--header-h)] max-w-6xl items-center gap-3 px-4">
        <Link
          href="/"
          className="group flex items-center gap-3 rounded-xl py-1 pr-2 transition duration-200"
          aria-label="Over Exposure Productions — home"
        >
          <BrandMark
            size={34}
            className="shrink-0 transition duration-300 ease-entrance group-hover:scale-105"
          />
          <span className="flex flex-col leading-none">
            <span className="text-[13px] font-bold uppercase tracking-[0.18em] text-paper">
              Over Exposure
            </span>
            {/* brand.bright rather than brand.soft: the maroon at this size
                needs to clear 4.5:1 against the ink ground. */}
            <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.32em] text-brand-bright">
              Productions
            </span>
          </span>
        </Link>
      </div>
      <div className="h-px bg-gradient-to-r from-transparent via-exposure/30 to-transparent" />
    </header>
  );
}
