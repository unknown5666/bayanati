import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

/**
 * The landing page has exactly two jobs: send crew to the intake form and
 * admins to the dashboard. Everything else on it is there to make the pick
 * obvious — the two destinations are cards, not a row of equal buttons, so
 * neither audience has to read a label to know which side is theirs.
 */
export default function Home() {
  return (
    <main className="relative mx-auto flex min-h-[calc(100dvh-var(--header-h))] max-w-4xl flex-col justify-center px-6 py-14 sm:py-20">
      <div className="animate-rise-in">
        <span className="chip border-exposure/25 bg-exposure/10 text-exposure">
          <Icon name="sparkle" className="h-3.5 w-3.5" />
          Crew &amp; contract automation
        </span>

        <h1 className="mt-6 text-5xl text-display leading-[1.05] sm:text-7xl">
          <span className="text-flare">Bayanati</span>
        </h1>

        {/* RTL for correct shaping, but aligned with the Latin wordmark above
            it rather than flung to the far edge of the page. */}
        <p
          className="mt-3 text-2xl text-paper/[0.72] rtl:text-left sm:text-3xl"
          lang="ar"
          dir="rtl"
        >
          بياناتي
        </p>

        <p className="mt-6 max-w-xl text-lg leading-relaxed text-paper/[0.72]">
          Intake to signed contract, without the paperwork in between. Crew fill
          in one form; the production sends, tracks and files every contract
          from a single dashboard.
        </p>
      </div>

      {/* Two doors. The crew one is primary — it is opened far more often, and
          usually by someone who arrived from a link on their phone. */}
      <div
        className="mt-10 grid gap-4 sm:grid-cols-2"
        style={{ animationDelay: '80ms' }}
      >
        <Link
          href="/crew/form"
          className="card-interactive group flex flex-col gap-3 p-6"
        >
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-exposure-gradient text-ink-950 shadow-flare">
            <Icon name="signature" className="h-5 w-5" strokeWidth={2} />
          </span>
          <span className="text-lg font-semibold">Crew intake form</span>
          <span className="text-sm leading-relaxed text-paper/[0.72]">
            Four steps, English or Arabic. Your details, documents and bank
            account — then we handle the contract.
          </span>
          <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-sm font-medium text-exposure">
            Start
            <Icon
              name="arrowRight"
              className="h-4 w-4 transition-transform duration-200 ease-entrance group-hover:translate-x-1"
            />
          </span>
        </Link>

        <Link
          href="/crew/dashboard"
          className="card-interactive group flex flex-col gap-3 p-6"
        >
          <span className="grid h-11 w-11 place-items-center rounded-xl border border-ink-600 bg-ink-800 text-paper">
            <Icon name="users" className="h-5 w-5" strokeWidth={2} />
          </span>
          <span className="text-lg font-semibold">Admin dashboard</span>
          <span className="text-sm leading-relaxed text-paper/[0.72]">
            Live crew list, contract status, one-tap send, and every signed copy
            filed automatically.
          </span>
          <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-sm font-medium text-paper/[0.72]">
            Sign in
            <Icon
              name="arrowRight"
              className="h-4 w-4 transition-transform duration-200 ease-entrance group-hover:translate-x-1"
            />
          </span>
        </Link>
      </div>

      <p className="mt-10 text-xs uppercase tracking-[0.28em] text-paper/[0.55]">
        Over Exposure Productions
      </p>
    </main>
  );
}
