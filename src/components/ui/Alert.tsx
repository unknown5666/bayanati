import { Icon, type IconName } from './Icon';

type Tone = 'ok' | 'error' | 'info';

const TONE: Record<Tone, { cls: string; icon: IconName; role: 'status' | 'alert' }> = {
  ok: { cls: 'alert-ok', icon: 'checkCircle', role: 'status' },
  error: { cls: 'alert-error', icon: 'alert', role: 'alert' },
  info: { cls: 'alert-info', icon: 'info', role: 'status' },
};

/**
 * An inline result message. Tone is carried by an icon and wording as well as
 * colour, so it still reads for anyone who cannot distinguish red from green.
 * `role` is live, so the message is announced when it appears after an action.
 */
export function Alert({
  tone = 'info',
  children,
  className = '',
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  const t = TONE[tone];
  return (
    <div className={`alert ${t.cls} ${className}`} role={t.role}>
      <Icon name={t.icon} className="mt-0.5 h-4 w-4" />
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}
