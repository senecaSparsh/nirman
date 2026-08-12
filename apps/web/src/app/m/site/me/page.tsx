import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { getCurrentUser } from "@/lib/server";
import { PERSONAS } from "@/lib/mobile-nav";
import { MobileSectionTitle, MobileRow } from "@/components/mobile/v2/primitives";
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
  await getCurrentUser();
  const more = PERSONAS.field.more;

  return (
    <div>
      <MobileSectionTitle>Quick actions</MobileSectionTitle>
      <div className="flex flex-col gap-2.5">
        <MobileRow href="/m/site/attendance" icon={CalendarCheck} title="Attendance" subtitle="Check in / check out" />
        <MobileRow href="/m/site/dpr" icon={ClipboardList} title="My DPRs" subtitle="Daily progress reports" />
        <MobileRow href="/m/site/tasks" icon={CheckSquare} title="My tasks" subtitle="Assigned to me" />
      </div>

      <MobileSectionTitle>More</MobileSectionTitle>
      <div className="flex flex-col gap-2.5">
        {more.map((m) => (
          <Link key={m.href} href={m.href} className="flex items-center gap-3 rounded-[0.875rem] border p-3.5 transition-colors active:opacity-80" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
            <span className="min-w-0 flex-1 truncate text-[0.9375rem] font-medium" style={{ color: "var(--color-ink-950)" }}>{m.label}</span>
            <ArrowRight className="h-4 w-4 shrink-0" style={{ color: "var(--color-ink-300)" }} />
          </Link>
        ))}
      </div>

      <MobileSectionTitle>Switch view</MobileSectionTitle>
      <div className="mb-4">
        <Link href="/?desktop=1" className="flex w-full items-center justify-center gap-2 rounded-[0.625rem] border-2 px-4 py-3 text-[0.875rem] font-semibold" style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)", color: "var(--color-ink-900)" }}>
          <Monitor className="h-4 w-4" />
          View desktop site
        </Link>
      </div>
    </div>
  );
}
