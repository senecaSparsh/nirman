import { cn } from "@/lib/utils";

/**
 * Page header — distinctive, compact, with strong typographic hierarchy.
 *
 * The title is the anchor (22px, bold, tight tracking). Below it: an optional
 * description OR inline stats (key-value pairs rendered as monospace data).
 * A subtle bottom border separates the header from content.
 *
 * This is NOT a generic "title + description" block. It's a contextual header
 * that shows you what page you're on AND the key numbers that matter.
 */
export function PageHeader({
  title,
  description,
  action,
  stats,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  stats?: { label: string; value: string | number }[];
  className?: string;
}) {
  return (
    <div className={cn("border-b border-border pb-4", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-title text-foreground">{title}</h1>
          {description && !stats && (
            <p className="mt-1 text-meta text-muted-foreground">{description}</p>
          )}
          {stats && stats.length > 0 && (
            <div className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1">
              {stats.map((s, i) => (
                <div key={i} className="flex items-baseline gap-1.5">
                  <span className="text-label text-muted-foreground/70">{s.label}</span>
                  <span className="tnum text-body font-semibold text-foreground">{s.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}
