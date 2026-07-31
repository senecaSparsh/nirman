import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { prisma } from "@nirman/db";
import { WorkspaceExplorer } from "@/components/playground/workspace-explorer";
import { PageLoading } from "@/components/page-loading";
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
  const { id } = await params;
  const ws = await prisma.customWorkspace.findFirst({ where: { id, deletedAt: null } });
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
