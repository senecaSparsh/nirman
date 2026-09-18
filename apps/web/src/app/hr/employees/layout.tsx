import { SensitiveGuard } from "@/components/sensitive-guard";

// Employee roster + detail pages carry PII (PAN/Aadhaar/bank/wages) —
// watermark with the viewer's identity and block casual copy/drag.
export default function EmployeesLayout({ children }: { children: React.ReactNode }) {
  return <SensitiveGuard>{children}</SensitiveGuard>;
}
