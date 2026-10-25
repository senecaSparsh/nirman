// Site-pour figure data — one place derives "how far along is the slab"
// from everything the project already records.
//
// Progress is a per-BOQ-item blend of the strongest available signal:
//   • items with certified measurement-book entries → certified %
//     (engineer-measured cumulative qty ÷ planned qty)
//   • items linked to a WBS activity → that activity's reported %
//   • everything else → the project's best reported rate (duration-
//     weighted WBS leaf average, else the latest DPR self-report)
//
// Certified work always shows certified; uncertified work still shows
// reported progress — so the band is always the best available truth,
// never understated by a partially-certified BOQ.

export type SitePourSource = "mb" | "wbs" | "dpr" | "none";

export interface SitePourData {
  /** 0–1 pour position. */
  progress: number;
  /** Cement bags issued to the project's stock locations. */
  bagsUsed: number;
  /** The dominant signal behind `progress` — surfaces in the plate hint. */
  source: SitePourSource;
  /** Share of progress backed by certified measurement (0–1). */
  certifiedShare: number;
}

interface BoqRow {
  id: string;
  estimatedQty: number | null;
  rate: number | null;
  estimatedAmount: number | null;
}

interface WbsRow {
  type: string;
  boqItemId: string | null;
  progressPct: number;
  plannedStart: Date | string | null;
  plannedEnd: Date | string | null;
}

interface MbRow {
  boqItemId: string;
  measuredQty: number;
  status: string;
}

interface DprRow {
  date: Date | string;
  progressPct: number;
}

const clamp01 = (n: number) => Math.min(Math.max(n, 0), 1);

export function deriveSitePour({
  boqItems,
  wbsNodes,
  mbEntries,
  dprs,
  cementQty,
}: {
  boqItems: BoqRow[];
  wbsNodes: WbsRow[];
  mbEntries: MbRow[];
  dprs: DprRow[];
  cementQty: number;
}): SitePourData | null {
  const bagsUsed = cementQty || 0;

  // Certified measurement — Σ APPROVED measured qty per item. Same rule the
  // WBS auto-progress (approveMbEntry) and EVM use: VERIFIED is not yet
  // billable, so it is not yet certified.
  const certified = new Map<string, number>();
  for (const m of mbEntries) {
    if (m.status !== "APPROVED") continue;
    certified.set(m.boqItemId, (certified.get(m.boqItemId) ?? 0) + m.measuredQty);
  }

  // Item → its linked WBS activity's reported progress.
  const wbsByItem = new Map<string, number>();
  for (const n of wbsNodes) {
    if (n.boqItemId) wbsByItem.set(n.boqItemId, Math.max(wbsByItem.get(n.boqItemId) ?? 0, n.progressPct));
  }

  // Project-wide fallback — duration-weighted leaf average (ACTIVITY /
  // SUB_ACTIVITY only; phase & root parents would double-count).
  const leaves = wbsNodes.filter((n) => n.type === "ACTIVITY" || n.type === "SUB_ACTIVITY");
  let wbsAvg: number | null = null;
  if (leaves.length > 0) {
    let num = 0;
    let den = 0;
    for (const n of leaves) {
      const s = n.plannedStart ? new Date(n.plannedStart).getTime() : NaN;
      const e = n.plannedEnd ? new Date(n.plannedEnd).getTime() : NaN;
      const days = Number.isFinite(s) && Number.isFinite(e) && e > s ? (e - s) / 86_400_000 : 1;
      num += n.progressPct * days;
      den += days;
    }
    wbsAvg = den > 0 ? num / den : null;
  }

  // Freshest field report.
  const dprLatest = dprs.length > 0
    ? dprs.reduce((a, b) => (new Date(a.date) > new Date(b.date) ? a : b)).progressPct
    : null;
  const reported = wbsAvg ?? dprLatest ?? 0;

  // ── Per-item blend over the BOQ (cost-weighted) ─────────────────────
  const weightOf = (b: BoqRow) =>
    b.estimatedAmount ?? ((b.estimatedQty ?? 0) * (b.rate ?? 1) || b.estimatedQty || 0);
  let progress: number | null = null;
  let source: SitePourSource = "none";
  let certifiedShare = 0;

  const totalW = boqItems.reduce((s, b) => s + weightOf(b), 0);
  if (totalW > 0) {
    let done = 0;
    let certW = 0;
    for (const b of boqItems) {
      const w = weightOf(b);
      const cum = certified.get(b.id);
      if (cum != null && b.estimatedQty) {
        done += Math.min(cum / b.estimatedQty, 1) * 100 * w;
        certW += w;
        continue;
      }
      const itemPct = wbsByItem.get(b.id) ?? reported;
      done += itemPct * w;
    }
    progress = done / totalW / 100;
    certifiedShare = certW / totalW;
    source = certified.size > 0 ? "mb" : wbsAvg != null || wbsByItem.size > 0 ? "wbs" : dprLatest != null ? "dpr" : "none";
  } else if (wbsAvg != null) {
    progress = wbsAvg / 100;
    source = "wbs";
  } else if (dprLatest != null) {
    progress = dprLatest / 100;
    source = "dpr";
  }

  if (progress == null && bagsUsed <= 0) return null;
  return { progress: clamp01(progress ?? 0), bagsUsed, source, certifiedShare };
}

// ── "When will it be complete?" ───────────────────────────────────────

const DAY = 86_400_000;
const PACE_WINDOW_DAYS = 30;

export interface SiteSchedule {
  /** % the plan says should be done by today (linear start→end), 0–1. */
  plannedProgress: number | null;
  plannedEnd: string | null;
  /** Finish date at the recent pace, or null when there is no pace yet. */
  forecastEnd: string | null;
  /** forecastEnd − plannedEnd in whole days; positive = late. */
  daysLate: number | null;
}

/**
 * Forecast finish from the recent pace of DPR progress (last 30 days, or
 * the whole history when shorter), projected from today's best progress.
 * Planned progress is the straight line from project start to end.
 */
export function forecastFinish({
  progress,
  history,
  plannedStart,
  plannedEnd,
  today = new Date(),
}: {
  progress: number;
  history: { date: Date | string; progressPct: number }[];
  plannedStart: Date | string | null;
  plannedEnd: Date | string | null;
  today?: Date;
}): SiteSchedule {
  const now = today.getTime();
  const start = plannedStart ? new Date(plannedStart).getTime() : NaN;
  const end = plannedEnd ? new Date(plannedEnd).getTime() : NaN;
  const plannedProgress = Number.isFinite(start) && Number.isFinite(end) && end > start
    ? clamp01((now - start) / (end - start))
    : null;

  let forecast: number | null = null;
  if (progress >= 1) {
    forecast = now;
  } else {
    const pts = history
      .map((h) => ({ t: new Date(h.date).getTime(), p: h.progressPct / 100 }))
      .filter((h) => Number.isFinite(h.t))
      .sort((a, b) => a.t - b.t);
    if (pts.length >= 2) {
      const last = pts[pts.length - 1]!;
      const from = pts.find((h) => h.t >= last.t - PACE_WINDOW_DAYS * DAY) ?? pts[0]!;
      const days = (last.t - from.t) / DAY;
      const perDay = days > 0 ? (last.p - from.p) / days : 0;
      if (perDay > 0) forecast = now + ((1 - progress) / perDay) * DAY;
    }
  }

  return {
    plannedProgress,
    plannedEnd: Number.isFinite(end) ? new Date(end).toISOString() : null,
    forecastEnd: forecast != null ? new Date(forecast).toISOString() : null,
    daysLate: forecast != null && Number.isFinite(end) ? Math.round((forecast - end) / DAY) : null,
  };
}

export type SiteProgress = SitePourData & { schedule: SiteSchedule; demands: SiteDemands };

// ── "When does the next payment get demanded?" ──────────────────────────

export interface SiteDemands {
  /** The pending CLP milestone closest to completion. */
  next: { milestone: string; progressPct: number; amount: number; buyers: number } | null;
  /** Installments already demanded (DUE / PARTIAL) and still unpaid. */
  awaiting: { amount: number; buyers: number };
}

export function summarizeDemands(items: {
  status: string;
  totalAmount: number;
  paidAmount: number;
  assetSaleId: string;
  wbsNodeId: string | null;
  milestone: string | null;
  milestoneProgress: number | null;
}[]): SiteDemands {
  const open = (i: { totalAmount: number; paidAmount: number }) => Math.max(i.totalAmount - i.paidAmount, 0);

  const awaitingItems = items.filter((i) => i.status === "DUE" || i.status === "PARTIAL");
  const awaiting = {
    amount: awaitingItems.reduce((s, i) => s + open(i), 0),
    buyers: new Set(awaitingItems.map((i) => i.assetSaleId)).size,
  };

  const byNode = new Map<string, { milestone: string; progressPct: number; amount: number; sales: Set<string> }>();
  for (const i of items) {
    if (i.status !== "PENDING" || !i.wbsNodeId) continue;
    const g = byNode.get(i.wbsNodeId) ?? {
      milestone: i.milestone ?? "Next milestone",
      progressPct: i.milestoneProgress ?? 0,
      amount: 0,
      sales: new Set<string>(),
    };
    g.amount += open(i);
    g.sales.add(i.assetSaleId);
    byNode.set(i.wbsNodeId, g);
  }
  const nearest = [...byNode.values()].sort((a, b) => b.progressPct - a.progressPct)[0];
  return {
    next: nearest
      ? { milestone: nearest.milestone, progressPct: nearest.progressPct, amount: nearest.amount, buyers: nearest.sales.size }
      : null,
    awaiting,
  };
}
