"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  ShieldCheck, CheckCircle2, Clock, AlertTriangle, XCircle,
  RefreshCw, Download, FileText, MapPin, Building2, ExternalLink,
  Filter, Search,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import {
  LEGAL_DOC_FLOW_MAP, STAGE_LABELS, STAGE_ORDER,
  daysUntilExpiry, getExpiryStatus,
} from "@/lib/legal-doc-flow";
import type { LegalDocStatus } from "@/components/legal/legal-docs-section";

export type PermissionRow = {
  id: string;
  landPurchaseId: string | null;
  projectId: string | null;
  type: string;
  title: string;
  authority: string | null;
  status: LegalDocStatus;
  appliesTo: "LAND" | "PROJECT" | "BOTH";
  docNumber: string | null;
  sortOrder: number;
  prerequisiteType: string | null;
  obtained: boolean;
  applicationDate: string | null;
  issueDate: string | null;
  validFrom: string | null;
  validTill: string | null;
  amount: number | null;
  expectedRegistryDate: string | null;
  documentUrl: string | null;
  documentName: string | null;
  notes: string | null;
  createdAt: string;
  projectName: string | null;
  landSellerName: string | null;
  landLocation: string | null;
};

const STATUS_CONFIG: Record<LegalDocStatus, { label: string; icon: typeof Clock; className: string }> = {
  NOT_REQUIRED: { label: "N/A", icon: XCircle, className: "bg-gray-100 text-gray-600" },
  PENDING: { label: "Pending", icon: Clock, className: "bg-amber-100 text-amber-700" },
  APPROVED: { label: "Approved", icon: CheckCircle2, className: "bg-green-100 text-green-700" },
  REJECTED: { label: "Rejected", icon: XCircle, className: "bg-red-100 text-red-700" },
  EXPIRED: { label: "Expired", icon: AlertTriangle, className: "bg-red-100 text-red-700" },
  RENEWAL_DUE: { label: "Renewal Due", icon: RefreshCw, className: "bg-orange-100 text-orange-700" },
};

/**
 * PermissionsView — the /permissions overview page.
 *
 * Shows ALL legal documents across every project and land parcel in the
 * company, with:
 *  - Summary stats (total, pending, expired/expiring, approved)
 *  - Filters by stage, status, context (land/project), and text search
 *  - A table grouped by stage with entity links, validity, and expiry alerts
 */
export function PermissionsView({ docs, canManage }: { docs: PermissionRow[]; canManage: boolean }) {
  const [stageFilter, setStageFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [contextFilter, setContextFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");

  // Summary stats
  const stats = useMemo(() => {
    const total = docs.length;
    const approved = docs.filter((d) => d.status === "APPROVED" && d.obtained).length;
    const pending = docs.filter((d) => d.status === "PENDING").length;
    const expiringOrExpired = docs.filter((d) => {
      const s = getExpiryStatus(d.validTill);
      return s === "expired" || s === "expiring";
    }).length;
    return { total, approved, pending, expiringOrExpired };
  }, [docs]);

  // Docs expiring within 30 days or already expired — for the alert banner
  const expiringDocs = useMemo(() => {
    return docs
      .filter((d) => {
        const s = getExpiryStatus(d.validTill);
        return s === "expired" || s === "expiring";
      })
      .sort((a, b) => {
        const aDays = daysUntilExpiry(a.validTill) ?? 9999;
        const bDays = daysUntilExpiry(b.validTill) ?? 9999;
        return aDays - bDays; // most urgent first
      });
  }, [docs]);

  // Filtered docs
  const filtered = useMemo(() => {
    return docs.filter((d) => {
      const step = LEGAL_DOC_FLOW_MAP[d.type];
      if (stageFilter !== "ALL" && step?.stage !== stageFilter) return false;
      if (statusFilter !== "ALL" && d.status !== statusFilter) return false;
      if (contextFilter !== "ALL") {
        if (contextFilter === "LAND" && d.appliesTo !== "LAND" && d.appliesTo !== "BOTH") return false;
        if (contextFilter === "PROJECT" && d.appliesTo !== "PROJECT" && d.appliesTo !== "BOTH") return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const haystack = [
          d.title, d.type, d.authority, d.docNumber, d.projectName, d.landSellerName, d.landLocation, d.notes,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [docs, stageFilter, statusFilter, contextFilter, search]);

  // Group filtered docs by stage
  const byStage = useMemo(() => {
    const m: Record<string, PermissionRow[]> = {};
    for (const d of filtered) {
      const step = LEGAL_DOC_FLOW_MAP[d.type];
      const stage = step?.stage ?? "OTHER";
      (m[stage] ??= []).push(d);
    }
    return m;
  }, [filtered]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Permissions & Legal"
        description="All permissions, licenses, NOCs, sanctions, and certificates across every project and land parcel — with validity tracking and expiry alerts."
        stats={[
          { label: "Total", value: stats.total, hint: "All legal documents across projects and land." },
          { label: "Approved", value: stats.approved, tone: "success", hint: "Permissions obtained and approved." },
          { label: "Pending", value: stats.pending, tone: "warning", hint: "Applied but awaiting approval." },
          { label: "Expiring/Expired", value: stats.expiringOrExpired, tone: stats.expiringOrExpired > 0 ? "danger" : "default", hint: "Validity expired or expiring within 30 days." },
        ]}
      />

      {/* Expiry alert banner — shows docs expiring within 30 days or already expired */}
      {expiringDocs.length > 0 && (
        <div className="rounded-lg border border-warning/30 bg-warning-soft/20 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <p className="text-body font-semibold text-foreground">
              {expiringDocs.length} document{expiringDocs.length !== 1 ? "s" : ""} expiring or expired
            </p>
          </div>
          <div className="space-y-1.5">
            {expiringDocs.slice(0, 5).map((d) => {
              const days = daysUntilExpiry(d.validTill);
              if (days === null) return null;
              const isExpired = days < 0;
              return (
                <div key={d.id} className="flex items-center justify-between text-caption">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={cn("font-medium", isExpired ? "text-danger" : "text-warning")}>
                      {d.title}
                    </span>
                    {d.projectName && <span className="text-muted-foreground">· {d.projectName}</span>}
                    {d.landSellerName && <span className="text-muted-foreground">· {d.landSellerName}</span>}
                  </div>
                  <span className={cn("shrink-0 font-medium", isExpired ? "text-danger" : "text-warning")}>
                    {isExpired ? `Expired ${Math.abs(days)}d ago` : `Expires in ${days}d`}
                  </span>
                </div>
              );
            })}
            {expiringDocs.length > 5 && (
              <p className="text-caption text-muted-foreground">+ {expiringDocs.length - 5} more — see list below</p>
            )}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, authority, ref no, project, land…"
            className="pl-8"
          />
        </div>
        <FilterSelect
          label="Stage"
          value={stageFilter}
          onChange={setStageFilter}
          options={[{ value: "ALL", label: "All Stages" }, ...STAGE_ORDER.map((s) => ({ value: s, label: STAGE_LABELS[s] }))]}
        />
        <FilterSelect
          label="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: "ALL", label: "All Status" },
            { value: "PENDING", label: "Pending" },
            { value: "APPROVED", label: "Approved" },
            { value: "EXPIRED", label: "Expired" },
            { value: "RENEWAL_DUE", label: "Renewal Due" },
            { value: "REJECTED", label: "Rejected" },
            { value: "NOT_REQUIRED", label: "N/A" },
          ]}
        />
        <FilterSelect
          label="Context"
          value={contextFilter}
          onChange={setContextFilter}
          options={[
            { value: "ALL", label: "Land + Project" },
            { value: "LAND", label: "Land" },
            { value: "PROJECT", label: "Project" },
          ]}
        />
      </div>

      {/* Results by stage */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <ShieldCheck className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <p className="mt-2 text-body font-medium text-foreground">No permissions found</p>
          <p className="text-caption text-muted-foreground">
            {docs.length === 0
              ? "Permissions, NOCs, and certificates will appear here once you add them to a project or land parcel."
              : "No documents match the current filters."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {STAGE_ORDER.map((stage) => {
            const stageDocs = byStage[stage];
            if (!stageDocs || stageDocs.length === 0) return null;
            const StageIcon = stage === "FEASIBILITY" ? MapPin : stage === "SANCTION" ? Building2 : ShieldCheck;
            return (
              <div key={stage} className="space-y-2">
                <div className="flex items-center gap-2 pb-1 border-b border-border">
                  <StageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  <h3 className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">
                    {STAGE_LABELS[stage]}
                  </h3>
                  <span className="text-caption text-faint">{stageDocs.length}</span>
                </div>
                <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-muted/30 text-left">
                        <th className="px-3 py-2 text-caption font-semibold text-muted-foreground">Permission</th>
                        <th className="px-3 py-2 text-caption font-semibold text-muted-foreground">Linked To</th>
                        <th className="px-3 py-2 text-caption font-semibold text-muted-foreground">Status</th>
                        <th className="px-3 py-2 text-caption font-semibold text-muted-foreground">Validity</th>
                        <th className="px-3 py-2 text-caption font-semibold text-muted-foreground text-right">Amount</th>
                        <th className="px-3 py-2 text-caption font-semibold text-muted-foreground">Doc</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {stageDocs.map((d) => (
                        <PermissionTableRow key={d.id} doc={d} canManage={canManage} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
          {/* Docs with unknown stage (custom/OTHER) */}
          {byStage.OTHER && byStage.OTHER.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 pb-1 border-b border-border">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <h3 className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">Other</h3>
                <span className="text-caption text-faint">{byStage.OTHER.length}</span>
              </div>
              <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
                <table className="w-full">
                  <tbody className="divide-y divide-border">
                    {byStage.OTHER.map((d) => (
                      <PermissionTableRow key={d.id} doc={d} canManage={canManage} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PermissionTableRow({ doc, canManage: _canManage }: { doc: PermissionRow; canManage: boolean }) {
  const step = LEGAL_DOC_FLOW_MAP[doc.type];
  const statusCfg = STATUS_CONFIG[doc.status];
  const expiryStatus = getExpiryStatus(doc.validTill);
  const expiryDays = daysUntilExpiry(doc.validTill);
  const StatusIcon = statusCfg.icon;

  return (
    <tr className="hover:bg-muted/20 transition-colors">
      <td className="px-3 py-2.5">
        <div className="flex items-start gap-2">
          <div className="min-w-0">
            <div className="text-body font-medium text-foreground">{doc.title}</div>
            <div className="text-caption text-muted-foreground">
              {step?.label ?? doc.type.replace(/_/g, " ")}
              {doc.authority && ` · ${doc.authority}`}
              {doc.docNumber && ` · ${doc.docNumber}`}
            </div>
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5">
        <EntityLink doc={doc} />
      </td>
      <td className="px-3 py-2.5">
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-medium", statusCfg.className)}>
          <StatusIcon className="h-2.5 w-2.5" />
          {statusCfg.label}
        </span>
      </td>
      <td className="px-3 py-2.5">
        {doc.validTill ? (
          <div>
            <div className="text-caption text-foreground tnum">{formatDate(doc.validTill)}</div>
            {expiryStatus === "expired" && (
              <div className="text-caption text-red-600 font-medium">Expired {Math.abs(expiryDays!)}d ago</div>
            )}
            {expiryStatus === "expiring" && (
              <div className="text-caption text-orange-600 font-medium">In {expiryDays}d</div>
            )}
          </div>
        ) : doc.issueDate ? (
          <div className="text-caption text-muted-foreground tnum">Issued {formatDate(doc.issueDate)}</div>
        ) : (
          <span className="text-caption text-faint">—</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-right">
        {doc.amount != null ? (
          <span className="text-body font-medium text-foreground tnum">{formatCurrency(doc.amount)}</span>
        ) : (
          <span className="text-caption text-faint">—</span>
        )}
      </td>
      <td className="px-3 py-2.5">
        {doc.documentUrl ? (
          <a href={doc.documentUrl} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1 text-caption text-brand hover:underline">
            <Download className="h-3 w-3" /> View
          </a>
        ) : (
          <span className="text-caption text-faint">—</span>
        )}
      </td>
    </tr>
  );
}

function EntityLink({ doc }: { doc: PermissionRow }) {
  if (doc.projectId && doc.projectName) {
    return (
      <Link href={`/projects/${doc.projectId}?tab=legal`} className="inline-flex items-center gap-1 text-caption text-brand hover:underline">
        <Building2 className="h-3 w-3" /> {doc.projectName}
      </Link>
    );
  }
  if (doc.landPurchaseId && doc.landSellerName) {
    return (
      <Link href={`/land/${doc.landPurchaseId}?tab=legal`} className="inline-flex items-center gap-1 text-caption text-brand hover:underline">
        <MapPin className="h-3 w-3" /> {doc.landSellerName}
        {doc.landLocation && <span className="text-muted-foreground"> · {doc.landLocation}</span>}
      </Link>
    );
  }
  return <span className="text-caption text-faint">—</span>;
}

function FilterSelect({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-md border border-border bg-card pl-3 pr-7 text-caption text-foreground transition-colors hover:border-border-strong focus:outline-none focus:ring-2 focus:ring-brand/20"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <Filter className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}
