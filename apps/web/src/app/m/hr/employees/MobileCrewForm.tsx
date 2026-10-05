"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, Check } from "lucide-react";
import {
  SectionCard,
  UnderlineInput,
  EnumSelect,
  StickyActionBar,
} from "@/components/mobile/v2/form-primitives";
import { haptic } from "@/lib/haptic";

export type CrewEmployeeOption = { id: string; name: string; trade: string | null };
export type CrewFormProject = { id: string; name: string };

export type CrewFormInitial = {
  id: string;
  name: string;
  projectId: string | null;
  supervisorId: string | null;
  memberIds: string[];
  active: boolean;
};

/**
 * MobileCrewForm — create/edit a labour crew (gang). Crews are the unit
 * DPR labour lines and crew attendance operate on, so a supervisor needs
 * to form/rebalance gangs from the field, not just on desktop.
 */
export function MobileCrewForm({
  crew,
  projects,
  employees,
  onClose,
}: {
  crew?: CrewFormInitial | null;
  projects: CrewFormProject[];
  employees: CrewEmployeeOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(crew?.name ?? "");
  const [projectId, setProjectId] = useState(crew?.projectId ?? "");
  const [supervisorId, setSupervisorId] = useState(crew?.supervisorId ?? "");
  const [memberIds, setMemberIds] = useState<string[]>(crew?.memberIds ?? []);
  const [active, setActive] = useState(crew?.active ?? true);
  const [memberQuery, setMemberQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const filteredEmployees = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    const sorted = [...employees].sort((a, b) => {
      const aSel = memberIds.includes(a.id) ? 0 : 1;
      const bSel = memberIds.includes(b.id) ? 0 : 1;
      return aSel - bSel || a.name.localeCompare(b.name);
    });
    if (!q) return sorted;
    return sorted.filter(
      (e) => e.name.toLowerCase().includes(q) || (e.trade?.toLowerCase().includes(q) ?? false),
    );
  }, [employees, memberQuery, memberIds]);

  function toggleMember(id: string) {
    haptic(10);
    setMemberIds((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));
  }

  async function submit() {
    if (!name.trim()) {
      toast.error("Crew name is required");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        projectId: projectId || null,
        supervisorId: supervisorId || null,
        memberIds,
        ...(crew ? { active } : {}),
      };
      const res = await fetch(crew ? `/api/crews/${crew.id}` : "/api/crews", {
        method: crew ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to save crew");
      haptic(20);
      toast.success(crew ? "Crew updated" : `Crew "${name.trim()}" created`);
      router.refresh();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save crew");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <SectionCard title="Crew details">
        <UnderlineInput
          label="Crew name"
          required
          value={name}
          onChange={setName}
          placeholder="e.g. Masonry Gang A"
        />
        <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
          <EnumSelect
            label="Project"
            value={projectId}
            onChange={setProjectId}
            options={projects.map((p) => ({ value: p.id, label: p.name }))}
            placeholder="No project"
          />
          <EnumSelect
            label="Supervisor"
            value={supervisorId}
            onChange={setSupervisorId}
            options={employees.map((e) => ({ value: e.id, label: e.name }))}
            placeholder="None"
          />
        </div>
        {crew ? (
          <EnumSelect
            label="Status"
            value={active ? "active" : "inactive"}
            onChange={(v) => setActive(v === "active")}
            options={[
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ]}
          />
        ) : null}
      </SectionCard>

      <SectionCard title={`Members (${memberIds.length})`}>
        {employees.length > 7 ? (
          <div className="relative">
            <Search
              className="absolute left-1 top-1/2 -translate-y-1/2 size-3.5"
              style={{ color: "var(--color-ink-500)" }}
            />
            <input
              type="search"
              value={memberQuery}
              onChange={(e) => setMemberQuery(e.target.value)}
              placeholder="Search workers…"
              className="w-full h-7 pl-7 pr-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
              style={{ borderColor: "var(--color-line)", backgroundColor: "transparent" }}
            />
          </div>
        ) : null}
        <div className="flex flex-col max-h-56 overflow-y-auto -mx-1">
          {filteredEmployees.length === 0 ? (
            <p className="text-m-caption py-3 text-center" style={{ color: "var(--color-ink-400)" }}>
              {employees.length === 0 ? "No employees to add yet" : "No matching workers"}
            </p>
          ) : (
            filteredEmployees.map((e) => {
              const selected = memberIds.includes(e.id);
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => toggleMember(e.id)}
                  className="flex items-center gap-2 px-1 py-1.5 text-left press"
                >
                  <span
                    className="size-4 rounded-[0.25rem] border flex items-center justify-center shrink-0"
                    style={{
                      borderColor: selected ? "var(--color-go)" : "var(--color-line)",
                      backgroundColor: selected ? "var(--color-go)" : "transparent",
                    }}
                  >
                    {selected ? <Check className="size-3" style={{ color: "var(--color-paper)" }} /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-m-caption font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
                      {e.name}
                    </span>
                    {e.trade ? (
                      <span className="block text-micro truncate" style={{ color: "var(--color-ink-500)" }}>
                        {e.trade}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </SectionCard>

      <StickyActionBar
        summaryLabel="Members selected"
        summaryValue={String(memberIds.length)}
        submitLabel={crew ? "Save crew" : "Create crew"}
        onSubmit={submit}
        submitting={submitting}
      />
    </div>
  );
}
