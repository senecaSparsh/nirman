"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import {
  ScanLine, CheckCircle2, Clock, AlertCircle, Wifi, WifiOff,
  RefreshCw, ChevronDown, ChevronRight, Truck, Scale, Camera, PackageOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { cn, formatNumber, formatCurrency, formatDateTime, toNum} from "@/lib/utils";
import { useOfflineQueue } from "@/lib/offline/use-offline-queue";
import { retryOp, type QueuedOperation } from "@/lib/offline/queue";
import { VehicleCapture, type VehicleData } from "@/components/mobile/vehicle-capture";
import {
  PhotoCapture, WeighbridgeFields, SelectField,
  DELIVERY_MODES,
} from "@/components/mobile/proof-capture";
import { BarcodeScanner } from "@/components/mobile/barcode-scanner";

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

// ── Component ────────────────────────────────────────────────────

export function FieldReceive({ purchaseOrders, initialPoId }: { purchaseOrders: ReceivablePo[]; initialPoId?: string }) {
  const router = useRouter();
  const { queue, pending, online, syncing, enqueue, sync, refresh } = useOfflineQueue();
  const [selectedPoId, setSelectedPoId] = useState<string>(initialPoId ?? "");
  const [gateEntryNumber, setGateEntryNumber] = useState<string>("");
  const [challanNumber, setChallanNumber] = useState<string>("");
  const [receiptNotes, setReceiptNotes] = useState<string>("");
  const [receipts, setReceipts] = useState<Record<string, string>>({}); // lineId → qty
  const [scanning, setScanning] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [confirmLines, setConfirmLines] = useState<{ name: string; qty: number; unit: string; cost: number }[] | null>(null);
  // Photo-first receipt: shoot the delivery challan the driver hands over →
  // OCR reads the despatched lines → quantities prefill against the PO.
  const [ocrLoading, setOcrLoading] = useState(false);
  const challanInputRef = useRef<HTMLInputElement>(null);
  // Double-submit lock — a fast double-tap on "Confirm" fires before React
  // re-renders a `submitting` state, so a ref (updates synchronously) is the
  // only reliable guard. Without it, two queued ops apply the receipt twice.
  const submitLock = useRef(false);

  // ── Delivery details (collapsible) ──
  const [showDeliveryDetails, setShowDeliveryDetails] = useState(false);
  const [deliveryMode, setDeliveryMode] = useState<string>("");
  const [vehicle, setVehicle] = useState<VehicleData>({
    vehicleNumber: "", vehicleType: "",
  });
  const [photos, setPhotos] = useState<{ url: string; fileName?: string }[]>([]);
  // Weighbridge (kanta parchi) — for bulk materials
  const [wbTicketNo, setWbTicketNo] = useState("");
  const [wbGross, setWbGross] = useState("");
  const [wbTare, setWbTare] = useState("");
  const [wbNet, setWbNet] = useState("");

  const selectedPo = useMemo(
    () => purchaseOrders.find((p) => p.id === selectedPoId) ?? null,
    [purchaseOrders, selectedPoId],
  );

  // Auto-select: deep-linked PO first, then the only PO if there's just one.
  useEffect(() => {
    if (!selectedPoId) {
      if (initialPoId && purchaseOrders.some((p) => p.id === initialPoId)) {
        setSelectedPoId(initialPoId);
      } else if (purchaseOrders.length === 1) {
        setSelectedPoId(purchaseOrders[0]!.id);
      }
    }
  }, [purchaseOrders, selectedPoId, initialPoId]);

  function setQty(lineId: string, qty: string) {
    setReceipts((r) => ({ ...r, [lineId]: qty }));
  }

  // Open the barcode scanner overlay. When a code is scanned, match it
  // to a PO line and pre-fill the remaining qty.
  function onScanBtn() {
    if (!selectedPo) {
      toast.error("Select a purchase order first.");
      return;
    }
    setShowScanner(true);
  }

  function handleScannedCode(code: string) {
    setShowScanner(false);
    setScanning(false);
    if (!selectedPo) return;
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

  // ── Challan OCR (photo-first receipt) ──
  // The truck arrives with a paper delivery challan. Photo it → the OCR
  // service reads the despatched lines → we prefill receive quantities by
  // fuzzy-matching material names to this PO's lines. Everything OCR'd is
  // advisory — the receiver verifies the physical goods, the over-qty guard
  // still runs, and the server re-validates at POST.
  async function onChallanPhoto(file: File) {
    if (!selectedPo) {
      toast.error("Select a purchase order first — the challan lines are matched to it.");
      return;
    }
    setOcrLoading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const res = await fetch("/api/ocr/challan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64 }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        result?: { challanNumber?: string; vehicleNumber?: string; lines?: { materialName: string; quantity: number; unit: string }[] };
      };
      if (!res.ok) throw new Error(data.error ?? "Couldn't read the challan");
      applyChallan(data.result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Challan scan failed — enter quantities manually");
    } finally {
      setOcrLoading(false);
      if (challanInputRef.current) challanInputRef.current.value = "";
    }
  }

  function applyChallan(result?: {
    challanNumber?: string;
    vehicleNumber?: string;
    lines?: { materialName: string; quantity: number; unit: string }[];
  }) {
    if (!selectedPo || !result?.lines?.length) {
      toast.error("Couldn't read the challan — enter quantities manually");
      return;
    }
    const tokensOf = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
    let matched = 0;
    const unmatched: string[] = [];
    for (const line of result.lines) {
      if (!(line.quantity > 0)) { unmatched.push(line.materialName); continue; }
      const tokens = tokensOf(line.materialName);
      let best: ReceivableLine | null = null;
      let bestScore = 0;
      for (const pl of selectedPo.lines) {
        const nameTokens = new Set(tokensOf(`${pl.materialName} ${pl.materialCode}`));
        const score = tokens.reduce((acc, t) => acc + (nameTokens.has(t) ? 1 : 0), 0);
        if (score > bestScore) { bestScore = score; best = pl; }
      }
      if (best && bestScore > 0) {
        matched++;
        setQty(best.id, String(line.quantity));
      } else {
        unmatched.push(line.materialName);
      }
    }
    if (result.challanNumber && !challanNumber.trim()) setChallanNumber(result.challanNumber);
    if (result.vehicleNumber && !vehicle.vehicleNumber.trim()) {
      setVehicle((v) => ({ ...v, vehicleNumber: result.vehicleNumber! }));
    }
    if (matched === 0) {
      toast.error("Read the challan, but nothing matched this PO's lines — enter quantities manually");
      return;
    }
    toast.success(
      `Read ${matched} line${matched > 1 ? "s" : ""} from the challan — verify against the goods before confirming` +
      (unmatched.length ? ` (couldn't match: ${unmatched.join(", ")})` : ""),
    );
  }

  function prepareReceipt() {
    if (!selectedPo) return toast.error("Select a purchase order");
    // Over-qty must surface as a toast, not a thrown error — `throw` inside an
    // onClick propagates as an uncaught pageerror with zero user feedback.
    let overQtyMsg: string | null = null;
    const lines = selectedPo.lines
      .map((l) => {
        const qty = Number(receipts[l.id] ?? 0);
        if (!(qty > 0)) return null;
        const remaining = l.qtyOrdered - l.qtyReceived;
        if (qty > remaining) {
          overQtyMsg = `${l.materialName}: ${qty} exceeds remaining ${remaining} ${l.unit}`;
          return null;
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
    if (overQtyMsg) return toast.error(overQtyMsg);
    if (lines.length === 0) return toast.error("Enter a quantity for at least one line");

    // Build confirmation summary
    const summary = lines.map((l) => {
      const poLine = selectedPo.lines.find((p) => p.id === l.purchaseOrderLineId)!;
      return { name: poLine.materialName, qty: l.qtyReceived, unit: poLine.unit, cost: l.qtyReceived * l.unitCost };
    });
    haptic(10);
    setConfirmLines(summary);
  }

  function confirmReceipt() {
    if (!selectedPo || !confirmLines) return;
    if (submitLock.current) return;
    submitLock.current = true;
    const lines = selectedPo.lines
      .map((l) => {
        const qty = Number(receipts[l.id] ?? 0);
        if (!(qty > 0)) return null;
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

    const notesCombined = receiptNotes.trim() || null;

    // Build payload with all delivery/transport details
    const isHandCarry = deliveryMode === "HAND_CARRY";
    const payload: Record<string, unknown> = {
      purchaseOrderId: selectedPo.id,
      locationId: selectedPo.destinationLocationId,
      notes: notesCombined,
      lines,
      // Gate entry — proper field, no longer stuffed into notes
      gatePassNo: gateEntryNumber.trim() || undefined,
      // Supplier dispatch document
      challanNumber: challanNumber.trim() || undefined,
      // Delivery mode (how goods arrived)
      deliveryMode: deliveryMode || undefined,
      // Vehicle/transport — skip for hand carry
      vehicleType: isHandCarry ? undefined : (vehicle.vehicleType || undefined),
      vehicleNumber: isHandCarry ? undefined : (vehicle.vehicleNumber.trim() || undefined),
      driverName: isHandCarry ? undefined : (vehicle.driverName?.trim() || undefined),
      driverPhone: isHandCarry ? undefined : (vehicle.driverPhone?.trim() || undefined),
      transporterName: deliveryMode === "THIRD_PARTY" ? (vehicle.transporterName?.trim() || undefined) : undefined,
      // Receive proof photos
      photos: photos.length > 0 ? photos : undefined,
      // Weighbridge (kanta parchi) — for bulk materials
      weighbridgeTicketNo: wbTicketNo.trim() || undefined,
      grossWeight: wbGross ? Number(wbGross) : undefined,
      tareWeight: wbTare ? Number(wbTare) : undefined,
      netWeight: wbNet ? Number(wbNet) : undefined,
    };

    haptic(30);
    void enqueue("goods-receipt", payload).then(() => {
      toast.success(
        online
          ? "GRN recorded — stock updated."
          : `Offline — GRN queued (${pending + 1}). Will sync when online.`,
      );
      // Reset all form fields
      setReceipts({});
      setGateEntryNumber("");
      setChallanNumber("");
      setReceiptNotes("");
      setDeliveryMode("");
      setVehicle({ vehicleNumber: "", vehicleType: "" });
      setPhotos([]);
      setWbTicketNo(""); setWbGross(""); setWbTare(""); setWbNet("");
      setConfirmLines(null);
      // Skip the server refresh when offline — the RSC fetch can't succeed,
      // and Next's fallback turns it into a full document navigation that
      // ERR_INTERNET_DISCONNECTED-kills the page (the field worker loses the
      // form and the queue panel right after queueing). The local queue
      // hook already re-read IndexedDB; the server list is refreshed on the
      // next online load anyway.
      if (navigator.onLine) router.refresh();
    }).finally(() => { submitLock.current = false; });
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
          <div className="py-4 text-center space-y-1.5">
            <p className="text-body text-muted-foreground">
              No purchase orders awaiting receipt.
            </p>
            <p className="text-xs text-muted-foreground">
              Material arriving without an order? The office must raise a purchase order first — receipts are always matched to one.
            </p>
            <Link
              href="/m/site/receive/quick"
              className="inline-flex items-center gap-1.5 mt-1 text-m-caption font-bold text-primary press"
            >
              <PackageOpen className="h-3.5 w-3.5" />
              Site bought it — record a cash purchase
            </Link>
          </div>
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
                {p.status === "APPROVED" ? " · not marked sent — receiving will mark it ordered" : ""}
              </option>
            ))}
          </select>
        )}

        {selectedPo && (
          <>
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/50">
              <div>
                <Label className="text-m-body">Gate Entry No.</Label>
                <Input
                  placeholder="e.g. GE-2026-081"
                  value={gateEntryNumber}
                  onChange={(e) => setGateEntryNumber(e.target.value)}
                  className="font-mono text-xs mt-1"
                />
              </div>
              <div>
                <Label className="text-m-body">Challan No.</Label>
                <Input
                  placeholder="Supplier dispatch no."
                  value={challanNumber}
                  onChange={(e) => setChallanNumber(e.target.value)}
                  className="font-mono text-xs mt-1"
                />
              </div>
            </div>

            {/* Collapsible delivery details */}
            <button
              type="button"
              onClick={() => setShowDeliveryDetails((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground pt-1"
            >
              {showDeliveryDetails ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
              <Truck className="size-3.5" />
              Delivery details
              {(deliveryMode || vehicle.vehicleNumber || photos.length > 0 || wbTicketNo) ? (
                <span className="ml-1 text-m-label font-bold text-success">✓ filled</span>
              ) : null}
            </button>

            {showDeliveryDetails && (
              <div className="space-y-3 pt-1 border-t border-border/50">
                {/* Delivery mode */}
                <SelectField
                  label="Delivery Mode"
                  value={deliveryMode}
                  onChange={setDeliveryMode}
                  options={DELIVERY_MODES}
                />

                {/* Vehicle — hidden for hand carry */}
                {deliveryMode && deliveryMode !== "HAND_CARRY" && (
                  <div>
                    <Label className="text-m-body mb-1.5 block">Vehicle / Transport</Label>
                    <VehicleCapture value={vehicle} onChange={setVehicle} compact />
                  </div>
                )}

                {/* Receive proof photos */}
                <div>
                  <PhotoCapture
                    photos={photos}
                    onChange={setPhotos}
                    compact
                  />
                </div>

                {/* Weighbridge (kanta parchi) — for bulk materials */}
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Scale className="size-3 text-muted-foreground" />
                    <Label className="text-m-body">Weighbridge (Kanta Parchi)</Label>
                    <span className="text-m-label text-muted-foreground">— for bulk materials</span>
                  </div>
                  <WeighbridgeFields
                    ticketNo={wbTicketNo}
                    onTicketNoChange={setWbTicketNo}
                    grossWeight={wbGross}
                    onGrossChange={setWbGross}
                    tareWeight={wbTare}
                    onTareChange={setWbTare}
                    netWeight={wbNet}
                    onNetChange={setWbNet}
                  />
                </div>
              </div>
            )}

            {/* Receipt remarks */}
            <div>
              <Label className="text-m-body">Receipt Remarks</Label>
              <Input
                placeholder="Any additional notes"
                value={receiptNotes}
                onChange={(e) => setReceiptNotes(e.target.value)}
                className="text-xs mt-1"
              />
            </div>
          </>
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
            <div className="flex gap-2">
              <input
                ref={challanInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onChallanPhoto(f);
                }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => challanInputRef.current?.click()}
                disabled={ocrLoading || !online}
                title="Photo the supplier's delivery challan — lines prefill from it"
              >
                <Camera className="mr-1.5 h-3.5 w-3.5" />
                {ocrLoading ? "Reading…" : "Challan"}
              </Button>
              <Button variant="outline" size="sm" onClick={onScanBtn} disabled={scanning}>
                <ScanLine className="mr-1.5 h-3.5 w-3.5" />
                {scanning ? "Scanning…" : "Scan"}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            {selectedPo.lines.map((l) => {
              const remaining = l.qtyOrdered - l.qtyReceived;
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
                    inputMode="decimal"
                    enterKeyHint="done"
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

          <Button onClick={prepareReceipt} className="w-full" disabled={syncing}>
            <CheckCircle2 className="mr-1.5 h-4 w-4" />
            {online ? "Review receipt" : "Review receipt (offline)"}
          </Button>
        </div>
      )}

      {/* ── Confirmation bottom sheet ──────────────────────────
          Shows a summary of what's about to be received before
          the user commits — prevents errors on a job site. */}
      {confirmLines && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center">
          <div
            className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
            onClick={() => setConfirmLines(null)}
          />
          <div className="relative w-full max-w-md rounded-t-xl border border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className="text-body font-semibold text-foreground">Confirm Receipt</h3>
              <button
                onClick={() => setConfirmLines(null)}
                className="text-meta text-muted-foreground"
              >
                Cancel
              </button>
            </div>
            <div className="max-h-[40vh] overflow-y-auto px-4 py-3">
              <div className="space-y-2">
                {confirmLines.map((l, i) => (
                  <div key={i} className="flex items-center justify-between text-body">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-foreground">{l.name}</div>
                      <div className="text-caption text-muted-foreground">
                        {formatNumber(l.qty, 3)} {l.unit} @ {formatCurrency(l.cost / l.qty)}
                      </div>
                    </div>
                    <span className="shrink-0 tnum font-medium text-foreground">
                      {formatCurrency(l.cost)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex justify-between border-t border-border pt-2.5 text-body font-semibold">
                <span>Total value</span>
                <span className="tnum">
                  {formatCurrency(confirmLines.reduce((s, l) => s + toNum(l.cost), 0))}
                </span>
              </div>

              {/* Delivery details summary */}
              {(gateEntryNumber || challanNumber || vehicle.vehicleNumber || photos.length > 0 || wbTicketNo) ? (
                <div className="mt-2 pt-2 border-t border-border/50 space-y-1 text-caption text-muted-foreground">
                  {gateEntryNumber && <div>Gate Entry: <span className="font-mono text-foreground">{gateEntryNumber}</span></div>}
                  {challanNumber && <div>Challan: <span className="font-mono text-foreground">{challanNumber}</span></div>}
                  {vehicle.vehicleNumber && <div>Vehicle: <span className="font-mono text-foreground">{vehicle.vehicleNumber}</span>{vehicle.vehicleType ? ` · ${vehicle.vehicleType}` : ""}</div>}
                  {photos.length > 0 && <div>Photos: {photos.length} proof photo{photos.length !== 1 ? "s" : ""}</div>}
                  {wbTicketNo && <div>Weighbridge: <span className="font-mono text-foreground">{wbTicketNo}</span>{wbNet ? ` · ${wbNet} kg net` : ""}</div>}
                </div>
              ) : null}
            </div>
            <div className="border-t border-border px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              <Button onClick={confirmReceipt} className="w-full" size="lg">
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {online ? "Confirm — update stock" : "Confirm — queue offline"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Offline queue */}
      {queue.length > 0 && (
        <QueuePanel queue={queue} onRetry={async (id) => { await retryOp(id); await sync(); await refresh(); }} />
      )}

      {/* Cross-platform barcode scanner overlay */}
      {showScanner && (
        <BarcodeScanner
          onScan={handleScannedCode}
          onClose={() => {
            setShowScanner(false);
            setScanning(false);
          }}
        />
      )}
    </div>
  );
}

function QueuePanel({ queue, onRetry }: { queue: QueuedOperation[]; onRetry: (id: string) => Promise<void> }) {
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
                  {formatDateTime(op.createdAt)}
                  {op.attempts > 0 && ` · ${op.attempts} attempt${op.attempts === 1 ? "" : "s"}`}
                </div>
                {op.error && <div className="mt-0.5 text-danger">{op.error}</div>}
                {op.status === "FAILED" && (
                  <button
                    className="mt-1 inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-meta font-medium text-info hover:bg-info/10"
                    onClick={() => void onRetry(op.id)}
                  >
                    <RefreshCw className="h-3 w-3" /> Retry sync
                  </button>
                )}
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
