import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { seedChartOfAccounts } from "@nirman/services";
import { PERM } from "@/lib/roles";
import { apiHandler, json, requirePermission } from "@/lib/server";

/**
 * GET /api/gl/accounts
 * Returns the chart of accounts (all GlAccount rows), ordered by code.
 * Auto-seeds if the table is empty (e.g. after db:push without re-running seed).
 */
export const GET = apiHandler(async (_req: NextRequest) => {
  await requirePermission(PERM.FINANCE_VIEW);
  let accounts = await prisma.glAccount.findMany({
    orderBy: { code: "asc" },
    select: { code: true, name: true, type: true, isSystem: true, description: true },
  });
  if (accounts.length === 0) {
    await seedChartOfAccounts();
    accounts = await prisma.glAccount.findMany({
      orderBy: { code: "asc" },
      select: { code: true, name: true, type: true, isSystem: true, description: true },
    });
  }
  return json(accounts);
});

/**
 * POST /api/gl/accounts
 * Re-seeds the chart of accounts (idempotent — upserts each account).
 * Use after db:push or database reset to ensure all system accounts exist.
 */
export const POST = apiHandler(async (_req: NextRequest) => {
  await requirePermission(PERM.FINANCE_VIEW);
  await seedChartOfAccounts();
  const accounts = await prisma.glAccount.findMany({
    orderBy: { code: "asc" },
    select: { code: true, name: true, type: true, isSystem: true, description: true },
  });
  return json({ ok: true, count: accounts.length });
});
