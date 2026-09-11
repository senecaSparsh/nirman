"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2, CheckCircle2, MapPin, Crosshair,
} from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import { MobileNewProjectDialog } from "@/app/m/projects/MobileNewProjectDialog";
import {
  SectionCard,
  UnderlineInput,
  TypeCard,
  StickyActionBar,
  EnumSelect,
} from "@/components/mobile/v2/form-primitives";

interface ProjectItem { id: string; name: string; }
interface CompanyItem { id: string; name: string; isParent: boolean; }

type LocationType = "COMPANY_WAREHOUSE" | "PROJECT_SITE" | "CENTRAL_WAREHOUSE" | "DEPARTMENT";

export default function MobileNewStockLocationClient({
  projects,
  companies = [],
  currentCompanyId,
}: {
  projects: ProjectItem[];
  companies?: CompanyItem[];
  currentCompanyId: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const [type, setType] = useState<LocationType>("COMPANY_WAREHOUSE");
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState("");
  const [targetCompanyId, setTargetCompanyId] = useState(currentCompanyId);
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [geoRadius, setGeoRadius] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [geoAccuracy, setGeoAccuracy] = useState<number | null>(null);
  const [dupWarning, setDupWarning] = useState<string | null>(null);

  // Whether the current company has children (show company selector)
  const hasChildren = companies.filter((c) => c.id !== currentCompanyId).length > 0;
  // Whether this type needs a project selector
  const needsProject = type === "PROJECT_SITE";
  // Whether this type can target a child company
  const canTargetCompany = type === "COMPANY_WAREHOUSE" || type === "DEPARTMENT";

  async function handleDetectLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast.error("Geolocation is not supported on this device");
      return;
    }
    setDetecting(true);
    haptic(10);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        });
      });
      const { latitude, longitude, accuracy } = position.coords;
      setLat(latitude.toFixed(6));
      setLng(longitude.toFixed(6));
      setGeoAccuracy(Math.round(accuracy));
      // Default radius to 500m if not already set — covers most construction sites
      if (!geoRadius) setGeoRadius("500");

      // Reverse-geocode to auto-fill the address (Nominatim / OpenStreetMap — free, no API key)
      // Runs in the background; if it fails, the user still has the coordinates.
      if (!address.trim()) {
        fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
          { headers: { "Accept-Language": "en" } },
        )
          .then((r) => r.ok ? r.json() : null)
          .then((data: { display_name?: string } | null) => {
            if (data?.display_name) {
              setAddress(data.display_name);
              toast.success("Address auto-filled from location");
            }
          })
          .catch(() => { /* non-fatal — coordinates are enough */ });
      }

      haptic([10, 40, 80]);
      toast.success("Location captured", {
        description: `±${Math.round(accuracy)}m accuracy${!geoRadius ? " · radius set to 500m" : ""}`,
      });
    } catch (err) {
      haptic([50, 20, 50]);
      if (err instanceof GeolocationPositionError) {
        toast.error(
          err.code === 1
            ? "Location permission denied. Enable GPS in browser settings."
            : "Could not get your location. Make sure GPS is on.",
        );
      } else {
        toast.error("Could not get your location");
      }
    } finally {
      setDetecting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { toast.error("Location name is required"); return; }
    if (needsProject && !projectId) { toast.error("Select a project for project sites"); return; }

    setSaving(true);
    haptic(10);
    try {
      const res = await fetch("/api/stock-locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          name: name.trim(),
          projectId: needsProject ? projectId : null,
          targetCompanyId: canTargetCompany ? targetCompanyId : currentCompanyId,
          address: address.trim() || null,
          lat: lat ? parseFloat(lat) : null,
          lng: lng ? parseFloat(lng) : null,
          geoRadius: geoRadius ? parseInt(geoRadius) : null,
          ...(dupWarning ? { force: true } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409 && data.warning === "duplicate") {
          setDupWarning(data.message);
          setSaving(false);
          return;
        }
        throw new Error(data.error ?? "Failed to create location");
      }

      haptic([10, 40, 80]);
      setSuccess(data.name);
      toast.success(`${data.name} created`);
    } catch (err) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSaving(false);
    }
  }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <div
          className="grid place-items-center size-14 rounded-full mb-3"
          style={{ backgroundColor: "color-mix(in srgb, var(--color-go) 12%, transparent)" }}
        >
          <CheckCircle2 className="size-7" style={{ color: "var(--color-go)" }} />
        </div>
        <p className="text-m-section font-extrabold tracking-tight mb-1" style={{ color: "var(--color-ink-950)" }}>
          Location Created
        </p>
        <p className="text-m-body mb-4" style={{ color: "var(--color-ink-500)" }}>
          {success} is ready to receive stock.
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => router.push("/m/stock")}
            className="rounded-[0.5rem] px-4 py-2 text-m-body font-bold text-m-body press"
            style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
          >
            View Stock
          </button>
          <button
            onClick={() => {
              setSuccess(null);
              setName("");
              setAddress("");
            }}
            className="rounded-[0.5rem] px-4 py-2 text-m-body font-bold border text-m-body press"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
          >
            Add Another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {/* Type */}
        <SectionCard title="Type">
          <div className="grid grid-cols-2 gap-2">
            <TypeCard
              active={type === "COMPANY_WAREHOUSE"}
              onClick={() => { setType("COMPANY_WAREHOUSE"); haptic(10); setDupWarning(null); }}
              label="Warehouse"
            />
            <TypeCard
              active={type === "PROJECT_SITE"}
              onClick={() => { setType("PROJECT_SITE"); haptic(10); setDupWarning(null); }}
              label="Project Site"
            />
            <TypeCard
              active={type === "CENTRAL_WAREHOUSE"}
              onClick={() => { setType("CENTRAL_WAREHOUSE"); haptic(10); setDupWarning(null); setTargetCompanyId(currentCompanyId); }}
              label="Central WH"
            />
            <TypeCard
              active={type === "DEPARTMENT"}
              onClick={() => { setType("DEPARTMENT"); haptic(10); setDupWarning(null); }}
              label="Department"
            />
          </div>
          <p className="text-m-caption mt-1" style={{ color: "var(--color-ink-400)" }}>
            {type === "PROJECT_SITE" && "Stock stored at a specific project site. Requires a project."}
            {type === "COMPANY_WAREHOUSE" && "Company-level warehouse. No project needed."}
            {type === "CENTRAL_WAREHOUSE" && "Parent company warehouse for distributing to child companies. No project needed."}
            {type === "DEPARTMENT" && "Operational cost-center stock room (e.g. Workshop, Boiler house). No project needed."}
          </p>
        </SectionCard>

        {/* Target company — only if current company has children AND type allows targeting */}
        {hasChildren && canTargetCompany && (
          <SectionCard title="Company">
            <p className="text-m-caption mb-2" style={{ color: "var(--color-ink-400)" }}>
              Which company should this warehouse belong to?
            </p>
            <EnumSelect
              label="Belongs to"
              value={targetCompanyId}
              onChange={setTargetCompanyId}
              options={companies.map((c) => ({
                value: c.id,
                label: c.id === currentCompanyId ? `${c.name} (current)` : c.name,
              }))}
            />
          </SectionCard>
        )}

        {/* Details */}
        <SectionCard title="Details">
          <UnderlineInput
            label="Location Name"
            required
            value={name}
            onChange={setName}
            placeholder={type === "COMPANY_WAREHOUSE" ? "e.g. Central Warehouse Pune" : "e.g. Site B - Kharadi"}
            enterKeyHint="next"
          />

          {/* Project (only for PROJECT_SITE) */}
          {needsProject && (
            <MobileSelectWithCreate
              label="Project"
              required
              value={projectId}
              onChange={setProjectId}
              placeholder="Select project…"
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
              inputClass="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
              inputStyle={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
              renderDialog={({ open, onClose, onCreated, originRect }) => (
                <MobileFabModal open={open} onClose={onClose} originRect={originRect} title="New Project">
                  <MobileNewProjectDialog open={open} onClose={onClose} onCreated={(p) => onCreated(p.id, p.name)} />
                </MobileFabModal>
              )}
            />
          )}
        </SectionCard>

        {/* Address */}
        <SectionCard title="Address">
          <div className="flex flex-col gap-2">
            <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
              Address (optional)
            </label>
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Street, city, landmark…"
              rows={2}
              enterKeyHint="done"
              className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors resize-none"
              style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
            />
          </div>
        </SectionCard>

        {/* Geo-fence (GPS receipt validation + attendance clock-in) */}
        <SectionCard title="Geo-fence">
          <p className="text-m-caption" style={{ color: "var(--color-ink-400)" }}>
            Set coordinates and radius to validate GPS-tagged receipts and attendance clock-in. Employees within the radius are marked on-site.
          </p>

          {/* Auto-detect button */}
          <button
            type="button"
            onClick={handleDetectLocation}
            disabled={detecting}
            className="flex items-center justify-center gap-1.5 w-full rounded-[0.5rem] border-2 border-dashed py-2.5 text-m-caption font-bold press disabled:opacity-50"
            style={{ borderColor: "var(--color-signal)", color: "var(--color-signal-dark)" }}
          >
            {detecting ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Detecting…
              </>
            ) : (
              <>
                <Crosshair className="size-3.5" />
                Use my current location
              </>
            )}
          </button>

          {/* Captured location summary */}
          {lat && lng ? (
            <div
              className="flex items-start gap-2 rounded-[0.375rem] px-2.5 py-1.5 text-m-caption"
              style={{ backgroundColor: "color-mix(in srgb, var(--color-go) 8%, transparent)" }}
            >
              <MapPin className="size-3.5 shrink-0 mt-0.5" style={{ color: "var(--color-go)" }} />
              <div className="flex-1">
                <p className="font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                  {lat}, {lng}
                </p>
                {geoAccuracy != null && (
                  <p style={{ color: "var(--color-ink-500)" }}>±{geoAccuracy}m accuracy</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => { setLat(""); setLng(""); setGeoAccuracy(null); }}
                className="text-m-caption font-bold press shrink-0"
                style={{ color: "var(--color-ink-500)" }}
              >
                Clear
              </button>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <UnderlineInput
              label="Latitude"
              value={lat}
              onChange={setLat}
              type="number"
              step="any"
              placeholder="Latitude"
              enterKeyHint="next"
            />
            <UnderlineInput
              label="Longitude"
              value={lng}
              onChange={setLng}
              type="number"
              step="any"
              placeholder="Longitude"
              enterKeyHint="next"
            />
          </div>
          <UnderlineInput
            label="Radius"
            value={geoRadius}
            onChange={setGeoRadius}
            type="number"
            placeholder="metres (default 500)"
            enterKeyHint="done"
          />
        </SectionCard>
      </form>

      {/* Duplicate warning */}
      {dupWarning && (
        <div
          className="rounded-[0.5rem] border p-3 flex flex-col gap-2 mt-3"
          style={{
            borderColor: "color-mix(in srgb, var(--color-stop) 30%, var(--color-line))",
            backgroundColor: "color-mix(in srgb, var(--color-stop) 6%, var(--color-paper))",
          }}
        >
          <p className="text-m-caption font-bold" style={{ color: "var(--color-stop)" }}>
            ⚠ {dupWarning}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleSubmit({ preventDefault: () => {} } as unknown as React.FormEvent)}
              disabled={saving}
              className="flex-1 rounded-[0.375rem] py-1.5 text-m-caption font-bold press disabled:opacity-50"
              style={{ backgroundColor: "var(--color-stop)", color: "var(--color-paper)" }}
            >
              {saving ? "Creating…" : "Create anyway"}
            </button>
            <button
              type="button"
              onClick={() => setDupWarning(null)}
              className="rounded-[0.375rem] px-3 py-1.5 text-m-caption font-bold border press"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-700)" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Sticky bottom bar */}
      <StickyActionBar
        summaryLabel="Type"
        summaryValue={type === "COMPANY_WAREHOUSE" ? "Warehouse" : "Project Site"}
        submitLabel="Create Location"
        onSubmit={() => handleSubmit({ preventDefault: () => {} } as unknown as React.FormEvent)}
        submitting={saving}
      />
    </div>
  );
}
