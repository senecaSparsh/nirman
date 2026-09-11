"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShoppingCart, IndianRupee, Building2, MapPin, ShieldCheck, Plus, Trash2, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { formatCurrencyCompact, formatNumber } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";
import { MobileNewCustomerDialog } from "@/app/m/sales/MobileNewCustomerDialog";
import { MobileNewProjectDialog } from "@/app/m/projects/MobileNewProjectDialog";
import { MobileNewBrokerClient } from "@/app/m/brokers/new/MobileNewBrokerClient";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import { MobileChequeFields, EMPTY_MOBILE_CHEQUE, type MobileChequeState } from "@/app/m/sales/MobileChequeFields";
import { EnumSelect } from "@/components/mobile/v2/form-primitives";

// ── Expense heads (same as desktop SaleExpenseGrid) ──
type ExpenseHead = "REGISTRY" | "STAMP_DUTY" | "TRANSFER" | "LEASE_RENT" | "GST" | "OTHER";
const EXPENSE_HEADS: { value: ExpenseHead; label: string }[] = [
  { value: "REGISTRY", label: "Registry" },
  { value: "STAMP_DUTY", label: "Stamp Duty" },
  { value: "TRANSFER", label: "Transfer" },
  { value: "LEASE_RENT", label: "Lease Rent" },
  { value: "GST", label: "GST" },
  { value: "OTHER", label: "Other" },
];
type MobileExpenseRow = { head: ExpenseHead; amount: string; borneBy: "CLIENT" | "SELLER" | "NA" };
type MobileTermRow = { description: string; extraAmount: string; isIncluded: boolean };
type MobileScheduleRow = { description: string; percentage: string; amount: string; dueDate: string };

interface UnitOpt {
  id: string;
  label: string;
  projectId: string;
  projectReraNumber: string | null;
  askingPrice: number | null;
  area: number;
  areaUnit: string;
}
interface ParcelOpt {
  id: string;
  label: string;
  projectId: string | null;
  projectReraNumber: string | null;
  askingPrice: number | null;
  area: number;
  areaUnit: string;
}
interface CustomerOpt {
  id: string;
  name: string;
  phone: string | null;
}
interface ProjectOpt {
  id: string;
  name: string;
}

const PAYMENT_MODES = ["CASH", "BANK_TRANSFER", "CHEQUE", "UPI", "OTHER"] as const;

const _inputClass =
  "w-full h-7 px-1 text-m-caption font-medium outline-none border-b focus:border-b-2 transition-colors";
const _inputStyle = {
  backgroundColor: "transparent",
} as React.CSSProperties;

// Compact variant for use inside 2-col grid (narrower columns)
const inputClassSm =
  "w-full h-8 rounded-[0.375rem] border px-2 text-m-caption font-medium outline-none";
const inputStyleSm = {
  borderColor: "var(--color-line)",
  backgroundColor: "var(--color-paper)",
  color: "var(--color-ink-950)",
} as React.CSSProperties;

// Compact FormField for 2-col grid (smaller label, tighter spacing)
function FormFieldSm({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        className="block text-m-caption font-semibold mb-0.5"
        style={{ color: "var(--color-ink-500)" }}
      >
        {label}
        {required ? <span style={{ color: "var(--color-stop)" }}> *</span> : null}
      </label>
      {children}
    </div>
  );
}

/**
 * Mobile new-sale form. Posts to the existing POST /api/sales endpoint
 * (sellAsset service). On success, redirects to the sales list so the
 * user can record the initial payment inline.
 */
export function MobileNewSaleForm({
  units,
  parcels,
  customers: initialCustomers,
  projects,
  brokers = [],
  initialBuiltUnitId,
  initialLandParcelId,
  initialCustomerId,
  initialProjectId,
  existingPhones: _existingPhones = [],
  sellableProjects = [],
}: {
  units: UnitOpt[];
  parcels: ParcelOpt[];
  customers: CustomerOpt[];
  projects: ProjectOpt[];
  brokers?: { id: string; name: string; phone: string; agency: string; defaultCommissionPercent: number | null }[];
  sellableProjects?: ProjectOpt[];
  initialBuiltUnitId?: string;
  initialLandParcelId?: string;
  initialCustomerId?: string;
  initialProjectId?: string;
  existingPhones?: string[];
}) {
  const router = useRouter();
  const [customers, setCustomers] = useState<CustomerOpt[]>(initialCustomers);
  const [localBrokers, setLocalBrokers] = useState(brokers);
  // If initialProjectId is provided and there are units for that project,
  // default to BUILT_UNIT with the first unit of that project pre-selected.
  const projectUnits = initialProjectId ? units.filter((u) => u.projectId === initialProjectId) : [];
  const projectParcels = initialProjectId ? parcels.filter((p) => p.projectId === initialProjectId) : [];
  const [assetType, setAssetType] = useState<"BUILT_UNIT" | "LAND" | "PROJECT">(
    initialBuiltUnitId ? "BUILT_UNIT"
      : initialLandParcelId ? "LAND"
      : projectUnits.length > 0 ? "BUILT_UNIT"
      : projectParcels.length > 0 ? "LAND"
      : initialProjectId ? "PROJECT"
      : "BUILT_UNIT",
  );
  const [builtUnitId, setBuiltUnitId] = useState(
    initialBuiltUnitId ?? projectUnits[0]?.id ?? units[0]?.id ?? "",
  );
  const [landParcelId, setLandParcelId] = useState(
    initialLandParcelId ?? projectParcels[0]?.id ?? parcels[0]?.id ?? "",
  );
  const [projectId, setProjectId] = useState(initialProjectId ?? "");
  const [customerId, setCustomerId] = useState(initialCustomerId ?? initialCustomers[0]?.id ?? "");
  const [salePrice, setSalePrice] = useState("");
  const [gstRate, setGstRate] = useState("0");
  const [initialPayment, setInitialPayment] = useState("");
  const [initialPaymentMode, setInitialPaymentMode] = useState<string>("BANK_TRANSFER");
  const [initialCheque, setInitialCheque] = useState<MobileChequeState>(EMPTY_MOBILE_CHEQUE);
  const [notes, setNotes] = useState("");
  // Sale deed / ATS tracking — merged: either ATS no or registry no
  const [isATS, setIsATS] = useState(true); // default: booking, registry deferred
  const [saleDeedNo, setSaleDeedNo] = useState("");
  const [expectedRegistryDate, setExpectedRegistryDate] = useState("");
  const [atsNo, setAtsNo] = useState("");
  const [atsDate, setAtsDate] = useState("");
  const [allowRegistryBeforeFullPayment, setAllowRegistryBeforeFullPayment] = useState(false);
  // Home loan tracking (optional)
  const [hasHomeLoan, setHasHomeLoan] = useState(false);
  const [homeLoanBank, setHomeLoanBank] = useState("");
  const [homeLoanAmount, setHomeLoanAmount] = useState("");
  const [homeLoanSanctionNo, setHomeLoanSanctionNo] = useState("");
  const [homeLoanSanctionDate, setHomeLoanSanctionDate] = useState("");
  // Deal terms
  const [dealMaturityMonths, setDealMaturityMonths] = useState("");
  const [paymentCycle, setPaymentCycle] = useState("");
  const [dealSource, setDealSource] = useState<"SELF" | "BROKER">("SELF");
  const [brokerId, setBrokerId] = useState("");
  const [brokerName, setBrokerName] = useState("");
  const [brokerPhone, setBrokerPhone] = useState("");
  const [commissionAmount, setCommissionAmount] = useState("");
  const [commissionIsPartOfDeal, setCommissionIsPartOfDeal] = useState(false);
  // Expenses, terms, payment plan
  const [expenses, setExpenses] = useState<MobileExpenseRow[]>(
    EXPENSE_HEADS.slice(0, 5).map((h) => ({ head: h.value, amount: "", borneBy: "NA" })),
  );
  const [terms, setTerms] = useState<MobileTermRow[]>([]);
  const [schedule, setSchedule] = useState<MobileScheduleRow[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const assetOptions = assetType === "BUILT_UNIT" ? units : assetType === "LAND" ? parcels : [];
  const selectedAssetId = assetType === "BUILT_UNIT" ? builtUnitId : landParcelId;
  const selectedAsset = assetOptions.find((a) => a.id === selectedAssetId);
  // For PROJECT type, projectId comes from the project selector.
  // For BUILT_UNIT/LAND, it's derived from the selected asset.
  const effectiveProjectId = assetType === "PROJECT" ? projectId : (selectedAsset?.projectId ?? projects[0]?.id ?? "");

  // Pre-fill sale price from the unit's asking price when an asset is chosen.
  const suggestedPrice = useMemo(() => {
    if (assetType === "PROJECT") {
      // For project sales, no auto-fill — user enters the deal price
      return "";
    }
    if (!selectedAsset) return "";
    return selectedAsset.askingPrice ? String(selectedAsset.askingPrice) : "";
  }, [selectedAsset, assetType]);

  function onAssetChange(id: string) {
    if (assetType === "BUILT_UNIT") setBuiltUnitId(id);
    else setLandParcelId(id);
    const a = assetOptions.find((x) => x.id === id);
    setSalePrice(a?.askingPrice ? String(a.askingPrice) : "");
  }

  function onProjectChange(id: string) {
    setProjectId(id);
    // Don't auto-fill price for project sales — user enters the deal price
  }

  async function submit() {
    if (!customerId) {
      haptic([50, 20, 50]);
      return toast.error("Select a customer");
    }
    if (!effectiveProjectId) {
      haptic([50, 20, 50]);
      return toast.error("No project for this asset");
    }
    if (assetType !== "PROJECT" && !selectedAssetId) {
      haptic([50, 20, 50]);
      return toast.error(`Select a ${assetType === "BUILT_UNIT" ? "unit" : "parcel"} to sell`);
    }
    if (assetType === "PROJECT" && !projectId) {
      haptic([50, 20, 50]);
      return toast.error("Select a project to sell");
    }
    const price = Number(salePrice || suggestedPrice);
    if (!(price > 0)) {
      haptic([50, 20, 50]);
      return toast.error("Enter a valid sale price");
    }
    const payment = initialPayment ? Number(initialPayment) : undefined;
    if (payment != null && !(payment >= 0)) {
      haptic([50, 20, 50]);
      return toast.error("Invalid initial payment");
    }
    if (payment && initialPaymentMode === "CHEQUE" && !initialCheque.chequeNo.trim()) {
      haptic([50, 20, 50]);
      return toast.error("Cheque number is required for cheque payments");
    }

    setSubmitting(true);
    haptic(10);
    try {
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetType,
          builtUnitId: assetType === "BUILT_UNIT" ? builtUnitId : null,
          landParcelId: assetType === "LAND" ? landParcelId : null,
          projectId: assetType === "PROJECT" ? projectId : effectiveProjectId,
          customerId,
          salePrice: price,
          gstRate: Number(gstRate) || 0,
          initialPayment: payment,
          initialPaymentMode: payment ? initialPaymentMode : undefined,
          ...(payment && initialPaymentMode === "CHEQUE" ? {
            initialChequeNo: initialCheque.chequeNo.trim() || undefined,
            initialChequeDate: initialCheque.chequeDate || undefined,
            initialChequeBank: initialCheque.chequeBank.trim() || undefined,
            initialChequePhotoUrl: initialCheque.chequePhotoUrl || undefined,
          } : {}),
          notes: notes || null,
          // Sale deed / ATS tracking — merged: either ATS no or registry no
          saleDeedNo: !isATS && saleDeedNo.trim() ? saleDeedNo.trim() : null,
          expectedRegistryDate: isATS && expectedRegistryDate ? expectedRegistryDate : null,
          atsNo: isATS && atsNo.trim() ? atsNo.trim() : null,
          atsDate: isATS && atsDate ? atsDate : null,
          allowRegistryBeforeFullPayment,
          // Home loan tracking
          homeLoanBank: hasHomeLoan && homeLoanBank.trim() ? homeLoanBank.trim() : null,
          homeLoanAmount: hasHomeLoan && homeLoanAmount ? Number(homeLoanAmount) : null,
          homeLoanSanctionNo: hasHomeLoan && homeLoanSanctionNo.trim() ? homeLoanSanctionNo.trim() : null,
          homeLoanSanctionDate: hasHomeLoan && homeLoanSanctionDate ? homeLoanSanctionDate : null,
          // Deal terms
          dealMaturityMonths: dealMaturityMonths ? Number(dealMaturityMonths) : null,
          paymentCycle: paymentCycle.trim() || null,
          // Broker / deal source
          dealSource,
          brokerId: dealSource === "BROKER" && brokerId ? brokerId : null,
          brokerName: dealSource === "BROKER" && brokerName.trim() ? brokerName.trim() : null,
          brokerPhone: dealSource === "BROKER" && brokerPhone.trim() ? brokerPhone.trim() : null,
          commissionAmount: dealSource === "BROKER" && commissionAmount ? Number(commissionAmount) : null,
          commissionIsPartOfDeal: dealSource === "BROKER" && commissionIsPartOfDeal,
          // Expenses — only send those with amount > 0 and not NA
          expenses: expenses
            .filter((e) => Number(e.amount) > 0 && e.borneBy !== "NA")
            .map((e) => ({ head: e.head, amount: Number(e.amount), borneBy: e.borneBy, isIncluded: false })),
          // Terms
          terms: terms
            .filter((t) => t.description.trim())
            .map((t) => ({
              description: t.description.trim(),
              extraAmount: t.extraAmount ? Number(t.extraAmount) : null,
              isIncluded: t.isIncluded,
            })),
          // Payment schedule
          paymentSchedule: schedule.length > 0
            ? {
                type: "TLP",
                items: schedule.map((item, i) => ({
                  installmentNo: i + 1,
                  description: item.description,
                  percentage: Number(item.percentage) || 0,
                  amount: Number(item.amount) || 0,
                  dueDate: item.dueDate || null,
                })),
              }
            : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create sale");
      haptic([10, 40, 80]);
      const saleId = data.id ?? data.saleId;
      const balanceAfter = price - (payment ?? 0);
      // If fully paid, offer to print the sale form immediately.
      // If there's a balance, go to the sale detail to record the deposit.
      if (balanceAfter <= 0 && saleId) {
        toast.success(`Booking ${data.saleNumber} created`, {
          action: {
            label: "Print Form",
            onClick: () => router.push(`/sales/${saleId}/print`),
          },
        });
        router.push(`/m/sales/${saleId}`);
      } else if (saleId) {
        toast.success(`Booking ${data.saleNumber} created`, {
          action: {
            label: "Record Deposit",
            onClick: () => router.push(`/m/sales/${saleId}`),
          },
        });
        router.push(`/m/sales/${saleId}`);
      } else {
        toast.success(`Booking ${data.saleNumber} created`);
        router.push("/m/sales");
      }
      router.refresh();
    } catch (err) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSubmitting(false);
    }
  }

  const priceValue = Number(salePrice || suggestedPrice) || 0;
  const gstValue = priceValue * (Number(gstRate) || 0) / 100;
  const totalValue = priceValue + gstValue;

  return (
    <div className="pb-2">
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex flex-col gap-2.5">
        {/* ══════ SECTION: WHAT ══════ */}
        {/* ── Asset type (full width) ── */}
        <div>
          <p className="text-m-caption font-semibold mb-1.5" style={{ color: "var(--color-ink-500)" }}>
            Asset type <span style={{ color: "var(--color-stop)" }}>*</span>
          </p>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => { setAssetType("BUILT_UNIT"); haptic(10); }}
              className="flex flex-col items-center gap-1 rounded-[0.5rem] border p-2.5 text-m-body press"
              style={{
                borderColor: assetType === "BUILT_UNIT" ? "var(--color-ink-950)" : "var(--color-line)",
                backgroundColor: assetType === "BUILT_UNIT" ? "var(--color-concrete)" : "var(--color-paper)",
              }}
            >
              <Building2
                className="size-4"
                style={{ color: assetType === "BUILT_UNIT" ? "var(--color-ink-950)" : "var(--color-ink-400)" }}
              />
              <span
                className="text-m-caption font-bold"
                style={{ color: assetType === "BUILT_UNIT" ? "var(--color-ink-950)" : "var(--color-ink-500)" }}
              >
                Unit
              </span>
            </button>
            <button
              type="button"
              onClick={() => { setAssetType("LAND"); haptic(10); }}
              className="flex flex-col items-center gap-1 rounded-[0.5rem] border p-2.5 text-m-body press"
              style={{
                borderColor: assetType === "LAND" ? "var(--color-ink-950)" : "var(--color-line)",
                backgroundColor: assetType === "LAND" ? "var(--color-concrete)" : "var(--color-paper)",
              }}
            >
              <MapPin
                className="size-4"
                style={{ color: assetType === "LAND" ? "var(--color-ink-950)" : "var(--color-ink-400)" }}
              />
              <span
                className="text-m-caption font-bold"
                style={{ color: assetType === "LAND" ? "var(--color-ink-950)" : "var(--color-ink-500)" }}
              >
                Land
              </span>
            </button>
            <button
              type="button"
              onClick={() => { setAssetType("PROJECT"); haptic(10); }}
              className="flex flex-col items-center gap-1 rounded-[0.5rem] border p-2.5 text-m-body press"
              style={{
                borderColor: assetType === "PROJECT" ? "var(--color-ink-950)" : "var(--color-line)",
                backgroundColor: assetType === "PROJECT" ? "var(--color-concrete)" : "var(--color-paper)",
              }}
            >
              <Building2
                className="size-4"
                style={{ color: assetType === "PROJECT" ? "var(--color-ink-950)" : "var(--color-ink-400)" }}
              />
              <span
                className="text-m-caption font-bold"
                style={{ color: assetType === "PROJECT" ? "var(--color-ink-950)" : "var(--color-ink-500)" }}
              >
                Project
              </span>
            </button>
          </div>
        </div>

        {/* ── RERA warning (built unit without RERA) ── */}
        {assetType === "BUILT_UNIT" && selectedAsset && !selectedAsset.projectReraNumber && (
          <div
            className="flex items-start gap-2 rounded-[0.5rem] border p-2.5"
            style={{
              borderColor: "color-mix(in srgb, var(--color-stop) 30%, var(--color-line))",
              backgroundColor: "color-mix(in srgb, var(--color-stop) 6%, var(--color-paper))",
            }}
          >
            <ShieldCheck className="size-3.5 shrink-0 mt-0.5" style={{ color: "var(--color-stop)" }} />
            <div>
              <p className="text-m-caption font-bold" style={{ color: "var(--color-ink-950)" }}>RERA not registered</p>
              <p className="text-m-caption mt-0.5" style={{ color: "var(--color-ink-500)" }}>
                This project has no RERA number. Selling units without RERA registration is illegal under RERA Act 2016.
              </p>
            </div>
          </div>
        )}

        {/* ══════ 2-COL GRID: Sale Info + Deal Details ══════ */}
        <div className="grid grid-cols-2 gap-2">
          {/* ── Left card: Asset & Customer & Price ── */}
          <div
            className="rounded-[0.5rem] border p-2 space-y-2"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          >
            {/* Asset selector */}
            {assetType === "PROJECT" ? (
              <FormFieldSm label="Project" required>
                <MobileSelectWithCreate
                  label=""
                  required
                  value={projectId}
                  onChange={onProjectChange}
                  options={sellableProjects.map((p) => ({ value: p.id, label: p.name }))}
                  placeholder="Select…"
                  icon={FolderOpen}
                  renderDialog={({ open, onClose, onCreated }) => (
                    <MobileNewProjectDialog open={open} onClose={onClose} onCreated={(p) => onCreated(p.id, p.name)} />
                  )}
                />
              </FormFieldSm>
            ) : (
              <FormFieldSm label={assetType === "BUILT_UNIT" ? "Unit" : "Parcel"} required>
                {assetOptions.length === 0 ? (
                  <p className="text-m-caption py-1" style={{ color: "var(--color-ink-500)" }}>
                    No {assetType === "BUILT_UNIT" ? "units" : "parcels"}.
                  </p>
                ) : (
                  <MobileSelectWithCreate
                    label=""
                    required
                    value={selectedAssetId}
                    onChange={onAssetChange}
                    options={assetOptions.map((a) => ({ value: a.id, label: a.label }))}
                    placeholder="Select…"
                  />
                )}
                {selectedAsset && (
                  <p className="text-m-caption mt-0.5" style={{ color: "var(--color-ink-500)" }}>
                    {formatNumber(selectedAsset.area, 0)} {selectedAsset.areaUnit}
                    {selectedAsset.askingPrice ? ` · ${formatCurrencyCompact(selectedAsset.askingPrice)}` : ""}
                  </p>
                )}
              </FormFieldSm>
            )}

            {/* Customer */}
            <MobileSelectWithCreate
              label="Customer"
              required
              value={customerId}
              onChange={setCustomerId}
              options={customers.map((c) => ({
                value: c.id,
                label: c.phone ? `${c.name} · ${c.phone}` : c.name,
              }))}
              inputClass={inputClassSm}
              inputStyle={inputStyleSm}
              renderDialog={({ open, onClose, onCreated }) => (
                <MobileNewCustomerDialog
                  open={open}
                  onClose={onClose}
                  onCreated={(c) => {
                    setCustomers((prev) => [...prev, { id: c.id, name: c.name, phone: c.phone ?? null }]);
                    onCreated(c.id, c.name);
                  }}
                />
              )}
            />

            {/* Sale price */}
            <FormFieldSm label="Sale price" required>
              <div className="relative">
                <IndianRupee
                  className="absolute left-1.5 top-1/2 -translate-y-1/2 size-3"
                  style={{ color: "var(--color-ink-500)" }}
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                  className={`${inputClassSm} pl-6 tabular-nums font-bold`}
                  style={inputStyleSm}
                  placeholder={suggestedPrice || "0.00"}
                />
              </div>
            </FormFieldSm>

            {/* GST + Total */}
            <div className="grid grid-cols-2 gap-1.5">
              <FormFieldSm label="GST %">
                <input
                  type="number"
                  min="0"
                  max="28"
                  step="0.01"
                  value={gstRate}
                  onChange={(e) => setGstRate(e.target.value)}
                  className={`${inputClassSm} tabular-nums`}
                  style={inputStyleSm}
                />
              </FormFieldSm>
              <FormFieldSm label="Total">
                <div
                  className="flex items-center h-8 rounded-[0.375rem] border px-2 tabular-nums font-bold"
                  style={{ borderColor: "color-mix(in srgb, var(--color-go) 30%, var(--color-line))", backgroundColor: "color-mix(in srgb, var(--color-go) 6%, var(--color-paper))", color: "var(--color-go)", fontSize: "0.5625rem" }}
                >
                  {formatCurrencyCompact(totalValue)}
                </div>
              </FormFieldSm>
            </div>
          </div>

          {/* ── Right card: Deal Details ── */}
          <div
            className="rounded-[0.5rem] border p-2 space-y-2"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          >
            {/* Maturity + Payment cycle */}
            <div className="grid grid-cols-2 gap-1.5">
              <FormFieldSm label="Maturity (mo)">
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={dealMaturityMonths}
                  onChange={(e) => setDealMaturityMonths(e.target.value)}
                  placeholder="4"
                  className={`${inputClassSm} tabular-nums`}
                  style={inputStyleSm}
                />
              </FormFieldSm>
              <FormFieldSm label="Cycle">
                <input
                  type="text"
                  value={paymentCycle}
                  onChange={(e) => setPaymentCycle(e.target.value)}
                  placeholder="25%/mo"
                  className={inputClassSm}
                  style={inputStyleSm}
                />
              </FormFieldSm>
            </div>

            {/* Deal source */}
            <FormFieldSm label="Deal Source">
              <div className="grid grid-cols-2 gap-1">
                <button
                  type="button"
                  onClick={() => setDealSource("SELF")}
                  className="h-8 rounded-[0.375rem] border text-m-caption font-bold transition-colors"
                  style={{
                    borderColor: dealSource === "SELF" ? "var(--color-ink-950)" : "var(--color-line)",
                    backgroundColor: dealSource === "SELF" ? "var(--color-concrete)" : "var(--color-paper)",
                    color: dealSource === "SELF" ? "var(--color-ink-950)" : "var(--color-ink-500)",
                  }}
                >
                  Direct
                </button>
                <button
                  type="button"
                  onClick={() => setDealSource("BROKER")}
                  className="h-8 rounded-[0.375rem] border text-m-caption font-bold transition-colors"
                  style={{
                    borderColor: dealSource === "BROKER" ? "var(--color-ink-950)" : "var(--color-line)",
                    backgroundColor: dealSource === "BROKER" ? "var(--color-concrete)" : "var(--color-paper)",
                    color: dealSource === "BROKER" ? "var(--color-ink-950)" : "var(--color-ink-500)",
                  }}
                >
                  Broker
                </button>
              </div>
            </FormFieldSm>

            {/* Broker details (conditional) */}
            {dealSource === "BROKER" && (
              <>
                <FormFieldSm label="Select from Broker Master">
                  <MobileSelectWithCreate
                    label=""
                    value={brokerId}
                    onChange={(id) => {
                      setBrokerId(id);
                      const b = localBrokers.find((x) => x.id === id);
                      if (b) {
                        setBrokerName(b.name);
                        setBrokerPhone(b.phone);
                        const sp = Number(salePrice) || 0;
                        if (b.defaultCommissionPercent && sp > 0) {
                          setCommissionAmount(((sp * b.defaultCommissionPercent) / 100).toFixed(2));
                        }
                      }
                    }}
                    options={localBrokers.map((b) => ({
                      value: b.id,
                      label: b.name,
                      sub: b.agency ? b.agency : undefined,
                    }))}
                    placeholder="— Or type manually below —"
                    renderDialog={({ open, onClose, onCreated }) => (
                      <MobileFabModal open={open} onClose={onClose} title="New Broker" nested>
                        <MobileNewBrokerClient
                          onClose={onClose}
                          onCreated={(b) => {
                            setLocalBrokers((prev) =>
                              prev.find((x) => x.id === b.id)
                                ? prev
                                : [...prev, { id: b.id, name: b.name, phone: "", agency: "", defaultCommissionPercent: null }],
                            );
                            onCreated(b.id, b.name);
                          }}
                        />
                      </MobileFabModal>
                    )}
                  />
                </FormFieldSm>
                <div className="grid grid-cols-2 gap-1.5">
                  <FormFieldSm label="Broker Name">
                    <input
                      type="text"
                      value={brokerName}
                      onChange={(e) => { setBrokerName(e.target.value); setBrokerId(""); }}
                      placeholder="Name"
                      className={inputClassSm}
                      style={inputStyleSm}
                    />
                  </FormFieldSm>
                  <FormFieldSm label="Phone">
                    <input
                      type="tel"
                      value={brokerPhone}
                      onChange={(e) => { setBrokerPhone(e.target.value); setBrokerId(""); }}
                      placeholder="Phone"
                      className={inputClassSm}
                      style={inputStyleSm}
                    />
                  </FormFieldSm>
                </div>
                <FormFieldSm label="Commission">
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    value={commissionAmount}
                    onChange={(e) => setCommissionAmount(e.target.value)}
                    placeholder="0"
                    className={`${inputClassSm} tabular-nums`}
                    style={inputStyleSm}
                  />
                </FormFieldSm>
                <button
                  type="button"
                  onClick={() => setCommissionIsPartOfDeal((v) => !v)}
                  className="flex items-center justify-between w-full rounded-[0.375rem] border px-2 py-1.5 text-m-body press"
                  style={{
                    borderColor: commissionIsPartOfDeal ? "var(--color-ink-950)" : "var(--color-line)",
                    backgroundColor: commissionIsPartOfDeal ? "var(--color-concrete)" : "var(--color-paper)",
                  }}
                >
                  <span className="text-m-caption font-bold" style={{ color: "var(--color-ink-950)" }}>
                    Part of deal
                  </span>
                  <div
                    className="flex h-3.5 w-6 items-center rounded-full transition-colors"
                    style={{ backgroundColor: commissionIsPartOfDeal ? "var(--color-ink-950)" : "var(--color-line)" }}
                  >
                    <div
                      className="size-2.5 rounded-full transition-transform"
                      style={{ backgroundColor: "var(--color-paper)", transform: commissionIsPartOfDeal ? "translateX(12px)" : "translateX(2px)" }}
                    />
                  </div>
                </button>
              </>
            )}
          </div>
        </div>

        {/* ══════ SECTION: HOW ══════ */}
        <p className="text-m-caption font-bold uppercase tracking-wide mb-1 px-0.5 mt-1" style={{ color: "var(--color-steel)" }}>
          Payment & Registry
        </p>
        {/* ── 2-col grid: Payment + Registry ── */}
        <div className="grid grid-cols-2 gap-2">
          {/* Left card: Initial payment + Sale Deed */}
          <div
            className="rounded-[0.5rem] border p-2 space-y-2"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          >
            {/* Initial payment */}
            <p className="text-m-caption font-bold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
              Initial Payment
            </p>
            <FormFieldSm label="Amount">
              <div className="relative">
                <IndianRupee
                  className="absolute left-1.5 top-1/2 -translate-y-1/2 size-3"
                  style={{ color: "var(--color-ink-500)" }}
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={initialPayment}
                  onChange={(e) => setInitialPayment(e.target.value)}
                  className={`${inputClassSm} pl-6 tabular-nums`}
                  style={inputStyleSm}
                  placeholder="0.00"
                />
              </div>
            </FormFieldSm>
            <FormFieldSm label="Mode">
              <EnumSelect
                label=""
                value={initialPaymentMode}
                onChange={(v) => setInitialPaymentMode(v)}
                options={PAYMENT_MODES.map((m) => ({ value: m, label: m.replace(/_/g, " ") }))}
              />
            </FormFieldSm>
            {initialPaymentMode === "CHEQUE" && (
              <MobileChequeFields value={initialCheque} onChange={setInitialCheque} />
            )}

            {/* ATS / Registry — merged: either ATS or Registry */}
            <div className="pt-1.5" style={{ borderTop: "1px solid var(--color-line)" }}>
              <p className="text-m-caption font-bold uppercase tracking-wide mb-1" style={{ color: "var(--color-ink-500)" }}>
                ATS / Registry
              </p>
              <p className="text-m-caption mb-1" style={{ color: "var(--color-ink-500)" }}>
                Either ATS or Registry — one is the registered document.
              </p>
              <div className="grid grid-cols-2 gap-1">
                <button type="button" onClick={() => { setIsATS(true); haptic(10); }}
                  className="h-7 rounded-[0.375rem] border-2 text-m-caption font-bold text-m-body press"
                  style={{
                    borderColor: isATS ? "var(--color-ink-950)" : "var(--color-line)",
                    backgroundColor: isATS ? "var(--color-ink-950)" : "var(--color-paper)",
                    color: isATS ? "var(--color-paper)" : "var(--color-ink-500)",
                  }}>
                  ATS
                </button>
                <button type="button" onClick={() => { setIsATS(false); haptic(10); }}
                  className="h-7 rounded-[0.375rem] border-2 text-m-caption font-bold text-m-body press"
                  style={{
                    borderColor: !isATS ? "var(--color-ink-950)" : "var(--color-line)",
                    backgroundColor: !isATS ? "var(--color-ink-950)" : "var(--color-paper)",
                    color: !isATS ? "var(--color-paper)" : "var(--color-ink-500)",
                  }}>
                  Registry Done
                </button>
              </div>
              {isATS ? (
                <div className="space-y-1.5 mt-1.5">
                  <div className="grid grid-cols-2 gap-1.5">
                    <FormFieldSm label="ATS Reg. No.">
                      <input type="text" value={atsNo}
                        onChange={(e) => setAtsNo(e.target.value)}
                        placeholder="ATS-1234/2025"
                        className={inputClassSm} style={inputStyleSm} />
                    </FormFieldSm>
                    <FormFieldSm label="ATS Date">
                      <input type="date" value={atsDate}
                        onChange={(e) => setAtsDate(e.target.value)}
                        className={inputClassSm} style={inputStyleSm} />
                    </FormFieldSm>
                  </div>
                  <FormFieldSm label="Exp. Registry">
                    <input type="date" value={expectedRegistryDate}
                      onChange={(e) => setExpectedRegistryDate(e.target.value)}
                      className={inputClassSm} style={inputStyleSm} />
                  </FormFieldSm>
                  <label className="flex items-center gap-1.5 text-m-caption" style={{ color: "var(--color-ink-600)" }}>
                    <input type="checkbox" checked={allowRegistryBeforeFullPayment}
                      onChange={(e) => setAllowRegistryBeforeFullPayment(e.target.checked)}
                      className="rounded" />
                    Allow registry before full payment
                  </label>
                </div>
              ) : (
                <FormFieldSm label="Deed / Registry No.">
                  <input type="text" value={saleDeedNo}
                    onChange={(e) => setSaleDeedNo(e.target.value)}
                    placeholder="SR-1234/2025"
                    className={inputClassSm} style={inputStyleSm} />
                </FormFieldSm>
              )}
            </div>
          </div>

          {/* Right card: Home Loan + Notes */}
          <div
            className="rounded-[0.5rem] border p-2 space-y-2"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          >
            {/* Home Loan */}
            <div className="flex items-center justify-between">
              <span className="text-m-caption font-bold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
                Home Loan
              </span>
              <div className="grid grid-cols-2 gap-1">
                <button type="button" onClick={() => { setHasHomeLoan(false); haptic(10); }}
                  className="h-6 rounded-[0.375rem] border-2 text-m-caption font-bold text-m-body press px-2"
                  style={{
                    borderColor: !hasHomeLoan ? "var(--color-ink-950)" : "var(--color-line)",
                    backgroundColor: !hasHomeLoan ? "var(--color-ink-950)" : "var(--color-paper)",
                    color: !hasHomeLoan ? "var(--color-paper)" : "var(--color-ink-500)",
                  }}>
                  No
                </button>
                <button type="button" onClick={() => { setHasHomeLoan(true); haptic(10); }}
                  className="h-6 rounded-[0.375rem] border-2 text-m-caption font-bold text-m-body press px-2"
                  style={{
                    borderColor: hasHomeLoan ? "var(--color-ink-950)" : "var(--color-line)",
                    backgroundColor: hasHomeLoan ? "var(--color-ink-950)" : "var(--color-paper)",
                    color: hasHomeLoan ? "var(--color-paper)" : "var(--color-ink-500)",
                  }}>
                  Yes
                </button>
              </div>
            </div>
            {hasHomeLoan && (
              <>
                <div className="grid grid-cols-2 gap-1.5">
                  <FormFieldSm label="Bank">
                    <input type="text" value={homeLoanBank}
                      onChange={(e) => setHomeLoanBank(e.target.value)}
                      placeholder="HDFC, SBI"
                      className={inputClassSm} style={inputStyleSm} />
                  </FormFieldSm>
                  <FormFieldSm label="Amount">
                    <input type="number" min="0" step="0.01" value={homeLoanAmount}
                      onChange={(e) => setHomeLoanAmount(e.target.value)}
                      placeholder="0"
                      className={`${inputClassSm} tabular-nums`} style={inputStyleSm} />
                  </FormFieldSm>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <FormFieldSm label="Sanction No.">
                    <input type="text" value={homeLoanSanctionNo}
                      onChange={(e) => setHomeLoanSanctionNo(e.target.value)}
                      placeholder="HDFC-001"
                      className={inputClassSm} style={inputStyleSm} />
                  </FormFieldSm>
                  <FormFieldSm label="Sanction Date">
                    <input type="date" value={homeLoanSanctionDate}
                      onChange={(e) => setHomeLoanSanctionDate(e.target.value)}
                      className={inputClassSm} style={inputStyleSm} />
                  </FormFieldSm>
                </div>
              </>
            )}

            {/* Notes */}
            <div className="pt-1.5" style={{ borderTop: "1px solid var(--color-line)" }}>
              <FormFieldSm label="Notes">
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Sale notes"
                  className={`${inputClassSm} resize-none`}
                  style={inputStyleSm}
                />
              </FormFieldSm>
            </div>
          </div>
        </div>

        {/* ── Expenses & Terms ── */}
        <p className="text-m-caption font-bold uppercase tracking-wide mb-1 px-0.5 mt-1" style={{ color: "var(--color-steel)" }}>
          Expenses & Terms
        </p>
        {/* ── 2-col grid: Expenses + Terms ── */}
        <div className="grid grid-cols-2 gap-2">
          {/* Left card: Expense Heads */}
          <div
            className="rounded-[0.5rem] border overflow-hidden"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          >
            <div className="px-2 py-1.5" style={{ borderBottom: "1px solid var(--color-line)" }}>
              <span className="text-m-caption font-bold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
                Expense Heads
              </span>
            </div>
            {expenses.map((exp, i) => (
              <div
                key={i}
                className="px-2 py-1.5 space-y-1"
                style={i > 0 ? { borderTop: "1px solid var(--color-line)" } : undefined}
              >
                <div className="flex items-center justify-between">
                  <span className="text-m-caption font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
                    {EXPENSE_HEADS.find((h) => h.value === exp.head)?.label ?? exp.head}
                  </span>
                  <EnumSelect
                    label=""
                    inline
                    value={exp.borneBy}
                    onChange={(v) => {
                      const next = [...expenses];
                      next[i] = { ...exp, borneBy: v as "CLIENT" | "SELLER" | "NA" };
                      setExpenses(next);
                    }}
                    options={[
                      { value: "NA", label: "N/A" },
                      { value: "CLIENT", label: "Client" },
                      { value: "SELLER", label: "Seller" },
                    ]}
                  />
                </div>
                {exp.borneBy !== "NA" && (
                  <div className="relative">
                    <IndianRupee
                      className="absolute left-1.5 top-1/2 -translate-y-1/2 size-2.5"
                      style={{ color: "var(--color-ink-500)" }}
                    />
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      value={exp.amount}
                      onChange={(e) => {
                        const next = [...expenses];
                        next[i] = { ...exp, amount: e.target.value };
                        setExpenses(next);
                      }}
                      placeholder="0"
                      className={`${inputClassSm} pl-5 tabular-nums`}
                      style={inputStyleSm}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Right card: Terms & Conditions + Payment Plan */}
          <div
            className="rounded-[0.5rem] border overflow-hidden"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          >
            {/* Terms & Conditions */}
            <div className="p-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-m-caption font-bold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
                  Terms & Conditions
                </span>
                <button
                  type="button"
                  onClick={() => setTerms([...terms, { description: "", extraAmount: "", isIncluded: true }])}
                  className="flex items-center gap-0.5 text-m-caption font-bold text-m-body press"
                  style={{ color: "var(--color-ink-700)" }}
                >
                  <Plus className="size-2.5" /> Add
                </button>
              </div>
              {terms.length === 0 && (
                <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                  Add conditions like &quot;Fire NOC by seller&quot;.
                </p>
              )}
              {terms.map((term, i) => (
                <div key={i} className="space-y-1 rounded-[0.375rem] border p-1.5" style={{ borderColor: "var(--color-line)" }}>
                  <div className="flex items-start gap-1">
                    <textarea
                      rows={2}
                      value={term.description}
                      onChange={(e) => {
                        const next = [...terms];
                        next[i] = { ...term, description: e.target.value };
                        setTerms(next);
                      }}
                      placeholder="Condition"
                      className={`${inputClassSm} flex-1 resize-none`}
                      style={inputStyleSm}
                    />
                    <button
                      type="button"
                      onClick={() => setTerms(terms.filter((_, idx) => idx !== i))}
                      aria-label="Remove sale item"
                      className="text-m-body press mt-0.5"
                      style={{ color: "var(--color-ink-500)" }}
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      value={term.extraAmount}
                      onChange={(e) => {
                        const next = [...terms];
                        next[i] = { ...term, extraAmount: e.target.value };
                        setTerms(next);
                      }}
                      placeholder="Extra ₹"
                      className={`${inputClassSm} flex-1 tabular-nums`}
                      style={inputStyleSm}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const next = [...terms];
                        next[i] = { ...term, isIncluded: !term.isIncluded };
                        setTerms(next);
                      }}
                      className="text-m-caption font-bold px-1.5 py-0.5 rounded text-m-body press"
                      style={{
                        backgroundColor: term.isIncluded ? "var(--color-concrete)" : "transparent",
                        border: "1px solid var(--color-line)",
                        color: "var(--color-ink-700)",
                      }}
                    >
                      {term.isIncluded ? "In" : "Extra"}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Payment Plan */}
            <div className="p-2 space-y-1.5" style={{ borderTop: "1px solid var(--color-line)" }}>
              <div className="flex items-center justify-between">
                <span className="text-m-caption font-bold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
                  Payment Plan
                </span>
                <button
                  type="button"
                  onClick={() => setSchedule([...schedule, { description: "", percentage: "", amount: "", dueDate: "" }])}
                  className="flex items-center gap-0.5 text-m-caption font-bold text-m-body press"
                  style={{ color: "var(--color-ink-700)" }}
                >
                  <Plus className="size-2.5" /> Add
                </button>
              </div>
              {schedule.length === 0 && (
                <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                  Add installments like &quot;25% every month&quot;.
                </p>
              )}
              {schedule.map((item, i) => (
                <div key={i} className="space-y-1 rounded-[0.375rem] border p-1.5" style={{ borderColor: "var(--color-line)" }}>
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => {
                        const next = [...schedule];
                        next[i] = { ...item, description: e.target.value };
                        setSchedule(next);
                      }}
                      placeholder="Description"
                      className={`${inputClassSm} flex-1`}
                      style={inputStyleSm}
                    />
                    <button
                      type="button"
                      onClick={() => setSchedule(schedule.filter((_, idx) => idx !== i))}
                      aria-label="Remove sale item"
                      className="text-m-body press"
                      style={{ color: "var(--color-ink-500)" }}
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      value={item.percentage}
                      onChange={(e) => {
                        const next = [...schedule];
                        next[i] = { ...item, percentage: e.target.value };
                        setSchedule(next);
                      }}
                      placeholder="%"
                      className={`${inputClassSm} tabular-nums`}
                      style={inputStyleSm}
                    />
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      value={item.amount}
                      onChange={(e) => {
                        const next = [...schedule];
                        next[i] = { ...item, amount: e.target.value };
                        setSchedule(next);
                      }}
                      placeholder="₹"
                      className={`${inputClassSm} tabular-nums`}
                      style={inputStyleSm}
                    />
                    <input
                      type="date"
                      value={item.dueDate}
                      onChange={(e) => {
                        const next = [...schedule];
                        next[i] = { ...item, dueDate: e.target.value };
                        setSchedule(next);
                      }}
                      className={inputClassSm}
                      style={inputStyleSm}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

      {/* ── Sticky bottom bar ── */}
      <div
        className="sticky bottom-0 z-30 border-t backdrop-blur-sm"
        style={{
          backgroundColor: "color-mix(in srgb, var(--color-paper) 97%, transparent)",
          borderColor: "var(--color-line)",
        }}
      >
        <div className="px-3.5 py-2">
          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-m-section font-bold text-m-body press disabled:opacity-50"
            style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                <ShoppingCart className="size-3.5" />
                Create Sale
              </>
            )}
          </button>
        </div>
      </div>
      </form>
    </div>
  );
}
