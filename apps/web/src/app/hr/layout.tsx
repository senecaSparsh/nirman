export default function HrLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="border-b border-border pb-3">
        <h1 className="text-title text-foreground">HR &amp; Workforce</h1>
        <p className="mt-1 text-meta text-muted-foreground">
          Employees, attendance, payroll, and daily progress reports.
        </p>
      </div>
      {children}
    </div>
  );
}
