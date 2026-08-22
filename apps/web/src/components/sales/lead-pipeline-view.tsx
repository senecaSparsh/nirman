"use client";

import { useMemo, useState } from "react";
import { ContactRound, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/empty-state";
import { StatusPill } from "@/components/page";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { LeadRow, LeadStage } from "@/lib/types";
import { LeadFormDialog } from "./lead-form-dialog";
import { LeadDetailDialog } from "./lead-detail-dialog";

const STAGES: { value: "ALL" | LeadStage; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "NEW", label: "New" },
  { value: "CONTACTED", label: "Contacted" },
  { value: "SITE_VISIT", label: "Site visit" },
  { value: "NEGOTIATION", label: "Negotiation" },
  { value: "BOOKED", label: "Booked" },
  { value: "LOST", label: "Lost" },
];

export function LeadPipelineView({
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
  const [stage, setStage] = useState<"ALL" | LeadStage>("ALL");
  const [formOpen, setFormOpen] = useState(false);
  const [selected, setSelected] = useState<LeadRow | null>(null);

  const filtered = useMemo(
    () => stage === "ALL" ? leads : leads.filter((lead) => lead.stage === stage),
    [leads, stage],
  );
  const counts = useMemo(
    () => Object.fromEntries(STAGES.map((item) => [item.value, item.value === "ALL" ? leads.length : leads.filter((lead) => lead.stage === item.value).length])),
    [leads],
  );

  const columns: Column<LeadRow>[] = [
    {
      key: "name",
      label: "Lead",
      sortable: true,
      render: (lead) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{lead.name}</p>
          <p className="truncate text-caption text-muted-foreground">{lead.phone}{lead.email ? ` · ${lead.email}` : ""}</p>
        </div>
      ),
    },
    {
      key: "stage",
      label: "Stage",
      sortable: true,
      render: (lead) => <StatusPill status={lead.stage} />,
    },
    {
      key: "score",
      label: "Score",
      sortable: true,
      align: "right",
      render: (lead) => <span className={`tnum font-semibold ${lead.score >= 70 ? "text-success" : lead.score >= 45 ? "text-warning" : "text-muted-foreground"}`}>{lead.score}</span>,
    },
    {
      key: "interest",
      label: "Interest",
      sortable: true,
      sortValue: (lead) => lead.projectName ?? lead.interestedUnitType ?? "",
      render: (lead) => (
        <div className="min-w-0">
          <p className="truncate text-foreground">{lead.interestedUnitLabel ?? lead.interestedUnitType ?? "Not decided"}</p>
          <p className="truncate text-caption text-muted-foreground">{lead.projectName ?? "Any project"}</p>
        </div>
      ),
    },
    {
      key: "budgetMax",
      label: "Budget",
      sortable: true,
      align: "right",
      render: (lead) => <span className="tnum text-muted-foreground">{lead.budgetMax == null ? "—" : formatCurrency(lead.budgetMax)}</span>,
    },
    {
      key: "assignedToName",
      label: "Owner",
      sortable: true,
      render: (lead) => <span className="text-muted-foreground">{lead.assignedToName ?? "Unassigned"}</span>,
    },
    {
      key: "nextFollowUpAt",
      label: "Next follow-up",
      sortable: true,
      sortValue: (lead) => lead.nextFollowUpAt ? new Date(lead.nextFollowUpAt) : new Date(8640000000000000),
      render: (lead) => {
        if (!lead.nextFollowUpAt) return <span className="text-muted-foreground/50">Not scheduled</span>;
        const overdue = new Date(lead.nextFollowUpAt).getTime() < Date.now() && !["BOOKED", "LOST"].includes(lead.stage);
        return <span className={overdue ? "font-medium text-danger" : "text-muted-foreground"}>{formatDate(lead.nextFollowUpAt)}</span>;
      },
    },
    {
      key: "source",
      label: "Source",
      sortable: true,
      render: (lead) => <span className="text-caption text-muted-foreground">{lead.source.replaceAll("_", " ")}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      {leads.length === 0 ? (
        <EmptyState
          icon={<ContactRound className="size-5" />}
          title="No leads in the pipeline"
          description="Capture an enquiry here, then keep calls, site visits and follow-ups attached until it becomes a booking."
          action={canManage ? <Button size="sm" onClick={() => setFormOpen(true)}><Plus className="size-4" /> Add lead</Button> : undefined}
        />
      ) : (
        <>
          <div className="flex gap-1 overflow-x-auto border-b border-border pb-px">
            {STAGES.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setStage(item.value)}
                className={`flex h-9 shrink-0 items-center gap-2 border-b-2 px-3 text-body font-medium transition-colors ${stage === item.value ? "border-brand text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                {item.label}
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-micro tnum">{counts[item.value]}</span>
              </button>
            ))}
          </div>
          <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
            <DataTable
              data={filtered}
              columns={columns}
              storageKey="sales-leads"
              searchable
              searchPlaceholder="Search lead, phone, project, source…"
              initialSort={{ key: "nextFollowUpAt", direction: "asc" }}
              hideable
              pageSize={50}
              onRowClick={setSelected}
              onAddRow={canManage ? () => setFormOpen(true) : undefined}
              addRowLabel="New Lead"
              rowTone={(lead) => {
                if (lead.nextFollowUpAt && new Date(lead.nextFollowUpAt).getTime() < Date.now() && !["BOOKED", "LOST"].includes(lead.stage)) return "danger";
                if (lead.priority === "HOT") return "warning";
                if (lead.stage === "BOOKED") return "success";
                return null;
              }}
            />
          </div>
        </>
      )}

      <LeadFormDialog open={formOpen} onOpenChange={setFormOpen} projects={projects} units={units} assignees={assignees} />
      <LeadDetailDialog lead={selected} open={selected != null} onOpenChange={(value) => !value && setSelected(null)} canManage={canManage} />
    </div>
  );
}
