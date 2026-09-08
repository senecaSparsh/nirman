import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { generateAppointmentLetter, HrError } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * POST /api/employees/[id]/generate-appointment-letter — generate (or
 * regenerate) the appointment letter for this employee. Sets
 * appointmentLetterStatus = ISSUED and creates an EntityAttachment linking
 * the print page to the profile.
 *
 * The appointment letter is a print-friendly formal letter at:
 *   /print/appointment-letter/[id]
 *
 * Requires HR_MANAGE.
 */
export const POST = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requirePermission(PERM.HR_MANAGE);
  const company = await getCompany();
  const { id } = await params;

  try {
    const result = await generateAppointmentLetter(id, company.id, session.id);

    revalidatePath(`/hr/employees/${id}`);
    revalidatePath(`/m/hr/employees/${id}`);

    return json({
      ok: true,
      ...result,
      message: "Appointment letter generated. Open it to review and print.",
    });
  } catch (err: unknown) {
    if (err instanceof HrError) {
      return json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
});
