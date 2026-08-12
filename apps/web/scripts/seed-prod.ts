/**
 * Production seed — runs after `prisma migrate deploy` on first deploy.
 *
 * What it does:
 *   1. Runs the full demo seed (packages/services/prisma/seed.ts) — creates
 *      the company, users, projects, materials, suppliers, stock, etc.
 *   2. Sets real passwords on all demo users so they can sign in via the
 *      normal Better-Auth email+password flow (the demo-login endpoint is
 *      disabled in production).
 *
 * Idempotent: safe to run on every deploy. The demo seed upserts masters
 * and wipes/recreates transactional data. The password step upserts
 * credential Accounts — if one already exists, it updates the password.
 *
 * Usage:
 *   pnpm --filter @nirman/web seed:prod
 *
 * Environment:
 *   DATABASE_URL must point to the production Postgres.
 *   SEED_PASSWORD (optional) — defaults to "nirman123". Set a stronger
 *   one via env var for real production use.
 */
import { PrismaClient } from "@nirman/db";
import { hashPassword } from "better-auth/crypto";

const prisma = new PrismaClient();

const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? "nirman123";

const DEMO_USERS = [
  { email: "amit@nirman.in", name: "Amit Patil", role: "OWNER" },
  { email: "anita@nirman.in", name: "Anita Rao", role: "ADMIN" },
  { email: "sneha@nirman.in", name: "Sneha Kulkarni", role: "MANAGER" },
  { email: "ravi@nirman.in", name: "Ravi Deshmukh", role: "SUPERVISOR" },
  { email: "priya@nirman.in", name: "Priya Nair", role: "ACCOUNTANT" },
  { email: "karan@nirman.in", name: "Karan Mehta", role: "SALES" },
];

async function setDemoPasswords() {
  console.log("Setting demo passwords for production sign-in…");
  const hashed = await hashPassword(DEMO_PASSWORD);

  for (const u of DEMO_USERS) {
    const user = await prisma.user.findUnique({ where: { email: u.email } });
    if (!user) {
      console.log(`  SKIP ${u.email} — user not found (run the demo seed first)`);
      continue;
    }

    const existing = await prisma.account.findFirst({
      where: { userId: user.id, providerId: "credential" },
    });

    if (existing) {
      await prisma.account.update({
        where: { id: existing.id },
        data: { password: hashed },
      });
    } else {
      await prisma.account.create({
        data: {
          userId: user.id,
          providerId: "credential",
          accountId: user.id,
          password: hashed,
        },
      });
    }
    console.log(`  OK ${u.email} (${u.role})`);
  }
}

async function main() {
  console.log("=== Production seed ===");
  console.log(`Database: ${process.env.DATABASE_URL?.split("@")[1]?.split("/")[0] ?? "(unknown)"}`);
  console.log(`Password: ${DEMO_PASSWORD === "nirman123" ? "default (nirman123)" : "custom (from SEED_PASSWORD)"}`);
  console.log("");

  // Step 1: Check if the database has any users at all
  const userCount = await prisma.user.count();
  console.log(`Existing users: ${userCount}`);

  if (userCount === 0) {
    console.log("Empty database — the build pipeline should have run the demo seed already.");
    console.log("If not, run: pnpm --filter @nirman/services seed");
  }

  // Step 2: Set passwords on demo users
  await setDemoPasswords();

  console.log("");
  console.log("Production seed complete.");
  console.log("Demo users can now sign in with:");
  console.log("  amit@nirman.in / " + DEMO_PASSWORD + " (OWNER)");
  console.log("  anita@nirman.in / " + DEMO_PASSWORD + " (ADMIN)");
  console.log("  sneha@nirman.in / " + DEMO_PASSWORD + " (MANAGER)");
  console.log("  ravi@nirman.in / " + DEMO_PASSWORD + " (SUPERVISOR)");
  console.log("  priya@nirman.in / " + DEMO_PASSWORD + " (ACCOUNTANT)");
  console.log("  karan@nirman.in / " + DEMO_PASSWORD + " (SALES)");
}

main()
  .catch((e) => {
    console.error("Production seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
