import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { prisma } from "@nirman/db";
import { PlaygroundCanvas } from "@/components/playground/playground-canvas";
import { PageLoading } from "@/components/page-loading";
import { getCompany, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { NoAccess } from "@/components/no-access";
import type { WorkspaceGraph } from "@/lib/modules/registry";

export const metadata = { title: "Edit Workspace · Nirman" };

export default function EditPlaygroundPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PageLoading label="Loading workspace…" />}>
      <EditPlaygroundContent params={params} />
    </Suspense>
  );
}

async function EditPlaygroundContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await connection();
  const role = await getUserRole();
  if (!hasPermission(role, PERM.CANVAS_VIEW)) {
    return <NoAccess />;
  }
  const company = await getCompany();
  const ws = await prisma.customWorkspace.findFirst({ where: { id, deletedAt: null, companyId: company.id } });
  if (!ws) notFound();

  return (
    <div className="space-y-5">
      <PlaygroundCanvas
        mode="edit"
        workspaceId={ws.id}
        initialGraph={ws.graphJson as unknown as WorkspaceGraph}
        initialName={ws.name}
        initialDescription={ws.description ?? undefined}
        initialIcon={ws.icon}
      />
    </div>
  );
}
