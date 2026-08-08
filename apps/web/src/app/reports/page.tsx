import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { ArrowRight, BarChart3 } from "lucide-react";
import { getUserRole } from "@/lib/server";
import { normalizeRole } from "@/lib/roles";
import { linksFor } from "@/lib/nav";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { EmptyState } from "@/components/empty-state";
import { Page } from "@/components/page";

/**
 * INSIGHTS — cross-world report index, grouped by lifecycle stage.
 *
 * Reports are distributed across their natural worlds now: procurement
 * reports under Build > Procure, stock reports under Build > Stock,
 * sales reports under Build > Sell, labour reports under People, and
 * pure accounting reports (P&L, comparative) under Books. This page is
 * the cross-world index that collects every hidden report link the
 * role can see, grouped by the `group` field on each link.
 *
 * The report links come straight from nav.ts via linksFor(), so the
 * sidebar, the command palette and this page can never disagree.
 */
export default function InsightsPage() {
  return (
    <Page>
      <Suspense fallback={<PageLoading label="Loading insights…" variant="cards" />}>
        <InsightsContent />
      </Suspense>
    </Page>
  );
}

async function InsightsContent() {
  await connection();
  const role = normalizeRole(await getUserRole());

  // Collect every hidden report link across all worlds the role can see.
  // Each report link carries a `group` (the lifecycle stage it belongs to).
  const reportLinks = linksFor(role).filter((l) => l.group);

  // Preserve the question order as declared in nav.ts (first-seen wins).
  const questionOrder: string[] = [];
  const byQuestion = new Map<string, typeof reportLinks>();
  for (const link of reportLinks) {
    const q = link.group!;
    if (!byQuestion.has(q)) {
      questionOrder.push(q);
      byQuestion.set(q, []);
    }
    byQuestion.get(q)!.push(link);
  }

  if (reportLinks.length === 0) {
    return (
      <>
        <PageHeader
          title="Insights"
          description="Ask a question about the business, get an answer."
        />
        <div className="well">
          <EmptyState
            icon={<BarChart3 />}
            title="No insights available for your role"
            description="Reports read across finance, inventory and payroll. Ask an administrator to widen your access if you need them."
          />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Insights"
        description="Every report, grouped by the Build lifecycle stage it belongs to. Each one reads from the same ledger the rest of the app writes to — so the numbers here are the numbers, not a copy."
        stats={[{ label: "Reports", value: reportLinks.length }]}
      />

      <div className="space-y-7">
        {questionOrder.map((question) => {
          const items = byQuestion.get(question)!;
          return (
            <section key={question}>
              {/* The lifecycle stage is the heading. The reports are the answers. */}
              <h2 className="mb-2.5 flex items-baseline gap-2 text-section text-foreground">
                <span
                  className="h-1.5 w-1.5 translate-y-[-2px] rounded-full"
                  style={{ backgroundColor: "var(--color-world-insights)" }}
                />
                {question}
              </h2>

              <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
                {items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="group flex items-center gap-3.5 px-4 py-3 transition-colors hover:bg-subtle"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors group-hover:bg-brand-soft group-hover:text-brand">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-body font-semibold text-foreground">
                          {item.label}
                        </span>
                        <span className="mt-0.5 block text-meta leading-snug text-muted-foreground">
                          {item.hint}
                        </span>
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/30 transition-all group-hover:translate-x-0.5 group-hover:text-brand" />
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
