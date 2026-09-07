import { MobileShellV2 } from "@/components/mobile/v2/mobile-shell";
import { NavigationTracker } from "@/components/mobile/v2/navigation-tracker";
import { ChunkErrorRecovery } from "@/components/dev/chunk-error-recovery";
import { getNavBootstrap } from "@/lib/server";

/**
 * Mobile route group layout.
 *
 * Everything under /m/* renders inside <MobileShellV2> — the new
 * "site-grade" minimal shell with a 3-module bottom tab bar
 * (Inventory / HR / Accounts). The root layout's <AppShell>
 * short-circuits for /m paths, so the desktop sidebar never wraps
 * these routes.
 *
 * The nav identity (role, permissions, active company, company list) is
 * resolved here on the server and passed to the shell as `initial`, so
 * the tab bar + header render correctly on first paint instead of
 * popping in after a client-side /api/me + /api/company waterfall.
 * getNavBootstrap is request-memoized — when the root layout's call
 * propagates its ALS context this costs zero extra queries.
 */
export default async function MobileLayout({ children }: { children: React.ReactNode }) {
  const nav = await getNavBootstrap().catch(() => null);
  return (
    <MobileShellV2 initial={nav}>
      <NavigationTracker />
      {children}
      <ChunkErrorRecovery />
    </MobileShellV2>
  );
}
