"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {Truck, Search, User, X, ChevronRight, Loader2, RefreshCw} from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";
import { MobileEmptyState } from "@/components/mobile/v2/primitives";
import { MobileNoResults } from "@/components/mobile/v2/scaffold";
import { usePermissions } from "@/lib/permissions";
import { PERM } from "@/lib/roles";
import { MobileVehiclesFab } from "./MobileVehiclesFab";

interface Vehicle {
  id: string;
  vehicleNumber: string;
  vehicleType: string;
  photoUrl?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
  transporterName?: string | null;
  tripCount: number;
  lastUsedAt?: string | null;
}

interface VehicleTrip {
  id: string;
  movementType: string;
  timestamp: string;
  driverName?: string | null;
  fromLocationName?: string | null;
  toLocationName?: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  TRUCK: "Truck", TEMPO: "Tempo", PICKUP: "Pickup", TRACTOR: "Tractor",
  MINI_TRUCK: "Mini Truck", AUTO: "Auto", CAR: "Car", BIKE: "Bike",
  CYCLE: "Cycle", HAND_CART: "Hand Cart", PORTER: "Porter", OTHER: "Other",
};

export default function MobileVehiclesPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Vehicle | null>(null);
  const [trips, setTrips] = useState<VehicleTrip[] | null>(null);
  const [tripsLoading, setTripsLoading] = useState(false);
  const { can } = usePermissions();
  const canManage = can(PERM.VEHICLE_MANAGE);

  async function loadVehicles() {
    setLoading(true);
    try {
      const res = await fetch("/api/vehicles");
      if (res.ok) setVehicles(await res.json());
    } catch (err) { console.warn("Failed to load vehicles:", err); }
    setLoading(false);
  }

  async function loadTrips(vehicleId: string) {
    setTripsLoading(true);
    setTrips([]);
    try {
      const res = await fetch(`/api/vehicles/${vehicleId}/trips`);
      if (res.ok) setTrips(await res.json());
    } catch (err) { console.warn("Failed to load vehicle trips:", err); }
    setTripsLoading(false);
  }

  useEffect(() => {
    loadVehicles();
  }, []);

  const filtered = query
    ? vehicles.filter((v) => v.vehicleNumber.toLowerCase().includes(query.toLowerCase()))
    : vehicles;

  return (
    <div className="min-h-screen pb-20" style={{ backgroundColor: "var(--color-paper)" }}>
      {/* Header */}
      <div className="sticky top-0 z-10 border-b px-4 py-3" style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }}>
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-m-section font-bold flex items-center gap-2" style={{ color: "var(--color-ink-950)" }}>
            <Truck className="size-4" style={{ color: "var(--color-steel)" }} />
            Vehicles
          </h1>
          <div className="flex items-center gap-2">
            <span className="text-m-caption font-semibold" style={{ color: "var(--color-steel)" }}>
              {vehicles.length} total
            </span>
            <button
              onClick={() => loadVehicles()}
              disabled={loading}
              className="p-1 press"
              aria-label="Refresh"
            >
              <RefreshCw className={loading ? "size-3.5 animate-spin" : "size-3.5"} style={{ color: "var(--color-steel)" }} />
            </button>
          </div>
        </div>
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5" style={{ color: "var(--color-ink-400)" }} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by vehicle number…"
            className="w-full h-7 pl-8 pr-3 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
            style={{ backgroundColor: "transparent" }}
          />
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-5 animate-spin" style={{ color: "var(--color-steel)" }} />
        </div>
      ) : filtered.length === 0 ? (
        query ? (
          <MobileNoResults title="No vehicles match your search" />
        ) : (
          <MobileEmptyState
            icon={Truck}
            title="No vehicles yet"
            hint={canManage
              ? "Tap + to register a vehicle, or enter a vehicle number on any goods movement to auto-create it."
              : "Vehicles are auto-created when you enter a vehicle number on any goods movement"}
          />
        )
      ) : (
        <div className="divide-y" style={{ borderColor: "var(--color-line)" }}>
          {filtered.map((v) => (
            <button
              key={v.id}
              onClick={() => { setSelected(v); loadTrips(v.id); }}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--color-paper-2)] press"
            >
              {/* Vehicle photo or icon */}
              {v.photoUrl ? (
                <div className="relative size-12 rounded-[0.375rem] overflow-hidden shrink-0">
                  <Image src={v.photoUrl} alt={v.vehicleNumber} fill className="object-cover" sizes="48px" />
                </div>
              ) : (
                <div className="size-12 rounded-[0.375rem] flex items-center justify-center shrink-0" style={{ backgroundColor: "var(--color-paper-2)" }}>
                  <Truck className="size-5" style={{ color: "var(--color-ink-400)" }} />
                </div>
              )}
              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-m-section font-bold font-mono truncate" style={{ color: "var(--color-ink-950)" }}>
                    {v.vehicleNumber}
                  </span>
                  <span className="text-m-caption font-semibold px-1.5 py-0.5 rounded-[0.25rem] shrink-0" style={{ backgroundColor: "var(--color-paper-2)", color: "var(--color-steel)" }}>
                    {TYPE_LABELS[v.vehicleType] ?? v.vehicleType}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  {v.driverName && (
                    <span className="text-m-caption flex items-center gap-0.5" style={{ color: "var(--color-ink-500)" }}>
                      <User className="size-2.5" /> {v.driverName}
                    </span>
                  )}
                  <span className="text-m-caption" style={{ color: "var(--color-steel)" }}>
                    {v.tripCount} trip{v.tripCount !== 1 ? "s" : ""}
                  </span>
                  {v.lastUsedAt && (
                    <span className="text-m-caption" style={{ color: "var(--color-ink-400)" }}>
                      {formatRelativeTime(new Date(v.lastUsedAt))}
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight className="size-4 shrink-0" style={{ color: "var(--color-ink-300)" }} />
            </button>
          ))}
        </div>
      )}

      {/* ── Vehicle detail drawer ── */}
      {selected ? (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 50%, transparent)" }} onClick={() => setSelected(null)}>
          <div className="mt-auto rounded-t-[0.75rem] max-h-[80vh] overflow-y-auto" style={{ backgroundColor: "var(--color-paper)" }} onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b sticky top-0" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
              <div>
                <p className="text-m-section font-bold font-mono" style={{ color: "var(--color-ink-950)" }}>{selected.vehicleNumber}</p>
                <p className="text-m-caption" style={{ color: "var(--color-steel)" }}>{TYPE_LABELS[selected.vehicleType] ?? selected.vehicleType} · {selected.tripCount} trips</p>
              </div>
              <button onClick={() => setSelected(null)} aria-label="Clear selected vehicle" className="text-m-body press p-1"><X className="size-4" style={{ color: "var(--color-ink-500)" }} /></button>
            </div>

            {/* Photo */}
            {selected.photoUrl ? (
              <div className="relative w-full h-40 overflow-hidden">
                <Image src={selected.photoUrl} alt={selected.vehicleNumber} fill className="object-cover" sizes="(max-width: 768px) 100vw, 400px" />
              </div>
            ) : (
              <div className="w-full h-32 flex items-center justify-center" style={{ backgroundColor: "var(--color-paper-2)" }}>
                <Truck className="size-10" style={{ color: "var(--color-ink-300)" }} />
              </div>
            )}

            {/* Driver info */}
            <div className="p-3 space-y-2">
              <p className="text-m-caption font-bold uppercase tracking-wide" style={{ color: "var(--color-steel)" }}>Driver / Carrier</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-m-caption" style={{ color: "var(--color-ink-400)" }}>Name</p>
                  <p className="text-m-body font-medium" style={{ color: "var(--color-ink-950)" }}>{selected.driverName ?? "—"}</p>
                </div>
                <div>
                  <p className="text-m-caption" style={{ color: "var(--color-ink-400)" }}>Phone</p>
                  <p className="text-m-body font-medium font-mono" style={{ color: "var(--color-ink-950)" }}>{selected.driverPhone ?? "—"}</p>
                </div>
              </div>
              {selected.transporterName && (
                <div>
                  <p className="text-m-caption" style={{ color: "var(--color-ink-400)" }}>Transporter</p>
                  <p className="text-m-body font-medium" style={{ color: "var(--color-ink-950)" }}>{selected.transporterName}</p>
                </div>
              )}
            </div>

            {/* Trip history */}
            <div className="p-3 border-t" style={{ borderColor: "var(--color-line)" }}>
              <p className="text-m-caption font-bold uppercase tracking-wide mb-2" style={{ color: "var(--color-steel)" }}>Trip History</p>
              {tripsLoading ? (
                <div className="flex justify-center py-4"><Loader2 className="size-4 animate-spin" style={{ color: "var(--color-steel)" }} /></div>
              ) : trips && trips.length > 0 ? (
                <div className="space-y-2">
                  {trips.map((t) => (
                    <div key={t.id} className="rounded-[0.375rem] border p-2" style={{ borderColor: "var(--color-line)" }}>
                      <div className="flex items-center justify-between">
                        <span className="text-m-caption font-bold" style={{ color: "var(--color-ink-950)" }}>
                          {t.movementType.replace(/_/g, " ")}
                        </span>
                        <span className="text-m-caption" style={{ color: "var(--color-ink-400)" }}>
                          {formatRelativeTime(new Date(t.timestamp))}
                        </span>
                      </div>
                      {t.driverName && (
                        <p className="text-m-caption mt-0.5" style={{ color: "var(--color-ink-500)" }}>Driver: {t.driverName}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-m-caption text-center py-4" style={{ color: "var(--color-ink-400)" }}>No trips recorded</p>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* ── FAB: New Vehicle ── */}
      {canManage ? <MobileVehiclesFab /> : null}
    </div>
  );
}
