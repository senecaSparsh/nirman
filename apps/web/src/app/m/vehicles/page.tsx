"use client";

import { useEffect, useState } from "react";
import { Truck, Search, Camera, Phone, User, X, ChevronRight, Loader2 } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";

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
  const [trips, setTrips] = useState<any[] | null>(null);
  const [tripsLoading, setTripsLoading] = useState(false);

  useEffect(() => {
    loadVehicles();
  }, []);

  async function loadVehicles() {
    setLoading(true);
    try {
      const res = await fetch("/api/vehicles");
      if (res.ok) setVehicles(await res.json());
    } catch { /* best-effort */ }
    setLoading(false);
  }

  async function loadTrips(vehicleId: string) {
    setTripsLoading(true);
    setTrips([]);
    try {
      const res = await fetch(`/api/vehicles/${vehicleId}/trips`);
      if (res.ok) setTrips(await res.json());
    } catch { /* best-effort */ }
    setTripsLoading(false);
  }

  const filtered = query
    ? vehicles.filter((v) => v.vehicleNumber.toLowerCase().includes(query.toLowerCase()))
    : vehicles;

  return (
    <div className="min-h-screen pb-20" style={{ backgroundColor: "var(--color-paper)" }}>
      {/* Header */}
      <div className="sticky top-0 z-10 border-b px-4 py-3" style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }}>
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-base font-bold flex items-center gap-2" style={{ color: "var(--color-ink-950)" }}>
            <Truck className="size-4" style={{ color: "var(--color-steel)" }} />
            Vehicles
          </h1>
          <span className="text-[0.5625rem] font-semibold" style={{ color: "var(--color-steel)" }}>
            {vehicles.length} total
          </span>
        </div>
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5" style={{ color: "var(--color-ink-400)" }} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by vehicle number…"
            className="w-full h-9 rounded-[0.5rem] border pl-8 pr-3 text-[0.75rem] outline-none"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-950)" }}
          />
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-5 animate-spin" style={{ color: "var(--color-steel)" }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
          <Truck className="size-8 mb-3" style={{ color: "var(--color-ink-300)" }} />
          <p className="text-[0.75rem] font-semibold" style={{ color: "var(--color-ink-500)" }}>
            {query ? "No vehicles match your search" : "No vehicles yet"}
          </p>
          <p className="text-[0.5625rem] mt-1" style={{ color: "var(--color-ink-400)" }}>
            Vehicles are auto-created when you enter a vehicle number on any goods movement
          </p>
        </div>
      ) : (
        <div className="divide-y" style={{ borderColor: "var(--color-line)" }}>
          {filtered.map((v) => (
            <button
              key={v.id}
              onClick={() => { setSelected(v); loadTrips(v.id); }}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--color-paper-2)]"
            >
              {/* Vehicle photo or icon */}
              {v.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={v.photoUrl} alt={v.vehicleNumber} className="size-12 rounded-[0.375rem] object-cover shrink-0" />
              ) : (
                <div className="size-12 rounded-[0.375rem] flex items-center justify-center shrink-0" style={{ backgroundColor: "var(--color-paper-2)" }}>
                  <Truck className="size-5" style={{ color: "var(--color-ink-400)" }} />
                </div>
              )}
              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[0.75rem] font-bold font-mono truncate" style={{ color: "var(--color-ink-950)" }}>
                    {v.vehicleNumber}
                  </span>
                  <span className="text-[0.4375rem] font-semibold px-1.5 py-0.5 rounded-[0.25rem] shrink-0" style={{ backgroundColor: "var(--color-paper-2)", color: "var(--color-steel)" }}>
                    {TYPE_LABELS[v.vehicleType] ?? v.vehicleType}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  {v.driverName && (
                    <span className="text-[0.5625rem] flex items-center gap-0.5" style={{ color: "var(--color-ink-500)" }}>
                      <User className="size-2.5" /> {v.driverName}
                    </span>
                  )}
                  <span className="text-[0.5625rem]" style={{ color: "var(--color-steel)" }}>
                    {v.tripCount} trip{v.tripCount !== 1 ? "s" : ""}
                  </span>
                  {v.lastUsedAt && (
                    <span className="text-[0.5rem]" style={{ color: "var(--color-ink-400)" }}>
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
                <p className="text-[0.75rem] font-bold font-mono" style={{ color: "var(--color-ink-950)" }}>{selected.vehicleNumber}</p>
                <p className="text-[0.5625rem]" style={{ color: "var(--color-steel)" }}>{TYPE_LABELS[selected.vehicleType] ?? selected.vehicleType} · {selected.tripCount} trips</p>
              </div>
              <button onClick={() => setSelected(null)} className="press p-1"><X className="size-4" style={{ color: "var(--color-ink-500)" }} /></button>
            </div>

            {/* Photo */}
            {selected.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selected.photoUrl} alt={selected.vehicleNumber} className="w-full h-40 object-cover" />
            ) : (
              <div className="w-full h-32 flex items-center justify-center" style={{ backgroundColor: "var(--color-paper-2)" }}>
                <Truck className="size-10" style={{ color: "var(--color-ink-300)" }} />
              </div>
            )}

            {/* Driver info */}
            <div className="p-3 space-y-2">
              <p className="text-[0.5625rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-steel)" }}>Driver / Carrier</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[0.4375rem]" style={{ color: "var(--color-ink-400)" }}>Name</p>
                  <p className="text-[0.6875rem] font-medium" style={{ color: "var(--color-ink-950)" }}>{selected.driverName ?? "—"}</p>
                </div>
                <div>
                  <p className="text-[0.4375rem]" style={{ color: "var(--color-ink-400)" }}>Phone</p>
                  <p className="text-[0.6875rem] font-medium font-mono" style={{ color: "var(--color-ink-950)" }}>{selected.driverPhone ?? "—"}</p>
                </div>
              </div>
              {selected.transporterName && (
                <div>
                  <p className="text-[0.4375rem]" style={{ color: "var(--color-ink-400)" }}>Transporter</p>
                  <p className="text-[0.6875rem] font-medium" style={{ color: "var(--color-ink-950)" }}>{selected.transporterName}</p>
                </div>
              )}
            </div>

            {/* Trip history */}
            <div className="p-3 border-t" style={{ borderColor: "var(--color-line)" }}>
              <p className="text-[0.5625rem] font-bold uppercase tracking-wide mb-2" style={{ color: "var(--color-steel)" }}>Trip History</p>
              {tripsLoading ? (
                <div className="flex justify-center py-4"><Loader2 className="size-4 animate-spin" style={{ color: "var(--color-steel)" }} /></div>
              ) : trips && trips.length > 0 ? (
                <div className="space-y-2">
                  {trips.map((t) => (
                    <div key={t.id} className="rounded-[0.375rem] border p-2" style={{ borderColor: "var(--color-line)" }}>
                      <div className="flex items-center justify-between">
                        <span className="text-[0.5625rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
                          {t.movementType.replace(/_/g, " ")}
                        </span>
                        <span className="text-[0.4375rem]" style={{ color: "var(--color-ink-400)" }}>
                          {formatRelativeTime(new Date(t.timestamp))}
                        </span>
                      </div>
                      {t.driverName && (
                        <p className="text-[0.5rem] mt-0.5" style={{ color: "var(--color-ink-500)" }}>Driver: {t.driverName}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[0.5625rem] text-center py-4" style={{ color: "var(--color-ink-400)" }}>No trips recorded</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
