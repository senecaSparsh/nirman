"use client";

import { useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { haptic } from "@/lib/haptic";

/**
 * MobileSelectWithCreate — a <select> dropdown with a "+" button on the right
 * for inline creation. When the user taps "+", a bottom-sheet dialog is shown
 * (provided by the parent via `renderDialog`). The dialog's `onCreated`
 * callback adds the new entity to the options list and auto-selects it.
 *
 * Layout: [ select ────────────── ] [ + ]
 * The "+" button sits in the same row as the select, shrink-0.
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
  inputClass = "w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem] outline-none",
  inputStyle = {
    borderColor: "var(--color-line)",
    backgroundColor: "var(--color-paper)",
    color: "var(--color-ink-950)",
  },
  labelClass = "text-[0.5625rem] font-semibold block mb-1",
  labelStyle = { color: "var(--color-ink-500)" } as React.CSSProperties,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  renderDialog: (props: { open: boolean; onClose: () => void; onCreated: (value: string, label: string) => void }) => ReactNode;
  inputClass?: string;
  inputStyle?: React.CSSProperties;
  labelClass?: string;
  labelStyle?: React.CSSProperties;
}) {
  const [showDialog, setShowDialog] = useState(false);
  const [extraOptions, setExtraOptions] = useState<{ value: string; label: string }[]>([]);

  const allOptions = [...options, ...extraOptions];

  function handleCreated(value: string, label: string) {
    setExtraOptions((prev) => [...prev, { value, label }]);
    onChange(value);
    setShowDialog(false);
  }

  return (
    <div>
      {label ? (
        <label className={labelClass} style={labelStyle}>
          {label}
          {required ? <span style={{ color: "var(--color-stop)" }}> *</span> : null}
        </label>
      ) : null}
      <div className="flex items-center gap-1.5">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
          style={inputStyle}
        >
          {placeholder ? <option value="">{placeholder}</option> : null}
          {allOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            haptic(10);
            setShowDialog(true);
          }}
          className="shrink-0 grid place-items-center self-stretch aspect-square rounded-[0.5rem] border press"
          style={{
            borderColor: "var(--color-signal)",
            backgroundColor: "var(--color-signal-wash)",
            color: "var(--color-signal-dark)",
          }}
          aria-label={`Create new ${label || "option"}`}
        >
          <Plus className="size-4" />
        </button>
      </div>

      {renderDialog({ open: showDialog, onClose: () => setShowDialog(false), onCreated: handleCreated })}
    </div>
  );
}
