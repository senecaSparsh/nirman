import { Suspense } from "react";
import { connection } from "next/server";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";
import { ErrorConsole } from "@/components/dev/error-console";
import { getUserRole } from "@/lib/server";

export const metadata = {
  title: "Error Console · Nirman OS",
  description: "Every client + server error across the platform, deduplicated by signature.",
};

/**
 * /dev/errors — the developer's self-healing loop: every error users hit
 * is captured, deduplicated into a signature row, and triaged
 * (resolve → auto-reopen on regression). DEVELOPER role only.
 */
export default async function DevErrorsPage() {
  await connection();
  const role = await getUserRole();
  if (role !== "DEVELOPER") {
    return <NoAccess what="the error console" />;
  }
  return (
    <Suspense fallback={<PageLoading label="Loading error console…" variant="list" />}>
      <ErrorConsole />
    </Suspense>
  );
}
