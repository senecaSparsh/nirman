"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  FileText, CheckCircle2, Clock, AlertTriangle, XCircle, RefreshCw,
  ChevronRight, MapPin, Building2, ExternalLink, Search, Filter,
} from "lucide-react";
import {
  MobileStatusBadge,
  Badge,
} from "@/components/mobile/v2/primitives";
import { formatDate, cn } from "@/lib/utils";
import {
  STAGE_LABELS, STAGE_ORDER, daysUntilExpiry, getExpiryStatus,
} from "@/lib/legal-doc-flow";
import type { LegalDocStatus, LegalDocType } from "@/components/legal/legal-docs-section";

export type MobilePermissionRow = {
  id: string;
  landPurchaseId: string | null;
  projectId: string | null;
  type: LegalDocType;
  title: string;
  authority: string | null;
  status: LegalDocStatus;
  appliesTo: "LAND" | "PROJECT" | "BOTH";
  docNumber: string | null;
  obtained: boolean;
  issueDate: string | null;
  validTill: string | null;
  documentUrl: string | null;
  notes: string | null;
  projectName: string | null;
  landSellerName: string | null;
  landLocation: string | null;
};

const STATUS_CONFIG: Record<LegalDocStatus, { label: string; tone: "neutral" | "signal" | "go" | "stop" }> = {
  NOT_REQUIRED: { label: "N/A", tone: "neutral" },
  PENDING: { label: "Pending", tone: "signal" },
  APPROVED: { label: "Approved", tone: "go" },
  REJECTED: { label: "Rejected", tone: "stop" },
  EXPIRED: { label: "Expired", tone: "stop" },
  RENEWAL_DUE: { label: "Renewal Due", tone: "signal" },
};

/**
 * MobilePermissionsList — filterable list of legal documents.
 * Mobile-optimized card layout with status, expiry, and entity links.
 */
export function MobilePermissionsList({
  docs,
  canManage,
}: {
  docs: MobilePermissionRow[];
  canManage: boolean;
}) {
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [contextFilter, setContextFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    return docs.filter((d) => {
      if (statusFilter !== "ALL" && d.status !== statusFilter) return false;
      if (contextFilter === "LAND" && !d.landPurchaseId) return false;
      if (contextFilter === "PROJECT" && !d.projectId) return false;
      if (search) {
        const q = search.toLowerCase();
        const matches =
          d.title.toLowerCase().includes(q) ||
          (d.docNumber ?? "").toLowerCase().includes(q) ||
          (d.authority ?? "").toLowerCase().includes(q) ||
          (d.projectName ?? "").toLowerCase().includes(q) ||
          (d.landSellerName ?? "").toLowerCase().includes(q) ||
          (d.landLocation ?? "").toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [docs, statusFilter, contextFilter, search]);

  // Group by stage for display
  const grouped = useMemo(() => {
    const groups: Record<string, MobilePermissionRow[]> = {};
    for (const d of filtered) {
      const stage = getStageForType(d.type);
      if (!groups[stage]) groups[stage] = [];
      groups[stage].push(d);
    }
    return groups;
  }, [filtered]);

  const inputClass = "w-full h-9 rounded-[0.5rem] border px-3 text-[0.75rem] outline-none";
  const inputStyle = {
    borderColor: "var(--color-line)",
    backgroundColor: "var(--color-paper)",
    color: "var(--color-ink-950)",
  };

  return (
    <div>
      {/* ── Search + Filters ── */}
      <div className="space-y-2 mb-3">
        <div className="relative">
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5"
            style={{ color: "var(--color-ink-300)" }}
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, doc no, authority, project…"
            className={cn(inputClass, "pl-8")}
            style={inputStyle}
          />
        </div>

        {/* Status filter chips */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
          <FilterChip
            label="All"
            active={statusFilter === "ALL"}
            onClick={() => setStatusFilter("ALL")}
          />
          <FilterChip
            label="Pending"
            active={statusFilter === "PENDING"}
            onClick={() => setStatusFilter("PENDING")}
          />
          <FilterChip
            label="Approved"
            active={statusFilter === "APPROVED"}
            onClick={() => setStatusFilter("APPROVED")}
          />
          <FilterChip
            label="Expired"
            active={statusFilter === "EXPIRED"}
            onClick={() => setStatusFilter("EXPIRED")}
          />
          <FilterChip
            label="Renewal"
            active={statusFilter === "RENEWAL_DUE"}
            onClick={() => setStatusFilter("RENEWAL_DUE")}
          />
        </div>

        {/* Context filter chips */}
        <div className="flex gap-1.5">
          <FilterChip
            label="All"
            active={contextFilter === "ALL"}
            onClick={() => setContextFilter("ALL")}
          />
          <FilterChip
            label="Land"
            active={contextFilter === "LAND"}
            onClick={() => setContextFilter("LAND")}
          />
          <FilterChip
            label="Project"
            active={contextFilter === "PROJECT"}
            onClick={() => setContextFilter("PROJECT")}
          />
        </div>
      </div>

      {/* ── Grouped list ── */}
      {filtered.length === 0 ? (
        <p className="text-center text-[0.6875rem] py-6" style={{ color: "var(--color-ink-500)" }}>
          No documents match your filters
        </p>
      ) : (
        <div className="space-y-4">
          {STAGE_ORDER.map((stage) => {
            const stageDocs = grouped[stage];
            if (!stageDocs || stageDocs.length === 0) return null;
            return (
              <div key={stage}>
                <p
                  className="text-[0.5625rem] font-bold uppercase tracking-wide mb-2"
                  style={{ color: "var(--color-ink-500)" }}
                >
                  {STAGE_LABELS[stage]} ({stageDocs.length})
                </p>
                <div className="flex flex-col gap-1.5">
                  {stageDocs.map((doc) => (
                    <PermissionCard key={doc.id} doc={doc} canManage={canManage} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Single permission card ──────────────────────────────────────────────────

function PermissionCard({ doc, canManage }: { doc: MobilePermissionRow; canManage: boolean }) {
  const statusConfig = STATUS_CONFIG[doc.status];
  const expiryStatus = getExpiryStatus(doc.validTill);
  const days = daysUntilExpiry(doc.validTill);
  const entityHref = doc.projectId
    ? `/m/projects/${doc.projectId}`
    : doc.landPurchaseId
      ? `/m/land/${doc.landPurchaseId}`
      : null;
  const entityName = doc.projectName ?? doc.landSellerName ?? null;

  return (
    <div
      className="rounded-[0.5rem] border p-2.5"
      style={{
        backgroundColor: "var(--color-paper)",
        borderColor: "var(--color-line)",
      }}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {/* Title + status badge */}
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[0.4375rem] font-bold uppercase shrink-0" style={{ color: "var(--color-ink-300)" }}>
              {doc.type.replace(/_/g, " ")}
            </span>
          </div>
          <p
            className="text-[0.75rem] font-semibold leading-tight mb-1"
            style={{ color: "var(--color-ink-950)" }}
          >
            {doc.title}
          </p>

          {/* Entity link */}
          {entityName && (
            <Link
              href={entityHref ?? "#"}
              className="inline-flex items-center gap-1 text-[0.5625rem] font-medium mb-1"
              style={{ color: "var(--color-steel)" }}
            >
              {doc.projectId ? <Building2 className="size-3" /> : <MapPin className="size-3" />}
              {entityName}
              {doc.landLocation ? ` — ${doc.landLocation}` : ""}
              <ChevronRight className="size-2.5" />
            </Link>
          )}

          {/* Doc number + authority */}
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
            {doc.docNumber && (
              <span className="text-[0.5625rem]" style={{ color: "var(--color-ink-500)" }}>
                Doc#: <span className="font-semibold" style={{ color: "var(--color-ink-950)" }}>{doc.docNumber}</span>
              </span>
            )}
            {doc.authority && (
              <span className="text-[0.5625rem]" style={{ color: "var(--color-ink-500)" }}>
                Auth: <span className="font-semibold" style={{ color: "var(--color-ink-700)" }}>{doc.authority}</span>
              </span>
            )}
          </div>

          {/* Validity + expiry alert */}
          {doc.validTill && (
            <div className="mt-1.5">
              <span className="text-[0.5625rem]" style={{ color: "var(--color-ink-500)" }}>
                Valid till: <span className="font-semibold" style={{ color: "var(--color-ink-950)" }}>{formatDate(doc.validTill)}</span>
              </span>
              {expiryStatus === "expired" && (
                <span className="ml-2 text-[0.5625rem] font-bold" style={{ color: "var(--color-stop)" }}>
                  Expired {Math.abs(days!)}d ago
                </span>
              )}
              {expiryStatus === "expiring" && (
                <span className="ml-2 text-[0.5625rem] font-bold" style={{ color: "var(--color-signal)" }}>
                  Expires in {days}d
                </span>
              )}
            </div>
          )}

          {/* Document link */}
          {doc.documentUrl && (
            <a
              href={doc.documentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-1.5 text-[0.5625rem] font-semibold"
              style={{ color: "var(--color-steel)" }}
            >
              <ExternalLink className="size-3" />
              View document
            </a>
          )}
        </div>

        {/* Status badge */}
        <div className="shrink-0">
          <MobileStatusBadge status={doc.status} label={statusConfig.label} />
        </div>
      </div>
    </div>
  );
}

// ── Filter chip ─────────────────────────────────────────────────────────────

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 px-2.5 py-1 rounded-full text-[0.5625rem] font-semibold border press transition-colors",
      )}
      style={{
        backgroundColor: active ? "var(--color-ink-950)" : "transparent",
        color: active ? "#fff" : "var(--color-ink-500)",
        borderColor: active ? "var(--color-ink-950)" : "var(--color-line)",
      }}
    >
      {label}
    </button>
  );
}

// ── Stage lookup ────────────────────────────────────────────────────────────

function getStageForType(type: LegalDocType): string {
  const FEASIBILITY_TYPES: LegalDocType[] = [
    "OWNERSHIP_CERTIFICATE",
    "NON_ENCUMBRANCE",
    "LAND_SANCTION",
    "CHANGE_LAND_USE",
    "AGREEMENT_TO_SELL",
    "TRANSFER_DUTY",
    "RERA_REGISTRATION",
  ];
  const SANCTION_TYPES: LegalDocType[] = [
    "MAP_APPROVAL",
    "BUILDING_PERMISSION",
    "CLA",
    "FIRE_NOC",
    "POLLUTION_NOC",
    "ENVIRONMENTAL_CLEARANCE",
    "TREE_CUTTING_NOC",
    "AVIATION_NOC",
    "HEIGHT_CLEARANCE",
    "DRAINAGE_NOC",
    "ELECTRICITY_NOC",
    "WATER_NOC",
    "COMMENCEMENT_CERTIFICATE",
  ];
  const POST_COMPLETION_TYPES: LegalDocType[] = [
    "PLINTH_CERTIFICATE",
    "COMPLETION_CERTIFICATE",
    "OCCUPANCY_CERTIFICATE",
    "FUNCTIONAL_CERTIFICATE",
  ];

  if (FEASIBILITY_TYPES.includes(type)) return "FEASIBILITY";
  if (SANCTION_TYPES.includes(type)) return "SANCTION";
  if (POST_COMPLETION_TYPES.includes(type)) return "POST_COMPLETION";
  return "SANCTION"; // default for OTHER
}
