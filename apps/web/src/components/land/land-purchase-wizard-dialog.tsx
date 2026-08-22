"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  FileText, Upload, X, MapPin, SplitSquareHorizontal, CircleDollarSign,
  Building2, Plus, Trash2, ChevronRight, ChevronLeft, Check, Loader2,
  ShieldCheck,
} from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SelectWithCreate } from "@/components/ui/select-with-create";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import { SellerFormDialog } from "@/components/land/seller-form-dialog";
import { LegalDocsSection, type LegalDocRow } from "@/components/legal/legal-docs-section";
import { formatCurrency, formatNumber, cn } from "@/lib/utils";
import type { ProjectOption } from "@/lib/types";

interface SellerOption { id: string; name: string; phone?: string | null; }

type AreaUnit = "SQFT" | "SQM" | "SQYD" | "ACRE" | "BIGHA" | "KATHA" | "HECTARE";
type Mode = "WHOLE" | "SUBDIVIDED";
type Purpose = "SELL" | "PROJECT" | "HOLD";
type LandType = "FREEHOLD" | "LEASEHOLD";
type LeaseType = "ONE_TIME" | "YEARLY";

const AREA_UNITS: { value: AreaUnit; label: string }[] = [
  { value: "SQFT", label: "Sq.Ft" },
  { value: "SQM", label: "Sq.Mtr" },
  { value: "SQYD", label: "Sq.Yard" },
  { value: "ACRE", label: "Acre" },
  { value: "BIGHA", label: "Bigha" },
  { value: "KATHA", label: "Katha" },
  { value: "HECTARE", label: "Hectare" },
];

interface SectionForm {
  id: string;
  number: string;
  area: string;
  purpose: Purpose;
  askingPrice: string;
  projectId: string;
  // Inline project creation
  projectCreateOpen: boolean;
  projectCreateName: string;
  projectCreateType: "RESIDENTIAL" | "COMMERCIAL" | "WAREHOUSE" | "MALL" | "LAND" | "OTHER";
  projectCreateAddress: string;
  projectCreateBudget: string;
  projectCreateSellableArea: string;
}

function newSection(prefix: string, index: number): SectionForm {
  return {
    id: crypto.randomUUID(),
    number: `${prefix}-${String(index).padStart(2, "0")}`,
    area: "",
    purpose: "HOLD",
    askingPrice: "",
    projectId: "",
    projectCreateOpen: false,
    projectCreateName: "",
    projectCreateType: "LAND",
    projectCreateAddress: "",
    projectCreateBudget: "",
    projectCreateSellableArea: "",
  };
}

/**
 * LandPurchaseWizardDialog — guided multi-step land purchase.
 *
 * Flow:
 *   Step 1: Land details + mode (WHOLE / SUBDIVIDED)
 *   Step 2: Sections — for WHOLE: 1 section with purpose; for SUBDIVIDED: N sections
 *   Step 3: Review + submit
 *
 * Each section has a purpose:
 *   SELL    → parcel is AVAILABLE with optional asking price (for the "for sale" list)
 *   PROJECT → parcel linked to an existing or newly created project
 *   HOLD    → parcel is AVAILABLE with no specific purpose
 *
 * The whole thing is submitted in one POST to /api/land-purchases with a `mode` field,
 * which triggers `recordLandPurchaseWithPlan()` — an atomic Serializable transaction
 * that creates the land purchase + parcels + optional inline projects.
 */
export function LandPurchaseWizardDialog({
  open,
  onOpenChange,
  projects,
  sellers,
  company,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: ProjectOption[];
  sellers: SellerOption[];
  company?: { id: string; name: string } | null;
  onCreated?: (purchaseId: string, mode: Mode, parcelCount: number) => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [documentName, setDocumentName] = useState<string>("");
  const [localProjects, setLocalProjects] = useState<ProjectOption[]>(projects);
  const [localSellers, setLocalSellers] = useState<SellerOption[]>(sellers);
  // Step 4: post-creation legal/permissions setup
  const [createdLandPurchaseId, setCreatedLandPurchaseId] = useState<string | null>(null);
  const [createdLegalDocs, setCreatedLegalDocs] = useState<LegalDocRow[]>([]);
  useEffect(() => { setLocalProjects(projects); }, [projects]);
  useEffect(() => { setLocalSellers(sellers); }, [sellers]);

  // Step 1: land details
  const [land, setLand] = useState({
    sellerId: "",
    sellerName: "",
    sellerContact: "",
    purchaseDate: "",
    totalArea: "",
    areaUnit: "SQFT" as AreaUnit,
    totalCost: "",
    registryNo: "",
    location: "",
    parentParcelNumber: "",
    // Land type & lease
    landType: "FREEHOLD" as LandType,
    leaseType: "ONE_TIME" as LeaseType,
    leasePeriodYears: "",
    leaseStartDate: "",
    leaseEndDate: "",
    // Cost breakup
    baseCost: "",
    leaseRentPercent: "",
    gstPercent: "",
    registrationPercent: "",
    stampDutyPercent: "",
    // Additional acquisition costs
    brokerageAmount: "",
    legalFees: "",
    otherCharges: "",
  });
  const [mode, setMode] = useState<Mode>("WHOLE");

  // Step 2: sections
  const [sections, setSections] = useState<SectionForm[]>([newSection("PLOT", 1)]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep(1);
      setLand({
        sellerId: "", sellerName: "", sellerContact: "", purchaseDate: "",
        totalArea: "", areaUnit: "SQFT", totalCost: "", registryNo: "",
        location: "", parentParcelNumber: "",
        landType: "FREEHOLD", leaseType: "ONE_TIME",
        leasePeriodYears: "", leaseStartDate: "", leaseEndDate: "",
        baseCost: "", leaseRentPercent: "", gstPercent: "",
        registrationPercent: "", stampDutyPercent: "",
        brokerageAmount: "", legalFees: "", otherCharges: "",
      });
      setMode("WHOLE");
      setSections([newSection("PLOT", 1)]);
      setDocumentUrl(null);
      setDocumentName("");
      setCreatedLandPurchaseId(null);
      setCreatedLegalDocs([]);
    }
  }, [open]);

  // Fetch legal docs for the newly created land purchase when step 4 is shown
  useEffect(() => {
    if (step === 4 && createdLandPurchaseId) {
      fetch(`/api/legal-documents?landPurchaseId=${createdLandPurchaseId}`)
        .then((r) => r.json())
        .then((d) => { if (Array.isArray(d)) setCreatedLegalDocs(d); })
        .catch(() => {});
    }
  }, [step, createdLandPurchaseId]);

  function setLandField(key: keyof typeof land, value: string) {
    setLand((f) => ({ ...f, [key]: value }));
  }

  function updateSection(id: string, patch: Partial<SectionForm>) {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function addSection() {
    const prefix = land.parentParcelNumber || "PLOT";
    setSections((prev) => [...prev, newSection(prefix, prev.length + 1)]);
  }

  function removeSection(id: string) {
    setSections((prev) => prev.filter((s) => s.id !== id));
  }

  // When mode changes, reset sections
  useEffect(() => {
    if (mode === "WHOLE") {
      // WHOLE mode: single section whose area = total area (auto-synced, no need to ask again)
      const s = newSection(land.parentParcelNumber || "PLOT", 1);
      s.area = land.totalArea;
      setSections([s]);
    } else {
      setSections([newSection(land.parentParcelNumber || "PLOT", 1), newSection(land.parentParcelNumber || "PLOT", 2)]);
    }
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // WHOLE mode: keep section area in sync with total area
  useEffect(() => {
    if (mode === "WHOLE" && sections.length === 1) {
      setSections((prev) => prev.map((s, i) => i === 0 ? { ...s, area: land.totalArea } : s));
    }
  }, [land.totalArea, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Area validation
  const totalAreaNum = Number(land.totalArea) || 0;
  const sectionsAreaSum = sections.reduce((s, sec) => s + (Number(sec.area) || 0), 0);
  const areaDiff = totalAreaNum - sectionsAreaSum;
  const areaValid = mode === "WHOLE" ? true : Math.abs(areaDiff) < 0.001;

  // Cost preview (PRO_RATA by area)
  const totalCostNum = Number(land.totalCost) || 0;
  function sectionCost(sec: SectionForm): number {
    const a = Number(sec.area) || 0;
    if (sectionsAreaSum <= 0) return 0;
    return (totalCostNum * a) / sectionsAreaSum;
  }

  // ── Cost breakup auto-calculation ──
  // baseCost is the land price itself. All other components are percentage-based.
  // leaseRent = baseCost × leaseRentPercent / 100 (leasehold only)
  //   - ONE_TIME: this is the full upfront lease rent
  //   - YEARLY: this is the per-year rent (total cost includes only first year;
  //     recurring years are an operational expense, not acquisition cost)
  // gst = leaseRentAmount × gstPercent / 100 (leasehold only, on lease rent)
  // registration = baseCost × registrationPercent / 100
  // stampDuty = baseCost × stampDutyPercent / 100
  // totalCost = baseCost + leaseRent + gst + registration + stampDuty
  const baseCostNum = Number(land.baseCost) || 0;
  const isLeasehold = land.landType === "LEASEHOLD";
  const isYearlyLease = isLeasehold && land.leaseType === "YEARLY";
  const leaseRentAmount = isLeasehold && baseCostNum > 0 && Number(land.leaseRentPercent) > 0
    ? (baseCostNum * Number(land.leaseRentPercent)) / 100 : 0;
  const gstAmount = isLeasehold && leaseRentAmount > 0 && Number(land.gstPercent) > 0
    ? (leaseRentAmount * Number(land.gstPercent)) / 100 : 0;
  const registrationAmount = baseCostNum > 0 && Number(land.registrationPercent) > 0
    ? (baseCostNum * Number(land.registrationPercent)) / 100 : 0;
  const stampDutyAmount = baseCostNum > 0 && Number(land.stampDutyPercent) > 0
    ? (baseCostNum * Number(land.stampDutyPercent)) / 100 : 0;
  const brokerageNum = Number(land.brokerageAmount) || 0;
  const legalFeesNum = Number(land.legalFees) || 0;
  const otherChargesNum = Number(land.otherCharges) || 0;
  const calculatedTotal = baseCostNum + leaseRentAmount + gstAmount + registrationAmount + stampDutyAmount + brokerageNum + legalFeesNum + otherChargesNum;

  // Total lease rent over the full term (informational only — not part of acquisition cost)
  const leasePeriodNum = Number(land.leasePeriodYears) || 0;
  const totalLeaseRentOverTerm = isYearlyLease && leaseRentAmount > 0 && leasePeriodNum > 0
    ? leaseRentAmount * leasePeriodNum : 0;

  // Auto-calculate lease end date from start date + period
  useEffect(() => {
    if (isLeasehold && land.leaseStartDate && leasePeriodNum > 0) {
      const start = new Date(land.leaseStartDate);
      start.setFullYear(start.getFullYear() + leasePeriodNum);
      const computed = start.toISOString().split("T")[0]!;
      // Only update if different to avoid infinite loop
      if (land.leaseEndDate !== computed) {
        setLandField("leaseEndDate", computed);
      }
    }
  }, [land.leaseStartDate, land.leasePeriodYears, isLeasehold]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setDocumentUrl(data.url);
      setDocumentName(data.fileName);
      toast.success("Document uploaded");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function removeDocument() {
    setDocumentUrl(null);
    setDocumentName("");
  }

  function validateStep1(): boolean {
    if (!land.sellerId) { toast.error("Please select a seller"); return false; }
    if (totalAreaNum <= 0) { toast.error("Total area must be > 0"); return false; }
    if (baseCostNum <= 0) { toast.error("Base cost must be > 0"); return false; }
    if (calculatedTotal <= 0) { toast.error("Total cost must be > 0"); return false; }
    if (isLeasehold) {
      if (!land.leasePeriodYears && !land.leaseEndDate) {
        toast.error("Leasehold requires either lease period (years) or lease end date");
        return false;
      }
      if (isYearlyLease && !land.leasePeriodYears) {
        toast.error("Yearly lease requires lease period in years");
        return false;
      }
      if (land.leaseStartDate && land.leaseEndDate) {
        if (new Date(land.leaseEndDate) <= new Date(land.leaseStartDate)) {
          toast.error("Lease end date must be after start date");
          return false;
        }
      }
    }
    return true;
  }

  function validateStep2(): boolean {
    if (mode === "SUBDIVIDED" && sections.length < 2) {
      toast.error("Subdivided mode requires at least 2 sections");
      return false;
    }
    for (let i = 0; i < sections.length; i++) {
      const s = sections[i]!;
      if (!s.number.trim()) { toast.error(`Section ${i + 1}: number is required`); return false; }
      if (Number(s.area) <= 0) { toast.error(`Section ${i + 1}: area must be > 0`); return false; }
      if (s.purpose === "PROJECT" && !s.projectId && !s.projectCreateName.trim()) {
        toast.error(`Section "${s.number}": select or create a project for PROJECT purpose`);
        return false;
      }
    }
    // Check unique numbers
    const numbers = sections.map((s) => s.number);
    if (new Set(numbers).size !== numbers.length) {
      toast.error("Section numbers must be unique");
      return false;
    }
    // Area conservation
    if (mode === "SUBDIVIDED" && !areaValid) {
      toast.error(`Section areas (${formatNumber(sectionsAreaSum, 2)}) must sum to total area (${formatNumber(totalAreaNum, 2)}). Difference: ${formatNumber(areaDiff, 2)}`);
      return false;
    }
    return true;
  }

  function next() {
    if (step === 1 && validateStep1()) setStep(2);
    else if (step === 2 && validateStep2()) setStep(3);
  }

  function back() {
    if (step > 1) setStep(step - 1);
  }

  async function onSubmit() {
    if (!validateStep2()) return;
    setSaving(true);
    try {
      const payload = {
        sellerId: land.sellerId || null,
        sellerName: land.sellerName.trim(),
        sellerContact: land.sellerContact.trim() || null,
        purchaseDate: land.purchaseDate || null,
        totalArea: totalAreaNum,
        areaUnit: land.areaUnit,
        totalCost: calculatedTotal,
        registryNo: land.registryNo.trim() || null,
        location: land.location.trim() || null,
        documentUrl,
        mode,
        parentParcelNumber: land.parentParcelNumber.trim() || undefined,
        // Land type & lease
        landType: land.landType,
        leaseType: isLeasehold ? land.leaseType : null,
        leasePeriodYears: isLeasehold ? (land.leasePeriodYears ? Number(land.leasePeriodYears) : null) : null,
        leaseStartDate: isLeasehold ? (land.leaseStartDate || null) : null,
        leaseEndDate: isLeasehold ? (land.leaseEndDate || null) : null,
        // Cost breakup
        baseCost: baseCostNum,
        leaseRentPercent: isLeasehold && land.leaseRentPercent ? Number(land.leaseRentPercent) : null,
        leaseRentAmount: isLeasehold && leaseRentAmount ? leaseRentAmount : null,
        gstPercent: isLeasehold && land.gstPercent ? Number(land.gstPercent) : null,
        gstAmount: isLeasehold && gstAmount ? gstAmount : null,
        registrationPercent: land.registrationPercent ? Number(land.registrationPercent) : null,
        registrationAmount: registrationAmount || null,
        stampDutyPercent: land.stampDutyPercent ? Number(land.stampDutyPercent) : null,
        stampDutyAmount: stampDutyAmount || null,
        // Additional acquisition costs
        brokerageAmount: brokerageNum || null,
        legalFees: legalFeesNum || null,
        otherCharges: otherChargesNum || null,
        sections: sections.map((s) => ({
          number: s.number.trim(),
          area: Number(s.area),
          purpose: s.purpose,
          askingPrice: s.askingPrice ? Number(s.askingPrice) : undefined,
          projectId: s.projectId || null,
          projectCreate: s.purpose === "PROJECT" && !s.projectId && s.projectCreateName.trim()
            ? {
                name: s.projectCreateName.trim(),
                type: s.projectCreateType,
                status: "PLANNED" as const,
                address: s.projectCreateAddress.trim() || land.location.trim() || null,
                totalBudget: s.projectCreateBudget ? Number(s.projectCreateBudget) : undefined,
                totalSellableArea: Number(s.area) || undefined,
              }
            : undefined,
        })),
      };
      const res = await fetch("/api/land-purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to record land purchase");
      toast.success("Land purchase recorded", {
        description: mode === "WHOLE"
          ? "1 parcel created."
          : `${data.parcelCount || sections.length} parcels created from ${sections.length} sections.`,
      });
      // Transition to step 4: post-creation legal/permissions setup
      setCreatedLandPurchaseId(data.id);
      setStep(4);
      if (onCreated) onCreated(data.id, mode, data.parcelCount ?? sections.length);
      router.refresh();
    } catch (err: unknown) {
      toast.error((err instanceof Error ? err.message : "Something went wrong"));
    } finally {
      setSaving(false);
    }
  }

  const canPartition = true; // The wizard handles partition inline

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Record Land Purchase"
      description="Guided wizard — buy land as a whole plot or pre-subdivided sections, each tagged for sale or a project. Then start recording permissions, licenses, and NOCs."
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="text-caption text-muted-foreground">
            {company && <span>Company: <strong className="text-foreground">{company.name}</strong></span>}
          </div>
          <div className="flex gap-2">
            {step > 1 && step < 4 && (
              <Button type="button" variant="outline" onClick={back} disabled={saving}>
                <ChevronLeft className="mr-1 h-3.5 w-3.5" /> Back
              </Button>
            )}
            {step < 3 ? (
              <Button type="button" onClick={next} disabled={saving}>
                Next <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            ) : step === 3 ? (
              <Button type="button" onClick={onSubmit} disabled={saving}>
                {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />}
                {saving ? "Saving…" : "Record Purchase"}
              </Button>
            ) : (
              <Button type="button" onClick={() => onOpenChange(false)}>
                <Check className="mr-1 h-3.5 w-3.5" /> Done
              </Button>
            )}
          </div>
        </div>
      }
    >
      {/* Stepper indicator */}
      <div className="mb-4 flex items-center gap-2">
        {["Land Details", "Sections & Purpose", "Review", "Permissions & Legal"].map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div className={cn(
              "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-medium transition-colors",
              step === i + 1 ? "bg-brand/10 text-brand" : step > i + 1 ? "text-muted-foreground" : "text-faint",
            )}>
              <div className={cn(
                "grid place-items-center size-4 rounded-full text-[0.5rem]",
                step === i + 1 ? "bg-brand text-white" : step > i + 1 ? "bg-muted-foreground text-white" : "bg-border text-faint",
              )}>
                {step > i + 1 ? <Check className="size-2.5" /> : i + 1}
              </div>
              {label}
            </div>
            {i < 3 && <ChevronRight className="size-3 text-faint" />}
          </div>
        ))}
      </div>

      {/* Step 1: Land Details */}
      {step === 1 && (
        <div className="space-y-3">
          {company && (
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-caption text-muted-foreground">
              <Building2 className="inline mr-1 h-3 w-3" />
              Land will be recorded under <strong className="text-foreground">{company.name}</strong>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Seller *</Label>
            <SelectWithCreate
              value={land.sellerId}
              onChange={(v) => {
                const s = localSellers.find((x) => x.id === v);
                setLand((f) => ({ ...f, sellerId: v, sellerName: s?.name ?? "", sellerContact: s?.phone ?? "" }));
              }}
              options={localSellers.map((s) => ({ value: s.id, label: s.phone ? `${s.name} (${s.phone})` : s.name }))}
              placeholder="Select a seller…"
              createLabel="seller"
              required
              renderCreateDialog={({ open: o, onCreated, onClose }) => (
                <SellerFormDialog
                  open={o}
                  onOpenChange={onClose}
                  onCreated={(entity) => {
                    const newSeller = { id: entity.id, name: entity.label ?? "", phone: "" };
                    setLocalSellers((prev) => [...prev, newSeller]);
                    setLand((f) => ({ ...f, sellerId: entity.id, sellerName: entity.label ?? "", sellerContact: "" }));
                    onCreated(entity);
                  }}
                />
              )}
            />
            {land.sellerContact && (
              <div className="text-caption text-muted-foreground">
                Contact: <strong className="text-foreground">{land.sellerContact}</strong>
              </div>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>Total Area *</Label>
              <Input type="number" min={0} step="any" value={land.totalArea} onChange={(e) => setLandField("totalArea", e.target.value)} placeholder="e.g. 12000" required />
            </div>
            <div className="space-y-1.5">
              <Label>Unit</Label>
              <Select value={land.areaUnit} onChange={(e) => setLandField("areaUnit", e.target.value)}>
                {AREA_UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
              </Select>
            </div>
          </div>
          {/* ── Land Type selector ── */}
          <div className="space-y-2">
            <Label>Land Type</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setLandField("landType", "FREEHOLD")}
                className={cn(
                  "rounded-md border p-2.5 text-left transition-colors",
                  land.landType === "FREEHOLD" ? "border-brand bg-brand/5" : "border-border hover:border-border-strong",
                )}
              >
                <div className="text-body font-medium">Freehold</div>
                <div className="text-caption text-muted-foreground">Outright purchase — indefinite ownership</div>
              </button>
              <button
                type="button"
                onClick={() => setLandField("landType", "LEASEHOLD")}
                className={cn(
                  "rounded-md border p-2.5 text-left transition-colors",
                  land.landType === "LEASEHOLD" ? "border-brand bg-brand/5" : "border-border hover:border-border-strong",
                )}
              >
                <div className="text-body font-medium">Leasehold</div>
                <div className="text-caption text-muted-foreground">Leased from authorities for a fixed term</div>
              </button>
            </div>
          </div>

          {/* ── Lease details (only for LEASEHOLD) ── */}
          {isLeasehold && (
            <div className="rounded-md border border-border bg-muted/30 p-3 space-y-3">
              <div className="text-body font-semibold">Lease Details</div>
              <div className="space-y-1.5">
                <Label>Lease Rent Type</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setLandField("leaseType", "ONE_TIME")}
                    className={cn(
                      "rounded-md border p-2 text-center transition-colors",
                      land.leaseType === "ONE_TIME" ? "border-brand bg-brand/5" : "border-border hover:border-border-strong",
                    )}
                  >
                    <div className="text-caption font-medium">One-Time</div>
                    <div className="text-caption text-muted-foreground">Upfront payment</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLandField("leaseType", "YEARLY")}
                    className={cn(
                      "rounded-md border p-2 text-center transition-colors",
                      land.leaseType === "YEARLY" ? "border-brand bg-brand/5" : "border-border hover:border-border-strong",
                    )}
                  >
                    <div className="text-caption font-medium">Yearly</div>
                    <div className="text-caption text-muted-foreground">Recurring annual</div>
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Lease Period (years)</Label>
                  <Input type="number" min={0} step="any" value={land.leasePeriodYears} onChange={(e) => setLandField("leasePeriodYears", e.target.value)} placeholder="e.g. 99" />
                </div>
                <div className="space-y-1.5">
                  <Label>Lease Start</Label>
                  <Input type="date" value={land.leaseStartDate} onChange={(e) => setLandField("leaseStartDate", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Lease End</Label>
                  <Input type="date" value={land.leaseEndDate} onChange={(e) => setLandField("leaseEndDate", e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {/* ── Cost Breakup ── */}
          <div className="rounded-md border border-border p-3 space-y-3">
            <div className="text-body font-semibold">Cost Breakup</div>
            <div className="space-y-1.5">
              <Label>Base Cost (₹) — land price *</Label>
              <Input type="number" min={0} step="any" value={land.baseCost} onChange={(e) => setLandField("baseCost", e.target.value)} placeholder="e.g. 5000000" required />
            </div>

            {/* Lease rent (leasehold only) */}
            {isLeasehold && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Lease Rent (%)</Label>
                  <Input type="number" min={0} step="any" value={land.leaseRentPercent} onChange={(e) => setLandField("leaseRentPercent", e.target.value)} placeholder="e.g. 10" />
                </div>
                <div className="space-y-1.5">
                  <Label>Lease Rent Amount (₹){isYearlyLease ? " /year" : ""}</Label>
                  <div className="flex h-9 items-center rounded-md border border-border bg-muted/30 px-3 text-body text-muted-foreground">
                    {leaseRentAmount > 0 ? formatCurrency(leaseRentAmount) : "—"}
                  </div>
                  {isYearlyLease && totalLeaseRentOverTerm > 0 && (
                    <div className="text-caption text-muted-foreground">
                      Total over {leasePeriodNum} years: <strong className="text-foreground">{formatCurrency(totalLeaseRentOverTerm)}</strong>
                      {" "}(recurring — not in acquisition cost)
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* GST on lease rent (leasehold only) */}
            {isLeasehold && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>GST on Lease Rent (%)</Label>
                  <Input type="number" min={0} step="any" value={land.gstPercent} onChange={(e) => setLandField("gstPercent", e.target.value)} placeholder="e.g. 18" />
                </div>
                <div className="space-y-1.5">
                  <Label>GST Amount (₹)</Label>
                  <div className="flex h-9 items-center rounded-md border border-border bg-muted/30 px-3 text-body text-muted-foreground">
                    {gstAmount > 0 ? formatCurrency(gstAmount) : "—"}
                  </div>
                </div>
              </div>
            )}

            {/* Registration charge */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Registration Charge (%)</Label>
                <Input type="number" min={0} step="any" value={land.registrationPercent} onChange={(e) => setLandField("registrationPercent", e.target.value)} placeholder="e.g. 1" />
              </div>
              <div className="space-y-1.5">
                <Label>Registration Amount (₹)</Label>
                <div className="flex h-9 items-center rounded-md border border-border bg-muted/30 px-3 text-body text-muted-foreground">
                  {registrationAmount > 0 ? formatCurrency(registrationAmount) : "—"}
                </div>
              </div>
            </div>

            {/* Stamp duty */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Stamp Duty (%)</Label>
                <Input type="number" min={0} step="any" value={land.stampDutyPercent} onChange={(e) => setLandField("stampDutyPercent", e.target.value)} placeholder="e.g. 5" />
              </div>
              <div className="space-y-1.5">
                <Label>Stamp Duty Amount (₹)</Label>
                <div className="flex h-9 items-center rounded-md border border-border bg-muted/30 px-3 text-body text-muted-foreground">
                  {stampDutyAmount > 0 ? formatCurrency(stampDutyAmount) : "—"}
                </div>
              </div>
            </div>

            {/* Additional acquisition costs */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Brokerage (₹)</Label>
                <Input type="number" min={0} step="0.01" value={land.brokerageAmount} onChange={(e) => setLandField("brokerageAmount", e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label>Legal Fees (₹)</Label>
                <Input type="number" min={0} step="0.01" value={land.legalFees} onChange={(e) => setLandField("legalFees", e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label>Other Charges (₹)</Label>
                <Input type="number" min={0} step="0.01" value={land.otherCharges} onChange={(e) => setLandField("otherCharges", e.target.value)} placeholder="EDC/IDC, etc." />
              </div>
            </div>

            {/* Total */}
            <div className="flex items-center justify-between border-t border-border pt-2">
              <span className="text-body font-semibold">Total Land Cost</span>
              <span className="text-body font-bold tabular-nums">{formatCurrency(calculatedTotal)}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Registry No.</Label>
              <Input value={land.registryNo} onChange={(e) => setLandField("registryNo", e.target.value)} placeholder="Sale deed / registry number" />
            </div>
            <div className="space-y-1.5">
              <Label>Purchase Date</Label>
              <Input type="date" value={land.purchaseDate} onChange={(e) => setLandField("purchaseDate", e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Location</Label>
            <Textarea value={land.location} onChange={(e) => setLandField("location", e.target.value)} rows={2} placeholder="Village, tehsil, district, state" />
          </div>
          <div className="space-y-1.5">
            <Label>Document</Label>
            {documentUrl ? (
              <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
                <a href={documentUrl} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2 text-body text-foreground underline underline-offset-2 hover:text-muted-foreground">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{documentName || "View document"}</span>
                </a>
                <button type="button" onClick={removeDocument} className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-danger" title="Remove">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border px-3 py-2.5 text-caption text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground">
                <Upload className="h-4 w-4" />
                {uploading ? "Uploading…" : "Upload sale deed / registry document"}
                <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.zip" />
              </label>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Parent Parcel Number</Label>
            <Input value={land.parentParcelNumber} onChange={(e) => setLandField("parentParcelNumber", e.target.value)} placeholder="PLOT-1 (default)" />
          </div>

          {/* Mode selection */}
          <div className="space-y-2 pt-2">
            <Label>How is this land being purchased?</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setMode("WHOLE")}
                className={cn(
                  "rounded-md border p-3 text-left transition-colors",
                  mode === "WHOLE" ? "border-brand bg-brand/5" : "border-border hover:border-border-strong",
                )}
              >
                <CircleDollarSign className={cn("h-5 w-5 mb-1", mode === "WHOLE" ? "text-brand" : "text-muted-foreground")} />
                <div className="text-body font-medium">Whole Plot</div>
                <div className="text-caption text-muted-foreground">Single parcel — sell as-is or assign to a project</div>
              </button>
              <button
                type="button"
                onClick={() => setMode("SUBDIVIDED")}
                className={cn(
                  "rounded-md border p-3 text-left transition-colors",
                  mode === "SUBDIVIDED" ? "border-brand bg-brand/5" : "border-border hover:border-border-strong",
                )}
              >
                <SplitSquareHorizontal className={cn("h-5 w-5 mb-1", mode === "SUBDIVIDED" ? "text-brand" : "text-muted-foreground")} />
                <div className="text-body font-medium">Sub-divided</div>
                <div className="text-caption text-muted-foreground">Split into sections — each for sale or a project</div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Sections & Purpose */}
      {step === 2 && (
        <div className="space-y-3">
          {mode === "WHOLE" ? (
            <SectionEditor
              section={sections[0]!}
              index={0}
              totalArea={totalAreaNum}
              areaUnit={land.areaUnit}
              totalCost={calculatedTotal}
              sectionsAreaSum={sectionsAreaSum}
              projects={localProjects}
              landLocation={land.location}
              canRemove={false}
              isWhole
              onUpdate={(patch) => updateSection(sections[0]!.id, patch)}
              onRemove={() => {}}
              onProjectCreated={(p) => setLocalProjects((prev) => [...prev, { id: p.id, name: p.label ?? "", type: "LAND", status: "PLANNED" }])}
            />
          ) : (
            <>
              {sections.map((sec, i) => (
                <SectionEditor
                  key={sec.id}
                  section={sec}
                  index={i}
                  totalArea={totalAreaNum}
                  areaUnit={land.areaUnit}
                  totalCost={calculatedTotal}
                  sectionsAreaSum={sectionsAreaSum}
                  projects={localProjects}
                  landLocation={land.location}
                  canRemove={sections.length > 2}
                  onUpdate={(patch) => updateSection(sec.id, patch)}
                  onRemove={() => removeSection(sec.id)}
                  onProjectCreated={(p) => setLocalProjects((prev) => [...prev, { id: p.id, name: p.label ?? "", type: "LAND", status: "PLANNED" }])}
                />
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addSection} disabled={saving}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Add Section
              </Button>
              {/* Area conservation check */}
              <div className={cn(
                "rounded-md border px-3 py-2 text-caption",
                areaValid ? "border-border bg-muted/30 text-muted-foreground" : "border-danger/30 bg-danger/5 text-danger",
              )}>
                Sections total: <strong>{formatNumber(sectionsAreaSum, 2)} {land.areaUnit}</strong>
                {" / "}Land total: <strong>{formatNumber(totalAreaNum, 2)} {land.areaUnit}</strong>
                {!areaValid && <span className="ml-2">— Difference: {formatNumber(areaDiff, 2)} {land.areaUnit}</span>}
                {areaValid && <Check className="inline ml-1 h-3 w-3" />}
              </div>
            </>
          )}
        </div>
      )}

      {/* Step 3: Review */}
      {step === 3 && (
        <div className="space-y-3">
          <div className="rounded-md border border-border bg-muted/30 p-3 space-y-1.5">
            <div className="text-body font-semibold">Review Land Purchase</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-caption">
              <div><span className="text-muted-foreground">Seller:</span> {land.sellerName}</div>
              <div><span className="text-muted-foreground">Type:</span> {land.landType === "FREEHOLD" ? "Freehold" : `Leasehold (${land.leaseType === "ONE_TIME" ? "One-time" : "Yearly"})`}</div>
              <div><span className="text-muted-foreground">Mode:</span> {mode === "WHOLE" ? "Whole Plot" : "Sub-divided"}</div>
              <div><span className="text-muted-foreground">Area:</span> {formatNumber(totalAreaNum, 2)} {land.areaUnit}</div>
              {land.location && <div><span className="text-muted-foreground">Location:</span> {land.location}</div>}
              {land.registryNo && <div><span className="text-muted-foreground">Registry:</span> {land.registryNo}</div>}
            </div>
            {/* Cost breakup summary */}
            <div className="border-t border-border pt-2 space-y-0.5 text-caption">
              <div className="flex justify-between"><span className="text-muted-foreground">Base Cost:</span> <strong className="text-foreground tabular-nums">{formatCurrency(baseCostNum)}</strong></div>
              {isLeasehold && leaseRentAmount > 0 && (
                <div className="flex justify-between"><span className="text-muted-foreground">Lease Rent ({land.leaseRentPercent}%):</span> <strong className="text-foreground tabular-nums">{formatCurrency(leaseRentAmount)}</strong></div>
              )}
              {isLeasehold && gstAmount > 0 && (
                <div className="flex justify-between"><span className="text-muted-foreground">GST ({land.gstPercent}%):</span> <strong className="text-foreground tabular-nums">{formatCurrency(gstAmount)}</strong></div>
              )}
              {registrationAmount > 0 && (
                <div className="flex justify-between"><span className="text-muted-foreground">Registration ({land.registrationPercent}%):</span> <strong className="text-foreground tabular-nums">{formatCurrency(registrationAmount)}</strong></div>
              )}
              {stampDutyAmount > 0 && (
                <div className="flex justify-between"><span className="text-muted-foreground">Stamp Duty ({land.stampDutyPercent}%):</span> <strong className="text-foreground tabular-nums">{formatCurrency(stampDutyAmount)}</strong></div>
              )}
              {brokerageNum > 0 && (
                <div className="flex justify-between"><span className="text-muted-foreground">Brokerage:</span> <strong className="text-foreground tabular-nums">{formatCurrency(brokerageNum)}</strong></div>
              )}
              {legalFeesNum > 0 && (
                <div className="flex justify-between"><span className="text-muted-foreground">Legal Fees:</span> <strong className="text-foreground tabular-nums">{formatCurrency(legalFeesNum)}</strong></div>
              )}
              {otherChargesNum > 0 && (
                <div className="flex justify-between"><span className="text-muted-foreground">Other Charges:</span> <strong className="text-foreground tabular-nums">{formatCurrency(otherChargesNum)}</strong></div>
              )}
              <div className="flex justify-between border-t border-border pt-1 font-semibold"><span>Total:</span> <strong className="tabular-nums">{formatCurrency(calculatedTotal)}</strong></div>
            </div>
          </div>
          <div className="text-body font-semibold pt-1">Parcels ({sections.length})</div>
          <div className="space-y-2">
            {sections.map((s, i) => (
              <div key={s.id} className="rounded-md border border-border p-2.5 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-body font-medium">{s.number}</span>
                  <PurposeBadge purpose={s.purpose} />
                </div>
                <div className="grid grid-cols-3 gap-2 text-caption text-muted-foreground">
                  <div>Area: <strong className="text-foreground">{formatNumber(Number(s.area) || 0, 2)} {land.areaUnit}</strong></div>
                  <div>Cost: <strong className="text-foreground">{formatCurrency(sectionCost(s))}</strong></div>
                  <div>
                    {s.purpose === "SELL" && s.askingPrice && <>Ask: <strong className="text-foreground">{formatCurrency(Number(s.askingPrice))}</strong></>}
                    {s.purpose === "PROJECT" && (
                      <>Project: <strong className="text-foreground">{s.projectId ? localProjects.find((p) => p.id === s.projectId)?.name : s.projectCreateName}</strong></>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step 4: Permissions & Legal (post-creation) */}
      {step === 4 && createdLandPurchaseId && (
        <div className="space-y-3">
          <div className="rounded-md border border-brand/30 bg-brand/5 px-3 py-2.5 flex items-start gap-2">
            <ShieldCheck className="h-4 w-4 text-brand shrink-0 mt-0.5" />
            <div>
              <div className="text-body font-semibold text-foreground">Land recorded — start adding permissions</div>
              <div className="text-caption text-muted-foreground">
                A land purchase needs several permissions, licenses, and NOCs. Start recording them now — ownership certificate, non-encumbrance, land sanction (CLU), mutation, ATS, and transfer duty (if authority land). You can also add these later from the Legal tab on the land detail page.
              </div>
            </div>
          </div>
          <LegalDocsSection
            docs={createdLegalDocs}
            landPurchaseId={createdLandPurchaseId}
            canManage={true}
            context="LAND"
          />
        </div>
      )}
    </Dialog>
  );
}

// ─── Section Editor ───
function SectionEditor({
  section,
  index,
  totalArea,
  areaUnit,
  totalCost,
  sectionsAreaSum,
  projects,
  landLocation,
  canRemove,
  isWhole,
  onUpdate,
  onRemove,
  onProjectCreated,
}: {
  section: SectionForm;
  index: number;
  totalArea: number;
  areaUnit: string;
  totalCost: number;
  sectionsAreaSum: number;
  projects: ProjectOption[];
  landLocation: string;
  canRemove: boolean;
  isWhole?: boolean;
  onUpdate: (patch: Partial<SectionForm>) => void;
  onRemove: () => void;
  onProjectCreated: (entity: { id: string; label?: string }) => void;
}) {
  const cost = sectionsAreaSum > 0 ? (totalCost * (Number(section.area) || 0)) / sectionsAreaSum : 0;

  return (
    <div className="rounded-md border border-border p-3 space-y-2.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-body font-semibold">{isWhole ? "Parcel" : `Section ${index + 1}`}</span>
        {canRemove && (
          <button type="button" onClick={onRemove} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-danger" title="Remove section">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Number + Area (area hidden in WHOLE mode — it equals total area) */}
      <div className={cn("gap-3", isWhole ? "space-y-2" : "grid grid-cols-2")}>
        <div className="space-y-1">
          <Label>Parcel Number *</Label>
          <Input value={section.number} onChange={(e) => onUpdate({ number: e.target.value })} placeholder="e.g. PLOT-01" />
        </div>
        {!isWhole && (
          <div className="space-y-1">
            <Label>Area ({areaUnit}) *</Label>
            <Input type="number" min={0} step="any" value={section.area} onChange={(e) => onUpdate({ area: e.target.value })} placeholder="0" />
          </div>
        )}
        {isWhole && (
          <div className="text-caption text-muted-foreground">
            Area: <strong className="text-foreground">{formatNumber(totalArea, 2)} {areaUnit}</strong> (from total)
          </div>
        )}
      </div>

      {/* Cost preview */}
      {Number(section.area) > 0 && (
        <div className="text-caption text-muted-foreground">
          Allocated cost: <strong className="text-foreground">{formatCurrency(cost)}</strong>
          {" "}(PRO_RATA by area)
        </div>
      )}

      {/* Purpose selection */}
      <div className="space-y-1.5">
        <Label>Purpose</Label>
        <div className="grid grid-cols-3 gap-2">
          {([
            { value: "SELL" as const, label: "For Sale", icon: CircleDollarSign, desc: "Sell this plot" },
            { value: "PROJECT" as const, label: "Project", icon: Building2, desc: "Assign to a project" },
            { value: "HOLD" as const, label: "Hold", icon: MapPin, desc: "No specific purpose" },
          ]).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onUpdate({ purpose: opt.value })}
              className={cn(
                "rounded-md border p-2 text-center transition-colors",
                section.purpose === opt.value ? "border-brand bg-brand/5" : "border-border hover:border-border-strong",
              )}
            >
              <opt.icon className={cn("mx-auto h-4 w-4 mb-0.5", section.purpose === opt.value ? "text-brand" : "text-muted-foreground")} />
              <div className="text-caption font-medium">{opt.label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* SELL: asking price */}
      {section.purpose === "SELL" && (
        <div className="space-y-1">
          <Label>Asking Price (₹) — optional</Label>
          <Input type="number" min={0} step="any" value={section.askingPrice} onChange={(e) => onUpdate({ askingPrice: e.target.value })} placeholder="e.g. 2000000" />
        </div>
      )}

      {/* PROJECT: select or create */}
      {section.purpose === "PROJECT" && (
        <div className="space-y-2">
          <div className="space-y-1">
            <Label>Project *</Label>
            <SelectWithCreate
              value={section.projectId}
              onChange={(v) => onUpdate({ projectId: v, projectCreateName: "" })}
              placeholder="Select a project…"
              createLabel="project"
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
              renderCreateDialog={({ open: o, onCreated, onClose }) => (
                <ProjectFormDialog
                  open={o}
                  onOpenChange={onClose}
                  initial={{
                    type: "LAND",
                    status: "PLANNED",
                    address: landLocation || undefined,
                    totalSellableArea: Number(section.area) || undefined,
                  }}
                  onCreated={(e) => { onProjectCreated(e); onCreated(e); }}
                />
              )}
            />
          </div>
          <div className="text-caption text-muted-foreground">
            The project will be linked to this parcel. Land cost ({formatCurrency(cost)}) will flow into the project's cost allocation.
            {landLocation && " Address pre-filled from land location."}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Purpose Badge ───
function PurposeBadge({ purpose }: { purpose: Purpose }) {
  const config = {
    SELL: { label: "For Sale", className: "bg-success/10 text-success" },
    PROJECT: { label: "Project", className: "bg-brand/10 text-brand" },
    HOLD: { label: "Hold", className: "bg-muted text-muted-foreground" },
  };
  const c = config[purpose];
  return <span className={cn("rounded-full px-2 py-0.5 text-caption font-medium", c.className)}>{c.label}</span>;
}
