"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { SitePourFigure } from "@/components/figures/site-pour/figure";
import type { SiteProgress } from "@/lib/site-pour";
import { formatCurrencyCompact } from "@/lib/utils";

const POLL_MS = 60_000;

const HINT: Record<string, string> = {
  mb: "Certified",
  wbs: "Schedule",
  dpr: "DPR",
  none: "The wet band advances on its own",
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

/**
 * Live site-progress card — the pour figure plus the three things an
 * owner asks of a site: how far along is it, when will it finish, and
 * which buyer payment does the next milestone unlock. Re-derived every
 * minute and on tab focus, so it moves as MB entries are approved, WBS
 * activities advance, DPRs land and cement is issued.
 */
export function SitePourLive({
  projectId,
  initial,
  title,
  className,
}: {
  projectId: string;
  initial: SiteProgress | null;
  title?: string;
  className?: string;
}) {
  const [data, setData] = useState(initial);
  const inflight = useRef(false);

  const refresh = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      const res = await fetch(`/api/projects/${projectId}/site-pour`, { cache: "no-store" });
      if (res.ok) {
        const body = await res.json();
        if (body.sitePour) setData(body.sitePour);
      }
    } catch {
      /* keep last good data — the card must never blank out on a blip */
    } finally {
      inflight.current = false;
    }
  }, [projectId]);

  useEffect(() => {
    const t = setInterval(refresh, POLL_MS);
    const onFocus = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  if (!data) return null;
  const { schedule, demands } = data;
  const pct = Math.round(data.progress * 100);
  const planned = schedule.plannedProgress != null ? Math.round(schedule.plannedProgress * 100) : null;
  const behind = planned != null && pct < planned;

  return (
    <div>
      <SitePourFigure
        progress={data.progress}
        bagsUsed={data.bagsUsed}
        title={title}
        className={className}
        hint={HINT[data.source] ?? HINT.none}
      />
      <dl className="divide-y divide-border border-t border-border text-sm">
        <div className="flex items-baseline justify-between gap-3 px-4 py-2.5">
          <dt className="text-muted-foreground">Work done</dt>
          <dd className="text-right tabular-nums">
            <span className="font-semibold">{pct}%</span>
            {planned != null && (
              <span className={behind ? "text-warning" : "text-muted-foreground"}> · plan {planned}% by today</span>
            )}
            {data.source === "mb" && data.certifiedShare > 0 && data.certifiedShare < 1 && (
              <span className="block text-xs text-muted-foreground">
                {Math.round(data.certifiedShare * 100)}% of it engineer-certified
              </span>
            )}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 px-4 py-2.5">
          <dt className="text-muted-foreground">Finish</dt>
          <dd className="text-right tabular-nums">
            {schedule.forecastEnd ? (
              <>
                ~{fmtDate(schedule.forecastEnd)}
                {schedule.daysLate != null && (
                  <span className={schedule.daysLate > 0 ? "text-destructive" : "text-success"}>
                    {" · "}
                    {schedule.daysLate > 0 ? `${schedule.daysLate} days late` : "on track"}
                  </span>
                )}
              </>
            ) : schedule.plannedEnd ? (
              <>
                <span className="block">Plan {fmtDate(schedule.plannedEnd)}</span>
                <span className="block text-xs text-muted-foreground">Forecast after 2+ DPRs</span>
              </>
            ) : (
              <span className="text-muted-foreground">Set a project end date to forecast</span>
            )}
          </dd>
        </div>
        {(demands.next || demands.awaiting.amount > 0) && (
          <div className="flex items-baseline justify-between gap-3 px-4 py-2.5">
            <dt className="text-muted-foreground">Buyer demands</dt>
            <dd className="text-right tabular-nums">
              {demands.next && (
                <span className="block">
                  Next: {demands.next.milestone} →{" "}
                  <span className="font-semibold">{formatCurrencyCompact(demands.next.amount)}</span>
                  {" "}from {demands.next.buyers} buyer{demands.next.buyers === 1 ? "" : "s"}
                </span>
              )}
              {demands.awaiting.amount > 0 && (
                <Link href="/reports/pending-payments" className="block text-xs text-warning hover:underline">
                  {formatCurrencyCompact(demands.awaiting.amount)} demanded, awaiting payment
                </Link>
              )}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}
