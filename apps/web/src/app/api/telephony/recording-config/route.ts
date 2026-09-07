import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { logAction } from "@nirman/services";

/**
 * GET /api/telephony/recording-config
 *
 * Returns the company's call recording mode (ALL | SELECTED | NONE)
 * and the list of staff members with their `recordCalls` flag.
 *
 * Requires TELEPHONY_VIEW.
 */
export const GET = apiHandler(async () => {
  await requirePermission(PERM.TELEPHONY_VIEW);
  const company = await getCompany();

  const memberships = await prisma.userCompany.findMany({
    where: { companyId: company.id, user: { isHidden: { not: true } } },
    select: {
      id: true,
      recordCalls: true,
      user: { select: { id: true, name: true, role: true, active: true } },
    },
    orderBy: { user: { name: "asc" } },
  });

  return json({
    recordingMode: company.recordingMode,
    members: memberships.map((m) => ({
      id: m.id,
      userId: m.user.id,
      name: m.user.name,
      role: m.user.role,
      active: m.user.active,
      recordCalls: m.recordCalls,
    })),
  });
});

/**
 * PATCH /api/telephony/recording-config
 *
 * Body: { recordingMode: "ALL" | "SELECTED" | "NONE", selectedUserIds?: string[] }
 *
 * Updates the recording mode. When mode is "SELECTED", the
 * `selectedUserIds` array contains User IDs whose calls should be
 * recorded — all other members get `recordCalls` set to false.
 *
 * Requires TELEPHONY_MANAGE (OWNER only in practice).
 */
export const PATCH = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.TELEPHONY_MANAGE);
  const company = await getCompany();

  const body = await req.json().catch(() => ({}));
  const mode = body.recordingMode as string | undefined;
  const selectedUserIds = body.selectedUserIds as string[] | undefined;

  if (!mode || !["ALL", "SELECTED", "NONE"].includes(mode)) {
    return json({ error: "recordingMode must be ALL, SELECTED, or NONE" }, { status: 400 });
  }

  // Update the company's recording mode
  await prisma.company.update({
    where: { id: company.id },
    data: { recordingMode: mode },
  });

  // If SELECTED mode, update the recordCalls flag on each membership.
  // selectedUserIds is an array of User IDs (not UserCompany IDs) —
  // we set recordCalls=true for those and false for everyone else.
  if (mode === "SELECTED") {
    const selected = new Set((selectedUserIds ?? []).filter(Boolean));

    // Set recordCalls=true for selected users
    if (selected.size > 0) {
      await prisma.userCompany.updateMany({
        where: {
          companyId: company.id,
          userId: { in: Array.from(selected) },
        },
        data: { recordCalls: true },
      });
    }

    // Set recordCalls=false for everyone else
    await prisma.userCompany.updateMany({
      where: {
        companyId: company.id,
        ...(selected.size > 0 ? { userId: { notIn: Array.from(selected) } } : {}),
      },
      data: { recordCalls: false },
    });
  }

  await logAction(prisma, {
    userId: user.id,
    companyId: company.id,
    action: "TELEPHONY_RECORDING_CONFIG_UPDATE",
    entityType: "Company",
    entityId: company.id,
    after: { recordingMode: mode, selectedUserIds: selectedUserIds ?? [] },
  });

  return json({ ok: true, recordingMode: mode });
});
