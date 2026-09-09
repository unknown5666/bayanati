'use client';

import { useEffect, useRef, useState } from 'react';
import { validateImageFile } from '@/lib/validation';
import { Icon } from '@/components/ui/Icon';

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

function prettySize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * An image upload for ID scans.
 *
 * Empty, it is a dropzone: on a desktop you can drag a scan straight onto it,
 * on a phone the whole panel is one large tap target that opens the camera
 * roll. Once a file is chosen the panel becomes a confirmation — thumbnail,
 * name, size, and a way to replace or remove it — because on a form where a
 * wrong photo means a rejected contract, seeing what you actually attached
 * matters more than seeing a filename.
 */
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
  const [dragging, setDragging] = useState(false);

  function accept(file: File | null) {
    if (file) {
      const check = validateImageFile(file);
      if (!check.ok) {
        if (ref.current) ref.current.value = '';
        onReject?.(check.message ?? 'Invalid file');
        onChange(null);
        return;
      }
    }
    onChange(file);
  }

  return (
    <div>
      <span className="field-label">{label}</span>

      {value ? (
        <div
          className={`flex items-center gap-3 rounded-xl border bg-ink-850/70 p-3 animate-fade-in ${
            error ? 'border-danger/70' : 'border-ok/35'
          }`}
        >
          <ImagePreview file={value} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-sm font-medium text-ok">
              <Icon name="checkCircle" className="h-3.5 w-3.5" strokeWidth={2} />
              {selectedLabel}
            </p>
            <p className="truncate text-xs text-paper/[0.72]" dir="ltr" title={value.name}>
              {value.name}
            </p>
            <p className="text-xs text-paper/[0.55] nums">{prettySize(value.size)}</p>
          </div>
          <div className="flex shrink-0 flex-col gap-1">
            <button
              type="button"
              onClick={() => ref.current?.click()}
              className="btn btn-sm border border-ink-600 font-medium text-paper/[0.82] hover:border-exposure hover:text-exposure"
            >
              <Icon name="refresh" className="h-3.5 w-3.5" />
              Replace
            </button>
            <button
              type="button"
              onClick={() => {
                if (ref.current) ref.current.value = '';
                onChange(null);
              }}
              className="btn btn-sm text-paper/[0.72] hover:text-danger"
              aria-label={`Remove ${label}`}
            >
              <Icon name="trash" className="h-3.5 w-3.5" />
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            accept(e.dataTransfer.files?.[0] ?? null);
          }}
          className={`flex w-full flex-col items-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center transition duration-200 ease-entrance ${
            error
              ? 'border-danger/70 bg-danger/[0.04]'
              : dragging
                ? 'scale-[1.01] border-exposure bg-exposure/[0.07]'
                : 'border-ink-600 bg-ink-850/50 hover:border-ink-500 hover:bg-ink-800/60'
          }`}
        >
          <span
            className={`grid h-10 w-10 place-items-center rounded-xl transition duration-200 ${
              dragging ? 'bg-exposure text-ink-950' : 'bg-ink-700 text-paper/[0.72]'
            }`}
          >
            <Icon name="upload" className="h-5 w-5" />
          </span>
          <span className="text-sm font-medium text-paper">{chooseLabel}</span>
          {hint && <span className="text-xs text-paper/[0.55]">{hint}</span>}
        </button>
      )}

      <input
        ref={ref}
        type="file"
        accept="image/jpeg,image/png"
        className="sr-only"
        aria-label={label}
        onChange={(e) => accept(e.target.files?.[0] ?? null)}
      />

      {error && (
        <p className="field-error" role="alert">
          <Icon name="alert" className="mt-0.5 h-3.5 w-3.5" />
          <span>{error}</span>
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

  // The box is reserved whether or not the object URL has resolved, so the row
  // does not jump as the thumbnail appears.
  return (
    <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg border border-ink-700 bg-ink-800">
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      )}
    </span>
  );
}
