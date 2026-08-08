import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { getCurrentUser } from "@/lib/server";
import { PERSONAS } from "@/lib/mobile-nav";
import { MobilePageHeader, MobileSectionTitle, MobileRow, MobileRefreshButton } from "@/components/mobile/mobile-primitives";
import { ShoppingCart, Users, CheckSquare, ArrowRight, Monitor } from "lucide-react";
import Link from "next/link";

/** Sales → Me tab: my shortcuts + more links. */
export default function BookMePage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={3} />}>
      <BookMeContent />
    </Suspense>
  );
}

async function BookMeContent() {
  await connection();
  const user = await getCurrentUser();
  const more = PERSONAS.sales.more;

  return (
    <div>
      <MobilePageHeader title="Me" subtitle={user?.name ?? "Sales"} right={<MobileRefreshButton />} />

      <MobileSectionTitle>Quick actions</MobileSectionTitle>
      <div>
        <MobileRow href="/m/sales/new" icon={ShoppingCart} title="New sale" />
        <MobileRow href="/m/customers" icon={Users} title="Customers" />
        <MobileRow href="/m/site/tasks" icon={CheckSquare} title="My tasks" />
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
