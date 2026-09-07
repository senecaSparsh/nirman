"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { useLongPressNav } from "@/lib/use-long-press-nav";
import { SectionCard, SelectorModal, UnderlineInput } from "@/components/mobile/v2/form-primitives";

type Project = { id: string; name: string };
type Employee = { id: string; name: string };

export function MobileNewPettyCashClient({
  projects,
  employees,
  onCreated,
}: {
  projects: Project[];
  employees: Employee[];
  onClose?: () => void;
  onCreated?: () => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [floatAmount, setFloatAmount] = useState("");
  const [projectId, setProjectId] = useState("");
  const [custodianId, setCustodianId] = useState("");
  const [modal, setModal] = useState<"project" | "custodian" | null>(null);
  const submitLongPress = useLongPressNav("/m/petty-cash", "Petty cash");

  const selectedProject = projects.find((p) => p.id === projectId);
  const selectedCustodian = employees.find((e) => e.id === custodianId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Float name is required");
      return;
    }
    if (!floatAmount || Number(floatAmount) < 0) {
      toast.error("Float amount must be 0 or greater");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/petty-cash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          floatAmount: Number(floatAmount),
          projectId: projectId || undefined,
          custodianId: custodianId || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to create float");
      toast.success("Petty cash float created");
      if (onCreated) {
        onCreated();
      } else {
        router.push("/m/petty-cash");
        router.refresh();
      }
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

  return (
    <div className="pb-32">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {/* ══════ SECTION: FLOAT DETAILS ══════ */}
        <SectionCard title="Float Details">
          <UnderlineInput
            label="Float Name"
            required
            value={name}
            onChange={setName}
            placeholder="e.g. Site cash — Tower A"
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
            ...projects.map((p) => ({ id: p.id, label: p.name })),
          ]}
          selectedId={projectId}
          onSelect={handleSelect}
          onClose={() => setModal(null)}
        />
      ) : null}

      {modal === "custodian" ? (
        <SelectorModal
          title="Select Custodian"
          items={[
            { id: "", label: "No custodian", sub: undefined as string | undefined },
            ...employees.map((e) => ({ id: e.id, label: e.name })),
          ]}
          selectedId={custodianId}
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
