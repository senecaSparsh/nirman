import { HardHat } from "lucide-react";

export default function HrLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-7xl">
      {/* World header — 2px accent rule in the People world color */}
      <div className="relative border-b border-border pb-3">
        <div className="absolute inset-x-0 -top-px h-0.5 bg-[var(--color-world-hr)]" />
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--color-world-hr)]/10">
            <HardHat className="h-4 w-4 text-[var(--color-world-hr)]" />
          </span>
          <div>
            <h1 className="text-title text-foreground">People</h1>
            <p className="mt-0.5 text-meta text-muted-foreground">
              Labour, attendance and time &mdash; and what it all costs
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-6 py-5">{children}</div>
    </div>
  );
}
