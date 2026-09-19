import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Route-auth coverage — the last convention gap, closed.
 *
 * Every API route must reach an authentication mechanism: a session check
 * (requirePermission/requireUser/getUserSession…), a shared-secret check
 * (cron/webhook signatures), or a public-token check (portal cookies,
 * contractToken/offerToken bearers). A route file with NO auth call at all
 * is a silent hole — this test makes that a build failure.
 *
 * Exempt routes are the auth layer itself (sign-in, OTP, bootstrap) plus a
 * small documented list — anything added there needs a comment justifying
 * why it carries no auth.
 */

const API_DIR = join(__dirname, "../app/api");

// Auth-layer + public endpoints — no session check BY DESIGN.
// Each entry must justify itself; growing this list without reason is a smell.
const AUTH_EXEMPT = new Set([
  "auth/[...all]",          // Better Auth handler — sign-in/out/session itself
  "auth/bootstrap",         // first-user bootstrap (locked after seed)
  "auth/demo-login",        // hard-gated NODE_ENV !== production
  "auth/phone-password",    // credential check IS the auth
  "auth/phone-password/select",
  "auth/phone-otp/send",    // OTP send — pre-auth by definition
  "auth/phone-otp/verify",
  "auth/phone-otp/select-user",
  "portal/auth/logout",     // clears a customer cookie — pre-session
]);

// Any of these marks the route as carrying an auth mechanism.
const AUTH_RE =
  /requirePermission|requireUser|requireRole|requireAuth|getUserSession|requirePortal|portalSession|getPortal|x-cron-secret|CRON_SECRET|SCHEDULER_SECRET|verifySignature|verifyTwilioSignature|verifyWebhook|webhookSecret|timingSafeEqual|createHmac|apiHandler|contractToken|offerToken|\bauth\(|auth\.api|getServerSession/;

function* routeFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) yield* routeFiles(p);
    else if (entry === "route.ts" || entry === "route.tsx") yield p;
  }
}

describe("route auth coverage", () => {
  it("every API route carries an auth mechanism or is exempt", () => {
    const violations: string[] = [];
    for (const file of routeFiles(API_DIR)) {
      const rel = relative(API_DIR, file).replace(/\/route\.tsx?$/, "");
      if (AUTH_EXEMPT.has(rel)) continue;
      const src = readFileSync(file, "utf8");
      if (!AUTH_RE.test(src)) violations.push(rel);
    }
    expect(
      violations,
      `API routes with no auth mechanism — either call requirePermission/requireUser, check a secret/signature, or justify an exemption in AUTH_EXEMPT:\n${violations.join("\n")}`,
    ).toEqual([]);
  });
});
