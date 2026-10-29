import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { generateOfferLetter, autoCompleteOnboarding, sendNotification, HrError } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission, assertCanManageEmployee } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * POST /api/employees/[id]/generate-offer-letter — generate (or regenerate)
 * the offer letter for this employee. Sets offerLetterStatus = ISSUED
 * and creates an EntityAttachment linking the print page to the profile.
 *
 * The offer letter is a print-friendly document at:
 *   /print/offer-letter/[id]
 *
 * Requires HR_MANAGE.
 */
export const POST = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requirePermission(PERM.HR_MANAGE);
  const company = await getCompany();
  const { id } = await params;

  try {
    await assertCanManageEmployee(id, company.id);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Hierarchy violation" }, { status: 403 });
  }

  try {
    const result = await generateOfferLetter(id, company.id, session.id);

    // Auto-complete onboarding if all steps are now done
    await autoCompleteOnboarding(id, company.id).catch(() => {});

    // Send the candidate their private accept link — the offer only works
    // if it actually reaches them. Email when they have a real address;
    // SMS to their phone otherwise (phone-first employees carry synthetic
    // @nirman.internal addresses that no mail server can reach).
    // Best-effort: generation never fails on a send failure; the response
    // reports offerSent honestly.
    let offerSent = false;
    if (result.offerToken) {
      const emp = await prisma.employee.findFirst({
        where: { id, companyId: company.id },
        select: { name: true, email: true, phone: true },
      });
      const realEmail = emp?.email && !emp.email.endsWith("@nirman.internal") ? emp.email : null;
      const target = realEmail
        ? { channel: "EMAIL" as const, recipient: realEmail }
        : emp?.phone
          ? { channel: "SMS" as const, recipient: emp.phone }
          : null;
      if (emp && target) {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
        const acceptUrl = `${appUrl}/accept/offer/${result.offerToken}`;
        const r = await sendNotification({
          companyId: company.id,
          eventType: "OFFER_LETTER",
          channel: target.channel,
          recipient: target.recipient,
          recipientName: emp.name,
          subject: `Your offer letter from ${company.name}`,
          message:
            `Dear ${emp.name},\n\n` +
            `${company.name} has issued your offer letter. Review and accept it securely here:\n` +
            `${acceptUrl}\n\n` +
            `This link is unique to you — please do not forward it.`,
        }).catch(() => null);
        offerSent = r?.status === "SENT";
      }
    }

    revalidatePath(`/hr/employees/${id}`);
    revalidatePath(`/m/hr/employees/${id}`);
    revalidatePath(`/m/hr/onboarding/${id}`);
    revalidatePath("/m/hr/onboarding");

    return json({
      ok: true,
      ...result,
      offerSent,
      message: offerSent
        ? "Offer letter generated and sent to the candidate."
        : "Offer letter generated. Open it to review and print.",
    });
  } catch (err: unknown) {
    if (err instanceof HrError) {
      return json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
});
