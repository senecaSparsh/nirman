import { MobileShell } from "@/components/mobile/mobile-shell";

/**
 * Mobile route group layout.
 *
 * Everything under /m/* renders inside <MobileShell> (bottom tab bar,
 * persona-scoped). The root layout's <AppShell> short-circuits for /m
 * paths, so the desktop sidebar never wraps these routes.
 *
 * No DB access here — keeps the segment PPR-friendly. Persona pages
 * do their own `await connection()` + Prisma fetches inside <Suspense>.
 */
export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return <MobileShell>{children}</MobileShell>;
}
