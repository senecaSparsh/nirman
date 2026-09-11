"use client";

import { useEffect, useState } from "react";
import { Loader2, ShoppingCart, UserPlus } from "lucide-react";
import { MobileNewSaleForm } from "@/components/mobile/mobile-new-sale-form";
import { MobileEmptyState } from "@/components/mobile/v2/primitives";
import { MobileCreateCustomerButton } from "@/components/mobile/mobile-customer-form";

interface UnitOpt {
  id: string;
  label: string;
  projectId: string;
  projectReraNumber: string | null;
  askingPrice: number | null;
  area: number;
  areaUnit: string;
}
interface ParcelOpt {
  id: string;
  label: string;
  projectId: string | null;
  projectReraNumber: string | null;
  askingPrice: number | null;
  area: number;
  areaUnit: string;
}
interface CustomerOpt {
  id: string;
  name: string;
  phone: string | null;
}
interface ProjectOpt {
  id: string;
  name: string;
}
interface BrokerOpt {
  id: string;
  name: string;
  phone: string;
  agency: string;
  defaultCommissionPercent: number | null;
}

interface SaleOptions {
  units: UnitOpt[];
  parcels: ParcelOpt[];
  customers: CustomerOpt[];
  projects: ProjectOpt[];
  sellableProjects: ProjectOpt[];
  brokers: BrokerOpt[];
  existingPhones: string[];
}

/**
 * Client-side new-sale form for the FAB + modal pattern.
 * Fetches all reference data (units, parcels, customers, projects, brokers)
 * from /api/sales/new-options on mount, then renders MobileNewSaleForm.
 *
 * Supports initial params for pre-seeding from query string:
 *  - builtUnitId / landParcelId / customerId (linked from detail pages)
 *  - projectId (linked from project detail page)
 */
export default function MobileNewSaleClient({
  initialBuiltUnitId,
  initialLandParcelId,
  initialCustomerId,
  initialProjectId,
}: {
  initialBuiltUnitId?: string;
  initialLandParcelId?: string;
  initialCustomerId?: string;
  initialProjectId?: string;
  onClose?: () => void;
  onCreated?: () => void;
} = {}) {
  const [options, setOptions] = useState<SaleOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadOptions() {
    try {
      const res = await fetch("/api/sales/new-options");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to load sale options");
      }
      const data: SaleOptions = await res.json();
      setOptions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOptions();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-5 animate-spin" style={{ color: "var(--color-ink-400)" }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <p className="text-m-body font-semibold mb-2" style={{ color: "var(--color-stop)" }}>
          {error}
        </p>
        <button
          onClick={() => { setLoading(true); setError(null); loadOptions(); }}
          className="text-m-caption font-bold press"
          style={{ color: "var(--color-steel)" }}
        >
          Try again
        </button>
      </div>
    );
  }

  if (!options) return null;

  // No customers — show inline customer creation, then reload options
  if (options.customers.length === 0) {
    return (
      <MobileEmptyState
        icon={UserPlus}
        title="No customers yet"
        hint="Sales require a customer. Create one now to get started."
        action={
          <MobileCreateCustomerButton
            existingPhones={options.existingPhones}
            onCreated={() => {
              // Re-fetch options so the form appears with the new customer
              setLoading(true);
              loadOptions();
            }}
          />
        }
      />
    );
  }

  return (
    <div className="pb-2">
      <div className="flex items-center justify-end mb-3">
        <span
          className="flex items-center gap-0.5 text-m-caption font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0"
          style={{ color: "var(--color-steel)", backgroundColor: "color-mix(in srgb, var(--color-steel) 12%, transparent)" }}
        >
          <ShoppingCart className="size-2.5" />
          Booking
        </span>
      </div>
      <MobileNewSaleForm
        units={options.units}
        parcels={options.parcels}
        customers={options.customers}
        projects={options.projects}
        sellableProjects={options.sellableProjects}
        brokers={options.brokers}
        initialBuiltUnitId={initialBuiltUnitId}
        initialLandParcelId={initialLandParcelId}
        initialCustomerId={initialCustomerId}
        initialProjectId={initialProjectId}
        existingPhones={options.existingPhones}
      />
    </div>
  );
}
