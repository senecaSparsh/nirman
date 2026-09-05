"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {Search, Truck, Phone, User, MapPin, ChevronRight, Plus, Loader2} from "lucide-react";
import { toast } from "sonner";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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

export function VehiclesView({ vehicles, canManage = false }: { vehicles: VehicleRow[]; canManage?: boolean }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<VehicleRow | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

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
            <div className="relative size-8 rounded overflow-hidden shrink-0">
              <Image src={v.photoUrl} alt={v.vehicleNumber} fill className="object-cover" sizes="32px" />
            </div>
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
      <div className="flex items-center gap-2 max-w-sm">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search vehicle no, driver, transporter…"
            className="pl-9"
          />
        </div>
        {canManage ? (
          <Button onClick={() => setCreateOpen(true)} className="shrink-0">
            <Plus className="h-4 w-4" /> New Vehicle
          </Button>
        ) : null}
      </div>

      {filtered.length === 0 && !query ? (
        <EmptyState
          icon={<Truck className="h-6 w-6" />}
          title="No vehicles yet"
          description="Vehicles are auto-created when you enter a vehicle number on any goods movement — receive, issue, transfer, sale, or return. Each movement logs a trip."
          action={
            canManage ? (
              <Button onClick={() => setCreateOpen(true)} size="sm">
                <Plus className="h-4 w-4" /> New Vehicle
              </Button>
            ) : undefined
          }
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

      {canManage ? (
        <NewVehicleDialog open={createOpen} onOpenChange={setCreateOpen} />
      ) : null}
    </div>
  );
}

const VEHICLE_TYPE_OPTIONS = [
  { value: "TRUCK", label: "Truck (16-wheeler)" },
  { value: "TEMPO", label: "Tempo" },
  { value: "PICKUP", label: "Pickup" },
  { value: "TRACTOR", label: "Tractor Trolley" },
  { value: "MINI_TRUCK", label: "Mini Truck" },
  { value: "AUTO", label: "Auto Rickshaw" },
  { value: "CAR", label: "Car" },
  { value: "BIKE", label: "Bike" },
  { value: "CYCLE", label: "Cycle" },
  { value: "HAND_CART", label: "Hand Cart" },
  { value: "PORTER", label: "Porter (on shoulder)" },
  { value: "OTHER", label: "Other" },
];

/**
 * NewVehicleDialog — desktop modal for manually creating a Vehicle master
 * record. Mirrors the mobile MobileNewVehicleForm. Vehicles normally
 * auto-build from goods movements, but the owner can pre-register one here.
 */
function NewVehicleDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    vehicleNumber: "",
    vehicleType: "TRUCK",
    driverName: "",
    driverPhone: "",
    transporterName: "",
  });

  // Reset form whenever the dialog is opened fresh.
  useEffect(() => {
    if (!open) return;
    setForm({
      vehicleNumber: "",
      vehicleType: "TRUCK",
      driverName: "",
      driverPhone: "",
      transporterName: "",
    });
  }, [open]);

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.vehicleNumber.trim()) {
      toast.error("Vehicle number is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/vehicles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicleNumber: form.vehicleNumber.trim(),
          vehicleType: form.vehicleType,
          driverName: form.driverName.trim() || null,
          driverPhone: form.driverPhone.trim() || null,
          transporterName: form.transporterName.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create vehicle");
      toast.success(`Vehicle ${form.vehicleNumber.trim().toUpperCase()} created`);
      onOpenChange(false);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New Vehicle"
      description="Pre-register a vehicle before its first trip. It will be auto-updated with trip info when used on a goods movement."
      className="max-w-lg"
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="v-number">Vehicle Number *</Label>
            <Input
              id="v-number"
              value={form.vehicleNumber}
              onChange={(e) => set("vehicleNumber", e.target.value)}
              placeholder="e.g. MH-12-AB-1234"
              required
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="v-type">Type</Label>
            <select
              id="v-type"
              value={form.vehicleType}
              onChange={(e) => set("vehicleType", e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              {VEHICLE_TYPE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="v-driver">Driver Name</Label>
            <Input
              id="v-driver"
              value={form.driverName}
              onChange={(e) => set("driverName", e.target.value)}
              placeholder="e.g. Ramesh"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="v-phone">Driver Phone</Label>
            <Input
              id="v-phone"
              type="tel"
              value={form.driverPhone}
              onChange={(e) => set("driverPhone", e.target.value)}
              placeholder="e.g. 9876543210"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="v-transporter">Transporter</Label>
          <Input
            id="v-transporter"
            value={form.transporterName}
            onChange={(e) => set("transporterName", e.target.value)}
            placeholder="e.g. ABC Transport (for third-party transport)"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {saving ? "Creating…" : "Create Vehicle"}
          </Button>
        </div>
      </form>
    </Dialog>
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
          <div className="relative w-full h-40 rounded-lg overflow-hidden">
            <Image src={vehicle.photoUrl} alt={vehicle.vehicleNumber} fill className="object-cover" sizes="(max-width: 768px) 100vw, 400px" />
          </div>
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
