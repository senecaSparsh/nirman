import { Suspense } from "react";
import Link from "next/link";
import { MobileSkeletonDetail } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import {
  Recycle, Zap, Hand, Printer,
} from "lucide-react";
import { toNum, getCompany, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatCurrency, formatCurrencyCompact, formatDate, formatNumber } from "@/lib/utils";
import { MobileScrapCancelBtn } from "./MobileScrapCancelBtn";
import { ActionBar, MobileEmptyState } from "@/components/mobile/v2/primitives";

export default function MobileScrapDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonDetail sections={6} />}>
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
  const role = await getUserRole();
  const canManage = hasPermission(role, PERM.INVENTORY_MANAGE);

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
      <MobileEmptyState
        icon={Recycle}
        title="Scrap slip not found"
      />
    );
  }

  const isAuto = !!scrap.dprAutoScrap;
  const isCancelled = scrap.status === "CANCELLED";
  const totalValue = scrap.lines.reduce((s, l) => s + toNum(l.qty) * toNum(l.unitCost), 0);
  const totalQty = scrap.lines.reduce((s, l) => s + toNum(l.qty), 0);
  const accentColor = isAuto ? "var(--color-signal)" : "var(--color-steel)";
  const SourceIcon = isAuto ? Zap : Hand;

  return (
    <div className="pb-20">
      {/* ── Header ── */}
      <div className="flex items-center gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-m-section font-bold truncate font-mono" style={{ color: "var(--color-ink-950)" }}>
            {scrap.scrapNumber}
          </p>
        </div>
        <span
          className="flex items-center gap-0.5 text-m-caption font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0"
          style={{
            color: accentColor,
            backgroundColor: `color-mix(in srgb, ${accentColor} 12%, transparent)`,
          }}
        >
          <SourceIcon className="size-2.5" />
          {isAuto ? "Auto" : "Manual"}
        </span>
        {isCancelled ? (
          <span
            className="text-m-caption font-bold uppercase px-1.5 py-0.5 rounded-[0.25rem] shrink-0"
            style={{ backgroundColor: "var(--color-stop)", color: "var(--color-paper)" }}
          >
            Cancelled
          </span>
        ) : null}
        <Link
          href={`/print/scrap/${scrap.id}`}
          className="flex items-center gap-1 text-m-body font-semibold px-2.5 py-1 rounded-[0.5rem] border text-m-body press shrink-0"
          style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)", backgroundColor: "var(--color-paper)" }}
        >
          <Printer className="size-3.5" />
          Print
        </Link>
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
            <p className="text-m-caption font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
              Scrap Value
            </p>
            <p className="text-m-section font-bold tabular-nums" style={{ color: "var(--color-go)" }}>
              {formatCurrency(totalValue)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-m-caption font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
              Total Qty
            </p>
            <p className="text-m-section font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
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
          className="flex items-center gap-2 px-2.5 py-1.5 text-m-body press"
        >
          <span className="text-m-caption font-semibold uppercase shrink-0" style={{ color: "var(--color-ink-500)" }}>
            Destination
          </span>
          <span className="text-m-label font-bold ml-auto truncate" style={{ color: "var(--color-ink-950)" }}>
            {scrap.toLocation.name}
          </span>
        </Link>

        {/* Date */}
        <div className="flex items-center gap-2 px-2.5 py-1.5" style={{ borderTop: "1px solid var(--color-line)" }}>
          <span className="text-m-caption font-semibold uppercase shrink-0" style={{ color: "var(--color-ink-500)" }}>
            Date
          </span>
          <span className="text-m-label font-bold ml-auto tabular-nums" style={{ color: "var(--color-ink-950)" }}>
            {formatDate(scrap.generationDate)}
          </span>
        </div>

        {/* Project */}
        {scrap.project ? (
          <Link
            href={`/m/projects/${scrap.project.id}`}
            className="flex items-center gap-2 px-2.5 py-1.5 text-m-body press"
            style={{ borderTop: "1px solid var(--color-line)" }}
          >
            <span className="text-m-caption font-semibold uppercase shrink-0" style={{ color: "var(--color-ink-500)" }}>
              Project
            </span>
            <span className="text-m-label font-bold ml-auto truncate" style={{ color: "var(--color-ink-950)" }}>
              {scrap.project.name}
            </span>
          </Link>
        ) : null}

        {/* Source material */}
        {scrap.sourceMaterial ? (
          <Link
            href={`/m/materials/${scrap.sourceMaterial.id}`}
            className="flex items-center gap-2 px-2.5 py-1.5 text-m-body press"
            style={{ borderTop: "1px solid var(--color-line)" }}
          >
            <span className="text-m-caption font-semibold uppercase shrink-0" style={{ color: "var(--color-ink-500)" }}>
              Source
            </span>
            <span className="text-m-label font-bold ml-auto truncate" style={{ color: "var(--color-ink-950)" }}>
              {scrap.sourceMaterial.name}
            </span>
          </Link>
        ) : null}

        {/* Notes */}
        {scrap.notes ? (
          <div className="px-2.5 py-1.5" style={{ borderTop: "1px solid var(--color-line)" }}>
            <p className="text-m-caption font-semibold uppercase mb-0.5" style={{ color: "var(--color-ink-500)" }}>
              Notes
            </p>
            <p className="text-m-label" style={{ color: "var(--color-ink-700)" }}>
              {scrap.notes}
            </p>
          </div>
        ) : null}
      </div>

      {/* ── Line items ── */}
      <p className="text-m-caption font-bold uppercase tracking-wide mb-1.5 px-0.5" style={{ color: "var(--color-steel)" }}>
        Line Items ({scrap.lines.length})
      </p>
      {scrap.lines.length === 0 ? (
        <MobileEmptyState
          icon={Recycle}
          title="No line items"
          size="compact"
        />
      ) : (
        <div
          className="rounded-[0.5rem] border overflow-hidden mb-3"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          {scrap.lines.map((l, i) => (
            <Link
              key={l.id}
              href={`/m/materials/${l.material.id}`}
              className="flex items-center gap-2 px-2.5 py-2 text-m-body press"
              style={i > 0 ? { borderTop: "1px solid var(--color-line)" } : undefined}
            >
              <div className="min-w-0 flex-1">
                <p className="text-m-label font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
                  {l.material.name}
                </p>
                <p className="text-m-caption font-mono" style={{ color: "var(--color-ink-500)" }}>
                  {l.material.code} · {formatCurrency(toNum(l.unitCost))}/{l.material.unit}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-m-label font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                  {formatNumber(toNum(l.qty), 0)} {l.material.unit}
                </p>
                <p className="text-m-caption font-semibold tabular-nums" style={{ color: "var(--color-go)" }}>
                  {formatCurrencyCompact(toNum(l.qty) * toNum(l.unitCost))}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}

      <ActionBar>
        {/* ── Cancel action ── */}
        {canManage && !isCancelled ? (
          <div className="mt-3">
            <MobileScrapCancelBtn scrapId={scrap.id} scrapNumber={scrap.scrapNumber} />
          </div>
        ) : null}
      </ActionBar>

      {/* ── Cancelled banner ── */}
      {isCancelled && scrap.cancelledAt ? (
        <div
          className="rounded-[0.5rem] border p-2.5 mt-3"
          style={{ borderColor: "color-mix(in srgb, var(--color-stop) 30%, var(--color-line))", backgroundColor: "color-mix(in srgb, var(--color-stop) 5%, transparent)" }}
        >
          <p className="text-m-label font-bold" style={{ color: "var(--color-stop)" }}>
            Cancelled
          </p>
          <p className="text-m-caption mt-0.5" style={{ color: "var(--color-ink-500)" }}>
            {formatDate(scrap.cancelledAt)}
          </p>
        </div>
      ) : null}

    </div>
  );
}
