import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "Nirman Inventory OS",
  description: "Construction + Real Estate inventory management",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Nirman", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#3b3fd6",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Suspense fallback={<div className="min-h-screen bg-background" />}>
          <AppShell>{children}</AppShell>
        </Suspense>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
