import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { EmployeeNavListener } from "@/components/employee-nav-listener";
import { FeedbackButton } from "@/components/feedback/feedback-button";
import { ErrorCatcher } from "@/components/dev/error-catcher";
import { SurfaceAdapter } from "@/components/surface-adapter";
// SW register is client-only and not needed for first paint — lazy-loaded
// via a client wrapper (ssr:false dynamic imports can't be used directly
// in Server Components).
import { LazySwRegister } from "@/components/lazy-sw-register";
import { ChunkErrorRecovery } from "@/components/dev/chunk-error-recovery";
import { CurrencyProvider } from "@/components/currency-provider";
import { runWithCurrencyMode, type CurrencyMode } from "@/lib/currency-server";
import { runWithRequestContext, getNavBootstrap } from "@/lib/server";
import { swrConfig, SWRConfig } from "@/lib/swr";
import { Toaster } from "sonner";

/**
 * Inter, not a geometric display face. Inter was cut for interface text
 * at 11–16px — the exact range this app lives in — and its taller
 * x-height and open apertures are what let a 12px table label stay
 * legible. The variable name stays `--font-inter` so nothing downstream
 * has to change.
 */
const sans = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  axes: ["opsz"],
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Nirman Inventory OS",
  description: "Construction + Real Estate inventory management",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Nirman",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/favicon.ico", sizes: "32x32" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180" },
      { url: "/icon-192.png", sizes: "192x192" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7f8" },
    { media: "(prefers-color-scheme: dark)", color: "#1c1c1f" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

/**
 * Applied before first paint, so neither the collapsed sidebar nor the
 * dark theme ever flashes the wrong way on reload. Both are pure
 * presentation preferences; failure is silent and falls back to the
 * light, expanded default.
 */
const BOOT_SCRIPT = `try{
var r=document.documentElement;
if(localStorage.getItem('nirman.nav.panel')==='closed')r.dataset.nav='collapsed';
var t=localStorage.getItem('nirman.theme');
if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches))r.classList.add('dark');
var c=localStorage.getItem('nirman-currency-mode');
if(!c){c='compact';try{localStorage.setItem('nirman-currency-mode',c);}catch(e){}}
}catch(e){}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Read the currency mode from the cookie so ALL server-side
  // formatCurrency() calls automatically respect the user's preference
  // via AsyncLocalStorage — no call site needs to pass the mode.
  const cookie = (await cookies()).get("nirman-currency-mode")?.value;
  const currencyMode: CurrencyMode = cookie === "detailed" ? "detailed" : "compact";

  return runWithRequestContext(async () => {
    // Resolve identity once on the server so both nav shells (desktop
    // AppShell, mobile MobileShellV2 via the /m layout) render with the
    // real role/company on first paint. The payload doubles as SWR
    // `fallback` for "/api/me" + "/api/company" — every client consumer
    // (AppShell, usePermissions, page hooks) starts with real data instead
    // of a least-privileged placeholder, and SWR revalidates in the
    // background. null when unauthenticated or the lookup fails — the
    // client-side guards fall back to their previous behavior.
    const nav = await getNavBootstrap().catch(() => null);
    const swrValue = nav
      ? { ...swrConfig, fallback: { "/api/me": nav.me, "/api/company": nav.company } }
      : swrConfig;
    return runWithCurrencyMode(currencyMode, () => (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      <body className="antialiased">
        <Suspense fallback={<div className="min-h-screen bg-background" />}>
          <SWRConfig value={swrValue}>
            <CurrencyProvider>
              {/* Surface adapter — watches viewport width and instantly
                  redirects between mobile (/m/*) and desktop (/*) surfaces.
                  Breakpoint: 1024px. No mobile user sees desktop, no desktop
                  user sees mobile. Adapts on resize/orientation change. */}
              <SurfaceAdapter />
              <EmployeeNavListener />
              <AppShell isDev={process.env.NODE_ENV !== "production"} hasSession={!!nav}>{children}</AppShell>
              {/* Surface selection is now one-time only: the middleware
                  redirects "/" → "/m" for mobile UAs (entry landing), and
                  the sign-in page routes to the correct surface after login.
                  There is NO client-side surface swapping — once you're on
                  a surface (desktop "/" or mobile "/m"), you stay there
                  regardless of resize or navigation. This prevents the
                  disruptive desktop↔mobile redirects. */}
              {/* Instant feedback — floating button on every page.
                  Auto-captures a screenshot, lets users record voice +
                  write feedback, routes it to the developer only.
                  The inbox + unread badge are only visible to DEVELOPER. */}
              <FeedbackButton />
              {/* Error catcher — captures all client-side errors and
                  sends them to /api/error-logs for the developer. */}
              <ErrorCatcher />
            </CurrencyProvider>
          </SWRConfig>
        </Suspense>
        <Toaster
          position="top-right"
          gap={8}
          toastOptions={{
            classNames: {
              toast:
                "!rounded-lg !border !border-border !bg-elevated !text-foreground !shadow-overlay !text-[13px] !font-sans",
              description: "!text-muted-foreground !text-[12px]",
              actionButton: "!bg-primary !text-primary-foreground !rounded-md",
              cancelButton: "!bg-muted !text-muted-foreground !rounded-md",
              success: "[&_[data-icon]]:!text-success",
              error: "[&_[data-icon]]:!text-danger",
              warning: "[&_[data-icon]]:!text-warning",
              info: "[&_[data-icon]]:!text-info",
            },
          }}
        />
        <LazySwRegister isDev={process.env.NODE_ENV !== "production"} />
        <ChunkErrorRecovery />
      </body>
    </html>
  ));
  });
}
