import { Suspense } from "react";
import { connection } from "next/server";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { ErrorConsole } from "@/components/dev/error-console";
import { getUserRole } from "@/lib/server";

export const metadata = { title: "Error Console · Nirman" };

/**
 * /m/dev/errors — the error console inside the mobile shell, so the
 * developer can triage production errors from a phone. DEVELOPER only.
 */
export default async function MobileDevErrorsPage() {
  await connection();
  const role = await getUserRole();
  if (role !== "DEVELOPER") {
    return (
      <div className="p-4 text-center">
        <p className="text-m-body" style={{ color: "var(--color-ink-500)" }}>
          Only the developer can view the error console.
        </p>
      </div>
    );
  }
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <ErrorConsole bare />
    </Suspense>
  );
}
