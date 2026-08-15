import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { ResponsiveSurfaceRedirector } from "@/components/responsive-surface-redirector";
import { SwRegister } from "@/components/sw-register";
import { CurrencyProvider } from "@/components/currency-provider";
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
if(!c){c=window.innerWidth<768?'compact':'detailed';try{localStorage.setItem('nirman-currency-mode',c);}catch(e){}}
}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      <body className="antialiased">
        <Suspense fallback={<div className="min-h-screen bg-background" />}>
          <CurrencyProvider>
            <AppShell>{children}</AppShell>
            {/* Watches the viewport and swaps between the desktop (/) and
                mobile (/m) surfaces on a screen-size mismatch. Auto-redirects
                at home routes; offers a toast on deep routes so in-progress
                work is never lost. Respects the nirman-desktop=1 override. */}
            <ResponsiveSurfaceRedirector />
          </CurrencyProvider>
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
        <SwRegister />
      </body>
    </html>
  );
}
