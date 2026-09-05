"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Phone, Mail, BadgeCheck, MapPin, ShoppingCart,
  Wallet, Plus, Trash2,
  Pencil, Package, Home, Maximize, AlertCircle, Loader2,
} from "lucide-react";
import { MobileCustomerEditForm } from "./MobileCustomerEditForm";
import {formatCurrencyCompact, formatDate} from "@/lib/utils";
import { toast } from "sonner";
import { MobileEmptyState } from "@/components/mobile/v2/primitives";
import { MobileDialog } from "@/components/mobile/v2/dialog";

/* ─── Types ─── */

interface SaleItem {
  id: string;
  saleNumber: string;
  type: "ASSET" | "MATERIAL";
  assetType?: string;
  salePrice: number;
  gstAmount: number;
  totalWithGst: number;
  paid: number;
  balance: number;
  saleDate: string;
  saleStage: string;
  paymentStatus: string;
  projectName: string | null;
}

interface CustomerData {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  address: string | null;
  createdAt: string;
  sales: SaleItem[];
  totals: {
    totalValue: number;
    totalPaid: number;
    totalOutstanding: number;
    activeDeals: number;
    saleCount: number;
  };
}

const STAGE_META: Record<string, { color: string; label: string }> = {
  PENDING: { color: "var(--color-signal)", label: "Pending" },
  DEPOSIT_RECEIVED: { color: "var(--color-steel)", label: "Deposit" },
  COMPLETED: { color: "var(--color-go)", label: "Completed" },
  CANCELLED: { color: "var(--color-stop)", label: "Cancelled" },
  ACTIVE: { color: "var(--color-go)", label: "Active" },
};

const PAYMENT_META: Record<string, { color: string; label: string }> = {
  PENDING: { color: "var(--color-signal)", label: "Unpaid" },
  PARTIAL: { color: "var(--color-signal)", label: "Partial" },
  PAID: { color: "var(--color-go)", label: "Paid" },
};

/* ─── Main component ─── */

export function MobileCustomerDetailClient({
  data,
  canSell,
  canManage,
  notFound,
}: {
  data?: CustomerData;
  canSell: boolean;
  canManage: boolean;
  notFound?: boolean;
}) {
  const router = useRouter();
  const [showDelete, setShowDelete] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [acting, setActing] = useState(false);

  if (notFound || !data) {
    return (
      <MobileEmptyState
        icon={AlertCircle}
        title="Customer not found"
        description="This customer may have been deleted or doesn't exist."
      />
    );
  }

  const outstandingPct = data.totals.totalValue > 0
    ? Math.round((data.totals.totalOutstanding / data.totals.totalValue) * 100)
    : 0;

  const handleDelete = async () => {
    setActing(true);
    try {
      const res = await fetch(`/api/customers/${data.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to delete");
      }
      toast.success("Customer deleted");
      router.push("/m/customers");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
      setActing(false);
      setShowDelete(false);
    }
  };

  return (
    <div className="pb-6">
      {/* ── Header ── */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-m-section font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
            {data.name}
          </p>
          <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
            Customer since {formatDate(data.createdAt)}
          </p>
        </div>
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
                className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-[0.5rem] text-m-label font-bold text-m-body press"
                style={{ backgroundColor: "var(--color-go)", color: "var(--color-paper)" }}
              >
                <Phone className="size-3.5" />
                Call
              </a>
            ) : null}
            {data.email ? (
              <a
                href={`mailto:${data.email}`}
                className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-[0.5rem] border text-m-label font-bold text-m-body press"
                style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
              >
                <Mail className="size-3.5" />
                Email
              </a>
            ) : null}
            {canSell ? (
              <Link
                href={`/m/sales/new?customerId=${data.id}`}
                className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-[0.5rem] border text-m-label font-bold text-m-body press"
                style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
              >
                <Plus className="size-3.5" />
                New Sale
              </Link>
            ) : null}
          </div>

          {/* Contact details grid */}
          <div className="grid grid-cols-2 gap-2">
            <ContactField icon={<Phone className="size-2.5" />} label="Phone" value={data.phone} />
            <ContactField icon={<Mail className="size-2.5" />} label="Email" value={data.email} />
            <ContactField icon={<BadgeCheck className="size-2.5" />} label="GSTIN" value={data.gstin} mono />
            <ContactField icon={<MapPin className="size-2.5" />} label="Address" value={data.address} />
          </div>
        </div>
      </div>

      {/* ── Financial summary — the "what do they owe me" banner ── */}
      <div
        className="rounded-[0.625rem] border mb-3 overflow-hidden"
        style={{
          borderColor: data.totals.totalOutstanding > 0 ? "var(--color-signal)" : "var(--color-line)",
          backgroundColor: "var(--color-paper)",
        }}
      >
        <div className="p-3">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-m-caption font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
                Outstanding
              </p>
              <p
                className="text-m-section font-bold tabular-nums leading-tight"
                style={{ color: data.totals.totalOutstanding > 0 ? "var(--color-signal)" : "var(--color-ink-950)" }}
              >
                {formatCurrencyCompact(data.totals.totalOutstanding)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-m-caption font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
                Total Sales
              </p>
              <p className="text-m-section font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                {formatCurrencyCompact(data.totals.totalValue)}
              </p>
            </div>
          </div>

          {/* Payment progress bar */}
          {data.totals.totalValue > 0 ? (
            <div className="flex h-1.5 rounded-full overflow-hidden mb-2" style={{ backgroundColor: "var(--color-paper-2)" }}>
              <div
                style={{
                  width: `${100 - outstandingPct}%`,
                  backgroundColor: "var(--color-go)",
                }}
              />
            </div>
          ) : null}

          {/* Mini stats row */}
          <div className="flex items-center gap-3 text-m-caption font-semibold">
            <span className="flex items-center gap-0.5" style={{ color: "var(--color-go)" }}>
              <Wallet className="size-2.5" />
              {formatCurrencyCompact(data.totals.totalPaid)} received
            </span>
            <span style={{ color: "var(--color-ink-500)" }}>
              {data.totals.saleCount} sales
            </span>
            {data.totals.activeDeals > 0 ? (
              <span className="flex items-center gap-0.5" style={{ color: "var(--color-signal)" }}>
                <ShoppingCart className="size-2.5" />
                {data.totals.activeDeals} active
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── Sales history ── */}
      <div className="mb-4">
        <p className="text-m-caption font-bold uppercase tracking-wide mb-2" style={{ color: "var(--color-ink-600)" }}>
          Purchase History ({data.sales.length})
        </p>

        {data.sales.length === 0 ? (
          <MobileEmptyState
            icon={ShoppingCart}
            title="No purchases yet"
            description="Sales made to this customer will appear here."
            size="compact"
            action={canSell ? (
              <Link
                href={`/m/sales/new?customerId=${data.id}`}
                className="text-m-caption font-semibold text-m-body press"
                style={{ color: "var(--color-ink-500)" }}
              >
                Create first sale
              </Link>
            ) : undefined}
          />
        ) : (
          <div className="flex flex-col gap-2">
            {data.sales.map((s) => (
              <SaleCard key={`${s.type}-${s.id}`} sale={s} />
            ))}
          </div>
        )}
      </div>

      {/* ── Manage actions ── */}
      {canManage ? (
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => setShowEdit(true)}
            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-[0.5rem] border text-m-label font-semibold text-m-body press"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-700)" }}
          >
            <Pencil className="size-3" />
            Edit
          </button>
          <button
            onClick={() => setShowDelete(true)}
            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-[0.5rem] border text-m-label font-semibold text-m-body press"
            style={{ borderColor: "var(--color-line)", color: "var(--color-stop)" }}
          >
            <Trash2 className="size-3" />
            Delete
          </button>
        </div>
      ) : null}

      {/* ── Delete confirmation ── */}
      {showDelete ? (
        <DeleteConfirm
          customerName={data.name}
          acting={acting}
          onConfirm={handleDelete}
          onClose={() => setShowDelete(false)}
        />
      ) : null}

      {/* ── Edit form ── */}
      {showEdit ? (
        <MobileCustomerEditForm
          customer={data}
          onClose={() => setShowEdit(false)}
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
      <p className="text-m-caption font-semibold uppercase flex items-center gap-0.5" style={{ color: "var(--color-ink-500)" }}>
        {icon}
        {label}
      </p>
      <p
        className={`text-m-label font-bold leading-tight mt-0.5 truncate ${mono ? "font-mono tabular-nums" : ""}`}
        style={{ color: value ? "var(--color-ink-950)" : "var(--color-ink-300)" }}
      >
        {value ?? "—"}
      </p>
    </div>
  );
}

/* ─── Sale card ─── */
function SaleCard({ sale: s }: { sale: SaleItem }) {
  const stage = STAGE_META[s.saleStage] ?? { color: "var(--color-ink-500)", label: s.saleStage };
  const payment = PAYMENT_META[s.paymentStatus] ?? { color: "var(--color-ink-500)", label: s.paymentStatus };
  const isMaterial = s.type === "MATERIAL";
  const isAsset = s.type === "ASSET";
  const isLand = isAsset && s.assetType === "LAND";
  const isUnit = isAsset && s.assetType === "BUILT_UNIT";

  const AssetIcon = isLand ? Maximize : isUnit ? Home : Package;
  const assetLabel = isLand ? "Land" : isUnit ? "Unit" : isMaterial ? "Material" : "Asset";

  const paidPct = s.totalWithGst > 0 ? Math.round((s.paid / s.totalWithGst) * 100) : 0;

  return (
    <Link
      href={isMaterial ? `/m/material-sales/${s.id}` : `/m/sales/${s.id}`}
      className="block rounded-[0.5rem] border overflow-hidden active:scale-[0.99] transition-transform"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      <div className="p-2.5">
        {/* ── Top: sale number + type + stage ── */}
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <AssetIcon className="size-3" style={{ color: "var(--color-ink-500)" }} />
            <span className="text-m-caption font-mono font-bold" style={{ color: "var(--color-ink-950)" }}>
              {s.saleNumber}
            </span>
            <span
              className="text-m-caption font-bold uppercase px-1 py-0.5 rounded"
              style={{ color: "var(--color-ink-600)", backgroundColor: "var(--color-paper-2)" }}
            >
              {assetLabel}
            </span>
          </div>
          <span
            className="flex items-center gap-0.5 text-m-caption font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full"
            style={{ color: stage.color, backgroundColor: `color-mix(in srgb, ${stage.color} 12%, transparent)` }}
          >
            {stage.label}
          </span>
        </div>

        {/* ── Project + date ── */}
        <p className="text-m-caption mb-2" style={{ color: "var(--color-ink-500)" }}>
          {s.projectName ?? "Standalone"}
          {" · "}{formatDate(s.saleDate)}
        </p>

        {/* ── Financial row ── */}
        <div className="flex items-center gap-3">
          <div>
            <p className="text-m-caption font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>
              Total
            </p>
            <p className="text-m-body font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
              {formatCurrencyCompact(s.totalWithGst)}
            </p>
          </div>

          <div className="w-px h-6" style={{ backgroundColor: "var(--color-line)" }} />

          <div>
            <p className="text-m-caption font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>
              Paid
            </p>
            <p className="text-m-body font-bold tabular-nums" style={{ color: "var(--color-go)" }}>
              {formatCurrencyCompact(s.paid)}
            </p>
          </div>

          {s.balance > 0 ? (
            <>
              <div className="w-px h-6" style={{ backgroundColor: "var(--color-line)" }} />
              <div>
                <p className="text-m-caption font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>
                  Balance
                </p>
                <p className="text-m-body font-bold tabular-nums" style={{ color: "var(--color-signal)" }}>
                  {formatCurrencyCompact(s.balance)}
                </p>
              </div>
            </>
          ) : null}

          {/* Payment status badge */}
          <span
            className="ml-auto text-m-caption font-bold uppercase px-1.5 py-0.5 rounded-full"
            style={{ color: payment.color, backgroundColor: `color-mix(in srgb, ${payment.color} 12%, transparent)` }}
          >
            {payment.label}
          </span>
        </div>

        {/* ── Payment progress bar ── */}
        {s.totalWithGst > 0 && paidPct < 100 ? (
          <div className="flex h-1 rounded-full overflow-hidden mt-2" style={{ backgroundColor: "var(--color-paper-2)" }}>
            <div style={{ width: `${paidPct}%`, backgroundColor: "var(--color-go)" }} />
          </div>
        ) : null}
      </div>
    </Link>
  );
}

/* ─── Delete confirmation bottom sheet ─── */
function DeleteConfirm({
  customerName, acting, onConfirm, onClose,
}: {
  customerName: string;
  acting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <MobileDialog open={true} onClose={onClose} title={`Delete ${customerName}?`}>
          <div
            className="rounded-[0.5rem] border p-3 mb-3"
            style={{ borderColor: "var(--color-stop)", backgroundColor: `color-mix(in srgb, var(--color-stop) 5%, transparent)` }}
          >
            <p className="text-m-label" style={{ color: "var(--color-ink-700)" }}>
              This customer will be permanently deleted.
            </p>
            <p className="text-m-caption mt-1" style={{ color: "var(--color-ink-500)" }}>
              Only possible if they have no active sales.
            </p>
          </div>
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
              style={{ backgroundColor: "var(--color-stop)", color: "var(--color-paper)" }}
            >
              {acting ? <Loader2 className="size-3.5 animate-spin mx-auto" /> : "Delete"}
            </button>
          </div>
    </MobileDialog>
  );
}
