"use client";

import { useState, useMemo, useEffect, type ComponentType, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, Search, X, CheckCircle2, Plus } from "lucide-react";
import { haptic } from "@/lib/haptic";

/**
 * ═══════════════════════════════════════════════════════════════════
 * Mobile form primitives — extracted from the Material Sale form
 * (the "holy grail" reference). Use these in all mobile form dialogs
 * for consistent UX across the app.
 *
 * Patterns:
 *  · SectionCard — bordered rounded container with a heading
 *  · SelectorCard — prominent tappable selector (customer/project level)
 *  · SelectorRow — compact tappable selector (line-item level)
 *  · SelectorModal — searchable bottom-sheet list picker
 *  · TypeCard — segmented control card (active/inactive toggle)
 *  · UnderlineInput — label + underline text input
 *  · StickyActionBar — bottom-pinned summary + submit bar
 * ═══════════════════════════════════════════════════════════════════
 */

/* ── Section card — bordered rounded container with a heading ── */
export function SectionCard({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div
      className="rounded-[0.625rem] border p-3 flex flex-col gap-3"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      <div className="flex items-center justify-between">
        <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
          {title}
        </p>
        {action}
      </div>
      {children}
    </div>
  );
}

/* ── Selector card — prominent tappable card for top-level selectors ── */
export function SelectorCard({
  onClick,
  icon: Icon,
  label,
  value,
  subvalue,
  placeholder,
  required,
  compact,
  stacked = true,
}: {
  onClick: () => void;
  icon?: ComponentType<{ className?: string; style?: CSSProperties }>;
  label: string;
  value?: string;
  subvalue?: string | null;
  placeholder?: string;
  required?: boolean;
  compact?: boolean;
  /** Stacked mode (default) — renders label above + h-7 tappable value below
   *  (matches UnderlineInput). Pass `stacked={false}` for the old inline mode
   *  (label inside the button) — use only when the selector is standalone and
   *  not side-by-side with inputs. */
  stacked?: boolean;
}) {
  const hasValue = !!value;

  // ── Stacked mode (default): label above + h-7 value area with border-b ──
  // This exactly matches UnderlineInput's layout so selectors and inputs
  // align perfectly in grid-cols-2 rows. This is the default because most
  // selectors are placed alongside inputs and need border-b alignment.
  if (stacked) {
    return (
      <div>
        {label ? (
          <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
            {label}
            {required ? <span style={{ color: "var(--color-stop)" }}> *</span> : null}
          </label>
        ) : null}
        <button
          type="button"
          onClick={onClick}
          className="w-full h-7 px-1 flex items-center gap-1 text-m-caption press text-left border-b focus:border-b-2 transition-colors"
          style={{ borderColor: "var(--color-line)", backgroundColor: "transparent" }}
        >
          {Icon ? (
            <Icon className="shrink-0 size-3" style={{ color: "var(--color-ink-500)" }} />
          ) : null}
          <span
            className="min-w-0 flex-1 truncate font-bold"
            style={{ color: hasValue ? "var(--color-ink-950)" : "var(--color-ink-400)" }}
          >
            {hasValue ? (
              <>
                {value}
                {subvalue ? (
                  <span className="font-normal" style={{ color: "var(--color-ink-500)" }}> {subvalue}</span>
                ) : null}
              </>
            ) : (
              placeholder ?? "Select…"
            )}
          </span>
          <ChevronRight className="shrink-0 size-3" style={{ color: "var(--color-ink-500)" }} />
        </button>
      </div>
    );
  }

  // ── Inline mode (opt-in via stacked={false}): single-line button with label inside ──
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-1.5 text-m-body press text-left border-b focus:border-b-2 transition-colors pb-0.5"
      style={{ borderColor: "var(--color-line)", backgroundColor: "transparent" }}
    >
      {Icon ? (
        <Icon className={`shrink-0 ${compact ? "size-3" : "size-3.5"}`} style={{ color: "var(--color-ink-500)" }} />
      ) : null}
      <div className="min-w-0 flex-1">
        {hasValue ? (
          <p className="text-m-caption font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
            {value}
            {subvalue && !compact ? (
              <span className="font-normal" style={{ color: "var(--color-ink-500)" }}> {subvalue}</span>
            ) : null}
          </p>
        ) : (
          <p className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
            {placeholder || label}
            {required ? <span style={{ color: "var(--color-stop)" }}> *</span> : null}
          </p>
        )}
      </div>
      <ChevronRight className={`shrink-0 ${compact ? "size-3" : "size-3.5"}`} style={{ color: "var(--color-ink-500)" }} />
    </button>
  );
}

/* ── Selector row — compact tappable row for line-item selectors ── */
export function SelectorRow({
  onClick,
  icon: Icon,
  label,
  value,
  subvalue,
  required,
  compact,
  placeholder,
}: {
  onClick: () => void;
  icon?: ComponentType<{ className?: string; style?: CSSProperties }>;
  label: string;
  value?: string;
  subvalue?: string;
  required?: boolean;
  compact?: boolean;
  placeholder?: string;
}) {
  const hasValue = !!value;
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full h-7 flex items-center gap-1.5 press text-left border-b focus:border-b-2 transition-colors"
      style={{ borderColor: "var(--color-line)", backgroundColor: "transparent" }}
    >
      {Icon ? (
        <Icon className={`shrink-0 ${compact ? "size-2.5" : "size-3"}`} style={{ color: "var(--color-ink-500)" }} />
      ) : null}
      <div className="min-w-0 flex-1">
        {hasValue ? (
          <p className="text-m-caption font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
            {value}
            {subvalue ? (
              <span className="font-normal" style={{ color: "var(--color-ink-500)" }}> · {subvalue}</span>
            ) : null}
          </p>
        ) : (
          <span className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
            {placeholder || label}
            {required ? <span style={{ color: "var(--color-stop)" }}> *</span> : null}
          </span>
        )}
      </div>
      <ChevronRight className={`shrink-0 ${compact ? "size-2.5" : "size-3"}`} style={{ color: "var(--color-ink-500)" }} />
    </button>
  );
}

/* ── Type card — segmented control toggle (active/inactive) ── */
export function TypeCard({
  active,
  onClick,
  label,
  sublabel,
  activeColor = "var(--color-ink-950)",
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  sublabel?: string;
  activeColor?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border-b-2 px-1 py-1 flex flex-col items-center text-m-body press transition-colors"
      style={
        active
          ? { borderColor: activeColor, backgroundColor: "transparent", color: "var(--color-ink-950)" }
          : { borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-500)" }
      }
    >
      <span className="text-m-caption font-bold">{label}</span>
      {sublabel ? (
        <span
          className="text-m-caption font-normal truncate w-full text-center"
          style={active ? { color: "var(--color-ink-700)" } : { color: "var(--color-ink-400)" }}
        >
          {sublabel}
        </span>
      ) : null}
    </button>
  );
}

/* ── Underline input — label + underline text input ── */
export function UnderlineInput({
  label,
  value,
  onChange,
  placeholder,
  required,
  type = "text",
  inputMode,
  mono,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
  inputMode?: "text" | "decimal" | "numeric" | "tel" | "email";
  mono?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
        {label} {required ? <span style={{ color: "var(--color-stop)" }}>*</span> : null}
      </label>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={`w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors ${mono ? "font-mono" : ""}`}
        style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
      />
    </div>
  );
}

/* ── Enum select — fixed-option picker using the same bottom-sheet UI ──
 * Use this for small enum/fixed-option selectors (status, type, unit, mode,
 * GST slab, etc.). Uses the same SelectorModal bottom-sheet as entity
 * selectors so ALL dropdowns have the same UI pattern.
 *
 * For entity selectors with many options (customer, project, supplier,
 * material), use SelectorCard + SelectorModal or MobileSelectWithCreate
 * instead — those support search and create-new. */
export function EnumSelect({
  label,
  value,
  onChange,
  options,
  required,
  placeholder,
  inline,
  align = "left",
  onCreate,
  createLabel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  required?: boolean;
  placeholder?: string;
  /** Inline mode — label and value on the same line (e.g. "Type: ____").
   *  Tapping the value opens the bottom-sheet picker. */
  inline?: boolean;
  /** Text alignment of the inline value. */
  align?: "left" | "right";
  /** When provided, adds a "+ Create new" button to the picker. */
  onCreate?: () => void;
  /** Label for the create button. Defaults to "Create new". */
  createLabel?: string;
}) {
  const [open, setOpen] = useState(false);

  const selected = options.find((o) => o.value === value);
  const displayValue = selected?.label ?? placeholder ?? "Select…";

  // Build items for SelectorModal — include placeholder as "none" option
  const items = [
    ...(placeholder ? [{ id: "", label: placeholder, sub: undefined as string | undefined }] : []),
    ...options.map((o) => ({ id: o.value, label: o.label, sub: undefined as string | undefined })),
  ];

  // SelectorModal handles closing itself before calling onCreate, so
  // we just pass it through directly.
  if (inline) {
    return (
      <>
        <div
          className="flex items-center justify-between gap-1 pb-0.5 border-b focus-within:border-b-2 transition-colors cursor-pointer press"
          style={{ borderColor: "var(--color-line)" }}
          onClick={() => { haptic(10); setOpen(true); }}
        >
          {label ? (
            <span className="text-m-caption font-bold shrink-0" style={{ color: "var(--color-ink-700)" }}>
              {label}{required ? " *" : ""}
            </span>
          ) : null}
          <span
            className={`flex-1 min-w-0 h-7 leading-7 px-1 text-m-caption font-bold truncate ${align === "right" ? "text-right" : "text-left"}`}
            style={{ color: selected ? "var(--color-ink-950)" : "var(--color-ink-400)" }}
          >
            {displayValue}
          </span>
          <ChevronRight className="shrink-0 size-2.5" style={{ color: "var(--color-ink-500)" }} />
        </div>

        {open ? (
          <SelectorModal
            title={label}
            items={items}
            selectedId={value}
            onSelect={(id) => { onChange(id); setOpen(false); }}
            onClose={() => setOpen(false)}
            onCreate={onCreate}
            createLabel={createLabel}
          />
        ) : null}
      </>
    );
  }

  return (
    <>
      <SelectorCard
        onClick={() => { haptic(10); setOpen(true); }}
        label={label}
        placeholder={placeholder}
        value={selected?.label}
        required={required}
        stacked
      />

      {open ? (
        <SelectorModal
          title={label}
          items={items}
          selectedId={value}
          onSelect={(id) => { onChange(id); setOpen(false); }}
          onClose={() => setOpen(false)}
          onCreate={onCreate}
          createLabel={createLabel}
        />
      ) : null}
    </>
  );
}

/* ── Sticky action bar — bottom-pinned summary + submit ── */
export function StickyActionBar({
  summaryLabel,
  summaryValue,
  submitLabel,
  onSubmit,
  submitting,
  submitColor = "var(--color-ink-950)",
  disabled,
}: {
  summaryLabel: string;
  summaryValue: string;
  submitLabel: string;
  onSubmit: () => void;
  submitting?: boolean;
  submitColor?: string;
  disabled?: boolean;
}) {
  return (
    <div
      className="sticky bottom-0 left-0 right-0 z-20 border-t"
      style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }}
    >
      <div className="flex items-center justify-between gap-3 px-1 py-2">
        <div className="shrink-0 min-w-0">
          <p className="text-m-caption font-semibold uppercase tracking-wide truncate" style={{ color: "var(--color-ink-500)" }}>
            {summaryLabel}
          </p>
          <p className="text-m-section font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
            {summaryValue}
          </p>
        </div>
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting || disabled}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-m-section font-bold text-m-body press disabled:opacity-50 select-none"
          style={{ backgroundColor: submitColor, color: "var(--color-paper)" }}
        >
          {submitting ? (
            <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <span>{submitLabel}</span>
          )}
        </button>
      </div>
    </div>
  );
}

/* ── Selector modal — searchable bottom-sheet list picker ── */
export function SelectorModal({
  title,
  items,
  selectedId,
  onSelect,
  onClose,
  onCreate,
  createLabel,
}: {
  title: string;
  items: { id: string; label: string; sub?: string }[];
  selectedId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  onCreate?: () => void;
  createLabel?: string;
}) {
  const [query, setQuery] = useState("");
  // Portal to document.body so the sheet escapes any parent modal's
  // `transform` / `backdrop-filter` stacking context. Without this, a
  // SelectorModal opened inside a MobileFabModal gets caught in the
  // outer modal's `transform: scale(1)` (which creates a containing
  // block for fixed descendants) and `backdrop-filter: blur(8px)`,
  // causing "blur inside blur" + the sheet being clipped to the modal
  // panel instead of covering the full viewport.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      (item) => item.label.toLowerCase().includes(q) || (item.sub?.toLowerCase().includes(q) ?? false),
    );
  }, [items, query]);

  const sheet = (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center"
      style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 50%, transparent)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-[0.75rem] flex flex-col sheet-in"
        style={{ backgroundColor: "var(--color-paper)", maxHeight: "80vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b" style={{ borderColor: "var(--color-line)" }}>
          <p className="text-m-section font-bold" style={{ color: "var(--color-ink-950)" }}>{title}</p>
          <button onClick={onClose} className="text-m-body press">
            <X className="size-4" style={{ color: "var(--color-ink-500)" }} />
          </button>
        </div>

        {/* Search */}
        <div className="p-2 border-b" style={{ borderColor: "var(--color-line)" }}>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5" style={{ color: "var(--color-ink-500)" }} />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              autoFocus
              className="w-full h-7 pl-8 pr-2 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
              style={{ backgroundColor: "transparent" }}
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Search className="size-5 mb-1.5" style={{ color: "var(--color-ink-300)" }} />
              <p className="text-m-body font-semibold" style={{ color: "var(--color-ink-500)" }}>No results</p>
            </div>
          ) : (
            filtered.map((item, i) => {
              // The placeholder/none option (id="") is a "clear" action,
              // not a real selection — never show it as selected.
              const isPlaceholder = item.id === "";
              const isSelected = !isPlaceholder && item.id === selectedId;
              return (
                <button
                  key={item.id || i}
                  onClick={() => { haptic(10); onSelect(item.id); }}
                  className="w-full flex items-center gap-1 px-3 py-2.5 text-m-body press text-left"
                  style={{
                    backgroundColor: isSelected ? "color-mix(in srgb, var(--color-ink-950) 5%, transparent)" : "transparent",
                    borderBottom: "1px solid var(--color-line)",
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-m-section font-bold truncate"
                      style={{
                        color: isSelected
                          ? "var(--color-ink-950)"
                          : isPlaceholder
                            ? "var(--color-ink-500)"
                            : "var(--color-ink-900)",
                      }}
                    >
                      {item.label}
                    </p>
                    {item.sub ? (
                      <p className="text-m-caption truncate" style={{ color: "var(--color-ink-500)" }}>{item.sub}</p>
                    ) : null}
                  </div>
                  {isSelected ? <CheckCircle2 className="size-4 shrink-0" style={{ color: "var(--color-go)" }} /> : null}
                </button>
              );
            })
          )}
        </div>

        {/* Create new button */}
        {onCreate ? (
          <div className="border-t p-2" style={{ borderColor: "var(--color-line)" }}>
            <button
              type="button"
              onClick={() => {
                haptic(10);
                // Close the picker first so the create dialog (which is
                // z-50, below this z-[60] sheet) isn't hidden behind us.
                // The parent's onClose unmounts this portal; after a
                // short delay the create dialog opens cleanly on top.
                onClose();
                setTimeout(() => onCreate(), 150);
              }}
              className="flex w-full items-center justify-center gap-1.5 rounded-[0.5rem] border-2 border-dashed py-2.5 text-m-body font-bold text-m-body press"
              style={{ borderColor: "var(--color-signal)", color: "var(--color-signal-dark)" }}
            >
              <Plus className="size-3.5" />
              {createLabel ?? "Create new"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );

  // Render at document.body so the sheet is never caught inside a
  // parent modal's transform/backdrop-filter stacking context.
  return mounted ? createPortal(sheet, document.body) : null;
}
