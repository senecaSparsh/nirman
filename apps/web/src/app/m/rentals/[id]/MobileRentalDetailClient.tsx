"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Phone, Mail, KeyRound, Calendar, FileText,
  IndianRupee, Wallet, AlertCircle, Home, Maximize, Clock,
  CheckCircle2, Plus, Loader2, Banknote, User,
  PlayCircle, XCircle as XIcon,
} from "lucide-react";
import { MobileBackButton } from "@/components/mobile/v2/mobile-back-button";
import { formatCurrency, formatCurrencyCompact, formatDate, formatNumber } from "@/lib/utils";
import { toast } from "sonner";

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
  notes: string | null;
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
  const [acting, setActing] = useState(false);

  if (notFound || !data) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-3">
          <MobileBackButton fallback="/m/rentals" className="shrink-0" style={{ color: "var(--color-ink-700)" }} />
          <p className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
            Tenancy not found
          </p>
        </div>
        <div
          className="flex flex-col items-center justify-center rounded-[0.5rem] border py-8 text-center"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
        >
          <KeyRound className="size-6 mb-2" style={{ color: "var(--color-ink-300)" }} />
          <p className="text-[0.75rem] font-semibold" style={{ color: "var(--color-ink-700)" }}>
            Tenancy not found
          </p>
        </div>
      </div>
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

  return (
    <div className="pb-6">
      {/* ── Header ── */}
      <div className="flex items-center gap-2 mb-3">
        <MobileBackButton fallback="/m/rentals" className="shrink-0" style={{ color: "var(--color-ink-700)" }} />
        <div className="flex-1 min-w-0">
          <p className="text-[0.875rem] font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
            {data.tenantName}
          </p>
          <p className="text-[0.5rem] flex items-center gap-0.5" style={{ color: "var(--color-ink-500)" }}>
            <AssetIcon className="size-2.5" />
            {data.builtUnitId ? (
              <Link href={`/m/units/${data.builtUnitId}`} className="underline underline-offset-2 press">
                {data.assetLabel}
              </Link>
            ) : data.landPurchaseId ? (
              <Link href={`/m/land/${data.landPurchaseId}`} className="underline underline-offset-2 press">
                {data.assetLabel}
              </Link>
            ) : (
              <span>{data.assetLabel}</span>
            )}{data.projectName ? ` · ${data.projectName}` : ""}
          </p>
        </div>
        <span
          className="flex items-center gap-0.5 text-[0.375rem] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full shrink-0"
          style={{ color: meta.color, backgroundColor: `color-mix(in srgb, ${meta.color} 12%, transparent)` }}
        >
          {meta.label}
        </span>
      </div>

      {/* ── Income summary banner ── */}
      <div
        className="rounded-[0.625rem] border mb-3 overflow-hidden"
        style={{
          borderColor: data.overdueAmount > 0 ? "var(--color-signal)" : "var(--color-line)",
          backgroundColor: "var(--color-paper)",
        }}
      >
        <div className="p-3">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-[0.4375rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
                Monthly Rent
              </p>
              <p className="text-[1.25rem] font-bold tabular-nums leading-tight" style={{ color: "var(--color-ink-950)" }}>
                {formatCurrency(data.monthlyRent)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[0.4375rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
                Collected
              </p>
              <p className="text-[0.875rem] font-bold tabular-nums" style={{ color: "var(--color-go)" }}>
                {formatCurrencyCompact(data.totalReceived)}
              </p>
            </div>
          </div>

          {/* Collection progress bar */}
          <div className="flex h-1.5 rounded-full overflow-hidden mb-2" style={{ backgroundColor: "var(--color-paper-2)" }}>
            <div style={{ width: `${collectionPct}%`, backgroundColor: "var(--color-go)" }} />
          </div>

          <div className="flex items-center gap-3 text-[0.5rem] font-semibold">
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

      {/* ── Quick actions ── */}
      <div className="flex gap-2 mb-3">
        {data.tenantPhone ? (
          <a
            href={`tel:${data.tenantPhone}`}
            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-[0.5rem] text-[0.625rem] font-bold press"
            style={{ backgroundColor: "var(--color-go)", color: "var(--color-paper)" }}
          >
            <Phone className="size-3.5" />
            Call Tenant
          </a>
        ) : null}
        {canRecordPayment ? (
          <button
            onClick={() => setShowPayment(true)}
            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-[0.5rem] border text-[0.625rem] font-bold press"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-700)" }}
          >
            <Plus className="size-3.5" />
            Record Rent
          </button>
        ) : null}
        {(canActivate || canTerminate) ? (
          <button
            onClick={() => setShowAction(true)}
            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-[0.5rem] border text-[0.625rem] font-bold press"
            style={{ borderColor: "var(--color-line)", color: canTerminate ? "var(--color-stop)" : "var(--color-ink-700)" }}
          >
            {canActivate ? <PlayCircle className="size-3.5" /> : <XIcon className="size-3.5" />}
            {canActivate ? "Activate" : "Terminate"}
          </button>
        ) : null}
      </div>

      {/* ── Lease terms card ── */}
      <div
        className="rounded-[0.625rem] border mb-3 overflow-hidden"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <div className="px-3 py-2" style={{ borderBottom: "1px solid var(--color-line)" }}>
          <p className="text-[0.5rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-ink-600)" }}>
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
            <p className="text-[0.375rem] font-semibold uppercase mb-0.5" style={{ color: "var(--color-ink-500)" }}>
              Notes
            </p>
            <p className="text-[0.625rem]" style={{ color: "var(--color-ink-700)" }}>
              {data.notes}
            </p>
          </div>
        ) : null}
      </div>

      {/* ── Tenant contact ── */}
      <div
        className="rounded-[0.625rem] border mb-3 overflow-hidden"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <div className="px-3 py-2" style={{ borderBottom: "1px solid var(--color-line)" }}>
          <p className="text-[0.5rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-ink-600)" }}>
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
              <p className="text-[0.375rem] font-semibold uppercase flex items-center gap-0.5" style={{ color: "var(--color-ink-500)" }}>
                <User className="size-2.5" />
                CRM Customer
              </p>
              <Link
                href={`/m/customers/${data.customerId}`}
                className="text-[0.625rem] font-bold leading-tight mt-0.5 underline"
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
          <p className="text-[0.5rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-ink-600)" }}>
            Payment History ({data.payments.length})
          </p>
          {canRecordPayment ? (
            <button
              onClick={() => setShowPayment(true)}
              className="text-[0.5rem] font-bold flex items-center gap-0.5 press"
              style={{ color: "var(--color-ink-700)" }}
            >
              <Plus className="size-2.5" />
              Add
            </button>
          ) : null}
        </div>

        {data.payments.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center rounded-[0.5rem] border py-6 text-center"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
          >
            <Banknote className="size-5 mb-1.5" style={{ color: "var(--color-ink-300)" }} />
            <p className="text-[0.625rem] font-semibold" style={{ color: "var(--color-ink-700)" }}>
              No payments recorded
            </p>
          </div>
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
                    <p className="text-[0.6875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                      {formatCurrency(p.amount)}
                    </p>
                    <p className="text-[0.4375rem] truncate" style={{ color: "var(--color-ink-500)" }}>
                      Due {formatDate(p.dueDate)}
                      {p.status === "RECEIVED" ? ` · Paid ${formatDate(p.paymentDate)}` : ""}
                      {p.reference ? ` · ${p.reference}` : ""}
                      {" · "}{p.mode}
                    </p>
                  </div>
                  <span
                    className="text-[0.375rem] font-bold uppercase px-1.5 py-0.5 rounded-full shrink-0"
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
      <p className="text-[0.375rem] font-semibold uppercase flex items-center gap-0.5" style={{ color: "var(--color-ink-500)" }}>
        {icon}
        {label}
      </p>
      <p
        className={`text-[0.625rem] font-bold leading-tight mt-0.5 ${mono ? "font-mono tabular-nums" : ""}`}
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
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [mode, setMode] = useState("BANK");
  const [reference, setReference] = useState("");
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
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0" style={{ backgroundColor: "rgba(0,0,0,0.4)" }} onClick={onClose} />
      <div
        className="relative w-full max-w-md rounded-t-[0.75rem] border-t max-h-[90vh] overflow-y-auto"
        style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }}
      >
        <div className="w-8 h-0.5 rounded-full mx-auto mt-2 mb-2" style={{ backgroundColor: "var(--color-ink-300)" }} />
        <div className="p-3">
          <p className="text-[0.75rem] font-bold mb-3" style={{ color: "var(--color-ink-950)" }}>
            Record Rent Payment
          </p>

          {/* Amount */}
          <div className="mb-3">
            <label className="text-[0.4375rem] font-semibold uppercase block mb-1" style={{ color: "var(--color-ink-500)" }}>
              Amount (₹)
            </label>
            <input
              type="text" inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full h-9 rounded-[0.5rem] border px-2.5 text-[0.75rem] font-bold tabular-nums outline-none"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
            />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div>
              <label className="text-[0.4375rem] font-semibold uppercase block mb-1" style={{ color: "var(--color-ink-500)" }}>
                Payment Date
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full h-9 rounded-[0.5rem] border px-2 text-[0.625rem] outline-none"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
              />
            </div>
            <div>
              <label className="text-[0.4375rem] font-semibold uppercase block mb-1" style={{ color: "var(--color-ink-500)" }}>
                Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full h-9 rounded-[0.5rem] border px-2 text-[0.625rem] outline-none"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
              />
            </div>
          </div>

          {/* Mode */}
          <div className="mb-3">
            <label className="text-[0.4375rem] font-semibold uppercase block mb-1" style={{ color: "var(--color-ink-500)" }}>
              Payment Mode
            </label>
            <div className="flex gap-1">
              {PAYMENT_MODES.map((m) => (
                <button
                  key={m.value}
                  onClick={() => setMode(m.value)}
                  className="flex-1 h-8 rounded-[0.375rem] text-[0.5rem] font-bold press"
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
          <div className="mb-3">
            <label className="text-[0.4375rem] font-semibold uppercase block mb-1" style={{ color: "var(--color-ink-500)" }}>
              Reference (optional)
            </label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="NEFT / UPI / Cheque no."
              className="w-full h-9 rounded-[0.5rem] border px-2.5 text-[0.625rem] outline-none"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="flex-1 h-9 rounded-[0.5rem] border text-[0.625rem] font-bold press"
              style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex-1 h-9 rounded-[0.5rem] text-[0.625rem] font-bold press disabled:opacity-50"
              style={{ backgroundColor: "var(--color-go)", color: "var(--color-paper)" }}
            >
              {saving ? <Loader2 className="size-3.5 animate-spin mx-auto" /> : "Record"}
            </button>
          </div>
        </div>
      </div>
    </div>
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
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0" style={{ backgroundColor: "rgba(0,0,0,0.4)" }} onClick={onClose} />
      <div
        className="relative w-full max-w-md rounded-t-[0.75rem] border-t"
        style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }}
      >
        <div className="w-8 h-0.5 rounded-full mx-auto mt-2 mb-2" style={{ backgroundColor: "var(--color-ink-300)" }} />
        <div className="p-3">
          <p className="text-[0.75rem] font-bold mb-2" style={{ color: "var(--color-ink-950)" }}>
            {isActivate ? "Activate tenancy?" : "Terminate tenancy?"}
          </p>
          <div
            className="rounded-[0.5rem] border p-3 mb-3"
            style={{
              borderColor: isActivate ? "var(--color-go)" : "var(--color-stop)",
              backgroundColor: `color-mix(in srgb, ${isActivate ? "var(--color-go)" : "var(--color-stop)"} 5%, transparent)`,
            }}
          >
            <p className="text-[0.625rem]" style={{ color: "var(--color-ink-700)" }}>
              {isActivate
                ? `This will mark ${tenantName}'s lease as active and start rent collection.`
                : `This will terminate ${tenantName}'s active lease. The asset will become available for new rentals.`}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={acting}
              className="flex-1 h-9 rounded-[0.5rem] border text-[0.625rem] font-bold press"
              style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={acting}
              className="flex-1 h-9 rounded-[0.5rem] text-[0.625rem] font-bold press disabled:opacity-50"
              style={{
                backgroundColor: isActivate ? "var(--color-go)" : "var(--color-stop)",
                color: "var(--color-paper)",
              }}
            >
              {acting ? <Loader2 className="size-3.5 animate-spin mx-auto" /> : isActivate ? "Activate" : "Terminate"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
