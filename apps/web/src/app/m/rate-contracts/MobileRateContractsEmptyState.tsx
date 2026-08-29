"use client";

import { useState } from "react";
import { FileText, Plus } from "lucide-react";
import { MobileEmptyState, MobileCta } from "@/components/mobile/v2/primitives";
import { MobileNewSupplierDialog } from "@/app/m/suppliers/MobileNewSupplierDialog";
import { MobileNewMaterialDialog } from "@/app/m/materials/MobileNewMaterialDialog";

/**
 * Client-side empty state for the rate-contracts page.
 * Opens inline create dialogs instead of redirecting to separate pages.
 */
export function MobileRateContractsEmptyState({
  hasSuppliers,
  hasMaterials,
  canManage,
  categories,
  onCreated,
}: {
  hasSuppliers: boolean;
  hasMaterials: boolean;
  canManage: boolean;
  categories: { id: string; name: string; unit: string }[];
  onCreated?: () => void;
}) {
  const [showSupplier, setShowSupplier] = useState(false);
  const [showMaterial, setShowMaterial] = useState(false);

  const hint = canManage
    ? !hasSuppliers
      ? "Add suppliers first, then create rate contracts for materials"
      : !hasMaterials
        ? "Add materials first, then create rate contracts with suppliers"
        : "Tap + to create a rate contract with a supplier"
    : "Rate contracts will appear here";

  return (
    <>
      <MobileEmptyState
        icon={FileText}
        title="No rate contracts"
        hint={hint}
        action={
          canManage ? (
            !hasSuppliers ? (
              <button
                onClick={() => setShowSupplier(true)}
                className="inline-flex items-center gap-1.5 rounded-[0.5rem] px-3 py-2 text-m-body font-bold text-m-body press"
                style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
              >
                <Plus className="size-3.5" /> Add Supplier
              </button>
            ) : !hasMaterials ? (
              <button
                onClick={() => setShowMaterial(true)}
                className="inline-flex items-center gap-1.5 rounded-[0.5rem] px-3 py-2 text-m-body font-bold text-m-body press"
                style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
              >
                <Plus className="size-3.5" /> Add Material
              </button>
            ) : undefined
          ) : undefined
        }
      />

      {showSupplier ? (
        <MobileNewSupplierDialog
          open
          onClose={() => setShowSupplier(false)}
          onCreated={() => {
            setShowSupplier(false);
            onCreated?.();
          }}
        />
      ) : null}

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
