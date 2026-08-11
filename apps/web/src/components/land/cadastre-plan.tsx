"use client";

import { useMemo } from "react";
import { formatNumber } from "@/lib/utils";
import type { LandParcelSummary, LandParcelStatus } from "@/lib/types";

/**
 * Cadastre Plan — the signature visual of the land module.
 *
 * Renders a purchase's leaf parcels (the sellable units) as an SVG treemap:
 * each parcel is a rectangle proportional to its area, colored by status.
 * Parcels with stored geometry render their actual polygon shape inside
 * their treemap cell. Parcel numbers label each cell; areas sit below.
 *
 * This is NOT a generic chart. It's a cadastre — a land registry plan view.
 * It makes the spatial, subdividable nature of land visible at a glance.
 * No other module has this because no other module deals in immovable
 * spatial assets.
 *
 * Layout: a simple row-packing treemap. Parcels sorted by area descending,
 * packed into rows. Each row fills the full width; row height is proportional
 * to the row's total area. Within a row, each parcel's width is proportional
 * to its area share. This gives an area-faithful plan that always works,
 * regardless of how many parcels or whether they have geometry.
 */

const STATUS_FILL: Record<LandParcelStatus, string> = {
  AVAILABLE: "var(--color-success)",
  HOLD: "var(--color-warning)",
  PARTITIONED: "var(--color-muted-foreground)",
  RESERVED: "var(--color-brand)",
  SOLD: "var(--color-danger)",
  RENTED: "var(--color-info)",
};

const STATUS_FILL_OPACITY: Record<LandParcelStatus, number> = {
  AVAILABLE: 0.10,
  HOLD: 0.10,
  PARTITIONED: 0.06,
  RESERVED: 0.10,
  SOLD: 0.10,
  RENTED: 0.10,
};

type LayoutCell = {
  parcel: LandParcelSummary;
  x: number;
  y: number;
  w: number;
  h: number;
};

/** Simple row-packing treemap. Returns cells in viewBox coordinates (0..100). */
function treemap(parcels: LandParcelSummary[], width = 100, height = 100): LayoutCell[] {
  const leaves = parcels.filter((p) => p.childCount === 0 || p.status !== "PARTITIONED");
  // If all parcels are partitioned roots (no leaves), show the roots themselves
  const targets = leaves.length > 0 ? leaves : parcels;
  const sorted = [...targets].sort((a, b) => b.area - a.area);
  if (sorted.length === 0) return [];

  const totalArea = sorted.reduce((s, p) => s + p.area, 0);
  if (totalArea <= 0) return [];

  // Pack into rows. Target ~sqrt(n) rows for a balanced aspect ratio.
  const targetRows = Math.max(1, Math.round(Math.sqrt(sorted.length)));
  const targetRowArea = totalArea / targetRows;

  const rows: LandParcelSummary[][] = [];
  let currentRow: LandParcelSummary[] = [];
  let currentRowArea = 0;

  for (const p of sorted) {
    if (currentRowArea + p.area > targetRowArea * 1.4 && currentRow.length > 0) {
      rows.push(currentRow);
      currentRow = [];
      currentRowArea = 0;
    }
    currentRow.push(p);
    currentRowArea += p.area;
  }
  if (currentRow.length > 0) rows.push(currentRow);

  const cells: LayoutCell[] = [];
  let y = 0;
  for (const row of rows) {
    const rowArea = row.reduce((s, p) => s + p.area, 0);
    const rowHeight = (rowArea / totalArea) * height;
    let x = 0;
    for (const p of row) {
      const w = (p.area / rowArea) * width;
      cells.push({ parcel: p, x, y, w, h: rowHeight });
      x += w;
    }
    y += rowHeight;
  }
  return cells;
}

/** Convert a parcel's normalized [0,1] geometry into a path within a cell. */
function geometryPathInCell(
  geometry: unknown,
  cell: LayoutCell,
): string | null {
  const g = geometry as { x: number; y: number }[] | null;
  if (!g || g.length < 3) return null;
  return (
    g
      .map((pt, i) => {
        const px = cell.x + pt.x * cell.w;
        const py = cell.y + pt.y * cell.h;
        return `${i === 0 ? "M" : "L"} ${px.toFixed(2)} ${py.toFixed(2)}`;
      })
      .join(" ") + " Z"
  );
}

export function CadastrePlan({
  parcels,
  width = 100,
  height = 100,
  showLabels = true,
  className,
  onParcelClick,
}: {
  parcels: LandParcelSummary[];
  width?: number;
  height?: number;
  showLabels?: boolean;
  className?: string;
  onParcelClick?: (parcelId: string) => void;
}) {
  const cells = useMemo(() => treemap(parcels, width, height), [parcels, width, height]);

  if (parcels.length === 0) {
    return (
      <div
        className={className}
        style={{
          width: "100%",
          aspectRatio: `${width} / ${height}`,
          background: "var(--color-muted)",
          borderRadius: "var(--radius)",
        }}
      />
    );
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      style={{ width: "100%", height: "auto", display: "block" }}
      preserveAspectRatio="xMidYMid meet"
    >
      {cells.map((cell) => {
        const { parcel } = cell;
        const fill = STATUS_FILL[parcel.status];
        const fillOpacity = STATUS_FILL_OPACITY[parcel.status];
        const geoPath = geometryPathInCell(parcel.geometry, cell);
        const cx = cell.x + cell.w / 2;
        const cy = cell.y + cell.h / 2;
        const cellArea = cell.w * cell.h;
        const showText = showLabels && cellArea > 120; // don't label tiny cells

        return (
          <g
            key={parcel.id}
            onClick={onParcelClick ? () => onParcelClick(parcel.id) : undefined}
            style={onParcelClick ? { cursor: "pointer" } : undefined}
          >
            {/* Base rectangle (treemap cell) */}
            <rect
              x={cell.x}
              y={cell.y}
              width={cell.w}
              height={cell.h}
              fill={fill}
              fillOpacity={fillOpacity}
              stroke={fill}
              strokeWidth={0.4}
            />
            {/* If geometry exists, overlay the actual polygon shape */}
            {geoPath && (
              <path
                d={geoPath}
                fill={fill}
                fillOpacity={fillOpacity * 1.5}
                stroke={fill}
                strokeWidth={0.5}
              />
            )}
            {/* Label */}
            {showText && (
              <text
                x={cx}
                y={cy}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="var(--color-foreground)"
                fontSize={Math.min(4, cell.w / 8)}
                fontWeight={600}
                style={{ fontFamily: "var(--font-mono)", pointerEvents: "none" }}
              >
                {parcel.number}
              </text>
            )}
            {showText && cellArea > 250 && (
              <text
                x={cx}
                y={cy + Math.min(5, cell.h / 6)}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="var(--color-muted-foreground)"
                fontSize={Math.min(3, cell.w / 12)}
                style={{ fontFamily: "var(--font-mono)", pointerEvents: "none" }}
              >
                {formatNumber(parcel.area, 0)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** A compact legend for the cadastre plan. */
export function CadastreLegend() {
  const items: { label: string; color: string }[] = [
    { label: "Available", color: "var(--color-success)" },
    { label: "Hold", color: "var(--color-warning)" },
    { label: "Sold", color: "var(--color-danger)" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-micro text-muted-foreground">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1">
          <span
            className="h-2 w-2 rounded-sm"
            style={{ backgroundColor: it.color, opacity: 0.5 }}
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}
