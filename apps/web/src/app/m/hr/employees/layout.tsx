import { SensitiveGuard } from "@/components/sensitive-guard";

// Mobile employee pages carry the same PII as the desktop roster —
// watermark with the viewer's identity and block casual copy/drag.
export default function MobileEmployeesLayout({ children }: { children: React.ReactNode }) {
  return <SensitiveGuard>{children}</SensitiveGuard>;
}
