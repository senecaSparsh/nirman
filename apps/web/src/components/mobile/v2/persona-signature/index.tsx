"use client";

import * as React from "react";
import type { Persona } from "@/lib/mobile-nav-v2";
import { useFetch } from "@/lib/use-fetch";
import { SignatureSkeleton } from "./shared";
import { ShiftRail, type ShiftData } from "./shift-rail";
import { ProjectPulse, type PulseData } from "./project-pulse";
import { PipelineFlow, type PipelineData } from "./pipeline-flow";
import { DealFunnel, type FunnelData } from "./deal-funnel";
import { CashPosition, type CashData } from "./cash-position";
import { MusterRing, type MusterData } from "./muster-ring";

/* ═══════════════════════════════════════════════════════════════════════════
   PERSONA SIGNATURE — dispatcher

   One fetch, one switch. Each persona renders the component whose
   organising axis matches how that role reasons (see ./shared.tsx for the
   full rationale). The executive is absent by design: it renders the
   OrbitNavigator, which owns its own hierarchy endpoint.
   ═══════════════════════════════════════════════════════════════════════════ */

type SignaturePayload = {
  persona: Persona;
  shift?: ShiftData;
  pulse?: PulseData;
  pipeline?: PipelineData;
  funnel?: FunnelData;
  cash?: CashData;
  muster?: MusterData;
};

export function PersonaSignature({ persona }: { persona: Persona }) {
  // Executive never reaches here, but guard anyway so a mis-wire renders
  // nothing rather than an empty card.
  const skip = persona === "executive";
  const { data, loading, error } = useFetch<SignaturePayload>(
    skip ? null : "/api/persona-home",
  );

  if (skip) return null;
  if (loading) return <SignatureSkeleton />;
  // A dashboard that can't load is not worth an error card on the home
  // page — the briefing above it still works, so fail quiet.
  if (error || !data) return null;

  switch (persona) {
    case "field":
      return data.shift ? <ShiftRail data={data.shift} /> : null;
    case "ops":
      return data.pulse ? <ProjectPulse data={data.pulse} /> : null;
    case "procurement":
      return data.pipeline ? <PipelineFlow data={data.pipeline} /> : null;
    case "sales":
      return data.funnel ? <DealFunnel data={data.funnel} /> : null;
    case "finance":
      return data.cash ? <CashPosition data={data.cash} /> : null;
    case "hr":
      return data.muster ? <MusterRing data={data.muster} /> : null;
    default:
      return null;
  }
}
