/**
 * Request timeout helper for long-running API routes.
 *
 * Usage:
 *   import { withTimeout } from "@/lib/timeout";
 *
 *   export const POST = apiHandler(async (req) => {
 *     return withTimeout(doHeavyWork(req), 30_000, "Backup timed out");
 *   });
 *
 * Returns a 504 Gateway Timeout response if the work doesn't complete
 * within the specified timeout.
 */

export async function withTimeout<T>(
  work: Promise<T>,
  ms: number,
  message = "Request timed out",
): Promise<T | Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);

  try {
    return await Promise.race([
      work,
      new Promise<Response>((resolve) => {
        controller.signal.addEventListener("abort", () => {
          resolve(
            new Response(JSON.stringify({ error: message }), {
              status: 504,
              headers: { "Content-Type": "application/json" },
            }),
          );
        });
      }) as Promise<T>,
    ]);
  } finally {
    clearTimeout(timer);
  }
}
