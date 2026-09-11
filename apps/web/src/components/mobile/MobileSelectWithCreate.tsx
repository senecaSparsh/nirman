"use client";

import { useState, type ReactNode, type ComponentType, type CSSProperties } from "react";
import { haptic } from "@/lib/haptic";
import { SelectorCard, SelectorRow, SelectorModal } from "@/components/mobile/v2/form-primitives";

/**
 * MobileSelectWithCreate — a unified entity selector that uses the same
 * `SelectorCard` + `SelectorModal` bottom-sheet pattern as the "holy grail"
 * Material Sale form. The trigger is a tappable card/row with a label and
 * chevron; tapping opens a searchable bottom-sheet list with an optional
 * "+ Create new" button at the bottom.
 *
 * This replaces the old native `<select>` implementation so ALL entity
 * selectors across the app have the same UI pattern — no inconsistency.
 *
 * The API is backward-compatible with the previous version: callers that
 * pass `inputClass`/`inputStyle`/`labelClass`/`labelStyle` still work
 * (those props are now ignored — styling is handled by SelectorCard for
 * visual consistency).
 *
 * Usage (with create):
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
 *
 * Usage (without create — just a searchable entity picker):
 *   <MobileSelectWithCreate
 *     label="Supplier"
 *     value={supplierId}
 *     onChange={setSupplierId}
 *     options={suppliers.map(s => ({ value: s.id, label: s.name, sub: s.balanceOwed > 0 ? `Owes ${formatCurrency(s.balanceOwed)}` : undefined }))}
 *     placeholder="— Select supplier —"
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
  icon,
  subvalue,
  compact,
  disabled,
  /** Stacked mode — renders label above + h-7 tappable value below (matches
   *  UnderlineInput). Use when placed side-by-side with plain <input> fields
   *  in a grid-cols-2 row so baselines and borders align. */
  stacked,
  // Deprecated styling props — kept for backward compat but ignored.
  inputClass: _inputClass,
  inputStyle: _inputStyle,
  labelClass: _labelClass,
  labelStyle: _labelStyle,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; sub?: string }[];
  placeholder?: string;
  /** When provided, adds a "+ Create new" button to the picker and renders
   *  the dialog when tapped. When omitted, the selector is a simple picker. */
  renderDialog?: (props: { open: boolean; onClose: () => void; onCreated: (value: string, label: string) => void; originRect: DOMRect | null }) => ReactNode;
  /** Label for the create button's text. Falls back to `label`, then "item". */
  createLabel?: string;
  /** Optional icon for the selector trigger (lucide component). */
  icon?: ComponentType<{ className?: string; style?: CSSProperties }>;
  /** Optional subvalue shown next to the value in the trigger. */
  subvalue?: string | null;
  /** Compact mode — smaller icons, for line-item level selectors. */
  compact?: boolean;
  /** When true, the trigger is disabled (e.g. while loading options). */
  disabled?: boolean;
  /** Stacked mode — label above + h-7 value below (matches UnderlineInput). */
  stacked?: boolean;
  /** @deprecated Use the default SelectorCard styling. */
  inputClass?: string;
  /** @deprecated Use the default SelectorCard styling. */
  inputStyle?: React.CSSProperties;
  /** @deprecated Use the default SelectorCard styling. */
  labelClass?: string;
  /** @deprecated Use the default SelectorCard styling. */
  labelStyle?: React.CSSProperties;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [extraOptions, setExtraOptions] = useState<{ value: string; label: string; sub?: string }[]>([]);

  // Deduplicate by value — the parent component may also add a newly created
  // item to its own `options` list (e.g. MobileNewMaterialDialog adds a new
  // category to `localCategories` AND we add it to `extraOptions` here).
  // Keep the first occurrence (from `options`) so the parent's richer data wins.
  const allOptions = [...options, ...extraOptions].filter(
    (o, i, arr) => arr.findIndex((x) => x.value === o.value) === i,
  );
  const selected = allOptions.find((o) => o.value === value);

  // Build items for SelectorModal — include a "none" option if placeholder is set
  const items = [
    ...(placeholder ? [{ id: "", label: placeholder, sub: undefined as string | undefined }] : []),
    ...allOptions.map((o) => ({ id: o.value, label: o.label, sub: o.sub })),
  ];

  function handleCreated(newValue: string, newLabel: string) {
    setExtraOptions((prev) => [...prev, { value: newValue, label: newLabel }]);
    onChange(newValue);
    setShowDialog(false);
  }

  // SelectorModal handles closing itself before calling onCreate, so
  // we just pass handleOpenCreate which only needs to open the dialog.
  function handleOpenCreate() {
    setShowDialog(true);
  }

  const Trigger = compact ? SelectorRow : SelectorCard;

  return (
    <>
      <Trigger
        onClick={() => { if (!disabled) { haptic(10); setShowPicker(true); } }}
        icon={icon}
        label={label}
        placeholder={placeholder}
        value={selected?.label}
        subvalue={subvalue ?? selected?.sub}
        required={required}
        compact={compact}
        {...(!compact ? { stacked: stacked !== false } : {})}
      />

      {showPicker ? (
        <SelectorModal
          title={label}
          items={items}
          selectedId={value}
          onSelect={(id) => { onChange(id); setShowPicker(false); }}
          onClose={() => setShowPicker(false)}
          onCreate={renderDialog ? handleOpenCreate : undefined}
          createLabel={`Create new ${createLabel || label || "item"}`}
        />
      ) : null}

      {renderDialog?.({ open: showDialog, onClose: () => setShowDialog(false), onCreated: handleCreated, originRect: null })}
    </>
  );
}
