import type { Metadata } from "next";
import "./portal.css";

export const metadata: Metadata = {
  title: "Customer Portal",
  description: "View your bookings, payments, and documents",
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {children}
    </div>
  );
}
