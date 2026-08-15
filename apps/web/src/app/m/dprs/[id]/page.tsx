import { Suspense } from "react";
import Link from "next/link";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { Cloud, Hammer, Users, AlertTriangle, CheckCircle2, XCircle, Printer } from "lucide-react";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatDate, formatNumber, formatCurrency } from "@/lib/utils";
import { MobileEmptyState } from "@/components/mobile/v2/primitives";
import { MobileDprActions } from "./MobileDprActions";
import { MobileDprVarianceButton } from "./MobileDprVarianceButton";

export default function MobileDprDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileDprDetailContent params={params} />
    </Suspense>
  );
}

async function MobileDprDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const { id } = await params;

  const dpr = await prisma.dailyProgressReport.findFirst({
    where: { id, project: { companyId: company.id } },
    include: {
      project: { select: { id: true, name: true } },
      submittedBy: { select: { id: true, name: true } },
      subAdminApprovedBy: { select: { name: true } },
      adminApprovedBy: { select: { name: true } },
      materialLines: {
        include: { material: { select: { name: true, unit: true, code: true } } },
      },
      laborLines: {
        include: {
          employee: { select: { name: true } },
          crew: { select: { name: true } },
        },
      },
    },
  });

  if (!dpr) {
    return (
      <div>
        <div className="mb-4">
        </div>
        <MobileEmptyState icon={Hammer} title="Daily Progress Report not found" />
      </div>
    );
  }

  const canApproveSubAdmin = hasPermission(role, PERM.DPR_APPROVE_SUB_ADMIN);
  const canApproveAdmin = hasPermission(role, PERM.DPR_APPROVE_ADMIN);
  const canResubmit = hasPermission(role, PERM.DPR_SUBMIT);

  const status =
    dpr.approvalStatus === "SUBMITTED" ? "submitted" :
    dpr.approvalStatus === "SUB_ADMIN_APPROVED" ? "subAdmin" :
    dpr.approvalStatus === "APPROVED" ? "approved" :
    dpr.approvalStatus === "REJECTED" ? "rejected" : "submitted";

  const statusColor =
    status === "approved" ? "var(--color-go)" :
    status === "subAdmin" ? "var(--color-steel)" :
    status === "rejected" ? "var(--color-stop)" :
    "var(--color-signal)";

  const pct = Math.min(toNum(dpr.progressPct), 100);

  // Totals
  const totalMaterialCost = dpr.materialLines.reduce(
    (s, l) => s + toNum(l.qty) * toNum(l.unitCost), 0,
  );
  const totalHours = dpr.laborLines.reduce((s, l) => s + toNum(l.hoursWorked), 0);

  // Approval step info
  const steps = [
    {
      label: "Submitted",
      done: true,
      date: formatDate(dpr.date),
      person: dpr.submittedBy?.name ?? "—",
    },
    {
      label: "Sub-Admin",
      done: status === "subAdmin" || status === "approved",
      date: dpr.subAdminApprovedAt ? formatDate(dpr.subAdminApprovedAt) : null,
      person: dpr.subAdminApprovedBy?.name ?? null,
    },
    {
      label: "Admin",
      done: status === "approved",
      date: dpr.adminApprovedAt ? formatDate(dpr.adminApprovedAt) : null,
      person: dpr.adminApprovedBy?.name ?? null,
    },
  ];

  return (
    <div>
      {/* ── Back + Print ── */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <a
          href={`/api/dprs/${dpr.id}/print`}
          className="flex items-center gap-1 text-[0.6875rem] font-semibold px-2.5 py-1 rounded-[0.5rem] border press"
          style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)", backgroundColor: "var(--color-paper)" }}
        >
          <Printer className="size-3.5" />
          Print
        </a>
      </div>

      {/* ── Report header banner ── */}
      <div
        className="rounded-[0.75rem] overflow-hidden mb-4"
        style={{ backgroundColor: "var(--color-paper)", border: "1px solid var(--color-line)" }}
      >
        {/* Color strip */}
        <div className="h-1 w-full" style={{ backgroundColor: statusColor }} />

        <div className="flex items-start gap-3 p-3.5">
          {/* Left: date + project + badges */}
          <div className="min-w-0 flex-1">
            <h1 className="text-[1.25rem] font-bold leading-tight" style={{ color: "var(--color-ink-950)" }}>
              {formatDate(dpr.date)}
            </h1>
            <Link
              href={`/m/projects/${dpr.project.id}`}
              className="text-[0.75rem] font-semibold block mt-0.5 hover:underline"
              style={{ color: "var(--color-ink-700)" }}
            >
              {dpr.project.name}
            </Link>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {dpr.workType ? (
                <span
                  className="text-[0.5625rem] font-bold uppercase px-2 py-0.5 rounded-[0.25rem]"
                  style={{ backgroundColor: "var(--color-concrete)", color: "var(--color-ink-700)" }}
                >
                  {dpr.workType}
                </span>
              ) : null}
              {dpr.weather ? (
                <span
                  className="text-[0.5625rem] font-semibold px-2 py-0.5 rounded-[0.25rem] flex items-center gap-1"
                  style={{ backgroundColor: "var(--color-concrete)", color: "var(--color-ink-500)" }}
                >
                  <Cloud className="size-2.5" />
                  {dpr.weather}
                </span>
              ) : null}
              <span
                className="text-[0.5625rem] font-bold uppercase px-2 py-0.5 rounded-[0.25rem]"
                style={{ backgroundColor: statusColor, color: "#fff" }}
              >
                {dpr.approvalStatus.replace(/_/g, " ")}
              </span>
            </div>
            <p className="text-[0.5625rem] mt-1.5" style={{ color: "var(--color-ink-500)" }}>
              By {dpr.submittedBy?.name ?? "—"}
            </p>
          </div>

          {/* Right: large progress ring */}
          <div className="shrink-0">
            <ProgressRingLarge pct={pct} color={status === "rejected" ? "var(--color-stop)" : statusColor} />
          </div>
        </div>
      </div>

      {/* ── Narrative section ── */}
      {dpr.workSummary ? (
        <div className="mb-4">
          <p className="text-[0.5625rem] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--color-steel)" }}>
            Work Summary
          </p>
          <p className="text-[0.8125rem] leading-relaxed" style={{ color: "var(--color-ink-900)" }}>
            {dpr.workSummary}
          </p>
        </div>
      ) : null}

      {dpr.blockers ? (
        <div
          className="rounded-[0.5rem] p-3 mb-4 flex items-start gap-2"
          style={{ backgroundColor: "color-mix(in srgb, var(--color-stop) 8%, transparent)" }}
        >
          <AlertTriangle className="size-4 shrink-0 mt-0.5" style={{ color: "var(--color-stop)" }} />
          <div>
            <p className="text-[0.5625rem] font-bold uppercase tracking-wider mb-0.5" style={{ color: "var(--color-stop)" }}>
              Blockers
            </p>
            <p className="text-[0.75rem]" style={{ color: "var(--color-ink-900)" }}>
              {dpr.blockers}
            </p>
          </div>
        </div>
      ) : null}

      {dpr.tomorrowPlan ? (
        <div
          className="rounded-[0.5rem] p-3 mb-4"
          style={{ backgroundColor: "var(--color-paper-2)" }}
        >
          <p className="text-[0.5625rem] font-bold uppercase tracking-wider mb-0.5" style={{ color: "var(--color-steel)" }}>
            Tomorrow&apos;s Plan
          </p>
          <p className="text-[0.75rem]" style={{ color: "var(--color-ink-700)" }}>
            {dpr.tomorrowPlan}
          </p>
        </div>
      ) : null}

      {/* ── Two-column data: Materials + Labor ── */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        {/* Materials */}
        <div
          className="rounded-[0.625rem] border overflow-hidden"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <div className="flex items-center gap-1.5 px-2.5 py-2 border-b" style={{ borderColor: "var(--color-line)" }}>
            <Hammer className="size-3" style={{ color: "var(--color-steel)" }} />
            <span className="text-[0.5625rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-steel)" }}>
              Materials
            </span>
          </div>
          {dpr.materialLines.length === 0 ? (
            <p className="text-[0.5625rem] p-2.5" style={{ color: "var(--color-ink-400)" }}>
              None recorded
            </p>
          ) : (
            <div>
              {dpr.materialLines.map((ml, i) => (
                <div
                  key={ml.id}
                  className="px-2.5 py-1.5"
                  style={i > 0 ? { borderTop: "1px solid var(--color-line)" } : undefined}
                >
                  <p className="text-[0.625rem] font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
                    {ml.material.name}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-[0.5rem] tabular-nums" style={{ color: "var(--color-ink-500)" }}>
                      {formatNumber(toNum(ml.qty), 0)} {ml.material.unit}
                    </span>
                    <span className="text-[0.5rem] tabular-nums font-semibold" style={{ color: "var(--color-ink-700)" }}>
                      {formatCurrency(toNum(ml.qty) * toNum(ml.unitCost))}
                    </span>
                  </div>
                </div>
              ))}
              <div
                className="px-2.5 py-1.5 flex items-center justify-between"
                style={{ borderTop: "1px solid var(--color-line)" }}
              >
                <span className="text-[0.5rem] font-bold uppercase" style={{ color: "var(--color-ink-500)" }}>
                  Total
                </span>
                <span className="text-[0.5625rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                  {formatCurrency(totalMaterialCost)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Labor */}
        <div
          className="rounded-[0.625rem] border overflow-hidden"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <div className="flex items-center gap-1.5 px-2.5 py-2 border-b" style={{ borderColor: "var(--color-line)" }}>
            <Users className="size-3" style={{ color: "var(--color-steel)" }} />
            <span className="text-[0.5625rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-steel)" }}>
              Labor
            </span>
          </div>
          {dpr.laborLines.length === 0 ? (
            <p className="text-[0.5625rem] p-2.5" style={{ color: "var(--color-ink-400)" }}>
              None recorded
            </p>
          ) : (
            <div>
              {dpr.laborLines.map((ll, i) => (
                <div
                  key={ll.id}
                  className="px-2.5 py-1.5"
                  style={i > 0 ? { borderTop: "1px solid var(--color-line)" } : undefined}
                >
                  <p className="text-[0.625rem] font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
                    {ll.taskDescription}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-[0.5rem] truncate" style={{ color: "var(--color-ink-500)" }}>
                      {ll.employee?.name ?? ll.crew?.name ?? "—"}
                    </span>
                    <span className="text-[0.5rem] tabular-nums font-semibold" style={{ color: "var(--color-ink-700)" }}>
                      {formatNumber(toNum(ll.hoursWorked), 1)}h
                    </span>
                  </div>
                </div>
              ))}
              <div
                className="px-2.5 py-1.5 flex items-center justify-between"
                style={{ borderTop: "1px solid var(--color-line)" }}
              >
                <span className="text-[0.5rem] font-bold uppercase" style={{ color: "var(--color-ink-500)" }}>
                  Total
                </span>
                <span className="text-[0.5625rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                  {formatNumber(totalHours, 1)}h
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Variance analysis trigger ── */}
      <MobileDprVarianceButton
        dprId={dpr.id}
        hasWorkType={!!dpr.workType}
        hasVariance={!!dpr.varianceAnalysis}
        canRun={canResubmit || canApproveSubAdmin || canApproveAdmin}
      />

      {/* ── Variance analysis (if present) ── */}
      {dpr.varianceAnalysis ? (
        <div
          className="rounded-[0.5rem] p-3 mb-4 flex items-start gap-2"
          style={{ backgroundColor: "color-mix(in srgb, var(--color-signal) 8%, transparent)" }}
        >
          <AlertTriangle className="size-4 shrink-0 mt-0.5" style={{ color: "var(--color-signal)" }} />
          <div>
            <p className="text-[0.5625rem] font-bold uppercase tracking-wider mb-0.5" style={{ color: "var(--color-signal)" }}>
              Variance Analysis
            </p>
            <p className="text-[0.6875rem]" style={{ color: "var(--color-ink-700)" }}>
              {typeof dpr.varianceAnalysis === "string"
                ? dpr.varianceAnalysis
                : "Over-consumption detected — see details"}
            </p>
          </div>
        </div>
      ) : null}

      {/* ── Approval trail — horizontal stepper ── */}
      <div className="mb-4">
        <p className="text-[0.5625rem] font-bold uppercase tracking-wider mb-3" style={{ color: "var(--color-steel)" }}>
          Approval Trail
        </p>
        <div className="flex items-start">
          {steps.map((step, i) => (
            <div key={step.label} className="flex items-start flex-1 last:flex-none">
              {/* Step node */}
              <div className="flex flex-col items-center gap-1 w-16 shrink-0">
                <div
                  className="w-7 h-7 rounded-full grid place-items-center border-2"
                  style={{
                    backgroundColor: step.done ? statusColor : "var(--color-paper)",
                    borderColor: step.done ? statusColor : "var(--color-line)",
                  }}
                >
                  {step.done ? (
                    status === "rejected" && i > 0 ? (
                      <XCircle className="size-3.5" style={{ color: "#fff" }} />
                    ) : (
                      <CheckCircle2 className="size-3.5" style={{ color: "#fff" }} />
                    )
                  ) : (
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "var(--color-line)" }} />
                  )}
                </div>
                <span
                  className="text-[0.5rem] font-bold text-center"
                  style={{ color: step.done ? "var(--color-ink-950)" : "var(--color-ink-400)" }}
                >
                  {step.label}
                </span>
                {step.done && step.person ? (
                  <span className="text-[0.4375rem] text-center truncate w-full" style={{ color: "var(--color-ink-500)" }}>
                    {step.person}
                  </span>
                ) : null}
                {step.done && step.date ? (
                  <span className="text-[0.4375rem] text-center" style={{ color: "var(--color-ink-400)" }}>
                    {step.date}
                  </span>
                ) : null}
              </div>
              {/* Connector */}
              {i < steps.length - 1 ? (
                <div
                  className="h-0.5 flex-1 mt-3.5 rounded-full"
                  style={{
                    backgroundColor: steps[i + 1]?.done ? statusColor : "var(--color-line)",
                  }}
                />
              ) : null}
            </div>
          ))}
        </div>
        {status === "rejected" && dpr.approvalNotes ? (
          <div
            className="rounded-[0.5rem] p-2.5 mt-3"
            style={{ backgroundColor: "color-mix(in srgb, var(--color-stop) 8%, transparent)" }}
          >
            <p className="text-[0.625rem] font-semibold" style={{ color: "var(--color-stop)" }}>
              {dpr.approvalNotes}
            </p>
          </div>
        ) : null}
      </div>

      {/* ── Sticky bottom action bar ── */}
      <MobileDprActions
        dprId={dpr.id}
        status={dpr.approvalStatus}
        canApproveSubAdmin={canApproveSubAdmin}
        canApproveAdmin={canApproveAdmin}
        canResubmit={canResubmit}
      />
    </div>
  );
}

/* ── Large progress ring for header ── */
function ProgressRingLarge({ pct, color }: { pct: number; color: string }) {
  const size = 64;
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--color-concrete)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="central"
        className="rotate-90"
        style={{
          transformOrigin: "center",
          fontSize: "16px",
          fontWeight: 700,
          fill: "var(--color-ink-950)",
          fontFamily: "system-ui",
        }}
      >
        {Math.round(pct)}%
      </text>
    </svg>
  );
}
