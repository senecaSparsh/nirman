import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { z } from "zod";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { validateGraph } from "@/lib/modules/validation";
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

const updateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(300).optional().nullable(),
  icon: z.string().max(60).optional(),
  graph: graphSchema.optional(),
});

export const GET = apiHandler(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.CANVAS_VIEW);
  const { id } = await ctx.params;
  const company = await getCompany();
  const ws = await prisma.customWorkspace.findFirst({ where: { id, deletedAt: null, companyId: company.id } });
  if (!ws) return json({ error: "Workspace not found" }, { status: 404 });
  return json(ws);
});

export const PUT = apiHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.CANVAS_EDIT);
  const { id } = await ctx.params;
  const company = await getCompany();
  const existing = await prisma.customWorkspace.findFirst({ where: { id, deletedAt: null, companyId: company.id } });
  if (!existing) return json({ error: "Workspace not found" }, { status: 404 });

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.description !== undefined) data.description = parsed.data.description;
  if (parsed.data.icon !== undefined) data.icon = parsed.data.icon;

  if (parsed.data.graph) {
    const graph = parsed.data.graph as unknown as WorkspaceGraph;
    const rootNode = graph.nodes.find((n) => n.id === graph.rootId);
    if (!rootNode || !MODULES[rootNode.model as ModelKey]) {
      return json({ error: "Invalid root module." }, { status: 400 });
    }
    const issues = validateGraph(graph);
    if (issues.length > 0) return json({ error: issues[0]?.message ?? "Invalid graph." }, { status: 400 });
    data.graphJson = graph as any;
    data.rootModel = rootNode.model;
  }

  const updated = await prisma.customWorkspace.update({ where: { id }, data });
  return json(updated);
});

export const DELETE = apiHandler(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.CANVAS_EDIT);
  const { id } = await ctx.params;
  const company = await getCompany();
  const existing = await prisma.customWorkspace.findFirst({ where: { id, deletedAt: null, companyId: company.id } });
  if (!existing) return json({ error: "Workspace not found" }, { status: 404 });
  await prisma.customWorkspace.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  return json({ ok: true });
});
