"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  UsersRound,
  ChevronDown,
  Pencil,
  Trash2,
  User,
} from "lucide-react";
import {
  MobileEmptyState,
} from "@/components/mobile/v2/primitives";
import { MobileSearchHeader, MobileNoResults, MobileFab } from "@/components/mobile/v2/scaffold";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import { useFabModal } from "@/lib/use-fab-modal";
import { useConfirm } from "@/lib/use-confirm";
import { haptic } from "@/lib/haptic";
import { MobileCrewForm, type CrewEmployeeOption, type CrewFormProject, type CrewFormInitial } from "./MobileCrewForm";

export type CrewListMember = {
  id: string;
  name: string;
  trade: string | null;
  dailyRate: string | null;
  active: boolean;
};

export type CrewListItem = {
  id: string;
  name: string;
  projectId: string | null;
  projectName: string | null;
  supervisorId: string | null;
  supervisorName: string | null;
  active: boolean;
  members: CrewListMember[];
};

/**
 * MobileCrewsView — crew (labour gang) list inside /m/hr/employees?tab=crews.
 * Managers can create, edit, and delete crews; viewers get a read-only
 * expandable roster. Members without wages hidden for non-payroll viewers
 * (server already nulls them).
 */
export function MobileCrewsView({
  crews,
  employees,
  projects,
  canManage,
  canSeePayroll,
}: {
  crews: CrewListItem[];
  employees: CrewEmployeeOption[];
  projects: CrewFormProject[];
  canManage: boolean;
  canSeePayroll: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<CrewListItem | null>(null);
  const [confirm, confirmDialog] = useConfirm();
  const fab = useFabModal();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return crews;
    return crews.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.projectName?.toLowerCase().includes(q) ?? false) ||
        (c.supervisorName?.toLowerCase().includes(q) ?? false) ||
        c.members.some((m) => m.name.toLowerCase().includes(q)),
    );
  }, [crews, query]);

  function toInitial(c: CrewListItem): CrewFormInitial {
    return {
      id: c.id,
      name: c.name,
      projectId: c.projectId,
      supervisorId: c.supervisorId,
      memberIds: c.members.map((m) => m.id),
      active: c.active,
    };
  }

  async function deleteCrew(c: CrewListItem) {
    // The service refuses to delete a crew that still has members —
    // surface that up front instead of letting the API error do it.
    if (c.members.length > 0) {
      toast.error(`Remove the ${c.members.length} member${c.members.length === 1 ? "" : "s"} first, then delete the crew`);
      return;
    }
    if (
      !(await confirm({
        title: `Delete ${c.name}?`,
        description: "This crew will be removed. Members aren't affected because it's empty.",
        confirmLabel: "Delete crew",
      }))
    )
      return;
    try {
      const res = await fetch(`/api/crews/${c.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      haptic(20);
      toast.success(`Crew "${c.name}" deleted`);
      setEditing(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <div>
      <MobileSearchHeader
        query={query}
        onQueryChange={setQuery}
        placeholder="Search crews, members…"
        showClear={!!query}
        onClear={() => setQuery("")}
      />

      {filtered.length === 0 ? (
        crews.length === 0 ? (
          <MobileEmptyState
            icon={UsersRound}
            title="No crews yet"
            hint={canManage ? "Tap + to form your first labour gang" : "Crews will appear here once created"}
          />
        ) : (
          <MobileNoResults title="No matching crews" hint="Try a different search" />
        )
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((c) => {
            const expanded = expandedId === c.id;
            return (
              <div
                key={c.id}
                className="rounded-[0.625rem] border overflow-hidden"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
              >
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={() => {
                      haptic(10);
                      setExpandedId(expanded ? null : c.id);
                    }}
                    className="min-w-0 flex-1 flex items-center gap-2.5 p-3 text-left press"
                  >
                    <span
                      className="size-9 rounded-full flex items-center justify-center shrink-0"
                      style={{ backgroundColor: "color-mix(in srgb, var(--color-steel) 12%, transparent)", color: "var(--color-steel)" }}
                    >
                      <UsersRound className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="text-m-body font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
                          {c.name}
                        </span>
                        {!c.active && (
                          <span
                            className="text-micro font-bold px-1.5 py-0.5 rounded-full shrink-0"
                            style={{ backgroundColor: "var(--color-concrete)", color: "var(--color-ink-500)" }}
                          >
                            Inactive
                          </span>
                        )}
                      </span>
                      <span className="block text-m-caption truncate" style={{ color: "var(--color-ink-500)" }}>
                        {[
                          `${c.members.length} member${c.members.length === 1 ? "" : "s"}`,
                          c.projectName,
                          c.supervisorName ? `Lead: ${c.supervisorName}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <ChevronDown
                      className={`size-4 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
                      style={{ color: "var(--color-ink-500)" }}
                    />
                  </button>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => {
                        haptic(10);
                        setEditing(c);
                      }}
                      className="shrink-0 p-3 press"
                      aria-label={`Edit ${c.name}`}
                    >
                      <Pencil className="size-3.5" style={{ color: "var(--color-ink-500)" }} />
                    </button>
                  )}
                </div>

                {expanded && (
                  <div className="px-3 pb-3 pt-0 flex flex-col gap-1.5 border-t" style={{ borderColor: "var(--color-line)" }}>
                    {c.members.length === 0 ? (
                      <p className="text-m-caption py-2" style={{ color: "var(--color-ink-400)" }}>
                        No members yet{canManage ? " — tap ✏️ to add workers" : ""}
                      </p>
                    ) : (
                      c.members.map((m) => (
                        <div key={m.id} className="flex items-center gap-2 pt-1.5">
                          <User className="size-3.5 shrink-0" style={{ color: "var(--color-ink-400)" }} />
                          <span className="min-w-0 flex-1 text-m-caption font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
                            {m.name}
                          </span>
                          <span className="text-micro truncate" style={{ color: "var(--color-ink-500)" }}>
                            {m.trade ?? ""}
                          </span>
                          {canSeePayroll && m.dailyRate ? (
                            <span className="text-micro font-bold tabular-nums" style={{ color: "var(--color-steel)" }}>
                              ₹{Number(m.dailyRate).toLocaleString("en-IN")}/day
                            </span>
                          ) : null}
                          {!m.active && (
                            <span className="text-micro font-bold" style={{ color: "var(--color-stop)" }}>
                              inactive
                            </span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {canManage && <MobileFab onClick={fab.toggle} isOpen={fab.isOpen} label="Add new crew" />}

      {/* New crew dialog */}
      <MobileFabModal open={fab.isOpen} onClose={fab.close} originRect={fab.originRect} title="New Crew">
        <MobileCrewForm projects={projects} employees={employees} onClose={fab.close} />
      </MobileFabModal>

      {/* Edit crew dialog */}
      <MobileFabModal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? `Edit ${editing.name}` : "Edit crew"}
      >
        {editing ? (
          <div className="flex flex-col gap-3">
            <MobileCrewForm
              crew={toInitial(editing)}
              projects={projects}
              employees={employees}
              onClose={() => setEditing(null)}
            />
            <button
              type="button"
              onClick={() => deleteCrew(editing)}
              className="flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2 text-m-caption font-bold press"
              style={{ color: "var(--color-stop)" }}
            >
              <Trash2 className="size-3.5" />
              Delete crew
            </button>
          </div>
        ) : null}
      </MobileFabModal>

      {confirmDialog}
    </div>
  );
}
