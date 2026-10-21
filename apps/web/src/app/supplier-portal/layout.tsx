import type { Metadata } from "next";
import "../portal/portal.css";

export const metadata: Metadata = {
  title: "Supplier Portal",
  description: "View your orders, invoices, and payments",
};

export default function SupplierPortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {children}
    </div>
  );
}
