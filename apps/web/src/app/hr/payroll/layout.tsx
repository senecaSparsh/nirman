import { SensitiveGuard } from "@/components/sensitive-guard";

// Payroll pages carry salary/wage data — watermark with the viewer's
// identity and block casual copy/drag.
export default function PayrollLayout({ children }: { children: React.ReactNode }) {
  return <SensitiveGuard>{children}</SensitiveGuard>;
}
