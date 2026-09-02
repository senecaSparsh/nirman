import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";
import { CallAnalyticsView } from "@/components/calls/call-analytics-view";

export const metadata = { title: "Call Analytics · Nirman" };

export default function CallAnalyticsPage() {
  return (
    <Suspense fallback={<PageLoading label="Loading analytics…" variant="default" />}>
      <CallAnalyticsContent />
    </Suspense>
  );
}

async function CallAnalyticsContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.CALL_ANALYTICS)) {
    return <NoAccess what="call analytics" />;
  }

  // Default to last 30 days
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const calls = await prisma.callLog.findMany({
    where: {
      companyId: company.id,
      deletedAt: null,
      startedAt: { gte: thirtyDaysAgo },
    },
    select: {
      id: true,
      direction: true,
      status: true,
      durationSec: true,
      disposition: true,
      startedAt: true,
      callCost: true,
      callerUserId: true,
      caller: { select: { id: true, name: true } },
    },
  });

  // Aggregate
  const total = calls.length;
  const missed = calls.filter((c) => c.status === "MISSED").length;
  const answered = calls.filter((c) => c.status === "ANSWERED").length;
  const voicemail = calls.filter((c) => c.status === "VOICEMAIL").length;
  const totalDuration = calls.reduce((sum, c) => sum + c.durationSec, 0);
  const avgDuration = answered > 0 ? Math.round(totalDuration / answered) : 0;
  const missedRate = total > 0 ? (missed / total) * 100 : 0;
  const totalCost = calls.reduce((sum, c) => sum + (c.callCost ? parseFloat(c.callCost.toString()) : 0), 0);

  // Calls per staff
  const staffMap = new Map<string, { name: string; count: number; duration: number; missed: number }>();
  for (const c of calls) {
    if (!c.callerUserId || !c.caller) continue;
    const existing = staffMap.get(c.callerUserId) ?? { name: c.caller.name, count: 0, duration: 0, missed: 0 };
    existing.count++;
    existing.duration += c.durationSec;
    if (c.status === "MISSED") existing.missed++;
    staffMap.set(c.callerUserId, existing);
  }
  const staffStats = Array.from(staffMap.values()).sort((a, b) => b.count - a.count);

  // Disposition distribution
  const dispositionMap = new Map<string, number>();
  for (const c of calls) {
    const d = c.disposition ?? "UNSET";
    dispositionMap.set(d, (dispositionMap.get(d) ?? 0) + 1);
  }
  const dispositions = Array.from(dispositionMap.entries()).sort((a, b) => b[1] - a[1]);

  // Direction distribution
  const directionMap = new Map<string, number>();
  for (const c of calls) {
    directionMap.set(c.direction, (directionMap.get(c.direction) ?? 0) + 1);
  }
  const directions = Array.from(directionMap.entries());

  // Daily call volume (last 30 days)
  const dailyMap = new Map<string, { date: string; total: number; missed: number; answered: number }>();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    dailyMap.set(key, { date: key, total: 0, missed: 0, answered: 0 });
  }
  for (const c of calls) {
    const key = c.startedAt.toISOString().slice(0, 10);
    const entry = dailyMap.get(key);
    if (entry) {
      entry.total++;
      if (c.status === "MISSED") entry.missed++;
      if (c.status === "ANSWERED") entry.answered++;
    }
  }
  const dailyVolume = Array.from(dailyMap.values());

  return (
    <CallAnalyticsView
      summary={{
        total, missed, answered, voicemail,
        totalDuration, avgDuration, missedRate, totalCost,
      }}
      staffStats={staffStats}
      dispositions={dispositions}
      directions={directions}
      dailyVolume={dailyVolume}
    />
  );
}
