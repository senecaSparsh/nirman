import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { z } from "zod";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { validateGraph, type GraphIssue } from "@/lib/modules/validation";
import { MODULES, type ModelKey, type WorkspaceGraph } from "@/lib/modules/registry";

const hopSchema = z.object({
  field: z.string(),
  toModel: z.string(),
  many: z.boolean(),
});

const attachmentSchema = z.object({
  id: z.string(),
  type: z.enum(["file", "link"]),
  url: z.string(),
  fileName: z.string().optional(),
  mimeType: z.string().optional(),
  size: z.number().optional(),
  title: z.string(),
  tags: z.array(z.string()).default([]),
  createdAt: z.string(),
});

const customFieldSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.string(),
});

const noteSchema = z.object({
  id: z.string(),
  text: z.string(),
  createdAt: z.string(),
});

const graphSchema = z.object({
  nodes: z.array(
    z.object({
      id: z.string(),
      model: z.string(),
      x: z.number(),
      y: z.number(),
      kind: z.enum(["inform", "active", "finished", "assumption"]).optional(),
      assigneeId: z.string().optional().nullable(),
      attachments: z.array(attachmentSchema).optional(),
      dueDate: z.string().optional().nullable(),
      priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
      notes: z.array(noteSchema).optional(),
      customFields: z.array(customFieldSchema).optional(),
    }),
  ),
  edges: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      relationLabel: z.string(),
      toModel: z.string(),
      hops: z.array(hopSchema),
      label: z.string().optional().nullable(),
    }),
  ),
  rootId: z.string(),
});

const workspaceSchema = z.object({
  name: z.string().min(1, "Name is required").max(80),
  description: z.string().max(300).optional().nullable(),
  icon: z.string().max(60).default("LayoutDashboard"),
  graph: graphSchema,
});

export const GET = apiHandler(async () => {
  await requirePermission(PERM.CANVAS_VIEW);
  const company = await getCompany();
  const workspaces = await prisma.customWorkspace.findMany({
    where: { deletedAt: null, companyId: company.id },
    orderBy: { createdAt: "desc" },
  });
  return json(workspaces);
});

export const POST = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.CANVAS_CREATE);
  const body = await req.json();
  const parsed = workspaceSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const graph = parsed.data.graph as unknown as WorkspaceGraph;
  const { graph: _graph, ...rest } = parsed.data;

  // root model must be a known module
  const rootNode = graph.nodes.find((n) => n.id === graph.rootId);
  if (!rootNode || !MODULES[rootNode.model as ModelKey]) {
    return json({ error: "Invalid root module." }, { status: 400 });
  }

  const issues: GraphIssue[] = validateGraph(graph);
  if (issues.length > 0) {
    return json({ error: issues[0]?.message ?? "Invalid graph." }, { status: 400 });
  }

  const company = await getCompany();

  const created = await prisma.customWorkspace.create({
    data: {
      ...rest,
      rootModel: rootNode.model,
      graphJson: graph as any,
      companyId: company.id,
    },
  });
  return json(created, { status: 201 });
});
