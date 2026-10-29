export type ValidationErrors<T> = Partial<Record<keyof T, string>>;

export function required(value: string | number | null | undefined, label: string): string | undefined {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "") || (typeof value === "number" && isNaN(value))) {
    return `${label} is required`;
  }
}

export function min(value: number, min: number, label: string): string | undefined {
  if (value < min) return `${label} must be at least ${min}`;
}

export function max(value: number, max: number, label: string): string | undefined {
  if (value > max) return `${label} must be at most ${max}`;
}

export function positiveNumber(value: string | number, label: string): string | undefined {
  const n = typeof value === "string" ? Number(value) : value;
  if (isNaN(n) || n <= 0) return `${label} must be a positive number`;
}

/**
 * Validates that a string represents a valid non-negative number (>= 0).
 * Catches text typed into a number field (e.g. "abc" → NaN).
 * Empty string is allowed (field is optional) — use `required` separately if needed.
 */
export function nonNegativeNumber(value: string | number, label: string): string | undefined {
  if (value === "" || value === null || value === undefined) return;
  const n = typeof value === "string" ? Number(value) : value;
  if (isNaN(n)) return `${label} must be a number`;
  if (n < 0) return `${label} cannot be negative`;
}

/**
 * Validates that a string represents a valid number within [min, max].
 * Empty string is allowed (field is optional).
 */
export function numberInRange(value: string | number, minVal: number, maxVal: number, label: string): string | undefined {
  if (value === "" || value === null || value === undefined) return;
  const n = typeof value === "string" ? Number(value) : value;
  if (isNaN(n)) return `${label} must be a number`;
  if (n < minVal) return `${label} must be at least ${minVal}`;
  if (n > maxVal) return `${label} must be at most ${maxVal}`;
}

export function email(value: string): string | undefined {
  if (!value) return;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "Invalid email address";
}

export function phone(value: string): string | undefined {
  if (!value) return;
  if (!/^[+]?[\d\s-]{10,15}$/.test(value)) return "Invalid phone number";
}

// ── GSTIN checksum (GSTN mod-36) ─────────────────────────────────
// The 15th character is a check digit over the first 14. A mistyped
// GSTIN on a supplier means your input tax credit is rejected at
// filing; on a customer it breaks their invoice. Catching a bad digit
// here costs nothing (pure local math) and saves real money.
const GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function gstinCheckDigit(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const product = GSTIN_CHARS.indexOf(first14[i]!) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36]!;
}

export function isValidGstin(value: string): boolean {
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(value)) return false;
  return gstinCheckDigit(value.slice(0, 14)) === value[14];
}

export function gstin(value: string): string | undefined {
  if (!value) return;
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(value)) return "Invalid GSTIN format";
  if (gstinCheckDigit(value.slice(0, 14)) !== value[14]) return "Invalid GSTIN — check digit mismatch";
}

export function validateForm<T>(values: T, rules: Partial<Record<keyof T, (value: T[keyof T], allValues: T) => string | undefined>>): ValidationErrors<T> {
  const errors: ValidationErrors<T> = {};
  for (const key in rules) {
    const rule = rules[key];
    if (rule) {
      const error = rule(values[key], values);
      if (error) errors[key] = error;
    }
  }
  return errors;
}
