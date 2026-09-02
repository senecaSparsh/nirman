"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  ChevronRight, MapPin, Building2, ExternalLink,
  ShieldCheck, AlertTriangle, Clock, CheckCircle2, FileText,
  XCircle, RefreshCw, ScrollText, Landmark, Flame, Trees, Plane,
  Zap, Droplets, HardHat, Home, KeyRound, FileCheck2, Gavel,
  Building, FileSignature,
} from "lucide-react";
import {
  MobileStatusBadge,
} from "@/components/mobile/v2/primitives";
import { MobileSearchHeader, MobileFilterIcon, MobileNoResults } from "@/components/mobile/v2/scaffold";
import { formatDate } from "@/lib/utils";
import {
  STAGE_LABELS, STAGE_ORDER, daysUntilExpiry, getExpiryStatus,
  LEGAL_DOC_FLOW_MAP,
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

const STATUS_CONFIG: Record<LegalDocStatus, { label: string; tone: "neutral" | "signal" | "go" | "stop"; bg: string; fg: string }> = {
  NOT_REQUIRED: { label: "N/A", tone: "neutral", bg: "var(--color-concrete)", fg: "var(--color-ink-500)" },
  PENDING: { label: "Pending", tone: "signal", bg: "var(--color-signal-wash)", fg: "var(--color-signal-dark)" },
  APPROVED: { label: "Approved", tone: "go", bg: "var(--color-go-wash)", fg: "var(--color-go-dark)" },
  REJECTED: { label: "Rejected", tone: "stop", bg: "var(--color-stop-wash)", fg: "var(--color-stop)" },
  EXPIRED: { label: "Expired", tone: "stop", bg: "var(--color-stop-wash)", fg: "var(--color-stop)" },
  RENEWAL_DUE: { label: "Renewal", tone: "signal", bg: "var(--color-signal-wash)", fg: "var(--color-signal-dark)" },
};

const STATUS_CHIPS: { label: string; value: string }[] = [
  { label: "All", value: "ALL" },
  { label: "Pending", value: "PENDING" },
  { label: "Approved", value: "APPROVED" },
  { label: "Expired", value: "EXPIRED" },
  { label: "Renewal", value: "RENEWAL_DUE" },
];

const CONTEXT_CHIPS: { label: string; value: string }[] = [
  { label: "All", value: "ALL" },
  { label: "Land", value: "LAND" },
  { label: "Project", value: "PROJECT" },
];

// ── Type → icon mapping (mirrors the tree hierarchy icon style) ──
const TYPE_ICON: Record<string, typeof FileText> = {
  OWNERSHIP_CERTIFICATE: KeyRound,
  NON_ENCUMBRANCE: FileCheck2,
  LAND_SANCTION: Landmark,
  CHANGE_LAND_USE: MapPin,
  AGREEMENT_TO_SELL: FileSignature,
  TRANSFER_DUTY: Gavel,
  RERA_REGISTRATION: Building,
  MAP_APPROVAL: Building2,
  BUILDING_PERMISSION: Building2,
  CLA: ScrollText,
  FIRE_NOC: Flame,
  POLLUTION_NOC: AlertTriangle,
  ENVIRONMENTAL_CLEARANCE: ShieldCheck,
  TREE_CUTTING_NOC: Trees,
  AVIATION_NOC: Plane,
  HEIGHT_CLEARANCE: Plane,
  DRAINAGE_NOC: Droplets,
  ELECTRICITY_NOC: Zap,
  WATER_NOC: Droplets,
  COMMENCEMENT_CERTIFICATE: HardHat,
  PLINTH_CERTIFICATE: HardHat,
  COMPLETION_CERTIFICATE: CheckCircle2,
  OCCUPANCY_CERTIFICATE: Home,
  FUNCTIONAL_CERTIFICATE: FileCheck2,
  OTHER: FileText,
};

// ── Stage → icon + color ──
const STAGE_STYLE: Record<string, { icon: typeof MapPin; bg: string; fg: string }> = {
  FEASIBILITY: { icon: MapPin, bg: "var(--color-ink-950)", fg: "var(--color-paper)" },
  SANCTION: { icon: Building2, bg: "var(--color-steel)", fg: "#fff" },
  POST_COMPLETION: { icon: ShieldCheck, bg: "var(--color-signal)", fg: "var(--color-ink-950)" },
};

/**
 * MobilePermissionsList — filterable list of legal documents.
 * Tree-hierarchy-style compact cards in a 2-column grid.
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

  return (
    <div>
      {/* ── Search + Filters ── */}
      <MobileSearchHeader
        query={search}
        onQueryChange={setSearch}
        placeholder="Search by title, doc no, authority, project…"
        action={
          <div className="flex items-center gap-1 shrink-0">
            <MobileFilterIcon
              options={STATUS_CHIPS}
              active={statusFilter}
              defaultValue="ALL"
              onChange={setStatusFilter}
            />
            <MobileFilterIcon
              options={CONTEXT_CHIPS}
              active={contextFilter}
              defaultValue="ALL"
              onChange={setContextFilter}
            />
          </div>
        }
        showClear={search !== "" || statusFilter !== "ALL" || contextFilter !== "ALL"}
        onClear={() => { setSearch(""); setStatusFilter("ALL"); setContextFilter("ALL"); }}
      />

      {/* ── Grouped list — 2-column grid per stage ── */}
      {filtered.length === 0 ? (
        <MobileNoResults title="No documents match your filters" />
      ) : (
        <div className="space-y-4">
          {STAGE_ORDER.map((stage) => {
            const stageDocs = grouped[stage];
            if (!stageDocs || stageDocs.length === 0) return null;
            const stageStyle = STAGE_STYLE[stage] ?? STAGE_STYLE.SANCTION!;
            const StageIcon = stageStyle.icon;
            return (
              <div key={stage}>
                {/* ── Stage header — tree-row style ── */}
                <div className="flex items-center gap-1.5 mb-2">
                  <span
                    className="grid place-items-center size-4 rounded-[0.1875rem] shrink-0"
                    style={{ backgroundColor: stageStyle.bg }}
                  >
                    <StageIcon className="size-2.5" style={{ color: stageStyle.fg }} />
                  </span>
                  <p
                    className="text-m-caption font-bold uppercase tracking-wide"
                    style={{ color: "var(--color-ink-500)" }}
                  >
                    {STAGE_LABELS[stage]}
                  </p>
                  <span
                    className="text-m-caption font-semibold shrink-0"
                    style={{ color: "var(--color-ink-400)" }}
                  >
                    {stageDocs.length}
                  </span>
                </div>

                {/* ── 2-column grid of compact cards ── */}
                <div className="grid grid-cols-2 gap-1.5">
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

// ── Single permission card — tree-hierarchy compact style ──────────────────

function PermissionCard({ doc }: { doc: MobilePermissionRow; canManage: boolean }) {
  const statusConfig = STATUS_CONFIG[doc.status];
  const expiryStatus = getExpiryStatus(doc.validTill);
  const days = daysUntilExpiry(doc.validTill);
  const entityHref = doc.projectId
    ? `/m/projects/${doc.projectId}`
    : doc.landPurchaseId
      ? `/m/land/${doc.landPurchaseId}`
      : null;
  const entityName = doc.projectName ?? doc.landSellerName ?? null;
  const flowStep = LEGAL_DOC_FLOW_MAP[doc.type];
  const typeLabel = flowStep?.label ?? doc.type.replace(/_/g, " ");
  const DocIcon = TYPE_ICON[doc.type] ?? FileText;

  return (
    <div
      className="rounded-[0.375rem] border p-2 flex flex-col gap-1"
      style={{
        backgroundColor: "var(--color-paper)",
        borderColor: "var(--color-line)",
      }}
    >
      {/* ── Row 1: icon + type label + status badge ── */}
      <div className="flex items-center gap-1.5">
        <span
          className="grid place-items-center size-4 rounded-[0.1875rem] shrink-0"
          style={{ backgroundColor: statusConfig.bg }}
        >
          <DocIcon className="size-2.5" style={{ color: statusConfig.fg }} />
        </span>
        <span
          className="text-m-caption font-bold uppercase truncate flex-1 min-w-0"
          style={{ color: "var(--color-ink-400)" }}
        >
          {doc.type.replace(/_/g, " ")}
        </span>
        <span
          className="inline-block rounded px-1 py-px text-m-caption font-bold uppercase shrink-0"
          style={{ backgroundColor: statusConfig.bg, color: statusConfig.fg }}
        >
          {statusConfig.label}
        </span>
      </div>

      {/* ── Row 2: title (bold, truncated) ── */}
      <p
        className="text-m-label font-semibold leading-tight line-clamp-2"
        style={{ color: "var(--color-ink-950)" }}
      >
        {doc.title}
      </p>

      {/* ── Row 3: entity link (project/land) ── */}
      {entityName && (
        <Link
          href={entityHref ?? "#"}
          className="inline-flex items-center gap-0.5 text-m-caption font-medium min-w-0"
          style={{ color: "var(--color-steel)" }}
        >
          {doc.projectId ? <Building2 className="size-2.5 shrink-0" /> : <MapPin className="size-2.5 shrink-0" />}
          <span className="truncate">{entityName}</span>
        </Link>
      )}

      {/* ── Row 4: validity + expiry alert ── */}
      {doc.validTill && (
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
            {formatDate(doc.validTill)}
          </span>
          {expiryStatus === "expired" && (
            <span className="text-m-caption font-bold" style={{ color: "var(--color-stop)" }}>
              · {Math.abs(days!)}d ago
            </span>
          )}
          {expiryStatus === "expiring" && (
            <span className="text-m-caption font-bold" style={{ color: "var(--color-signal)" }}>
              · {days}d left
            </span>
          )}
        </div>
      )}

      {/* ── Row 5: doc number + document link ── */}
      {(doc.docNumber || doc.documentUrl) && (
        <div className="flex items-center gap-2 flex-wrap">
          {doc.docNumber && (
            <span className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
              #{doc.docNumber}
            </span>
          )}
          {doc.documentUrl && (
            <a
              href={doc.documentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-m-caption font-semibold"
              style={{ color: "var(--color-steel)" }}
            >
              <ExternalLink className="size-2.5" />
              Doc
            </a>
          )}
        </div>
      )}
    </div>
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
