import type { ReactNode } from "react";
import { prisma } from "@nirman/db";
import { toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { MobileDetailPage } from "@/components/mobile/v2/detail-page";
import Link from "next/link";
import {
  Recycle, Zap, Hand,
} from "lucide-react";
import { formatCurrency, formatCurrencyCompact, formatDate, formatNumber } from "@/lib/utils";
import { MobileScrapCancelBtn } from "./MobileScrapCancelBtn";
import { ActionBar, MobileEmptyState } from "@/components/mobile/v2/primitives";
import { AttachmentList } from "@/components/attachments/attachment-list";
import { PageContextProvider } from "@/components/mobile/v2/page-context";
import {
  DetailHeroCard,
  DetailStatGrid,
  DetailKeyValueCard,
  DetailAlertBanner,
  DetailPrintButton,
} from "@/components/mobile/v2/detail-primitives";

export default function MobileScrapDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <MobileDetailPage params={params} managePerm={PERM.INVENTORY_MANAGE} skeletonSections={6}>
      {async ({ id, company, canManage }) => {
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
          <PageContextProvider value={{
            entityType: "scrapGeneration",
            status: scrap.status,
            label: scrap.scrapNumber,
            subtitle: scrap.project?.name ?? undefined,
            recordId: scrap.id,
          }}>
          <div className="pb-20">
            {/* ── Hero card ── */}
            <DetailHeroCard
              icon={Recycle}
              title={scrap.scrapNumber}
              titleMono
              status={isCancelled ? "CANCELLED" : undefined}
              action={
                <div className="flex items-center gap-1.5">
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
                  <DetailPrintButton href={`/print/scrap/${scrap.id}`} />
                </div>
              }
            />

            {/* ── Value stats ── */}
            <DetailStatGrid
              cols={2}
              stats={[
                { label: "Scrap Value", value: formatCurrency(totalValue), tone: "go" },
                { label: "Total Qty", value: formatNumber(totalQty, 0) },
              ]}
            />

            {/* ── Details ── */}
            <DetailKeyValueCard
              entries={[
                { label: "Destination", value: <Link href={`/m/stock?locationId=${scrap.toLocation.id}`} className="underline underline-offset-2 press">{scrap.toLocation.name}</Link> },
                { label: "Date", value: formatDate(scrap.generationDate), mono: true },
                ...(scrap.project ? [{ label: "Project", value: <Link href={`/m/projects/${scrap.project.id}`} className="underline underline-offset-2 press">{scrap.project.name}</Link> as ReactNode }] : []),
                ...(scrap.sourceMaterial ? [{ label: "Source", value: <Link href={`/m/materials/${scrap.sourceMaterial.id}`} className="underline underline-offset-2 press">{scrap.sourceMaterial.name}</Link> as ReactNode }] : []),
                ...(scrap.notes ? [{ label: "Notes", value: scrap.notes as ReactNode }] : []),
              ]}
            />

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

            <AttachmentList entityType="ScrapGeneration" entityId={scrap.id} />

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
              <div className="mt-3">
                <DetailAlertBanner
                  tone="danger"
                  title="Cancelled"
                  description={formatDate(scrap.cancelledAt)}
                />
              </div>
            ) : null}

          </div>
          </PageContextProvider>
        );
      }}
    </MobileDetailPage>
  );
}
