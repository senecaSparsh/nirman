"use client";

import { useState } from "react";
import { AlertTriangle, ShieldAlert, ClipboardCheck } from "lucide-react";
import { MobileIncidentList } from "./MobileIncidentList";
import { MobileHazardList } from "./MobileHazardList";
import { MobileInspectionList } from "./MobileInspectionList";
import { MobileIncidentFab } from "./MobileIncidentFab";
import { MobileHazardFab } from "./MobileHazardFab";
import { MobileInspectionFab } from "./MobileInspectionFab";

export type IncidentListItem = {
  id: string; incidentNumber: string; title: string; type: string; severity: string; status: string;
  projectName: string; location: string | null; injuredCount: number; fatalities: number; incidentDate: string;
};

export type HazardListItem = {
  id: string; hazardNumber: string; title: string; status: string; riskLevel: string;
  likelihood: number; severity: number; projectName: string; location: string | null;
  targetResolutionDate: string | null; createdAt: string;
};

export type InspectionListItem = {
  id: string; inspectionNumber: string; title: string; status: string; result: string | null;
  projectName: string; scheduledDate: string; conductedDate: string | null; inspectorName: string | null;
};

type Tab = "incidents" | "hazards" | "inspections";

const TABS: { value: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "incidents", label: "Incidents", icon: AlertTriangle },
  { value: "hazards", label: "Hazards", icon: ShieldAlert },
  { value: "inspections", label: "Inspections", icon: ClipboardCheck },
];

export function MobileSafetyContent({
  incidents,
  hazards,
  inspections,
  projects,
  canManage,
}: {
  incidents: IncidentListItem[];
  hazards: HazardListItem[];
  inspections: InspectionListItem[];
  projects: { id: string; name: string }[];
  canManage: boolean;
}) {
  const [tab, setTab] = useState<Tab>("incidents");

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 mb-4 rounded-[0.5rem] border p-1" style={{ borderColor: "var(--color-line)" }}>
        {TABS.map((t) => {
          const active = tab === t.value;
          const Icon = t.icon;
          const count = t.value === "incidents" ? incidents.length : t.value === "hazards" ? hazards.length : inspections.length;
          return (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-[0.375rem] text-[0.6875rem] font-bold transition-colors press"
              style={{
                backgroundColor: active ? "var(--color-ink-950)" : "transparent",
                color: active ? "#fff" : "var(--color-ink-500)",
              }}
            >
              <Icon className="size-3.5" />
              {t.label}
              {count > 0 && (
                <span
                  className="ml-0.5 px-1 rounded text-[0.5rem] tabular-nums"
                  style={{ backgroundColor: active ? "rgba(255,255,255,0.2)" : "var(--color-concrete)" }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {tab === "incidents" && <MobileIncidentList items={incidents} />}
      {tab === "hazards" && <MobileHazardList items={hazards} />}
      {tab === "inspections" && <MobileInspectionList items={inspections} />}

      {/* FABs */}
      {canManage && projects.length > 0 && (
        <>
          {tab === "incidents" && <MobileIncidentFab projects={projects} />}
          {tab === "hazards" && <MobileHazardFab projects={projects} />}
          {tab === "inspections" && <MobileInspectionFab projects={projects} />}
        </>
      )}
    </div>
  );
}
