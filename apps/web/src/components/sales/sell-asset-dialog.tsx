"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  FileText, ShieldCheck, Banknote, UserCircle, Building2,
  IndianRupee, CalendarClock, ScrollText, Users, Printer,
} from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Select, Label } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SelectWithCreate } from "@/components/ui/select-with-create";
import { CustomerFormDialog } from "@/components/sales/customer-form-dialog";
import { SaleExpenseGrid, type SaleExpenseRow } from "@/components/sales/sale-expense-grid";
import { SaleTermsEditor, type SaleTermRow } from "@/components/sales/sale-terms-editor";
import { PaymentPlanEditor, type PaymentPlanItem } from "@/components/sales/payment-plan-editor";
import { formatCurrency, cn } from "@/lib/utils";
import { required, positiveNumber, type ValidationErrors } from "@/lib/validate";
import type { AssetType, SellableAssetRow } from "@/lib/types";

type SaleFormValues = {
  assetType: string;
  customerId: string;
  salePrice: string;
};

const errorBorder = "border-danger focus-visible:border-danger focus-visible:ring-danger/25";

const PAYMENT_MODES = ["CASH", "BANK_TRANSFER", "CHEQUE", "UPI", "OTHER"] as const;

type CustomerOption = { id: string; name: string };
type BrokerOption = { id: string; name: string; phone?: string | null; agency?: string | null; defaultCommissionPercent?: number | null };

type SectionKey = "party" | "asset" | "deal" | "payment" | "expenses" | "terms" | "broker" | "compliance";

export function SellAssetDialog({
  open,
  onOpenChange,
  customers,
  presetAsset,
  initialCustomerId,
  initialUnitId,
  onSold,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customers: CustomerOption[];
  presetAsset?: SellableAssetRow | null;
  initialCustomerId?: string | null;
  initialUnitId?: string | null;
  onSold?: (assetId: string, saleId: string) => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [assets, setAssets] = useState<SellableAssetRow[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [projects, setProjects] = useState<{ id: string; name: string; unitCount?: number; totalArea?: number; totalCost?: number }[]>([]);
  const [brokers, setBrokers] = useState<BrokerOption[]>([]);
  const [localCustomers, setLocalCustomers] = useState<CustomerOption[]>(customers);
  useEffect(() => { setLocalCustomers(customers); }, [customers]);
  const isPreset = Boolean(presetAsset);
  const [expandedSection, setExpandedSection] = useState<SectionKey>("party");

  const [form, setForm] = useState({
    assetType: initialUnitId ? "BUILT_UNIT" : ("LAND" as AssetType),
    assetId: initialUnitId ?? "",
    projectId: "",
    customerId: initialCustomerId ?? "",
    salePrice: "",
    gstRate: "",
    paymentMode: "BANK_TRANSFER",
    initialPayment: "",
    initialPaymentMode: "BANK_TRANSFER",
    notes: "",
    // Sale deed / ATS tracking
    isATS: true,
    saleDeedNo: "",
    expectedRegistryDate: "",
    // Home loan tracking
    homeLoanBank: "",
    homeLoanAmount: "",
    homeLoanSanctionNo: "",
    homeLoanSanctionDate: "",
    // Deal terms
    dealMaturityMonths: "",
    paymentCycle: "",
    // Broker / deal source
    dealSource: "SELF" as "SELF" | "BROKER",
    brokerId: "",
    brokerName: "",
    brokerPhone: "",
    commissionAmount: "",
    commissionIsPartOfDeal: false,
  });

  const [expenses, setExpenses] = useState<SaleExpenseRow[]>([]);
  const [terms, setTerms] = useState<SaleTermRow[]>([]);
  const [paymentPlan, setPaymentPlan] = useState<PaymentPlanItem[]>([]);
  const [scheduleType, setScheduleType] = useState<"TLP" | "DPP" | "CLP">("TLP");
  const [errors, setErrors] = useState<ValidationErrors<SaleFormValues>>({});

  function validateField(key: keyof SaleFormValues): string | undefined {
    if (key === "assetType") return required(form.assetType, "Asset type");
    if (key === "customerId") return required(form.customerId, "Customer");
    if (key === "salePrice") return required(form.salePrice, "Sale price") ?? positiveNumber(form.salePrice, "Sale price");
  }

  function onBlur(key: keyof SaleFormValues) {
    const error = validateField(key);
    setErrors((prev) => ({ ...prev, [key]: error }));
  }

  // When a preset asset is provided, seed the form from it
  useEffect(() => {
    if (presetAsset) {
      setForm((f) => ({
        ...f,
        assetType: presetAsset.assetType,
        assetId: presetAsset.assetId,
        salePrice: presetAsset.askingPrice != null ? String(presetAsset.askingPrice) : f.salePrice,
      }));
    }
  }, [presetAsset]);

  // Fetch sellable assets whenever the asset type changes
  useEffect(() => {
    if (!open || isPreset) return;
    if (form.assetType === "PROJECT") {
      // Fetch sellable projects instead
      setLoadingAssets(true);
      setAssets([]);
      fetch(`/api/sellable-assets?type=PROJECT`)
        .then((r) => r.json())
        .then((d) => { if (Array.isArray(d)) setProjects(d); })
        .catch(() => toast.error("Failed to load projects"))
        .finally(() => setLoadingAssets(false));
    } else {
      setLoadingAssets(true);
      setAssets([]);
      fetch(`/api/sellable-assets?type=${form.assetType}`)
        .then((r) => r.json())
        .then((d) => {
          if (Array.isArray(d)) {
            setAssets(d);
            // Auto-select the unit passed from lead conversion
            if (initialUnitId && form.assetType === "BUILT_UNIT") {
              const match = d.find((a) => a.assetId === initialUnitId);
              if (match) {
                setForm((f) => ({
                  ...f,
                  assetId: match.assetId,
                  salePrice: match.askingPrice != null ? String(match.askingPrice) : f.salePrice,
                }));
              }
            }
          }
        })
        .catch(() => toast.error("Failed to load sellable assets"))
        .finally(() => setLoadingAssets(false));
    }
  }, [open, form.assetType, isPreset, initialUnitId]);

  // Fetch brokers when dialog opens
  useEffect(() => {
    if (!open) return;
    fetch("/api/brokers")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setBrokers(d); })
      .catch(() => { /* best-effort */ });
  }, [open]);

  const selectedAsset = useMemo(
    () => isPreset && presetAsset
      ? presetAsset
      : assets.find((a) => a.assetId === form.assetId) ?? null,
    [assets, form.assetId, isPreset, presetAsset],
  );

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === form.projectId) ?? null,
    [projects, form.projectId],
  );

  const salePriceNum = Number(form.salePrice) || 0;
  const costBasis = selectedAsset?.costBasis ?? (selectedProject?.totalCost ?? 0);
  const estimatedProfit = salePriceNum - costBasis;
  const initialPaymentNum = Number(form.initialPayment) || 0;
  const dealMaturityNum = Number(form.dealMaturityMonths) || 0;
  const gstAmountNum = salePriceNum * (Number(form.gstRate) || 0) / 100;
  const commissionNum = Number(form.commissionAmount) || 0;

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function onAssetChange(value: string) {
    const asset = assets.find((a) => a.assetId === value) ?? null;
    setForm((f) => ({
      ...f,
      assetId: value,
      salePrice: asset?.askingPrice != null ? String(asset.askingPrice) : f.salePrice,
    }));
  }

  function onProjectChange(value: string) {
    const project = projects.find((p) => p.id === value) ?? null;
    setForm((f) => ({
      ...f,
      projectId: value,
      salePrice: project?.totalCost ? String(project.totalCost) : f.salePrice,
    }));
  }

  function onBrokerChange(value: string) {
    const broker = brokers.find((b) => b.id === value) ?? null;
    setForm((f) => ({
      ...f,
      brokerId: value,
      brokerName: broker?.name ?? "",
      brokerPhone: broker?.phone ?? "",
      // Auto-fill commission from default %
      commissionAmount: broker?.defaultCommissionPercent && salePriceNum > 0
        ? ((salePriceNum * broker.defaultCommissionPercent) / 100).toFixed(2)
        : f.commissionAmount,
    }));
  }

  function toggleSection(key: SectionKey) {
    setExpandedSection((prev) => (prev === key ? prev : key));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const newErrors: ValidationErrors<SaleFormValues> = {};
    (["assetType", "customerId", "salePrice"] as (keyof SaleFormValues)[]).forEach((key) => {
      const error = validateField(key);
      if (error) newErrors[key] = error;
    });
    setErrors(newErrors);
    if (form.assetType !== "PROJECT" && !form.assetId) { toast.error("Select an asset to sell"); return; }
    if (form.assetType === "PROJECT" && !form.projectId) { toast.error("Select a project to sell"); return; }
    if (Object.keys(newErrors).length > 0) {
      toast.error("Please fix the errors in the form");
      return;
    }

    // Validate payment plan if provided
    if (paymentPlan.length > 0) {
      const totalPct = paymentPlan.reduce((s, item) => s + (Number(item.percentage) || 0), 0);
      if (Math.abs(totalPct - 100) > 0.01) {
        toast.error("Payment plan percentages must sum to 100%");
        return;
      }
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        assetType: form.assetType,
        customerId: form.customerId,
        salePrice: salePriceNum,
        gstRate: form.gstRate ? Number(form.gstRate) : 0,
        gstAmount: gstAmountNum,
        paymentMode: form.paymentMode,
        notes: form.notes.trim() || null,
        saleDeedNo: !form.isATS && form.saleDeedNo.trim() ? form.saleDeedNo.trim() : null,
        expectedRegistryDate: form.isATS && form.expectedRegistryDate ? form.expectedRegistryDate : null,
        homeLoanBank: form.homeLoanBank.trim() || null,
        homeLoanAmount: form.homeLoanAmount ? Number(form.homeLoanAmount) : null,
        homeLoanSanctionNo: form.homeLoanSanctionNo.trim() || null,
        homeLoanSanctionDate: form.homeLoanSanctionDate || null,
        // Deal terms
        dealMaturityMonths: dealMaturityNum > 0 ? dealMaturityNum : null,
        paymentCycle: form.paymentCycle.trim() || null,
        // Expenses — only send those with amount > 0 and a borne-by assignment (not NA)
        expenses: expenses
          .filter((e) => Number(e.amount) > 0 && e.borneBy !== "NA")
          .map((e) => ({
            head: e.head,
            label: e.label || null,
            amount: Number(e.amount),
            borneBy: e.borneBy,
            isIncluded: e.isIncluded,
          })),
        // Terms
        terms: terms
          .filter((t) => t.description.trim())
          .map((t) => ({
            description: t.description.trim(),
            extraAmount: t.extraAmount ? Number(t.extraAmount) : null,
            isIncluded: t.isIncluded,
          })),
        // Broker
        dealSource: form.dealSource,
        brokerId: form.dealSource === "BROKER" && form.brokerId ? form.brokerId : null,
        brokerName: form.dealSource === "BROKER" && form.brokerName.trim() ? form.brokerName.trim() : null,
        brokerPhone: form.dealSource === "BROKER" && form.brokerPhone.trim() ? form.brokerPhone.trim() : null,
        commissionAmount: form.dealSource === "BROKER" && commissionNum > 0 ? commissionNum : null,
        commissionIsPartOfDeal: form.commissionIsPartOfDeal,
        // Payment schedule
        paymentSchedule: paymentPlan.length > 0
          ? {
              type: scheduleType,
              items: paymentPlan.map((item) => ({
                installmentNo: item.installmentNo,
                description: item.description,
                percentage: Number(item.percentage),
                amount: Number(item.amount),
                dueDate: item.dueDate || null,
              })),
            }
          : null,
      };

      if (form.assetType === "LAND") payload.landParcelId = form.assetId;
      else if (form.assetType === "BUILT_UNIT") payload.builtUnitId = form.assetId;
      else if (form.assetType === "PROJECT") payload.projectId = form.projectId;

      if (initialPaymentNum > 0) {
        payload.initialPayment = initialPaymentNum;
        payload.initialPaymentMode = form.initialPaymentMode;
      }

      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create sale");
      const saleId = data.saleId ?? "";
      const balanceAfter = salePriceNum - initialPaymentNum;
      toast.success(`Booking ${data.saleNumber ?? ""} created`, {
        description: balanceAfter > 0
          ? `Balance due: ${formatCurrency(balanceAfter)}. Record the deposit to reserve the asset.`
          : "Fully paid — sale complete.",
        action: {
          label: balanceAfter > 0 ? "Record Deposit" : "Print Form",
          onClick: () => router.push(`/sales?sale=${saleId}`),
        },
      });
      onSold?.(form.assetId || form.projectId, saleId);
      onOpenChange(false);
      if (balanceAfter > 0) {
        // For ATS bookings with a balance, navigate to the sale detail so the
        // user can record the deposit next — the next logical step presents
        // itself instead of dumping them back to a list.
        router.push(`/sales?sale=${saleId}`);
      }
      router.refresh();
    } catch (err: unknown) {
      toast.error((err instanceof Error ? err.message : "Something went wrong"));
    } finally {
      setSaving(false);
    }
  }

  function SectionHeader({ icon: Icon, title, subtitle, sectionKey, required }: {
    icon: React.ComponentType<{ className?: string }>;
    title: string;
    subtitle?: string;
    sectionKey: SectionKey;
    required?: boolean;
  }) {
    const isExpanded = expandedSection === sectionKey;
    return (
      <button
        type="button"
        onClick={() => toggleSection(sectionKey)}
        className="flex w-full items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-left transition-colors hover:bg-muted/50"
      >
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="text-body font-medium text-foreground flex items-center gap-1">
            {title}
            {required && <span className="text-danger">*</span>}
          </div>
          {subtitle && <div className="text-caption text-muted-foreground">{subtitle}</div>}
        </div>
        <svg
          className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", isExpanded && "rotate-180")}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={isPreset ? "Sell Unit" : "New Sale"}
      description={isPreset ? "Record the sale of this unit to a customer." : "Sell land, a unit, or an entire project to a customer."}
      className="max-w-2xl"
    >
      <form onSubmit={onSubmit} className="space-y-3">
        {/* ── Section: Party ── */}
        <SectionHeader icon={UserCircle} title="Party" subtitle="Who are you selling to?" sectionKey="party" required />
        {expandedSection === "party" && (
          <div className="space-y-3 px-1 pb-2">
            <div className="space-y-1.5">
              <Label htmlFor="sa-customer" className={errors.customerId ? "text-danger" : undefined}>Customer *</Label>
              <SelectWithCreate
                value={form.customerId}
                onChange={(v) => set("customerId", v)}
                onBlur={() => onBlur("customerId")}
                aria-invalid={!!errors.customerId}
                className={errors.customerId ? errorBorder : undefined}
                placeholder="Select a customer"
                createLabel="customer"
                options={localCustomers.map((c) => ({ value: c.id, label: c.name }))}
                renderCreateDialog={({ open: o, onCreated, onClose }) => (
                  <CustomerFormDialog open={o} onOpenChange={onClose} onCreated={(e) => { setLocalCustomers((p) => [...p, { id: e.id, name: e.label ?? "" }]); onCreated(e); }} customer={null} />
                )}
              />
              {errors.customerId && <p className="text-caption text-danger" role="alert">{errors.customerId}</p>}
              {localCustomers.length === 0 && (
                <p className="text-caption text-muted-foreground">No customers yet — choose Create new customer above.</p>
              )}
            </div>
          </div>
        )}

        {/* ── Section: Asset ── */}
        <SectionHeader icon={Building2} title="Asset" subtitle="What are you selling?" sectionKey="asset" required />
        {expandedSection === "asset" && (
          <div className="space-y-3 px-1 pb-2">
            {isPreset ? (
              <div className="space-y-1.5">
                <Label>Asset</Label>
                <div className="flex items-center justify-between rounded-md border border-input bg-muted/40 px-3 py-2">
                  <span className="text-body font-medium text-foreground">{presetAsset?.label}</span>
                  <span className="text-caption text-muted-foreground">{presetAsset?.projectName ?? "No project"}</span>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label className={errors.assetType ? "text-danger" : undefined}>Asset Type</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["LAND", "BUILT_UNIT", "PROJECT"] as const).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => { set("assetType", type); set("assetId", ""); set("projectId", ""); set("salePrice", ""); }}
                        className={cn(
                          "rounded-md border p-2 text-center transition-colors",
                          form.assetType === type ? "border-brand bg-brand/5" : "border-border hover:border-border-strong",
                        )}
                      >
                        <div className="text-caption font-medium">
                          {type === "LAND" ? "Land" : type === "BUILT_UNIT" ? "Unit" : "Project"}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {form.assetType !== "PROJECT" ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="sa-asset">Asset *</Label>
                    <Select id="sa-asset" value={form.assetId} onChange={(e) => onAssetChange(e.target.value)} disabled={loadingAssets}>
                      <option value="">{loadingAssets ? "Loading…" : "Select an asset"}</option>
                      {assets.map((a) => (
                        <option key={a.assetId} value={a.assetId}>
                          {a.label} · {a.projectName ?? "No project"} · Cost {formatCurrency(a.costBasis)}
                        </option>
                      ))}
                    </Select>
                    {assets.length === 0 && !loadingAssets && (
                      <p className="text-caption text-muted-foreground">No available {form.assetType === "LAND" ? "land parcels" : "built units"} to sell.</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label htmlFor="sa-project">Project *</Label>
                    <Select id="sa-project" value={form.projectId} onChange={(e) => onProjectChange(e.target.value)} disabled={loadingAssets}>
                      <option value="">{loadingAssets ? "Loading…" : "Select a project"}</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · {p.unitCount ?? 0} units · {formatCurrency(p.totalCost ?? 0)}
                        </option>
                      ))}
                    </Select>
                    {projects.length === 0 && !loadingAssets && (
                      <p className="text-caption text-muted-foreground">No sellable projects (all units must be AVAILABLE).</p>
                    )}
                  </div>
                )}
              </>
            )}

            {/* RERA warning */}
            {selectedAsset && form.assetType === "BUILT_UNIT" && !selectedAsset.projectReraNumber && (
              <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-soft/30 px-3 py-2">
                <ShieldCheck className="h-4 w-4 shrink-0 text-warning mt-0.5" />
                <div className="min-w-0">
                  <p className="text-caption font-medium text-foreground">RERA not registered</p>
                  <p className="text-caption text-muted-foreground">
                    This project ({selectedAsset.projectName}) has no RERA number. Selling units without RERA registration is illegal under RERA Act 2016.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Section: Deal ── */}
        <SectionHeader icon={IndianRupee} title="Deal" subtitle="Price, advance, and timeline" sectionKey="deal" required />
        {expandedSection === "deal" && (
          <div className="space-y-3 px-1 pb-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sa-price" className={errors.salePrice ? "text-danger" : undefined}>Deal Price *</Label>
                <Input id="sa-price" type="number" min="0" step="0.01" value={form.salePrice} onChange={(e) => set("salePrice", e.target.value)} onBlur={() => onBlur("salePrice")} required aria-invalid={!!errors.salePrice} className={errors.salePrice ? errorBorder : undefined} />
                {errors.salePrice && <p className="text-caption text-danger" role="alert">{errors.salePrice}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Cost Basis</Label>
                <div className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-body text-muted-foreground tnum">
                  {formatCurrency(costBasis)}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sa-gst">GST Rate (%)</Label>
                <Input id="sa-gst" type="number" min="0" max="28" step="0.01" value={form.gstRate} onChange={(e) => set("gstRate", e.target.value)} placeholder="e.g. 1 or 5" />
              </div>
              <div className="space-y-1.5">
                <Label>GST Amount</Label>
                <div className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-body text-muted-foreground tnum">
                  {formatCurrency(gstAmountNum)}
                </div>
              </div>
            </div>
            {salePriceNum > 0 && (
              <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-body">
                <span className="text-muted-foreground">Estimated Profit</span>
                <span className={`font-medium tnum ${estimatedProfit >= 0 ? "text-success" : "text-danger"}`}>
                  {formatCurrency(estimatedProfit)}
                </span>
              </div>
            )}
            {salePriceNum > 0 && costBasis > 0 && salePriceNum < costBasis && (
              <div className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-caption text-danger">
                ⚠ Sale price is below cost basis ({formatCurrency(costBasis)}). Loss of {formatCurrency(Math.abs(estimatedProfit))}.
              </div>
            )}

            {/* Initial payment */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sa-init">Advance Amount</Label>
                <Input id="sa-init" type="number" min="0" step="0.01" value={form.initialPayment} onChange={(e) => set("initialPayment", e.target.value)} placeholder="0" />
              </div>
              {initialPaymentNum > 0 && (
                <div className="space-y-1.5">
                  <Label htmlFor="sa-init-mode">Advance Mode</Label>
                  <Select id="sa-init-mode" value={form.initialPaymentMode} onChange={(e) => set("initialPaymentMode", e.target.value)}>
                    {PAYMENT_MODES.map((m) => (<option key={m} value={m}>{m.replace("_", " ")}</option>))}
                  </Select>
                </div>
              )}
            </div>

            {/* Deal maturity + payment cycle */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sa-maturity">Deal Maturity (months)</Label>
                <Input id="sa-maturity" type="number" min="0" step="1" value={form.dealMaturityMonths} onChange={(e) => set("dealMaturityMonths", e.target.value)} placeholder="e.g. 4" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sa-cycle">Payment Cycle</Label>
                <Input id="sa-cycle" value={form.paymentCycle} onChange={(e) => set("paymentCycle", e.target.value)} placeholder="e.g. 25% every month" />
              </div>
            </div>
          </div>
        )}

        {/* ── Section: Payment Plan ── */}
        <SectionHeader icon={CalendarClock} title="Payment Plan" subtitle="Installment schedule" sectionKey="payment" />
        {expandedSection === "payment" && (
          <div className="px-1 pb-2">
            <PaymentPlanEditor
              items={paymentPlan}
              onChange={setPaymentPlan}
              scheduleType={scheduleType}
              onScheduleTypeChange={setScheduleType}
              salePrice={salePriceNum}
              gstAmount={gstAmountNum}
              advanceAmount={initialPaymentNum}
              dealMaturityMonths={dealMaturityNum}
            />
          </div>
        )}

        {/* ── Section: Expenses ── */}
        <SectionHeader icon={ScrollText} title="Expense Heads" subtitle="Registry, stamp duty, transfer, etc." sectionKey="expenses" />
        {expandedSection === "expenses" && (
          <div className="px-1 pb-2">
            <SaleExpenseGrid expenses={expenses} onChange={setExpenses} />
          </div>
        )}

        {/* ── Section: Terms & Conditions ── */}
        <SectionHeader icon={FileText} title="Terms & Conditions" subtitle="Custom conditions (NOC, possession, etc.)" sectionKey="terms" />
        {expandedSection === "terms" && (
          <div className="px-1 pb-2">
            <SaleTermsEditor terms={terms} onChange={setTerms} />
          </div>
        )}

        {/* ── Section: Broker ── */}
        <SectionHeader icon={Users} title="Deal Source" subtitle="Broker or direct sale + commission" sectionKey="broker" />
        {expandedSection === "broker" && (
          <div className="space-y-3 px-1 pb-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => set("dealSource", "SELF")}
                className={cn(
                  "rounded-md border p-2 text-center transition-colors",
                  form.dealSource === "SELF" ? "border-brand bg-brand/5" : "border-border hover:border-border-strong",
                )}
              >
                <div className="text-caption font-medium">Self (Direct)</div>
                <div className="text-caption text-muted-foreground">No broker</div>
              </button>
              <button
                type="button"
                onClick={() => set("dealSource", "BROKER")}
                className={cn(
                  "rounded-md border p-2 text-center transition-colors",
                  form.dealSource === "BROKER" ? "border-brand bg-brand/5" : "border-border hover:border-border-strong",
                )}
              >
                <div className="text-caption font-medium">Broker</div>
                <div className="text-caption text-muted-foreground">Via agent</div>
              </button>
            </div>

            {form.dealSource === "BROKER" && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="sa-broker">Broker</Label>
                  <Select id="sa-broker" value={form.brokerId} onChange={(e) => onBrokerChange(e.target.value)}>
                    <option value="">Select a broker (or type below)</option>
                    {brokers.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}{b.agency ? ` · ${b.agency}` : ""}</option>
                    ))}
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="sa-broker-name">Broker Name (if not in list)</Label>
                    <Input id="sa-broker-name" value={form.brokerName} onChange={(e) => set("brokerName", e.target.value)} placeholder="Free-text name" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="sa-broker-phone">Broker Phone</Label>
                    <Input id="sa-broker-phone" value={form.brokerPhone} onChange={(e) => set("brokerPhone", e.target.value)} placeholder="Phone" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="sa-commission">Commission Amount</Label>
                    <Input id="sa-commission" type="number" min="0" step="0.01" value={form.commissionAmount} onChange={(e) => set("commissionAmount", e.target.value)} placeholder="0" />
                  </div>
                  <div className="space-y-1.5 pt-6">
                    <label className="flex items-center gap-2 text-caption text-muted-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.commissionIsPartOfDeal}
                        onChange={(e) => set("commissionIsPartOfDeal", e.target.checked)}
                        className="rounded"
                      />
                      Part of deal (deducted from proceeds)
                    </label>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Section: Compliance ── */}
        <SectionHeader icon={Banknote} title="Compliance" subtitle="Sale deed, home loan (optional)" sectionKey="compliance" />
        {expandedSection === "compliance" && (
          <div className="space-y-3 px-1 pb-2">
            {/* Sale Deed / ATS */}
            <div className="rounded-md border border-border p-3 space-y-3">
              <div className="flex items-start gap-2">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="text-body font-semibold">Sale Deed / Registry</div>
                  <div className="text-caption text-muted-foreground">
                    Booking (ATS — registry deferred) or completed sale (sale deed registered)?
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => set("isATS", true)}
                  className={cn("rounded-md border p-2 text-center transition-colors", form.isATS ? "border-brand bg-brand/5" : "border-border hover:border-border-strong")}
                >
                  <div className="text-caption font-medium">ATS (Booking)</div>
                  <div className="text-caption text-muted-foreground">Registry deferred</div>
                </button>
                <button
                  type="button"
                  onClick={() => set("isATS", false)}
                  className={cn("rounded-md border p-2 text-center transition-colors", !form.isATS ? "border-brand bg-brand/5" : "border-border hover:border-border-strong")}
                >
                  <div className="text-caption font-medium">Sale Deed Done</div>
                  <div className="text-caption text-muted-foreground">Registry completed</div>
                </button>
              </div>
              {form.isATS ? (
                <div className="space-y-1.5 pt-1">
                  <Label htmlFor="sa-exp-reg">Expected Registry Date</Label>
                  <Input id="sa-exp-reg" type="date" value={form.expectedRegistryDate} onChange={(e) => set("expectedRegistryDate", e.target.value)} />
                </div>
              ) : (
                <div className="space-y-1.5 pt-1">
                  <Label htmlFor="sa-deed-no">Sale Deed / Registry No.</Label>
                  <Input id="sa-deed-no" value={form.saleDeedNo} onChange={(e) => set("saleDeedNo", e.target.value)} placeholder="e.g. SR-1234/2025" />
                </div>
              )}
            </div>

            {/* Home Loan */}
            <div className="rounded-md border border-border p-3 space-y-3">
              <div className="flex items-start gap-2">
                <Banknote className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="text-body font-semibold">Home Loan (optional)</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="sa-loan-bank">Bank / Institution</Label>
                  <Input id="sa-loan-bank" value={form.homeLoanBank} onChange={(e) => set("homeLoanBank", e.target.value)} placeholder="e.g. HDFC, SBI" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sa-loan-amt">Loan Amount (₹)</Label>
                  <Input id="sa-loan-amt" type="number" min="0" step="0.01" value={form.homeLoanAmount} onChange={(e) => set("homeLoanAmount", e.target.value)} placeholder="0" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="sa-loan-no">Sanction Letter No.</Label>
                  <Input id="sa-loan-no" value={form.homeLoanSanctionNo} onChange={(e) => set("homeLoanSanctionNo", e.target.value)} placeholder="e.g. HDFC-2025-001" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sa-loan-date">Sanction Date</Label>
                  <Input id="sa-loan-date" type="date" value={form.homeLoanSanctionDate} onChange={(e) => set("homeLoanSanctionDate", e.target.value)} />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="sa-notes">Notes</Label>
              <Textarea id="sa-notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
            </div>
          </div>
        )}

        {/* Submit */}
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || (!form.assetId && !form.projectId) || !form.customerId}>
            {saving ? "Creating…" : "Create Sale"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
