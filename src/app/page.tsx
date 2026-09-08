import Link from 'next/link';

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-8 px-6 py-16 text-center">
      <div>
        <h1 className="text-5xl font-bold tracking-tight">Bayanati</h1>
        <p className="mt-4 text-lg text-paper/70">
          Crew intake &amp; contract automation.
        </p>
      </div>

      <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
        <Link href="/crew/form" className="btn-primary">
          Crew intake form
        </Link>
        <Link href="/crew/dashboard" className="btn-ghost">
          Admin dashboard
        </Link>
      </div>

      <p className="text-xs text-ink-500">
        بياناتي — نظام إدارة طاقم العمل
      </p>
    </main>
  );
}
