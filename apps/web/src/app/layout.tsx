import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { ResponsiveSurfaceRedirector } from "@/components/responsive-surface-redirector";
import { SwRegister } from "@/components/sw-register";
import { Toaster } from "sonner";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
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
  appleWebApp: { capable: true, title: "Nirman", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jakarta.variable} ${mono.variable}`}>
      <head>
        {/* Restore the nav-panel collapse preference before first paint so
            the sidebar never flashes open and then snaps shut. Purely
            presentational; failure is silent and falls back to expanded. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('nirman.nav.panel')==='closed'){document.documentElement.dataset.nav='collapsed'}}catch(e){}",
          }}
        />
      </head>
      <body className="antialiased">
        <Suspense fallback={<div className="min-h-screen bg-background" />}>
          <AppShell>{children}</AppShell>
          {/* Watches the viewport and swaps between the desktop (/) and
              mobile (/m) surfaces on a screen-size mismatch. Auto-redirects
              at home routes; offers a toast on deep routes so in-progress
              work is never lost. Respects the nirman-desktop=1 override. */}
          <ResponsiveSurfaceRedirector />
        </Suspense>
        <Toaster richColors position="top-right" />
        <SwRegister />
      </body>
    </html>
  );
}
