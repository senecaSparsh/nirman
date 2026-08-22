"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * SELECT WITH CREATE
 *
 * A native <select> that always carries a trailing "+ Create new…" option.
 * Picking that option opens a dialog (supplied via `renderCreateDialog`) so
 * the user can create the missing entity inline — no redirect, no lost form
 * state. On success the dialog calls back with the new entity's id + label,
 * which this component auto-selects and propagates via `onChange`.
 *
 * Why native + sentinel instead of a custom popover combobox? The rest of the
 * app uses the native `Select` everywhere (fastest picker on a phone, screen-
 * reader friendly). We keep that and just append one synthetic option. When
 * the user picks it we reset the select to its previous value (so the field
 * never visually "becomes" the sentinel) and open the dialog.
 *
 * `options` is an array of { value, label } — the same shape EditableGrid
 * uses — so callers can build it from any entity list with a `.map()`.
 *
 * `renderCreateDialog({ open, onCreated, onClose })` returns the dialog node.
 * `onCreated({ id, label })` is called by the dialog after a successful POST;
 * it auto-selects the new value and refreshes the page (router.refresh) so any
 * server-fetched option lists pick up the new row. `onClose(false)` closes it.
 */

export type SelectOption = { value: string; label: string };

const CREATE_SENTINEL = "__create_new__";

export function SelectWithCreate({
  value,
  onChange,
  options,
  groups,
  placeholder = "Select…",
  createLabel,
  renderCreateDialog,
  required,
  disabled,
  className,
  "aria-invalid": ariaInvalid,
  id,
  onBlur,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Flat option list. Mutually exclusive with `groups`. */
  options?: SelectOption[];
  /** Grouped options (rendered as <optgroup>). Mutually exclusive with `options`. */
  groups?: { label: string; options: SelectOption[] }[];
  placeholder?: string;
  /** Shown as "+ Create new {createLabel}". Also seeds the dialog title. */
  createLabel: string;
  /** Renders the create dialog. It is always mounted (so it can animate). */
  renderCreateDialog: (props: {
    open: boolean;
    onCreated: (entity: { id: string; label?: string }) => void;
    onClose: (open: boolean) => void;
  }) => React.ReactNode;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  "aria-invalid"?: boolean;
  id?: string;
  onBlur?: () => void;
}) {
  const [createOpen, setCreateOpen] = React.useState(false);
  // Remember the last real value so we can restore it when the sentinel is
  // picked (the select would otherwise show the sentinel text briefly).
  const lastValueRef = React.useRef(value);

  React.useEffect(() => {
    if (value && value !== CREATE_SENTINEL) lastValueRef.current = value;
  }, [value]);

  function handleSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    if (next === CREATE_SENTINEL) {
      // Restore the previous real value so the field doesn't visually flip
      // to the sentinel label, then open the create dialog.
      e.target.value = lastValueRef.current;
      setCreateOpen(true);
      return;
    }
    onChange(next);
  }

  function handleCreated(entity: { id: string; label?: string }) {
    setCreateOpen(false);
    // Auto-select the freshly created entity. If the dialog gave us a label,
    // we also splice it into the options list optimistically so it shows up
    // immediately even before router.refresh revalidates the server data.
    onChange(entity.id);
  }

  return (
    <>
      <div className="relative w-full">
        <select
          id={id}
          value={value}
          onChange={handleSelect}
          onBlur={onBlur}
          required={required}
          disabled={disabled}
          aria-invalid={ariaInvalid}
          className={cn(
            "w-full h-11 appearance-none bg-none pl-3 pr-8 text-[14px] sm:h-8 sm:pl-2.5 sm:pr-7 sm:text-[13px]",
            "rounded-md border border-input bg-card text-foreground",
            "transition-[border-color,box-shadow] duration-100",
            "placeholder:text-faint hover:border-border-strong",
            "focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/20",
            "disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground",
            "aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/20",
            className,
          )}
        >
          {required && <option value="" disabled>{placeholder}</option>}
          {!required && <option value="">{placeholder}</option>}
          {groups
            ? groups.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.options.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </optgroup>
              ))
            : (options ?? []).map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
          <option value={CREATE_SENTINEL} disabled>
            + Create new {createLabel}…
          </option>
        </select>
        <Plus className="pointer-events-none absolute right-7 top-1/2 size-3 -translate-y-1/2 text-faint" />
        <svg
          className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
      {renderCreateDialog({
        open: createOpen,
        onCreated: handleCreated,
        onClose: setCreateOpen,
      })}
    </>
  );
}
