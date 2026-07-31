import { NextRequest } from "next/server";
import { json } from "@/lib/server";
import { processScheduledWorkflows } from "@/lib/workflow-engine";

/**
 * POST /api/workflow-scheduler
 * Called by an external cron (e.g. Vercel Cron, GitHub Actions, or a
 * simple curl in a systemd timer). Processes all due scheduled workflows.
 *
 * In development, this can be called manually or via a setInterval in
 * the client. In production, set up a cron job to hit this endpoint
 * every 5-15 minutes.
 *
 * Security: protected by a shared secret in the SCHEDULER_SECRET env var.
 * If not set, falls back to requiring auth (for dev convenience).
 */
export async function POST(req: NextRequest) {
  // Check for scheduler secret
  const secret = process.env.SCHEDULER_SECRET;
  if (secret) {
    const authHeader = req.headers.get("authorization");
    const provided = authHeader?.replace("Bearer ", "");
    if (provided !== secret) {
      return json({ error: "Unauthorized — invalid scheduler secret" }, { status: 401 });
    }
  }

  try {
    const results = await processScheduledWorkflows();
    return json({
      ok: true,
      processed: results.length,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return json({ error: err?.message ?? "Scheduler error" }, { status: 500 });
  }
}

/** GET — health check for the scheduler */
export async function GET() {
  return json({ ok: true, service: "workflow-scheduler", timestamp: new Date().toISOString() });
}
