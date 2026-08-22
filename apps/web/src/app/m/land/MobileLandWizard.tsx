"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  X, Loader2, MapPin, SplitSquareHorizontal, CircleDollarSign,
  Building2, Plus, Trash2, ChevronRight, ChevronLeft, Check,
  FileText, Upload, ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";
import { MobileNewProjectDialog } from "@/app/m/projects/MobileNewProjectDialog";
import { MobileSellerDialog } from "./MobileSellerDialog";
import { MobileLegalDocsSection } from "@/components/legal/mobile-legal-docs-section";
import type { LegalDocRow } from "@/components/legal/legal-docs-section";
import { formatCurrency, formatNumber } from "@/lib/utils";

type AreaUnit = "SQFT" | "SQM" | "SQYD" | "ACRE" | "BIGHA" | "KATHA" | "HECTARE";
type Mode = "WHOLE" | "SUBDIVIDED";
type Purpose = "SELL" | "PROJECT" | "HOLD";
type LandType = "FREEHOLD" | "LEASEHOLD";
type LeaseType = "ONE_TIME" | "YEARLY";

const AREA_UNIT_LABELS: Record<AreaUnit, string> = {
  SQFT: "sq.ft", SQM: "sq.m", SQYD: "sq.yd", ACRE: "acre",
  BIGHA: "bigha", KATHA: "katha", HECTARE: "hectare",
};

interface ProjectOption { id: string; name: string; }
interface SellerOption { id: string; name: string; phone?: string | null; }

interface SectionForm {
  id: string;
  number: string;
  area: string;
  purpose: Purpose;
  askingPrice: string;
  projectId: string;
  // Inline project creation (atomic — sent in the same payload as the land purchase)
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
    projectCreateName: "",
    projectCreateType: "LAND",
    projectCreateAddress: "",
    projectCreateBudget: "",
    projectCreateSellableArea: "",
  };
}

/**
 * MobileLandWizard — bottom-sheet stepper for guided land purchase on mobile.
 *
 * Step 1: Land details + mode (WHOLE / SUBDIVIDED)
 * Step 2: Sections — each with purpose (SELL / PROJECT / HOLD)
 * Step 3: Review + submit
 *
 * Posts to /api/land-purchases with a `mode` field → recordLandPurchaseWithPlan()
 */
export function MobileLandWizard({
  open,
  onClose,
  projects,
  sellers,
  company,
}: {
  open: boolean;
  onClose: () => void;
  projects: ProjectOption[];
  sellers: SellerOption[];
  company?: { id: string; name: string } | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [documentName, setDocumentName] = useState<string>("");
  const [localProjects, setLocalProjects] = useState(projects);
  // Step 4: post-creation legal/permissions setup
  const [createdLandPurchaseId, setCreatedLandPurchaseId] = useState<string | null>(null);
  const [createdLegalDocs, setCreatedLegalDocs] = useState<LegalDocRow[]>([]);
  const [localSellers, setLocalSellers] = useState(sellers);
  useEffect(() => { setLocalProjects(projects); }, [projects]);
  useEffect(() => { setLocalSellers(sellers); }, [sellers]);

  const [land, setLand] = useState({
    sellerId: "", sellerName: "", sellerContact: "", purchaseDate: "",
    totalArea: "", areaUnit: "SQFT" as AreaUnit, totalCost: "",
    registryNo: "", location: "", parentParcelNumber: "",
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
  const [sections, setSections] = useState<SectionForm[]>([newSection("PLOT", 1)]);

  function setLandField<K extends keyof typeof land>(key: K, value: typeof land[K]) {
    setLand((f) => ({ ...f, [key]: value }));
  }
  function updateSection(id: string, patch: Partial<SectionForm>) {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  function addSection() {
    const prefix = land.parentParcelNumber || "PLOT";
    setSections((prev) => [...prev, newSection(prefix, prev.length + 1)]);
    haptic(10);
  }
  function removeSection(id: string) {
    setSections((prev) => prev.filter((s) => s.id !== id));
    haptic(10);
  }

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

  // When mode changes, reset sections
  function selectMode(m: Mode) {
    setMode(m);
    const prefix = land.parentParcelNumber || "PLOT";
    if (m === "WHOLE") {
      // WHOLE mode: single section whose area = total area (auto-synced)
      const s = newSection(prefix, 1);
      s.area = land.totalArea;
      setSections([s]);
    } else {
      setSections([newSection(prefix, 1), newSection(prefix, 2)]);
    }
    haptic(10);
  }

  // WHOLE mode: keep section area in sync with total area
  useEffect(() => {
    if (mode === "WHOLE" && sections.length === 1) {
      setSections((prev) => prev.map((s, i) => i === 0 ? { ...s, area: land.totalArea } : s));
    }
  }, [land.totalArea, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalAreaNum = Number(land.totalArea) || 0;
  // ── Cost breakup auto-calculation ──
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
  const totalCostNum = calculatedTotal;

  // Total lease rent over the full term (informational only)
  const leasePeriodNum = Number(land.leasePeriodYears) || 0;
  const totalLeaseRentOverTerm = isYearlyLease && leaseRentAmount > 0 && leasePeriodNum > 0
    ? leaseRentAmount * leasePeriodNum : 0;

  // Auto-calculate lease end date from start date + period
  useEffect(() => {
    if (isLeasehold && land.leaseStartDate && leasePeriodNum > 0) {
      const start = new Date(land.leaseStartDate);
      start.setFullYear(start.getFullYear() + leasePeriodNum);
      const computed = start.toISOString().split("T")[0]!;
      if (land.leaseEndDate !== computed) {
        setLandField("leaseEndDate", computed);
      }
    }
  }, [land.leaseStartDate, land.leasePeriodYears, isLeasehold]); // eslint-disable-line react-hooks/exhaustive-deps

  const sectionsAreaSum = sections.reduce((s, sec) => s + (Number(sec.area) || 0), 0);
  const areaDiff = totalAreaNum - sectionsAreaSum;
  const areaValid = mode === "WHOLE" ? true : Math.abs(areaDiff) < 0.001;

  function sectionCost(sec: SectionForm): number {
    const a = Number(sec.area) || 0;
    if (sectionsAreaSum <= 0) return 0;
    return (totalCostNum * a) / sectionsAreaSum;
  }

  function validateStep1(): boolean {
    if (!land.sellerId) { toast.error("Please select a seller"); return false; }
    if (totalAreaNum <= 0) { toast.error("Total area must be > 0"); return false; }
    if (baseCostNum <= 0) { toast.error("Base cost must be > 0"); return false; }
    if (calculatedTotal <= 0) { toast.error("Total cost must be > 0"); return false; }
    if (isLeasehold) {
      if (!land.leasePeriodYears && !land.leaseEndDate) {
        toast.error("Leasehold requires lease period or end date");
        return false;
      }
      if (isYearlyLease && !land.leasePeriodYears) {
        toast.error("Yearly lease requires period in years");
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
    if (mode === "SUBDIVIDED" && sections.length < 2) { toast.error("Subdivided needs ≥2 sections"); return false; }
    for (let i = 0; i < sections.length; i++) {
      const s = sections[i]!;
      if (!s.number.trim()) { toast.error(`Section ${i + 1}: number required`); return false; }
      if (Number(s.area) <= 0) { toast.error(`Section ${i + 1}: area must be > 0`); return false; }
      if (s.purpose === "PROJECT" && !s.projectId && !s.projectCreateName.trim()) {
        toast.error(`Section "${s.number}": select or create a project`);
        return false;
      }
    }
    const numbers = sections.map((s) => s.number);
    if (new Set(numbers).size !== numbers.length) { toast.error("Section numbers must be unique"); return false; }
    if (mode === "SUBDIVIDED" && !areaValid) {
      toast.error(`Areas (${formatNumber(sectionsAreaSum, 2)}) must sum to total (${formatNumber(totalAreaNum, 2)})`);
      return false;
    }
    return true;
  }

  function next() {
    if (step === 1 && validateStep1()) { setStep(2); haptic(10); }
    else if (step === 2 && validateStep2()) { setStep(3); haptic(10); }
  }
  function back() {
    if (step > 1) { setStep(step - 1); haptic(10); }
  }

  async function onSubmit() {
    if (!validateStep2()) return;
    setSaving(true);
    haptic(10);
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
          // Inline project creation — atomic with the land purchase (same transaction)
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
      haptic([10, 40, 80]);
      toast.success("Land purchase recorded", {
        description: mode === "WHOLE" ? "1 parcel created." : `${data.parcelCount || sections.length} parcels created.`,
      });
      // Transition to step 4: post-creation legal/permissions setup
      setCreatedLandPurchaseId(data.id);
      setStep(4);
      router.refresh();
    } catch (err: unknown) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const inputClass = "w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem] outline-none";
  const inputStyle = {
    borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)",
    color: "var(--color-ink-950)",
  };
  const labelClass = "text-[0.5625rem] font-semibold block mb-1";
  const labelStyle = { color: "var(--color-ink-500)" };
  const cardStyle = {
    borderRadius: "0.5rem", border: "1px solid var(--color-line)",
    padding: "0.75rem", backgroundColor: "var(--color-paper)",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[34rem] rounded-t-[1rem] border-t pb-safe max-h-[92vh] overflow-y-auto"
        style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between p-4 pb-2"
          style={{ backgroundColor: "var(--color-paper)", borderBottom: "1px solid var(--color-line)" }}>
          <div className="flex items-center gap-2">
            <span className="grid place-items-center size-7 rounded-[0.375rem]"
              style={{ backgroundColor: "var(--color-concrete)" }}>
              <MapPin className="size-3.5" style={{ color: "var(--color-ink-600)" }} />
            </span>
            <div>
              <p className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
                Record Land Purchase
              </p>
              <p className="text-[0.5625rem]" style={{ color: "var(--color-ink-500)" }}>
                Step {step} of 4
              </p>
            </div>
          </div>
          <button onClick={onClose} className="grid place-items-center size-7 rounded-[0.375rem] press"
            style={{ color: "var(--color-ink-500)" }} aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-1 px-4 py-2">
          {["Details", "Sections", "Review", "Legal"].map((label, i) => (
            <div key={label} className="flex items-center gap-1 flex-1">
              <div className="flex items-center gap-1.5 flex-1">
                <div className="grid place-items-center size-4 rounded-full text-[0.5rem] font-bold"
                  style={{
                    backgroundColor: step === i + 1 ? "var(--color-ink-950)" : step > i + 1 ? "var(--color-go)" : "var(--color-line)",
                    color: step >= i + 1 ? "#fff" : "var(--color-ink-500)",
                  }}>
                  {step > i + 1 ? <Check className="size-2.5" /> : i + 1}
                </div>
                <span className="text-[0.5625rem] font-medium"
                  style={{ color: step === i + 1 ? "var(--color-ink-950)" : "var(--color-ink-500)" }}>
                  {label}
                </span>
              </div>
              {i < 3 && <ChevronRight className="size-3" style={{ color: "var(--color-ink-300)" }} />}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="p-4 pt-2 space-y-3">
          {/* Step 1: Land Details */}
          {step === 1 && (
            <>
              {company && (
                <div
                  className="rounded-[0.5rem] px-3 py-2 text-[0.5625rem] flex items-center gap-1.5"
                  style={{
                    backgroundColor: "var(--color-concrete)",
                    color: "var(--color-ink-500)",
                  }}
                >
                  <Building2 className="size-3" />
                  Land will be recorded under{" "}
                  <strong style={{ color: "var(--color-ink-950)" }}>{company.name}</strong>
                </div>
              )}
              <div>
                <label className={labelClass} style={labelStyle}>
                  Seller <span style={{ color: "var(--color-stop)" }}>*</span>
                </label>
                <MobileSelectWithCreate
                  label=""
                  value={land.sellerId}
                  onChange={(v) => {
                    const s = localSellers.find((x) => x.id === v);
                    setLand((f) => ({ ...f, sellerId: v, sellerName: s?.name ?? "", sellerContact: s?.phone ?? "" }));
                  }}
                  options={localSellers.map((s) => ({ value: s.id, label: s.phone ? `${s.name} (${s.phone})` : s.name }))}
                  placeholder="Select a seller…"
                  inputClass={inputClass} inputStyle={inputStyle}
                  renderDialog={({ open: o, onClose, onCreated }) => (
                    <MobileSellerDialog
                      open={o}
                      onClose={onClose}
                      onCreated={(seller) => {
                        setLocalSellers((prev) => [...prev, seller]);
                        setLand((f) => ({ ...f, sellerId: seller.id, sellerName: seller.name, sellerContact: seller.phone ?? "" }));
                        onCreated(seller.id, seller.name);
                      }}
                    />
                  )}
                />
                {land.sellerContact && (
                  <div className="text-[0.5rem] mt-1" style={{ color: "var(--color-ink-500)" }}>
                    Contact: <strong style={{ color: "var(--color-ink-950)" }}>{land.sellerContact}</strong>
                  </div>
                )}
              </div>
              <div>
                <label className={labelClass} style={labelStyle}>Location</label>
                <input type="text" value={land.location}
                  onChange={(e) => setLandField("location", e.target.value)}
                  placeholder="Village, tehsil, district" enterKeyHint="next"
                  className={inputClass} style={inputStyle} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass} style={labelStyle}>
                    Total Area <span style={{ color: "var(--color-stop)" }}>*</span>
                  </label>
                  <input type="number" min={0} step="any" value={land.totalArea}
                    onChange={(e) => setLandField("totalArea", e.target.value)}
                    placeholder="0" inputMode="decimal"
                    className={inputClass} style={inputStyle} />
                </div>
                <div>
                  <label className={labelClass} style={labelStyle}>Unit</label>
                  <select value={land.areaUnit}
                    onChange={(e) => setLandField("areaUnit", e.target.value as AreaUnit)}
                    className={inputClass} style={inputStyle}>
                    {(Object.keys(AREA_UNIT_LABELS) as AreaUnit[]).map((u) => (
                      <option key={u} value={u}>{AREA_UNIT_LABELS[u]}</option>
                    ))}
                  </select>
                </div>
              </div>
              {/* ── Land Type ── */}
              <div>
                <label className={labelClass} style={labelStyle}>Land Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => { setLandField("landType", "FREEHOLD"); haptic(10); }}
                    className="rounded-[0.5rem] border p-2.5 text-left transition-colors"
                    style={{
                      borderColor: land.landType === "FREEHOLD" ? "var(--color-ink-950)" : "var(--color-line)",
                      backgroundColor: land.landType === "FREEHOLD" ? "var(--color-concrete)" : "transparent",
                    }}>
                    <div className="text-[0.6875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>Freehold</div>
                    <div className="text-[0.5rem]" style={{ color: "var(--color-ink-500)" }}>Outright purchase</div>
                  </button>
                  <button type="button" onClick={() => { setLandField("landType", "LEASEHOLD"); haptic(10); }}
                    className="rounded-[0.5rem] border p-2.5 text-left transition-colors"
                    style={{
                      borderColor: land.landType === "LEASEHOLD" ? "var(--color-ink-950)" : "var(--color-line)",
                      backgroundColor: land.landType === "LEASEHOLD" ? "var(--color-concrete)" : "transparent",
                    }}>
                    <div className="text-[0.6875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>Leasehold</div>
                    <div className="text-[0.5rem]" style={{ color: "var(--color-ink-500)" }}>Leased from authority</div>
                  </button>
                </div>
              </div>

              {/* ── Lease details ── */}
              {isLeasehold && (
                <div style={cardStyle} className="space-y-3">
                  <div className="text-[0.6875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>Lease Details</div>
                  <div>
                    <label className={labelClass} style={labelStyle}>Lease Rent Type</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => { setLandField("leaseType", "ONE_TIME"); haptic(10); }}
                        className="rounded-[0.375rem] border py-2 text-center transition-colors"
                        style={{
                          borderColor: land.leaseType === "ONE_TIME" ? "var(--color-ink-950)" : "var(--color-line)",
                          backgroundColor: land.leaseType === "ONE_TIME" ? "var(--color-concrete)" : "transparent",
                        }}>
                        <div className="text-[0.5rem] font-bold" style={{ color: "var(--color-ink-950)" }}>One-Time</div>
                      </button>
                      <button type="button" onClick={() => { setLandField("leaseType", "YEARLY"); haptic(10); }}
                        className="rounded-[0.375rem] border py-2 text-center transition-colors"
                        style={{
                          borderColor: land.leaseType === "YEARLY" ? "var(--color-ink-950)" : "var(--color-line)",
                          backgroundColor: land.leaseType === "YEARLY" ? "var(--color-concrete)" : "transparent",
                        }}>
                        <div className="text-[0.5rem] font-bold" style={{ color: "var(--color-ink-950)" }}>Yearly</div>
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className={labelClass} style={labelStyle}>Period (yrs)</label>
                      <input type="number" min={0} step="any" value={land.leasePeriodYears}
                        onChange={(e) => setLandField("leasePeriodYears", e.target.value)}
                        placeholder="99" inputMode="numeric"
                        className={inputClass} style={inputStyle} />
                    </div>
                    <div>
                      <label className={labelClass} style={labelStyle}>Start</label>
                      <input type="date" value={land.leaseStartDate}
                        onChange={(e) => setLandField("leaseStartDate", e.target.value)}
                        className={inputClass} style={inputStyle} />
                    </div>
                    <div>
                      <label className={labelClass} style={labelStyle}>End</label>
                      <input type="date" value={land.leaseEndDate}
                        onChange={(e) => setLandField("leaseEndDate", e.target.value)}
                        className={inputClass} style={inputStyle} />
                    </div>
                  </div>
                </div>
              )}

              {/* ── Cost Breakup ── */}
              <div style={cardStyle} className="space-y-3">
                <div className="text-[0.6875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>Cost Breakup</div>
                <div>
                  <label className={labelClass} style={labelStyle}>
                    Base Cost (₹) <span style={{ color: "var(--color-stop)" }}>*</span>
                  </label>
                  <input type="number" min={0} step="any" value={land.baseCost}
                    onChange={(e) => setLandField("baseCost", e.target.value)}
                    placeholder="0" inputMode="numeric"
                    className={inputClass} style={inputStyle} />
                </div>

                {isLeasehold && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelClass} style={labelStyle}>Lease Rent (%)</label>
                      <input type="number" min={0} step="any" value={land.leaseRentPercent}
                        onChange={(e) => setLandField("leaseRentPercent", e.target.value)}
                        placeholder="10" inputMode="decimal"
                        className={inputClass} style={inputStyle} />
                    </div>
                    <div>
                      <label className={labelClass} style={labelStyle}>Rent Amount (₹){isYearlyLease ? " /yr" : ""}</label>
                      <div className="h-10 flex items-center rounded-[0.5rem] border px-3 text-[0.6875rem]"
                        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-concrete)", color: "var(--color-ink-500)" }}>
                        {leaseRentAmount > 0 ? formatCurrency(leaseRentAmount) : "—"}
                      </div>
                      {isYearlyLease && totalLeaseRentOverTerm > 0 && (
                        <div className="text-[0.4375rem] mt-0.5" style={{ color: "var(--color-ink-500)" }}>
                          Total over {leasePeriodNum}y: <strong style={{ color: "var(--color-ink-950)" }}>{formatCurrency(totalLeaseRentOverTerm)}</strong>
                          {" "}(recurring)
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {isLeasehold && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelClass} style={labelStyle}>GST on Rent (%)</label>
                      <input type="number" min={0} step="any" value={land.gstPercent}
                        onChange={(e) => setLandField("gstPercent", e.target.value)}
                        placeholder="18" inputMode="decimal"
                        className={inputClass} style={inputStyle} />
                    </div>
                    <div>
                      <label className={labelClass} style={labelStyle}>GST Amount (₹)</label>
                      <div className="h-10 flex items-center rounded-[0.5rem] border px-3 text-[0.6875rem]"
                        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-concrete)", color: "var(--color-ink-500)" }}>
                        {gstAmount > 0 ? formatCurrency(gstAmount) : "—"}
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelClass} style={labelStyle}>Registration (%)</label>
                    <input type="number" min={0} step="any" value={land.registrationPercent}
                      onChange={(e) => setLandField("registrationPercent", e.target.value)}
                      placeholder="1" inputMode="decimal"
                      className={inputClass} style={inputStyle} />
                  </div>
                  <div>
                    <label className={labelClass} style={labelStyle}>Reg. Amount (₹)</label>
                    <div className="h-10 flex items-center rounded-[0.5rem] border px-3 text-[0.6875rem]"
                      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-concrete)", color: "var(--color-ink-500)" }}>
                      {registrationAmount > 0 ? formatCurrency(registrationAmount) : "—"}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelClass} style={labelStyle}>Stamp Duty (%)</label>
                    <input type="number" min={0} step="any" value={land.stampDutyPercent}
                      onChange={(e) => setLandField("stampDutyPercent", e.target.value)}
                      placeholder="5" inputMode="decimal"
                      className={inputClass} style={inputStyle} />
                  </div>
                  <div>
                    <label className={labelClass} style={labelStyle}>Stamp Amount (₹)</label>
                    <div className="h-10 flex items-center rounded-[0.5rem] border px-3 text-[0.6875rem]"
                      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-concrete)", color: "var(--color-ink-500)" }}>
                      {stampDutyAmount > 0 ? formatCurrency(stampDutyAmount) : "—"}
                    </div>
                  </div>
                </div>

                {/* Additional acquisition costs */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className={labelClass} style={labelStyle}>Brokerage (₹)</label>
                    <input type="number" min={0} step="0.01" value={land.brokerageAmount}
                      onChange={(e) => setLandField("brokerageAmount", e.target.value)}
                      placeholder="0" inputMode="decimal"
                      className={inputClass} style={inputStyle} />
                  </div>
                  <div>
                    <label className={labelClass} style={labelStyle}>Legal Fees (₹)</label>
                    <input type="number" min={0} step="0.01" value={land.legalFees}
                      onChange={(e) => setLandField("legalFees", e.target.value)}
                      placeholder="0" inputMode="decimal"
                      className={inputClass} style={inputStyle} />
                  </div>
                  <div>
                    <label className={labelClass} style={labelStyle}>Other (₹)</label>
                    <input type="number" min={0} step="0.01" value={land.otherCharges}
                      onChange={(e) => setLandField("otherCharges", e.target.value)}
                      placeholder="EDC/IDC" inputMode="decimal"
                      className={inputClass} style={inputStyle} />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1"
                  style={{ borderTop: "1px solid var(--color-line)" }}>
                  <span className="text-[0.6875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>Total</span>
                  <span className="text-[0.75rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                    {formatCurrency(calculatedTotal)}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass} style={labelStyle}>Registry No.</label>
                  <input type="text" value={land.registryNo}
                    onChange={(e) => setLandField("registryNo", e.target.value)}
                    placeholder="REG-2024-0123" enterKeyHint="next"
                    className={inputClass} style={inputStyle} />
                </div>
                <div>
                  <label className={labelClass} style={labelStyle}>Purchase Date</label>
                  <input type="date" value={land.purchaseDate}
                    onChange={(e) => setLandField("purchaseDate", e.target.value)}
                    className={inputClass} style={inputStyle} />
                </div>
              </div>

              {/* Document upload */}
              <div>
                <label className={labelClass} style={labelStyle}>Document</label>
                {documentUrl ? (
                  <div className="flex items-center justify-between gap-2 rounded-[0.5rem] border px-3 py-2"
                    style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-concrete)" }}>
                    <a href={documentUrl} target="_blank" rel="noreferrer"
                      className="flex min-w-0 items-center gap-1.5 text-[0.6875rem] underline underline-offset-2"
                      style={{ color: "var(--color-ink-950)" }}>
                      <FileText className="size-3.5 shrink-0" style={{ color: "var(--color-ink-500)" }} />
                      <span className="truncate">{documentName || "View document"}</span>
                    </a>
                    <button type="button" onClick={removeDocument}
                      className="shrink-0 grid place-items-center size-6 rounded press"
                      style={{ color: "var(--color-ink-500)" }} aria-label="Remove">
                      <X className="size-3.5" />
                    </button>
                  </div>
                ) : (
                  <label
                    className="flex cursor-pointer items-center justify-center gap-1.5 rounded-[0.5rem] border border-dashed px-3 py-2.5 text-[0.5625rem] transition-colors"
                    style={{
                      borderColor: "var(--color-line)",
                      color: "var(--color-ink-500)",
                    }}>
                    <Upload className="size-3.5" />
                    {uploading ? "Uploading…" : "Upload sale deed / registry document"}
                    <input type="file" className="hidden" onChange={handleFileUpload}
                      disabled={uploading}
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.zip" />
                  </label>
                )}
              </div>

              {/* Parent parcel number */}
              <div>
                <label className={labelClass} style={labelStyle}>Parent Parcel Number</label>
                <input type="text" value={land.parentParcelNumber}
                  onChange={(e) => setLandField("parentParcelNumber", e.target.value)}
                  placeholder="PLOT-1 (default)" enterKeyHint="next"
                  className={inputClass} style={inputStyle} />
              </div>

              {/* Mode selection */}
              <div className="pt-1">
                <label className={labelClass} style={labelStyle}>How is this land being purchased?</label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => selectMode("WHOLE")}
                    className="rounded-[0.5rem] border p-3 text-left transition-colors"
                    style={{
                      borderColor: mode === "WHOLE" ? "var(--color-ink-950)" : "var(--color-line)",
                      backgroundColor: mode === "WHOLE" ? "var(--color-concrete)" : "transparent",
                    }}>
                    <CircleDollarSign className="size-4 mb-1"
                      style={{ color: mode === "WHOLE" ? "var(--color-ink-950)" : "var(--color-ink-500)" }} />
                    <div className="text-[0.6875rem] font-bold"
                      style={{ color: "var(--color-ink-950)" }}>Whole Plot</div>
                    <div className="text-[0.5rem]"
                      style={{ color: "var(--color-ink-500)" }}>Single parcel</div>
                  </button>
                  <button type="button" onClick={() => selectMode("SUBDIVIDED")}
                    className="rounded-[0.5rem] border p-3 text-left transition-colors"
                    style={{
                      borderColor: mode === "SUBDIVIDED" ? "var(--color-ink-950)" : "var(--color-line)",
                      backgroundColor: mode === "SUBDIVIDED" ? "var(--color-concrete)" : "transparent",
                    }}>
                    <SplitSquareHorizontal className="size-4 mb-1"
                      style={{ color: mode === "SUBDIVIDED" ? "var(--color-ink-950)" : "var(--color-ink-500)" }} />
                    <div className="text-[0.6875rem] font-bold"
                      style={{ color: "var(--color-ink-950)" }}>Sub-divided</div>
                    <div className="text-[0.5rem]"
                      style={{ color: "var(--color-ink-500)" }}>Multiple sections</div>
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Step 2: Sections */}
          {step === 2 && (
            <>
              {mode === "WHOLE" ? (
                <MobileSectionEditor
                  section={sections[0]!} index={0} areaUnit={land.areaUnit}
                  totalCost={totalCostNum} sectionsAreaSum={sectionsAreaSum}
                  projects={localProjects} landLocation={land.location}
                  canRemove={false} isWhole
                  onUpdate={(patch) => updateSection(sections[0]!.id, patch)}
                  onRemove={() => {}}
                  onProjectCreated={(p) => setLocalProjects((prev) => [...prev, p])}
                  inputClass={inputClass} inputStyle={inputStyle}
                  labelClass={labelClass} labelStyle={labelStyle} cardStyle={cardStyle}
                />
              ) : (
                <>
                  {sections.map((sec, i) => (
                    <MobileSectionEditor
                      key={sec.id} section={sec} index={i} areaUnit={land.areaUnit}
                      totalCost={totalCostNum} sectionsAreaSum={sectionsAreaSum}
                      projects={localProjects} landLocation={land.location}
                      canRemove={sections.length > 2}
                      onUpdate={(patch) => updateSection(sec.id, patch)}
                      onRemove={() => removeSection(sec.id)}
                      onProjectCreated={(p) => setLocalProjects((prev) => [...prev, p])}
                      inputClass={inputClass} inputStyle={inputStyle}
                      labelClass={labelClass} labelStyle={labelStyle} cardStyle={cardStyle}
                    />
                  ))}
                  <button type="button" onClick={addSection}
                    className="w-full h-10 rounded-[0.5rem] border text-[0.6875rem] font-bold press flex items-center justify-center gap-1.5"
                    style={{ borderColor: "var(--color-line)", color: "var(--color-ink-600)" }}>
                    <Plus className="size-3.5" /> Add Section
                  </button>
                  {/* Area conservation */}
                  <div className="rounded-[0.5rem] px-3 py-2 text-[0.5625rem]"
                    style={{
                      border: `1px solid ${areaValid ? "var(--color-line)" : "var(--color-stop)"}`,
                      backgroundColor: areaValid ? "var(--color-concrete)" : "rgba(239,68,68,0.05)",
                      color: areaValid ? "var(--color-ink-500)" : "var(--color-stop)",
                    }}>
                    Sections: <strong>{formatNumber(sectionsAreaSum, 2)} {land.areaUnit}</strong>
                    {" / "}Total: <strong>{formatNumber(totalAreaNum, 2)} {land.areaUnit}</strong>
                    {!areaValid && <span> — Diff: {formatNumber(areaDiff, 2)}</span>}
                    {areaValid && <Check className="inline ml-1 size-2.5" />}
                  </div>
                </>
              )}
            </>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <>
              <div style={cardStyle} className="space-y-1.5">
                <div className="text-[0.75rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
                  Review Land Purchase
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[0.5625rem]">
                  <div style={{ color: "var(--color-ink-500)" }}>
                    Seller: <span style={{ color: "var(--color-ink-950)" }}>{land.sellerName}</span>
                  </div>
                  <div style={{ color: "var(--color-ink-500)" }}>
                    Type: <span style={{ color: "var(--color-ink-950)" }}>{land.landType === "FREEHOLD" ? "Freehold" : `Leasehold (${land.leaseType === "ONE_TIME" ? "One-time" : "Yearly"})`}</span>
                  </div>
                  <div style={{ color: "var(--color-ink-500)" }}>
                    Mode: <span style={{ color: "var(--color-ink-950)" }}>{mode === "WHOLE" ? "Whole" : "Sub-divided"}</span>
                  </div>
                  <div style={{ color: "var(--color-ink-500)" }}>
                    Area: <span style={{ color: "var(--color-ink-950)" }}>{formatNumber(totalAreaNum, 2)} {land.areaUnit}</span>
                  </div>
                  {land.location && (
                    <div style={{ color: "var(--color-ink-500)" }}>
                      Location: <span style={{ color: "var(--color-ink-950)" }}>{land.location}</span>
                    </div>
                  )}
                </div>
                {/* Cost breakup summary */}
                <div className="pt-1.5 space-y-0.5 text-[0.5625rem]" style={{ borderTop: "1px solid var(--color-line)" }}>
                  <div className="flex justify-between"><span style={{ color: "var(--color-ink-500)" }}>Base:</span> <strong style={{ color: "var(--color-ink-950)" }} className="tabular-nums">{formatCurrency(baseCostNum)}</strong></div>
                  {isLeasehold && leaseRentAmount > 0 && (
                    <div className="flex justify-between"><span style={{ color: "var(--color-ink-500)" }}>Rent ({land.leaseRentPercent}%):</span> <strong style={{ color: "var(--color-ink-950)" }} className="tabular-nums">{formatCurrency(leaseRentAmount)}</strong></div>
                  )}
                  {isLeasehold && gstAmount > 0 && (
                    <div className="flex justify-between"><span style={{ color: "var(--color-ink-500)" }}>GST ({land.gstPercent}%):</span> <strong style={{ color: "var(--color-ink-950)" }} className="tabular-nums">{formatCurrency(gstAmount)}</strong></div>
                  )}
                  {registrationAmount > 0 && (
                    <div className="flex justify-between"><span style={{ color: "var(--color-ink-500)" }}>Reg. ({land.registrationPercent}%):</span> <strong style={{ color: "var(--color-ink-950)" }} className="tabular-nums">{formatCurrency(registrationAmount)}</strong></div>
                  )}
                  {stampDutyAmount > 0 && (
                    <div className="flex justify-between"><span style={{ color: "var(--color-ink-500)" }}>Stamp ({land.stampDutyPercent}%):</span> <strong style={{ color: "var(--color-ink-950)" }} className="tabular-nums">{formatCurrency(stampDutyAmount)}</strong></div>
                  )}
                  {brokerageNum > 0 && (
                    <div className="flex justify-between"><span style={{ color: "var(--color-ink-500)" }}>Brokerage:</span> <strong style={{ color: "var(--color-ink-950)" }} className="tabular-nums">{formatCurrency(brokerageNum)}</strong></div>
                  )}
                  {legalFeesNum > 0 && (
                    <div className="flex justify-between"><span style={{ color: "var(--color-ink-500)" }}>Legal Fees:</span> <strong style={{ color: "var(--color-ink-950)" }} className="tabular-nums">{formatCurrency(legalFeesNum)}</strong></div>
                  )}
                  {otherChargesNum > 0 && (
                    <div className="flex justify-between"><span style={{ color: "var(--color-ink-500)" }}>Other:</span> <strong style={{ color: "var(--color-ink-950)" }} className="tabular-nums">{formatCurrency(otherChargesNum)}</strong></div>
                  )}
                  <div className="flex justify-between font-bold pt-0.5" style={{ borderTop: "1px solid var(--color-line)" }}>
                    <span style={{ color: "var(--color-ink-950)" }}>Total:</span>
                    <strong style={{ color: "var(--color-ink-950)" }} className="tabular-nums">{formatCurrency(calculatedTotal)}</strong>
                  </div>
                </div>
              </div>
              <div className="text-[0.6875rem] font-bold pt-1" style={{ color: "var(--color-ink-950)" }}>
                Parcels ({sections.length})
              </div>
              <div className="space-y-2">
                {sections.map((s, i) => (
                  <div key={s.id} style={cardStyle} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[0.6875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>{s.number}</span>
                      <MobilePurposeBadge purpose={s.purpose} />
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[0.5625rem]" style={{ color: "var(--color-ink-500)" }}>
                      <div>Area: <strong style={{ color: "var(--color-ink-950)" }}>{formatNumber(Number(s.area) || 0, 2)} {land.areaUnit}</strong></div>
                      <div>Cost: <strong style={{ color: "var(--color-ink-950)" }}>{formatCurrency(sectionCost(s))}</strong></div>
                      <div>
                        {s.purpose === "SELL" && s.askingPrice && <>Ask: <strong style={{ color: "var(--color-ink-950)" }}>{formatCurrency(Number(s.askingPrice))}</strong></>}
                        {s.purpose === "PROJECT" && (
                          <>Project: <strong style={{ color: "var(--color-ink-950)" }}>{s.projectId ? localProjects.find((p) => p.id === s.projectId)?.name : s.projectCreateName}</strong></>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Step 4: Permissions & Legal (post-creation) */}
          {step === 4 && createdLandPurchaseId && (
            <>
              <div className="rounded-[0.5rem] px-3 py-2.5 flex items-start gap-2"
                style={{ backgroundColor: "var(--color-concrete)" }}>
                <ShieldCheck className="size-4 shrink-0 mt-0.5" style={{ color: "var(--color-brand)" }} />
                <div>
                  <div className="text-[0.75rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
                    Land recorded — add permissions
                  </div>
                  <div className="text-[0.5625rem]" style={{ color: "var(--color-ink-500)" }}>
                    Start recording ownership certificate, non-encumbrance, land sanction (CLU), mutation, ATS, and transfer duty. You can also add these later from the Legal tab.
                  </div>
                </div>
              </div>
              <MobileLegalDocsSection
                docs={createdLegalDocs}
                landPurchaseId={createdLandPurchaseId}
                canManage={true}
                context="LAND"
              />
            </>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex gap-2 p-4 pt-2"
          style={{ backgroundColor: "var(--color-paper)", borderTop: "1px solid var(--color-line)" }}>
          {step > 1 && step < 4 && (
            <button type="button" onClick={back} disabled={saving}
              className="h-11 rounded-[0.5rem] border text-[0.75rem] font-bold press disabled:opacity-50 flex items-center justify-center gap-1"
              style={{ borderColor: "var(--color-line)", color: "var(--color-ink-500)", backgroundColor: "transparent", minWidth: "5rem" }}>
              <ChevronLeft className="size-4" /> Back
            </button>
          )}
          {step < 3 ? (
            <button type="button" onClick={next} disabled={saving}
              className="flex-1 h-11 rounded-[0.5rem] text-[0.75rem] font-bold press disabled:opacity-50 flex items-center justify-center gap-1.5"
              style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}>
              Next <ChevronRight className="size-4" />
            </button>
          ) : step === 3 ? (
            <button type="button" onClick={onSubmit} disabled={saving}
              className="flex-1 h-11 rounded-[0.5rem] text-[0.75rem] font-bold press disabled:opacity-50 flex items-center justify-center gap-1.5"
              style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {saving ? "Saving…" : "Record Purchase"}
            </button>
          ) : (
            <button type="button" onClick={onClose}
              className="flex-1 h-11 rounded-[0.5rem] text-[0.75rem] font-bold press flex items-center justify-center gap-1.5"
              style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}>
              <Check className="size-4" /> Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Mobile Section Editor ───
function MobileSectionEditor({
  section, index, areaUnit, totalCost, sectionsAreaSum,
  projects, landLocation, canRemove, isWhole, onUpdate, onRemove, onProjectCreated,
  inputClass, inputStyle, labelClass, labelStyle, cardStyle,
}: {
  section: SectionForm; index: number; areaUnit: string; totalCost: number;
  sectionsAreaSum: number; projects: ProjectOption[]; landLocation: string;
  canRemove: boolean; isWhole?: boolean;
  onUpdate: (patch: Partial<SectionForm>) => void;
  onRemove: () => void; onProjectCreated: (p: ProjectOption) => void;
  inputClass: string; inputStyle: React.CSSProperties;
  labelClass: string; labelStyle: React.CSSProperties; cardStyle: React.CSSProperties;
}) {
  const cost = sectionsAreaSum > 0 ? (totalCost * (Number(section.area) || 0)) / sectionsAreaSum : 0;

  return (
    <div style={cardStyle} className="space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[0.6875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
          {isWhole ? "Parcel" : `Section ${index + 1}`}
        </span>
        {canRemove && (
          <button type="button" onClick={onRemove}
            className="grid place-items-center size-6 rounded press"
            style={{ color: "var(--color-stop)" }} aria-label="Remove">
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>

      <div className={isWhole ? "space-y-2" : "grid grid-cols-2 gap-2"}>
        <div>
          <label className={labelClass} style={labelStyle}>Parcel No. *</label>
          <input type="text" value={section.number}
            onChange={(e) => onUpdate({ number: e.target.value })}
            placeholder="PLOT-01" className={inputClass} style={inputStyle} />
        </div>
        {!isWhole && (
          <div>
            <label className={labelClass} style={labelStyle}>Area ({areaUnit}) *</label>
            <input type="number" min={0} step="any" value={section.area}
              onChange={(e) => onUpdate({ area: e.target.value })}
              placeholder="0" inputMode="decimal" className={inputClass} style={inputStyle} />
          </div>
        )}
        {isWhole && (
          <div className="text-[0.5rem]" style={{ color: "var(--color-ink-500)" }}>
            Area: <strong style={{ color: "var(--color-ink-950)" }}>{formatNumber(Number(section.area) || 0, 2)} {areaUnit}</strong> (from total)
          </div>
        )}
      </div>

      {Number(section.area) > 0 && (
        <div className="text-[0.5rem]" style={{ color: "var(--color-ink-500)" }}>
          Cost: <strong style={{ color: "var(--color-ink-950)" }}>{formatCurrency(cost)}</strong> (PRO_RATA)
        </div>
      )}

      {/* Purpose */}
      <div>
        <label className={labelClass} style={labelStyle}>Purpose</label>
        <div className="grid grid-cols-3 gap-1.5">
          {([
            { value: "SELL" as const, label: "Sell", icon: CircleDollarSign },
            { value: "PROJECT" as const, label: "Project", icon: Building2 },
            { value: "HOLD" as const, label: "Hold", icon: MapPin },
          ]).map((opt) => (
            <button key={opt.value} type="button"
              onClick={() => { onUpdate({ purpose: opt.value }); haptic(10); }}
              className="rounded-[0.375rem] border py-2 text-center transition-colors"
              style={{
                borderColor: section.purpose === opt.value ? "var(--color-ink-950)" : "var(--color-line)",
                backgroundColor: section.purpose === opt.value ? "var(--color-concrete)" : "transparent",
              }}>
              <opt.icon className="mx-auto size-3.5 mb-0.5"
                style={{ color: section.purpose === opt.value ? "var(--color-ink-950)" : "var(--color-ink-500)" }} />
              <div className="text-[0.5rem] font-bold"
                style={{ color: section.purpose === opt.value ? "var(--color-ink-950)" : "var(--color-ink-500)" }}>
                {opt.label}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* SELL: asking price */}
      {section.purpose === "SELL" && (
        <div>
          <label className={labelClass} style={labelStyle}>Asking Price (₹) — optional</label>
          <input type="number" min={0} step="any" value={section.askingPrice}
            onChange={(e) => onUpdate({ askingPrice: e.target.value })}
            placeholder="0" inputMode="numeric" className={inputClass} style={inputStyle} />
        </div>
      )}

      {/* PROJECT: select or create */}
      {section.purpose === "PROJECT" && (
        <MobileSelectWithCreate
          label="Project *"
          value={section.projectId}
          onChange={(v) => onUpdate({ projectId: v, projectCreateName: "" })}
          placeholder="Select a project…"
          options={projects.map((p) => ({ value: p.id, label: p.name }))}
          inputClass={inputClass} inputStyle={inputStyle}
          renderDialog={({ open, onClose, onCreated }) => (
            <MobileNewProjectDialog
              open={open}
              onClose={onClose}
              initial={{
                type: "LAND",
                status: "PLANNED",
                address: landLocation || undefined,
                totalSellableArea: Number(section.area) || undefined,
              }}
              onCreated={(p) => {
                onProjectCreated(p);
                onCreated(p.id, p.name);
              }}
            />
          )}
        />
      )}
    </div>
  );
}

function MobilePurposeBadge({ purpose }: { purpose: Purpose }) {
  const config = {
    SELL: { label: "For Sale", bg: "rgba(34,197,94,0.1)", color: "rgb(22,163,74)" },
    PROJECT: { label: "Project", bg: "var(--color-concrete)", color: "var(--color-ink-950)" },
    HOLD: { label: "Hold", bg: "var(--color-line)", color: "var(--color-ink-500)" },
  };
  const c = config[purpose];
  return (
    <span className="rounded-full px-2 py-0.5 text-[0.5rem] font-bold"
      style={{ backgroundColor: c.bg, color: c.color }}>
      {c.label}
    </span>
  );
}
