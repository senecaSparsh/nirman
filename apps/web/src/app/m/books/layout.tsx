import { SensitiveGuard } from "@/components/sensitive-guard";

// Mobile books (finance, GL, payroll, receipts, reports) carry company
// financials — watermark with the viewer's identity and block casual
// copy/drag.
export default function MobileBooksLayout({ children }: { children: React.ReactNode }) {
  return <SensitiveGuard>{children}</SensitiveGuard>;
}
