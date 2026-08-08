import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { getCurrentUser } from "@/lib/server";
import { PERSONAS } from "@/lib/mobile-nav";
import { MobilePageHeader, MobileSectionTitle, MobileRow, MobileRefreshButton } from "@/components/mobile/mobile-primitives";
import { CalendarCheck, ClipboardList, CheckSquare, ArrowRight, Monitor } from "lucide-react";
import Link from "next/link";

/** Field → Me tab: my profile + field-worker shortcuts + more links. */
export default function SiteMePage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={3} />}>
      <SiteMeContent />
    </Suspense>
  );
}

async function SiteMeContent() {
  await connection();
  const user = await getCurrentUser();
  const more = PERSONAS.field.more;

  return (
    <div>
      <MobilePageHeader title="Me" subtitle={user?.name ?? "Field worker"} right={<MobileRefreshButton />} />

      <MobileSectionTitle>Quick actions</MobileSectionTitle>
      <div>
        <MobileRow href="/m/site/attendance" icon={CalendarCheck} title="Attendance" subtitle="Check in / check out" />
        <MobileRow href="/m/site/dpr" icon={ClipboardList} title="My DPRs" subtitle="Daily progress reports" />
        <MobileRow href="/m/site/tasks" icon={CheckSquare} title="My tasks" subtitle="Assigned to me" />
      </div>

      <MobileSectionTitle>More</MobileSectionTitle>
      <div>
        {more.map((m) => (
          <Link key={m.href} href={m.href} className="flex items-center gap-3 border-b border-border/70 bg-card px-4 py-3 transition-colors active:bg-accent">
            <span className="min-w-0 flex-1 truncate text-body font-medium">{m.label}</span>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
          </Link>
        ))}
      </div>

      <MobileSectionTitle>Switch view</MobileSectionTitle>
      <div className="px-4 pb-4">
        <Link href="/?desktop=1" className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-body font-semibold text-foreground">
          <Monitor className="h-4 w-4" />
          View desktop site
        </Link>
      </div>
    </div>
  );
}
