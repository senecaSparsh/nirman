"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Building2, Package, Plus, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  MobileSearchHeader,
  MobileCardGrid,
  MobileFab,
  MobileNoResults,
  MobileSummaryStrip,
  type SummaryStat,
} from "@/components/mobile/v2/scaffold";
import { MobileExportShareIcons, type MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";
import { MobileEmptyState } from "@/components/mobile/v2/primitives";

export type DepartmentListItem = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  active: boolean;
  stockLocationName: string | null;
  issueCount: number;
};

type StatusFilter = "ALL" | "ACTIVE" | "INACTIVE";

const FILTER_OPTIONS: { label: string; value: StatusFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "Active", value: "ACTIVE" },
  { label: "Inactive", value: "INACTIVE" },
];

/**
 * Departments list — operational cost centers in a card grid.
 * Shows code, name, stock room link, and issue count.
 */
export function MobileDepartmentsList({
  items,
  activeCount,
  withStockRoom,
  canManage,
  exportTitle,
  exportRows,
  exportColumns,
  exportSummary,
}: {
  items: DepartmentListItem[];
  activeCount: number;
  withStockRoom: number;
  canManage?: boolean;
  exportTitle?: string;
  exportRows?: Record<string, unknown>[];
  exportColumns?: MobileColumnSpec[];
  exportSummary?: string;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [formOpen, setFormOpen] = useState(false);

  const filtered = useMemo(() => {
    let result = items;
    if (statusFilter !== "ALL") {
      result = result.filter((d) => (statusFilter === "ACTIVE" ? d.active : !d.active));
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (d) =>
          d.code.toLowerCase().includes(q) ||
          d.name.toLowerCase().includes(q) ||
          (d.description?.toLowerCase().includes(q) ?? false),
      );
    }
    return result;
  }, [items, query, statusFilter]);

  const summaryStats: SummaryStat[] = [
    { label: "Departments", value: String(items.length) },
    { label: "Active", value: String(activeCount) },
    { label: "Stock Rooms", value: String(withStockRoom) },
  ];

  if (items.length === 0) {
    return (
      <MobileEmptyState
        icon={Building2}
        title="No departments yet"
        hint="Create departments to organize your team"
        action={
          canManage ? (
            <Link
              href="/departments"
              className="inline-flex items-center gap-1.5 rounded-[0.5rem] px-4 py-2.5 text-m-body font-bold press"
              style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
            >
              <Plus className="size-3.5" /> Add Department
            </Link>
          ) : undefined
        }
      />
    );
  }

  return (
    <div>
      <MobileSummaryStrip stats={summaryStats} />

      <MobileSearchHeader
        query={query}
        onQueryChange={setQuery}
        placeholder="Search code, name, description…"
        action={
          <div className="flex items-center gap-1 shrink-0">
            {exportTitle && exportRows && exportColumns ? (
              <MobileExportShareIcons
                title={exportTitle}
                rows={exportRows}
                columns={exportColumns}
                summary={exportSummary}
              />
            ) : null}
          </div>
        }
        filterChips={
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setStatusFilter(opt.value)}
                className="px-2.5 py-1 text-m-body rounded-full border whitespace-nowrap transition-colors press"
                style={{
                  borderColor: statusFilter === opt.value ? "var(--color-steel)" : "var(--color-line)",
                  backgroundColor: statusFilter === opt.value ? "var(--color-paper-2)" : "transparent",
                  color: statusFilter === opt.value ? "var(--color-ink-950)" : "var(--color-ink-500)",
                  fontWeight: statusFilter === opt.value ? 600 : 400,
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        }
        showClear={statusFilter !== "ALL" || !!query}
        onClear={() => { setQuery(""); setStatusFilter("ALL"); }}
      />

      {filtered.length === 0 ? (
        <MobileNoResults
          title={query || statusFilter !== "ALL" ? "No matching departments" : "No departments"}
          hint={query || statusFilter !== "ALL"
            ? "Try a different search or filter"
            : canManage
              ? "Tap + to add your first department"
              : "Departments will appear here once added"}
        />
      ) : (
        <MobileCardGrid cols={2}>
          {filtered.map((d) => (
            <DepartmentCard key={d.id} d={d} />
          ))}
        </MobileCardGrid>
      )}

      {canManage ? (
        <MobileFab onClick={() => setFormOpen(true)} label="Add department" />
      ) : null}

      {formOpen ? (
        <DepartmentFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
        />
      ) : null}
    </div>
  );
}

/* ─── Department card ─── */
function DepartmentCard({ d }: { d: DepartmentListItem }) {
  const hasIssues = d.issueCount > 0;
  const accentColor = d.active ? "var(--color-go)" : "var(--color-ink-300)";

  return (
    <div
      className="flex flex-col rounded-[0.625rem] border text-m-body overflow-hidden"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      <div className="h-0.5 w-full" style={{ backgroundColor: accentColor }} />

      <div className="p-2 flex flex-col gap-1 flex-1">
        <div className="flex items-center justify-between gap-1">
          <p className="text-m-label font-bold leading-tight truncate" style={{ color: "var(--color-ink-950)" }}>
            {d.name}
          </p>
          <span
            className="text-m-caption font-bold uppercase shrink-0 font-mono"
            style={{ color: "var(--color-steel)" }}
          >
            {d.code}
          </span>
        </div>

        {d.description && (
          <p className="text-m-caption leading-tight line-clamp-2" style={{ color: "var(--color-ink-500)" }}>
            {d.description}
          </p>
        )}

        <div className="mt-auto pt-1 flex items-center gap-1.5">
          {d.stockLocationName ? (
            <span className="text-m-caption flex items-center gap-0.5 truncate" style={{ color: "var(--color-ink-700)" }}>
              <Package className="size-2 shrink-0" />
              {d.stockLocationName}
            </span>
          ) : (
            <span className="text-m-caption" style={{ color: "var(--color-ink-400)" }}>
              No stock room
            </span>
          )}
        </div>

        <div className="flex items-center justify-between">
          <span
            className="text-m-caption font-semibold px-1.5 py-0.5 rounded-[0.25rem]"
            style={{
              backgroundColor: d.active ? "var(--color-go-faint, color-mix(in srgb, var(--color-go) 10%, transparent))" : "var(--color-paper-2)",
              color: d.active ? "var(--color-go)" : "var(--color-ink-500)",
            }}
          >
            {d.active ? "Active" : "Inactive"}
          </span>
          {hasIssues && (
            <span className="text-m-caption font-bold tabular-nums" style={{ color: "var(--color-steel)" }}>
              {d.issueCount} issue{d.issueCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Add department form dialog (bottom sheet) ─── */
function DepartmentFormDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || !name.trim()) {
      toast.error("Code and name are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          name: name.trim(),
          description: description.trim() || null,
          active,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to create department");
      }
      toast.success("Department created");
      onOpenChange(false);
      window.location.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create department");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 50%, transparent)" }}
      onClick={() => onOpenChange(false)}
    >
      <div
        className="mt-auto rounded-t-[0.75rem] max-h-[85vh] overflow-y-auto"
        style={{ backgroundColor: "var(--color-paper)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-3 border-b sticky top-0" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
          <div className="flex items-center gap-2">
            <Building2 className="size-4" style={{ color: "var(--color-steel)" }} />
            <p className="text-m-section font-bold" style={{ color: "var(--color-ink-950)" }}>Add Department</p>
          </div>
          <button onClick={() => onOpenChange(false)} className="text-m-body press p-1">
            <X className="size-4" style={{ color: "var(--color-ink-500)" }} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-3 space-y-3">
          <div>
            <label className="text-m-caption font-semibold block mb-1" style={{ color: "var(--color-ink-700)" }}>
              Code *
            </label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="BOILER, MP-2, WORKSHOP…"
              className="w-full h-10 rounded-[0.5rem] border px-3 text-m-section font-mono outline-none"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-950)" }}
              required
            />
          </div>

          <div>
            <label className="text-m-caption font-semibold block mb-1" style={{ color: "var(--color-ink-700)" }}>
              Name *
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Boiler House"
              className="w-full h-10 rounded-[0.5rem] border px-3 text-m-section outline-none"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-950)" }}
              required
            />
          </div>

          <div>
            <label className="text-m-caption font-semibold block mb-1" style={{ color: "var(--color-ink-700)" }}>
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What this department does…"
              className="w-full rounded-[0.5rem] border px-3 py-2 text-m-section outline-none resize-none"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-950)" }}
            />
          </div>

          <label className="flex items-center gap-2 text-m-section" style={{ color: "var(--color-ink-950)" }}>
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="rounded"
            />
            Active department
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="px-4 h-10 rounded-[0.5rem] text-m-section font-medium press"
              style={{ color: "var(--color-ink-500)" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 h-10 rounded-[0.5rem] text-m-section font-bold flex items-center gap-1.5 press"
              style={{ backgroundColor: "var(--color-steel)", color: "white" }}
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              {saving ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
