"use client";

import { useState, useMemo, type ComponentType, type CSSProperties } from "react";
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
}: {
  onClick: () => void;
  icon?: ComponentType<{ className?: string; style?: CSSProperties }>;
  label: string;
  value?: string;
  subvalue?: string | null;
  placeholder?: string;
  required?: boolean;
  compact?: boolean;
}) {
  const hasValue = !!value;
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
            {label}
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
}: {
  onClick: () => void;
  icon?: ComponentType<{ className?: string; style?: CSSProperties }>;
  label: string;
  value?: string;
  subvalue?: string;
  required?: boolean;
  compact?: boolean;
}) {
  const hasValue = !!value;
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-1.5 press text-left border-b focus:border-b-2 transition-colors pb-0.5"
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
            {label}
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
  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      (item) => item.label.toLowerCase().includes(q) || (item.sub?.toLowerCase().includes(q) ?? false),
    );
  }, [items, query]);

  return (
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
              const isSelected = item.id === selectedId;
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
                    <p className="text-m-section font-bold truncate" style={{ color: isSelected ? "var(--color-ink-950)" : "var(--color-ink-900)" }}>
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
              onClick={() => { haptic(10); onCreate(); }}
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
}
