import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { json } from "@/lib/server";

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
}
