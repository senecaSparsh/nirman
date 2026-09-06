import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { ServiceError } from "@nirman/services";
import { json, ForbiddenError, UnauthorizedError } from "@/lib/server";

/**
 * GET /api/auth/companies?email=...
 *
 * Returns the list of companies a user belongs to, given their email.
 * Used by the sign-in page to show a company picker when a user has
 * multiple memberships. Only returns company id + name — no sensitive
 * data. If the email doesn't exist or has no memberships, returns an
 * empty array (the caller just hides the picker).
 *
 * This is a public endpoint (no auth required) — it only reveals
 * company names that a user is a member of, which is acceptable for
 * a B2B app where the email is the login key.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email")?.trim().toLowerCase();

    if (!email) {
      return json({ companies: [] });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        memberships: {
          select: {
            role: true,
            company: {
              select: { id: true, name: true, deletedAt: true },
            },
          },
        },
      },
    });

    if (!user) {
      return json({ companies: [] });
    }

    const companies = user.memberships
      .filter((m) => m.company.deletedAt === null)
      .map((m) => ({
        id: m.company.id,
        name: m.company.name,
        role: m.role,
      }));

    return json({ companies });
  } catch (err: unknown) {
    if (err instanceof ServiceError) {
      return json({ error: err.message }, { status: err.status ?? 400 });
    }
    if (err instanceof SyntaxError && err.message.includes("JSON")) {
      return json({ error: "Malformed JSON in request body" }, { status: 400 });
    }
    if (err instanceof ForbiddenError) {
      return json({ error: err.message }, { status: 403 });
    }
    if (err instanceof UnauthorizedError) {
      return json({ error: err.message }, { status: 401 });
    }
    const prismaCode = (err as { code?: string })?.code;
    if (prismaCode === "P2024") {
      console.error("[apiHandler] Prisma P2024: connection pool exhausted");
      return json({ error: "Database busy — please retry shortly", retryable: true }, { status: 503, headers: { "Retry-After": "5" } });
    }
    if (prismaCode === "P1001") {
      console.error("[apiHandler] Prisma P1001: database unreachable");
      return json({ error: "Database unreachable — please retry shortly", retryable: true }, { status: 503, headers: { "Retry-After": "10" } });
    }
    if (prismaCode === "P1002") {
      console.error("[apiHandler] Prisma P1002: database timeout");
      return json({ error: "Database request timed out — please retry", retryable: true }, { status: 504 });
    }
    console.error("[apiHandler] Unhandled error:", err);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}
