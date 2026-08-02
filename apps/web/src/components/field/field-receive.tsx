"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ScanLine, Package, CheckCircle2, Clock, AlertCircle, Wifi, WifiOff,
  RefreshCw, ChevronDown, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { cn, formatNumber } from "@/lib/utils";
import { useOfflineQueue } from "@/lib/offline/use-offline-queue";
import type { QueuedOperation } from "@/lib/offline/queue";

// ── Types (mirrors the server-component payload) ────────────────

interface ReceivableLine {
  id: string;
  materialId: string;
  materialCode: string;
  materialName: string;
  unit: string;
  barcode: string | null;
  qtyOrdered: number;
  qtyReceived: number;
  unitCost: number;
}
interface ReceivablePo {
  id: string;
  poNumber: string;
  supplierName: string;
  projectName: string | null;
  destinationLocationId: string;
  destinationLocationName: string;
  status: string;
  lines: ReceivableLine[];
}

// ── Barcode scanning via BarcodeDetector ────────────────────────

async function scanBarcode(): Promise<string | null> {
  // Native BarcodeDetector API (Chrome on Android). Falls back gracefully
  // where unavailable — the operator types the code manually.
  if (typeof window === "undefined" || !("BarcodeDetector" in window)) return null;
  try {
    // @ts-expect-error — BarcodeDetector is not in TS lib defs yet
    const detector = new window.BarcodeDetector({
      formats: ["code_128", "ean_13", "ean_8", "qr_code", "data_matrix"],
    });
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
    });
    const video = document.createElement("video");
    video.srcObject = stream;
    video.play();
    return await new Promise<string | null>((resolve) => {
      const start = performance.now();
      const tick = async () => {
        if (performance.now() - start > 20000) {
          stream.getTracks().forEach((t) => t.stop());
          resolve(null);
          return;
        }
        try {
          const codes = await detector.detect(video);
          if (codes.length > 0) {
            stream.getTracks().forEach((t) => t.stop());
            resolve(codes[0].rawValue);
            return;
          }
        } catch {
          // detection frame failed — keep trying
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  } catch {
    return null;
  }
}

// ── Component ────────────────────────────────────────────────────

export function FieldReceive({ purchaseOrders }: { purchaseOrders: ReceivablePo[] }) {
  const router = useRouter();
  const { queue, pending, online, syncing, enqueue, sync } = useOfflineQueue();
  const [selectedPoId, setSelectedPoId] = useState<string>("");
  const [receipts, setReceipts] = useState<Record<string, string>>({}); // lineId → qty
  const [scanning, setScanning] = useState(false);

  const selectedPo = useMemo(
    () => purchaseOrders.find((p) => p.id === selectedPoId) ?? null,
    [purchaseOrders, selectedPoId],
  );

  // Auto-select the first PO if only one is receivable.
  useEffect(() => {
    if (!selectedPoId && purchaseOrders.length === 1) setSelectedPoId(purchaseOrders[0]!.id);
  }, [purchaseOrders, selectedPoId]);

  function setQty(lineId: string, qty: string) {
    setReceipts((r) => ({ ...r, [lineId]: qty }));
  }

  // Scan a barcode and match it to a PO line, focusing that line's qty input.
  async function onScan() {
    setScanning(true);
    const code = await scanBarcode();
    setScanning(false);
    if (!code) {
      toast.info("Barcode scan unavailable — enter the code manually.");
      return;
    }
    if (!selectedPo) {
      toast.error("Select a purchase order first.");
      return;
    }
    const line = selectedPo.lines.find(
      (l) => l.barcode === code || l.materialCode === code,
    );
    if (!line) {
      toast.error(`No line matches barcode ${code} on this PO.`);
      return;
    }
    // Pre-fill remaining qty for the matched line.
    const remaining = line.qtyOrdered - line.qtyReceived;
    setQty(line.id, String(remaining));
    toast.success(`Scanned ${line.materialName} — enter ${remaining} ${line.unit}`);
  }

  function submitReceipt() {
    if (!selectedPo) return toast.error("Select a purchase order");
    const lines = selectedPo.lines
      .map((l) => {
        const qty = Number(receipts[l.id] ?? 0);
        if (!(qty > 0)) return null;
        const remaining = l.qtyOrdered - l.qtyReceived;
        if (qty > remaining) {
          throw new Error(`${l.materialName}: ${qty} exceeds remaining ${remaining} ${l.unit}`);
        }
        return {
          purchaseOrderLineId: l.id,
          materialId: l.materialId,
          qtyReceived: qty,
          unitCost: l.unitCost,
        };
      })
      .filter(Boolean) as {
      purchaseOrderLineId: string;
      materialId: string;
      qtyReceived: number;
      unitCost: number;
    }[];
    if (lines.length === 0) return toast.error("Enter a quantity for at least one line");

    const payload = {
      purchaseOrderId: selectedPo.id,
      locationId: selectedPo.destinationLocationId,
      notes: null,
      lines,
    };

    void enqueue("goods-receipt", payload).then(() => {
      toast.success(
        online
          ? "Receipt recorded — stock updated."
          : `Offline — receipt queued (${pending + 1}). Will sync when online.`,
      );
      setReceipts({});
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* Status bar */}
      <div className="flex items-center justify-between rounded-lg border bg-card p-3">
        <div className="flex items-center gap-2 text-body">
          {online ? (
            <><Wifi className="h-4 w-4 text-success" /><span className="text-muted-foreground">Online</span></>
          ) : (
            <><WifiOff className="h-4 w-4 text-warning" /><span className="text-muted-foreground">Offline — {pending} queued</span></>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => sync()}
          disabled={syncing || !online || pending === 0}
        >
          <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", syncing && "animate-spin")} />
          {syncing ? "Syncing…" : "Sync now"}
        </Button>
      </div>

      {/* PO selector */}
      <div className="rounded-lg border bg-card p-3 space-y-3">
        <Label>Purchase Order</Label>
        {purchaseOrders.length === 0 ? (
          <p className="text-body text-muted-foreground py-4 text-center">
            No purchase orders awaiting receipt.
          </p>
        ) : (
          <select
            className="w-full rounded-md border bg-background px-3 py-2 text-body"
            value={selectedPoId}
            onChange={(e) => { setSelectedPoId(e.target.value); setReceipts({}); }}
          >
            <option value="" disabled>Select a PO to receive…</option>
            {purchaseOrders.map((p) => (
              <option key={p.id} value={p.id}>
                {p.poNumber} · {p.supplierName} · {p.destinationLocationName}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Lines */}
      {selectedPo && (
        <div className="rounded-lg border bg-card p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold text-body">{selectedPo.poNumber}</div>
              <div className="text-meta text-muted-foreground">
                {selectedPo.supplierName}
                {selectedPo.projectName ? ` · ${selectedPo.projectName}` : ""}
                {" · "}{selectedPo.destinationLocationName}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={onScan} disabled={scanning}>
              <ScanLine className="mr-1.5 h-3.5 w-3.5" />
              {scanning ? "Scanning…" : "Scan"}
            </Button>
          </div>

          <div className="space-y-2">
            {selectedPo.lines.map((l) => {
              const remaining = l.qtyOrdered - l.qtyReceived;
              const entered = Number(receipts[l.id] ?? 0);
              const done = remaining <= 0;
              return (
                <div
                  key={l.id}
                  className={cn(
                    "grid grid-cols-[1fr_90px] gap-2 rounded-md border p-2",
                    done && "opacity-50",
                  )}
                >
                  <div className="min-w-0">
                    <div className="truncate text-body font-medium">{l.materialName}</div>
                    <div className="text-meta text-muted-foreground">
                      {l.materialCode} · {formatNumber(l.qtyReceived)}/{formatNumber(l.qtyOrdered)} {l.unit}
                      {remaining > 0 && <span className="ml-1 text-warning">· {formatNumber(remaining)} left</span>}
                    </div>
                  </div>
                  <Input
                    type="number"
                    step="0.001"
                    min="0"
                    max={remaining}
                    placeholder="Qty"
                    disabled={done}
                    value={receipts[l.id] ?? ""}
                    onChange={(e) => setQty(l.id, e.target.value)}
                    className="text-right"
                  />
                </div>
              );
            })}
          </div>

          <Button onClick={submitReceipt} className="w-full" disabled={syncing}>
            <CheckCircle2 className="mr-1.5 h-4 w-4" />
            {online ? "Receive & update stock" : "Queue receipt (offline)"}
          </Button>
        </div>
      )}

      {/* Offline queue */}
      {queue.length > 0 && (
        <QueuePanel queue={queue} />
      )}
    </div>
  );
}

function QueuePanel({ queue }: { queue: QueuedOperation[] }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-lg border bg-card">
      <button
        className="flex w-full items-center justify-between p-3"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="flex items-center gap-2 text-body font-medium">
          <Clock className="h-4 w-4" /> Sync Queue ({queue.length})
        </span>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      {open && (
        <div className="divide-y border-t">
          {queue.map((op) => (
            <div key={op.id} className="flex items-start justify-between p-3 text-meta">
              <div className="min-w-0">
                <div className="font-medium text-body">
                  {op.kind === "goods-receipt" ? "Goods Receipt" : op.kind}
                </div>
                <div className="text-muted-foreground">
                  {new Date(op.createdAt).toLocaleString()}
                  {op.attempts > 0 && ` · ${op.attempts} attempt(s)`}
                </div>
                {op.error && <div className="mt-0.5 text-danger">{op.error}</div>}
              </div>
              <StatusBadge status={op.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: QueuedOperation["status"] }) {
  const map = {
    PENDING: { icon: Clock, label: "Pending", className: "bg-warning/10 text-warning" },
    SYNCING: { icon: RefreshCw, label: "Syncing", className: "bg-info/10 text-info" },
    COMPLETED: { icon: CheckCircle2, label: "Done", className: "bg-success/10 text-success" },
    FAILED: { icon: AlertCircle, label: "Failed", className: "bg-danger/10 text-danger" },
  } as const;
  const { icon: Icon, label, className } = map[status];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-meta font-medium", className)}>
      <Icon className="h-3 w-3" /> {label}
    </span>
  );
}
