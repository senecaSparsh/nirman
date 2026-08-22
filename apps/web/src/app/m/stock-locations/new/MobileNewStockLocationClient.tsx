"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2, CheckCircle2, Plus, Warehouse, MapPin,
} from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";
import { MobileNewProjectDialog } from "@/app/m/projects/MobileNewProjectDialog";

interface ProjectItem { id: string; name: string; }

type LocationType = "COMPANY_WAREHOUSE" | "PROJECT_SITE";

export default function MobileNewStockLocationClient({
  projects,
}: {
  projects: ProjectItem[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const [type, setType] = useState<LocationType>("COMPANY_WAREHOUSE");
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState("");
  const [address, setAddress] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { toast.error("Location name is required"); return; }
    if (type === "PROJECT_SITE" && !projectId) { toast.error("Select a project for project sites"); return; }

    setSaving(true);
    haptic(10);
    try {
      const res = await fetch("/api/stock-locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          name: name.trim(),
          projectId: type === "PROJECT_SITE" ? projectId : null,
          address: address.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create location");

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
        <p className="text-[0.875rem] font-bold mb-1" style={{ color: "var(--color-ink-950)" }}>
          Location Created
        </p>
        <p className="text-[0.6875rem] mb-4" style={{ color: "var(--color-ink-500)" }}>
          {success} is ready to receive stock.
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => router.push("/m/stock")}
            className="rounded-[0.5rem] px-4 py-2 text-[0.6875rem] font-bold press"
            style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}
          >
            View Stock
          </button>
          <button
            onClick={() => {
              setSuccess(null);
              setName("");
              setAddress("");
            }}
            className="rounded-[0.5rem] px-4 py-2 text-[0.6875rem] font-bold border press"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
          >
            Add Another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-32">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {/* Type selector */}
        <div
          className="rounded-[0.625rem] border p-3"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <label className="text-[0.5625rem] font-semibold block mb-2" style={{ color: "var(--color-ink-500)" }}>
            Location Type <span style={{ color: "var(--color-stop)" }}>*</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => { setType("COMPANY_WAREHOUSE"); haptic(10); }}
              className="flex flex-col items-center gap-1.5 rounded-[0.5rem] border p-3 press"
              style={{
                borderColor: type === "COMPANY_WAREHOUSE" ? "var(--color-ink-950)" : "var(--color-line)",
                backgroundColor: type === "COMPANY_WAREHOUSE" ? "var(--color-concrete)" : "var(--color-paper)",
              }}
            >
              <Warehouse
                className="size-5"
                style={{ color: type === "COMPANY_WAREHOUSE" ? "var(--color-ink-950)" : "var(--color-ink-400)" }}
              />
              <span
                className="text-[0.5625rem] font-bold"
                style={{ color: type === "COMPANY_WAREHOUSE" ? "var(--color-ink-950)" : "var(--color-ink-500)" }}
              >
                Warehouse
              </span>
            </button>
            <button
              type="button"
              onClick={() => { setType("PROJECT_SITE"); haptic(10); }}
              className="flex flex-col items-center gap-1.5 rounded-[0.5rem] border p-3 press"
              style={{
                borderColor: type === "PROJECT_SITE" ? "var(--color-ink-950)" : "var(--color-line)",
                backgroundColor: type === "PROJECT_SITE" ? "var(--color-concrete)" : "var(--color-paper)",
              }}
            >
              <MapPin
                className="size-5"
                style={{ color: type === "PROJECT_SITE" ? "var(--color-ink-950)" : "var(--color-ink-400)" }}
              />
              <span
                className="text-[0.5625rem] font-bold"
                style={{ color: type === "PROJECT_SITE" ? "var(--color-ink-950)" : "var(--color-ink-500)" }}
              >
                Project Site
              </span>
            </button>
          </div>
        </div>

        {/* Name */}
        <div
          className="rounded-[0.625rem] border p-3"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <label className="text-[0.5625rem] font-semibold block mb-1" style={{ color: "var(--color-ink-500)" }}>
            Location Name <span style={{ color: "var(--color-stop)" }}>*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={type === "COMPANY_WAREHOUSE" ? "e.g. Central Warehouse Pune" : "e.g. Site B - Kharadi"}
            enterKeyHint="next"
            className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem] outline-none"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
          />
        </div>

        {/* Project (only for PROJECT_SITE) */}
        {type === "PROJECT_SITE" && (
          <div
            className="rounded-[0.625rem] border p-3"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          >
            <MobileSelectWithCreate
              label="Project"
              required
              value={projectId}
              onChange={setProjectId}
              placeholder="Select project…"
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
              inputClass="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem] outline-none"
              inputStyle={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
              renderDialog={({ open, onClose, onCreated }) => (
                <MobileNewProjectDialog open={open} onClose={onClose} onCreated={(p) => onCreated(p.id, p.name)} />
              )}
            />
          </div>
        )}

        {/* Address */}
        <div
          className="rounded-[0.625rem] border p-3"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <label className="text-[0.5625rem] font-semibold block mb-1" style={{ color: "var(--color-ink-500)" }}>
            Address (optional)
          </label>
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Street, city, landmark…"
            rows={2}
            enterKeyHint="done"
            className="w-full rounded-[0.375rem] border px-2.5 py-2 text-[0.75rem] outline-none resize-none"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
          />
        </div>
      </form>

      {/* Sticky bottom bar */}
      <div
        className="fixed left-0 right-0 z-30 border-t backdrop-blur-sm"
        style={{
          bottom: "calc(3.5rem + max(env(safe-area-inset-bottom), 0px))",
          backgroundColor: "color-mix(in srgb, var(--color-paper) 97%, transparent)",
          borderColor: "var(--color-line)",
        }}
      >
        <div className="max-w-md mx-auto px-3.5 py-2">
          <button
            type="button"
            onClick={(e) => handleSubmit(e as unknown as React.FormEvent)}
            disabled={saving}
            className="flex w-full items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-[0.75rem] font-bold press disabled:opacity-50"
            style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                <Plus className="size-3.5" />
                Create Location
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
