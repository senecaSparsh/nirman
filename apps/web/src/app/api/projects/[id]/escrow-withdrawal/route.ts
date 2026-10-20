import { type NextRequest } from "next/server";
import { z } from "zod";
import { apiHandler, getCompany, json, requireEffectivePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { recordEscrowWithdrawal, voidEscrowWithdrawal } from "@nirman/services";

const postSchema = z.object({
  amount: z.coerce.number().positive(),
  purpose: z.string().min(1),
  engineerName: z.string().min(1),
  architectName: z.string().min(1),
  caName: z.string().min(1),
  certificateUrl: z.string().optional(),
});

/** POST — record a certified RERA escrow withdrawal (posts Dr Cash/Cr 1060). */
export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireEffectivePermission(PERM.FINANCE_MANAGE);
  const { id } = await params;
  await getCompany();
  const body = await req.json();
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const w = await recordEscrowWithdrawal({ projectId: id, postedById: user.id, ...parsed.data });
  return json(w, { status: 201 });
});

const deleteSchema = z.object({ withdrawalId: z.string(), voidReason: z.string().min(1) });

/** DELETE — void a wrongly-recorded withdrawal (JE reverses, row stays). */
export const DELETE = apiHandler(async (req: NextRequest) => {
  const user = await requireEffectivePermission(PERM.FINANCE_MANAGE);
  const body = await req.json();
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const w = await voidEscrowWithdrawal({ withdrawalId: parsed.data.withdrawalId, voidReason: parsed.data.voidReason, postedById: user.id });
  return json(w);
});
