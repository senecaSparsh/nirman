"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Phone, Mail, MapPin, BadgeCheck,
  FileText, Banknote, Pencil, X, Loader2, Trash2,
} from "lucide-react";
import { formatCurrency, formatCurrencyCompact, formatDate } from "@/lib/utils";
import { mobileStatusColor } from "@/components/mobile/v2/primitives";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { useConfirm } from "@/lib/use-confirm";

type PoStatus = "DRAFT" | "APPROVED" | "ORDERED" | "PARTIAL" | "RECEIVED" | "CANCELLED";

type PoItem = {
  id: string;
  poNumber: string;
  status: PoStatus;
  total: number;
  createdAt: string;
  expectedDate: string | null;
};

type PaymentItem = {
  id: string;
  paymentNumber: string;
  amount: number;
  paymentDate: string;
  paymentMode: string;
};

const STATUS_LABELS: Record<PoStatus, string> = {
  DRAFT: "Draft",
  APPROVED: "Approved",
  ORDERED: "Ordered",
  PARTIAL: "Partial",
  RECEIVED: "Received",
  CANCELLED: "Cancelled",
};

/**
 * Supplier detail — profile card + contact actions + financial summary +
 * tabbed activity (POs / Payments).
 */
export function MobileSupplierDetailClient({
  supplierId,
  name,
  gstin,
  phone,
  email,
  address,
  leadTimeDays,
  version,
  balanceOwed,
  totalPoValue,
  totalPaid,
  poCount,
  paymentCount,
  pos,
  payments,
  canManage = false,
}: {
  supplierId: string;
  name: string;
  gstin: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  leadTimeDays: number | null;
  version: number;
  balanceOwed: number;
  totalPoValue: number;
  totalPaid: number;
  poCount: number;
  paymentCount: number;
  pos: PoItem[];
  payments: PaymentItem[];
  canManage?: boolean;
}) {
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const [tab, setTab] = useState<"pos" | "payments">("pos");
  const [showEdit, setShowEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    const ok = await confirm({
      title: `Delete supplier "${name}"?`,
      description: "This will archive the supplier. Existing POs and GRNs will remain.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/suppliers/${supplierId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete");
      haptic(10);
      toast.success("Supplier archived");
      router.push("/m/suppliers");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeleting(false);
    }
  }
  const hasDues = balanceOwed > 0;
  const accentColor = hasDues ? "var(--color-stop)" : "var(--color-go)";

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-center gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-m-section font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
            {name}
          </p>
        </div>
        {canManage ? (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowEdit(true)}
              className="flex items-center justify-center h-7 w-7 rounded-[0.375rem] text-m-body press"
              style={{ backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-700)" }}
            >
              <Pencil className="size-3.5" />
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center justify-center h-7 w-7 rounded-[0.375rem] text-m-body press"
              style={{ backgroundColor: "var(--color-paper-2)", color: "var(--color-stop)" }}
            >
              {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
            </button>
          </div>
        ) : null}
      </div>

      {/* ── Balance banner ── */}
      <div
        className="rounded-[0.5rem] border px-3 py-2.5 mb-2"
        style={{
          borderColor: hasDues ? "color-mix(in srgb, var(--color-stop) 30%, var(--color-line))" : "var(--color-line)",
          backgroundColor: hasDues
            ? "color-mix(in srgb, var(--color-stop) 6%, var(--color-paper))"
            : "var(--color-paper)",
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-m-caption font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
              Balance Owed
            </p>
            <p
              className="text-m-section font-bold tabular-nums"
              style={{ color: hasDues ? "var(--color-stop)" : "var(--color-ink-950)" }}
            >
              {formatCurrency(balanceOwed)}
            </p>
          </div>
          <span
            className="text-m-caption font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
            style={{
              color: accentColor,
              backgroundColor: `color-mix(in srgb, ${accentColor} 12%, transparent)`,
            }}
          >
            {hasDues ? "Outstanding" : "Settled"}
          </span>
        </div>
      </div>

      {/* ── Contact actions ── */}
      <div className="grid grid-cols-3 gap-1.5 mb-2">
        {phone ? (
          <a
            href={`tel:${phone}`}
            className="flex flex-col items-center rounded-[0.5rem] border py-1.5 text-m-body press"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          >
            <Phone className="size-3.5 mb-0.5" style={{ color: "var(--color-ink-700)" }} />
            <span className="text-m-caption font-bold" style={{ color: "var(--color-ink-950)" }}>Call</span>
          </a>
        ) : (
          <div
            className="flex flex-col items-center rounded-[0.5rem] border py-1.5"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)", opacity: 0.5 }}
          >
            <Phone className="size-3.5 mb-0.5" style={{ color: "var(--color-ink-300)" }} />
            <span className="text-m-caption font-bold" style={{ color: "var(--color-ink-300)" }}>No phone</span>
          </div>
        )}
        {email ? (
          <a
            href={`mailto:${email}`}
            className="flex flex-col items-center rounded-[0.5rem] border py-1.5 text-m-body press"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          >
            <Mail className="size-3.5 mb-0.5" style={{ color: "var(--color-ink-700)" }} />
            <span className="text-m-caption font-bold" style={{ color: "var(--color-ink-950)" }}>Email</span>
          </a>
        ) : (
          <div
            className="flex flex-col items-center rounded-[0.5rem] border py-1.5"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)", opacity: 0.5 }}
          >
            <Mail className="size-3.5 mb-0.5" style={{ color: "var(--color-ink-300)" }} />
            <span className="text-m-caption font-bold" style={{ color: "var(--color-ink-300)" }}>No email</span>
          </div>
        )}
        <Link
          href="/m/suppliers"
          className="flex flex-col items-center rounded-[0.5rem] border py-1.5 text-m-body press"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <FileText className="size-3.5 mb-0.5" style={{ color: "var(--color-ink-700)" }} />
          <span className="text-m-caption font-bold" style={{ color: "var(--color-ink-950)" }}>Orders</span>
        </Link>
      </div>

      {/* ── Info row ── */}
      <div
        className="rounded-[0.5rem] border overflow-hidden mb-3"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        {gstin ? (
          <div className="flex items-center gap-2 px-2.5 py-1.5" style={{ borderTop: "1px solid var(--color-line)" }}>
            <BadgeCheck className="size-3 shrink-0" style={{ color: "var(--color-ink-500)" }} />
            <span className="text-m-caption font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>GSTIN</span>
            <span className="text-m-label font-mono ml-auto truncate" style={{ color: "var(--color-ink-950)" }}>
              {gstin}
            </span>
          </div>
        ) : null}
        {phone ? (
          <div className="flex items-center gap-2 px-2.5 py-1.5" style={{ borderTop: "1px solid var(--color-line)" }}>
            <Phone className="size-3 shrink-0" style={{ color: "var(--color-ink-500)" }} />
            <span className="text-m-caption font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Phone</span>
            <span className="text-m-label font-mono ml-auto truncate" style={{ color: "var(--color-ink-950)" }}>
              {phone}
            </span>
          </div>
        ) : null}
        {address ? (
          <div className="flex items-center gap-2 px-2.5 py-1.5" style={{ borderTop: "1px solid var(--color-line)" }}>
            <MapPin className="size-3 shrink-0" style={{ color: "var(--color-ink-500)" }} />
            <span className="text-m-caption font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Address</span>
            <span className="text-m-label ml-auto truncate text-right" style={{ color: "var(--color-ink-950)" }}>
              {address}
            </span>
          </div>
        ) : null}
      </div>

      {/* ── Financial summary ── */}
      <div
        className="flex items-center justify-between rounded-[0.5rem] border px-3 py-2 mb-3"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <div>
          <p className="text-m-caption font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
            Purchase Order Value
          </p>
          <p className="text-m-section font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
            {formatCurrencyCompact(totalPoValue)}
          </p>
        </div>
        <div className="text-center">
          <p className="text-m-caption font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
            Paid
          </p>
          <p className="text-m-section font-bold tabular-nums" style={{ color: "var(--color-go)" }}>
            {formatCurrencyCompact(totalPaid)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-m-caption font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
            Owed
          </p>
          <p className="text-m-section font-bold tabular-nums" style={{ color: hasDues ? "var(--color-stop)" : "var(--color-ink-950)" }}>
            {formatCurrencyCompact(balanceOwed)}
          </p>
        </div>
      </div>

      {/* ── Tab switcher ── */}
      <div className="flex gap-1 mb-2">
        <button
          onClick={() => setTab("pos")}
          className="flex-1 rounded-[0.375rem] py-1.5 text-m-label font-bold transition-colors press"
          style={
            tab === "pos"
              ? { backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }
              : { backgroundColor: "var(--color-paper)", color: "var(--color-ink-700)", border: "1px solid var(--color-line)" }
          }
        >
          POs ({poCount})
        </button>
        <button
          onClick={() => setTab("payments")}
          className="flex-1 rounded-[0.375rem] py-1.5 text-m-label font-bold transition-colors press"
          style={
            tab === "payments"
              ? { backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }
              : { backgroundColor: "var(--color-paper)", color: "var(--color-ink-700)", border: "1px solid var(--color-line)" }
          }
        >
          Payments ({paymentCount})
        </button>
      </div>

      {/* ── Tab content ── */}
      {tab === "pos" ? <PosTab pos={pos} /> : <PaymentsTab payments={payments} />}

      {/* ── Edit sheet ── */}
      {showEdit ? (
        <SupplierEditSheet
          supplierId={supplierId}
          initialName={name}
          initialGstin={gstin ?? ""}
          initialPhone={phone ?? ""}
          initialEmail={email ?? ""}
          initialAddress={address ?? ""}
          initialLeadTimeDays={leadTimeDays != null ? String(leadTimeDays) : ""}
          version={version}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            setShowEdit(false);
            router.refresh();
          }}
        />
      ) : null}
      {confirmDialog}
    </div>
  );
}

/* ─── PO tab ─── */
function PosTab({ pos }: { pos: PoItem[] }) {
  if (pos.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-[0.5rem] border py-8 text-center"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
      >
        <FileText className="size-6 mb-2" style={{ color: "var(--color-ink-300)" }} />
        <p className="text-m-section font-semibold" style={{ color: "var(--color-ink-700)" }}>
          No purchase orders
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-[0.5rem] border overflow-hidden"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      {pos.map((po, i) => {
        const color = mobileStatusColor(po.status);
        return (
          <Link
            key={po.id}
            href={`/m/procurement/${po.id}`}
            className="flex items-center gap-2 px-2.5 py-2 text-m-body press"
            style={i > 0 ? { borderTop: "1px solid var(--color-line)" } : undefined}
          >
            {/* Status dot */}
            <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: color }} />

            <div className="min-w-0 flex-1">
              <p className="text-m-label font-mono font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
                {po.poNumber}
              </p>
              <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                {formatDate(po.createdAt)}
              </p>
            </div>

            <div className="text-right shrink-0">
              <p className="text-m-label font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                {formatCurrencyCompact(po.total)}
              </p>
              <p className="text-m-caption font-semibold" style={{ color }}>
                {STATUS_LABELS[po.status]}
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

/* ─── Payments tab ─── */
function PaymentsTab({ payments }: { payments: PaymentItem[] }) {
  if (payments.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-[0.5rem] border py-8 text-center"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
      >
        <Banknote className="size-6 mb-2" style={{ color: "var(--color-ink-300)" }} />
        <p className="text-m-section font-semibold" style={{ color: "var(--color-ink-700)" }}>
          No payments recorded
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-[0.5rem] border overflow-hidden"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      {payments.map((p, i) => (
        <div
          key={p.id}
          className="flex items-center gap-2 px-2.5 py-2"
          style={i > 0 ? { borderTop: "1px solid var(--color-line)" } : undefined}
        >
          <span
            className="grid place-items-center size-6 rounded-full shrink-0"
            style={{ backgroundColor: "color-mix(in srgb, var(--color-go) 12%, transparent)" }}
          >
            <Banknote className="size-3" style={{ color: "var(--color-go)" }} />
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-m-label font-mono font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
              {p.paymentNumber}
            </p>
            <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
              {formatDate(p.paymentDate)} · {p.paymentMode}
            </p>
          </div>

          <p className="text-m-label font-bold tabular-nums shrink-0" style={{ color: "var(--color-go)" }}>
            {formatCurrencyCompact(p.amount)}
          </p>
        </div>
      ))}
    </div>
  );
}

/* ─── Edit sheet (bottom sheet) ─── */
function SupplierEditSheet({
  supplierId,
  initialName,
  initialGstin,
  initialPhone,
  initialEmail,
  initialAddress,
  initialLeadTimeDays,
  version,
  onClose,
  onSaved,
}: {
  supplierId: string;
  initialName: string;
  initialGstin: string;
  initialPhone: string;
  initialEmail: string;
  initialAddress: string;
  initialLeadTimeDays: string;
  version: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [gstin, setGstin] = useState(initialGstin);
  const [phone, setPhone] = useState(initialPhone);
  const [email, setEmail] = useState(initialEmail);
  const [address, setAddress] = useState(initialAddress);
  const [leadTimeDays, setLeadTimeDays] = useState(initialLeadTimeDays);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) return toast.error("Name is required");
    setSaving(true);
    try {
      const res = await fetch(`/api/suppliers/${supplierId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          gstin: gstin.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          address: address.trim() || null,
          leadTimeDays: leadTimeDays ? Number(leadTimeDays) : null,
          version,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      haptic([10, 40, 80]);
      toast.success("Supplier updated");
      onSaved();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "w-full h-10 rounded-[0.5rem] border px-3 text-m-section outline-none";
  const inputStyle = {
    borderColor: "var(--color-line)",
    backgroundColor: "var(--color-paper)",
    color: "var(--color-ink-950)",
  };
  const labelClass = "text-m-caption font-semibold block mb-1";
  const labelStyle = { color: "var(--color-ink-500)" };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end"
      style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 40%, transparent)" }}
      onClick={onClose}
    >
      <div
        className="w-full rounded-t-[1rem] mx-auto max-w-md max-h-[85vh] overflow-y-auto"
        style={{ backgroundColor: "var(--color-paper)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-2 pb-1">
          <div className="h-1 w-10 rounded-full" style={{ backgroundColor: "var(--color-line)" }} />
        </div>
        <div className="flex items-center justify-between px-3 pb-2">
          <p className="text-m-section font-bold" style={{ color: "var(--color-ink-950)" }}>
            Edit Supplier
          </p>
          <button onClick={onClose} className="text-m-body press p-1">
            <X className="size-4" style={{ color: "var(--color-ink-500)" }} />
          </button>
        </div>
        <div className="px-3 pb-4 flex flex-col gap-3">
          <div>
            <label className={labelClass} style={labelStyle}>Name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} style={inputStyle} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass} style={labelStyle}>GSTIN</label>
              <input value={gstin} onChange={(e) => setGstin(e.target.value)} placeholder="22AAAAA0000A1Z5" className={`${inputClass} font-mono`} style={inputStyle} />
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>Lead Time (days)</label>
              <input type="number" min="0" step="1" inputMode="numeric" value={leadTimeDays} onChange={(e) => setLeadTimeDays(e.target.value)} placeholder="0" className={inputClass} style={inputStyle} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass} style={labelStyle}>Phone</label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9876543210" inputMode="tel" className={inputClass} style={inputStyle} />
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contact@firm.com" className={inputClass} style={inputStyle} />
            </div>
          </div>
          <div>
            <label className={labelClass} style={labelStyle}>Address</label>
            <textarea rows={2} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Office address…" className="w-full rounded-[0.5rem] border px-2.5 py-2 text-m-section resize-none outline-none" style={inputStyle} />
          </div>
          <div className="flex flex-col gap-2 pt-1">
            <button
              onClick={onClose}
              disabled={saving}
              className="flex-1 h-9 rounded-[0.5rem] border text-m-label font-bold text-m-body press"
              style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving || !name.trim()}
              className="flex-1 h-9 rounded-[0.5rem] text-m-label font-bold text-m-body press flex items-center justify-center gap-1"
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
