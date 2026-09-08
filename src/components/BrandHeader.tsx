import Link from 'next/link';
import { BrandMark } from './BrandMark';

// Consistent brand lockup shown on every page (wired into the root layout).
export function BrandHeader() {
  return (
    <header className="border-b border-ink-800 bg-ink-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-3" aria-label="Over Exposure Productions — home">
          <BrandMark size={34} className="shrink-0" />
          <span className="flex flex-col leading-none">
            <span className="text-[13px] font-bold uppercase tracking-[0.18em] text-paper">
              Over Exposure
            </span>
            <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.32em] text-brand-soft">
              Productions
            </span>
          </span>
        </Link>
      </div>
    </header>
  );
}
