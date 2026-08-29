"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Phone, Mail, BadgeCheck, MapPin, Hammer,
  ClipboardList, Wallet, Package, AlertCircle,
  Pencil, X, Loader2,
} from "lucide-react";
import { formatCurrency, formatCurrencyCompact, formatDate } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileRow,
  MobileStatCard,
  MobileEmptyState,
  MobileStatusBadge,
} from "@/components/mobile/v2/primitives";
import { MobileLink as Link } from "@/components/mobile/mobile-link";
import { toast } from "sonner";

/* ─── Types ─── */

interface WorkOrderItem {
  id: string;
  workOrderNumber: string;
  workTitle: string;
  status: string;
  issueDate: string;
  projectName: string;
  totalWorkDone: number;
  totalPaid: number;
  retentionBalance: number;
}

interface ProjectCostItem {
  id: string;
  costType: string;
  amount: number;
  date: string;
  vendor: string | null;
  notes: string | null;
  projectName: string;
}

interface MaterialIssueItem {
  id: string;
  issueNumber: string | null;
  issueDate: string;
  status: string;
  totalCost: number;
  projectName: string | null;
}

interface SubcontractorData {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  address: string | null;
  trade: string | null;
  createdAt: string;
  workOrders: WorkOrderItem[];
  projectCosts: ProjectCostItem[];
  materialIssues: MaterialIssueItem[];
  totals: {
    totalWorkDone: number;
    totalPaid: number;
    totalCosts: number;
    activeJobs: number;
    workOrderCount: number;
  };
}

/* ─── Main component ─── */

export function MobileSubcontractorDetailClient({
  data,
  canManage,
  notFound,
}: {
  data?: SubcontractorData;
  canManage: boolean;
  notFound?: boolean;
}) {
  const router = useRouter();
  const [showEdit, setShowEdit] = useState(false);

  if (notFound || !data) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-3">
          <p className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
            Subcontractor not found
          </p>
        </div>
        <div
          className="flex flex-col items-center justify-center rounded-[0.5rem] border py-8 text-center"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
        >
          <AlertCircle className="size-6 mb-2" style={{ color: "var(--color-ink-300)" }} />
          <p className="text-[0.75rem] font-semibold" style={{ color: "var(--color-ink-700)" }}>
            Subcontractor not found
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-6">
      {/* ── Header ── */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-[0.875rem] font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
            {data.name}
          </p>
          <p className="text-[0.5rem]" style={{ color: "var(--color-ink-500)" }}>
            {data.trade ? `${data.trade} · ` : ""}Added {formatDate(data.createdAt)}
          </p>
        </div>
        {canManage ? (
          <button
            onClick={() => setShowEdit(true)}
            className="flex items-center justify-center h-7 w-7 rounded-[0.375rem] press"
            style={{ backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-700)" }}
          >
            <Pencil className="size-3.5" />
          </button>
        ) : null}
      </div>

      {/* ── Contact card — clickable actions ── */}
      <div
        className="rounded-[0.625rem] border mb-3 overflow-hidden"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <div className="p-3">
          {/* Quick action buttons — call + email */}
          <div className="flex gap-2 mb-3">
            {data.phone ? (
              <a
                href={`tel:${data.phone}`}
                className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-[0.5rem] text-[0.625rem] font-bold press"
                style={{ backgroundColor: "var(--color-go)", color: "var(--color-paper)" }}
              >
                <Phone className="size-3.5" />
                Call
              </a>
            ) : null}
            {data.email ? (
              <a
                href={`mailto:${data.email}`}
                className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-[0.5rem] border text-[0.625rem] font-bold press"
                style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
              >
                <Mail className="size-3.5" />
                Email
              </a>
            ) : null}
          </div>

          {/* Contact details grid */}
          <div className="grid grid-cols-2 gap-2">
            <ContactField icon={<Hammer className="size-2.5" />} label="Trade" value={data.trade} />
            <ContactField icon={<Phone className="size-2.5" />} label="Phone" value={data.phone} />
            <ContactField icon={<Mail className="size-2.5" />} label="Email" value={data.email} />
            <ContactField icon={<BadgeCheck className="size-2.5" />} label="GSTIN" value={data.gstin} mono />
            <ContactField icon={<MapPin className="size-2.5" />} label="Address" value={data.address} />
          </div>
        </div>
      </div>

      {/* ── Summary stats ── */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <MobileStatCard
          label="Work Orders"
          value={String(data.totals.workOrderCount)}
          hint={data.totals.activeJobs > 0 ? `${data.totals.activeJobs} active` : undefined}
          tone={data.totals.activeJobs > 0 ? "go" : "neutral"}
          icon={ClipboardList}
        />
        <MobileStatCard
          label="Work Done"
          value={formatCurrencyCompact(data.totals.totalWorkDone)}
          tone="neutral"
          icon={Wallet}
        />
        <MobileStatCard
          label="Total Costs"
          value={formatCurrencyCompact(data.totals.totalCosts)}
          tone="signal"
          icon={Package}
        />
      </div>

      {/* ── Financial summary banner ── */}
      <div
        className="rounded-[0.625rem] border mb-3 overflow-hidden"
        style={{
          borderColor: data.totals.totalWorkDone > 0 ? "var(--color-go)" : "var(--color-line)",
          backgroundColor: "var(--color-paper)",
        }}
      >
        <div className="p-3">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-[0.4375rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
                Total Work Done
              </p>
              <p
                className="text-[1.25rem] font-bold tabular-nums leading-tight"
                style={{ color: "var(--color-ink-950)" }}
              >
                {formatCurrency(data.totals.totalWorkDone)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[0.4375rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
                Total Paid
              </p>
              <p className="text-[0.875rem] font-bold tabular-nums" style={{ color: "var(--color-go)" }}>
                {formatCurrencyCompact(data.totals.totalPaid)}
              </p>
            </div>
          </div>

          {/* Mini stats row */}
          <div className="flex items-center gap-3 text-[0.5rem] font-semibold">
            <span className="flex items-center gap-0.5" style={{ color: "var(--color-ink-500)" }}>
              <Wallet className="size-2.5" />
              {formatCurrencyCompact(data.totals.totalPaid)} paid
            </span>
            <span style={{ color: "var(--color-ink-500)" }}>
              {data.totals.workOrderCount} work orders
            </span>
            {data.totals.activeJobs > 0 ? (
              <span className="flex items-center gap-0.5" style={{ color: "var(--color-go)" }}>
                <ClipboardList className="size-2.5" />
                {data.totals.activeJobs} active
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── Work orders ── */}
      <div className="mb-4">
        <MobileSectionTitle right={<span className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>{data.workOrders.length}</span>}>
          Work Orders
        </MobileSectionTitle>

        {data.workOrders.length === 0 ? (
          <MobileEmptyState
            icon={ClipboardList}
            title="No work orders yet"
            hint={canManage ? "Issue a work order to assign scope of work to this subcontractor." : "Work orders will appear here once issued."}
          />
        ) : (
          <div className="flex flex-col gap-2">
            {data.workOrders.map((w) => (
              <WorkOrderCard key={w.id} wo={w} />
            ))}
          </div>
        )}
      </div>

      {/* ── Project costs ── */}
      <div className="mb-4">
        <MobileSectionTitle right={<span className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>{data.projectCosts.length}</span>}>
          Project Costs
        </MobileSectionTitle>

        {data.projectCosts.length === 0 ? (
          <MobileEmptyState
            icon={Wallet}
            title="No project costs recorded"
            hint="Costs attributed to this subcontractor will appear here."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {data.projectCosts.map((c) => (
              <ProjectCostRow key={c.id} cost={c} />
            ))}
          </div>
        )}
      </div>

      {/* ── Material issues ── */}
      <div className="mb-4">
        <MobileSectionTitle right={<span className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>{data.materialIssues.length}</span>}>
          Material Issues
        </MobileSectionTitle>

        {data.materialIssues.length === 0 ? (
          <MobileEmptyState
            icon={Package}
            title="No material issues"
            hint="Materials issued to this subcontractor will appear here."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {data.materialIssues.map((m) => (
              <MaterialIssueRow key={m.id} issue={m} />
            ))}
          </div>
        )}
      </div>

      {/* ── Edit sheet ── */}
      {showEdit ? (
        <SubcontractorEditSheet
          subcontractorId={data.id}
          initialName={data.name}
          initialTrade={data.trade ?? ""}
          initialGstin={data.gstin ?? ""}
          initialPhone={data.phone ?? ""}
          initialEmail={data.email ?? ""}
          initialAddress={data.address ?? ""}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            setShowEdit(false);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

/* ─── Contact field ─── */
function ContactField({
  icon, label, value, mono,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-[0.375rem] font-semibold uppercase flex items-center gap-0.5" style={{ color: "var(--color-ink-500)" }}>
        {icon}
        {label}
      </p>
      <p
        className={`text-[0.625rem] font-bold leading-tight mt-0.5 truncate ${mono ? "font-mono tabular-nums" : ""}`}
        style={{ color: value ? "var(--color-ink-950)" : "var(--color-ink-300)" }}
      >
        {value ?? "—"}
      </p>
    </div>
  );
}

/* ─── Work order card ─── */
function WorkOrderCard({ wo }: { wo: WorkOrderItem }) {
  const balance = wo.totalWorkDone - wo.totalPaid;
  const paidPct = wo.totalWorkDone > 0 ? Math.round((wo.totalPaid / wo.totalWorkDone) * 100) : 0;

  return (
    <Link
      href={`/m/work-orders/${wo.id}`}
      className="block rounded-[0.5rem] border overflow-hidden active:scale-[0.99] transition-transform"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      <div className="p-2.5">
        {/* ── Top: WO number + status ── */}
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <ClipboardList className="size-3" style={{ color: "var(--color-ink-500)" }} />
            <span className="text-[0.5rem] font-mono font-bold" style={{ color: "var(--color-ink-950)" }}>
              {wo.workOrderNumber}
            </span>
          </div>
          <MobileStatusBadge status={wo.status} />
        </div>

        {/* ── Work title ── */}
        <p className="text-[0.625rem] font-semibold mb-1 truncate" style={{ color: "var(--color-ink-950)" }}>
          {wo.workTitle}
        </p>

        {/* ── Project + date ── */}
        <p className="text-[0.5rem] mb-2" style={{ color: "var(--color-ink-500)" }}>
          {wo.projectName}
          {" · "}{formatDate(wo.issueDate)}
        </p>

        {/* ── Financial row ── */}
        <div className="flex items-center gap-3">
          <div>
            <p className="text-[0.375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>
              Work Done
            </p>
            <p className="text-[0.6875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
              {formatCurrencyCompact(wo.totalWorkDone)}
            </p>
          </div>

          <div className="w-px h-6" style={{ backgroundColor: "var(--color-line)" }} />

          <div>
            <p className="text-[0.375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>
              Paid
            </p>
            <p className="text-[0.6875rem] font-bold tabular-nums" style={{ color: "var(--color-go)" }}>
              {formatCurrencyCompact(wo.totalPaid)}
            </p>
          </div>

          {balance > 0 ? (
            <>
              <div className="w-px h-6" style={{ backgroundColor: "var(--color-line)" }} />
              <div>
                <p className="text-[0.375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>
                  Balance
                </p>
                <p className="text-[0.6875rem] font-bold tabular-nums" style={{ color: "var(--color-signal)" }}>
                  {formatCurrencyCompact(balance)}
                </p>
              </div>
            </>
          ) : null}

          {wo.retentionBalance > 0 ? (
            <span className="ml-auto text-[0.375rem] font-bold uppercase" style={{ color: "var(--color-ink-500)" }}>
              {formatCurrencyCompact(wo.retentionBalance)} retained
            </span>
          ) : null}
        </div>

        {/* ── Payment progress bar ── */}
        {wo.totalWorkDone > 0 && paidPct < 100 ? (
          <div className="flex h-1 rounded-full overflow-hidden mt-2" style={{ backgroundColor: "var(--color-paper-2)" }}>
            <div style={{ width: `${paidPct}%`, backgroundColor: "var(--color-go)" }} />
          </div>
        ) : null}
      </div>
    </Link>
  );
}

/* ─── Project cost row ─── */
function ProjectCostRow({ cost }: { cost: ProjectCostItem }) {
  return (
    <MobileRow
      icon={Wallet}
      title={cost.costType.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}
      subtitle={`${cost.projectName} · ${formatDate(cost.date)}`}
      meta={formatCurrencyCompact(cost.amount)}
      metaSub={cost.vendor ?? undefined}
      tone="default"
    />
  );
}

/* ─── Material issue row ─── */
function MaterialIssueRow({ issue }: { issue: MaterialIssueItem }) {
  return (
    <MobileRow
      href={`/m/material-issues/${issue.id}`}
      icon={Package}
      title={issue.issueNumber ?? "Material Issue"}
      subtitle={`${issue.projectName ?? "Standalone"} · ${formatDate(issue.issueDate)}`}
      meta={formatCurrencyCompact(issue.totalCost)}
      badge={<MobileStatusBadge status={issue.status} />}
      tone="default"
    />
  );
}

/* ─── Edit sheet (bottom sheet) ─── */
function SubcontractorEditSheet({
  subcontractorId,
  initialName,
  initialTrade,
  initialGstin,
  initialPhone,
  initialEmail,
  initialAddress,
  onClose,
  onSaved,
}: {
  subcontractorId: string;
  initialName: string;
  initialTrade: string;
  initialGstin: string;
  initialPhone: string;
  initialEmail: string;
  initialAddress: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [trade, setTrade] = useState(initialTrade);
  const [gstin, setGstin] = useState(initialGstin);
  const [phone, setPhone] = useState(initialPhone);
  const [email, setEmail] = useState(initialEmail);
  const [address, setAddress] = useState(initialAddress);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) return toast.error("Name is required");
    setSaving(true);
    try {
      const res = await fetch(`/api/subcontractors/${subcontractorId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          trade: trade.trim() || null,
          gstin: gstin.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          address: address.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      toast.success("Subcontractor updated");
      onSaved();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "w-full h-9 rounded-[0.5rem] border px-2.5 text-[0.75rem] outline-none";
  const inputStyle = {
    borderColor: "var(--color-line)",
    backgroundColor: "var(--color-paper)",
    color: "var(--color-ink-950)",
  };
  const labelClass = "text-[0.5625rem] font-semibold block mb-1";
  const labelStyle = { color: "var(--color-ink-500)" };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end"
      style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
      onClick={onClose}
    >
      <div
        className="w-full rounded-t-[1rem] max-h-[85vh] overflow-y-auto"
        style={{ backgroundColor: "var(--color-paper)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-2 pb-1">
          <div className="h-1 w-10 rounded-full" style={{ backgroundColor: "var(--color-line)" }} />
        </div>
        <div className="flex items-center justify-between px-3 pb-2">
          <p className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
            Edit Subcontractor
          </p>
          <button onClick={onClose} className="press p-1">
            <X className="size-4" style={{ color: "var(--color-ink-500)" }} />
          </button>
        </div>
        <div className="px-3 pb-4 flex flex-col gap-3">
          <div>
            <label className={labelClass} style={labelStyle}>Name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} style={inputStyle} />
          </div>
          <div>
            <label className={labelClass} style={labelStyle}>Trade</label>
            <input value={trade} onChange={(e) => setTrade(e.target.value)} placeholder="e.g. Civil, Electrical, Plumbing" className={inputClass} style={inputStyle} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass} style={labelStyle}>GSTIN</label>
              <input value={gstin} onChange={(e) => setGstin(e.target.value)} placeholder="22AAAAA0000A1Z5" className={`${inputClass} font-mono`} style={inputStyle} />
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>Phone</label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9876543210" inputMode="tel" className={inputClass} style={inputStyle} />
            </div>
          </div>
          <div>
            <label className={labelClass} style={labelStyle}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contact@firm.com" className={inputClass} style={inputStyle} />
          </div>
          <div>
            <label className={labelClass} style={labelStyle}>Address</label>
            <textarea rows={2} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Office address…" className="w-full rounded-[0.5rem] border px-2.5 py-2 text-[0.75rem] resize-none outline-none" style={inputStyle} />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              disabled={saving}
              className="flex-1 h-9 rounded-[0.5rem] border text-[0.625rem] font-bold press"
              style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving || !name.trim()}
              className="flex-1 h-9 rounded-[0.5rem] text-[0.625rem] font-bold press flex items-center justify-center gap-1"
              style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)", opacity: saving || !name.trim() ? 0.5 : 1 }}
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
