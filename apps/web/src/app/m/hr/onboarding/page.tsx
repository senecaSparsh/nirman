import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { UserPlus, ChevronRight, CheckCircle2, Circle } from "lucide-react";
import { getCompany, getUserRole, getUserScope } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import {
  MobileSectionTitle,
  MobileEmptyState,
} from "@/components/mobile/v2/primitives";

type ProgressStep = { label: string; done: boolean };
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
      payDay: true,
      userId: true,
      user: { select: { id: true, active: true, role: true } },
      activeProject: { select: { name: true } },
    },
  });

  // ── Compute onboarding progress for each employee ──
  const items: QueueItem[] = employees.map((e) => {
    const hasProfile = !!(e.name && (e.phone || e.user) && (e.designation || e.trade));
    const hasWage = e.wageType === "DAILY" ? (e.dailyRate?.toNumber() ?? 0) > 0 : (e.monthlySalary?.toNumber() ?? 0) > 0;
    const hasEmploymentTerms = !!(
      e.employmentType &&
      e.noticePeriodDays != null &&
      (e.employmentType !== "CONTRACT" || e.contractStartDate) &&
      (e.employmentType !== "PROBATION" || e.contractStartDate)
    );
    const hasAccount = !!e.userId;
    const agreementIssued = ["ISSUED", "CONFIRMED", "EXPIRED"].includes(e.contractStatus ?? "");
    const agreementConfirmed = ["CONFIRMED", "EXPIRED"].includes(e.contractStatus ?? "");
    const hasAutoDeposit = e.autoDepositEnabled === true;

    const steps = [
      { label: "Profile & Wage", done: hasProfile && hasWage },
      { label: "Employment Terms", done: hasEmploymentTerms },
      { label: "Login Account", done: hasAccount },
      { label: "Agreement Issued", done: agreementIssued },
      { label: "Agreement Confirmed", done: agreementConfirmed },
      { label: "Auto-Deposit", done: hasAutoDeposit },
    ];
    const completedCount = steps.filter((s) => s.done).length;

    return {
      id: e.id,
      name: e.name,
      trade: e.trade,
      designation: e.designation,
      active: e.active,
      activeProjectName: e.activeProject?.name ?? null,
      steps,
      completedCount,
      isComplete: completedCount === steps.length,
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
                  <OnboardingQueueCard key={item.id} item={item} />
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
                  <OnboardingQueueCard key={item.id} item={item} />
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
                  <OnboardingQueueCard key={item.id} item={item} />
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
}: {
  item: QueueItem;
}) {
  const pct = Math.round((item.completedCount / item.steps.length) * 100);

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

      {/* Progress bar */}
      <div
        className="h-1.5 rounded-full overflow-hidden mb-2"
        style={{ backgroundColor: "var(--color-concrete)" }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            backgroundColor: item.isComplete ? "var(--color-go)" : "var(--color-ink-950)",
            transition: "width 300ms cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        />
      </div>

      {/* Step dots — compact */}
      <div className="flex items-center gap-1">
        {item.steps.map((step, i) => (
          <div
            key={i}
            className="flex items-center gap-0.5"
            title={step.label}
          >
            {step.done ? (
              <CheckCircle2 className="size-3" style={{ color: "var(--color-go)" }} />
            ) : (
              <Circle className="size-3" style={{ color: "var(--color-ink-300)" }} />
            )}
            {i < item.steps.length - 1 && (
              <div className="w-2 h-px" style={{ backgroundColor: "var(--color-line)" }} />
            )}
          </div>
        ))}
      </div>
    </Link>
  );
}
