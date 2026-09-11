"use client";

import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import type { ValidationErrors } from "./validate";

/**
 * useInlineValidation — encapsulates the onBlur + setErrors pattern that
 * ~6 form dialogs already implement by hand.
 *
 * Provides:
 *  - `errors` state (Partial<Record<K, string>>) to spread into <Field error={...}>
 *  - `validateField(key)` — runs the rule for one field, returns error string | undefined
 *  - `onBlur(key)` — validates one field on blur and stores/clears its error
 *  - `validateAll()` — validates every field, stores all errors, returns true if valid
 *  - `clearError(key)` — clears a single field's error (call on onChange to clear
 *    the red state as soon as the user starts fixing it)
 *  - `clearAll()` — resets all errors (call when dialog closes or form resets)
 *
 * Usage:
 *   type Values = { name: string; qty: string; ... };
 *   const rules: ValidationRules<Values> = {
 *     name: (v) => required(v, "Name"),
 *     qty:  (v) => required(v, "Qty") ?? positiveNumber(v, "Qty"),
 *   };
 *   const { errors, onBlur, validateAll, clearError, clearAll } = useInlineValidation(rules);
 *
 *   <Field label="Name" error={errors.name}>
 *     <Input value={form.name}
 *       onChange={(e) => { set("name", e.target.value); clearError("name"); }}
 *       onBlur={() => onBlur("name")} />
 *   </Field>
 *
 *   // On submit:
 *   if (!validateAll(form)) { toast.error("Please fix the errors"); return; }
 */
export type ValidationRules<T> = Partial<
  Record<keyof T, (value: T[keyof T], allValues: T) => string | undefined>
>;

export function useInlineValidation<T extends Record<string, unknown>>(
  rules: ValidationRules<T>,
): {
  errors: ValidationErrors<T>;
  setErrors: Dispatch<SetStateAction<ValidationErrors<T>>>;
  validateField: (key: keyof T, values: T) => string | undefined;
  onBlur: (key: keyof T, values: T) => void;
  validateAll: (values: T) => boolean;
  clearError: (key: keyof T) => void;
  clearAll: () => void;
} {
  const [errors, setErrors] = useState<ValidationErrors<T>>({});

  const validateField = useCallback(
    (key: keyof T, values: T): string | undefined => {
      const rule = rules[key];
      if (!rule) return undefined;
      return rule(values[key], values);
    },
    [rules],
  );

  const onBlur = useCallback(
    (key: keyof T, values: T) => {
      const error = validateField(key, values);
      setErrors((prev) => {
        const next = { ...prev };
        if (error) next[key] = error;
        else delete next[key];
        return next;
      });
    },
    [validateField],
  );

  const validateAll = useCallback(
    (values: T): boolean => {
      const newErrors: ValidationErrors<T> = {};
      for (const key in rules) {
        const rule = rules[key];
        if (rule) {
          const error = rule(values[key], values);
          if (error) newErrors[key] = error;
        }
      }
      setErrors(newErrors);
      return Object.keys(newErrors).length === 0;
    },
    [rules],
  );

  const clearError = useCallback((key: keyof T) => {
    setErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const clearAll = useCallback(() => setErrors({}), []);

  return { errors, setErrors, validateField, onBlur, validateAll, clearError, clearAll };
}
