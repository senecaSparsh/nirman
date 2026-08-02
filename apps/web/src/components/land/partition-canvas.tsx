"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  polygonArea,
  splitConvexPolygon,
  centroid,
  toSvgPath,
  type Polygon,
  type Point,
  type Segment,
} from "@nirman/services";

/**
 * CAD/GIS Partition Canvas — the visual land partitioning tool.
 *
 * Renders the parent parcel as an SVG polygon. The user draws cut lines by
 * clicking two points on the canvas; each cut splits the targeted child plot
 * into two. The resulting plots are colored distinctly with their computed
 * areas labeled at their centroids.
 *
 * The canvas works in normalized [0,1] coordinates internally; the SVG
 * viewBox scales to any display size. Cut lines must fully cross the target
 * polygon (the split function returns null otherwise — the UI shows a hint).
 *
 * State: the canvas owns the current partition tree (array of polygons).
 * The parent calls `onPlotsChange` whenever the tree changes so the dialog
 * can show the plot assignment form + area conservation indicator.
 */

const PLOT_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899",
  "#06b6d4", "#84cc16", "#f97316", "#6366f1", "#14b8a6",
];

export interface PlotResult {
  polygon: Polygon;
  area: number; // normalized [0,1] — multiply by parentArea for actual
  color: string;
}

export function PartitionCanvas({
  parentPolygon,
  parentArea,
  areaUnit,
  width = 600,
  height = 400,
  onPlotsChange,
}: {
  /** Initial parent boundary in normalized [0,1] coordinates. */
  parentPolygon: Polygon;
  /** Actual area of the parent parcel (for display). */
  parentArea: number;
  areaUnit: string;
  width?: number;
  height?: number;
  /** Called whenever the partition tree changes. */
  onPlotsChange: (plots: PlotResult[]) => void;
}) {
  const [plots, setPlots] = useState<PlotResult[]>(() => [
    { polygon: parentPolygon, area: polygonArea(parentPolygon), color: PLOT_COLORS[0]! },
  ]);
  const [cutStart, setCutStart] = useState<Point | null>(null);
  const [mousePos, setMousePos] = useState<Point | null>(null);
  const [hoveredPlot, setHoveredPlot] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Notify parent of plot changes
  const updatePlots = useCallback(
    (newPlots: PlotResult[]) => {
      setPlots(newPlots);
      onPlotsChange(newPlots);
    },
    [onPlotsChange],
  );

  // Convert SVG pixel coords to normalized [0,1] coords
  const toNormalized = useCallback(
    (e: React.MouseEvent): Point => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) / rect.width,
        y: (e.clientY - rect.top) / rect.height,
      };
    },
    [],
  );

  // Find which plot contains a point
  const findPlotAt = useCallback(
    (pt: Point): number => {
      for (let i = plots.length - 1; i >= 0; i--) {
        if (pointInPolygonLocal(pt, plots[i]!.polygon)) return i;
      }
      return -1;
    },
    [plots],
  );

  function handleCanvasClick(e: React.MouseEvent) {
    const pt = toNormalized(e);
    if (!cutStart) {
      // First click — start a cut line
      setCutStart(pt);
      return;
    }
    // Second click — attempt to split the plot that contains the midpoint
    const mid: Point = { x: (cutStart.x + pt.x) / 2, y: (cutStart.y + pt.y) / 2 };
    const targetIdx = findPlotAt(mid);
    if (targetIdx < 0) {
      setCutStart(null);
      return;
    }
    const target = plots[targetIdx]!;
    const line: Segment = { a: cutStart, b: pt };
    const result = splitConvexPolygon(target.polygon, line);
    if (!result) {
      // Cut doesn't fully cross the target plot — ignore
      setCutStart(null);
      return;
    }
    const [left, right] = result;
    const colorIdx = plots.length;
    const newPlots = [
      ...plots.slice(0, targetIdx),
      { polygon: left, area: polygonArea(left), color: target.color },
      { polygon: right, area: polygonArea(right), color: PLOT_COLORS[colorIdx % PLOT_COLORS.length]! },
      ...plots.slice(targetIdx + 1),
    ];
    updatePlots(newPlots);
    setCutStart(null);
  }

  function handleMouseMove(e: React.MouseEvent) {
    const pt = toNormalized(e);
    setMousePos(pt);
    setHoveredPlot(findPlotAt(pt));
  }

  function undo() {
    if (plots.length <= 1) return;
    // Merge last two plots back — but we don't track the merge, so just
    // reset to parent and replay is not possible. Instead, reset to parent.
    reset();
  }

  function reset() {
    updatePlots([
      { polygon: parentPolygon, area: polygonArea(parentPolygon), color: PLOT_COLORS[0]! },
    ]);
    setCutStart(null);
  }

  // Compute actual areas (normalized × parentArea)
  const actualAreas = plots.map((p) => p.area * parentArea);
  const totalArea = actualAreas.reduce((s, a) => s + a, 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-caption text-muted-foreground">
          {plots.length} plot{plots.length !== 1 ? "s" : ""} ·
          {" "}Total: {totalArea.toFixed(3)} {areaUnit}
          {cutStart && " · Click to finish cut line"}
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={undo}
            disabled={plots.length <= 1}
            className="rounded-md border px-2 py-1 text-caption text-muted-foreground hover:bg-muted disabled:opacity-40"
          >
            Reset
          </button>
        </div>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full cursor-crosshair rounded-lg border bg-muted/20"
        style={{ aspectRatio: `${width}/${height}` }}
        onClick={handleCanvasClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => { setMousePos(null); setHoveredPlot(null); }}
      >
        {/* Grid background */}
        <defs>
          <pattern id="grid" width={width / 20} height={height / 20} patternUnits="userSpaceOnUse">
            <path d={`M ${width / 20} 0 L 0 0 0 ${height / 20}`} fill="none" stroke="currentColor" strokeWidth={0.5} className="text-border" />
          </pattern>
        </defs>
        <rect width={width} height={height} fill="url(#grid)" />

        {/* Render each plot */}
        {plots.map((plot, idx) => {
          const c = centroid(plot.polygon);
          const actualArea = plot.area * parentArea;
          const isHovered = hoveredPlot === idx;
          return (
            <g key={idx}>
              <path
                d={toSvgPath(plot.polygon, width, height)}
                fill={plot.color}
                fillOpacity={isHovered ? 0.35 : 0.2}
                stroke={plot.color}
                strokeWidth={isHovered ? 2.5 : 1.5}
                className="transition-all"
              />
              <text
                x={c.x * width}
                y={c.y * height}
                textAnchor="middle"
                dominantBaseline="middle"
                className="pointer-events-none select-none fill-foreground font-medium"
                style={{ fontSize: 13 }}
              >
                Plot {idx + 1}
              </text>
              <text
                x={c.x * width}
                y={c.y * height + 16}
                textAnchor="middle"
                dominantBaseline="middle"
                className="pointer-events-none select-none fill-muted-foreground"
                style={{ fontSize: 11 }}
              >
                {actualArea.toFixed(1)} {areaUnit}
              </text>
            </g>
          );
        })}

        {/* Cut line being drawn */}
        {cutStart && mousePos && (
          <line
            x1={cutStart.x * width}
            y1={cutStart.y * height}
            x2={mousePos.x * width}
            y2={mousePos.y * height}
            stroke="currentColor"
            strokeWidth={2}
            strokeDasharray="6 4"
            className="text-foreground"
          />
        )}

        {/* Cut start marker */}
        {cutStart && (
          <circle
            cx={cutStart.x * width}
            cy={cutStart.y * height}
            r={5}
            fill="currentColor"
            className="text-foreground"
          />
        )}
      </svg>

      <div className="text-caption text-muted-foreground">
        Click two points on a plot to split it. The cut line must cross the entire plot.
      </div>
    </div>
  );
}

// Local import to avoid circular dependency — pointInPolygon from geometry
function pointInPolygonLocal(pt: Point, poly: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i]!.x, yi = poly[i]!.y;
    const xj = poly[j]!.x, yj = poly[j]!.y;
    const intersect =
      yi > pt.y !== yj > pt.y &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
