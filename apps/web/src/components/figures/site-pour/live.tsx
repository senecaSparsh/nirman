"use client";

// The wet pour band: creeps bay→bay along the deck on an eased loop.
// The readout (bay + bags + %) comes from pourAt — the same model that
// moves the band, so the caption and the drawing never disagree.
// Reduced motion → the band rests mid-pour.

import { useRef } from "react";
import { Solid } from "@/components/iso/react/draw";
import { useInView, useLoop, useReadout } from "@/components/iso/react/live";
import type { SolidPaths } from "@/components/iso/iso-kit";
import { pouredBayAt, pourBandAt } from "./geometry";
import { POUR_BAYS, POUR_PERIOD_S, POUR_REST, pourAt, readoutOf } from "./view";

export function SitePourLive({ restPaths }: { restPaths: SolidPaths }) {
  const bandRef = useRef<SVGGElement | null>(null);
  const { anchor, say } = useReadout<SVGGElement>();
  const inView = useInView(anchor);

  useLoop((dt, calm) => {
    if (calm) return inView;
    const t = (performance.now() / 1000) % POUR_PERIOD_S;
    const { bay, within } = pourAt(t);
    const live = bandRef.current;
    if (!live) return inView;
    // Rebuild the band path at the current position — geometry is pure TS,
    // and only the moving part ships to the client.
    const paths = pourBandAt(bay, within);
    live.querySelectorAll("path").forEach((el, i) => {
      const next =
        i === 0 ? paths.fill
        : i === paths.shades.length + 1 ? paths.top
        : i === paths.shades.length + 2 ? paths.outline
        : paths.shades[i - 1];
      if (next != null) el.setAttribute("d", next);
    });
    // hide/show already-poured bays behind the band
    const bayCount = Math.min(bay, POUR_BAYS - 1);
    live.querySelectorAll("[data-bay]").forEach((el) => {
      const b = Number(el.getAttribute("data-bay"));
      (el as SVGElement).style.display = b < bayCount ? "" : "none";
    });
    say(readoutOf(pourAt(t)));
    return inView;
  }, inView);

  return (
    <g ref={wrap} aria-hidden="true">
      {/* pre-cast bays, toggled as the pour passes them */}
      {[0, 1, 2].map((b) => (
        <g key={b} className="set-pour" data-bay={b} style={{ display: b < POUR_REST.bay ? "" : "none" }}>
          <Solid paths={pouredBayAt(b)} tone="mid" />
        </g>
      ))}
      {/* the moving wet band — ref-updated, no React render per frame.
          iso-solid + data-lit makes it the one accent the eye follows. */}
      <g className="iso-solid wet-pour" ref={bandRef}>
        <path className="iso-fill" d={restPaths.fill} />
        {restPaths.shades.map((d, i) => (d ? <path key={i} className="iso-shade" data-shade={i} d={d} /> : null))}
        <path className="iso-top" d={restPaths.top} />
        <path className="iso-line" data-tone="hi" d={restPaths.outline} fill="none" />
      </g>
    </g>
  );
}
