import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { prisma } from "@nirman/db";
import { WorkspaceExplorer } from "@/components/playground/workspace-explorer";
import { PageLoading } from "@/components/page-loading";
import { getCompany, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { NoAccess } from "@/components/no-access";
import type { WorkspaceGraph } from "@/lib/modules/registry";

export const metadata = { title: "Workspace · Nirman" };

export default function WorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PageLoading label="Loading workspace…" />}>
      <WorkspaceContent params={params} />
    </Suspense>
  );
}

async function WorkspaceContent({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const role = await getUserRole();
  if (!hasPermission(role, PERM.CANVAS_VIEW)) {
    return <NoAccess />;
  }
  const { id } = await params;
  const company = await getCompany();
  const ws = await prisma.customWorkspace.findFirst({ where: { id, deletedAt: null, companyId: company.id } });
  if (!ws) notFound();

  const graph = ws.graphJson as unknown as WorkspaceGraph;

  return (
    <WorkspaceExplorer
      workspaceId={ws.id}
      name={ws.name}
      description={ws.description}
      graph={graph}
    />
  );
}
