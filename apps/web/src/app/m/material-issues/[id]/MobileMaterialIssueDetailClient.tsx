"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Package, Printer, MapPin, User, Truck, Phone,
  AlertCircle, Loader2, X, Ban, FileText,
} from "lucide-react";
import { formatCurrency, formatCurrencyCompact, formatDate } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileRow,
  MobileEmptyState,
  MobileStatCard,
} from "@/components/mobile/v2/primitives";
import { MobileLink as Link } from "@/components/mobile/mobile-link";
import { toast } from "sonner";

interface IssueLine {
  id: string;
  materialCode: string;
  materialName: string;
  materialUnit: string | null;
  qty: number;
  unitCost: number;
  lineTotal: number;
}

interface IssueData {
  id: string;
  issueNumber: string | null;
  status: string;
  issueDate: string;
  cancelledAt: string | null;
  cancelledByName: string | null;
  issuedByName: string | null;
  notes: string | null;
  receiverName: string | null;
  receiverMobile: string | null;
  vehicleNumber: string | null;
  vehicleType: string | null;
  driverName: string | null;
  driverPhone: string | null;
  totalCost: number;
  roundOff: number;
  totalAmount: number;
  projectName: string | null;
  projectId: string | null;
  departmentName: string | null;
  builtUnitNumber: string | null;
  subcontractorName: string | null;
  subcontractorId: string | null;
  phaseName: string | null;
  fromLocationName: string;
  lines: IssueLine[];
}

export function MobileMaterialIssueDetailClient({
  issue,
  canCancel,
  notFound,
}: {
  issue?: IssueData;
  canCancel: boolean;
  notFound?: boolean;
}) {
  const router = useRouter();
  const [showCancel, setShowCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  if (notFound || !issue) {
    return (
      <MobileEmptyState
        icon={AlertCircle}
        title="Material issue not found"
        hint="This issue may have been deleted or moved."
      />
    );
  }

  const isCancelled = issue.status === "CANCELLED";
  const targetName = issue.projectName ?? issue.departmentName ?? "—";
  const issueId = issue.id;

  async function handleCancel() {
    setCancelling(true);
    try {
      const res = await fetch(`/api/issue-materials/${issueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to cancel");
      toast.success("Material issue cancelled");
      setShowCancel(false);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 pb-8">
      {/* ── Header ── */}
      <div
        className="rounded-[0.625rem] border p-3"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="min-w-0">
            <h1 className="text-m-section font-bold leading-tight" style={{ color: "var(--color-ink-950)" }}>
              {issue.issueNumber ?? "Material Issue"}
            </h1>
            <p className="text-m-caption mt-0.5" style={{ color: "var(--color-ink-500)" }}>
              {formatDate(issue.issueDate)}
            </p>
          </div>
          <span
            className="text-m-caption font-bold uppercase px-1.5 py-0.5 rounded-[0.25rem] shrink-0"
            style={{
              backgroundColor: isCancelled ? "var(--color-stop)" : "var(--color-go)",
              color: "var(--color-paper)",
            }}
          >
            {issue.status}
          </span>
        </div>
        <div className="flex items-center gap-1.5 mt-1.5">
          <Package className="size-3" style={{ color: "var(--color-steel)" }} />
          <span className="text-m-caption font-semibold" style={{ color: "var(--color-ink-700)" }}>
            {targetName}
          </span>
        </div>
      </div>

      {/* ── Cancelled banner ── */}
      {isCancelled ? (
        <div
          className="rounded-[0.5rem] border p-2.5"
          style={{ borderColor: "color-mix(in srgb, var(--color-stop) 30%, var(--color-line))", backgroundColor: "color-mix(in srgb, var(--color-stop) 5%, transparent)" }}
        >
          <p className="text-m-label font-bold" style={{ color: "var(--color-stop)" }}>
            Cancelled
          </p>
          {issue.cancelledAt ? (
            <p className="text-m-caption mt-0.5" style={{ color: "var(--color-ink-500)" }}>
              {formatDate(issue.cancelledAt)}{issue.cancelledByName ? ` · ${issue.cancelledByName}` : ""}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* ── Print + Cancel actions ── */}
      <div className="flex gap-2">
        {issue.issueNumber ? (
          <a
            href={`/print/issue/${issue.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-[0.5rem] border py-2 text-m-label font-bold text-m-body press"
            style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)", backgroundColor: "var(--color-paper)" }}
          >
            <Printer className="size-3.5" />
            Print Slip
          </a>
        ) : null}
        {canCancel && !isCancelled ? (
          <button
            onClick={() => setShowCancel(true)}
            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-[0.5rem] border py-2 text-m-label font-bold text-m-body press"
            style={{ borderColor: "color-mix(in srgb, var(--color-stop) 30%, var(--color-line))", color: "var(--color-stop)" }}
          >
            <Ban className="size-3.5" />
            Cancel Issue
          </button>
        ) : null}
      </div>

      {/* ── Summary stats ── */}
      <div className="grid grid-cols-3 gap-1.5">
        <MobileStatCard
          label="Lines"
          value={String(issue.lines.length)}
          icon={FileText}
        />
        <MobileStatCard
          label="Total Cost"
          value={formatCurrencyCompact(issue.totalCost)}
          icon={Package}
          tone="signal"
        />
        <MobileStatCard
          label="Chargeable"
          value={formatCurrencyCompact(issue.totalAmount)}
          icon={Package}
          tone="go"
        />
      </div>

      {/* ── Details ── */}
      <div>
        <MobileSectionTitle>Details</MobileSectionTitle>
        <div className="flex flex-col gap-2.5">
          <MobileRow icon={MapPin} title="From Location" meta={issue.fromLocationName} />
          {issue.projectName ? (
            <MobileRow icon={Package} title="Project" meta={issue.projectName} />
          ) : null}
          {issue.departmentName ? (
            <MobileRow icon={Package} title="Department" meta={issue.departmentName} />
          ) : null}
          {issue.builtUnitNumber ? (
            <MobileRow icon={Package} title="Built Unit" meta={issue.builtUnitNumber} />
          ) : null}
          {issue.subcontractorName ? (
            issue.subcontractorId ? (
              <Link href={`/m/subcontractors/${issue.subcontractorId}`} className="flex items-center gap-2">
                <MobileRow icon={User} title="Subcontractor" meta={issue.subcontractorName} />
              </Link>
            ) : (
              <MobileRow icon={User} title="Subcontractor" meta={issue.subcontractorName} />
            )
          ) : null}
          {issue.phaseName ? (
            <MobileRow icon={MapPin} title="Phase" meta={issue.phaseName} />
          ) : null}
          {issue.issuedByName ? (
            <MobileRow icon={User} title="Issued By" meta={issue.issuedByName} />
          ) : null}
        </div>
      </div>

      {/* ── Receiver & Vehicle ── */}
      {(issue.receiverName || issue.vehicleNumber || issue.driverName) ? (
        <div>
          <MobileSectionTitle>Receiver & Transport</MobileSectionTitle>
          <div className="flex flex-col gap-2.5">
            {issue.receiverName ? (
              <MobileRow icon={User} title="Receiver" meta={issue.receiverName} />
            ) : null}
            {issue.receiverMobile ? (
              <MobileRow icon={Phone} title="Receiver Mobile" meta={issue.receiverMobile} />
            ) : null}
            {issue.vehicleNumber ? (
              <MobileRow icon={Truck} title="Vehicle" meta={`${issue.vehicleNumber}${issue.vehicleType ? ` · ${issue.vehicleType}` : ""}`} />
            ) : null}
            {issue.driverName ? (
              <MobileRow icon={User} title="Driver" meta={`${issue.driverName}${issue.driverPhone ? ` · ${issue.driverPhone}` : ""}`} />
            ) : null}
          </div>
        </div>
      ) : null}

      {/* ── Line items ── */}
      <div>
        <MobileSectionTitle right={<span className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>{issue.lines.length}</span>}>
          Line Items
        </MobileSectionTitle>
        <div className="flex flex-col gap-2">
          {issue.lines.map((l) => (
            <div
              key={l.id}
              className="rounded-[0.5rem] border p-2.5"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-m-label font-bold" style={{ color: "var(--color-ink-950)" }}>
                    {l.materialName}
                  </p>
                  <p className="text-m-caption font-mono" style={{ color: "var(--color-ink-500)" }}>
                    {l.materialCode}
                  </p>
                </div>
                <p className="text-m-label font-bold tabular-nums shrink-0" style={{ color: "var(--color-ink-950)" }}>
                  {formatCurrency(l.lineTotal)}
                </p>
              </div>
              <div className="flex items-center gap-2 mt-1.5 text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                <span className="tabular-nums">{l.qty} {l.materialUnit ?? ""}</span>
                <span>×</span>
                <span className="tabular-nums">{formatCurrency(l.unitCost)}/{l.materialUnit ?? "unit"}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Notes ── */}
      {issue.notes ? (
        <div>
          <MobileSectionTitle>Notes</MobileSectionTitle>
          <div
            className="rounded-[0.5rem] border p-3"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          >
            <p className="text-m-label leading-relaxed" style={{ color: "var(--color-ink-700)" }}>
              {issue.notes}
            </p>
          </div>
        </div>
      ) : null}

      {/* ── Cancel confirmation ── */}
      {showCancel ? (
        <div
          className="fixed inset-0 z-50 flex items-end"
          style={{ backgroundColor: "rgba(18, 17, 13, 0.4)" }}
          onClick={() => setShowCancel(false)}
        >
          <div
            className="w-full rounded-t-[1rem] mx-auto max-w-md"
            style={{ backgroundColor: "var(--color-paper)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-2 pb-1">
              <div className="h-1 w-10 rounded-full" style={{ backgroundColor: "var(--color-line)" }} />
            </div>
            <div className="flex items-center justify-between px-3 pb-2">
              <p className="text-m-section font-bold" style={{ color: "var(--color-ink-950)" }}>
                Cancel Material Issue?
              </p>
              <button onClick={() => setShowCancel(false)} className="text-m-body press p-1">
                <X className="size-4" style={{ color: "var(--color-ink-500)" }} />
              </button>
            </div>
            <div className="px-3 pb-4">
              <p className="text-m-label mb-3" style={{ color: "var(--color-ink-500)" }}>
                This will reverse the stock issue, restore materials to the source location, and reverse GL entries. This cannot be undone.
              </p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setShowCancel(false)}
                  disabled={cancelling}
                  className="flex-1 h-9 rounded-[0.5rem] border text-m-label font-bold text-m-body press"
                  style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
                >
                  Keep Issue
                </button>
                <button
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="flex-1 h-9 rounded-[0.5rem] text-m-label font-bold text-m-body press flex items-center justify-center gap-1"
                  style={{ backgroundColor: "var(--color-stop)", color: "var(--color-paper)" }}
                >
                  {cancelling ? <Loader2 className="size-3.5 animate-spin" /> : "Cancel Issue"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
