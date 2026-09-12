import type { Metadata } from 'next';
import { getCrew, getProjectName } from '@/lib/crew-db';
import { buildPlaceholders, formatAed } from '@/lib/contract-pdf';
import { lookupSignToken } from '@/lib/sign-tokens';
import { SignContract } from '@/components/sign/SignContract';
import { Icon, type IconName } from '@/components/ui/Icon';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Sign your contract — Over Exposure Productions',
  robots: { index: false, follow: false },
};

const LETTER = { X: 'A', Y: 'R' } as const;

/**
 * Public signing page — the token in the URL is the authorisation, so there is
 * no login. It is single-use and expires; an invalid one gets a plain
 * explanation rather than a 404, because the person holding it is a crew member
 * who was asked to come here.
 */
export default async function SignPage({ params }: { params: { token: string } }) {
  // The people who land here are crew members with no account and no support
  // channel beyond replying to an email, so a backend wobble must read as a
  // "try again shortly", never as the app's crash page.
  let lookup: Awaited<ReturnType<typeof lookupSignToken>>;
  try {
    lookup = await lookupSignToken(params.token);
  } catch (err) {
    console.error('[sign] token lookup failed', err);
    return (
      <Notice
        title="We cannot open your contract right now"
        body="Something on our side is temporarily unavailable. Please try the link again in a few minutes — it is still valid."
        bodyAr="تعذّر فتح العقد حالياً لسبب تقني مؤقت. يُرجى المحاولة مرة أخرى بعد قليل، والرابط لا يزال صالحاً."
      />
    );
  }

  if (!lookup.ok) {
    return (
      <Notice
        title={
          lookup.reason === 'used'
            ? 'This contract is already signed'
            : lookup.reason === 'expired'
              ? 'This signing link has expired'
              : 'This signing link is not valid'
        }
        body={
          lookup.reason === 'used'
            ? 'Nothing more to do — we have your signature on file. If you need a copy, reply to the email we sent you.'
            : lookup.reason === 'expired'
              ? 'Please reply to the contract email and the production will send you a fresh link.'
              : 'Please check that you opened the most recent link from the contract email, or reply to that email and we will send you a new one.'
        }
        bodyAr={
          lookup.reason === 'used'
            ? 'تم توقيع هذا العقد بالفعل، ولا يلزم أي إجراء إضافي.'
            : 'انتهت صلاحية الرابط أو أنه غير صحيح. يُرجى الرد على بريد العقد وسنرسل لكم رابطاً جديداً.'
        }
        tone={lookup.reason === 'used' ? 'ok' : 'warn'}
      />
    );
  }

  const { crewId, type, ref } = lookup.record;
  const crew = await getCrew(crewId);
  if (!crew) {
    return (
      <Notice
        title="We could not find this contract"
        body="Please reply to the contract email so the production can look into it."
        bodyAr="تعذّر العثور على هذا العقد. يُرجى الرد على بريد العقد."
      />
    );
  }

  const projectName = await getProjectName(crew.projectId);
  const placeholders = buildPlaceholders(crew, type, projectName);
  const amount = formatAed(type === 'X' ? crew.contract.amountX : crew.contract.amountY);

  return (
    <SignContract
      token={params.token}
      crewName={placeholders.CREW_NAME}
      projectName={placeholders.PROJECT_NAME}
      role={placeholders.ROLE}
      period={`${placeholders.DATE_FROM} — ${placeholders.DATE_TO}`}
      amount={amount}
      contractLabel={LETTER[type]}
      reference={ref}
    />
  );
}

/**
 * The dead-end screen for a link that cannot be opened. `tone` distinguishes
 * "already done, nothing to worry about" from "something is wrong" — a crew
 * member who already signed should not be met with a red warning.
 */
function Notice({
  title,
  body,
  bodyAr,
  tone = 'warn',
}: {
  title: string;
  body: string;
  bodyAr: string;
  tone?: 'ok' | 'warn';
}) {
  const icon: IconName = tone === 'ok' ? 'checkCircle' : 'info';
  return (
    <main className="mx-auto max-w-lg px-5 pb-16 pt-10">
      <div className="card p-7 text-center animate-scale-in">
        <span
          className={`mx-auto grid h-14 w-14 place-items-center rounded-2xl border ${
            tone === 'ok'
              ? 'border-ok/30 bg-ok/10 text-ok'
              : 'border-warn/30 bg-warn/10 text-warn'
          }`}
        >
          <Icon name={icon} className="h-7 w-7" />
        </span>
        <h1 className="mt-5 text-xl text-display">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-paper/[0.72]">{body}</p>
        <p
          className="mt-4 border-t border-ink-800 pt-4 text-sm leading-relaxed text-paper/[0.72]"
          dir="rtl"
          lang="ar"
        >
          {bodyAr}
        </p>
      </div>
    </main>
  );
}
