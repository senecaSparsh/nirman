"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  Phone, Mail, KeyRound, Calendar, FileText,
  IndianRupee, Wallet, AlertCircle, Home, Maximize, Clock,
  CheckCircle2, Plus, Loader2, Banknote, User,
  PlayCircle, XCircle as XIcon, Printer, ExternalLink,
  Pencil, TrendingUp, UserCog, CalendarClock, FileUp,
} from "lucide-react";
import { formatCurrency, formatCurrencyCompact, formatDate, formatNumber } from "@/lib/utils";
import { toast } from "sonner";
import { MobileDocUploader } from "../../MobileDocUploader";
import { ActionBar, MobileEmptyState } from "@/components/mobile/v2/primitives";
import { MobileDialog } from "@/components/mobile/v2/dialog";
import { DetailAlertBanner } from "@/components/mobile/v2/detail-primitives";
import { useTodayDateState } from "@/lib/use-today-date";

/* ─── Types ─── */

interface Payment {
  id: string;
  amount: number;
  paymentDate: string;
  dueDate: string;
  mode: string;
  reference: string | null;
  status: string;
}

interface TenancyData {
  id: string;
  tenantName: string;
  tenantPhone: string | null;
  tenantEmail: string | null;
  status: string;
  assetType: string;
  assetLabel: string;
  assetArea: number | null;
  assetAreaUnit: string | null;
  builtUnitId: string | null;
  landParcelId: string | null;
  landPurchaseId: string | null;
  projectName: string | null;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  startDate: string;
  endDate: string;
  monthlyRent: number;
  securityDeposit: number;
  rentAgreementNo: string | null;
  rentAgreementDocumentUrl: string | null;
  rentAgreementDocumentName: string | null;
  notes: string | null;
  rentFreeDays: number;
  sacCode: string | null;
  escalationPercent: number | null;
  escalationIntervalMonths: number;
  draftNotes: string | null;
  draftDate: string | null;
  totalReceived: number;
  totalExpectedRent: number;
  overdueAmount: number;
  overdueCount: number;
  daysToExpiry: number;
  leaseMonths: number;
  payments: Payment[];
}

const STATUS_META: Record<string, { color: string; label: string }> = {
  ACTIVE: { color: "var(--color-go)", label: "Active" },
  PENDING: { color: "var(--color-signal)", label: "Pending" },
  EXPIRED: { color: "var(--color-stop)", label: "Expired" },
  TERMINATED: { color: "var(--color-stop)", label: "Terminated" },
};

const PAYMENT_STATUS_META: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
  RECEIVED: { color: "var(--color-go)", label: "Received", icon: <CheckCircle2 className="size-2.5" /> },
  PENDING: { color: "var(--color-signal)", label: "Pending", icon: <Clock className="size-2.5" /> },
  OVERDUE: { color: "var(--color-stop)", label: "Overdue", icon: <AlertCircle className="size-2.5" /> },
};

const PAYMENT_MODES = [
  { value: "BANK", label: "Bank" },
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "CHEQUE", label: "Cheque" },
];

/* ─── Main component ─── */

export function MobileRentalDetailClient({
  data,
  canManage,
  canSell,
  notFound,
}: {
  data?: TenancyData;
  canManage: boolean;
  canSell: boolean;
  notFound?: boolean;
}) {
  const router = useRouter();
  const [showPayment, setShowPayment] = useState(false);
  const [showAction, setShowAction] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showEscalate, setShowEscalate] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showUploadDraft, setShowUploadDraft] = useState(false);
  const [showChangeTenant, setShowChangeTenant] = useState(false);
  const [acting, setActing] = useState(false);

  if (notFound || !data) {
    return (
      <MobileEmptyState icon={AlertCircle} title="Tenancy not found" />
    );
  }

  const meta = STATUS_META[data.status] ?? { color: "var(--color-ink-500)", label: data.status };
  const isActive = data.status === "ACTIVE";
  const isPending = data.status === "PENDING";
  const isLand = data.assetType === "LAND";
  const AssetIcon = isLand ? Maximize : Home;
  const canRecordPayment = (isActive || isPending) && canSell;
  const canActivate = isPending && canManage;
  const canTerminate = isActive && canManage;
  const canEdit = canManage && data.status !== "TERMINATED";
  const canEscalate = isActive && canManage && data.escalationPercent != null;
  const canGenerateSchedule = (isActive || isPending) && canManage;
  const canUploadDraft = canManage && data.status !== "TERMINATED";
  const canChangeTenant = isActive && canManage;

  const collectionPct = data.totalExpectedRent > 0
    ? Math.round((data.totalReceived / data.totalExpectedRent) * 100)
    : 0;

  const handleActivate = async () => {
    setActing(true);
    try {
      const res = await fetch(`/api/tenancies/${data.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "activate" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to activate");
      }
      toast.success("Tenancy activated");
      router.refresh();
      setShowAction(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setActing(false);
    }
  };

  const handleTerminate = async () => {
    setActing(true);
    try {
      const res = await fetch(`/api/tenancies/${data.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "terminate" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to terminate");
      }
      toast.success("Tenancy terminated");
      router.refresh();
      setShowAction(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setActing(false);
    }
  };

  const uploadAgreement = async (documentUrl: string, documentName: string) => {
    setActing(true);
    try {
      const res = await fetch(`/api/tenancies/${data.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "uploadAgreement", documentUrl, documentName }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to upload agreement");
      }
      toast.success("Rent agreement uploaded");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setActing(false);
    }
  };

  const handleEdit = async (payload: Record<string, unknown>) => {
    setActing(true);
    try {
      const res = await fetch(`/api/tenancies/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to save changes");
      }
      toast.success("Tenancy updated");
      router.refresh();
      setShowEdit(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setActing(false);
    }
  };

  const handleEscalate = async () => {
    setActing(true);
    try {
      const res = await fetch(`/api/tenancies/${data.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "escalate" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to apply escalation");
      }
      const body = await res.json().catch(() => ({}));
      toast.success(`Rent escalated to ${formatCurrency(Number(body.newRent ?? 0))}`);
      router.refresh();
      setShowEscalate(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setActing(false);
    }
  };

  const handleGenerateSchedule = async (monthsAhead?: number) => {
    setActing(true);
    try {
      const res = await fetch(`/api/tenancies/${data.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generateSchedule", ...(monthsAhead ? { monthsAhead } : {}) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to generate schedule");
      }
      toast.success("Payment schedule generated");
      router.refresh();
      setShowSchedule(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setActing(false);
    }
  };

  const handleUploadDraft = async (payload: {
    documentUrl?: string;
    documentName?: string;
    draftNotes?: string;
    draftDate?: string;
  }) => {
    setActing(true);
    try {
      const res = await fetch(`/api/tenancies/${data.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "uploadDraft", ...payload }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to upload draft");
      }
      toast.success("Draft / LOI saved");
      router.refresh();
      setShowUploadDraft(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setActing(false);
    }
  };

  const handleChangeTenant = async (payload: Record<string, unknown>) => {
    setActing(true);
    try {
      const res = await fetch(`/api/tenancies/${data.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "changeTenant", ...payload }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to change tenant");
      }
      toast.success("Tenant changed");
      router.refresh();
      setShowChangeTenant(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="pb-20">
      {/* ── Header ── */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-m-section font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
            {data.tenantName}
          </p>
          <p className="text-m-caption flex items-center gap-0.5" style={{ color: "var(--color-ink-500)" }}>
            <AssetIcon className="size-2.5" />
            {data.builtUnitId ? (
              <Link href={`/m/units/${data.builtUnitId}`} className="underline underline-offset-2 text-m-body press">
                {data.assetLabel}
              </Link>
            ) : data.landPurchaseId ? (
              <Link href={`/m/land/${data.landPurchaseId}`} className="underline underline-offset-2 text-m-body press">
                {data.assetLabel}
              </Link>
            ) : (
              <span>{data.assetLabel}</span>
            )}{data.projectName ? ` · ${data.projectName}` : ""}
          </p>
        </div>
        <span
          className="flex items-center gap-0.5 text-m-caption font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full shrink-0"
          style={{ color: meta.color, backgroundColor: `color-mix(in srgb, ${meta.color} 12%, transparent)` }}
        >
          {meta.label}
        </span>
      </div>

      {/* ── Income summary banner ── */}
      <div
        className="rounded-[0.5rem] border mb-3 overflow-hidden"
        style={{
          borderColor: data.overdueAmount > 0 ? "var(--color-signal)" : "var(--color-line)",
          backgroundColor: "var(--color-paper)",
        }}
      >
        <div className="p-3">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-m-caption font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
                Monthly Rent
              </p>
              <p className="text-m-section font-bold tabular-nums leading-tight" style={{ color: "var(--color-ink-950)" }}>
                {formatCurrency(data.monthlyRent)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-m-caption font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
                Collected
              </p>
              <p className="text-m-section font-bold tabular-nums" style={{ color: "var(--color-go)" }}>
                {formatCurrencyCompact(data.totalReceived)}
              </p>
            </div>
          </div>

          {/* Collection progress bar */}
          <div className="flex h-1.5 rounded-full overflow-hidden mb-2" style={{ backgroundColor: "var(--color-paper-2)" }}>
            <div style={{ width: `${collectionPct}%`, backgroundColor: "var(--color-go)" }} />
          </div>

          <div className="flex items-center gap-3 text-m-caption font-semibold">
            <span style={{ color: "var(--color-ink-600)" }}>
              {collectionPct}% of {formatCurrencyCompact(data.totalExpectedRent)} expected
            </span>
            {data.overdueAmount > 0 ? (
              <span className="flex items-center gap-0.5" style={{ color: "var(--color-signal)" }}>
                <AlertCircle className="size-2.5" />
                {formatCurrencyCompact(data.overdueAmount)} overdue
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <ActionBar>
        {/* ── Quick actions ── */}
        <div className="flex gap-2 mb-3">
          {data.tenantPhone ? (
            <a
              href={`tel:${data.tenantPhone}`}
              className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-[0.5rem] text-m-label font-bold text-m-body press"
              style={{ backgroundColor: "var(--color-go)", color: "var(--color-paper)" }}
            >
              <Phone className="size-3.5" />
              Call Tenant
            </a>
          ) : null}
          {canRecordPayment ? (
            <button
              onClick={() => setShowPayment(true)}
              className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-[0.5rem] border text-m-label font-bold text-m-body press"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-700)" }}
            >
              <Plus className="size-3.5" />
              Record Rent
            </button>
          ) : null}
          {(canActivate || canTerminate) ? (
            <button
              onClick={() => setShowAction(true)}
              className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-[0.5rem] border text-m-label font-bold text-m-body press"
              style={{ borderColor: "var(--color-line)", color: canTerminate ? "var(--color-stop)" : "var(--color-ink-700)" }}
            >
              {canActivate ? <PlayCircle className="size-3.5" /> : <XIcon className="size-3.5" />}
              {canActivate ? "Activate" : "Terminate"}
            </button>
          ) : null}
        </div>
      </ActionBar>

      {/* ── Manage actions ── */}
      {(canEdit || canEscalate || canGenerateSchedule || canUploadDraft || canChangeTenant) ? (
        <div className="grid grid-cols-4 gap-2 mb-3">
          {canEdit ? (
            <button
              onClick={() => setShowEdit(true)}
              className="flex flex-col items-center justify-center gap-1 h-14 rounded-[0.5rem] border text-m-caption font-bold text-m-body press"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-700)" }}
            >
              <Pencil className="size-3.5" />
              Edit
            </button>
          ) : null}
          {canEscalate ? (
            <button
              onClick={() => setShowEscalate(true)}
              className="flex flex-col items-center justify-center gap-1 h-14 rounded-[0.5rem] border text-m-caption font-bold text-m-body press"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-700)" }}
            >
              <TrendingUp className="size-3.5" />
              Escalate
            </button>
          ) : null}
          {canGenerateSchedule ? (
            <button
              onClick={() => setShowSchedule(true)}
              className="flex flex-col items-center justify-center gap-1 h-14 rounded-[0.5rem] border text-m-caption font-bold text-m-body press"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-700)" }}
            >
              <CalendarClock className="size-3.5" />
              Schedule
            </button>
          ) : null}
          {canChangeTenant ? (
            <button
              onClick={() => setShowChangeTenant(true)}
              className="flex flex-col items-center justify-center gap-1 h-14 rounded-[0.5rem] border text-m-caption font-bold text-m-body press"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-700)" }}
            >
              <UserCog className="size-3.5" />
              Change
            </button>
          ) : null}
          {canUploadDraft ? (
            <button
              onClick={() => setShowUploadDraft(true)}
              className="flex flex-col items-center justify-center gap-1 h-14 rounded-[0.5rem] border text-m-caption font-bold text-m-body press"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-700)" }}
            >
              <FileUp className="size-3.5" />
              Draft
            </button>
          ) : null}
        </div>
      ) : null}

      {/* ── Lease terms card ── */}
      <div
        className="rounded-[0.5rem] border mb-3 overflow-hidden"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <div className="px-3 py-2" style={{ borderBottom: "1px solid var(--color-line)" }}>
          <p className="text-m-caption font-bold uppercase tracking-wide" style={{ color: "var(--color-ink-600)" }}>
            Lease Terms
          </p>
        </div>
        <div className="p-3 grid grid-cols-2 gap-3">
          <Field icon={<Calendar className="size-2.5" />} label="Start" value={formatDate(data.startDate)} />
          <Field icon={<Calendar className="size-2.5" />} label="End" value={formatDate(data.endDate)} />
          <Field icon={<IndianRupee className="size-2.5" />} label="Monthly Rent" value={formatCurrency(data.monthlyRent)} />
          <Field icon={<Wallet className="size-2.5" />} label="Deposit" value={formatCurrency(data.securityDeposit)} />
          {data.rentAgreementNo ? (
            <Field icon={<FileText className="size-2.5" />} label="Agreement No" value={data.rentAgreementNo} mono />
          ) : null}
          {data.rentFreeDays > 0 ? (
            <Field icon={<Clock className="size-2.5" />} label="Rent-free" value={`${data.rentFreeDays} days`} />
          ) : null}
          {data.escalationPercent != null ? (
            <Field icon={<Calendar className="size-2.5" />} label="Escalation" value={`${data.escalationPercent}% / ${data.escalationIntervalMonths}mo`} />
          ) : null}
          {data.sacCode ? (
            <Field icon={<FileText className="size-2.5" />} label="SAC Code" value={data.sacCode} mono />
          ) : null}
          <Field
            icon={<Clock className="size-2.5" />}
            label="Lease Duration"
            value={`${data.leaseMonths} months`}
          />
          {data.assetArea ? (
            <Field
              icon={<AssetIcon className="size-2.5" />}
              label="Asset Area"
              value={`${formatNumber(data.assetArea, 0)} ${data.assetAreaUnit ?? ""}`}
            />
          ) : null}
          <Field
            icon={<Calendar className="size-2.5" />}
            label="Expiry"
            value={data.daysToExpiry < 0 ? `${Math.abs(data.daysToExpiry)}d ago` : `in ${data.daysToExpiry}d`}
            valueColor={data.daysToExpiry <= 30 && data.daysToExpiry >= 0 ? "var(--color-signal)" : data.daysToExpiry < 0 ? "var(--color-stop)" : undefined}
          />
        </div>
        {data.notes ? (
          <div className="px-3 pb-3">
            <p className="text-m-caption font-semibold uppercase mb-0.5" style={{ color: "var(--color-ink-500)" }}>
              Notes
            </p>
            <p className="text-m-label" style={{ color: "var(--color-ink-700)" }}>
              {data.notes}
            </p>
          </div>
        ) : null}
        {/* Draft / LOI info */}
        {data.draftNotes ? (
          <div className="px-3 pb-3">
            <p className="text-m-caption font-semibold uppercase mb-0.5" style={{ color: "var(--color-ink-500)" }}>
              Draft / LOI {data.draftDate ? `· ${formatDate(data.draftDate)}` : ""}
            </p>
            <p className="text-m-label whitespace-pre-wrap" style={{ color: "var(--color-ink-700)" }}>
              {data.draftNotes}
            </p>
          </div>
        ) : null}
        {/* Print Draft / LOI */}
        <div className="px-3 pb-3">
          <a
            href={`/print/tenancy-draft/${data.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-m-caption font-semibold"
            style={{ color: "var(--color-brand)" }}
          >
            <Printer className="size-3" /> Print Draft / LOI
          </a>
        </div>

        {/* Rent Agreement Document */}
        <div className="px-3 pb-3" style={{ borderTop: "1px solid var(--color-line)" }}>
          <div className="flex items-center justify-between pt-2 mb-1">
            <p className="text-m-caption font-bold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
              Rent Agreement
            </p>
            {data.rentAgreementDocumentUrl ? (
              <span className="text-m-caption font-bold uppercase" style={{ color: "var(--color-go)" }}>
                Uploaded
              </span>
            ) : (
              <span className="text-m-caption font-bold uppercase" style={{ color: "var(--color-ink-400)" }}>
                Not uploaded
              </span>
            )}
          </div>
          {data.rentAgreementDocumentUrl ? (
            <a
              href={data.rentAgreementDocumentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-m-caption text-m-body press"
              style={{ color: "var(--color-ink-600)" }}
            >
              <ExternalLink className="size-2.5" />
              <span className="truncate">{data.rentAgreementDocumentName || "View agreement"}</span>
            </a>
          ) : null}
          {canManage && data.status !== "TERMINATED" ? (
            <div className="mt-1.5">
              <MobileDocUploader
                url={data.rentAgreementDocumentUrl ?? ""}
                fileName={data.rentAgreementDocumentName}
                label={data.rentAgreementDocumentUrl ? "Replace Agreement" : "Upload Agreement"}
                onUpload={(url, name) => uploadAgreement(url, name)}
              />
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Tenant contact ── */}
      <div
        className="rounded-[0.5rem] border mb-3 overflow-hidden"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <div className="px-3 py-2" style={{ borderBottom: "1px solid var(--color-line)" }}>
          <p className="text-m-caption font-bold uppercase tracking-wide" style={{ color: "var(--color-ink-600)" }}>
            Tenant
          </p>
        </div>
        <div className="p-3 grid grid-cols-2 gap-3">
          <Field icon={<User className="size-2.5" />} label="Name" value={data.tenantName} />
          <Field icon={<Phone className="size-2.5" />} label="Phone" value={data.tenantPhone} />
          {data.tenantEmail ? (
            <Field icon={<Mail className="size-2.5" />} label="Email" value={data.tenantEmail} />
          ) : null}
          {data.customerName ? (
            <div>
              <p className="text-m-caption font-semibold uppercase flex items-center gap-0.5" style={{ color: "var(--color-ink-500)" }}>
                <User className="size-2.5" />
                CRM Customer
              </p>
              <Link
                href={`/m/customers/${data.customerId}`}
                className="text-m-label font-bold leading-tight mt-0.5 underline"
                style={{ color: "var(--color-ink-950)" }}
              >
                {data.customerName}
              </Link>
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Payment history ── */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-m-caption font-bold uppercase tracking-wide" style={{ color: "var(--color-ink-600)" }}>
            Payment History ({data.payments.length})
          </p>
          {canRecordPayment ? (
            <button
              onClick={() => setShowPayment(true)}
              className="text-m-caption font-bold flex items-center gap-0.5 text-m-body press"
              style={{ color: "var(--color-ink-700)" }}
            >
              <Plus className="size-2.5" />
              Add
            </button>
          ) : null}
        </div>

        {data.payments.length === 0 ? (
          <MobileEmptyState icon={Banknote} title="No payments recorded" size="compact" />
        ) : (
          <div className="flex flex-col gap-1.5">
            {data.payments.map((p) => {
              const pMeta = PAYMENT_STATUS_META[p.status] ?? { color: "var(--color-ink-500)", label: p.status, icon: null };
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-2 rounded-[0.5rem] border px-2.5 py-2"
                  style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
                >
                  <div className="shrink-0" style={{ color: pMeta.color }}>
                    {pMeta.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-m-body font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                      {formatCurrency(p.amount)}
                    </p>
                    <p className="text-m-caption truncate" style={{ color: "var(--color-ink-500)" }}>
                      Due {formatDate(p.dueDate)}
                      {p.status === "RECEIVED" ? ` · Paid ${formatDate(p.paymentDate)}` : ""}
                      {p.reference ? ` · ${p.reference}` : ""}
                      {" · "}{p.mode}
                    </p>
                  </div>
                  <span
                    className="text-m-caption font-bold uppercase px-1.5 py-0.5 rounded-full shrink-0"
                    style={{ color: pMeta.color, backgroundColor: `color-mix(in srgb, ${pMeta.color} 12%, transparent)` }}
                  >
                    {pMeta.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Payment sheet ── */}
      {showPayment ? (
        <PaymentSheet
          tenancyId={data.id}
          monthlyRent={data.monthlyRent}
          onClose={() => setShowPayment(false)}
          onSuccess={() => {
            setShowPayment(false);
            router.refresh();
          }}
        />
      ) : null}

      {/* ── Action sheet (activate/terminate) ── */}
      {showAction ? (
        <ActionSheet
          action={canActivate ? "activate" : "terminate"}
          tenantName={data.tenantName}
          acting={acting}
          onConfirm={canActivate ? handleActivate : handleTerminate}
          onClose={() => setShowAction(false)}
        />
      ) : null}

      {/* ── Edit sheet ── */}
      {showEdit ? (
        <EditSheet
          data={data}
          acting={acting}
          onSave={handleEdit}
          onClose={() => setShowEdit(false)}
        />
      ) : null}

      {/* ── Escalate sheet ── */}
      {showEscalate ? (
        <EscalateSheet
          tenantName={data.tenantName}
          currentRent={data.monthlyRent}
          escalationPercent={data.escalationPercent}
          escalationIntervalMonths={data.escalationIntervalMonths}
          acting={acting}
          onConfirm={handleEscalate}
          onClose={() => setShowEscalate(false)}
        />
      ) : null}

      {/* ── Generate schedule sheet ── */}
      {showSchedule ? (
        <GenerateScheduleSheet
          acting={acting}
          onConfirm={handleGenerateSchedule}
          onClose={() => setShowSchedule(false)}
        />
      ) : null}

      {/* ── Upload draft sheet ── */}
      {showUploadDraft ? (
        <UploadDraftSheet
          acting={acting}
          onSave={handleUploadDraft}
          onClose={() => setShowUploadDraft(false)}
        />
      ) : null}

      {/* ── Change tenant sheet ── */}
      {showChangeTenant ? (
        <ChangeTenantSheet
          acting={acting}
          onSave={handleChangeTenant}
          onClose={() => setShowChangeTenant(false)}
        />
      ) : null}
    </div>
  );
}

/* ─── Field ─── */
function Field({
  icon, label, value, mono, valueColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  mono?: boolean;
  valueColor?: string;
}) {
  return (
    <div>
      <p className="text-m-caption font-semibold uppercase flex items-center gap-0.5" style={{ color: "var(--color-ink-500)" }}>
        {icon}
        {label}
      </p>
      <p
        className={`text-m-label font-bold leading-tight mt-0.5 ${mono ? "font-mono tabular-nums" : ""}`}
        style={{ color: valueColor ?? (value ? "var(--color-ink-950)" : "var(--color-ink-300)") }}
      >
        {value ?? "—"}
      </p>
    </div>
  );
}

/* ─── Payment recording sheet ─── */
function PaymentSheet({
  tenancyId, monthlyRent, onClose, onSuccess,
}: {
  tenancyId: string;
  monthlyRent: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [amount, setAmount] = useState(String(monthlyRent));
  const [paymentDate, setPaymentDate] = useTodayDateState();
  const [dueDate, setDueDate] = useTodayDateState();
  const [mode, setMode] = useState("BANK");
  const [reference, setReference] = useState("");
  const [tdsAmount, setTdsAmount] = useState("");
  const [tdsCert, setTdsCert] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/tenancies/${tenancyId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amt,
          paymentDate,
          dueDate,
          mode,
          reference: reference || undefined,
          tdsAmount: tdsAmount ? Number(tdsAmount) : undefined,
          tdsCertificateNo: tdsCert || undefined,
          periodStart: periodStart || undefined,
          periodEnd: periodEnd || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to record payment");
      }
      toast.success("Payment recorded");
      onSuccess();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <MobileDialog open={true} onClose={onClose} title="Record Rent Payment">
        <div className="p-3 flex flex-col gap-3">

          <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
            <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
              Payment Details
            </p>

            {/* Amount */}
            <div>
              <label className="text-m-caption font-semibold uppercase block mb-1" style={{ color: "var(--color-ink-500)" }}>
                Amount (₹)
              </label>
              <input
                type="text" inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full h-7 px-1 text-m-caption font-bold tabular-nums outline-none border-b focus:border-b-2 transition-colors"
                style={{ backgroundColor: "transparent" }}
              />
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
              <div>
                <label className="text-m-caption font-semibold uppercase block mb-1" style={{ color: "var(--color-ink-500)" }}>
                  Payment Date
                </label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
                  style={{ backgroundColor: "transparent" }}
                />
              </div>
              <div className="pl-2">
                <label className="text-m-caption font-semibold uppercase block mb-1" style={{ color: "var(--color-ink-500)" }}>
                  Due Date
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
                  style={{ backgroundColor: "transparent" }}
                />
              </div>
            </div>

            {/* Mode */}
            <div>
              <label className="text-m-caption font-semibold uppercase block mb-1" style={{ color: "var(--color-ink-500)" }}>
                Payment Mode
              </label>
              <div className="flex gap-1">
                {PAYMENT_MODES.map((m) => (
                  <button
                    key={m.value}
                    onClick={() => setMode(m.value)}
                    className="flex-1 h-8 rounded-[0.5rem] text-m-caption font-bold text-m-body press"
                    style={{
                      backgroundColor: mode === m.value ? "var(--color-ink-950)" : "var(--color-paper-2)",
                      color: mode === m.value ? "var(--color-paper)" : "var(--color-ink-500)",
                      border: `1px solid ${mode === m.value ? "var(--color-ink-950)" : "var(--color-line)"}`,
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Reference */}
            <div>
              <label className="text-m-caption font-semibold uppercase block mb-1" style={{ color: "var(--color-ink-500)" }}>
                Reference (optional)
              </label>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="NEFT / UPI / Cheque no."
                className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
                style={{ backgroundColor: "transparent" }}
              />
            </div>
          </div>

          <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
            <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
              TDS & Rent Period
            </p>

            {/* TDS */}
            <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
              <div>
                <label className="text-m-caption font-semibold uppercase block mb-1" style={{ color: "var(--color-ink-500)" }}>
                  TDS Deducted (₹)
                </label>
                <input
                  type="text" inputMode="decimal"
                  value={tdsAmount}
                  onChange={(e) => setTdsAmount(e.target.value)}
                  placeholder="0"
                  className="w-full h-7 px-1 text-m-caption tabular-nums outline-none border-b focus:border-b-2 transition-colors"
                  style={{ backgroundColor: "transparent" }}
                />
              </div>
              <div className="pl-2">
                <label className="text-m-caption font-semibold uppercase block mb-1" style={{ color: "var(--color-ink-500)" }}>
                  TDS Cert. No.
                </label>
                <input
                  type="text"
                  value={tdsCert}
                  onChange={(e) => setTdsCert(e.target.value)}
                  placeholder="Form 16C"
                  className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
                  style={{ backgroundColor: "transparent" }}
                />
              </div>
            </div>

            {/* Rent period */}
            <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
              <div>
                <label className="text-m-caption font-semibold uppercase block mb-1" style={{ color: "var(--color-ink-500)" }}>
                  Period Start
                </label>
                <input
                  type="date"
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                  className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
                  style={{ backgroundColor: "transparent" }}
                />
              </div>
              <div className="pl-2">
                <label className="text-m-caption font-semibold uppercase block mb-1" style={{ color: "var(--color-ink-500)" }}>
                  Period End
                </label>
                <input
                  type="date"
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                  className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
                  style={{ backgroundColor: "transparent" }}
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="flex-1 h-9 rounded-[0.5rem] border text-m-label font-bold text-m-body press"
              style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex-1 h-9 rounded-[0.5rem] text-m-label font-bold text-m-body press disabled:opacity-50"
              style={{ backgroundColor: "var(--color-go)", color: "var(--color-paper)" }}
            >
              {saving ? <Loader2 className="size-3.5 animate-spin mx-auto" /> : "Record"}
            </button>
          </div>
        </div>
    </MobileDialog>
  );
}

/* ─── Action confirmation sheet ─── */
function ActionSheet({
  action, tenantName, acting, onConfirm, onClose,
}: {
  action: "activate" | "terminate";
  tenantName: string;
  acting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const isActivate = action === "activate";
  return (
    <MobileDialog open={true} onClose={onClose} title={isActivate ? "Activate tenancy?" : "Terminate tenancy?"}>
        <div className="p-3">
          <DetailAlertBanner
            tone={isActivate ? "success" : "danger"}
            title={isActivate
              ? `This will mark ${tenantName}'s lease as active and start rent collection.`
              : `This will terminate ${tenantName}'s active lease. The asset will become available for new rentals.`}
          />
          <div className="flex flex-col gap-2">
            <button
              onClick={onClose}
              disabled={acting}
              className="flex-1 h-9 rounded-[0.5rem] border text-m-label font-bold text-m-body press"
              style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={acting}
              className="flex-1 h-9 rounded-[0.5rem] text-m-label font-bold text-m-body press disabled:opacity-50"
              style={{
                backgroundColor: isActivate ? "var(--color-go)" : "var(--color-stop)",
                color: "var(--color-paper)",
              }}
            >
              {acting ? <Loader2 className="size-3.5 animate-spin mx-auto" /> : isActivate ? "Activate" : "Terminate"}
            </button>
          </div>
        </div>
    </MobileDialog>
  );
}

/* ─── Shared sheet shell ─── */
function SheetShell({
  title, onClose, children, acting, onSubmit, submitLabel,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  acting: boolean;
  onSubmit: () => void;
  submitLabel: string;
}) {
  return (
    <MobileDialog open={true} onClose={onClose} title={title}>
        <div className="p-3">
          {children}
          <div className="flex gap-2 mt-3">
            <button
              onClick={onClose}
              disabled={acting}
              className="flex-1 h-9 rounded-[0.5rem] border text-m-label font-bold text-m-body press"
              style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
            >
              Cancel
            </button>
            <button
              onClick={onSubmit}
              disabled={acting}
              className="flex-1 h-9 rounded-[0.5rem] text-m-label font-bold text-m-body press disabled:opacity-50"
              style={{ backgroundColor: "var(--color-go)", color: "var(--color-paper)" }}
            >
              {acting ? <Loader2 className="size-3.5 animate-spin mx-auto" /> : submitLabel}
            </button>
          </div>
        </div>
    </MobileDialog>
  );
}

/* ─── Edit sheet ─── */
function EditSheet({
  data, acting, onSave, onClose,
}: {
  data: TenancyData;
  acting: boolean;
  onSave: (payload: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const [tenantName, setTenantName] = useState(data.tenantName);
  const [tenantPhone, setTenantPhone] = useState(data.tenantPhone ?? "");
  const [tenantEmail, setTenantEmail] = useState(data.tenantEmail ?? "");
  const [startDate, setStartDate] = useState(data.startDate.slice(0, 10));
  const [endDate, setEndDate] = useState(data.endDate.slice(0, 10));
  const [monthlyRent, setMonthlyRent] = useState(String(data.monthlyRent));
  const [securityDeposit, setSecurityDeposit] = useState(String(data.securityDeposit));
  const [rentAgreementNo, setRentAgreementNo] = useState(data.rentAgreementNo ?? "");
  const [escalationPercent, setEscalationPercent] = useState(
    data.escalationPercent != null ? String(data.escalationPercent) : ""
  );
  const [rentFreeDays, setRentFreeDays] = useState(String(data.rentFreeDays));
  const [notes, setNotes] = useState(data.notes ?? "");

  const submit = () => {
    if (!tenantName.trim()) {
      toast.error("Tenant name is required");
      return;
    }
    if (!startDate || !endDate) {
      toast.error("Start and end dates are required");
      return;
    }
    const rent = parseFloat(monthlyRent);
    if (!rent || rent <= 0) {
      toast.error("Monthly rent must be greater than 0");
      return;
    }
    onSave({
      tenantName: tenantName.trim(),
      tenantPhone: tenantPhone.trim() || null,
      tenantEmail: tenantEmail.trim() || null,
      startDate,
      endDate,
      monthlyRent: rent,
      securityDeposit: securityDeposit ? Number(securityDeposit) : 0,
      rentAgreementNo: rentAgreementNo.trim() || null,
      escalationPercent: escalationPercent ? Number(escalationPercent) : null,
      rentFreeDays: rentFreeDays ? Number(rentFreeDays) : 0,
      notes: notes.trim() || null,
    });
  };

  return (
    <SheetShell title="Edit Tenancy" onClose={onClose} acting={acting} onSubmit={submit} submitLabel="Save">
      <div className="mb-3">
        <label className="text-m-caption font-semibold uppercase block mb-1" style={{ color: "var(--color-ink-500)" }}>
          Tenant Name
        </label>
        <input
          type="text"
          value={tenantName}
          onChange={(e) => setTenantName(e.target.value)}
          className="w-full h-7 px-1 text-m-caption font-bold outline-none border-b focus:border-b-2 transition-colors"
          style={{ backgroundColor: "transparent" }}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <label className="text-m-caption font-semibold uppercase block mb-1" style={{ color: "var(--color-ink-500)" }}>
            Phone
          </label>
          <input
            type="text"
            value={tenantPhone}
            onChange={(e) => setTenantPhone(e.target.value)}
            className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
            style={{ backgroundColor: "transparent" }}
          />
        </div>
        <div>
          <label className="text-m-caption font-semibold uppercase block mb-1" style={{ color: "var(--color-ink-500)" }}>
            Email
          </label>
          <input
            type="email"
            value={tenantEmail}
            onChange={(e) => setTenantEmail(e.target.value)}
            className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
            style={{ backgroundColor: "transparent" }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <label className="text-m-caption font-semibold uppercase block mb-1" style={{ color: "var(--color-ink-500)" }}>
            Start Date
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
            style={{ backgroundColor: "transparent" }}
          />
        </div>
        <div>
          <label className="text-m-caption font-semibold uppercase block mb-1" style={{ color: "var(--color-ink-500)" }}>
            End Date
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
            style={{ backgroundColor: "transparent" }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <label className="text-m-caption font-semibold uppercase block mb-1" style={{ color: "var(--color-ink-500)" }}>
            Monthly Rent (₹)
          </label>
          <input
            type="text" inputMode="decimal"
            value={monthlyRent}
            onChange={(e) => setMonthlyRent(e.target.value)}
            className="w-full h-7 px-1 text-m-caption tabular-nums outline-none border-b focus:border-b-2 transition-colors"
            style={{ backgroundColor: "transparent" }}
          />
        </div>
        <div>
          <label className="text-m-caption font-semibold uppercase block mb-1" style={{ color: "var(--color-ink-500)" }}>
            Deposit (₹)
          </label>
          <input
            type="text" inputMode="decimal"
            value={securityDeposit}
            onChange={(e) => setSecurityDeposit(e.target.value)}
            className="w-full h-7 px-1 text-m-caption tabular-nums outline-none border-b focus:border-b-2 transition-colors"
            style={{ backgroundColor: "transparent" }}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <div>
          <label className="text-m-caption font-semibold uppercase block mb-1" style={{ color: "var(--color-ink-500)" }}>
            Escalation %
          </label>
          <input
            type="text" inputMode="decimal"
            value={escalationPercent}
            onChange={(e) => setEscalationPercent(e.target.value)}
            placeholder="0"
            className="w-full h-7 px-1 text-m-caption tabular-nums outline-none border-b focus:border-b-2 transition-colors"
            style={{ backgroundColor: "transparent" }}
          />
        </div>
        <div>
          <label className="text-m-caption font-semibold uppercase block mb-1" style={{ color: "var(--color-ink-500)" }}>
            Rent-free Days
          </label>
          <input
            type="text" inputMode="numeric"
            value={rentFreeDays}
            onChange={(e) => setRentFreeDays(e.target.value)}
            className="w-full h-7 px-1 text-m-caption tabular-nums outline-none border-b focus:border-b-2 transition-colors"
            style={{ backgroundColor: "transparent" }}
          />
        </div>
        <div>
          <label className="text-m-caption font-semibold uppercase block mb-1" style={{ color: "var(--color-ink-500)" }}>
            Agreement No
          </label>
          <input
            type="text"
            value={rentAgreementNo}
            onChange={(e) => setRentAgreementNo(e.target.value)}
            className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
            style={{ backgroundColor: "transparent" }}
          />
        </div>
      </div>

      <div className="mb-3">
        <label className="text-m-caption font-semibold uppercase block mb-1" style={{ color: "var(--color-ink-500)" }}>
          Notes
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full px-1 py-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors resize-none"
          style={{ backgroundColor: "transparent" }}
        />
      </div>
    </SheetShell>
  );
}

/* ─── Escalate sheet ─── */
function EscalateSheet({
  tenantName, currentRent, escalationPercent, escalationIntervalMonths, acting, onConfirm, onClose,
}: {
  tenantName: string;
  currentRent: number;
  escalationPercent: number | null;
  escalationIntervalMonths: number;
  acting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const projectedRent = escalationPercent != null
    ? Math.round(currentRent * (1 + escalationPercent / 100))
    : currentRent;
  return (
    <MobileDialog open={true} onClose={onClose} title="Apply rent escalation?">
        <div className="p-3">
          <DetailAlertBanner
            tone="warning"
            title={`${tenantName}'s rent will be escalated by ${escalationPercent ?? 0}% (every ${escalationIntervalMonths} months).`}
          >
            <p className="text-m-label font-bold tabular-nums mt-0.5" style={{ color: "var(--color-ink-950)" }}>
              {formatCurrency(currentRent)} → {formatCurrency(projectedRent)}
            </p>
          </DetailAlertBanner>
          <div className="flex flex-col gap-2">
            <button
              onClick={onClose}
              disabled={acting}
              className="flex-1 h-9 rounded-[0.5rem] border text-m-label font-bold text-m-body press"
              style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={acting}
              className="flex-1 h-9 rounded-[0.5rem] text-m-label font-bold text-m-body press disabled:opacity-50"
              style={{ backgroundColor: "var(--color-signal)", color: "var(--color-paper)" }}
            >
              {acting ? <Loader2 className="size-3.5 animate-spin mx-auto" /> : "Escalate"}
            </button>
          </div>
        </div>
    </MobileDialog>
  );
}

/* ─── Generate schedule sheet ─── */
function GenerateScheduleSheet({
  acting, onConfirm, onClose,
}: {
  acting: boolean;
  onConfirm: (monthsAhead?: number) => void;
  onClose: () => void;
}) {
  const [monthsAhead, setMonthsAhead] = useState("12");
  const submit = () => {
    const m = parseInt(monthsAhead, 10);
    onConfirm(m > 0 ? m : undefined);
  };
  return (
    <SheetShell title="Generate Payment Schedule" onClose={onClose} acting={acting} onSubmit={submit} submitLabel="Generate">
      <div className="mb-3">
        <label className="text-m-caption font-semibold uppercase block mb-1" style={{ color: "var(--color-ink-500)" }}>
          Months Ahead
        </label>
        <input
          type="text" inputMode="numeric"
          value={monthsAhead}
          onChange={(e) => setMonthsAhead(e.target.value)}
          className="w-full h-7 px-1 text-m-caption font-bold tabular-nums outline-none border-b focus:border-b-2 transition-colors"
          style={{ backgroundColor: "transparent" }}
        />
        <p className="text-m-caption mt-1" style={{ color: "var(--color-ink-500)" }}>
          Generates rent due reminders for the next N months based on the monthly rent.
        </p>
      </div>
    </SheetShell>
  );
}

/* ─── Upload draft sheet ─── */
function UploadDraftSheet({
  acting, onSave, onClose,
}: {
  acting: boolean;
  onSave: (payload: { documentUrl?: string; documentName?: string; draftNotes?: string; draftDate?: string }) => void;
  onClose: () => void;
}) {
  const [documentUrl, setDocumentUrl] = useState("");
  const [documentName, setDocumentName] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const [draftDate, setDraftDate] = useTodayDateState();

  const submit = () => {
    if (!documentUrl && !draftNotes.trim()) {
      toast.error("Upload a draft document or enter draft notes");
      return;
    }
    onSave({
      documentUrl: documentUrl || undefined,
      documentName: documentName || undefined,
      draftNotes: draftNotes.trim() || undefined,
      draftDate: draftDate || undefined,
    });
  };

  return (
    <SheetShell title="Upload Draft / LOI" onClose={onClose} acting={acting} onSubmit={submit} submitLabel="Save">
      <div className="mb-3">
        <label className="text-m-caption font-semibold uppercase block mb-1" style={{ color: "var(--color-ink-500)" }}>
          Document
        </label>
        <MobileDocUploader
          url={documentUrl}
          fileName={documentName}
          label="Upload Draft Document"
          onUpload={(url, name) => {
            setDocumentUrl(url);
            setDocumentName(name);
          }}
        />
      </div>
      <div className="mb-3">
        <label className="text-m-caption font-semibold uppercase block mb-1" style={{ color: "var(--color-ink-500)" }}>
          Draft Date
        </label>
        <input
          type="date"
          value={draftDate}
          onChange={(e) => setDraftDate(e.target.value)}
          className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
          style={{ backgroundColor: "transparent" }}
        />
      </div>
      <div className="mb-3">
        <label className="text-m-caption font-semibold uppercase block mb-1" style={{ color: "var(--color-ink-500)" }}>
          Draft Notes
        </label>
        <textarea
          value={draftNotes}
          onChange={(e) => setDraftNotes(e.target.value)}
          rows={3}
          placeholder="Terms, conditions, LOI details…"
          className="w-full px-1 py-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors resize-none"
          style={{ backgroundColor: "transparent" }}
        />
      </div>
    </SheetShell>
  );
}

/* ─── Change tenant sheet ─── */
function ChangeTenantSheet({
  acting, onSave, onClose,
}: {
  acting: boolean;
  onSave: (payload: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const [newTenantName, setNewTenantName] = useState("");
  const [newTenantPhone, setNewTenantPhone] = useState("");
  const [newTenantEmail, setNewTenantEmail] = useState("");
  const [newStartDate, setNewStartDate] = useTodayDateState();
  const [newEndDate, setNewEndDate] = useState("");
  const [newMonthlyRent, setNewMonthlyRent] = useState("");
  const [newSecurityDeposit, setNewSecurityDeposit] = useState("");
  const [notes, setNotes] = useState("");

  const submit = () => {
    if (!newTenantName.trim()) {
      toast.error("New tenant name is required");
      return;
    }
    const payload: Record<string, unknown> = {
      newTenantName: newTenantName.trim(),
      newTenantPhone: newTenantPhone.trim() || null,
      newTenantEmail: newTenantEmail.trim() || null,
      newStartDate: newStartDate || undefined,
      newEndDate: newEndDate || undefined,
      notes: notes.trim() || null,
    };
    if (newMonthlyRent) payload.newMonthlyRent = Number(newMonthlyRent);
    if (newSecurityDeposit) payload.newSecurityDeposit = Number(newSecurityDeposit);
    onSave(payload);
  };

  return (
    <SheetShell title="Change Tenant" onClose={onClose} acting={acting} onSubmit={submit} submitLabel="Change Tenant">
      <DetailAlertBanner
        tone="warning"
        title="This will end the current tenancy and create a new one for the new tenant on the same asset."
      />
      <div className="mb-3">
        <label className="text-m-caption font-semibold uppercase block mb-1" style={{ color: "var(--color-ink-500)" }}>
          New Tenant Name
        </label>
        <input
          type="text"
          value={newTenantName}
          onChange={(e) => setNewTenantName(e.target.value)}
          className="w-full h-7 px-1 text-m-caption font-bold outline-none border-b focus:border-b-2 transition-colors"
          style={{ backgroundColor: "transparent" }}
        />
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <label className="text-m-caption font-semibold uppercase block mb-1" style={{ color: "var(--color-ink-500)" }}>
            Phone
          </label>
          <input
            type="text"
            value={newTenantPhone}
            onChange={(e) => setNewTenantPhone(e.target.value)}
            className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
            style={{ backgroundColor: "transparent" }}
          />
        </div>
        <div>
          <label className="text-m-caption font-semibold uppercase block mb-1" style={{ color: "var(--color-ink-500)" }}>
            Email
          </label>
          <input
            type="email"
            value={newTenantEmail}
            onChange={(e) => setNewTenantEmail(e.target.value)}
            className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
            style={{ backgroundColor: "transparent" }}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <label className="text-m-caption font-semibold uppercase block mb-1" style={{ color: "var(--color-ink-500)" }}>
            New Start Date
          </label>
          <input
            type="date"
            value={newStartDate}
            onChange={(e) => setNewStartDate(e.target.value)}
            className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
            style={{ backgroundColor: "transparent" }}
          />
        </div>
        <div>
          <label className="text-m-caption font-semibold uppercase block mb-1" style={{ color: "var(--color-ink-500)" }}>
            New End Date
          </label>
          <input
            type="date"
            value={newEndDate}
            onChange={(e) => setNewEndDate(e.target.value)}
            className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
            style={{ backgroundColor: "transparent" }}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <label className="text-m-caption font-semibold uppercase block mb-1" style={{ color: "var(--color-ink-500)" }}>
            Monthly Rent (₹)
          </label>
          <input
            type="text" inputMode="decimal"
            value={newMonthlyRent}
            onChange={(e) => setNewMonthlyRent(e.target.value)}
            placeholder="Same as before"
            className="w-full h-7 px-1 text-m-caption tabular-nums outline-none border-b focus:border-b-2 transition-colors"
            style={{ backgroundColor: "transparent" }}
          />
        </div>
        <div>
          <label className="text-m-caption font-semibold uppercase block mb-1" style={{ color: "var(--color-ink-500)" }}>
            Deposit (₹)
          </label>
          <input
            type="text" inputMode="decimal"
            value={newSecurityDeposit}
            onChange={(e) => setNewSecurityDeposit(e.target.value)}
            placeholder="Same as before"
            className="w-full h-7 px-1 text-m-caption tabular-nums outline-none border-b focus:border-b-2 transition-colors"
            style={{ backgroundColor: "transparent" }}
          />
        </div>
      </div>
      <div className="mb-3">
        <label className="text-m-caption font-semibold uppercase block mb-1" style={{ color: "var(--color-ink-500)" }}>
          Notes
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full px-1 py-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors resize-none"
          style={{ backgroundColor: "transparent" }}
        />
      </div>
    </SheetShell>
  );
}
