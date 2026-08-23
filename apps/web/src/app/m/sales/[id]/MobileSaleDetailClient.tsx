"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Phone, Printer, XCircle, Banknote,
  TrendingUp, Loader2, IndianRupee, X,
  CheckCircle2, ExternalLink,
} from "lucide-react";
import { formatCurrency, formatCurrencyCompact, formatDate, formatNumber } from "@/lib/utils";
import { toast } from "sonner";
import { MobileChequeFields, EMPTY_MOBILE_CHEQUE, type MobileChequeState } from "../MobileChequeFields";
import { MobileDocUploader } from "../../MobileDocUploader";

type AssetType = "LAND" | "BUILT_UNIT" | "PROJECT";
type SaleStatus = "PENDING" | "ACTIVE" | "CANCELLED";
type PaymentStatus = "PENDING" | "PARTIAL" | "PAID";

type AssetInfo =
  | { type: "LAND"; id: string; label: string; area: number; areaUnit: string }
  | { type: "BUILT_UNIT"; id: string; label: string; unitType: string; area: number; areaUnit: string };

type PaymentItem = {
  id: string;
  amount: number;
  paymentDate: string;
  mode: string;
  reference: string | null;
  status: string;
  chequeStatus: string | null;
};

const PAYMENT_MODES = ["CASH", "BANK_TRANSFER", "CHEQUE", "UPI", "OTHER"] as const;

const STAGE_META: Record<string, { color: string; label: string }> = {
  PENDING: { color: "var(--color-signal)", label: "Pending" },
  DEPOSIT_RECEIVED: { color: "var(--color-signal)", label: "Deposit" },
  COMPLETED: { color: "var(--color-go)", label: "Completed" },
  CANCELLED: { color: "var(--color-stop)", label: "Cancelled" },
};

/**
 * Asset sale (real estate) detail — sale header + asset info + financial
 * summary + payment history + cancel/print actions. Mirrors the
 * material-sale detail layout but for built-unit / land sales.
 */
export function MobileSaleDetailClient({
  saleId,
  saleNumber,
  assetType,
  status,
  saleStage,
  paymentStatus,
  saleDate,
  salePrice,
  gstRate,
  gstAmount,
  costBasis,
  profit,
  depositAmount,
  depositDate,
  finalSaleDate,
  paymentMode,
  notes,
  totalPaid,
  // Sale deed / ATS
  saleDeedNo,
  expectedRegistryDate,
  // Compliance documents
  allotmentLetterNo,
  allotmentDate,
  bbaNo,
  bbaDate,
  tdsAmount,
  tdsCertificateNo,
  // Home loan
  homeLoanBank,
  homeLoanAmount,
  customer,
  project,
  asset,
  payments,
  canManage,
  notFound,
  dealSource,
  brokerName,
  brokerPhone,
  brokerAgency,
  commissionAmount,
  commissionStatus,
  dealMaturityMonths,
  paymentCycle,
  expenses,
  terms,
  paymentSchedule,
  // Document URLs
  atsDocumentUrl,
  atsDocumentName,
  bbaDocumentUrl,
  bbaDocumentName,
  registryDocumentUrl,
  registryDocumentName,
  allotmentDocumentUrl,
  allotmentDocumentName,
}: {
  saleId: string;
  saleNumber: string;
  assetType: AssetType;
  status: SaleStatus;
  saleStage: string;
  paymentStatus: PaymentStatus;
  saleDate: string;
  salePrice: number;
  gstRate: number;
  gstAmount: number;
  costBasis: number;
  profit: number;
  depositAmount: number | null;
  depositDate: string | null;
  finalSaleDate: string | null;
  paymentMode: string | null;
  notes: string | null;
  totalPaid: number;
  saleDeedNo: string | null;
  expectedRegistryDate: string | null;
  allotmentLetterNo: string | null;
  allotmentDate: string | null;
  bbaNo: string | null;
  bbaDate: string | null;
  tdsAmount: number | null;
  tdsCertificateNo: string | null;
  homeLoanBank: string | null;
  homeLoanAmount: number | null;
  customer: { id: string; name: string; phone: string | null } | null;
  project: { id: string; name: string } | null;
  asset: AssetInfo | null;
  payments: PaymentItem[];
  canManage: boolean;
  notFound?: boolean;
  // New sales-module fields
  dealSource: string | null;
  brokerName: string | null;
  brokerPhone: string | null;
  brokerAgency: string | null;
  commissionAmount: number | null;
  commissionStatus: string | null;
  dealMaturityMonths: number | null;
  paymentCycle: string | null;
  expenses: { id: string; head: string; amount: number; borneBy: string; isIncluded: boolean }[];
  terms: { id: string; description: string; extraAmount: number | null; isIncluded: boolean }[];
  paymentSchedule: {
    type: string;
    items: {
      id: string;
      installmentNo: number;
      description: string;
      percentage: number;
      amount: number;
      dueDate: string | null;
      paidAmount: number;
      status: string;
    }[];
  } | null;
  // Document URLs
  atsDocumentUrl?: string | null;
  atsDocumentName?: string | null;
  bbaDocumentUrl?: string | null;
  bbaDocumentName?: string | null;
  registryDocumentUrl?: string | null;
  registryDocumentName?: string | null;
  allotmentDocumentUrl?: string | null;
  allotmentDocumentName?: string | null;
}) {
  const router = useRouter();
  const [showPayment, setShowPayment] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [showComplete, setShowComplete] = useState(false);
  const [showDeposit, setShowDeposit] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [payAmount, setPayAmount] = useState("");
  const [payMode, setPayMode] = useState<(typeof PAYMENT_MODES)[number]>("CASH");
  const [payRef, setPayRef] = useState("");
  const [payCheque, setPayCheque] = useState<MobileChequeState>(EMPTY_MOBILE_CHEQUE);

  // Deposit form state
  const [depAmount, setDepAmount] = useState("");
  const [depMode, setDepMode] = useState<(typeof PAYMENT_MODES)[number]>("BANK_TRANSFER");
  const [depRef, setDepRef] = useState("");
  const [depCheque, setDepCheque] = useState<MobileChequeState>(EMPTY_MOBILE_CHEQUE);

  // Document upload state (for complete sale modal)
  const [compRegistryDocUrl, setCompRegistryDocUrl] = useState("");
  const [compRegistryDocName, setCompRegistryDocName] = useState("");
  const [compAtsDocUrl, setCompAtsDocUrl] = useState("");
  const [compAtsDocName, setCompAtsDocName] = useState("");
  const [compBbaDocUrl, setCompBbaDocUrl] = useState("");
  const [compBbaDocName, setCompBbaDocName] = useState("");

  // Document upload state (standalone upload from detail page)
  const [docUploading, setDocUploading] = useState(false);

  // Complete sale form state
  const [compSaleDeedNo, setCompSaleDeedNo] = useState("");
  const [compPayMode, setCompPayMode] = useState<(typeof PAYMENT_MODES)[number]>("BANK_TRANSFER");
  const [compRef, setCompRef] = useState("");
  const [compAllotmentNo, setCompAllotmentNo] = useState("");
  const [compAllotmentDate, setCompAllotmentDate] = useState("");
  const [compBbaNo, setCompBbaNo] = useState("");
  const [compBbaDate, setCompBbaDate] = useState("");
  const [compTdsAmount, setCompTdsAmount] = useState("");
  const [compTdsCertNo, setCompTdsCertNo] = useState("");
  // Home loan fields
  const [compLoanBank, setCompLoanBank] = useState("");
  const [compLoanAmount, setCompLoanAmount] = useState("");
  const [compLoanSanctionNo, setCompLoanSanctionNo] = useState("");
  const [compLoanSanctionDate, setCompLoanSanctionDate] = useState("");

  if (notFound) {
    return (
      <div>
        <div className="mb-4">
        </div>
        <div
          className="flex flex-col items-center justify-center rounded-[0.5rem] border py-12 text-center"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
        >
          <IndianRupee className="size-8 mb-2" style={{ color: "var(--color-ink-300)" }} />
          <p className="text-[0.875rem] font-semibold" style={{ color: "var(--color-ink-700)" }}>
            Sale not found
          </p>
        </div>
      </div>
    );
  }

  const isCancelled = status === "CANCELLED" || saleStage === "CANCELLED";
  const isCompleted = saleStage === "COMPLETED" && !isCancelled;
  const isPaid = paymentStatus === "PAID" && !isCancelled;
  const isPending = paymentStatus === "PENDING" && !isCancelled;
  const isPartial = paymentStatus === "PARTIAL" && !isCancelled;

  const accentColor = isCancelled
    ? "var(--color-stop)"
    : isPaid || isCompleted
      ? "var(--color-go)"
      : "var(--color-signal)";

  const stageMeta = STAGE_META[saleStage] ?? { color: "var(--color-signal)", label: "Pending" };
  const totalAmount = salePrice + gstAmount;
  const balanceDue = Math.max(0, totalAmount - totalPaid);

  async function handleCancel() {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/sales/${saleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to cancel sale");
      }
      toast.success(`Sale ${saleNumber} cancelled`);
      setShowCancel(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel sale");
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePayment(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(payAmount);
    if (!amount || amount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (payMode === "CHEQUE" && !payCheque.chequeNo.trim()) {
      toast.error("Cheque number is required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/sales/${saleId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "payment",
          amount,
          mode: payMode,
          reference: payRef || undefined,
          ...(payMode === "CHEQUE" ? {
            chequeNo: payCheque.chequeNo.trim() || undefined,
            chequeDate: payCheque.chequeDate || undefined,
            chequeBank: payCheque.chequeBank.trim() || undefined,
            chequePhotoUrl: payCheque.chequePhotoUrl || undefined,
          } : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to record payment");
      }
      toast.success(payMode === "CHEQUE" ? "Cheque payment recorded (pending clearance)" : "Payment recorded");
      setShowPayment(false);
      setPayAmount("");
      setPayRef("");
      setPayCheque(EMPTY_MOBILE_CHEQUE);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record payment");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleComplete(e: React.FormEvent) {
    e.preventDefault();
    // Registry document is required to complete
    const hasRegistryDoc = !!(registryDocumentUrl || compRegistryDocUrl);
    if (!hasRegistryDoc) {
      toast.error("Registry document upload is required to complete the sale");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/sales/${saleId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "complete",
          paymentMode: compPayMode,
          reference: compRef || undefined,
          saleDeedNo: compSaleDeedNo || undefined,
          allotmentLetterNo: compAllotmentNo || undefined,
          allotmentDate: compAllotmentDate || undefined,
          bbaNo: compBbaNo || undefined,
          bbaDate: compBbaDate || undefined,
          tdsAmount: compTdsAmount ? Number(compTdsAmount) : undefined,
          tdsCertificateNo: compTdsCertNo || undefined,
          homeLoanBank: compLoanBank || undefined,
          homeLoanAmount: compLoanAmount ? Number(compLoanAmount) : undefined,
          homeLoanSanctionNo: compLoanSanctionNo || undefined,
          homeLoanSanctionDate: compLoanSanctionDate || undefined,
          // Document URLs
          registryDocumentUrl: compRegistryDocUrl || undefined,
          registryDocumentName: compRegistryDocName || undefined,
          atsDocumentUrl: compAtsDocUrl || undefined,
          atsDocumentName: compAtsDocName || undefined,
          bbaDocumentUrl: compBbaDocUrl || undefined,
          bbaDocumentName: compBbaDocName || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to complete sale");
      }
      toast.success(`Sale ${saleNumber} completed`);
      setShowComplete(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to complete sale");
    } finally {
      setSubmitting(false);
    }
  }

  async function uploadSaleDocument(documentType: "ATS" | "BBA" | "REGISTRY" | "ALLOTMENT", url: string, fileName?: string) {
    setDocUploading(true);
    try {
      const res = await fetch(`/api/sales/${saleId}/document`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentType, documentUrl: url, documentName: fileName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      toast.success(`${documentType} document uploaded`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setDocUploading(false);
    }
  }

  async function handleChequeAction(paymentId: string, action: "clear" | "bounce") {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/sales/payments/${paymentId}/cheque`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Failed to ${action} cheque`);
      }
      toast.success(action === "clear" ? "Cheque cleared — sale completed" : "Cheque bounced");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to ${action} cheque`);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeposit(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(depAmount);
    if (!amount || amount <= 0) {
      toast.error("Enter a valid deposit amount");
      return;
    }
    if (depMode === "CHEQUE" && !depCheque.chequeNo.trim()) {
      toast.error("Cheque number is required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/sales/${saleId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "deposit",
          depositAmount: amount,
          paymentMode: depMode,
          reference: depRef || undefined,
          ...(depMode === "CHEQUE" ? {
            chequeNo: depCheque.chequeNo.trim() || undefined,
            chequeDate: depCheque.chequeDate || undefined,
            chequeBank: depCheque.chequeBank.trim() || undefined,
            chequePhotoUrl: depCheque.chequePhotoUrl || undefined,
          } : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to record deposit");
      }
      toast.success(depMode === "CHEQUE" ? "Deposit recorded (cheque pending)" : "Deposit recorded");
      setShowDeposit(false);
      setDepAmount("");
      setDepRef("");
      setDepCheque(EMPTY_MOBILE_CHEQUE);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record deposit");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-center gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-[0.875rem] font-bold truncate font-mono" style={{ color: "var(--color-ink-950)" }}>
            {saleNumber}
          </p>
        </div>
        <span
          className="text-[0.5rem] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0"
          style={{
            color: accentColor,
            backgroundColor: `color-mix(in srgb, ${accentColor} 12%, transparent)`,
          }}
        >
          {stageMeta.label}
        </span>
      </div>

      {/* ── Total banner ── */}
      <div
        className="rounded-[0.5rem] border px-3 py-2 mb-2"
        style={{
          borderColor: isCancelled
            ? "color-mix(in srgb, var(--color-stop) 30%, var(--color-line))"
            : "color-mix(in srgb, var(--color-go) 30%, var(--color-line))",
          backgroundColor: isCancelled
            ? "color-mix(in srgb, var(--color-stop) 6%, var(--color-paper))"
            : "color-mix(in srgb, var(--color-go) 6%, var(--color-paper))",
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[0.5rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
              {isCancelled ? "Cancelled" : isPaid ? "Total Amount" : "Balance Due"}
            </p>
            <p
              className="text-[1rem] font-bold tabular-nums"
              style={{ color: isCancelled ? "var(--color-stop)" : isPaid ? "var(--color-go)" : "var(--color-signal)" }}
            >
              {formatCurrency(isCancelled ? totalAmount : isPaid ? totalAmount : balanceDue)}
            </p>
          </div>
          {!isCancelled && !isPaid ? (
            <div className="text-right">
              <p className="text-[0.5rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
                Total
              </p>
              <p className="text-[0.875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                {formatCurrency(totalAmount)}
              </p>
            </div>
          ) : null}
        </div>
        {!isCancelled && totalPaid > 0 ? (
          <div className="mt-1.5 pt-1.5 flex items-center justify-between text-[0.5rem]" style={{ borderTop: "1px solid var(--color-line)" }}>
            <span style={{ color: "var(--color-ink-500)" }}>Paid so far</span>
            <span className="font-bold tabular-nums" style={{ color: "var(--color-go)" }}>
              {formatCurrency(totalPaid)}
            </span>
          </div>
        ) : null}
      </div>

      {/* ── Quick actions ── */}
      <div className="grid grid-cols-3 gap-1.5 mb-2">
        {customer?.phone ? (
          <a
            href={`tel:${customer.phone}`}
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
        {canManage && !isCancelled && !isPaid ? (
          <button
            onClick={() => setShowPayment(true)}
            className="flex flex-col items-center rounded-[0.5rem] border py-1.5 press"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          >
            <Banknote className="size-3.5 mb-0.5" style={{ color: "var(--color-go)" }} />
            <span className="text-[0.5rem] font-bold" style={{ color: "var(--color-ink-950)" }}>Payment</span>
          </button>
        ) : (
          <div
            className="flex flex-col items-center rounded-[0.5rem] border py-1.5"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)", opacity: 0.5 }}
          >
            <Banknote className="size-3.5 mb-0.5" style={{ color: "var(--color-ink-300)" }} />
            <span className="text-[0.5rem] font-bold" style={{ color: "var(--color-ink-300)" }}>—</span>
          </div>
        )}
        <Link
          href={`/sales/${saleId}/print`}
          className="flex flex-col items-center rounded-[0.5rem] border py-1.5 press"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <Printer className="size-3.5 mb-0.5" style={{ color: "var(--color-ink-700)" }} />
          <span className="text-[0.5rem] font-bold" style={{ color: "var(--color-ink-950)" }}>Form</span>
        </Link>
      </div>

      {/* ── Info + Deal Details grid (2 columns) ── */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        {/* Info column */}
        <div
          className="rounded-[0.5rem] border overflow-hidden"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          {customer ? (
            <Link
              href={`/m/customers/${customer.id}`}
              className="flex items-center gap-1 px-2 py-1.5 press"
            >
              <span className="text-[0.4375rem] font-semibold uppercase shrink-0" style={{ color: "var(--color-ink-500)" }}>
                Customer
              </span>
              <span className="text-[0.5625rem] font-bold ml-auto truncate" style={{ color: "var(--color-ink-950)" }}>
                {customer.name}
              </span>
            </Link>
          ) : null}

          <div className="flex items-center gap-1 px-2 py-1.5" style={{ borderTop: "1px solid var(--color-line)" }}>
            <span className="text-[0.4375rem] font-semibold uppercase shrink-0" style={{ color: "var(--color-ink-500)" }}>
              Date
            </span>
            <span className="text-[0.5625rem] font-bold ml-auto tabular-nums" style={{ color: "var(--color-ink-950)" }}>
              {formatDate(saleDate)}
            </span>
          </div>

          {project ? (
            <Link
              href={`/m/projects/${project.id}`}
              className="flex items-center gap-1 px-2 py-1.5 press"
              style={{ borderTop: "1px solid var(--color-line)" }}
            >
              <span className="text-[0.4375rem] font-semibold uppercase shrink-0" style={{ color: "var(--color-ink-500)" }}>
                Project
              </span>
              <span className="text-[0.5625rem] font-bold ml-auto truncate" style={{ color: "var(--color-ink-950)" }}>
                {project.name}
              </span>
            </Link>
          ) : null}

          {asset ? (
            <Link
              href={asset.type === "BUILT_UNIT" ? `/m/units/${asset.id}` : `/m/land/${asset.id}`}
              className="flex items-center gap-1 px-2 py-1.5 press"
              style={{ borderTop: "1px solid var(--color-line)" }}
            >
              <span className="text-[0.4375rem] font-semibold uppercase shrink-0" style={{ color: "var(--color-ink-500)" }}>
                {asset.type === "LAND" ? "Parcel" : "Unit"}
              </span>
              <span className="text-[0.5625rem] font-bold ml-auto truncate" style={{ color: "var(--color-ink-950)" }}>
                {asset.label}
                {asset.area > 0 ? ` · ${formatNumber(asset.area, 0)} ${asset.areaUnit}` : ""}
              </span>
            </Link>
          ) : null}

          {depositAmount != null && depositAmount > 0 ? (
            <div className="flex items-center gap-1 px-2 py-1.5" style={{ borderTop: "1px solid var(--color-line)" }}>
              <span className="text-[0.4375rem] font-semibold uppercase shrink-0" style={{ color: "var(--color-ink-500)" }}>
                Deposit
              </span>
              <span className="text-[0.5625rem] font-bold ml-auto tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                {formatCurrency(depositAmount)}
                {depositDate ? ` · ${formatDate(depositDate)}` : ""}
              </span>
            </div>
          ) : null}

          {finalSaleDate ? (
            <div className="flex items-center gap-1 px-2 py-1.5" style={{ borderTop: "1px solid var(--color-line)" }}>
              <span className="text-[0.4375rem] font-semibold uppercase shrink-0" style={{ color: "var(--color-ink-500)" }}>
                Completed
              </span>
              <span className="text-[0.5625rem] font-bold ml-auto tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                {formatDate(finalSaleDate)}
              </span>
            </div>
          ) : null}

          {paymentMode ? (
            <div className="flex items-center gap-1 px-2 py-1.5" style={{ borderTop: "1px solid var(--color-line)" }}>
              <span className="text-[0.4375rem] font-semibold uppercase shrink-0" style={{ color: "var(--color-ink-500)" }}>
                Pay Mode
              </span>
              <span className="text-[0.5625rem] font-bold ml-auto" style={{ color: "var(--color-ink-950)" }}>
                {paymentMode}
              </span>
            </div>
          ) : null}

          {saleDeedNo ? (
            <div className="flex items-center gap-1 px-2 py-1.5" style={{ borderTop: "1px solid var(--color-line)" }}>
              <span className="text-[0.4375rem] font-semibold uppercase shrink-0" style={{ color: "var(--color-ink-500)" }}>
                Sale Deed
              </span>
              <span className="text-[0.5625rem] font-bold ml-auto" style={{ color: "var(--color-ink-950)" }}>
                {saleDeedNo}
              </span>
            </div>
          ) : null}

          {expectedRegistryDate && !isCompleted ? (
            <div className="flex items-center gap-1 px-2 py-1.5" style={{ borderTop: "1px solid var(--color-line)" }}>
              <span className="text-[0.4375rem] font-semibold uppercase shrink-0" style={{ color: "var(--color-ink-500)" }}>
                Exp. Registry
              </span>
              <span className="text-[0.5625rem] font-bold ml-auto tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                {formatDate(expectedRegistryDate)}
              </span>
            </div>
          ) : null}

          {homeLoanBank ? (
            <div className="flex items-center gap-1 px-2 py-1.5" style={{ borderTop: "1px solid var(--color-line)" }}>
              <span className="text-[0.4375rem] font-semibold uppercase shrink-0" style={{ color: "var(--color-ink-500)" }}>
                Home Loan
              </span>
              <span className="text-[0.5625rem] font-bold ml-auto" style={{ color: "var(--color-ink-950)" }}>
                {homeLoanBank}{homeLoanAmount ? ` · ${formatCurrencyCompact(homeLoanAmount)}` : ""}
              </span>
            </div>
          ) : null}

          {(allotmentLetterNo || bbaNo || tdsAmount != null) ? (
            <div className="px-2 py-1.5 space-y-0.5" style={{ borderTop: "1px solid var(--color-line)" }}>
              <p className="text-[0.4375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Compliance</p>
              {allotmentLetterNo && (
                <div className="flex justify-between text-[0.5rem]">
                  <span style={{ color: "var(--color-ink-500)" }}>Allotment:</span>
                  <span className="font-bold" style={{ color: "var(--color-ink-950)" }}>{allotmentLetterNo}{allotmentDate ? ` · ${formatDate(allotmentDate)}` : ""}</span>
                </div>
              )}
              {bbaNo && (
                <div className="flex justify-between text-[0.5rem]">
                  <span style={{ color: "var(--color-ink-500)" }}>BBA:</span>
                  <span className="font-bold" style={{ color: "var(--color-ink-950)" }}>{bbaNo}{bbaDate ? ` · ${formatDate(bbaDate)}` : ""}</span>
                </div>
              )}
              {tdsAmount != null && (
                <div className="flex justify-between text-[0.5rem]">
                  <span style={{ color: "var(--color-ink-500)" }}>TDS:</span>
                  <span className="font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>{formatCurrencyCompact(tdsAmount)}{tdsCertificateNo ? ` · ${tdsCertificateNo}` : ""}</span>
                </div>
              )}
            </div>
          ) : null}

          {notes ? (
            <div className="px-2 py-1.5" style={{ borderTop: "1px solid var(--color-line)" }}>
              <p className="text-[0.4375rem] font-semibold uppercase mb-0.5" style={{ color: "var(--color-ink-500)" }}>
                Notes
              </p>
              <p className="text-[0.5625rem]" style={{ color: "var(--color-ink-700)" }}>{notes}</p>
            </div>
          ) : null}
        </div>

        {/* Deal Details column */}
        <div className="flex flex-col gap-2">
          {/* Financial summary */}
          <div
            className="rounded-[0.5rem] border px-2 py-1.5"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          >
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[0.4375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Sale Price</span>
                <span className="text-[0.6875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>{formatCurrencyCompact(salePrice)}</span>
              </div>
              {gstRate > 0 ? (
                <div className="flex items-center justify-between">
                  <span className="text-[0.4375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>GST ({gstRate}%)</span>
                  <span className="text-[0.6875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>{formatCurrencyCompact(gstAmount)}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between">
                <span className="text-[0.4375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Cost</span>
                <span className="text-[0.6875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-700)" }}>{formatCurrencyCompact(costBasis)}</span>
              </div>
              <div className="flex items-center justify-between" style={{ borderTop: "1px solid var(--color-line)", paddingTop: "0.25rem" }}>
                <span className="text-[0.4375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Profit</span>
                <span
                  className="text-[0.6875rem] font-bold tabular-nums flex items-center gap-0.5"
                  style={{ color: profit >= 0 ? "var(--color-go)" : "var(--color-stop)" }}
                >
                  <TrendingUp className="size-2.5" />
                  {formatCurrencyCompact(profit)}
                </span>
              </div>
            </div>
          </div>

          {/* Deal source + broker + terms */}
          {(dealSource || brokerName || dealMaturityMonths || paymentCycle) && (
            <div
              className="rounded-[0.5rem] border overflow-hidden flex-1"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
            >
              {dealSource && (
                <div className="flex items-center justify-between px-2 py-1.5" style={{ borderBottom: (brokerName || commissionAmount || dealMaturityMonths || paymentCycle) ? `1px solid var(--color-line)` : undefined }}>
                  <span className="text-[0.4375rem] font-medium" style={{ color: "var(--color-ink-500)" }}>Source</span>
                  <span className="text-[0.5625rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
                    {dealSource === "BROKER" ? "Broker" : dealSource === "DIRECT" ? "Direct" : dealSource === "REFERRAL" ? "Referral" : dealSource}
                  </span>
                </div>
              )}
              {brokerName && (
                <div className="flex items-center justify-between px-2 py-1.5" style={{ borderBottom: (commissionAmount || dealMaturityMonths || paymentCycle) ? `1px solid var(--color-line)` : undefined }}>
                  <span className="text-[0.4375rem] font-medium" style={{ color: "var(--color-ink-500)" }}>Broker</span>
                  <div className="text-right">
                    <div className="text-[0.5625rem] font-bold" style={{ color: "var(--color-ink-950)" }}>{brokerName}</div>
                    {brokerPhone && <div className="text-[0.5rem]" style={{ color: "var(--color-ink-500)" }}>{brokerPhone}</div>}
                  </div>
                </div>
              )}
              {commissionAmount != null && commissionAmount > 0 && (
                <div className="flex items-center justify-between px-2 py-1.5" style={{ borderBottom: (dealMaturityMonths || paymentCycle) ? `1px solid var(--color-line)` : undefined }}>
                  <span className="text-[0.4375rem] font-medium" style={{ color: "var(--color-ink-500)" }}>Commission</span>
                  <div className="text-right">
                    <div className="text-[0.5625rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>{formatCurrency(commissionAmount)}</div>
                    <div className="text-[0.5rem]" style={{ color: commissionStatus === "PAID" ? "var(--color-go)" : "var(--color-ink-500)" }}>
                      {commissionStatus === "PAID" ? "Paid" : commissionStatus === "ACCRUED" ? "Accrued" : "Pending"}
                    </div>
                  </div>
                </div>
              )}
              {dealMaturityMonths && (
                <div className="flex items-center justify-between px-2 py-1.5" style={{ borderBottom: paymentCycle ? `1px solid var(--color-line)` : undefined }}>
                  <span className="text-[0.4375rem] font-medium" style={{ color: "var(--color-ink-500)" }}>Maturity</span>
                  <span className="text-[0.5625rem] font-bold" style={{ color: "var(--color-ink-950)" }}>{dealMaturityMonths} months</span>
                </div>
              )}
              {paymentCycle && (
                <div className="flex items-center justify-between px-2 py-1.5">
                  <span className="text-[0.4375rem] font-medium" style={{ color: "var(--color-ink-500)" }}>Payment Cycle</span>
                  <span className="text-[0.5625rem] font-bold" style={{ color: "var(--color-ink-950)" }}>{paymentCycle}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Expenses + Terms (consolidated) ── */}
      {(expenses.length > 0 || terms.length > 0) && (
        <div className="mb-2">
          <p className="text-[0.5625rem] font-bold uppercase tracking-wide mb-1 px-0.5" style={{ color: "var(--color-steel)" }}>
            Expenses & Terms
          </p>
          <div className="rounded-[0.5rem] border overflow-hidden" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
            {expenses.map((e, i) => (
              <div key={e.id} className="flex items-center justify-between px-2.5 py-1.5" style={i > 0 || (i === 0 && terms.length > 0) ? { borderTop: "1px solid var(--color-line)" } : undefined}>
                <div>
                  <div className="text-[0.6875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
                    {e.head === "REGISTRY" ? "Registry" : e.head === "STAMP_DUTY" ? "Stamp Duty" : e.head === "TRANSFER" ? "Transfer" : e.head === "LEASE_RENT" ? "Lease Rent" : e.head === "GST" ? "GST" : e.head}
                  </div>
                  <div className="text-[0.5625rem]" style={{ color: "var(--color-ink-500)" }}>
                    Borne by {e.borneBy === "CLIENT" ? "Client" : e.borneBy === "SELLER" ? "Seller" : "N/A"}
                    {e.isIncluded ? " · In deal" : " · Extra"}
                  </div>
                </div>
                <span className="text-[0.6875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>{formatCurrency(e.amount)}</span>
              </div>
            ))}
            {terms.map((t, i) => (
              <div key={t.id} className="px-2.5 py-1.5" style={i > 0 || (i === 0 && expenses.length > 0) ? { borderTop: "1px solid var(--color-line)" } : undefined}>
                <div className="text-[0.6875rem] font-medium" style={{ color: "var(--color-ink-950)" }}>{t.description}</div>
                <div className="text-[0.5625rem]" style={{ color: "var(--color-ink-500)" }}>
                  {t.isIncluded ? "Included in deal" : "Extra charge"}
                  {t.extraAmount != null && t.extraAmount > 0 ? ` · ${formatCurrency(t.extraAmount)}` : ""}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Payment schedule ── */}
      {paymentSchedule && paymentSchedule.items.length > 0 && (
        <div className="mb-2">
          <p className="text-[0.5625rem] font-bold uppercase tracking-wide mb-1 px-0.5" style={{ color: "var(--color-steel)" }}>
            Payment Schedule ({paymentSchedule.items.length})
          </p>
          <div className="rounded-[0.5rem] border overflow-hidden" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
            {paymentSchedule.items.map((it, i) => (
              <div key={it.id} className="flex items-center justify-between px-2.5 py-1.5" style={i > 0 ? { borderTop: "1px solid var(--color-line)" } : undefined}>
                <div className="min-w-0 flex-1">
                  <div className="text-[0.6875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
                    #{it.installmentNo} · {it.description}
                  </div>
                  <div className="text-[0.5625rem]" style={{ color: "var(--color-ink-500)" }}>
                    {it.percentage > 0 ? `${it.percentage}% · ` : ""}{formatCurrency(it.amount)}
                    {it.dueDate ? ` · Due ${new Date(it.dueDate).toLocaleDateString("en-IN")}` : ""}
                  </div>
                  {it.paidAmount > 0 && (
                    <div className="text-[0.5625rem] font-bold" style={{ color: it.status === "PAID" ? "var(--color-go)" : "var(--color-amber)" }}>
                      Paid {formatCurrency(it.paidAmount)} · {it.status === "PAID" ? "Settled" : it.status === "PARTIAL" ? "Partial" : "Pending"}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Payment history ── */}
      {payments.length > 0 ? (
        <>
          <p className="text-[0.5625rem] font-bold uppercase tracking-wide mb-1 px-0.5" style={{ color: "var(--color-steel)" }}>
            Payments ({payments.length})
          </p>
          <div
            className="rounded-[0.5rem] border overflow-hidden mb-2"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          >
            {payments.map((p, i) => (
              <div
                key={p.id}
                className="flex items-center gap-2 px-2.5 py-1.5"
                style={i > 0 ? { borderTop: "1px solid var(--color-line)" } : undefined}
              >
                <a
                  href={`/print/payment-receipt/${p.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 flex-1 min-w-0 press"
                >
                  <span
                    className="grid place-items-center size-6 rounded-full shrink-0"
                    style={{ backgroundColor: p.chequeStatus === "BOUNCED" ? "color-mix(in srgb, var(--color-stop) 12%, transparent)" : p.chequeStatus === "PENDING" ? "color-mix(in srgb, var(--color-signal) 12%, transparent)" : "color-mix(in srgb, var(--color-go) 12%, transparent)" }}
                  >
                    <Banknote className="size-3" style={{ color: p.chequeStatus === "BOUNCED" ? "var(--color-stop)" : p.chequeStatus === "PENDING" ? "var(--color-signal)" : "var(--color-go)" }} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.625rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
                      {p.mode}
                      {p.reference ? ` · ${p.reference}` : ""}
                    </p>
                    <p className="text-[0.5rem]" style={{ color: "var(--color-ink-500)" }}>
                      {formatDate(p.paymentDate)}
                      {p.chequeStatus === "PENDING" && <span style={{ color: "var(--color-signal)" }}> · Cheque Pending</span>}
                      {p.chequeStatus === "CLEARED" && <span style={{ color: "var(--color-go)" }}> · Cheque Cleared</span>}
                      {p.chequeStatus === "BOUNCED" && <span style={{ color: "var(--color-stop)" }}> · Cheque Bounced</span>}
                    </p>
                  </div>
                  <p className="text-[0.625rem] font-bold tabular-nums shrink-0" style={{ color: p.chequeStatus === "BOUNCED" ? "var(--color-stop)" : "var(--color-go)" }}>
                    {formatCurrencyCompact(p.amount)}
                  </p>
                  <Printer className="size-3 shrink-0" style={{ color: "var(--color-ink-500)" }} />
                </a>
                {canManage && p.chequeStatus === "PENDING" ? (
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={(e) => { e.preventDefault(); handleChequeAction(p.id, "clear"); }}
                      disabled={submitting}
                      className="rounded-[0.25rem] px-1.5 py-1 text-[0.5rem] font-bold press disabled:opacity-50"
                      style={{ backgroundColor: "var(--color-go)", color: "#fff" }}
                    >
                      Clear
                    </button>
                    <button
                      onClick={(e) => { e.preventDefault(); handleChequeAction(p.id, "bounce"); }}
                      disabled={submitting}
                      className="rounded-[0.25rem] px-1.5 py-1 text-[0.5rem] font-bold press disabled:opacity-50"
                      style={{ backgroundColor: "var(--color-stop)", color: "#fff" }}
                    >
                      Bounce
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </>
      ) : null}

      {/* ── Documents section (ATS / BBA / Registry) ── */}
      <div className="mb-3">
        <p className="text-[0.5625rem] font-bold uppercase tracking-wide mb-1.5 px-0.5" style={{ color: "var(--color-steel)" }}>
          Documents
        </p>
        <div
          className="rounded-[0.5rem] border overflow-hidden"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          {/* ATS */}
          <div className="px-2.5 py-2" style={{ borderBottom: "1px solid var(--color-line)" }}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[0.5625rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
                Agreement to Sell (ATS)
              </span>
              {atsDocumentUrl ? (
                <span className="text-[0.4375rem] font-bold uppercase" style={{ color: "var(--color-go)" }}>Uploaded</span>
              ) : (
                <span className="text-[0.4375rem] font-bold uppercase" style={{ color: "var(--color-ink-400)" }}>Optional</span>
              )}
            </div>
            {atsDocumentUrl ? (
              <a href={atsDocumentUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[0.5rem] press" style={{ color: "var(--color-ink-600)" }}>
                <ExternalLink className="size-2.5" />
                <span className="truncate">{atsDocumentName || "View ATS"}</span>
              </a>
            ) : canManage && !isCancelled ? (
              <MobileDocUploader
                url=""
                label="Upload ATS"
                onUpload={(url, name) => uploadSaleDocument("ATS", url, name)}
              />
            ) : (
              <p className="text-[0.5rem]" style={{ color: "var(--color-ink-400)" }}>Not uploaded</p>
            )}
          </div>

          {/* BBA */}
          <div className="px-2.5 py-2" style={{ borderBottom: "1px solid var(--color-line)" }}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[0.5625rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
                Builder-Buyer Agreement (BBA)
              </span>
              {bbaDocumentUrl ? (
                <span className="text-[0.4375rem] font-bold uppercase" style={{ color: "var(--color-go)" }}>Uploaded</span>
              ) : (
                <span className="text-[0.4375rem] font-bold uppercase" style={{ color: "var(--color-ink-400)" }}>Optional</span>
              )}
            </div>
            {bbaDocumentUrl ? (
              <a href={bbaDocumentUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[0.5rem] press" style={{ color: "var(--color-ink-600)" }}>
                <ExternalLink className="size-2.5" />
                <span className="truncate">{bbaDocumentName || "View BBA"}</span>
              </a>
            ) : canManage && !isCancelled ? (
              <MobileDocUploader
                url=""
                label="Upload BBA"
                onUpload={(url, name) => uploadSaleDocument("BBA", url, name)}
              />
            ) : (
              <p className="text-[0.5rem]" style={{ color: "var(--color-ink-400)" }}>Not uploaded</p>
            )}
          </div>

          {/* Registry — required for completion */}
          <div className="px-2.5 py-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[0.5625rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
                Registry Document
              </span>
              {registryDocumentUrl ? (
                <span className="text-[0.4375rem] font-bold uppercase" style={{ color: "var(--color-go)" }}>Uploaded</span>
              ) : (
                <span className="text-[0.4375rem] font-bold uppercase" style={{ color: "var(--color-signal)" }}>Required</span>
              )}
            </div>
            {registryDocumentUrl ? (
              <a href={registryDocumentUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[0.5rem] press" style={{ color: "var(--color-ink-600)" }}>
                <ExternalLink className="size-2.5" />
                <span className="truncate">{registryDocumentName || "View Registry"}</span>
              </a>
            ) : canManage && !isCancelled ? (
              <MobileDocUploader
                url=""
                label="Upload Registry Document"
                required
                onUpload={(url, name) => uploadSaleDocument("REGISTRY", url, name)}
              />
            ) : (
              <p className="text-[0.5rem]" style={{ color: "var(--color-ink-400)" }}>Not uploaded</p>
            )}
            {!registryDocumentUrl && !isCompleted && (
              <p className="text-[0.4375rem] mt-1" style={{ color: "var(--color-signal)" }}>
                Registry document is required to complete the sale.
              </p>
            )}
          </div>
        </div>
        {docUploading && <p className="text-[0.4375rem] mt-1" style={{ color: "var(--color-ink-500)" }}>Uploading…</p>}
      </div>

      {/* ── Record Deposit action ── */}
      {canManage && !isCancelled && !isCompleted && saleStage === "PENDING" ? (
        <button
          onClick={() => setShowDeposit(true)}
          className="flex items-center justify-center gap-1.5 w-full rounded-[0.5rem] py-2 mb-2 press"
          style={{ backgroundColor: "var(--color-ink-100)", color: "var(--color-ink-950)" }}
        >
          <Banknote className="size-3.5" />
          <span className="text-[0.6875rem] font-bold">Record Deposit</span>
        </button>
      ) : null}

      {/* ── Complete sale action ── */}
      {canManage && !isCancelled && !isCompleted ? (
        <button
          onClick={() => setShowComplete(true)}
          className="flex items-center justify-center gap-1.5 w-full rounded-[0.5rem] py-2.5 mb-2 press"
          style={{ backgroundColor: "var(--color-go)", color: "#fff" }}
        >
          <CheckCircle2 className="size-3.5" />
          <span className="text-[0.6875rem] font-bold">Complete Sale</span>
        </button>
      ) : null}

      {/* ── Cancel action ── */}
      {canManage && !isCancelled ? (
        <button
          onClick={() => setShowCancel(true)}
          className="flex items-center justify-center gap-1.5 w-full rounded-[0.5rem] border py-2 press"
          style={{ borderColor: "color-mix(in srgb, var(--color-stop) 30%, var(--color-line))", color: "var(--color-stop)" }}
        >
          <XCircle className="size-3.5" />
          <span className="text-[0.6875rem] font-bold">Cancel Sale</span>
        </button>
      ) : null}

      {/* ── Cancel confirmation modal ── */}
      {showCancel ? (
        <Modal onClose={() => setShowCancel(false)} title="Cancel Sale?">
          <p className="text-[0.6875rem] mb-3" style={{ color: "var(--color-ink-700)" }}>
            Cancel sale <span className="font-mono font-bold">{saleNumber}</span>? This will reverse the sale and release the asset. This cannot be undone.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setShowCancel(false)}
              className="flex-1 rounded-[0.5rem] border py-2 text-[0.6875rem] font-bold press"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
            >
              Keep Sale
            </button>
            <button
              onClick={handleCancel}
              disabled={submitting}
              className="flex-1 rounded-[0.5rem] py-2 text-[0.6875rem] font-bold press disabled:opacity-50"
              style={{ backgroundColor: "var(--color-stop)", color: "#fff" }}
            >
              {submitting ? <Loader2 className="size-3.5 animate-spin mx-auto" /> : "Cancel Sale"}
            </button>
          </div>
        </Modal>
      ) : null}

      {/* ── Payment modal ── */}
      {showPayment ? (
        <Modal onClose={() => setShowPayment(false)} title="Record Payment">
          <form onSubmit={handlePayment} className="space-y-3">
            <div>
              <label className="text-[0.5rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
                Amount *
              </label>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                placeholder={balanceDue.toFixed(2)}
                required
                autoFocus
                className="w-full rounded-[0.375rem] border px-2.5 py-2 text-[0.875rem] font-bold tabular-nums outline-none focus:ring-2"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
              />
              {balanceDue > 0 ? (
                <button
                  type="button"
                  onClick={() => setPayAmount(balanceDue.toFixed(2))}
                  className="text-[0.5rem] font-bold mt-1"
                  style={{ color: "var(--color-go)" }}
                >
                  Full balance: {formatCurrency(balanceDue)}
                </button>
              ) : null}
            </div>
            <div>
              <label className="text-[0.5rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
                Mode
              </label>
              <select
                value={payMode}
                onChange={(e) => setPayMode(e.target.value as (typeof PAYMENT_MODES)[number])}
                className="w-full rounded-[0.375rem] border px-2.5 py-2 text-[0.75rem] outline-none focus:ring-2"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
              >
                {PAYMENT_MODES.map((m) => (
                  <option key={m} value={m}>{m.replace("_", " ")}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[0.5rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
                Reference
              </label>
              <input
                type="text"
                value={payRef}
                onChange={(e) => setPayRef(e.target.value)}
                placeholder="Cheque / UTR no."
                className="w-full rounded-[0.375rem] border px-2.5 py-2 text-[0.75rem] outline-none focus:ring-2"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
              />
            </div>
            {payMode === "CHEQUE" && <MobileChequeFields value={payCheque} onChange={setPayCheque} />}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowPayment(false)}
                className="flex-1 rounded-[0.5rem] border py-2 text-[0.6875rem] font-bold press"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 rounded-[0.5rem] py-2 text-[0.6875rem] font-bold press disabled:opacity-50"
                style={{ backgroundColor: "var(--color-go)", color: "#fff" }}
              >
                {submitting ? <Loader2 className="size-3.5 animate-spin mx-auto" /> : "Record"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {/* ── Deposit modal ── */}
      {showDeposit ? (
        <Modal onClose={() => setShowDeposit(false)} title="Record Deposit">
          <form onSubmit={handleDeposit} className="space-y-3">
            <div>
              <label className="text-[0.5625rem] font-bold uppercase mb-1 block" style={{ color: "var(--color-ink-600)" }}>
                Deposit Amount
              </label>
              <input
                type="number"
                value={depAmount}
                onChange={(e) => setDepAmount(e.target.value)}
                placeholder="0"
                step="0.01"
                className="w-full rounded-[0.375rem] border px-2.5 py-2 text-[0.6875rem] tabular-nums"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
                required
              />
            </div>
            <div>
              <label className="text-[0.5625rem] font-bold uppercase mb-1 block" style={{ color: "var(--color-ink-600)" }}>
                Payment Mode
              </label>
              <select
                value={depMode}
                onChange={(e) => setDepMode(e.target.value as (typeof PAYMENT_MODES)[number])}
                className="w-full rounded-[0.375rem] border px-2.5 py-2 text-[0.6875rem]"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
              >
                {PAYMENT_MODES.map((m) => <option key={m} value={m}>{m.replaceAll("_", " ")}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[0.5625rem] font-bold uppercase mb-1 block" style={{ color: "var(--color-ink-600)" }}>
                Reference (optional)
              </label>
              <input
                type="text"
                value={depRef}
                onChange={(e) => setDepRef(e.target.value)}
                placeholder="Cheque / UTR no."
                className="w-full rounded-[0.375rem] border px-2.5 py-2 text-[0.6875rem]"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
              />
            </div>
            {depMode === "CHEQUE" && <MobileChequeFields value={depCheque} onChange={setDepCheque} />}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-[0.375rem] py-2.5 text-[0.6875rem] font-bold press disabled:opacity-50"
              style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
            >
              {submitting ? <Loader2 className="size-3.5 animate-spin mx-auto" /> : "Record Deposit"}
            </button>
          </form>
        </Modal>
      ) : null}

      {/* ── Complete sale modal ── */}
      {showComplete ? (
        <Modal onClose={() => setShowComplete(false)} title="Complete Sale">
          <form onSubmit={handleComplete} className="space-y-3">
            <p className="text-[0.5625rem] rounded-[0.375rem] px-2.5 py-1.5" style={{ backgroundColor: "color-mix(in srgb, var(--color-go) 8%, var(--color-paper))", color: "var(--color-ink-700)" }}>
              Completing the sale registers the sale deed, recognises revenue, and transfers title. Balance due: <strong style={{ color: "var(--color-go)" }}>{formatCurrency(balanceDue)}</strong>
            </p>

            <div>
              <label className="text-[0.5rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
                Sale Deed / Registry No.
              </label>
              <input
                type="text"
                value={compSaleDeedNo}
                onChange={(e) => setCompSaleDeedNo(e.target.value)}
                placeholder="e.g. SR-1234/2025"
                className="w-full rounded-[0.375rem] border px-2.5 py-2 text-[0.75rem] outline-none focus:ring-2"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
              />
            </div>

            <div>
              <label className="text-[0.5rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
                Payment Mode
              </label>
              <select
                value={compPayMode}
                onChange={(e) => setCompPayMode(e.target.value as (typeof PAYMENT_MODES)[number])}
                className="w-full rounded-[0.375rem] border px-2.5 py-2 text-[0.75rem] outline-none focus:ring-2"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
              >
                {PAYMENT_MODES.map((m) => (
                  <option key={m} value={m}>{m.replace("_", " ")}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[0.5rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
                Reference
              </label>
              <input
                type="text"
                value={compRef}
                onChange={(e) => setCompRef(e.target.value)}
                placeholder="Cheque / UTR no."
                className="w-full rounded-[0.375rem] border px-2.5 py-2 text-[0.75rem] outline-none focus:ring-2"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
              />
            </div>

            {/* Compliance documents */}
            {/* Document uploads — ATS / BBA / Registry */}
            <div className="rounded-[0.375rem] border p-2.5 space-y-2" style={{ borderColor: "color-mix(in srgb, var(--color-signal) 30%, var(--color-line))", backgroundColor: "color-mix(in srgb, var(--color-signal) 4%, var(--color-paper))" }}>
              <p className="text-[0.5rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-signal)" }}>
                Sale Documents
              </p>
              <div>
                <label className="text-[0.4375rem] font-semibold uppercase block mb-0.5" style={{ color: "var(--color-ink-500)" }}>
                  Agreement to Sell (ATS) — optional
                </label>
                <MobileDocUploader
                  url={atsDocumentUrl || compAtsDocUrl}
                  fileName={atsDocumentName || compAtsDocName}
                  label="Upload ATS"
                  onUpload={(url, name) => { setCompAtsDocUrl(url); setCompAtsDocName(name); }}
                  onRemove={() => { setCompAtsDocUrl(""); setCompAtsDocName(""); }}
                />
              </div>
              <div>
                <label className="text-[0.4375rem] font-semibold uppercase block mb-0.5" style={{ color: "var(--color-ink-500)" }}>
                  Builder-Buyer Agreement (BBA) — optional
                </label>
                <MobileDocUploader
                  url={bbaDocumentUrl || compBbaDocUrl}
                  fileName={bbaDocumentName || compBbaDocName}
                  label="Upload BBA"
                  onUpload={(url, name) => { setCompBbaDocUrl(url); setCompBbaDocName(name); }}
                  onRemove={() => { setCompBbaDocUrl(""); setCompBbaDocName(""); }}
                />
              </div>
              <div>
                <label className="text-[0.4375rem] font-semibold uppercase block mb-0.5" style={{ color: "var(--color-signal)" }}>
                  Registry Document — required *
                </label>
                <MobileDocUploader
                  url={registryDocumentUrl || compRegistryDocUrl}
                  fileName={registryDocumentName || compRegistryDocName}
                  label="Upload Registry Document"
                  required
                  onUpload={(url, name) => { setCompRegistryDocUrl(url); setCompRegistryDocName(name); }}
                  onRemove={() => { setCompRegistryDocUrl(""); setCompRegistryDocName(""); }}
                />
                {!registryDocumentUrl && !compRegistryDocUrl && (
                  <p className="text-[0.4375rem] mt-1" style={{ color: "var(--color-signal)" }}>
                    Sale cannot be completed without the registry document.
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-[0.375rem] border p-2.5 space-y-2.5" style={{ borderColor: "var(--color-line)" }}>
              <p className="text-[0.5rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
                Compliance Documents
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[0.4375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Allotment Letter No.</label>
                  <input type="text" value={compAllotmentNo}
                    onChange={(e) => setCompAllotmentNo(e.target.value)}
                    placeholder="AL-001"
                    className="w-full rounded-[0.375rem] border px-2 py-1.5 text-[0.6875rem] outline-none"
                    style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }} />
                </div>
                <div>
                  <label className="text-[0.4375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Allotment Date</label>
                  <input type="date" value={compAllotmentDate}
                    onChange={(e) => setCompAllotmentDate(e.target.value)}
                    className="w-full rounded-[0.375rem] border px-2 py-1.5 text-[0.6875rem] outline-none"
                    style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[0.4375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>BBA No.</label>
                  <input type="text" value={compBbaNo}
                    onChange={(e) => setCompBbaNo(e.target.value)}
                    placeholder="BBA-001"
                    className="w-full rounded-[0.375rem] border px-2 py-1.5 text-[0.6875rem] outline-none"
                    style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }} />
                </div>
                <div>
                  <label className="text-[0.4375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>BBA Date</label>
                  <input type="date" value={compBbaDate}
                    onChange={(e) => setCompBbaDate(e.target.value)}
                    className="w-full rounded-[0.375rem] border px-2 py-1.5 text-[0.6875rem] outline-none"
                    style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[0.4375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>TDS Amount (₹)</label>
                  <input type="number" min="0" step="0.01" value={compTdsAmount}
                    onChange={(e) => setCompTdsAmount(e.target.value)}
                    placeholder="1% if > ₹50L"
                    className="w-full rounded-[0.375rem] border px-2 py-1.5 text-[0.6875rem] tabular-nums outline-none"
                    style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }} />
                </div>
                <div>
                  <label className="text-[0.4375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>TDS Certificate No.</label>
                  <input type="text" value={compTdsCertNo}
                    onChange={(e) => setCompTdsCertNo(e.target.value)}
                    placeholder="Form 16B no."
                    className="w-full rounded-[0.375rem] border px-2 py-1.5 text-[0.6875rem] outline-none"
                    style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }} />
                </div>
              </div>
              {/* Home loan details */}
              <p className="text-[0.4375rem] font-bold uppercase pt-1" style={{ color: "var(--color-ink-500)" }}>Home Loan (if applicable)</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[0.4375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Bank / Lender</label>
                  <input type="text" value={compLoanBank}
                    onChange={(e) => setCompLoanBank(e.target.value)}
                    placeholder="HDFC, SBI…"
                    className="w-full rounded-[0.375rem] border px-2 py-1.5 text-[0.6875rem] outline-none"
                    style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }} />
                </div>
                <div>
                  <label className="text-[0.4375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Loan Amount (₹)</label>
                  <input type="number" min="0" step="0.01" value={compLoanAmount}
                    onChange={(e) => setCompLoanAmount(e.target.value)}
                    placeholder="0"
                    className="w-full rounded-[0.375rem] border px-2 py-1.5 text-[0.6875rem] tabular-nums outline-none"
                    style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[0.4375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Sanction No.</label>
                  <input type="text" value={compLoanSanctionNo}
                    onChange={(e) => setCompLoanSanctionNo(e.target.value)}
                    placeholder="Sanction letter no."
                    className="w-full rounded-[0.375rem] border px-2 py-1.5 text-[0.6875rem] outline-none"
                    style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }} />
                </div>
                <div>
                  <label className="text-[0.4375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Sanction Date</label>
                  <input type="date" value={compLoanSanctionDate}
                    onChange={(e) => setCompLoanSanctionDate(e.target.value)}
                    className="w-full rounded-[0.375rem] border px-2 py-1.5 text-[0.6875rem] outline-none"
                    style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }} />
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowComplete(false)}
                className="flex-1 rounded-[0.5rem] border py-2 text-[0.6875rem] font-bold press"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 rounded-[0.5rem] py-2 text-[0.6875rem] font-bold press disabled:opacity-50"
                style={{ backgroundColor: "var(--color-go)", color: "#fff" }}
              >
                {submitting ? <Loader2 className="size-3.5 animate-spin mx-auto" /> : "Complete"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

/* ─── Modal ─── */
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 50%, transparent)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-[0.75rem] border p-4 pb-6"
        style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <p className="text-[0.75rem] font-bold" style={{ color: "var(--color-ink-950)" }}>{title}</p>
          <button onClick={onClose} className="press">
            <X className="size-4" style={{ color: "var(--color-ink-500)" }} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
