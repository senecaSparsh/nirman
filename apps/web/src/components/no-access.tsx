import Link from "next/link";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * NO ACCESS — what a role-gated page shows instead of its content.
 *
 * Thirty-nine pages used to render their own version of this, and every
 * one of them was a dead end: a grey box reading "You don't have
 * permission to view this module." That tells the user they've failed
 * and offers them nothing.
 *
 * A blocked screen still has a job. It must:
 *   · not look like a crash — this is a rule, not a bug
 *   · name what is restricted, so the user knows what to ask for
 *   · say who can unlock it (their administrator)
 *   · give them a way out that isn't the back button
 *
 * Access rules are a normal part of a company with sub-admins and site
 * supervisors. The UI should treat hitting one as unremarkable.
 */
export function NoAccess({
  what = "this page",
  /** Optional: the specific thing to ask an admin for. */
  permission,
}: {
  what?: string;
  permission?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border bg-card px-6 py-16 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground/55">
        <Lock className="h-[18px] w-[18px]" />
      </div>
      <div className="space-y-1">
        <p className="text-body font-semibold text-foreground">
          {what.charAt(0).toUpperCase() + what.slice(1)} isn&apos;t part of your role
        </p>
        <p className="mx-auto max-w-sm text-meta leading-relaxed text-muted-foreground">
          Your account doesn&apos;t include access to {what}. An owner or administrator can
          grant it from Setup → Who Sees What
          {permission ? (
            <>
              {" "}
              (<span className="font-mono text-caption">{permission}</span>)
            </>
          ) : null}
          .
        </p>
      </div>
      <Button asChild variant="outline" size="sm" className="mt-1">
        <Link href="/">Back to Today</Link>
      </Button>
    </div>
  );
}
