import { NextRequest } from "next/server";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "@nirman/db";
import { ALL_ROLES, type Role } from "@/lib/roles";
import { json } from "@/lib/server";

/**
 * POST /api/auth/demo-login — one-click login provisioning (DEV ONLY).
 *
 * Body: `{ role: "OWNER" | "ADMIN" | "MANAGER" | "SUPERVISOR" | "SALES" | "ACCOUNTANT" }`
 *
 * This endpoint does NOT create a session. It guarantees that a user with
 * the requested role exists AND has a credential Account with the shared
 * demo password, then returns `{ email, password }`. The caller (the
 * sign-in page) feeds those into `authClient.signIn.email({ email,
 * password })`, which goes through the real Better-Auth sign-in flow —
 * so the session cookie, session record and `/api/me` all behave exactly
 * as a manual login would. One-click login therefore exercises the real
 * auth pipeline rather than sidestepping it.
 *
 * It is hard-gated to non-production: in production (without
 * AUTH_BYPASS=true) it returns 403. The demo password is a constant
 * ("nirman123") — sufficient for local dev, never a real secret.
 *
 * Why provisioning lives here instead of the seed: the seed creates
 * `User` rows directly (without Account/password rows) because the seed
 * runs in the services package and doesn't import the web app's auth
 * config. This route is the one place that owns the demo password, so
 * re-running it after a re-seed always restores login-ability without
 * needing to re-run the seed.
 */
const DEMO_PASSWORD = "nirman123";

// Demo accounts for the 6 most common roles (shown as quick-login buttons).
// The other 7 roles can be created via the Team management UI.
const DEMO_ROLES: Role[] = ["OWNER", "ADMIN", "PROJECT_MANAGER", "SUPERVISOR", "SALES_MANAGER", "ACCOUNTANT"];

const ROLE_NAMES: Partial<Record<Role, string>> = {
  OWNER: "Amit Patil",
  ADMIN: "Anita Rao",
  PROJECT_MANAGER: "Sneha Kulkarni",
  SUPERVISOR: "Ravi Deshmukh",
  SALES_MANAGER: "Karan Mehta",
  ACCOUNTANT: "Priya Nair",
};

const ROLE_EMAILS: Partial<Record<Role, string>> = {
  OWNER: "amit@nirman.in",
  ADMIN: "anita@nirman.in",
  PROJECT_MANAGER: "sneha@nirman.in",
  SUPERVISOR: "ravi@nirman.in",
  SALES_MANAGER: "karan@nirman.in",
  ACCOUNTANT: "priya@nirman.in",
};

export const POST = async (req: NextRequest) => {
  // Hard dev-only gate. Demo login is NEVER available in production,
  // even if AUTH_BYPASS is accidentally set.
  if (process.env.NODE_ENV === "production") {
    return json({ error: "Demo login is disabled in production." }, { status: 403 });
  }

  let body: { role?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const role = body.role as Role | undefined;
  if (!role || !DEMO_ROLES.includes(role)) {
    return json({ error: `role must be one of: ${DEMO_ROLES.join(", ")}` }, { status: 400 });
  }

  const email = ROLE_EMAILS[role]!;
  const name = ROLE_NAMES[role]!;
  const hashed = await hashPassword(DEMO_PASSWORD);

  // Resolve (or create) the user for this role, then ensure they have a
  // credential Account with the demo password. Everything in one
  // transaction so a partial failure can't leave a passwordless account.
  const result = await prisma.$transaction(async (tx) => {
    // Prefer an existing user that already has this role (matches seed).
    let user = await tx.user.findFirst({
      where: { role },
      select: { id: true, email: true, name: true, role: true, companyId: true },
    });

    // Otherwise fall back to the canonical demo email for the role, then
    // to creating a fresh user.
    if (!user) {
      user = await tx.user.findUnique({
        where: { email },
        select: { id: true, email: true, name: true, role: true, companyId: true },
      });
    }

    if (!user) {
      const company = await tx.company.findFirst({
        where: { deletedAt: null },
        select: { id: true },
      });
      user = await tx.user.create({
        data: {
          email,
          name,
          role,
          emailVerified: true,
          companyId: company?.id ?? null,
        },
        select: { id: true, email: true, name: true, role: true, companyId: true },
      });
      if (company) {
        await tx.userCompany.create({
          data: { userId: user.id, companyId: company.id, role },
        });
      }
    }

    // Ensure the role on the User row matches the requested role so the
    // one-click button always lands you in the right experience.
    if (user.role !== role) {
      await tx.user.update({ where: { id: user.id }, data: { role } });
    }

    // Upsert the credential Account with the demo password. Better-Auth
    // looks up accounts by (providerId="credential", accountId=user.id).
    const existing = await tx.account.findFirst({
      where: { userId: user.id, providerId: "credential" },
      select: { id: true },
    });
    if (existing) {
      await tx.account.update({
        where: { id: existing.id },
        data: { password: hashed },
      });
    } else {
      await tx.account.create({
        data: {
          userId: user.id,
          providerId: "credential",
          accountId: user.id,
          password: hashed,
        },
      });
    }

    return user;
  });

  return json({ email: result.email, password: DEMO_PASSWORD, role });
};
