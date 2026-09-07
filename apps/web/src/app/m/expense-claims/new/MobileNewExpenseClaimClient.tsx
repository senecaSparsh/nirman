"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { useLongPressNav } from "@/lib/use-long-press-nav";
import { SectionCard, SelectorModal } from "@/components/mobile/v2/form-primitives";

type Employee = { id: string; name: string };
type Project = { id: string; name: string };

export function MobileNewExpenseClaimClient({
  employees,
  projects,
}: {
  employees: Employee[];
  projects: Project[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [claimantId, setClaimantId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [description, setDescription] = useState("");
  const [modal, setModal] = useState<"claimant" | "project" | null>(null);
  const submitLongPress = useLongPressNav("/m/expense-claims", "Expense claims");

  const selectedClaimant = employees.find((e) => e.id === claimantId);
  const selectedProject = projects.find((p) => p.id === projectId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!claimantId) {
      toast.error("Claimant is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/expense-claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claimantId,
          projectId: projectId || undefined,
          description: description.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to create claim");
      toast.success("Expense claim created", {
        description: "Add line items from the claim detail page.",
      });
      router.push(`/m/expense-claims/${data.id}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  const handleSelect = (id: string) => {
    if (modal === "claimant") setClaimantId(id);
    else if (modal === "project") setProjectId(id);
    setModal(null);
  };

  return (
    <div className="pb-32">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {/* ══════ SECTION: CLAIMANT ══════ */}
        <SectionCard title="Claim Details">
          <SelectorCardInline
            label="Claimant"
            value={selectedClaimant?.name}
            required
            onClick={() => setModal("claimant")}
          />

          <SelectorCardInline
            label="Project (optional)"
            value={selectedProject?.name}
            onClick={() => setModal("project")}
          />

          <div>
            <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What is this claim for?"
              className="w-full px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors resize-none"
              style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
            />
          </div>
        </SectionCard>
      </form>

      {/* ══════ STICKY BOTTOM BAR ══════ */}
      <div
        className="sticky bottom-0 left-0 right-0 z-30 border-t"
        style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }}
      >
        <div className="px-3 py-2 flex items-center justify-end gap-2">
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
                <span>Create Claim</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ══════ SELECTOR MODALS ══════ */}
      {modal === "claimant" ? (
        <SelectorModal
          title="Select Claimant"
          items={employees.map((e) => ({ id: e.id, label: e.name }))}
          selectedId={claimantId}
          onSelect={handleSelect}
          onClose={() => setModal(null)}
        />
      ) : null}

      {modal === "project" ? (
        <SelectorModal
          title="Select Project"
          items={[
            { id: "", label: "No project", sub: undefined as string | undefined },
            ...projects.map((p) => ({ id: p.id, label: p.name })),
          ]}
          selectedId={projectId}
          onSelect={handleSelect}
          onClose={() => setModal(null)}
        />
      ) : null}
    </div>
  );
}

/* Inline selector card — tappable underline-style selector */
function SelectorCardInline({
  onClick,
  label,
  value,
  required,
}: {
  onClick: () => void;
  label: string;
  value?: string;
  required?: boolean;
}) {
  const hasValue = !!value;
  return (
    <div>
      <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
        {label}{required ? <span style={{ color: "var(--color-stop)" }}> *</span> : null}
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
