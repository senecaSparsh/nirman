export type ValidationErrors<T> = Partial<Record<keyof T, string>>;

export function required(value: string | number | null | undefined, label: string): string | undefined {
  if (value === null || value === undefined || value === "" || (typeof value === "number" && isNaN(value))) {
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

export function email(value: string): string | undefined {
  if (!value) return;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "Invalid email address";
}

export function phone(value: string): string | undefined {
  if (!value) return;
  if (!/^[+]?[\d\s-]{10,15}$/.test(value)) return "Invalid phone number";
}

export function gstin(value: string): string | undefined {
  if (!value) return;
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(value)) return "Invalid GSTIN format";
}

export function validateForm<T>(values: T, rules: Partial<Record<keyof T, (value: T[keyof T]) => string | undefined>>): ValidationErrors<T> {
  const errors: ValidationErrors<T> = {};
  for (const key in rules) {
    const rule = rules[key];
    if (rule) {
      const error = rule(values[key]);
      if (error) errors[key] = error;
    }
  }
  return errors;
}
