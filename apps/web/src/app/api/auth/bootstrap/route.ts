import { NextRequest } from "next/server";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "@nirman/db";
import { json } from "@/lib/server";

/**
 * POST /api/auth/bootstrap — one-time first owner + company setup.
 *
 * Only works when the database has NO users at all (i.e. a fresh deploy).
 * Once the first owner is created, this endpoint returns 403 forever.
 *
 * Body:
 *   {
 *     ownerName: string,        // e.g. "Vardaan Rama"
 *     ownerEmail: string,       // e.g. "vardaan@nirman.in"
 *     ownerPassword: string,    // min 8 chars
 *     companyName: string,      // e.g. "Vardaan Constructions"
 *   }
 *
 * Creates:
 *   1. A Company row
 *   2. A User row with role=OWNER, linked to the company
 *   3. A UserCompany membership
 *   4. A credential Account with the hashed password (Better-Auth compatible)
 *
 * After this, the owner can sign in at /sign-in and create more users
 * from the Team settings page.
 */
/**
 * GET /api/auth/bootstrap — check if first-owner setup is needed.
 * Returns { needsBootstrap: true } when the database has zero users.
 */
export const GET = async () => {
  const userCount = await prisma.user.count();
  return json({ needsBootstrap: userCount === 0 });
};

export const POST = async (req: NextRequest) => {
  // ── Gate: only works on a completely empty database ──
  const userCount = await prisma.user.count();
  if (userCount > 0) {
    return json(
      { error: "Bootstrap is no longer available. The database already has users." },
      { status: 403 },
    );
  }

  // ── Parse and validate body ──
  let body: {
    ownerName?: string;
    ownerEmail?: string;
    ownerPassword?: string;
    companyName?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const ownerName = body.ownerName?.trim();
  const ownerEmail = body.ownerEmail?.trim().toLowerCase();
  const ownerPassword = body.ownerPassword;
  const companyName = body.companyName?.trim();

  if (!ownerName || ownerName.length < 2) {
    return json({ error: "Owner name is required (min 2 characters)." }, { status: 400 });
  }
  if (!ownerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
    return json({ error: "A valid owner email is required." }, { status: 400 });
  }
  if (!ownerPassword || ownerPassword.length < 8) {
    return json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }
  if (!companyName || companyName.length < 2) {
    return json({ error: "Company name is required (min 2 characters)." }, { status: 400 });
  }

  const hashed = await hashPassword(ownerPassword);

  // ── Create company + owner + account in one transaction ──
  const result = await prisma.$transaction(async (tx) => {
    // 1. Company
    const company = await tx.company.create({
      data: {
        name: companyName,
        businessType: "CONSTRUCTION",
      },
    });

    // 2. Owner user
    const user = await tx.user.create({
      data: {
        email: ownerEmail,
        name: ownerName,
        role: "OWNER",
        emailVerified: true,
        companyId: company.id,
      },
    });

    // 3. UserCompany membership
    await tx.userCompany.create({
      data: {
        userId: user.id,
        companyId: company.id,
        role: "OWNER",
      },
    });

    // 4. Credential account (Better-Auth compatible)
    await tx.account.create({
      data: {
        userId: user.id,
        providerId: "credential",
        accountId: user.id,
        password: hashed,
      },
    });

    return { company, user };
  });

  return json({
    ok: true,
    message: `Owner account created for ${result.user.name}. You can now sign in.`,
    company: { id: result.company.id, name: result.company.name },
    user: { id: result.user.id, email: result.user.email, name: result.user.name, role: result.user.role },
  });
};
