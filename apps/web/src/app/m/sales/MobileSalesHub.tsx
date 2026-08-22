"use client";

import { useMemo, useState } from "react";
import { CalendarClock, ContactRound, Flame, Phone, Plus, Search, UserRoundCheck } from "lucide-react";
import { MobileExportShareBar, type MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";
import { formatCurrency, formatDate } from "@/lib/utils";
import { LeadFormDialog } from "@/components/sales/lead-form-dialog";
import { LeadDetailDialog } from "@/components/sales/lead-detail-dialog";
import type { LeadRow, LeadStage } from "@/lib/types";
import { MobileSalesCollection, type CollectionStats, type SaleItem } from "./MobileSalesCollection";

const STAGES: { value: "OPEN" | LeadStage; label: string }[] = [
  { value: "OPEN", label: "Open" },
  { value: "NEW", label: "New" },
  { value: "CONTACTED", label: "Contacted" },
  { value: "SITE_VISIT", label: "Visits" },
  { value: "NEGOTIATION", label: "Negotiating" },
  { value: "BOOKED", label: "Booked" },
  { value: "LOST", label: "Lost" },
];

export function MobileSalesHub({
  leads,
  sales,
  stats,
  projects,
  units,
  assignees,
  canManage,
}: {
  leads: LeadRow[];
  sales: SaleItem[];
  stats: CollectionStats;
  projects: { id: string; name: string }[];
  units: { id: string; projectId: string; projectName: string; label: string }[];
  assignees: { id: string; name: string }[];
  canManage: boolean;
}) {
  const [view, setView] = useState<"pipeline" | "collections">("pipeline");
  const csvColumns: MobileColumnSpec[] = [
    { key: "saleNumber", label: "Sale #" },
    { key: "customerName", label: "Customer" },
    { key: "assetLabel", label: "Asset" },
    { key: "salePrice", label: "Sale Price", format: "currency" },
    { key: "totalPaid", label: "Collected", format: "currency" },
    { key: "balance", label: "Balance", format: "currency" },
    { key: "paymentStatus", label: "Status" },
    { key: "saleDate", label: "Sale Date", format: "date" },
  ];

  return (
    <div className="pb-6">
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-[0.625rem] p-1" style={{ backgroundColor: "var(--color-concrete)" }}>
        <button
          type="button"
          onClick={() => setView("pipeline")}
          className="h-9 rounded-[0.5rem] text-[0.6875rem] font-bold press"
          style={{ backgroundColor: view === "pipeline" ? "var(--color-paper)" : "transparent", color: view === "pipeline" ? "var(--color-ink-950)" : "var(--color-ink-500)" }}
        >
          Pipeline · {leads.filter((lead) => !["BOOKED", "LOST"].includes(lead.stage)).length}
        </button>
        <button
          type="button"
          onClick={() => setView("collections")}
          className="h-9 rounded-[0.5rem] text-[0.6875rem] font-bold press"
          style={{ backgroundColor: view === "collections" ? "var(--color-paper)" : "transparent", color: view === "collections" ? "var(--color-ink-950)" : "var(--color-ink-500)" }}
        >
          Collections · {stats.outstandingCount}
        </button>
      </div>

      {view === "pipeline" ? (
        <MobileLeadPipeline leads={leads} projects={projects} units={units} assignees={assignees} canManage={canManage} />
      ) : (
        <>
          <div className="mb-3">
            <MobileExportShareBar
              title="Sales"
              rows={sales as unknown as Record<string, unknown>[]}
              columns={csvColumns}
              summary={`${sales.length} sales · ${formatCurrency(stats.totalValue)} total · ${formatCurrency(stats.totalOutstanding)} outstanding`}
            />
          </div>
          <MobileSalesCollection items={sales} stats={stats} />
        </>
      )}
    </div>
  );
}

function MobileLeadPipeline({
  leads,
  projects,
  units,
  assignees,
  canManage,
}: {
  leads: LeadRow[];
  projects: { id: string; name: string }[];
  units: { id: string; projectId: string; projectName: string; label: string }[];
  assignees: { id: string; name: string }[];
  canManage: boolean;
}) {
  const [stage, setStage] = useState<"OPEN" | LeadStage>("OPEN");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<LeadRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [now] = useState(() => Date.now());

  const filtered = useMemo(() => {
    const openStages: LeadStage[] = ["NEW", "CONTACTED", "SITE_VISIT", "NEGOTIATION"];
    return leads
      .filter((lead) => stage === "OPEN" ? openStages.includes(lead.stage) : lead.stage === stage)
      .filter((lead) => {
        const term = query.trim().toLowerCase();
        return !term || [lead.name, lead.phone, lead.projectName, lead.interestedUnitLabel, lead.source].some((value) => value?.toLowerCase().includes(term));
      })
      .sort((a, b) => {
        const aDue = a.nextFollowUpAt ? new Date(a.nextFollowUpAt).getTime() : Number.MAX_SAFE_INTEGER;
        const bDue = b.nextFollowUpAt ? new Date(b.nextFollowUpAt).getTime() : Number.MAX_SAFE_INTEGER;
        return aDue - bDue || b.score - a.score;
      });
  }, [leads, query, stage]);

  const openLeads = leads.filter((lead) => !["BOOKED", "LOST"].includes(lead.stage));
  const dueCount = openLeads.filter((lead) => lead.nextFollowUpAt && new Date(lead.nextFollowUpAt).getTime() < now).length;
  const hotCount = openLeads.filter((lead) => lead.priority === "HOT" || lead.score >= 70).length;
  const bookedCount = leads.filter((lead) => lead.stage === "BOOKED").length;

  return (
    <>
      <div className="mb-3 grid grid-cols-3 gap-2">
        <div className="rounded-[0.625rem] border p-2.5" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
          <CalendarClock className="mb-1 size-3.5" style={{ color: dueCount ? "var(--color-stop)" : "var(--color-ink-300)" }} />
          <p className="text-[0.9375rem] font-bold tabular-nums" style={{ color: dueCount ? "var(--color-stop)" : "var(--color-ink-950)" }}>{dueCount}</p>
          <p className="text-[0.5rem]" style={{ color: "var(--color-ink-500)" }}>Follow-ups due</p>
        </div>
        <div className="rounded-[0.625rem] border p-2.5" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
          <Flame className="mb-1 size-3.5" style={{ color: "var(--color-signal-dark)" }} />
          <p className="text-[0.9375rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>{hotCount}</p>
          <p className="text-[0.5rem]" style={{ color: "var(--color-ink-500)" }}>Hot leads</p>
        </div>
        <div className="rounded-[0.625rem] border p-2.5" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
          <UserRoundCheck className="mb-1 size-3.5" style={{ color: "var(--color-go)" }} />
          <p className="text-[0.9375rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>{bookedCount}</p>
          <p className="text-[0.5rem]" style={{ color: "var(--color-ink-500)" }}>Converted</p>
        </div>
      </div>

      {canManage && (
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="mb-3 flex h-10 w-full items-center justify-center gap-1.5 rounded-[0.5rem] text-[0.6875rem] font-bold press"
          style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
        >
          <Plus className="size-3.5" /> Add lead
        </button>
      )}

      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
        {STAGES.map((item) => {
          const count = item.value === "OPEN" ? openLeads.length : leads.filter((lead) => lead.stage === item.value).length;
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => setStage(item.value)}
              className="flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-[0.5rem] font-bold press"
              style={{ backgroundColor: stage === item.value ? "var(--color-ink-950)" : "var(--color-concrete)", color: stage === item.value ? "var(--color-paper)" : "var(--color-ink-600)" }}
            >
              {item.label}<span className="tabular-nums opacity-60">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="relative mb-3">
        <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2" style={{ color: "var(--color-ink-300)" }} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search lead, phone, project…"
          className="h-10 w-full rounded-[0.5rem] border pl-8 pr-3 text-[0.6875rem] outline-none"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
        />
      </div>

      <div className="flex flex-col gap-2">
        {filtered.map((lead) => {
          const overdue = Boolean(lead.nextFollowUpAt && new Date(lead.nextFollowUpAt).getTime() < now && !["BOOKED", "LOST"].includes(lead.stage));
          return (
            <button
              key={lead.id}
              type="button"
              onClick={() => setSelected(lead)}
              className="w-full rounded-[0.625rem] border p-3 text-left press"
              style={{ borderColor: overdue ? "var(--color-stop)" : lead.priority === "HOT" ? "var(--color-signal)" : "var(--color-line)", backgroundColor: "var(--color-paper)" }}
            >
              <div className="mb-1.5 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[0.75rem] font-bold" style={{ color: "var(--color-ink-950)" }}>{lead.name}</p>
                  <p className="mt-0.5 truncate text-[0.5rem]" style={{ color: "var(--color-ink-500)" }}>{lead.projectName ?? "Any project"} · {lead.interestedUnitLabel ?? lead.interestedUnitType ?? "Unit not selected"}</p>
                </div>
                <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[0.4375rem] font-bold uppercase" style={{ backgroundColor: lead.stage === "BOOKED" ? "var(--color-go-wash)" : "var(--color-concrete)", color: lead.stage === "BOOKED" ? "var(--color-go)" : "var(--color-ink-600)" }}>{lead.stage.replaceAll("_", " ")}</span>
              </div>
              <div className="flex items-end justify-between gap-2">
                <div>
                  <p className="text-[0.4375rem] uppercase" style={{ color: "var(--color-ink-500)" }}>Score</p>
                  <p className="text-[0.75rem] font-bold tabular-nums" style={{ color: lead.score >= 70 ? "var(--color-go)" : "var(--color-ink-950)" }}>{lead.score}/100</p>
                </div>
                <div className="text-right">
                  <p className="text-[0.5rem] font-semibold" style={{ color: overdue ? "var(--color-stop)" : "var(--color-ink-600)" }}>{lead.nextFollowUpAt ? `${overdue ? "Overdue · " : "Follow up · "}${formatDate(lead.nextFollowUpAt)}` : "No follow-up"}</p>
                  <p className="mt-0.5 text-[0.4375rem]" style={{ color: "var(--color-ink-400)" }}>{lead.assignedToName ?? "Unassigned"} · {lead.source.replaceAll("_", " ")}</p>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between border-t pt-2" style={{ borderColor: "var(--color-line)" }}>
                <span className="text-[0.5rem]" style={{ color: "var(--color-ink-500)" }}>{lead.latestActivity?.outcome ?? `${lead.activityCount} activities`}</span>
                <a href={`tel:${lead.phone}`} onClick={(event) => event.stopPropagation()} className="flex items-center gap-1 text-[0.5rem] font-bold" style={{ color: "var(--color-steel)" }}><Phone className="size-3" /> Call</a>
              </div>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="flex flex-col items-center rounded-[0.625rem] border px-4 py-10 text-center" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
          <ContactRound className="mb-2 size-6" style={{ color: "var(--color-ink-300)" }} />
          <p className="text-[0.75rem] font-bold" style={{ color: "var(--color-ink-950)" }}>{leads.length ? "No leads match this view" : "No leads yet"}</p>
          <p className="mt-1 text-[0.5rem]" style={{ color: "var(--color-ink-500)" }}>Add the enquiry once, then keep every follow-up and site visit attached.</p>
        </div>
      )}

      <LeadFormDialog open={formOpen} onOpenChange={setFormOpen} projects={projects} units={units} assignees={assignees} />
      <LeadDetailDialog lead={selected} open={selected != null} onOpenChange={(value) => !value && setSelected(null)} canManage={canManage} bookingHref="/m/sales/new" />
    </>
  );
}
