'use client';

import type { InputHTMLAttributes } from 'react';
import { Icon } from '@/components/ui/Icon';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

/**
 * A labelled text input.
 *
 * The label is always visible — a placeholder-as-label vanishes the moment
 * someone starts typing, which is exactly when they want to check what the
 * field was. Errors sit directly beneath the field they belong to, are wired
 * up with `aria-describedby`, and announce themselves via `role="alert"`.
 */
export function Field({ label, error, hint, id, className = '', ...rest }: FieldProps) {
  const inputId = id ?? rest.name;
  return (
    <div>
      <label htmlFor={inputId} className="field-label">
        {label}
      </label>
      <input
        id={inputId}
        className={`field-input ${error ? 'field-input-error' : ''} ${className}`}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
        {...rest}
      />
      {hint && !error && (
        <p id={`${inputId}-hint`} className="field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${inputId}-error`} className="field-error" role="alert">
          <Icon name="alert" className="mt-0.5 h-3.5 w-3.5" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
