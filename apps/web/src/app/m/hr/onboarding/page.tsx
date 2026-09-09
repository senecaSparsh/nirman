import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { UserPlus, ChevronRight } from "lucide-react";
import { getCompany, getUserRole, getUserScope } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import {
  MobileSectionTitle,
  MobileEmptyState,
} from "@/components/mobile/v2/primitives";
import {
  OnboardingProgress,
  type OnboardingStep,
} from "@/components/mobile/v2/onboarding-progress";
import { buildOnboardingSteps } from "@/lib/onboarding-steps";

type ProgressStep = OnboardingStep;
interface QueueItem {
  id: string;
  name: string;
  trade: string | null;
  designation: string | null;
  active: boolean;
  activeProjectName: string | null;
  steps: ProgressStep[];
  completedCount: number;
  isComplete: boolean;
}

/**
 * /m/hr/onboarding — queue of all employees with their onboarding progress.
 * Shows who's fully onboarded, who's in progress, and who hasn't started.
 * Click an employee to open their onboarding workflow page.
 */
export default function MobileOnboardingQueuePage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={8} />}>
      <MobileOnboardingQueueContent />
    </Suspense>
  );
}

async function MobileOnboardingQueueContent() {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();

  if (!hasPermission(role, PERM.HR_VIEW)) {
    return (
      <div className="p-4 text-center">
        <p className="text-m-body" style={{ color: "var(--color-ink-500)" }}>You don&apos;t have access to the onboarding queue.</p>
      </div>
    );
  }

  const _canManage = hasPermission(role, PERM.HR_MANAGE);
  const scope = await getUserScope();
  // PROJECT-scoped users see only employees on their assigned sites.
  // A PROJECT-scoped user with no project assignments sees no employees.
  const employeeProjectFilter =
    scope.scopeType === "PROJECT"
      ? { activeProjectId: { in: scope.projectIds.length > 0 ? scope.projectIds : ["__none__"] } }
      : {};

  const employees = await prisma.employee.findMany({
    where: {
      companyId: company.id,
      deletedAt: null,
      ...employeeProjectFilter,
    },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    take: 200,
    select: {
      id: true,
      name: true,
      trade: true,
      designation: true,
      phone: true,
      email: true,
      active: true,
      joinDate: true,
      wageType: true,
      dailyRate: true,
      monthlySalary: true,
      employmentType: true,
      noticePeriodDays: true,
      contractStartDate: true,
      contractEndDate: true,
      probationEndDate: true,
      confirmationDate: true,
      contractStatus: true,
      autoDepositEnabled: true,
      documentsSubmitted: true,
      backgroundVerified: true,
      appointmentLetterStatus: true,
      offerLetterStatus: true,
      idCardStatus: true,
      payDay: true,
      userId: true,
      onboardingComplete: true,
      user: { select: { id: true, active: true, role: true } },
      activeProject: { select: { name: true } },
      salaryComponents: { where: { active: true }, select: { id: true } },
    },
  });

  // ── Compute onboarding progress for each employee ──
  // Uses the shared buildOnboardingSteps so "complete" means the same
  // thing on the queue, the detail tab, and the profile page.
  const items: QueueItem[] = employees.map((e) => {
    const { steps, completedCount } = buildOnboardingSteps({
      hasProfile: !!(e.name && (e.phone || e.user) && (e.designation || e.trade)),
      hasWage: e.wageType === "DAILY" ? (e.dailyRate?.toNumber() ?? 0) > 0 : (e.monthlySalary?.toNumber() ?? 0) > 0,
      hasEmploymentTerms: !!(
        e.employmentType &&
        e.noticePeriodDays != null &&
        (e.employmentType !== "CONTRACT" || e.contractStartDate) &&
        (e.employmentType !== "PROBATION" || e.contractStartDate)
      ),
      hasSalaryStructure: e.salaryComponents.length > 0,
      documentsSubmitted: e.documentsSubmitted === true,
      backgroundVerified: e.backgroundVerified === true,
      hasAccount: !!e.userId,
      offerLetterIssued: ["ISSUED", "CONFIRMED", "EXPIRED"].includes(e.offerLetterStatus ?? ""),
      agreementIssued: ["ISSUED", "CONFIRMED", "EXPIRED"].includes(e.contractStatus ?? ""),
      agreementConfirmed: ["CONFIRMED", "EXPIRED"].includes(e.contractStatus ?? ""),
      appointmentLetterIssued: ["ISSUED", "CONFIRMED", "EXPIRED"].includes(e.appointmentLetterStatus ?? ""),
      idCardIssued: ["ISSUED", "CONFIRMED", "EXPIRED"].includes(e.idCardStatus ?? ""),
      hasAutoDeposit: e.autoDepositEnabled === true,
    });

    return {
      id: e.id,
      name: e.name,
      trade: e.trade,
      designation: e.designation,
      active: e.active,
      activeProjectName: e.activeProject?.name ?? null,
      steps,
      completedCount,
      // ── Single source of truth: the DB field ──
      // autoCompleteOnboarding sets this when all 12 steps pass.
      // The manual complete-onboarding endpoint can also set it.
      // buildOnboardingSteps is only for showing progress (which steps are done).
      isComplete: e.onboardingComplete === true,
    };
  });

  // ── Group: Incomplete first, then complete ──
  const inProgress = items.filter((i) => !i.isComplete && i.active);
  const complete = items.filter((i) => i.isComplete && i.active);
  const inactive = items.filter((i) => !i.active);

  const totalComplete = complete.length;
  const totalInProgress = inProgress.length;

  return (
    <div className="pb-20">
      {/* ── Header ── */}
      <div className="px-4 pt-4 pb-2">
        <MobileSectionTitle>Onboarding</MobileSectionTitle>
        <p className="text-m-caption mt-1" style={{ color: "var(--color-ink-500)" }}>
          Hire → account → agreement → deposit → dossier → offboard
        </p>
      </div>

      {/* ── Summary stats ── */}
      <div className="px-4 pb-3">
        <div className="grid grid-cols-3 gap-2">
          <SummaryStat label="In Progress" value={totalInProgress} tone="signal" />
          <SummaryStat label="Complete" value={totalComplete} tone="go" />
          <SummaryStat label="Inactive" value={inactive.length} tone="neutral" />
        </div>
      </div>

      {items.length === 0 ? (
        <div className="px-4 pt-6">
          <MobileEmptyState
            icon={UserPlus}
            title="No employees yet"
            description="Create an employee to start the onboarding workflow."
            action={
              <Link
                href="/m/hr?tab=employees"
                className="inline-flex items-center justify-center rounded-[0.5rem] px-4 py-2.5 text-m-label font-bold press"
                style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
              >
                Go to Employees
              </Link>
            }
          />
        </div>
      ) : (
        <div className="px-4 space-y-4">
          {/* ── In Progress ── */}
          {inProgress.length > 0 && (
            <div>
              <p className="text-m-label font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--color-ink-400)" }}>
                In Progress ({inProgress.length})
              </p>
              <div className="space-y-2">
                {inProgress.map((item) => (
                  <OnboardingQueueCard key={item.id} item={item} canManage={_canManage} />
                ))}
              </div>
            </div>
          )}

          {/* ── Complete ── */}
          {complete.length > 0 && (
            <div>
              <p className="text-m-label font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--color-ink-400)" }}>
                Complete ({complete.length})
              </p>
              <div className="space-y-2">
                {complete.map((item) => (
                  <OnboardingQueueCard key={item.id} item={item} canManage={_canManage} />
                ))}
              </div>
            </div>
          )}

          {/* ── Inactive / Offboarded ── */}
          {inactive.length > 0 && (
            <div>
              <p className="text-m-label font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--color-ink-400)" }}>
                Inactive ({inactive.length})
              </p>
              <div className="space-y-2">
                {inactive.map((item) => (
                  <OnboardingQueueCard key={item.id} item={item} canManage={_canManage} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Summary stat card ── */
function SummaryStat({ label, value, tone }: { label: string; value: number; tone: "go" | "signal" | "neutral" }) {
  const colors = {
    go: { fg: "var(--color-go)", bg: "color-mix(in srgb, var(--color-go) 10%, transparent)" },
    signal: { fg: "var(--color-signal-dark)", bg: "color-mix(in srgb, var(--color-signal) 12%, transparent)" },
    neutral: { fg: "var(--color-ink-500)", bg: "var(--color-concrete)" },
  }[tone];

  return (
    <div
      className="rounded-[0.625rem] p-2.5 text-center"
      style={{ backgroundColor: colors.bg }}
    >
      <p className="text-m-body font-extrabold tabular-nums" style={{ color: colors.fg }}>
        {value}
      </p>
      <p className="text-m-label font-semibold uppercase tracking-wide mt-0.5" style={{ color: "var(--color-ink-500)" }}>
        {label}
      </p>
    </div>
  );
}

/* ── Queue card — shows employee + progress bar + step dots ── */
function OnboardingQueueCard({
  item,
  canManage,
}: {
  item: QueueItem;
  canManage: boolean;
}) {
  return (
    <Link
      href={`/m/hr/onboarding/${item.id}`}
      className="block rounded-[0.75rem] p-3 press"
      style={{
        backgroundColor: "var(--color-paper)",
        border: "1px solid var(--color-line)",
        opacity: item.active ? 1 : 0.6,
      }}
    >
      {/* Top row: name + progress count */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <p className="text-m-label font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
            {item.name}
          </p>
          <p className="text-m-caption truncate" style={{ color: "var(--color-ink-500)" }}>
            {item.designation ?? item.trade ?? "—"}
            {item.activeProjectName ? ` · ${item.activeProjectName}` : ""}
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-1.5">
          <span
            className="text-m-label font-bold tabular-nums"
            style={{ color: item.isComplete ? "var(--color-go)" : "var(--color-ink-500)" }}
          >
            {item.completedCount}/{item.steps.length}
          </span>
          <ChevronRight className="size-4" style={{ color: "var(--color-ink-400)" }} />
        </div>
      </div>

      {/* Progress bar + step dots (shared component, no card border) */}
      <OnboardingProgress
        steps={item.steps}
        completedCount={item.completedCount}
        isComplete={item.isComplete}
        canManage={canManage}
        employeeId={item.id}
        showCompleteButton={false}
        compact
        bare
      />
    </Link>
  );
}
