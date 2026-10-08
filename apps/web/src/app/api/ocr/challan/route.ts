import { NextRequest } from "next/server";
import { createOcrProviderFromConfig } from "@nirman/services";
import { apiHandler, getCompany, json, requireAnyPermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

/**
 * POST /api/ocr/challan
 * Read a supplier delivery challan (DC / delivery note) from a photo — the
 * paper the truck driver hands over at the gate. Extracted quantities are
 * advisory: the receiver still verifies the physical goods, and the GRN POST
 * re-validates everything server-side.
 *
 * Gated on the same permissions that can write a receipt — this endpoint
 * exists to fill that form, nothing else.
 */
const bodySchema = z.object({
  base64: z.string().optional(),
  url: z.string().url().optional(),
}).refine((d) => d.base64 || d.url, {
  message: "Either base64 or url must be provided",
});

export const POST = apiHandler(async (req: NextRequest) => {
  await requireAnyPermission(PERM.PROCUREMENT_MANAGE, PERM.INVENTORY_MANAGE);
  const company = await getCompany();
  const body = await req.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const provider = await createOcrProviderFromConfig(company.id);
  const result = await provider.extractChallan({
    base64: parsed.data.base64,
    url: parsed.data.url,
  });

  return json({ result });
}, { rateLimit: "heavy" });
