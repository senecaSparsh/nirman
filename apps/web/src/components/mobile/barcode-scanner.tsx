"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { X, ScanLine, Loader2, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Cross-platform barcode scanner.
 *
 * Strategy:
 * 1. Try native BarcodeDetector API (Chrome/Android) — fastest, no dependency
 * 2. Fall back to html5-qrcode (works on iOS Safari + all modern browsers)
 * 3. If camera access fails entirely, show error + manual entry option
 *
 * Usage:
 *   <BarcodeScanner onScan={(code) => ...} onClose={() => ...} />
 */
export function BarcodeScanner({
  onScan,
  onClose,
}: {
  onScan: (code: string) => void;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const [status, setStatus] = useState<"starting" | "scanning" | "error">("starting");
  const [errorMsg, setErrorMsg] = useState("");
  const [manualCode, setManualCode] = useState("");

  const stopCamera = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  // Try native BarcodeDetector first, then fall back to html5-qrcode
  useEffect(() => {
    let cancelled = false;

    async function startScanning() {
      // ── Strategy 1: Native BarcodeDetector (Chrome/Android) ──
      if (typeof window !== "undefined" && "BarcodeDetector" in window) {
        try {
          // @ts-expect-error — BarcodeDetector is not in TS lib defs yet
          const detector = new window.BarcodeDetector({
            formats: ["code_128", "ean_13", "ean_8", "qr_code", "data_matrix"],
          });
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" },
          });
          if (cancelled) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          streamRef.current = stream;
          const video = videoRef.current!;
          video.srcObject = stream;
          await video.play();
          setStatus("scanning");

          const start = performance.now();
          const tick = async () => {
            if (cancelled || performance.now() - start > 30000) {
              stopCamera();
              if (!cancelled) {
                setStatus("error");
                setErrorMsg("Scan timed out — try again or enter manually");
              }
              return;
            }
            try {
              const codes = await detector.detect(video);
              if (codes.length > 0 && codes[0].rawValue) {
                stopCamera();
                if (!cancelled) onScan(codes[0].rawValue);
                return;
              }
            } catch {
              // detection frame failed — keep trying
            }
            rafRef.current = requestAnimationFrame(tick);
          };
          rafRef.current = requestAnimationFrame(tick);
          return;
        } catch {
          // BarcodeDetector failed — fall through to html5-qrcode
        }
      }

      // ── Strategy 2: html5-qrcode (iOS Safari + all browsers) ──
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled) return;

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        setStatus("scanning");

        // Use html5-qrcode's scanner in manual mode (we control the video element)
        const scanner = new Html5Qrcode(containerRef.current!.id, {
          verbose: false,
          useBarCodeDetectorIfSupported: true,
        });

        // We need to pass the video element to the scanner
        // html5-qrcode expects its own container, so we use a hidden div
        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 250, height: 200 },
            aspectRatio: 1.333,
          },
          (decodedText: string) => {
            if (!cancelled) {
              stopCamera();
              scanner.stop().catch(() => {});
              onScan(decodedText);
            }
          },
          () => {
            // Per-frame failure — ignore, keep scanning
          },
        );

        // Cleanup on unmount
        return () => {
          scanner.stop().catch(() => {});
          scanner.clear();
        };
      } catch (err) {
        // ── Strategy 3: Camera access failed entirely ──
        if (!cancelled) {
          setStatus("error");
          setErrorMsg(
            err instanceof Error
              ? `Camera error: ${err.message}`
              : "Camera access failed. Check permissions or enter the code manually."
          );
        }
      }
    }

    startScanning();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [onScan, stopCamera]);

  function handleManualSubmit() {
    if (manualCode.trim()) {
      stopCamera();
      onScan(manualCode.trim());
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Header */}
      <div className="flex items-center justify-between bg-black/80 px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <div className="flex items-center gap-2 text-white">
          <ScanLine className="h-5 w-5" />
          <span className="text-body font-semibold">Scan Barcode</span>
        </div>
        <button
          onClick={() => {
            stopCamera();
            onClose();
          }}
          className="rounded-full p-1.5 text-white hover:bg-white/10"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Camera view */}
      <div className="relative flex-1 overflow-hidden">
        {status === "starting" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="text-body">Starting camera…</span>
          </div>
        )}

        {status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center text-white">
            <Camera className="h-12 w-12 opacity-50" />
            <p className="text-body">{errorMsg}</p>
            <p className="text-caption text-white/70">
              Enter the barcode manually below
            </p>
          </div>
        )}

        {/* Video element for native BarcodeDetector */}
        <video
          ref={videoRef}
          className={`h-full w-full object-cover ${status !== "scanning" ? "hidden" : ""}`}
          playsInline
          muted
        />

        {/* Hidden container for html5-qrcode */}
        <div id="html5-qrcode-container" ref={containerRef} className="hidden" />

        {/* Scan frame overlay */}
        {status === "scanning" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-48 w-72 rounded-lg border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]" />
          </div>
        )}
      </div>

      {/* Manual entry fallback */}
      <div className="space-y-2 bg-black/90 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="flex gap-2">
          <input
            type="text"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            placeholder="Enter barcode manually…"
            className="h-10 flex-1 rounded-md border border-white/20 bg-white/10 px-3 text-body text-white placeholder:text-white/50 outline-none"
            autoComplete="off"
            enterKeyHint="done"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleManualSubmit();
            }}
          />
          <Button
            onClick={handleManualSubmit}
            disabled={!manualCode.trim()}
            size="default"
          >
            Submit
          </Button>
        </div>
        <p className="text-center text-caption text-white/50">
          Point camera at barcode or enter code above
        </p>
      </div>
    </div>
  );
}
