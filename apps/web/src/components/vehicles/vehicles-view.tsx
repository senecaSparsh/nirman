"use client";

import { useState, useMemo, useEffect } from "react";
import { Search, Truck, Phone, User, MapPin, X, ChevronRight, Camera } from "lucide-react";
import { Input } from "@/components/ui/input";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/empty-state";
import { Dialog } from "@/components/ui/dialog";
import { formatRelativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

export type VehicleRow = {
  id: string;
  vehicleNumber: string;
  vehicleType: string;
  photoUrl: string | null;
  driverName: string | null;
  driverPhone: string | null;
  transporterName: string | null;
  tripCount: number;
  lastUsedAt: string | null;
  lastLocationName: string | null;
};

export type VehicleTripRow = {
  id: string;
  movementType: string;
  refType: string;
  refId: string;
  driverName: string | null;
  driverPhone: string | null;
  transporterName: string | null;
  fromLocationName: string | null;
  toLocationName: string | null;
  timestamp: string;
};

const TYPE_LABELS: Record<string, string> = {
  TRUCK: "Truck", TEMPO: "Tempo", PICKUP: "Pickup", TRACTOR: "Tractor",
  MINI_TRUCK: "Mini Truck", AUTO: "Auto", CAR: "Car", BIKE: "Bike",
  CYCLE: "Cycle", HAND_CART: "Hand Cart", PORTER: "Porter", OTHER: "Other",
};

const TYPE_COLORS: Record<string, string> = {
  TRUCK: "bg-blue-10 text-blue",
  TEMPO: "bg-teal-10 text-teal",
  PICKUP: "bg-amber-10 text-amber",
  TRACTOR: "bg-green-10 text-green",
  MINI_TRUCK: "bg-purple-10 text-purple",
  AUTO: "bg-orange-10 text-orange",
  CAR: "bg-slate-10 text-slate",
  BIKE: "bg-pink-10 text-pink",
  CYCLE: "bg-cyan-10 text-cyan",
  HAND_CART: "bg-brown-10 text-brown",
  PORTER: "bg-rose-10 text-rose",
  OTHER: "bg-muted text-muted-foreground",
};

export function VehiclesView({ vehicles }: { vehicles: VehicleRow[] }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<VehicleRow | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return vehicles;
    return vehicles.filter((v) =>
      [v.vehicleNumber, v.vehicleType, v.driverName, v.transporterName]
        .filter(Boolean)
        .some((f) => f!.toLowerCase().includes(q))
    );
  }, [vehicles, query]);

  const columns: Column<VehicleRow>[] = [
    {
      key: "vehicleNumber",
      label: "Vehicle No.",
      sortable: true,
      render: (v) => (
        <div className="flex items-center gap-2">
          {v.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={v.photoUrl} alt={v.vehicleNumber} className="size-8 rounded object-cover shrink-0" />
          ) : (
            <div className="size-8 rounded bg-muted flex items-center justify-center shrink-0">
              <Truck className="size-4 text-muted-foreground" />
            </div>
          )}
          <span className="font-mono font-medium text-foreground">{v.vehicleNumber}</span>
        </div>
      ),
      exportValue: (v) => v.vehicleNumber,
    },
    {
      key: "vehicleType",
      label: "Type",
      sortable: true,
      render: (v) => (
        <span className={cn(
          "inline-flex items-center rounded px-1.5 py-0.5 text-caption font-medium",
          TYPE_COLORS[v.vehicleType] ?? TYPE_COLORS.OTHER,
        )}>
          {TYPE_LABELS[v.vehicleType] ?? v.vehicleType}
        </span>
      ),
      exportValue: (v) => TYPE_LABELS[v.vehicleType] ?? v.vehicleType,
    },
    {
      key: "driverName",
      label: "Driver",
      sortable: true,
      render: (v) => v.driverName ? (
        <div className="flex items-center gap-1.5">
          <User className="size-3 text-muted-foreground" />
          <span className="text-body text-foreground">{v.driverName}</span>
          {v.driverPhone && (
            <span className="text-caption text-muted-foreground font-mono">{v.driverPhone}</span>
          )}
        </div>
      ) : <span className="text-muted-foreground">—</span>,
      exportValue: (v) => v.driverName ?? "",
    },
    {
      key: "transporterName",
      label: "Transporter",
      sortable: true,
      render: (v) => v.transporterName ? (
        <span className="text-body text-foreground">{v.transporterName}</span>
      ) : <span className="text-muted-foreground">—</span>,
      exportValue: (v) => v.transporterName ?? "",
    },
    {
      key: "tripCount",
      label: "Trips",
      sortable: true,
      align: "right",
      render: (v) => (
        <span className={cn("tnum", v.tripCount > 0 ? "font-medium text-foreground" : "text-muted-foreground")}>
          {v.tripCount}
        </span>
      ),
      exportValue: (v) => v.tripCount,
    },
    {
      key: "lastUsedAt",
      label: "Last Used",
      sortable: true,
      render: (v) => v.lastUsedAt ? (
        <div className="flex flex-col">
          <span className="text-caption text-foreground">{formatRelativeTime(new Date(v.lastUsedAt))}</span>
          {v.lastLocationName && (
            <span className="text-micro text-muted-foreground flex items-center gap-0.5">
              <MapPin className="size-2.5" /> {v.lastLocationName}
            </span>
          )}
        </div>
      ) : <span className="text-muted-foreground">—</span>,
      exportValue: (v) => v.lastUsedAt ?? "",
    },
    {
      key: "actions",
      label: "",
      align: "right",
      render: (v) => (
        <div className="flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setSelected(v)}
            className="text-caption text-muted-foreground hover:text-foreground flex items-center gap-0.5"
          >
            View trips <ChevronRight className="size-3" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search vehicle no, driver, transporter…"
          className="pl-9"
        />
      </div>

      {filtered.length === 0 && !query ? (
        <EmptyState
          icon={<Truck className="h-6 w-6" />}
          title="No vehicles yet"
          description="Vehicles are auto-created when you enter a vehicle number on any goods movement — receive, issue, transfer, sale, or return. Each movement logs a trip."
        />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          getRowId={(v) => v.id}
          initialSort={{ key: "lastUsedAt", direction: "desc" }}
          onRowClick={(v) => setSelected(v)}
          emptyState={
            <EmptyState
              icon={<Search className="h-5 w-5" />}
              title="No vehicles found"
              description="Try a different search."
            />
          }
        />
      )}

      <VehicleDetailDialog
        vehicle={selected}
        open={!!selected}
        onOpenChange={(o) => { if (!o) setSelected(null); }}
      />
    </div>
  );
}

function VehicleDetailDialog({
  vehicle,
  open,
  onOpenChange,
}: {
  vehicle: VehicleRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [trips, setTrips] = useState<VehicleTripRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  // Load trips when a vehicle is selected
  useEffect(() => {
    if (!vehicle) { setTrips(null); return; }
    setLoading(true);
    setTrips(null);
    fetch(`/api/vehicles/${vehicle.id}/trips`)
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setTrips(data))
      .catch(() => setTrips([]))
      .finally(() => setLoading(false));
  }, [vehicle]);

  if (!vehicle) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={vehicle.vehicleNumber}
      description={`${TYPE_LABELS[vehicle.vehicleType] ?? vehicle.vehicleType} · ${vehicle.tripCount} trip${vehicle.tripCount !== 1 ? "s" : ""}`}
      size="lg"
    >
      <div className="space-y-4">
        {/* Photo */}
        {vehicle.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={vehicle.photoUrl} alt={vehicle.vehicleNumber} className="w-full h-40 rounded-lg object-cover" />
        ) : (
          <div className="w-full h-32 rounded-lg bg-muted flex items-center justify-center">
            <Truck className="size-10 text-muted-foreground" />
          </div>
        )}

        {/* Driver / Carrier info */}
        <div className="rounded-lg border border-border p-3 space-y-2">
          <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">Driver / Carrier</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-micro text-muted-foreground">Name</p>
              <p className="text-body font-medium text-foreground flex items-center gap-1">
                <User className="size-3 text-muted-foreground" /> {vehicle.driverName ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-micro text-muted-foreground">Phone</p>
              <p className="text-body font-medium text-foreground font-mono flex items-center gap-1">
                <Phone className="size-3 text-muted-foreground" /> {vehicle.driverPhone ?? "—"}
              </p>
            </div>
          </div>
          {vehicle.transporterName && (
            <div>
              <p className="text-micro text-muted-foreground">Transporter</p>
              <p className="text-body font-medium text-foreground">{vehicle.transporterName}</p>
            </div>
          )}
        </div>

        {/* Trip history */}
        <div className="rounded-lg border border-border p-3">
          <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground mb-2">Trip History</p>
          {loading ? (
            <p className="text-body text-muted-foreground text-center py-4">Loading trips…</p>
          ) : trips && trips.length > 0 ? (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {trips.map((t) => (
                <div key={t.id} className="rounded border border-border p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-caption font-medium text-foreground">
                      {t.movementType.replace(/_/g, " ")}
                    </span>
                    <span className="text-micro text-muted-foreground">
                      {formatRelativeTime(new Date(t.timestamp))}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {t.fromLocationName && (
                      <span className="text-micro text-muted-foreground flex items-center gap-0.5">
                        <MapPin className="size-2.5" /> {t.fromLocationName}
                      </span>
                    )}
                    {t.toLocationName && (
                      <>
                        <ChevronRight className="size-2.5 text-muted-foreground" />
                        <span className="text-micro text-muted-foreground flex items-center gap-0.5">
                          <MapPin className="size-2.5" /> {t.toLocationName}
                        </span>
                      </>
                    )}
                  </div>
                  {t.driverName && (
                    <p className="text-micro text-muted-foreground mt-0.5 flex items-center gap-0.5">
                      <User className="size-2.5" /> {t.driverName}
                      {t.transporterName && ` · ${t.transporterName}`}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-body text-muted-foreground text-center py-4">No trips recorded</p>
          )}
        </div>
      </div>
    </Dialog>
  );
}
