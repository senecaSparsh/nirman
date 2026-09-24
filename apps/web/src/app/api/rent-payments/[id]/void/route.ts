import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { voidRentPayment } from "@nirman/services";
import { prisma } from "@nirman/db";
import { apiHandler, json, requirePermission, getCompany } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * POST /api/rent-payments/[id]/void — void a mis-entered rent receipt.
 * Body: { reason?: string }
 *
 * The row stays for the audit trail (status → VOID) but drops out of every
 * received-sum; the posted GL entry (Dr Cash / Cr Rent Revenue) is reversed.
 */
export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.FINANCE_MANAGE);
  const { id } = await params;

  const company = await getCompany();
  const existing = await prisma.rentalPayment.findFirst({ where: { id, tenancy: { companyId: company.id } }, select: { id: true } });
  if (!existing) return json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  try {
    await voidRentPayment({ paymentId: id, companyId: company.id, userId: user.id, reason: body?.reason });
    revalidatePath("/rentals");
    revalidatePath("/m/rentals");
    return json({ ok: true });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Void failed") }, { status: 400 });
  }
});
