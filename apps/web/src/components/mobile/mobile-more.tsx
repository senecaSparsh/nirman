import Link from "next/link";
import { connection } from "next/server";
import { ArrowRight, Monitor } from "lucide-react";
// (Link already imported above)
import { PERSONAS, type PersonaKey } from "@/lib/mobile-nav";
import { MobilePageHeader, MobileSectionTitle, MobileRefreshButton } from "@/components/mobile/mobile-primitives";

/**
 * Shared "More" page — surfaces the persona's secondary links and a
 * "View desktop" escape hatch (sets a cookie so the mobile gate stops
 * redirecting the user back to /m).
 */
export async function MobileMore({ personaKey }: { personaKey: PersonaKey }) {
  await connection();
  const persona = PERSONAS[personaKey];
  return (
    <div>
      <MobilePageHeader title="More" subtitle={persona.label} right={<MobileRefreshButton />} />
      <MobileSectionTitle>{persona.label} shortcuts</MobileSectionTitle>
      <div>
        {persona.more.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            className="flex items-center gap-3 border-b border-border/70 bg-card px-4 py-3 transition-colors active:bg-accent"
          >
            <span className="min-w-0 flex-1 truncate text-body font-medium">{m.label}</span>
            {m.desktopOnly && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-caption text-muted-foreground">desktop</span>
            )}
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
          </Link>
        ))}
      </div>

      <MobileSectionTitle>Switch view</MobileSectionTitle>
      <div className="px-4">
        <Link
          href="/?desktop=1"
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-body font-semibold text-foreground"
        >
          <Monitor className="h-4 w-4" />
          View desktop site
        </Link>
        <p className="mt-2 px-2 text-caption text-muted-foreground">
          The full ERP sidebar — best on a wide screen.
        </p>
      </div>
    </div>
  );
}
