"use client";

import { useState } from "react";
import { Beaker, Plus } from "lucide-react";
import { MobileEmptyState } from "@/components/mobile/v2/primitives";
import { MobileNewMaterialDialog } from "@/app/m/materials/MobileNewMaterialDialog";

/**
 * Client-side empty state for the standard-consumptions page.
 * Opens an inline material creation dialog instead of redirecting.
 */
export function MobileStandardConsumptionsEmptyState({
  hasMaterials,
  canManage,
  categories,
  onCreated,
}: {
  hasMaterials: boolean;
  canManage: boolean;
  categories: { id: string; name: string; unit: string }[];
  onCreated?: () => void;
}) {
  const [showMaterial, setShowMaterial] = useState(false);

  return (
    <>
      <MobileEmptyState
        icon={Beaker}
        title="No standard consumptions"
        hint={canManage
          ? hasMaterials
            ? "Tap + to define how much material a work type should consume"
            : "Add materials first, then define standard consumption benchmarks"
          : "Standard consumption benchmarks will appear here"}
        action={
          canManage && !hasMaterials ? (
            <button
              onClick={() => setShowMaterial(true)}
              className="inline-flex items-center gap-1.5 rounded-[0.5rem] px-3 py-2 text-[0.6875rem] font-bold press"
              style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
            >
              <Plus className="size-3.5" /> Add Material
            </button>
          ) : undefined
        }
      />

      {showMaterial ? (
        <MobileNewMaterialDialog
          open
          onClose={() => setShowMaterial(false)}
          categories={categories}
          onCreated={() => {
            setShowMaterial(false);
            onCreated?.();
          }}
        />
      ) : null}
    </>
  );
}
