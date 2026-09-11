"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send, CheckCircle2, Plus, Eye } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { useLongPressNav } from "@/lib/use-long-press-nav";
import { useSmartDefaults } from "@/lib/use-smart-defaults";
import { SmartDefaultsBadge } from "@/components/mobile/v2/smart-defaults-badge";
import { SectionCard, SelectorModal, UnderlineInput } from "@/components/mobile/v2/form-primitives";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import { MobileNewProjectDialog } from "@/app/m/projects/MobileNewProjectDialog";
import { MobileNewEmployeeDialog } from "@/app/m/hr/employees/MobileNewEmployeeDialog";

type Project = { id: string; name: string };
type Employee = { id: string; name: string };

export function MobileNewPettyCashClient({
  projects,
  employees,
  currentUserId,
  onCreated,
}: {
  projects: Project[];
  employees: Employee[];
  currentUserId?: string | null;
  onClose?: () => void;
  onCreated?: () => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<{ id: string; name: string } | null>(null);
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [floatAmount, setFloatAmount] = useState("");
  const [projectId, setProjectId] = useState("");
  const [custodianId, setCustodianId] = useState("");
  const [modal, setModal] = useState<"project" | "custodian" | null>(null);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [showCreateEmployee, setShowCreateEmployee] = useState(false);
  const [extraProjects, setExtraProjects] = useState<Project[]>([]);
  const [extraEmployees, setExtraEmployees] = useState<Employee[]>([]);
  const submitLongPress = useLongPressNav("/m/petty-cash", "Petty cash");
  const { getDefault, recordDefaults } = useSmartDefaults("petty-cash");
  const [defaultsApplied, setDefaultsApplied] = useState(false);

  // ── Default custodian to current user + smart defaults for project ──
  useEffect(() => {
    if (defaultsApplied) return;
    const defProject = getDefault("projectId");
    if (defProject && projects.some((p) => p.id === defProject)) {
      setProjectId(defProject);
    }
    if (currentUserId && employees.some((e) => e.id === currentUserId)) {
      setCustodianId(currentUserId);
    }
    setDefaultsApplied(true);
  }, [defaultsApplied, getDefault, projects, employees, currentUserId]);

  const selectedProject = [...projects, ...extraProjects].filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i).find((p) => p.id === projectId);
  const selectedCustodian = employees.find((e) => e.id === custodianId);

  // ── Auto-generate float name from project/custodian when user hasn't typed one ──
  const effectiveName = nameTouched
    ? name
    : [selectedProject?.name, selectedCustodian?.name].filter(Boolean).join(" · ") || "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const finalName = (nameTouched ? name : effectiveName).trim();
    if (!finalName) {
      toast.error("Float name is required — select a project or custodian, or type a name");
      return;
    }
    if (!floatAmount || Number(floatAmount) < 0) {
      toast.error("Float amount must be 0 or greater");
      return;
    }
    setSaving(true);
    try {
      recordDefaults({ projectId });
      const res = await fetch("/api/petty-cash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: finalName,
          floatAmount: Number(floatAmount),
          projectId: projectId || undefined,
          custodianId: custodianId || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to create float");
      setSuccess({ id: data.id, name: finalName });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  const handleSelect = (id: string) => {
    if (modal === "project") setProjectId(id);
    else if (modal === "custodian") setCustodianId(id);
    setModal(null);
  };

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <div className="grid place-items-center size-14 rounded-full mb-3" style={{ backgroundColor: "color-mix(in srgb, var(--color-go) 12%, transparent)" }}>
          <CheckCircle2 className="size-7" style={{ color: "var(--color-go)" }} />
        </div>
        <p className="text-m-section font-extrabold tracking-tight mb-1" style={{ color: "var(--color-ink-950)" }}>Float Created</p>
        <p className="text-m-caption font-mono mb-4" style={{ color: "var(--color-ink-700)" }}>{success.name}</p>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button onClick={() => { if (onCreated) onCreated(); else { router.push("/m/petty-cash"); router.refresh(); } }} className="rounded-[0.5rem] px-4 py-2.5 text-m-body font-bold press active:scale-95" style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}>
            <Eye className="size-4 inline mr-1" /> View Petty Cash
          </button>
          <button onClick={() => { setSuccess(null); setName(""); setFloatAmount(""); setProjectId(""); setCustodianId(""); setExtraProjects([]); setExtraEmployees([]); router.refresh(); }} className="rounded-[0.5rem] px-4 py-2.5 text-m-body font-bold border-2 press active:scale-95" style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)", backgroundColor: "var(--color-paper)" }}>
            <Plus className="size-4 inline mr-1" /> Create Another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-32">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {/* ══════ SECTION: FLOAT DETAILS ══════ */}
        <SectionCard title="Float Details">
          <UnderlineInput
            label="Float Name"
            required
            value={nameTouched ? name : effectiveName}
            onChange={(v) => { setName(v); setNameTouched(true); }}
            placeholder={effectiveName || "e.g. Site cash — Tower A"}
            autoFocus
          />

          <UnderlineInput
            label="Float Amount (₹)"
            required
            type="number"
            inputMode="decimal"
            value={floatAmount}
            onChange={setFloatAmount}
            placeholder="0"
            mono
          />
        </SectionCard>

        {/* ══════ SECTION: LINKAGES (optional) ══════ */}
        <SectionCard title="Linkages (optional)">
          <SelectorCardInline
            label="Project"
            value={selectedProject?.name}
            onClick={() => setModal("project")}
          />
          {selectedProject && <SmartDefaultsBadge />}

          <SelectorCardInline
            label="Custodian"
            value={selectedCustodian?.name}
            onClick={() => setModal("custodian")}
          />
        </SectionCard>
      </form>

      {/* ══════ STICKY BOTTOM BAR ══════ */}
      <div
        className="sticky bottom-0 left-0 right-0 z-30 border-t"
        style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }}
      >
        <div className="px-3 py-2 flex items-center justify-between gap-2">
          <div className="shrink-0 flex flex-col gap-0.5">
            {floatAmount && Number(floatAmount) > 0 ? (
              <>
                <span className="text-m-body font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                  {formatCurrency(Number(floatAmount))}
                </span>
                <span className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                  Float amount
                </span>
              </>
            ) : (
              <span className="text-m-caption" style={{ color: "var(--color-ink-300)" }}>
                Enter amount
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={(e) => { if (submitLongPress.wasLongPress()) return; handleSubmit(e as unknown as React.FormEvent); }}
            disabled={saving}
            {...submitLongPress.longPressProps}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-m-body font-bold press disabled:opacity-50 select-none"
            style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)", touchAction: "none" }}
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                <Send className="size-3.5" />
                <span>Create Float</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ══════ SELECTOR MODALS ══════ */}
      {modal === "project" ? (
        <SelectorModal
          title="Select Project"
          items={[
            { id: "", label: "No project", sub: undefined as string | undefined },
            ...[...projects, ...extraProjects].filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i).map((p) => ({ id: p.id, label: p.name })),
          ]}
          selectedId={projectId}
          onSelect={handleSelect}
          onClose={() => setModal(null)}
          onCreate={() => setShowCreateProject(true)}
          createLabel="Create new project"
        />
      ) : null}

      {modal === "custodian" ? (
        <SelectorModal
          title="Select Custodian"
          items={[
            { id: "", label: "No custodian", sub: undefined as string | undefined },
            ...[...employees, ...extraEmployees].filter((e, i, arr) => arr.findIndex((x) => x.id === e.id) === i).map((e) => ({ id: e.id, label: e.name })),
          ]}
          selectedId={custodianId}
          onSelect={handleSelect}
          onClose={() => setModal(null)}
          onCreate={() => setShowCreateEmployee(true)}
          createLabel="Create new employee"
        />
      ) : null}

      {/* ══════ INLINE CREATE PROJECT DIALOG ══════ */}
      {showCreateProject ? (
        <MobileFabModal open onClose={() => setShowCreateProject(false)} title="New Project" nested>
          <MobileNewProjectDialog
            open
            onClose={() => setShowCreateProject(false)}
            onCreated={(p) => {
              setExtraProjects((prev) => prev.some((x) => x.id === p.id) ? prev : [...prev, { id: p.id, name: p.name }]);
              setProjectId(p.id);
              setShowCreateProject(false);
              setModal(null);
            }}
          />
        </MobileFabModal>
      ) : null}

      {/* ══════ INLINE CREATE EMPLOYEE DIALOG ══════ */}
      {showCreateEmployee ? (
        <MobileFabModal open onClose={() => setShowCreateEmployee(false)} title="New Employee" nested>
          <MobileNewEmployeeDialog
            open
            onClose={() => setShowCreateEmployee(false)}
            projects={[]}
            stockLocations={[]}
            departments={[]}
            nested
            onCreated={(e) => {
              setExtraEmployees((prev) => prev.some((x) => x.id === e.id) ? prev : [...prev, { id: e.id, name: e.name }]);
              setCustodianId(e.id);
              setShowCreateEmployee(false);
              setModal(null);
            }}
          />
        </MobileFabModal>
      ) : null}
    </div>
  );
}

/* Inline selector card — tappable underline-style selector */
function SelectorCardInline({
  onClick,
  label,
  value,
}: {
  onClick: () => void;
  label: string;
  value?: string;
}) {
  const hasValue = !!value;
  return (
    <div>
      <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
        {label}
      </label>
      <button
        type="button"
        onClick={onClick}
        className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors text-left press"
        style={{
          borderColor: "var(--color-line)",
          backgroundColor: "transparent",
          color: hasValue ? "var(--color-ink-950)" : "var(--color-ink-500)",
        }}
      >
        {hasValue ? (
          <span className="truncate block">{value}</span>
        ) : (
          <span>— Select —</span>
        )}
      </button>
    </div>
  );
}
