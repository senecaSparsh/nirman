"use client";

import { useEffect, useState, useMemo } from "react";
import { useFetch } from "@/lib/use-fetch";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { createPortal } from "react-dom";
import { Loader2, X, Wallet } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

/**
 * SMS MATCH SHEET — turns an unmatched bank SMS into a payment in one tap.
 *
 * The list page links unmatched rows to `/m/sms?match=<smsId>`; this sheet
 * reads that param, fetches open receivables (`/api/sms/receivables`), and
 * shows them as tappable rows — no raw-ID pasting. Tapping a row POSTs to
 * /api/sms/match which creates the payment + posts the GL entry.
 *
 * Portaled to document.body so it escapes any parent transform/filter.
 */

type Receivable = {
  entityType: "ASSET_SALE" | "MATERIAL_SALE" | "TENANCY";
  entityId: string;
  label: string;
  sublabel: string;
  due: number;
};

const TYPE_LABEL: Record<Receivable["entityType"], string> = {
  ASSET_SALE: "Unit sale",
  MATERIAL_SALE: "Material sale",
  TENANCY: "Rent",
};

export function MobileSmsMatchSheet() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const smsId = searchParams.get("match");
  const [mounted, setMounted] = useState(false);

  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => setMounted(true), []);

  const { data: receivablesData, error: receivablesError } = useFetch<{ items?: Receivable[] }>(
    smsId ? "/api/sms/receivables" : null,
  );
  const items = receivablesError ? [] : receivablesData ? (receivablesData.items ?? []) : null;

  const open = !!smsId;

  function close() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("match");
    router.replace(`/m/sms${params.size ? `?${params}` : ""}`);
  }

  async function pick(item: Receivable) {
    if (!smsId || busy) return;
    setBusy(item.entityId);
    try {
      const res = await fetch("/api/sms/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ smsId, entityType: item.entityType, entityId: item.entityId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to match SMS");
      toast.success(`Matched to ${item.label} — payment recorded`);
      close();
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to match SMS");
    } finally {
      setBusy(null);
    }
  }

  const sheet = useMemo(() => {
    if (!open) return null;
    return (
      <div
        className="fixed inset-0 z-[60] flex items-end justify-center"
        style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        onClick={close}
      >
        <div
          className="w-full max-w-lg rounded-t-[0.875rem] overflow-hidden"
          style={{ backgroundColor: "var(--color-paper)", maxHeight: "80dvh" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: "1px solid var(--color-line)" }}
          >
            <p className="text-m-section font-extrabold" style={{ color: "var(--color-ink-950)" }}>
              Match to a payment
            </p>
            <button onClick={close} className="grid place-items-center size-8 rounded-full press" style={{ backgroundColor: "var(--color-concrete)" }}>
              <X className="size-4" style={{ color: "var(--color-ink-700)" }} />
            </button>
          </div>

          <div className="overflow-y-auto" style={{ maxHeight: "calc(80dvh - 3.25rem)" }}>
            {items === null ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="size-5 animate-spin" style={{ color: "var(--color-ink-400)" }} />
              </div>
            ) : items.length === 0 ? (
              <p className="py-10 text-center text-m-body" style={{ color: "var(--color-ink-500)" }}>
                No outstanding payments to match against.
              </p>
            ) : (
              <div className="flex flex-col">
                {items.map((item) => (
                  <button
                    key={`${item.entityType}-${item.entityId}`}
                    onClick={() => pick(item)}
                    disabled={!!busy}
                    className="flex items-center gap-3 px-4 py-3 text-left press disabled:opacity-50"
                    style={{ borderBottom: "1px solid var(--color-line)" }}
                  >
                    <span
                      className="grid place-items-center size-9 rounded-[0.375rem] shrink-0"
                      style={{ backgroundColor: "var(--color-concrete)" }}
                    >
                      {busy === item.entityId ? (
                        <Loader2 className="size-4 animate-spin" style={{ color: "var(--color-ink-700)" }} />
                      ) : (
                        <Wallet className="size-4" style={{ color: "var(--color-ink-700)" }} />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-m-body font-semibold truncate" style={{ color: "var(--color-ink-950)" }}>
                        {item.label}
                      </span>
                      <span className="block text-m-caption truncate" style={{ color: "var(--color-ink-500)" }}>
                        {TYPE_LABEL[item.entityType]} · {item.sublabel}
                      </span>
                    </span>
                    <span className="text-m-body font-bold tabular-nums shrink-0" style={{ color: "var(--color-stop)" }}>
                      {formatCurrency(item.due)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, items, busy, smsId]);

  if (!mounted) return null;
  return createPortal(sheet, document.body);
}
