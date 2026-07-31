export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground/60">
        {icon}
      </div>
      <p className="text-body font-medium text-foreground">{title}</p>
      {description && (
        <p className="max-w-xs text-meta text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-1.5">{action}</div>}
    </div>
  );
}
