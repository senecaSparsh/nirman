import { Suspense } from "react";
import Link from "next/link";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import {
  Recycle, Zap, Hand, Printer,
} from "lucide-react";
import { MobileBackButton } from "@/components/mobile/v2/mobile-back-button";
import { toNum, getCompany } from "@/lib/server";
import { formatCurrency, formatCurrencyCompact, formatDate, formatNumber } from "@/lib/utils";

export default function MobileScrapDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileScrapDetailContent params={params} />
    </Suspense>
  );
}

async function MobileScrapDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  const company = await getCompany();

  const scrap = await prisma.scrapGeneration.findFirst({
    where: { id, companyId: company.id },
    include: {
      toLocation: { select: { id: true, name: true, type: true } },
      project: { select: { id: true, name: true } },
      sourceMaterial: { select: { id: true, name: true, code: true } },
      dprAutoScrap: { select: { id: true } },
      lines: {
        include: { material: { select: { id: true, name: true, unit: true, code: true } } },
      },
    },
  });

  if (!scrap) {
    return (
      <div>
        <div className="mb-4">
          <MobileBackButton fallback="/m/scrap-generations" className="" style={{ color: "var(--color-ink-700)" }} />
        </div>
        <div
          className="flex flex-col items-center justify-center rounded-[0.5rem] border py-12 text-center"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
        >
          <Recycle className="size-8 mb-2" style={{ color: "var(--color-ink-300)" }} />
          <p className="text-[0.875rem] font-semibold" style={{ color: "var(--color-ink-700)" }}>
            Scrap slip not found
          </p>
        </div>
      </div>
    );
  }

  const isAuto = !!scrap.dprAutoScrap;
  const totalValue = scrap.lines.reduce((s, l) => s + toNum(l.qty) * toNum(l.unitCost), 0);
  const totalQty = scrap.lines.reduce((s, l) => s + toNum(l.qty), 0);
  const accentColor = isAuto ? "var(--color-signal)" : "var(--color-steel)";
  const SourceIcon = isAuto ? Zap : Hand;

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-center gap-2 mb-2">
        <MobileBackButton fallback="/m/scrap-generations" className="shrink-0" style={{ color: "var(--color-ink-700)" }} />
        <div className="flex-1 min-w-0">
          <p className="text-[0.875rem] font-bold truncate font-mono" style={{ color: "var(--color-ink-950)" }}>
            {scrap.scrapNumber}
          </p>
        </div>
        <span
          className="flex items-center gap-0.5 text-[0.5rem] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0"
          style={{
            color: accentColor,
            backgroundColor: `color-mix(in srgb, ${accentColor} 12%, transparent)`,
          }}
        >
          <SourceIcon className="size-2.5" />
          {isAuto ? "Auto" : "Manual"}
        </span>
      </div>

      {/* ── Value banner ── */}
      <div
        className="rounded-[0.5rem] border px-3 py-2.5 mb-2"
        style={{
          borderColor: "color-mix(in srgb, var(--color-go) 30%, var(--color-line))",
          backgroundColor: "color-mix(in srgb, var(--color-go) 6%, var(--color-paper))",
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[0.5rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
              Scrap Value
            </p>
            <p className="text-[1rem] font-bold tabular-nums" style={{ color: "var(--color-go)" }}>
              {formatCurrency(totalValue)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[0.5rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
              Total Qty
            </p>
            <p className="text-[0.875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
              {formatNumber(totalQty, 0)}
            </p>
          </div>
        </div>
      </div>

      {/* ── Info row ── */}
      <div
        className="rounded-[0.5rem] border overflow-hidden mb-3"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        {/* Destination */}
        <Link
          href={`/m/stock?locationId=${scrap.toLocation.id}`}
          className="flex items-center gap-2 px-2.5 py-1.5 press"
        >
          <span className="text-[0.5rem] font-semibold uppercase shrink-0" style={{ color: "var(--color-ink-500)" }}>
            Destination
          </span>
          <span className="text-[0.625rem] font-bold ml-auto truncate" style={{ color: "var(--color-ink-950)" }}>
            {scrap.toLocation.name}
          </span>
        </Link>

        {/* Date */}
        <div className="flex items-center gap-2 px-2.5 py-1.5" style={{ borderTop: "1px solid var(--color-line)" }}>
          <span className="text-[0.5rem] font-semibold uppercase shrink-0" style={{ color: "var(--color-ink-500)" }}>
            Date
          </span>
          <span className="text-[0.625rem] font-bold ml-auto tabular-nums" style={{ color: "var(--color-ink-950)" }}>
            {formatDate(scrap.generationDate)}
          </span>
        </div>

        {/* Project */}
        {scrap.project ? (
          <Link
            href={`/m/projects/${scrap.project.id}`}
            className="flex items-center gap-2 px-2.5 py-1.5 press"
            style={{ borderTop: "1px solid var(--color-line)" }}
          >
            <span className="text-[0.5rem] font-semibold uppercase shrink-0" style={{ color: "var(--color-ink-500)" }}>
              Project
            </span>
            <span className="text-[0.625rem] font-bold ml-auto truncate" style={{ color: "var(--color-ink-950)" }}>
              {scrap.project.name}
            </span>
          </Link>
        ) : null}

        {/* Source material */}
        {scrap.sourceMaterial ? (
          <Link
            href={`/m/materials/${scrap.sourceMaterial.id}`}
            className="flex items-center gap-2 px-2.5 py-1.5 press"
            style={{ borderTop: "1px solid var(--color-line)" }}
          >
            <span className="text-[0.5rem] font-semibold uppercase shrink-0" style={{ color: "var(--color-ink-500)" }}>
              Source
            </span>
            <span className="text-[0.625rem] font-bold ml-auto truncate" style={{ color: "var(--color-ink-950)" }}>
              {scrap.sourceMaterial.name}
            </span>
          </Link>
        ) : null}

        {/* Notes */}
        {scrap.notes ? (
          <div className="px-2.5 py-1.5" style={{ borderTop: "1px solid var(--color-line)" }}>
            <p className="text-[0.5rem] font-semibold uppercase mb-0.5" style={{ color: "var(--color-ink-500)" }}>
              Notes
            </p>
            <p className="text-[0.625rem]" style={{ color: "var(--color-ink-700)" }}>
              {scrap.notes}
            </p>
          </div>
        ) : null}
      </div>

      {/* ── Line items ── */}
      <p className="text-[0.5625rem] font-bold uppercase tracking-wide mb-1.5 px-0.5" style={{ color: "var(--color-steel)" }}>
        Line Items ({scrap.lines.length})
      </p>
      {scrap.lines.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center rounded-[0.5rem] border py-8 text-center"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
        >
          <Recycle className="size-6 mb-2" style={{ color: "var(--color-ink-300)" }} />
          <p className="text-[0.75rem] font-semibold" style={{ color: "var(--color-ink-700)" }}>
            No line items
          </p>
        </div>
      ) : (
        <div
          className="rounded-[0.5rem] border overflow-hidden mb-3"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          {scrap.lines.map((l, i) => (
            <Link
              key={l.id}
              href={`/m/materials/${l.material.id}`}
              className="flex items-center gap-2 px-2.5 py-2 press"
              style={i > 0 ? { borderTop: "1px solid var(--color-line)" } : undefined}
            >
              <div className="min-w-0 flex-1">
                <p className="text-[0.625rem] font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
                  {l.material.name}
                </p>
                <p className="text-[0.5rem] font-mono" style={{ color: "var(--color-ink-500)" }}>
                  {l.material.code} · {formatCurrency(toNum(l.unitCost))}/{l.material.unit}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[0.625rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                  {formatNumber(toNum(l.qty), 0)} {l.material.unit}
                </p>
                <p className="text-[0.5rem] font-semibold tabular-nums" style={{ color: "var(--color-go)" }}>
                  {formatCurrencyCompact(toNum(l.qty) * toNum(l.unitCost))}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* ── Print action ── */}
      <Link
        href={`/print/scrap/${scrap.id}`}
        className="flex items-center justify-center gap-1.5 rounded-[0.5rem] border py-2 press"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <Printer className="size-3.5" style={{ color: "var(--color-ink-700)" }} />
        <span className="text-[0.6875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
          Print Slip
        </span>
      </Link>
    </div>
  );
}
