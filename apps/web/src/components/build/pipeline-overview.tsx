"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { ChevronRight, Pin, PinOff, X, Columns2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types (shared between Server and Client) ────────────────────────

export type StageItemData = {
  label: string;
  href: string;
  hint: string;
  count?: number;
  tone?: "default" | "warning" | "danger" | "success";
};

export type StageData = {
  key: string;
  label: string;
  tagline: string;
  metric: {
    label: string;
    value: string;
    sub?: string;
    tone?: "default" | "warning" | "danger" | "success";
  };
  items: StageItemData[];
};

// ── Stage accent colours ─────────────────────────────────────────────
// Each stage gets a subtle left-border accent so the pipeline reads
// spatially even when collapsed — you know which stage you're looking at
// by colour alone.
const STAGE_ACCENTS: Record<string, string> = {
  acquire: "var(--color-world-inventory)",
  procure: "var(--color-world-inventory)",
  stock: "var(--color-world-inventory)",
  construct: "var(--color-world-inventory)",
  sell: "var(--color-world-inventory)",
};

// ── Component ────────────────────────────────────────────────────────

/**
 * PIPELINE OVERVIEW — the Build world's bird's-eye view.
 *
 * Five stages (Acquire → Procure → Stock → Construct → Sell) shown as
 * cards. Click a card to expand it — it grows to fill the main area,
 * the others shrink to a compact strip. Pin a second card to split the
 * screen 50/50 for cross-stage comparison.
 *
 * Three interaction modes:
 *  1. Default — all cards equal width, showing icon + label + one metric.
 *  2. Expanded — one card fills ~65%, others collapse to a narrow rail.
 *  3. Split — two cards pinned side-by-side at 50/50.
 *
 * On mobile (below lg), this degrades to a vertical accordion — no
 * split view, just expand/collapse.
 */
export function PipelineOverview({ stages }: { stages: StageData[] }) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [pinnedKey, setPinnedKey] = useState<string | null>(null);
  const [splitMode, setSplitMode] = useState(false);

  const handleCardClick = useCallback(
    (key: string) => {
      if (splitMode) {
        // In split mode, clicking sets the "active" expanded card
        // (the one that has focus). The pinned card stays pinned.
        if (key === pinnedKey) return;
        setExpandedKey(key);
      } else {
        // Normal mode: toggle expand
        setExpandedKey((prev) => (prev === key ? null : key));
      }
    },
    [splitMode, pinnedKey],
  );

  const handlePin = useCallback(
    (key: string) => {
      if (pinnedKey === key) {
        // Unpin → exit split mode
        setPinnedKey(null);
        setSplitMode(false);
        setExpandedKey(null);
      } else {
        // Pin this card and enter split mode
        setPinnedKey(key);
        setSplitMode(true);
        // If nothing was expanded, expand the first other card
        if (!expandedKey || expandedKey === key) {
          const other = stages.find((s) => s.key !== key);
          setExpandedKey(other?.key ?? null);
        }
      }
    },
    [pinnedKey, expandedKey, stages],
  );

  const handleExitSplit = useCallback(() => {
    setSplitMode(false);
    setPinnedKey(null);
    setExpandedKey(null);
  }, []);

  if (stages.length === 0) return null;

  // ── Split mode: two cards side by side ──────────────────────────
  if (splitMode && pinnedKey && expandedKey) {
    const pinnedStage = stages.find((s) => s.key === pinnedKey);
    const expandedStage = stages.find((s) => s.key === expandedKey);
    if (pinnedStage && expandedStage) {
      return (
        <div>
          {/* Split mode toolbar */}
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-label text-muted-foreground">
              <Columns2 className="size-3.5" />
              <span>Split view — {pinnedStage.label} &amp; {expandedStage.label}</span>
            </div>
            <button
              onClick={handleExitSplit}
              className="flex items-center gap-1 text-label text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-3.5" /> Exit split
            </button>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ExpandedStageCard stage={pinnedStage} pinned onPin={() => handlePin(pinnedKey)} />
            <ExpandedStageCard stage={expandedStage} onPin={() => handlePin(expandedKey)} />
          </div>

          {/* Collapsed rail of other stages */}
          {stages.length > 2 && (
            <div className="mt-4">
              <div className="mb-2 text-label text-muted-foreground/70">Other stages</div>
              <div className="flex flex-wrap gap-2">
                {stages
                  .filter((s) => s.key !== pinnedKey && s.key !== expandedKey)
                  .map((stage) => (
                    <CollapsedRailCard
                      key={stage.key}
                      stage={stage}
                      onClick={() => setExpandedKey(stage.key)}
                    />
                  ))}
              </div>
            </div>
          )}
        </div>
      );
    }
  }

  // ── Expanded mode: one card large, others in a rail ─────────────
  if (expandedKey) {
    const expandedStage = stages.find((s) => s.key === expandedKey);
    if (expandedStage) {
      const otherStages = stages.filter((s) => s.key !== expandedKey);
      return (
        <div className="grid gap-4 lg:grid-cols-[1fr_200px]">
          <ExpandedStageCard
            stage={expandedStage}
            onPin={() => handlePin(expandedKey)}
            onClose={() => setExpandedKey(null)}
          />
          <div className="flex flex-row gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
            {otherStages.map((stage) => (
              <CollapsedRailCard
                key={stage.key}
                stage={stage}
                onClick={() => setExpandedKey(stage.key)}
                active={false}
              />
            ))}
          </div>
        </div>
      );
    }
  }

  // ── Default mode: all cards equal ───────────────────────────────
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {stages.map((stage) => (
        <DefaultStageCard key={stage.key} stage={stage} onClick={() => handleCardClick(stage.key)} />
      ))}
    </div>
  );
}

// ── Default card (equal grid) ───────────────────────────────────────

function DefaultStageCard({ stage, onClick }: { stage: StageData; onClick: () => void }) {
  const accent = STAGE_ACCENTS[stage.key] ?? "var(--color-border)";
  return (
    <button
      onClick={onClick}
      className="group flex min-h-[180px] flex-col justify-between rounded-lg border border-border bg-card p-4 text-left transition-all hover:border-foreground/20 hover:shadow-sm"
      style={{ boxShadow: `inset 3px 0 0 ${accent}` }}
    >
      <div>
        <div className="text-section text-foreground">{stage.label}</div>
        <div className="mt-1 text-caption text-muted-foreground">{stage.tagline}</div>
      </div>
      <div className="mt-4">
        <div className="text-label text-muted-foreground/70">{stage.metric.label}</div>
        <div
          className={cn(
            "text-figure tnum",
            stage.metric.tone === "warning" && "text-warning",
            stage.metric.tone === "danger" && "text-danger",
            stage.metric.tone === "success" && "text-success",
            (!stage.metric.tone || stage.metric.tone === "default") && "text-foreground",
          )}
        >
          {stage.metric.value}
        </div>
        {stage.metric.sub && (
          <div className="mt-0.5 text-micro text-muted-foreground">{stage.metric.sub}</div>
        )}
      </div>
      <div className="mt-3 flex items-center gap-1 text-caption text-muted-foreground/50 transition-colors group-hover:text-brand">
        Expand <ChevronRight className="size-3 transition-transform group-hover:translate-x-0.5" />
      </div>
    </button>
  );
}

// ── Expanded card (full detail) ──────────────────────────────────────

function ExpandedStageCard({
  stage,
  pinned,
  onPin,
  onClose,
}: {
  stage: StageData;
  pinned?: boolean;
  onPin: () => void;
  onClose?: () => void;
}) {
  // When pinned, the pin button acts as unpin; when not pinned, it pins.
  const accent = STAGE_ACCENTS[stage.key] ?? "var(--color-border)";
  return (
    <div
      className="flex flex-col rounded-lg border border-border bg-card"
      style={{ boxShadow: `inset 3px 0 0 ${accent}` }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-border p-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-section text-foreground">{stage.label}</h3>
            {pinned && (
              <span className="flex items-center gap-1 rounded bg-brand-soft px-1.5 py-0.5 text-micro font-medium text-brand">
                <Pin className="size-2.5" /> Pinned
              </span>
            )}
          </div>
          <p className="mt-0.5 text-caption text-muted-foreground">{stage.tagline}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={onPin}
            title={pinned ? "Unpin" : "Pin for split view"}
            className={cn(
              "flex size-7 items-center justify-center rounded transition-colors",
              pinned
                ? "text-brand hover:bg-brand-soft"
                : "text-muted-foreground hover:bg-subtle hover:text-foreground",
            )}
          >
            {pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              title="Collapse"
              className="flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-subtle hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Metric strip */}
      <div className="flex items-baseline gap-4 border-b border-border px-4 py-3">
        <div>
          <div className="text-label text-muted-foreground/70">{stage.metric.label}</div>
          <div
            className={cn(
              "text-figure tnum",
              stage.metric.tone === "warning" && "text-warning",
              stage.metric.tone === "danger" && "text-danger",
              stage.metric.tone === "success" && "text-success",
              (!stage.metric.tone || stage.metric.tone === "default") && "text-foreground",
            )}
          >
            {stage.metric.value}
          </div>
        </div>
        {stage.metric.sub && (
          <div className="text-caption text-muted-foreground">{stage.metric.sub}</div>
        )}
      </div>

      {/* Items list */}
      <div className="divide-y divide-border">
        {stage.items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-subtle"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-body font-medium text-foreground">{item.label}</span>
                {item.count !== undefined && item.count > 0 && (
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-micro font-semibold tnum",
                      item.tone === "warning" && "bg-warning-soft text-warning",
                      item.tone === "danger" && "bg-danger-soft text-danger",
                      item.tone === "success" && "bg-success-soft text-success",
                      (!item.tone || item.tone === "default") && "bg-muted text-muted-foreground",
                    )}
                  >
                    {item.count}
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-caption text-muted-foreground">{item.hint}</div>
            </div>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-brand" />
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── Collapsed rail card (compact, in the side strip) ─────────────────

function CollapsedRailCard({
  stage,
  onClick,
  active,
}: {
  stage: StageData;
  onClick: () => void;
  active?: boolean;
}) {
  const accent = STAGE_ACCENTS[stage.key] ?? "var(--color-border)";
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex shrink-0 flex-col gap-1 rounded-md border border-border bg-card p-3 text-left transition-all hover:border-foreground/20 lg:w-full",
        active && "border-foreground/30 ring-1 ring-foreground/10",
      )}
      style={{ boxShadow: `inset 2px 0 0 ${accent}` }}
    >
      <div className="text-label font-medium text-foreground">{stage.label}</div>
      <div className="text-micro text-muted-foreground/70">{stage.metric.label}</div>
      <div
        className={cn(
          "text-body font-semibold tnum",
          stage.metric.tone === "warning" && "text-warning",
          stage.metric.tone === "danger" && "text-danger",
          stage.metric.tone === "success" && "text-success",
          (!stage.metric.tone || stage.metric.tone === "default") && "text-foreground",
        )}
      >
        {stage.metric.value}
      </div>
    </button>
  );
}
