import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { normalizePhone } from "@/lib/phone-otp";
import { logAction } from "@nirman/services";

/**
 * GET /api/telephony/numbers — list company phone numbers with assignment info.
 * Requires TELEPHONY_VIEW.
 *
 * Query params: page, limit (pagination)
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.TELEPHONY_VIEW);
  const company = await getCompany();

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10) || 50));

  const [numbers, total] = await Promise.all([
    prisma.companyPhone.findMany({
      where: { companyId: company.id, deletedAt: null },
      orderBy: { acquiredAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        _count: { select: { calls: true, assignments: true } },
      },
    }),
    prisma.companyPhone.count({ where: { companyId: company.id, deletedAt: null } }),
  ]);

  return json({ data: numbers, total, page, limit });
});

/**
 * POST /api/telephony/numbers — add a new company phone number.
 * Requires TELEPHONY_MANAGE.
 *
 * Body: {
 *   phoneNumber, numberType?, provider?, providerNumberId?,
 *   department?, label?, monthlyCost?, consentBeep?
 * }
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.TELEPHONY_MANAGE);
  const company = await getCompany();

  const body = await req.json();
  const {
    phoneNumber,
    numberType,
    provider,
    providerNumberId,
    department,
    label,
    monthlyCost,
    consentBeep,
  } = body as {
    phoneNumber?: string;
    numberType?: string;
    provider?: string;
    providerNumberId?: string;
    department?: string;
    label?: string;
    monthlyCost?: number;
    consentBeep?: boolean;
  };

  if (!phoneNumber || typeof phoneNumber !== "string" || !phoneNumber.trim()) {
    return json({ error: "phoneNumber is required" }, { status: 400 });
  }

  // Validate phone number format — must be at least 7 digits after
  // stripping non-digit characters (allows +, spaces, dashes in display).
  const digitCount = phoneNumber.replace(/\D/g, "").length;
  if (digitCount < 7 || digitCount > 15) {
    return json({ error: "phoneNumber must contain 7-15 digits" }, { status: 400 });
  }

  // Validate numberType enum
  const validTypes = ["VIRTUAL", "MOBILE", "LANDLINE", "TOLL_FREE"];
  const finalType = numberType ?? "VIRTUAL";
  if (!validTypes.includes(finalType)) {
    return json({ error: `numberType must be one of: ${validTypes.join(", ")}` }, { status: 400 });
  }

  const normalized = normalizePhone(phoneNumber);

  // Check for duplicate normalized number in this company
  const existing = await prisma.companyPhone.findFirst({
    where: { companyId: company.id, phoneNormalized: normalized, deletedAt: null },
  });
  if (existing) {
    return json({ error: "This phone number is already registered for this company" }, { status: 409 });
  }

  const phone = await prisma.companyPhone.create({
    data: {
      companyId: company.id,
      phoneNumber: phoneNumber.trim(),
      phoneNormalized: normalized,
      numberType: finalType,
      provider: provider ?? null,
      providerNumberId: providerNumberId ?? null,
      department: department ?? null,
      label: label ?? null,
      monthlyCost: monthlyCost ?? null,
      consentBeep: consentBeep ?? null,
    },
  });

  await logAction(prisma, {
    userId: user.id,
    companyId: company.id,
    action: "COMPANY_PHONE_CREATE",
    entityType: "CompanyPhone",
    entityId: phone.id,
    after: { phoneNumber: phone.phoneNumber, numberType: phone.numberType },
  });

  return json(phone, { status: 201 });
});
