'use client';

import { useEffect, useRef, useState } from 'react';
import { validateImageFile } from '@/lib/validation';

interface FileFieldProps {
  label: string;
  hint?: string;
  chooseLabel: string;
  selectedLabel: string;
  value?: File | null;
  error?: string;
  onChange: (file: File | null) => void;
  onReject?: (message: string) => void;
}

export function FileField({
  label,
  hint,
  chooseLabel,
  selectedLabel,
  value,
  error,
  onChange,
  onReject,
}: FileFieldProps) {
  const ref = useRef<HTMLInputElement>(null);

  return (
    <div>
      <span className="field-label">{label}</span>
      <div
        className={`flex items-center gap-3 rounded-xl border bg-ink-800 px-4 py-3 ${
          error ? 'border-red-500/70' : 'border-ink-600'
        }`}
      >
        <button
          type="button"
          onClick={() => ref.current?.click()}
          className="shrink-0 rounded-lg bg-ink-700 px-3 py-1.5 text-sm font-medium text-paper hover:bg-ink-600"
        >
          {chooseLabel}
        </button>
        <span className="truncate text-sm text-paper/70">
          {value ? `${selectedLabel}: ${value.name}` : hint}
        </span>
        <input
          ref={ref}
          type="file"
          accept="image/jpeg,image/png"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            if (file) {
              const check = validateImageFile(file);
              if (!check.ok) {
                e.target.value = '';
                onReject?.(check.message ?? 'Invalid file');
                onChange(null);
                return;
              }
            }
            onChange(file);
          }}
        />
      </div>
      {value && <ImagePreview file={value} />}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function ImagePreview({ file }: { file: File }) {
  const [url, setUrl] = useState<string>('');
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  if (!url) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt="preview"
      className="mt-2 h-24 w-auto rounded-lg border border-ink-700 object-cover"
    />
  );
}
