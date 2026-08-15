"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Phone, Mail, MapPin, BadgeCheck,
  FileText, Banknote,
} from "lucide-react";
import { MobileBackButton } from "@/components/mobile/v2/mobile-back-button";
import { formatCurrency, formatCurrencyCompact, formatDate } from "@/lib/utils";

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

const STATUS_COLORS: Record<PoStatus, string> = {
  DRAFT: "var(--color-steel)",
  APPROVED: "var(--color-signal)",
  ORDERED: "var(--color-signal)",
  PARTIAL: "var(--color-signal)",
  RECEIVED: "var(--color-go)",
  CANCELLED: "var(--color-stop)",
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
  name,
  gstin,
  phone,
  email,
  address,
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
  balanceOwed: number;
  totalPoValue: number;
  totalPaid: number;
  poCount: number;
  paymentCount: number;
  pos: PoItem[];
  payments: PaymentItem[];
  canManage?: boolean;
}) {
  const [tab, setTab] = useState<"pos" | "payments">("pos");
  const hasDues = balanceOwed > 0;
  const accentColor = hasDues ? "var(--color-stop)" : "var(--color-go)";

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-center gap-2 mb-2">
        <MobileBackButton fallback="/m/suppliers" className="shrink-0" style={{ color: "var(--color-ink-700)" }} />
        <div className="flex-1 min-w-0">
          <p className="text-[0.875rem] font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
            {name}
          </p>
        </div>
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
            <p className="text-[0.5rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
              Balance Owed
            </p>
            <p
              className="text-[1rem] font-bold tabular-nums"
              style={{ color: hasDues ? "var(--color-stop)" : "var(--color-ink-950)" }}
            >
              {formatCurrency(balanceOwed)}
            </p>
          </div>
          <span
            className="text-[0.5rem] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
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
            className="flex flex-col items-center rounded-[0.5rem] border py-1.5 press"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          >
            <Phone className="size-3.5 mb-0.5" style={{ color: "var(--color-ink-700)" }} />
            <span className="text-[0.5rem] font-bold" style={{ color: "var(--color-ink-950)" }}>Call</span>
          </a>
        ) : (
          <div
            className="flex flex-col items-center rounded-[0.5rem] border py-1.5"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)", opacity: 0.5 }}
          >
            <Phone className="size-3.5 mb-0.5" style={{ color: "var(--color-ink-300)" }} />
            <span className="text-[0.5rem] font-bold" style={{ color: "var(--color-ink-300)" }}>No phone</span>
          </div>
        )}
        {email ? (
          <a
            href={`mailto:${email}`}
            className="flex flex-col items-center rounded-[0.5rem] border py-1.5 press"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          >
            <Mail className="size-3.5 mb-0.5" style={{ color: "var(--color-ink-700)" }} />
            <span className="text-[0.5rem] font-bold" style={{ color: "var(--color-ink-950)" }}>Email</span>
          </a>
        ) : (
          <div
            className="flex flex-col items-center rounded-[0.5rem] border py-1.5"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)", opacity: 0.5 }}
          >
            <Mail className="size-3.5 mb-0.5" style={{ color: "var(--color-ink-300)" }} />
            <span className="text-[0.5rem] font-bold" style={{ color: "var(--color-ink-300)" }}>No email</span>
          </div>
        )}
        <Link
          href="/m/suppliers"
          className="flex flex-col items-center rounded-[0.5rem] border py-1.5 press"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <FileText className="size-3.5 mb-0.5" style={{ color: "var(--color-ink-700)" }} />
          <span className="text-[0.5rem] font-bold" style={{ color: "var(--color-ink-950)" }}>Orders</span>
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
            <span className="text-[0.5rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>GSTIN</span>
            <span className="text-[0.625rem] font-mono ml-auto truncate" style={{ color: "var(--color-ink-950)" }}>
              {gstin}
            </span>
          </div>
        ) : null}
        {phone ? (
          <div className="flex items-center gap-2 px-2.5 py-1.5" style={{ borderTop: "1px solid var(--color-line)" }}>
            <Phone className="size-3 shrink-0" style={{ color: "var(--color-ink-500)" }} />
            <span className="text-[0.5rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Phone</span>
            <span className="text-[0.625rem] font-mono ml-auto truncate" style={{ color: "var(--color-ink-950)" }}>
              {phone}
            </span>
          </div>
        ) : null}
        {address ? (
          <div className="flex items-center gap-2 px-2.5 py-1.5" style={{ borderTop: "1px solid var(--color-line)" }}>
            <MapPin className="size-3 shrink-0" style={{ color: "var(--color-ink-500)" }} />
            <span className="text-[0.5rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Address</span>
            <span className="text-[0.625rem] ml-auto truncate text-right" style={{ color: "var(--color-ink-950)" }}>
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
          <p className="text-[0.5rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
            Purchase Order Value
          </p>
          <p className="text-[0.875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
            {formatCurrencyCompact(totalPoValue)}
          </p>
        </div>
        <div className="text-center">
          <p className="text-[0.5rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
            Paid
          </p>
          <p className="text-[0.875rem] font-bold tabular-nums" style={{ color: "var(--color-go)" }}>
            {formatCurrencyCompact(totalPaid)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[0.5rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
            Owed
          </p>
          <p className="text-[0.875rem] font-bold tabular-nums" style={{ color: hasDues ? "var(--color-stop)" : "var(--color-ink-950)" }}>
            {formatCurrencyCompact(balanceOwed)}
          </p>
        </div>
      </div>

      {/* ── Tab switcher ── */}
      <div className="flex gap-1 mb-2">
        <button
          onClick={() => setTab("pos")}
          className="flex-1 rounded-[0.375rem] py-1.5 text-[0.625rem] font-bold transition-colors"
          style={
            tab === "pos"
              ? { backgroundColor: "var(--color-ink-950)", color: "#fff" }
              : { backgroundColor: "var(--color-paper)", color: "var(--color-ink-700)", border: "1px solid var(--color-line)" }
          }
        >
          POs ({poCount})
        </button>
        <button
          onClick={() => setTab("payments")}
          className="flex-1 rounded-[0.375rem] py-1.5 text-[0.625rem] font-bold transition-colors"
          style={
            tab === "payments"
              ? { backgroundColor: "var(--color-ink-950)", color: "#fff" }
              : { backgroundColor: "var(--color-paper)", color: "var(--color-ink-700)", border: "1px solid var(--color-line)" }
          }
        >
          Payments ({paymentCount})
        </button>
      </div>

      {/* ── Tab content ── */}
      {tab === "pos" ? <PosTab pos={pos} /> : <PaymentsTab payments={payments} />}
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
        <p className="text-[0.75rem] font-semibold" style={{ color: "var(--color-ink-700)" }}>
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
        const color = STATUS_COLORS[po.status] ?? "var(--color-steel)";
        return (
          <Link
            key={po.id}
            href={`/m/procurement/${po.id}`}
            className="flex items-center gap-2 px-2.5 py-2 press"
            style={i > 0 ? { borderTop: "1px solid var(--color-line)" } : undefined}
          >
            {/* Status dot */}
            <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: color }} />

            <div className="min-w-0 flex-1">
              <p className="text-[0.625rem] font-mono font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
                {po.poNumber}
              </p>
              <p className="text-[0.5rem]" style={{ color: "var(--color-ink-500)" }}>
                {formatDate(po.createdAt)}
              </p>
            </div>

            <div className="text-right shrink-0">
              <p className="text-[0.625rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                {formatCurrencyCompact(po.total)}
              </p>
              <p className="text-[0.5rem] font-semibold" style={{ color }}>
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
        <p className="text-[0.75rem] font-semibold" style={{ color: "var(--color-ink-700)" }}>
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
            <p className="text-[0.625rem] font-mono font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
              {p.paymentNumber}
            </p>
            <p className="text-[0.5rem]" style={{ color: "var(--color-ink-500)" }}>
              {formatDate(p.paymentDate)} · {p.paymentMode}
            </p>
          </div>

          <p className="text-[0.625rem] font-bold tabular-nums shrink-0" style={{ color: "var(--color-go)" }}>
            {formatCurrencyCompact(p.amount)}
          </p>
        </div>
      ))}
    </div>
  );
}
