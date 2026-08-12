import { MobileShellV2 } from "@/components/mobile/v2/mobile-shell";

/**
 * Mobile route group layout.
 *
 * Everything under /m/* renders inside <MobileShellV2> — the new
 * "site-grade" minimal shell with a 3-module bottom tab bar
 * (Inventory / HR / Accounts). The root layout's <AppShell>
 * short-circuits for /m paths, so the desktop sidebar never wraps
 * these routes.
 *
 * No DB access here — keeps the segment PPR-friendly. Module home
 * pages do their own `await connection()` + Prisma fetches inside
 * <Suspense>.
 */
export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return <MobileShellV2>{children}</MobileShellV2>;
}
