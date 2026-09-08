'use client';

import { useEffect } from 'react';

export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="card flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-b-none p-0 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-ink-800 bg-ink-900/95 px-6 py-4 backdrop-blur">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-paper/60 hover:bg-ink-800 hover:text-paper"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
