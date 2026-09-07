// Field validation shared by the intake form (client) and API routes (server).
// Pure functions, no framework dependencies.

export interface FieldResult {
  ok: boolean;
  message?: string; // English message key-independent fallback
}

const ok: FieldResult = { ok: true };
const fail = (message: string): FieldResult => ({ ok: false, message });

/** Standard email format. */
export function validateEmail(value: string): FieldResult {
  const v = value.trim();
  if (!v) return fail('Email is required');
  // Pragmatic RFC-5322-ish check.
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(v) ? ok : fail('Enter a valid email address');
}

/**
 * UAE phone in +971 format. Accepts "+9715XXXXXXXX" or "+9714XXXXXXX" etc.
 * Mobile numbers are +971 5X XXX XXXX (9 national digits after the country code).
 */
export function validatePhone(value: string): FieldResult {
  const v = value.replace(/[\s-]/g, '');
  if (!v) return fail('Phone is required');
  const re = /^\+971[1-9]\d{7,8}$/;
  return re.test(v) ? ok : fail('Use UAE format, e.g. +9715XXXXXXXX');
}

/** Passport: alphanumeric, 6–10 chars. */
export function validatePassport(value: string): FieldResult {
  const v = value.trim().toUpperCase();
  if (!v) return fail('Passport number is required');
  const re = /^[A-Z0-9]{6,10}$/;
  return re.test(v) ? ok : fail('Passport must be 6–10 letters/numbers');
}

/**
 * Emirates ID: 15 digits, always beginning 784, with a final check digit
 * validated by the Luhn algorithm (the same checksum banks/telcos use).
 * Accepts input with or without the "784-YYYY-NNNNNNN-C" dashes.
 */
export function validateEmiratesId(value: string): FieldResult {
  const digits = value.replace(/\D/g, '');
  if (!digits) return fail('Emirates ID is required');
  if (digits.length !== 15) return fail('Emirates ID must be 15 digits');
  if (!digits.startsWith('784')) return fail('Emirates ID must start with 784');
  return luhnValid(digits) ? ok : fail('Emirates ID checksum is invalid');
}

/** Luhn (mod-10) checksum over a numeric string. */
export function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48; // '0' = 48
    if (d < 0 || d > 9) return false;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/**
 * IBAN validation per ISO 13616 with the MOD-97 check.
 * UAE IBANs are "AE" + 2 check digits + 3-digit bank + 16-digit account = 23 chars.
 * The MOD-97 test is applied generically; the length check is UAE-specific but
 * only warns rather than hard-fails so foreign IBANs still pass the checksum.
 */
export function validateIban(value: string): FieldResult {
  const raw = value.replace(/\s/g, '').toUpperCase();
  if (!raw) return fail('IBAN is required');
  if (!/^[A-Z0-9]+$/.test(raw)) return fail('IBAN has invalid characters');
  if (raw.length < 15 || raw.length > 34) return fail('IBAN length is invalid');
  if (raw.startsWith('AE') && raw.length !== 23) {
    return fail('UAE IBAN must be 23 characters (AE + 21 digits)');
  }
  return mod97(raw) === 1 ? ok : fail('IBAN checksum is invalid');
}

/**
 * MOD-97 over an IBAN: move the first 4 chars to the end, convert letters to
 * numbers (A=10 … Z=35), then compute the big number mod 97 in chunks to avoid
 * overflow. A valid IBAN yields 1.
 */
export function mod97(iban: string): number {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    const mapped =
      code >= 65 && code <= 90
        ? (code - 55).toString() // A-Z -> 10..35
        : ch; // digit
    for (const digit of mapped) {
      remainder = (remainder * 10 + (digit.charCodeAt(0) - 48)) % 97;
    }
  }
  return remainder;
}

export function validateRequired(value: string, label: string): FieldResult {
  return value && value.trim() ? ok : fail(`${label} is required`);
}

/** DOB must be a valid past date and imply age >= 18. */
export function validateDob(value: string): FieldResult {
  if (!value) return fail('Date of birth is required');
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return fail('Enter a valid date');
  const now = new Date();
  if (d > now) return fail('Date of birth cannot be in the future');
  const age =
    (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  return age >= 18 ? ok : fail('Crew member must be at least 18');
}

export const IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5MB
export const IMAGE_TYPES = ['image/jpeg', 'image/png'];

export function validateImageFile(file: { type: string; size: number }): FieldResult {
  if (!IMAGE_TYPES.includes(file.type)) return fail('Only JPG or PNG allowed');
  if (file.size > IMAGE_MAX_BYTES) return fail('Image must be under 5MB');
  return ok;
}
