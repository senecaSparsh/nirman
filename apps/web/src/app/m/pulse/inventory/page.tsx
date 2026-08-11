import { Suspense } from "react";
import Link from "next/link";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { materialInventoryValue } from "@nirman/services";
import { getCompany, toNum } from "@/lib/server";
import { formatCurrency, formatNumber } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════════════════
   OWNER — INVENTORY AT A GLANCE

   The simplest possible inventory page for an owner on a phone.
   One screen, three questions answered:

     1. How much is my stock worth?        → Stock valuation card
     2. Is anything running out?           → Stock health card + low-stock list
     3. What do I have, where?             → Material cards with status

   Design language: "site-grade" — warm neutrals, hi-vis semantic colours,
   sturdy radii, borders over shadows, tabular numerals, border-l-4 status
   cards. Every number is readable in direct sunlight on a scratched screen.
   ═══════════════════════════════════════════════════════════════════════════ */

export default function OwnerInventoryPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <OwnerInventoryContent />
    </Suspense>
  );
}

async function OwnerInventoryContent() {
  await connection();
  const company = await getCompany();

  const [inventoryVal, locations, materials] = await Promise.all([
    materialInventoryValue(company.id),
    prisma.stockLocation.findMany({
      where: { companyId: company.id, deletedAt: null },
      select: {
        id: true,
        name: true,
        type: true,
        stockItems: { select: { qty: true, movingAvgCost: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.material.findMany({
      where: { deletedAt: null, stockItems: { some: { location: { companyId: company.id } } } },
      select: {
        id: true,
        code: true,
        name: true,
        unit: true,
        minStock: true,
        reorderPoint: true,
        category: { select: { name: true } },
        stockItems: {
          where: { location: { companyId: company.id } },
          select: { qty: true, movingAvgCost: true },
        },
      },
      orderBy: { name: "asc" },
      take: 200,
    }),
  ]);

  // ── Derive per-material stats ──
  const rows = materials.map((m) => {
    const totalQty = m.stockItems.reduce((s, i) => s + toNum(i.qty), 0);
    const totalValue = m.stockItems.reduce(
      (s, i) => s + toNum(i.qty) * toNum(i.movingAvgCost),
      0,
    );
    const minStock = m.minStock ? toNum(m.minStock) : null;
    const reorderPoint = m.reorderPoint ? toNum(m.reorderPoint) : null;
    const isOutOfStock = totalQty <= 0;
    const isLow = !isOutOfStock && minStock != null && totalQty < minStock;
    const isBelowReorder = !isOutOfStock && reorderPoint != null && totalQty <= reorderPoint;
    const status: "ok" | "low" | "critical" = isOutOfStock
      ? "critical"
      : isLow || isBelowReorder
        ? "low"
        : "ok";
    return {
      id: m.id,
      code: m.code,
      name: m.name,
      unit: m.unit,
      categoryName: m.category.name,
      totalQty,
      totalValue,
      minStock,
      reorderPoint,
      status,
    };
  });

  const totalSkus = rows.length;
  const healthyCount = rows.filter((r) => r.status === "ok").length;
  const lowStockCount = rows.filter((r) => r.status === "low").length;
  const outOfStockCount = rows.filter((r) => r.status === "critical").length;
  const totalStockValue = toNum(inventoryVal);

  // Low/critical first, then by value descending
  const sortedRows = [...rows].sort(
    (a, b) =>
      Number(a.status !== "critical") - Number(b.status !== "critical") ||
      Number(a.status !== "low") - Number(b.status !== "low") ||
      b.totalValue - a.totalValue,
  );

  const locTypeLabel = (t: string) =>
    t === "COMPANY_WAREHOUSE"
      ? "Warehouse"
      : t === "PROJECT_SITE"
        ? "Site"
        : t === "DEPARTMENT"
          ? "Dept"
          : t;

  return (
    <main className="mx-auto w-full max-w-[64rem] px-4 py-5 pb-nav">
      {/* ── Header ── */}
      <header className="mb-5 flex items-start justify-between gap-3">
        <div>
          <Link
            href="/m/pulse"
            className="text-[0.6875rem] mb-1 inline-block text-muted-foreground"
          >
            ← Today
          </Link>
          <p className="text-[0.5625rem] font-semibold uppercase tracking-wide text-muted-foreground">
            {company.name}
          </p>
          <h1 className="text-[1.25rem] font-bold text-foreground">
            Inventory
          </h1>
        </div>
        <Link
          href="/m/pulse/inventory"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-[0.625rem] border border-border bg-card text-muted-foreground active:opacity-70"
          aria-label="Refresh"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M4 12a8 8 0 018-8 8 8 0 016.32 3.12M20 12a8 8 0 01-8 8 8 8 0 01-6.32-3.12"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <path
              d="M18 3v4h-4M6 21v-4h4"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
      </header>

      {/* ── Stock valuation summary ── */}
      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <ValuationCard
          label="Stock value"
          value={formatCurrency(totalStockValue)}
          hint="total on hand"
          tone="steel"
        />
        <ValuationCard
          label="Total SKUs"
          value={formatNumber(totalSkus, 0)}
          hint={`${healthyCount} healthy`}
          tone="neutral"
        />
        <ValuationCard
          label="Low stock"
          value={formatNumber(lowStockCount, 0)}
          hint="below min"
          tone={lowStockCount > 0 ? "signal" : "neutral"}
        />
        <ValuationCard
          label="Out of stock"
          value={formatNumber(outOfStockCount, 0)}
          hint="zero on hand"
          tone={outOfStockCount > 0 ? "stop" : "neutral"}
        />
      </div>

      {/* ── Stock health card ── */}
      <div className="mb-5 rounded-[0.875rem] border border-border bg-card p-4">
        <p className="mb-3 text-[0.5625rem] font-semibold uppercase tracking-wide text-muted-foreground">
          Stock health
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <HealthTile
            count={healthyCount}
            label="Healthy"
            hint="above min"
            tone="go"
          />
          <HealthTile
            count={lowStockCount}
            label="Low stock"
            hint="below min"
            tone="signal"
          />
          <HealthTile
            count={outOfStockCount}
            label="Out of stock"
            hint="zero on hand"
            tone="stop"
          />
          <HealthTile
            count={locations.length}
            label="Locations"
            hint="warehouses + sites"
            tone="steel"
          />
        </div>
      </div>

      {/* ── Stock by location ── */}
      <SectionHead title="Stock by location" />
      <div className="mb-5 flex flex-col gap-2.5">
        {locations.length === 0 ? (
          <div className="rounded-[0.875rem] border border-border bg-card p-3 text-[0.6875rem] text-muted-foreground">
            No stock locations set up.
          </div>
        ) : (
          locations.map((l) => {
            const qty = l.stockItems.reduce((s, i) => s + toNum(i.qty), 0);
            const value = l.stockItems.reduce(
              (s, i) => s + toNum(i.qty) * toNum(i.movingAvgCost),
              0,
            );
            return (
              <Link
                key={l.id}
                href={`/m/stock?locationId=${l.id}`}
                className="flex items-center justify-between gap-3 rounded-[0.875rem] border border-border bg-card p-3 transition-colors active:bg-accent"
              >
                <div className="min-w-0">
                  <p className="text-[0.75rem] font-semibold text-foreground">
                    {l.name}
                  </p>
                  <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
                    {locTypeLabel(l.type)} · {l.stockItems.length} items
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="numeric text-[0.9375rem] font-bold text-foreground">
                    {formatCurrency(value)}
                  </p>
                  <p className="text-[0.5625rem] text-muted-foreground">
                    {formatNumber(qty, 0)} units
                  </p>
                </div>
              </Link>
            );
          })
        )}
      </div>

      {/* ── All materials ── */}
      <SectionHead
        title="All materials"
        action={
          <Link
            href="/m/materials"
            className="text-[0.6875rem] font-semibold text-brand"
          >
            View all →
          </Link>
        }
      />
      <div className="flex flex-col gap-2.5">
        {sortedRows.length === 0 ? (
          <div className="rounded-[0.875rem] border border-border bg-card p-3 text-[0.6875rem] text-muted-foreground">
            No materials in the catalogue.
          </div>
        ) : (
          sortedRows.slice(0, 30).map((m) => (
            <MaterialCard key={m.id} material={m} />
          ))
        )}
      </div>

      {sortedRows.length > 30 && (
        <div className="mt-4">
          <Link
            href="/m/materials"
            className="flex w-full items-center justify-center gap-2 rounded-[0.625rem] border-2 border-border bg-card px-5 py-3 text-[0.875rem] font-semibold text-foreground active:opacity-80"
          >
            View all {formatNumber(totalSkus, 0)} materials →
          </Link>
        </div>
      )}
    </main>
  );
}

// ─── Section heading ───────────────────────────────────────────────────────
function SectionHead({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <h2 className="text-[0.9375rem] font-bold text-foreground">{title}</h2>
      {action}
    </div>
  );
}

// ─── Valuation summary tile ────────────────────────────────────────────────
const VALUATION_TONES: Record<string, string> = {
  neutral: "text-foreground",
  signal: "text-warning",
  stop: "text-danger",
  steel: "text-info",
  go: "text-success",
};

function ValuationCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "signal" | "stop" | "steel" | "go";
}) {
  return (
    <div className="rounded-[0.875rem] border border-border bg-card p-3">
      <p className="mb-1 text-[0.5625rem] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={`numeric text-[1.0625rem] font-bold ${VALUATION_TONES[tone]!}`}
      >
        {value}
      </p>
      {hint && (
        <p className="mt-0.5 text-[0.5625rem] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

// ─── Stock health tile (coloured wash) ─────────────────────────────────────
const HEALTH_TONES: Record<
  string,
  { bg: string; text: string }
> = {
  go: { bg: "bg-success-soft", text: "text-success" },
  signal: { bg: "bg-warning-soft", text: "text-warning" },
  stop: { bg: "bg-danger-soft", text: "text-danger" },
  steel: { bg: "bg-info-soft", text: "text-info" },
};

function HealthTile({
  count,
  label,
  hint,
  tone,
}: {
  count: number;
  label: string;
  hint: string;
  tone: "go" | "signal" | "stop" | "steel";
}) {
  const t = HEALTH_TONES[tone]!;
  return (
    <div className={`rounded-[0.625rem] p-3 ${t.bg}`}>
      <p className={`numeric text-[1.5rem] font-bold ${t.text}`}>
        {formatNumber(count, 0)}
      </p>
      <p
        className={`text-[0.5625rem] font-semibold uppercase tracking-wide ${t.text}`}
      >
        {label}
      </p>
      <p className="mt-0.5 text-[0.5rem] text-muted-foreground">{hint}</p>
    </div>
  );
}

// ─── Material card with border-l-4 status ──────────────────────────────────
const STATUS_BORDER: Record<string, string> = {
  ok: "border-l-success",
  low: "border-l-warning",
  critical: "border-l-danger",
};

const STATUS_BADGE: Record<
  string,
  { label: string; bg: string; text: string }
> = {
  ok: { label: "In stock", bg: "bg-success-soft", text: "text-success" },
  low: { label: "Low", bg: "bg-warning-soft", text: "text-warning" },
  critical: { label: "Out", bg: "bg-danger-soft", text: "text-danger" },
};

function MaterialCard({
  material,
}: {
  material: {
    id: string;
    code: string;
    name: string;
    unit: string;
    categoryName: string;
    totalQty: number;
    totalValue: number;
    minStock: number | null;
    reorderPoint: number | null;
    status: "ok" | "low" | "critical";
  };
}) {
  const badge = STATUS_BADGE[material.status]!;
  return (
    <Link
      href={`/m/materials/${material.id}`}
      className={`block rounded-[0.875rem] border border-border border-l-4 bg-card p-3 transition-colors active:bg-accent ${STATUS_BORDER[material.status]!}`}
    >
      <div className="mb-2.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.75rem] font-semibold text-foreground">
            {material.name}
          </p>
          <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
            {material.code} · {material.categoryName}
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-[0.375rem] px-2 py-0.5 text-[0.5625rem] font-semibold uppercase tracking-wide ${badge.bg} ${badge.text}`}
        >
          {badge.label}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        <div className="flex flex-col gap-0.5">
          <dt className="text-[0.5625rem] font-semibold uppercase tracking-wide text-muted-foreground">
            On hand
          </dt>
          <dd className="numeric text-[1.0625rem] font-bold text-foreground">
            {formatNumber(material.totalQty, 0)} {material.unit}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-[0.5625rem] font-semibold uppercase tracking-wide text-muted-foreground">
            Value
          </dt>
          <dd className="numeric text-[1.0625rem] font-bold text-foreground">
            {formatCurrency(material.totalValue)}
          </dd>
        </div>
        {material.minStock != null && (
          <div className="flex flex-col gap-0.5">
            <dt className="text-[0.5625rem] font-semibold uppercase tracking-wide text-muted-foreground">
              Min stock
            </dt>
            <dd
              className={`numeric text-[1.0625rem] font-bold ${material.status === "ok" ? "text-foreground" : "text-danger"}`}
            >
              {formatNumber(material.minStock, 0)} {material.unit}
            </dd>
          </div>
        )}
      </dl>
    </Link>
  );
}
