"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { MobileDialog } from "@/components/mobile/v2/dialog";
import { EnumSelect } from "@/components/mobile/v2/form-primitives";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";
import { MobileNewProjectDialog } from "@/app/m/projects/MobileNewProjectDialog";
import { MobileNewCustomerDialog } from "@/app/m/sales/MobileNewCustomerDialog";

type AssetType = "LAND" | "BUILT_UNIT";

interface AssetOption {
  id: string;
  label: string;
}

interface ProjectOption {
  id: string;
  name: string;
}

interface CustomerOption {
  id: string;
  name: string;
}

interface FormState {
  assetType: AssetType;
  assetId: string;
  customerId: string;
  projectId: string;
  tenantName: string;
  tenantPhone: string;
  tenantEmail: string;
  startDate: string;
  endDate: string;
  monthlyRent: string;
  securityDeposit: string;
  rentAgreementNo: string;
  sacCode: string;
  rentFreeDays: string;
  escalationPct: string;
  escalationIntervalMonths: string;
  draftNotes: string;
  draftDate: string;
  notes: string;
}

/**
 * MobileNewTenancyDialog — bottom-sheet form for creating a rental/lease
 * tenancy from the mobile surface. Mirrors the desktop rentals-view's
 * API contract (POST /api/tenancies).
 */
export function MobileNewTenancyDialog({
  open,
  onClose,
  units,
  parcels,
  projects,
  customers,
}: {
  open: boolean;
  onClose: () => void;
  units: AssetOption[];
  parcels: AssetOption[];
  projects: ProjectOption[];
  customers: CustomerOption[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [showDraftLoi, setShowDraftLoi] = useState(false);
  const [form, setForm] = useState<FormState>({
    assetType: "BUILT_UNIT",
    assetId: "",
    customerId: "",
    projectId: "",
    tenantName: "",
    tenantPhone: "",
    tenantEmail: "",
    startDate: "",
    endDate: "",
    monthlyRent: "",
    securityDeposit: "",
    rentAgreementNo: "",
    sacCode: "997313", // default: construction equipment rental, 18%
    rentFreeDays: "",
    escalationPct: "",
    escalationIntervalMonths: "12",
    draftNotes: "",
    draftDate: "",
    notes: "",
  });

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const assets = form.assetType === "LAND" ? parcels : units;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.assetId) {
      toast.error("Please select an asset to rent out");
      return;
    }
    if (!form.tenantName.trim()) {
      toast.error("Tenant name is required");
      return;
    }
    if (!form.startDate || !form.endDate) {
      toast.error("Start and end dates are required");
      return;
    }
    if (new Date(form.endDate) <= new Date(form.startDate)) {
      toast.error("End date must be after start date");
      return;
    }
    if (!form.monthlyRent || Number(form.monthlyRent) <= 0) {
      toast.error("Monthly rent must be greater than 0");
      return;
    }
    setSaving(true);
    haptic(10);
    try {
      const res = await fetch("/api/tenancies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetType: form.assetType,
          landParcelId: form.assetType === "LAND" ? form.assetId : null,
          builtUnitId: form.assetType === "BUILT_UNIT" ? form.assetId : null,
          customerId: form.customerId || null,
          projectId: form.projectId || null,
          tenantName: form.tenantName.trim(),
          tenantPhone: form.tenantPhone.trim() || null,
          tenantEmail: form.tenantEmail.trim() || null,
          startDate: form.startDate,
          endDate: form.endDate,
          monthlyRent: Number(form.monthlyRent),
          securityDeposit:
            form.securityDeposit === "" ? 0 : Number(form.securityDeposit),
          rentAgreementNo: form.rentAgreementNo.trim() || null,
          sacCode: form.sacCode.trim() || null,
          rentFreeDays: form.rentFreeDays === "" ? 0 : Number(form.rentFreeDays),
          escalationPercent: form.escalationPct === "" ? null : Number(form.escalationPct),
          escalationIntervalMonths: Number(form.escalationIntervalMonths) || 12,
          draftNotes: form.draftNotes.trim() || null,
          draftDate: form.draftDate || null,
          notes: form.notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create tenancy");
      haptic([10, 40, 80]);
      toast.success("Tenancy created");
      onClose();
      router.refresh();
    } catch (err) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors";
  const inputStyle = {
    borderColor: "var(--color-line)",
    backgroundColor: "transparent",
    color: "var(--color-ink-950)",
  };
  const labelClass = "block text-m-caption font-bold mb-0";
  const labelStyle = { color: "var(--color-ink-700)" };

  return (
    <MobileDialog open={open} onClose={onClose} title="New Tenancy">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* ── Asset ── */}
          <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
            <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>Asset</p>
          {/* Asset Type Toggle — horizontal */}
          <div>
            <label className={labelClass} style={labelStyle}>
              Asset Type
            </label>
            <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
              <button
                type="button"
                onClick={() => {
                  set("assetType", "BUILT_UNIT");
                  set("assetId", "");
                  haptic(10);
                }}
                className="h-9 rounded-[0.375rem] border-2 text-m-caption font-bold text-m-body press"
                style={{
                  borderColor:
                    form.assetType === "BUILT_UNIT"
                      ? "var(--color-ink-950)"
                      : "var(--color-line)",
                  backgroundColor:
                    form.assetType === "BUILT_UNIT"
                      ? "var(--color-ink-950)"
                      : "var(--color-paper)",
                  color:
                    form.assetType === "BUILT_UNIT"
                      ? "var(--color-paper)"
                      : "var(--color-ink-500)",
                }}
              >
                Built Unit
              </button>
              <button
                type="button"
                onClick={() => {
                  set("assetType", "LAND");
                  set("assetId", "");
                  haptic(10);
                }}
                className="h-9 rounded-[0.375rem] border-2 text-m-caption font-bold text-m-body press"
                style={{
                  borderColor:
                    form.assetType === "LAND"
                      ? "var(--color-ink-950)"
                      : "var(--color-line)",
                  backgroundColor:
                    form.assetType === "LAND"
                      ? "var(--color-ink-950)"
                      : "var(--color-paper)",
                  color:
                    form.assetType === "LAND" ? "var(--color-paper)" : "var(--color-ink-500)",
                }}
              >
                Land Parcel
              </button>
            </div>
          </div>

          {/* Asset Selector */}
          <div>
            <MobileSelectWithCreate
              label={form.assetType === "LAND" ? "Land Parcel" : "Built Unit"}
              required
              value={form.assetId}
              onChange={(v) => set("assetId", v)}
              options={assets.map((a) => ({ value: a.id, label: a.label }))}
              placeholder={`— Select ${form.assetType === "LAND" ? "parcel" : "unit"} —`}
            />
            {assets.length === 0 && (
              <p
                className="text-m-caption mt-1"
                style={{ color: "var(--color-ink-700)" }}
              >
                No {form.assetType === "LAND" ? "land parcels" : "built units"}{" "}
                available.{" "}
                <Link
                  href={form.assetType === "LAND" ? "/m/land" : "/m/units"}
                  className="underline font-semibold"
                >
                  Create one first
                </Link>
                .
              </p>
            )}
          </div>
          </div>

          {/* ── Tenant ── */}
          <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
            <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>Tenant</p>
          {/* Tenant Name */}
          <div>
            <label className={labelClass} style={labelStyle}>
              Tenant Name <span style={{ color: "var(--color-stop)" }}>*</span>
            </label>
            <input
              type="text"
              value={form.tenantName}
              onChange={(e) => set("tenantName", e.target.value)}
              placeholder="e.g. Sharma Enterprises"
              autoFocus
              enterKeyHint="next"
              className={inputClass}
              style={inputStyle}
            />
          </div>

          {/* Tenant Phone + Email */}
          <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
            <div>
              <label className={labelClass} style={labelStyle}>
                Tenant Phone
              </label>
              <input
                type="tel"
                value={form.tenantPhone}
                onChange={(e) => set("tenantPhone", e.target.value)}
                placeholder="98765 43210"
                enterKeyHint="next"
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>
                Tenant Email
              </label>
              <input
                type="email"
                value={form.tenantEmail}
                onChange={(e) => set("tenantEmail", e.target.value)}
                placeholder="tenant@email.com"
                enterKeyHint="next"
                className={inputClass}
                style={inputStyle}
              />
            </div>
          </div>
          </div>

          {/* ── Linkages ── */}
          <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
            <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>Linkages</p>
          {/* Project (optional, shows for both asset types) */}
          <MobileSelectWithCreate
            label="Link to Project (optional)"
            value={form.projectId}
            onChange={(v) => set("projectId", v)}
            options={projects.map((p) => ({ value: p.id, label: p.name }))}
            placeholder="— No specific project —"
            inputClass={inputClass}
            inputStyle={inputStyle}
            labelClass={labelClass}
            labelStyle={labelStyle}
            renderDialog={({ open, onClose, onCreated }) => (
              <MobileNewProjectDialog
                open={open}
                onClose={onClose}
                onCreated={(p) => onCreated(p.id, p.name)}
              />
            )}
          />

          {/* Customer (optional) */}
          {customers.length > 0 && (
            <MobileSelectWithCreate
              label="Link to Customer (optional)"
              value={form.customerId}
              onChange={(v) => set("customerId", v)}
              options={customers.map((c) => ({ value: c.id, label: c.name }))}
              placeholder="— None —"
              inputClass={inputClass}
              inputStyle={inputStyle}
              labelClass={labelClass}
              labelStyle={labelStyle}
              renderDialog={({ open, onClose, onCreated }) => (
                <MobileNewCustomerDialog
                  open={open}
                  onClose={onClose}
                  onCreated={(c) => onCreated(c.id, c.name)}
                />
              )}
            />
          )}
          </div>

          {/* ── Terms ── */}
          <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
            <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>Terms</p>
          {/* Dates */}
          <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
            <div>
              <label className={labelClass} style={labelStyle}>
                Start Date <span style={{ color: "var(--color-stop)" }}>*</span>
              </label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => set("startDate", e.target.value)}
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>
                End Date <span style={{ color: "var(--color-stop)" }}>*</span>
              </label>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => set("endDate", e.target.value)}
                className={inputClass}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Rent + Deposit */}
          <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
            <div>
              <label className={labelClass} style={labelStyle}>
                Monthly Rent (₹){" "}
                <span style={{ color: "var(--color-stop)" }}>*</span>
              </label>
              <input
                type="number"
                min={0}
                step="any"
                value={form.monthlyRent}
                onChange={(e) => set("monthlyRent", e.target.value)}
                placeholder="0"
                inputMode="numeric"
                className={`${inputClass} tabular-nums`}
                style={inputStyle}
              />
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>
                Security Deposit (₹)
              </label>
              <input
                type="number"
                min={0}
                step="any"
                value={form.securityDeposit}
                onChange={(e) => set("securityDeposit", e.target.value)}
                placeholder="0"
                inputMode="numeric"
                className={`${inputClass} tabular-nums`}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Agreement No */}
          <div>
            <label className={labelClass} style={labelStyle}>
              Agreement Reference No.
            </label>
            <input
              type="text"
              value={form.rentAgreementNo}
              onChange={(e) => set("rentAgreementNo", e.target.value)}
              placeholder="e.g. LEASE-2024-001"
              enterKeyHint="done"
              className={inputClass}
              style={inputStyle}
            />
          </div>

          {/* Rent-free / fit-out period */}
          <div>
            <label className={labelClass} style={labelStyle}>
              Rent-free / fit-out period (days)
            </label>
            <input
              type="number"
              min={0}
              value={form.rentFreeDays}
              onChange={(e) => set("rentFreeDays", e.target.value)}
              placeholder="0 — days before rent starts"
              inputMode="numeric"
              className={inputClass}
              style={inputStyle}
            />
          </div>

          {/* Yearly escalation — client: "इयरली इंक्रीमेंट कितना है? वो ऐड कर दे" */}
          <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
            <div>
              <label className={labelClass} style={labelStyle}>
                Yearly Escalation (%)
              </label>
              <input
                type="number"
                min={0}
                step="any"
                value={form.escalationPct}
                onChange={(e) => set("escalationPct", e.target.value)}
                placeholder="e.g. 5"
                inputMode="decimal"
                className={`${inputClass} tabular-nums`}
                style={inputStyle}
              />
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>
                Every (months)
              </label>
              <input
                type="number"
                min={1}
                value={form.escalationIntervalMonths}
                onChange={(e) => set("escalationIntervalMonths", e.target.value)}
                placeholder="12"
                inputMode="numeric"
                className={`${inputClass} tabular-nums`}
                style={inputStyle}
              />
            </div>
          </div>

          {/* SAC Code — determines GST rate on rental income */}
          <div>
            <EnumSelect
              label="SAC Code (GST on rent)"
              value={form.sacCode}
              onChange={(v) => set("sacCode", v)}
              options={[
                { value: "997313", label: "997313 — Construction equipment rental (18%)" },
                { value: "997314", label: "997314 — Office machinery rental (18%)" },
                { value: "997317", label: "997317 — Other machinery rental (18%)" },
                { value: "997319", label: "997319 — Other equipment rental (18%)" },
                { value: "997323", label: "997323 — Furniture & fixtures rental (18%)" },
                { value: "997329", label: "997329 — General goods rental (18%)" },
                { value: "997212", label: "997212 — Non-residential property rent (18%)" },
                { value: "997211", label: "997211 — Residential property rent (exempt)" },
                { value: "9973", label: "9973 — Leasing/rental (parent heading, 18%)" },
              ]}
            />
            <p
              className="text-m-caption mt-1"
              style={{ color: "var(--color-ink-700)" }}
            >
              SAC (Service Accounting Code) determines the GST rate on rental income.
            </p>
          </div>
          </div>

          {/* ── Draft / LOI ── */}
          <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
          {/* Draft / LOI — collapsible */}
          <button
            type="button"
            onClick={() => { setShowDraftLoi((v) => !v); haptic(10); }}
            className="flex items-center gap-1.5 text-m-section font-extrabold tracking-tight press"
            style={{ color: "var(--color-ink-950)" }}
          >
            {showDraftLoi ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
            Draft / LOI {form.draftDate || form.draftNotes ? "· has data" : "(optional)"}
          </button>
          {showDraftLoi && (
            <>
              {/* Draft / LOI notes — client: "तेरा मेरा एग्रीमेंट हुआ बैठ के...
                  वो इस पे डाल दूंगा" — informal terms before formal agreement */}
              <div>
                <label className={labelClass} style={labelStyle}>
                  Draft / LOI Date
                </label>
                <input
                  type="date"
                  value={form.draftDate}
                  onChange={(e) => set("draftDate", e.target.value)}
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
              <div>
                <label className={labelClass} style={labelStyle}>
                  Draft / LOI Notes
                </label>
                <textarea
                  value={form.draftNotes}
                  onChange={(e) => set("draftNotes", e.target.value)}
                  placeholder="Informal terms discussed before the formal agreement — what was agreed verbally (e.g. possession date, work tenant will do, escalation terms)…"
                  rows={3}
                  className="w-full px-1 py-1 text-m-caption outline-none border-b focus:border-b-2 resize-none transition-colors"
                  style={{
                    borderColor: "var(--color-line)",
                    backgroundColor: "transparent",
                    color: "var(--color-ink-950)",
                  }}
                />
                <p
                  className="text-m-caption mt-1"
                  style={{ color: "var(--color-ink-700)" }}
                >
                  Appears on the printable Draft / LOI on company letterhead. Not the registered agreement.
                </p>
              </div>
            </>
          )}
          </div>

          {/* ══════ STICKY BOTTOM ACTION BAR ══════ */}
          <div
            className="sticky bottom-0 left-0 right-0 z-20 border-t -mx-3 -mb-3 px-3 py-2"
            style={{
              backgroundColor: "var(--color-paper)",
              borderColor: "var(--color-line)",
            }}
          >
            <div className="flex items-center justify-end gap-3">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-m-section font-bold text-m-body press disabled:opacity-50"
                style={{
                  backgroundColor: "var(--color-ink-950)",
                  color: "var(--color-paper)",
                }}
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                {saving ? "Creating…" : "Create Tenancy"}
              </button>
            </div>
          </div>
        </form>
    </MobileDialog>
  );
}
