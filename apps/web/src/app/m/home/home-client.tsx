"use client";

import * as React from "react";
import { OrbitNavigator } from "@/components/mobile/v2/orbit-navigator";

/* ═══════════════════════════════════════════════════════════════════════════
   MOBILE HOME — Orbit Navigation Hub

   If the user has only 1 company: show the OrbitNavigator inline on the
   page (no popup) — the company is the center card with its orbit ring.
   If multiple companies: show a 3-col grid of company cards. Tapping one
   opens the OrbitNavigator as a full-screen popup.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface CompanyCardData {
  id: string;
  name: string;
  businessType: string | null;
  currency: string;
  projectCount: number;
  landCount: number;
  employeeCount: number;
}

export function MobileHomeClient({ companies }: { companies: CompanyCardData[] }) {
  const [popupNode, setPopupNode] = React.useState<{
    id: string;
    type: string;
    title: string;
    subtitle: string;
    meta: string;
  } | null>(null);

  // ── Single company: render orbit inline ──
  if (companies.length === 1) {
    const c = companies[0];
    if (!c) return null;
    return (
      <OrbitNavigator
        initialNode={{
          id: c.id,
          type: "company",
          title: c.name,
          subtitle: c.businessType ?? "Construction & Real Estate",
          meta: c.currency,
        }}
        inline={true}
        open={true}
      />
    );
  }

  // ── Multiple companies: grid + popup ──
  const openOrbit = (company: CompanyCardData) => {
    setPopupNode({
      id: company.id,
      type: "company",
      title: company.name,
      subtitle: company.businessType ?? "Construction & Real Estate",
      meta: company.currency,
    });
  };

  return (
    <div>
      <div className="grid grid-cols-3 gap-1.5 mb-3">
        {companies.map((c) => (
          <button
            key={c.id}
            onClick={() => openOrbit(c)}
            className="block rounded-[0.625rem] border overflow-hidden active:scale-[0.98] transition-transform press text-left"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          >
            <div
              className="aspect-square grid place-items-center relative"
              style={{ backgroundColor: "var(--color-paper-2)" }}
            >
              <span className="text-[1.5rem]">🏢</span>
              <span
                className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: "var(--color-go)" }}
              />
            </div>
            <div className="p-1.5">
              <p
                className="text-[0.5rem] font-semibold uppercase tracking-wide truncate"
                style={{ color: "var(--color-steel)" }}
              >
                {c.businessType ?? "Company"}
              </p>
              <p
                className="font-semibold text-[0.625rem] leading-snug mt-0.5 line-clamp-2 min-h-[2em]"
                style={{ color: "var(--color-ink-950)" }}
              >
                {c.name}
              </p>
              <div className="mt-1 flex items-baseline justify-between gap-1">
                <div className="min-w-0">
                  <p className="numeric text-[0.625rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
                    {c.projectCount} proj
                  </p>
                  <p className="numeric text-[0.5rem]" style={{ color: "var(--color-ink-500)" }}>
                    {c.employeeCount} staff
                  </p>
                </div>
                <span
                  className="text-[0.5rem] font-bold uppercase shrink-0"
                  style={{ color: "var(--color-go)" }}
                >
                  {c.currency}
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>

      <p className="text-center text-[0.5625rem] mb-4" style={{ color: "var(--color-ink-500)" }}>
        Tap a company to explore its projects, units, land, and more →
      </p>

      {popupNode && (
        <OrbitNavigator
          initialNode={popupNode}
          inline={false}
          open={true}
          onClose={() => setPopupNode(null)}
        />
      )}
    </div>
  );
}
