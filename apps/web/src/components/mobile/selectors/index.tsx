"use client";

import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import { MobileNewProjectDialog } from "@/app/m/projects/MobileNewProjectDialog";
import { MobileNewSupplierDialog } from "@/app/m/suppliers/MobileNewSupplierDialog";
import { MobileNewMaterialDialog } from "@/app/m/materials/MobileNewMaterialDialog";
import { MobileNewCategoryDialog } from "@/app/m/materials/new/MobileNewCategoryDialog";
import { MobileNewCustomerDialog } from "@/app/m/sales/MobileNewCustomerDialog";
import { MobileNewSubcontractorDialog } from "@/app/m/work-orders/MobileNewSubcontractorDialog";
import { MobileNewStockLocationDialog } from "@/app/m/stock-locations/MobileNewStockLocationDialog";
import { MobileNewEmployeeDialog } from "@/app/m/hr/employees/MobileNewEmployeeDialog";

/**
 * Shared entity selectors with built-in "Create new" buttons.
 *
 * Each component wraps MobileSelectWithCreate + the appropriate New dialog,
 * so forms just use <MobileProjectSelect ... /> instead of wiring up
 * renderDialog boilerplate every time.
 *
 * All components forward the same props as MobileSelectWithCreate (value,
 * onChange, options, placeholder, required, etc.) plus entity-specific
 * extras (e.g. categories for Material).
 */

type BaseProps = Omit<
  React.ComponentProps<typeof MobileSelectWithCreate>,
  "renderDialog" | "label"
> & {
  label?: string;
};

/* ── Project ── */
export function MobileProjectSelect({ label = "Project", ...props }: BaseProps) {
  return (
    <MobileSelectWithCreate
      {...props}
      label={label}
      renderDialog={({ open, onClose, onCreated, originRect }) => (
        <MobileFabModal open={open} onClose={onClose} originRect={originRect} title="New Project" nested>
          <MobileNewProjectDialog
            open={open}
            onClose={onClose}
            onCreated={(p) => onCreated(p.id, p.name)}
          />
        </MobileFabModal>
      )}
    />
  );
}

/* ── Supplier ── */
export function MobileSupplierSelect({ label = "Supplier", ...props }: BaseProps) {
  return (
    <MobileSelectWithCreate
      {...props}
      label={label}
      renderDialog={({ open, onClose, onCreated }) => (
        <MobileNewSupplierDialog
          open={open}
          onClose={onClose}
          onCreated={(s) => onCreated(s.id, s.name)}
          nested
        />
      )}
    />
  );
}

/* ── Material ── */
export function MobileMaterialSelect(
  { label = "Material", ...props }: BaseProps & {
    categories: { id: string; name: string; unit: string; hsnCode?: string | null; gstRate?: number | string | null | { toNumber(): number } }[];
  },
) {
  return (
    <MobileSelectWithCreate
      {...props}
      label={label}
      renderDialog={({ open, onClose, onCreated }) => (
        <MobileNewMaterialDialog
          open={open}
          onClose={onClose}
          onCreated={(m) => onCreated(m.id, m.name)}
          categories={props.categories}
          nested
        />
      )}
    />
  );
}

/* ── Category ── */
export function MobileCategorySelect({ label = "Category", ...props }: BaseProps) {
  return (
    <MobileSelectWithCreate
      {...props}
      label={label}
      renderDialog={({ open, onClose, onCreated }) => (
        <MobileNewCategoryDialog
          open={open}
          onClose={onClose}
          onCreated={(c) => onCreated(c.id, c.name)}
          nested
        />
      )}
    />
  );
}

/* ── Customer ── */
export function MobileCustomerSelect({ label = "Customer", ...props }: BaseProps) {
  return (
    <MobileSelectWithCreate
      {...props}
      label={label}
      renderDialog={({ open, onClose, onCreated }) => (
        <MobileNewCustomerDialog
          open={open}
          onClose={onClose}
          onCreated={(c) => onCreated(c.id, c.name)}
          nested
        />
      )}
    />
  );
}

/* ── Subcontractor ── */
export function MobileSubcontractorSelect({ label = "Subcontractor", ...props }: BaseProps) {
  return (
    <MobileSelectWithCreate
      {...props}
      label={label}
      renderDialog={({ open, onClose, onCreated }) => (
        <MobileNewSubcontractorDialog
          open={open}
          onClose={onClose}
          onCreated={(s) => onCreated(s.id, s.name)}
          nested
        />
      )}
    />
  );
}

/* ── Stock Location ── */
export function MobileStockLocationSelect({ label = "Stock Location", ...props }: BaseProps) {
  return (
    <MobileSelectWithCreate
      {...props}
      label={label}
      renderDialog={({ open, onClose, onCreated }) => (
        <MobileNewStockLocationDialog
          open={open}
          onClose={onClose}
          onCreated={(l) => onCreated(l.id, l.name)}
          nested
        />
      )}
    />
  );
}

/* ── Employee ── */
export function MobileEmployeeSelect(
  { label = "Employee", ...props }: BaseProps & {
    projects: { id: string; name: string }[];
    stockLocations: { id: string; name: string; type: string }[];
  },
) {
  return (
    <MobileSelectWithCreate
      {...props}
      label={label}
      renderDialog={({ open, onClose, onCreated }) => (
        <MobileNewEmployeeDialog
          open={open}
          onClose={onClose}
          onCreated={(e) => onCreated(e.id, e.name)}
          projects={props.projects}
          stockLocations={props.stockLocations}
          departments={[]}
          nested
        />
      )}
    />
  );
}
