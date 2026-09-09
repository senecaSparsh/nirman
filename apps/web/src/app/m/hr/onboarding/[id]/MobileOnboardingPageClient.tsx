"use client";

import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { MobileOnboardingTab, type OnboardingEmployeeData } from "@/app/m/hr/employees/[id]/MobileOnboardingTab";

/**
 * Client wrapper for the per-employee onboarding workflow page.
 * Renders a back header + the MobileOnboardingTab component.
 */
export function MobileOnboardingPageClient({
  employee,
  canManage,
  canManagePayroll,
  actorRole,
  projects,
  stockLocations,
  departments,
}: {
  employee: OnboardingEmployeeData;
  canManage: boolean;
  canManagePayroll: boolean;
  actorRole: string;
  projects: { id: string; name: string }[];
  stockLocations: { id: string; name: string }[];
  departments: { id: string; name: string; active: boolean }[];
}) {
  return (
    <div className="pb-20">
      {/* ── Back header ── */}
      <div
        className="sticky top-0 z-30 flex items-center gap-2 px-3 py-2.5 border-b"
        style={{
          backgroundColor: "color-mix(in srgb, var(--color-paper) 88%, transparent)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          borderColor: "var(--color-line)",
        }}
      >
        <Link
          href="/m/hr/onboarding"
          className="flex items-center justify-center size-8 rounded-[0.375rem] press shrink-0"
          style={{ backgroundColor: "var(--color-concrete)", color: "var(--color-ink-700)" }}
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-m-label font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
            Onboarding
          </p>
          <p className="text-m-caption truncate" style={{ color: "var(--color-ink-500)" }}>
            {employee.name}
          </p>
        </div>
        <Link
          href={`/m/hr/employees/${employee.id}`}
          className="flex items-center gap-1 text-m-caption font-semibold press shrink-0 px-2 py-1 rounded-[0.375rem]"
          style={{ backgroundColor: "var(--color-concrete)", color: "var(--color-ink-600)" }}
        >
          Profile <ExternalLink className="size-3" />
        </Link>
      </div>

      {/* ── Onboarding workflow ── */}
      <div className="pt-3">
        <MobileOnboardingTab
          employee={employee}
          canManage={canManage}
          canManagePayroll={canManagePayroll}
          actorRole={actorRole}
          projects={projects}
          stockLocations={stockLocations}
          departments={departments}
          onEdit={() => {
            // Navigate to the employee detail page's edit sheet
            window.location.href = `/m/hr/employees/${employee.id}`;
          }}
        />
      </div>
    </div>
  );
}
