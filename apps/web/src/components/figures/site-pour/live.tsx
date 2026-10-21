"use client";

// The wet pour band. Two modes:
//   - target mode (progress prop): eases from 0 → the real progress once,
//     then holds — a gauge, not a clock. The band's position IS the DPR
//     number; bags comes from the cement actually issued to the project.
//   - loop mode (no progress): the canned pour cycles for surfaces with no
//     data (public empty states).
// Reduced motion → the band rests at its target, no sweep.

import { useRef } from "react";
import { Solid } from "@/components/iso/react/draw";
import { useInView, useLoop, useReadout } from "@/components/iso/react/live";
import type { SolidPaths } from "@/components/iso/iso-kit";
import { pouredBayAt, pourBandAt } from "./geometry";
import { POUR_BAYS, POUR_PERIOD_S, POUR_REST, pourAt, pourForProgress, readoutOf } from "./view";

const REACH_S = 2.2; // seconds for the one-shot catch-up sweep

export function SitePourLive({ restPaths, progress, bagsUsed }: {
  restPaths: SolidPaths;
  /** 0–1 — cumulative pour progress (DPR/WBS). Omit for the loop mode. */
  progress?: number;
  /** Real cement bags issued — shown instead of the model's estimate. */
  bagsUsed?: number;
}) {
  const bandRef = useRef<SVGGElement | null>(null);
  const { anchor, say } = useReadout<SVGGElement>();
  const inView = useInView(anchor);
  const elapsed = useRef(0);

  useLoop((dt, calm) => {
    const live = bandRef.current;
    if (!live) return inView;

    let bay: number, within: number, bags: number, done = false;
    if (progress != null) {
      // One-shot catch-up: sweep 0 → progress over REACH_S, then hold.
      elapsed.current = calm ? REACH_S : Math.min(elapsed.current + dt, REACH_S);
      const eased = 1 - Math.pow(1 - elapsed.current / REACH_S, 3);
      const p = pourForProgress(eased * progress);
      ({ bay, within } = p);
      bags = bagsUsed ?? Math.round((bay + within) * 7 * 10) / 10;
      done = elapsed.current >= REACH_S;
    } else {
      const p = pourAt((performance.now() / 1000) % POUR_PERIOD_S);
      ({ bay, within, bags } = p);
    }

    const paths = pourBandAt(bay, within);
    live.querySelectorAll("path").forEach((el, i) => {
      const next =
        i === 0 ? paths.fill
        : i === paths.shades.length + 1 ? paths.top
        : i === paths.shades.length + 2 ? paths.outline
        : paths.shades[i - 1];
      if (next != null) el.setAttribute("d", next);
    });
    const bayCount = Math.min(bay, POUR_BAYS - 1);
    live.parentElement?.querySelectorAll("[data-bay]").forEach((el) => {
      const b = Number(el.getAttribute("data-bay"));
      (el as SVGElement).style.display = b < bayCount ? "" : "none";
    });
    say(readoutOf({ bay, within, bags }));
    return progress == null ? inView : inView && !done;
  }, inView);

  return (
    <g ref={anchor} aria-hidden="true">
      {/* pre-cast bays, toggled as the pour passes them */}
      {[0, 1, 2].map((b) => (
        <g key={b} className="set-pour" data-bay={b} style={{ display: b < POUR_REST.bay ? "" : "none" }}>
          <Solid paths={pouredBayAt(b)} tone="mid" />
        </g>
      ))}
      {/* the moving wet band — ref-updated, no React render per frame.
          .wet-pour is the one accent the eye follows. */}
      <g className="iso-solid wet-pour" ref={bandRef}>
        <path className="iso-fill" d={restPaths.fill} />
        {restPaths.shades.map((d, i) => (d ? <path key={i} className="iso-shade" data-shade={i} d={d} /> : null))}
        <path className="iso-top" d={restPaths.top} />
        <path className="iso-line" data-tone="hi" d={restPaths.outline} fill="none" />
      </g>
    </g>
  );
}
