import { SensitiveGuard } from "@/components/sensitive-guard";

// Reports (balance sheet, GST, payroll, profit…) expose consolidated
// company data — watermark with the viewer's identity and block casual
// copy/drag.
export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  return <SensitiveGuard>{children}</SensitiveGuard>;
}
