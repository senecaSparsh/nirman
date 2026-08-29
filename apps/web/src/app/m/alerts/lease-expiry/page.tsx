import { Suspense } from "react";
import { connection } from "next/server";
import { leaseExpiryAlerts } from "@nirman/services";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { formatCurrency, formatDate } from "@/lib/utils";
import { AlertTriangle, Clock, CalendarClock } from "lucide-react";
import { MobileNoAccess } from "@/components/mobile/v2/primitives";

/**
 * /m/alerts/lease-expiry — mobile lease expiry alerts.
 * Shows leasehold land purchases where the lease end date is within 90 days
 * or has already expired. Color-coded by severity.
 */
export default function MobileLeaseExpiryPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={4} />}>
      <LeaseExpiryContent />
    </Suspense>
  );
}

async function LeaseExpiryContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.ASSETS_VIEW)) {
    return <MobileNoAccess what="land alerts" permission="assets.view" />;
  }

  const alerts = await leaseExpiryAlerts(company.id);

  const severityColor: Record<string, string> = {
    EXPIRED: "var(--color-stop)",
    CRITICAL: "var(--color-stop)",
    WARNING: "var(--color-signal)",
    INFO: "var(--color-steel)",
  };

  const severityBg: Record<string, string> = {
    EXPIRED: "color-mix(in srgb, var(--color-stop) 8%, transparent)",
    CRITICAL: "color-mix(in srgb, var(--color-stop) 8%, transparent)",
    WARNING: "color-mix(in srgb, var(--color-signal) 8%, transparent)",
    INFO: "color-mix(in srgb, var(--color-steel) 8%, transparent)",
  };

  const expired = alerts.filter((a) => a.severity === "EXPIRED");
  const critical = alerts.filter((a) => a.severity === "CRITICAL");
  const warning = alerts.filter((a) => a.severity === "WARNING");
  const info = alerts.filter((a) => a.severity === "INFO");

  return (
    <div className="px-3 py-3">
      {/* Summary banner */}
      <div
        className="rounded-[0.5rem] border p-3 mb-3"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
      >
        <div className="flex items-center gap-2 mb-2">
          <CalendarClock className="size-4" style={{ color: "var(--color-signal)" }} />
          <p className="text-m-section font-bold" style={{ color: "var(--color-ink-950)" }}>
            Lease Expiry Alerts
          </p>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <div className="text-center">
            <p className="text-m-section font-bold tabular-nums" style={{ color: "var(--color-stop)" }}>
              {expired.length}
            </p>
            <p className="text-m-caption uppercase" style={{ color: "var(--color-ink-500)" }}>Expired</p>
          </div>
          <div className="text-center">
            <p className="text-m-section font-bold tabular-nums" style={{ color: "var(--color-stop)" }}>
              {critical.length}
            </p>
            <p className="text-m-caption uppercase" style={{ color: "var(--color-ink-500)" }}>≤30d</p>
          </div>
          <div className="text-center">
            <p className="text-m-section font-bold tabular-nums" style={{ color: "var(--color-signal)" }}>
              {warning.length}
            </p>
            <p className="text-m-caption uppercase" style={{ color: "var(--color-ink-500)" }}>≤60d</p>
          </div>
          <div className="text-center">
            <p className="text-m-section font-bold tabular-nums" style={{ color: "var(--color-steel)" }}>
              {info.length}
            </p>
            <p className="text-m-caption uppercase" style={{ color: "var(--color-ink-500)" }}>≤90d</p>
          </div>
        </div>
      </div>

      {/* Alert cards */}
      {alerts.length === 0 ? (
        <div className="text-center py-8">
          <Clock className="size-6 mx-auto mb-2" style={{ color: "var(--color-ink-300)" }} />
          <p className="text-m-label" style={{ color: "var(--color-ink-500)" }}>
            No leases expiring soon. All leasehold land is within its lease period.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map((alert) => (
            <a
              key={alert.landPurchaseId}
              href={`/m/land/${alert.landPurchaseId}`}
              className="block rounded-[0.5rem] border p-2.5 text-m-body press"
              style={{
                borderColor: severityColor[alert.severity],
                backgroundColor: severityBg[alert.severity],
              }}
            >
              <div className="flex items-start gap-2">
                <AlertTriangle
                  className="size-3.5 shrink-0 mt-0.5"
                  style={{ color: severityColor[alert.severity] }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-m-body font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
                    {alert.sellerName}
                  </p>
                  <p className="text-m-caption truncate" style={{ color: "var(--color-ink-500)" }}>
                    {alert.location || "No location"}{alert.projectName ? ` · ${alert.projectName}` : ""}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-m-caption" style={{ color: "var(--color-ink-600)" }}>
                      Lease ends: <span className="font-bold">{formatDate(alert.leaseEndDate)}</span>
                    </span>
                    <span
                      className="text-m-caption font-bold uppercase rounded px-1.5 py-0.5"
                      style={{
                        color: severityColor[alert.severity],
                        backgroundColor: `color-mix(in srgb, ${severityColor[alert.severity]} 15%, transparent)`,
                      }}
                    >
                      {alert.daysUntilExpiry < 0
                        ? `${Math.abs(alert.daysUntilExpiry)}d overdue`
                        : `${alert.daysUntilExpiry}d left`}
                    </span>
                  </div>
                  <p className="text-m-caption mt-0.5" style={{ color: "var(--color-ink-500)" }}>
                    Cost: <span className="font-bold tabular-nums">{formatCurrency(toNum(alert.totalCost))}</span>
                    {alert.registryNo ? ` · Reg: ${alert.registryNo}` : ""}
                  </p>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
