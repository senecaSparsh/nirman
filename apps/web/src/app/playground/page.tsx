import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { PageHeader } from "@/components/page-header";
import { PlaygroundCanvas } from "@/components/playground/playground-canvas";
import { WorkspacesList } from "@/components/playground/workspaces-list";
import { PageLoading } from "@/components/page-loading";
import { getCompany } from "@/lib/server";

export const metadata = { title: "Workspaces · Nirman" };

export default function PlaygroundPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Workspaces"
        description="Drag the modules you've built onto the canvas, connect them into a hierarchy, and save it as a new navigation tab with a live drill-down view."
      />

      <Suspense fallback={<PageLoading label="Loading canvas…" />}>
        <PlaygroundCanvas />
      </Suspense>

      <div>
        <h2 className="mb-2 text-body font-semibold">Saved workspaces</h2>
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-10 text-meta text-muted-foreground">
              Loading saved workspaces…
            </div>
          }
        >
          <SavedWorkspaces />
        </Suspense>
      </div>
    </div>
  );
}

async function SavedWorkspaces() {
  await connection();
  const company = await getCompany();
  const workspaces = await prisma.customWorkspace.findMany({
    where: { deletedAt: null, companyId: company.id },
    orderBy: { createdAt: "desc" },
  });

  return <WorkspacesList workspaces={workspaces} />;
}
