"use client";

import { useRouter } from "next/navigation";
import { MobileFab } from "@/components/mobile/v2/scaffold";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import { useFabModal } from "@/lib/use-fab-modal";
import { MobileDprForm } from "@/components/mobile/mobile-dpr-form";

/**
 * Client-side FAB + spring-from-FAB modal for submitting today's DPR.
 *
 * The DPRs list page is a Server Component, so the FAB + modal (which need
 * client hooks) live here. The server page fetches the form's reference data
 * (projects, employees, crews, materials, existing DPRs) and passes it in.
 */
export function MobileDprsFab({
  projects,
  employees,
  crews,
  materials,
  existingDprsByProject,
  yesterdayDprsByProject,
}: {
  projects: { id: string; name: string }[];
  employees: { id: string; name: string; trade: string | null }[];
  crews: { id: string; name: string }[];
  materials: { id: string; name: string; unit: string | null; standardCost: number }[];
  existingDprsByProject: Record<string, {
    id: string;
    projectId: string;
    date: string;
    weather: string | null;
    workSummary: string;
    workType: string | null;
    workQty: number | null;
    workUnit: string | null;
    progressPct: number;
    blockers: string | null;
    tomorrowPlan: string | null;
    notes: string | null;
    materialLines: { materialId: string; qty: number; unitCost: number }[];
    laborLines: { employeeId: string | null; crewId: string | null; hoursWorked: number; taskDescription: string }[];
  }>;
  yesterdayDprsByProject: Record<string, {
    workSummary: string;
    weather: string | null;
    materialLines: { materialId: string; qty: number; unitCost: number }[];
    laborLines: { employeeId: string | null; crewId: string | null; hoursWorked: number; taskDescription: string }[];
  }>;
}) {
  const fab = useFabModal();
  const router = useRouter();

  return (
    <>
      <MobileFab onClick={fab.toggle} isOpen={fab.isOpen} label="Add today's DPR" />
      <MobileFabModal
        open={fab.isOpen}
        onClose={fab.close}
        originRect={fab.originRect}
        title="Today's DPR"
      >
        <MobileDprForm
          projects={projects}
          employees={employees}
          crews={crews}
          materials={materials}
          existingDprsByProject={existingDprsByProject}
          yesterdayDprsByProject={yesterdayDprsByProject}
          onClose={fab.close}
          onCreated={() => {
            // Refresh server-rendered cache so the list shows the new DPR
            router.refresh();
          }}
        />
      </MobileFabModal>
    </>
  );
}
