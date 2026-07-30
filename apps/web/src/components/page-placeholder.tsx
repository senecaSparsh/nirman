import { Construction } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function PagePlaceholder({
  title,
  description,
  phase,
}: {
  title: string;
  description: string;
  phase: string;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Construction className="h-7 w-7" />
          </div>
          <p className="text-lg font-semibold">Coming in {phase}</p>
          <p className="max-w-md text-sm text-muted-foreground">
            This module is scaffolded and wired into navigation. The full UI and business logic
            ship in the next phase.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
