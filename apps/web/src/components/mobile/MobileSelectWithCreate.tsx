"use client";

import { useState, useRef, type ReactNode } from "react";
import { haptic } from "@/lib/haptic";

/**
 * MobileSelectWithCreate — a <select> dropdown whose last option is a
 * "+ Create new …" entry that opens an inline creation dialog (provided
 * by the parent via `renderDialog`). The dialog's `onCreated` callback
 * adds the new entity to the options list and auto-selects it.
 *
 * Layout: [ select ────────────── ]
 * The create affordance lives inside the dropdown as the final option,
 * so the field occupies the full available width (no side-by-side button).
 *
 * Usage:
 *   <MobileSelectWithCreate
 *     label="Project"
 *     value={projectId}
 *     onChange={setProjectId}
 *     options={projects.map(p => ({ value: p.id, label: p.name }))}
 *     placeholder="No specific project"
 *     renderDialog={({ open, onClose, onCreated }) => (
 *       <MobileNewProjectDialog open={open} onClose={onClose} onCreated={(p) => { onCreated(p.id, p.name); }} />
 *     )}
 *   />
 */
export function MobileSelectWithCreate({
  label,
  required,
  value,
  onChange,
  options,
  placeholder,
  renderDialog,
  createLabel,
  inputClass = "w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors",
  inputStyle = {
    borderColor: "var(--color-line)",
    backgroundColor: "transparent",
    color: "var(--color-ink-950)",
  },
  labelClass = "block text-m-caption font-bold mb-0",
  labelStyle = { color: "var(--color-ink-700)" } as React.CSSProperties,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  renderDialog: (props: { open: boolean; onClose: () => void; onCreated: (value: string, label: string) => void; originRect: DOMRect | null }) => ReactNode;
  /** Label for the "+" button's aria-label and title. Falls back to `label`, then "item". */
  createLabel?: string;
  inputClass?: string;
  inputStyle?: React.CSSProperties;
  labelClass?: string;
  labelStyle?: React.CSSProperties;
}) {
  const [showDialog, setShowDialog] = useState(false);
  const [extraOptions, setExtraOptions] = useState<{ value: string; label: string }[]>([]);
  const selectRef = useRef<HTMLSelectElement | null>(null);

  const CREATE_VALUE = "__create__";
  const allOptions = [...options, ...extraOptions];

  function handleCreated(value: string, label: string) {
    setExtraOptions((prev) => [...prev, { value, label }]);
    onChange(value);
    setShowDialog(false);
  }

  function openDialog() {
    haptic(10);
    setShowDialog(true);
    // Reset the select back to the current value so the "__create__" option
    // isn't left selected if the user cancels the dialog.
    requestAnimationFrame(() => {
      if (selectRef.current) selectRef.current.value = value;
    });
  }

  return (
    <div>
      {label ? (
        <label className={labelClass} style={labelStyle}>
          {label}
          {required ? <span style={{ color: "var(--color-stop)" }}> *</span> : null}
        </label>
      ) : null}
      <select
        ref={selectRef}
        value={value}
        onChange={(e) => {
          if (e.target.value === CREATE_VALUE) {
            openDialog();
          } else {
            onChange(e.target.value);
          }
        }}
        className={inputClass}
        style={inputStyle}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {allOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
        <option value={CREATE_VALUE} style={{ color: "var(--color-signal-dark)", fontWeight: 600 }}>
          + Create new {createLabel || label || "item"}
        </option>
      </select>

      {renderDialog({ open: showDialog, onClose: () => setShowDialog(false), onCreated: handleCreated, originRect: null })}
    </div>
  );
}
