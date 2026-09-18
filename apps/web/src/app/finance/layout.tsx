import { SensitiveGuard } from "@/components/sensitive-guard";

// Finance pages carry company financials — watermark with the viewer's
// identity and block casual copy/drag.
export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return <SensitiveGuard>{children}</SensitiveGuard>;
}
