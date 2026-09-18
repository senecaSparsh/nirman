import { SensitiveGuard } from "@/components/sensitive-guard";

// Mobile reports mirror the desktop reports segment — consolidated
// company data, watermarked and casual-copy blocked.
export default function MobileReportsLayout({ children }: { children: React.ReactNode }) {
  return <SensitiveGuard>{children}</SensitiveGuard>;
}
