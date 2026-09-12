'use client';

import { useCallback, useEffect, useRef } from 'react';
import { Icon } from '@/components/ui/Icon';

/**
 * A modal that behaves like one.
 *
 * Beyond the visuals, three things are handled here that an overlay div does
 * not get for free, and whose absence makes a dialog unusable by keyboard:
 *
 *  - focus moves into the dialog on open and returns to the trigger on close,
 *    so a keyboard user is not dumped back at the top of the document;
 *  - Tab is trapped inside, so focus cannot wander onto the page behind;
 *  - the background is locked, so a phone does not scroll the page under the
 *    sheet while someone drags inside it.
 *
 * On phones it is a bottom sheet (thumb-reachable close, no wasted margin);
 * from `sm` up it is a centred dialog.
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  title,
  onClose,
  children,
  wide = false,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** For dialogs that review a list rather than ask for a few fields. */
  wide?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (!items.length) return;

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      // Wrap at both ends so Tab and Shift+Tab cycle within the dialog.
      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;

    restoreTo.current = document.activeElement as HTMLElement | null;

    // Lock the page behind the dialog without letting the layout jump as the
    // scrollbar disappears.
    const { body } = document;
    const previousOverflow = body.style.overflow;
    const previousPadding = body.style.paddingRight;
    const gap = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = 'hidden';
    if (gap > 0) body.style.paddingRight = `${gap}px`;

    window.addEventListener('keydown', onKeyDown, true);

    // Focus the panel itself rather than the first control: it puts the
    // dialog's title at the start of the screen reader's reading order
    // instead of jumping straight into a form field.
    const id = window.requestAnimationFrame(() => panelRef.current?.focus());

    return () => {
      window.cancelAnimationFrame(id);
      window.removeEventListener('keydown', onKeyDown, true);
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPadding;
      restoreTo.current?.focus?.();
    };
  }, [open, onKeyDown]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/75 p-0 backdrop-blur-sm animate-fade-in sm:items-center sm:p-4"
      onMouseDown={(e) => {
        // mousedown, not click: a click that *started* inside the panel and
        // ended on the backdrop (a drag while selecting text) should not close.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`card flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-b-none p-0 shadow-float outline-none animate-sheet-up sm:rounded-2xl sm:animate-scale-in ${
          wide ? 'max-w-3xl' : 'max-w-lg'
        }`}
      >
        {/* Drag affordance — reads as a sheet on a phone, hidden on desktop. */}
        <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-ink-600 sm:hidden" />

        <div className="flex items-center justify-between gap-3 border-b border-ink-800 px-5 py-3.5 sm:px-6">
          <h3 className="text-lg font-semibold tracking-display">{title}</h3>
          <button
            onClick={onClose}
            className="btn-icon -mr-2"
            aria-label={`Close ${title}`}
          >
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
          {children}
        </div>
      </div>
    </div>
  );
}
