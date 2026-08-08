import { prisma } from "@nirman/db";
import {
  MODULES,
  SOFT_DELETE_MODELS,
  type Hop,
  type LiveGraph,
  type LiveNode,
  type ModelKey,
  type ModuleDef,
} from "./registry";

// ───────────────────────────────────────────────────────────
//  Drill resolver — given a saved graph edge (a chain of
//  relational hops) and a parent record id, fetch the live
//  child records. Everything is built dynamically off the
//  registry so the playground needs no per-module code.
// ───────────────────────────────────────────────────────────

/** Walk a dotted field path ("material.name") on an object. */
export function getField(obj: unknown, path: string): unknown {
  if (obj == null) return undefined;
  if (!path.includes(".")) return (obj as Record<string, unknown>)[path];
  let cur: unknown = obj;
  for (const part of path.split(".")) {
    if (cur == null) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/** Build `{ include: { rel: { select: { f: true } } } }` for the dotted relation fields a module displays. */
function leafRelationInclude(mod: ModuleDef): Record<string, unknown> | undefined {
  const paths = [mod.displayField, mod.secondaryField, ...mod.columns.map((c) => c.field)].filter(
    Boolean,
  ) as string[];
  const include: Record<string, unknown> = {};
  for (const p of paths) {
    if (!p.includes(".")) continue;
    const [rel, ...rest] = p.split(".");
    if (!rel || rest.length === 0) continue;
    // nested relation select (supports one level deep, which covers our registry)
    if (rest.length === 1) {
      include[rel!] = { select: { [rest[0]!]: true } };
    } else {
      // deeper dotted path — build nested selects
      const leaf = rest[rest.length - 1]!;
      let node: Record<string, unknown> = { [leaf]: true };
      for (let i = rest.length - 2; i >= 1; i--) {
        node = { [rest[i]!]: { select: node } };
      }
      include[rel!] = { select: { [rest[0]!]: { select: node } } };
    }
  }
  return Object.keys(include).length ? include : undefined;
}

/** Build the nested Prisma select for a chain of hops, with the leaf returning all scalars + dotted relations. */
function buildChainSelect(hops: Hop[], leafMod: ModuleDef, take?: number): Record<string, unknown> {
  const leafInclude = leafRelationInclude(leafMod);

  function buildFrom(idx: number): Record<string, unknown> {
    const hop = hops[idx];
    if (!hop) return {} as Record<string, unknown>;
    const isLast = idx === hops.length - 1;
    // Filter soft-deleted models at EVERY hop level (not just the leaf)
    const softDelete = SOFT_DELETE_MODELS.has(hop.toModel);
    const where = softDelete ? { deletedAt: null } : undefined;

    if (isLast) {
      // Leaf: include dotted relations; returns all scalar fields of the leaf by default.
      const args: Record<string, unknown> = {};
      if (where) args.where = where;
      if (hop.many && take) args.take = take;
      if (leafInclude) args.include = leafInclude;
      return { [hop.field]: args };
    }

    // Intermediate: only select the next hop field.
    const args: Record<string, unknown> = {};
    if (where) args.where = where;
    if (hop.many && take) args.take = take;
    args.select = buildFrom(idx + 1);
    return { [hop.field]: args };
  }

  return buildFrom(0);
}

/** Walk the nested result following hops, collecting leaf records. */
function walkLeaves(value: unknown, hops: Hop[], idx: number, out: Record<string, unknown>[]): void {
  if (value == null) return;
  const hop = hops[idx];
  if (!hop) return;
  const isLast = idx === hops.length - 1;
  if (isLast) {
    if (hop.many) {
      if (Array.isArray(value)) for (const r of value) out.push(r as Record<string, unknown>);
    } else {
      out.push(value as Record<string, unknown>);
    }
    return;
  }
  const nextField = hops[idx + 1]?.field;
  if (!nextField) return;
  if (hop.many) {
    if (Array.isArray(value)) for (const item of value) walkLeaves(item?.[nextField], hops, idx + 1, out);
  } else {
    walkLeaves((value as Record<string, unknown>)?.[nextField], hops, idx + 1, out);
  }
}

/** List root-level records for the workspace's root module (company-scoped where applicable). */
export async function listRoot(model: ModelKey, companyId: string): Promise<Record<string, unknown>[]> {
  const mod = MODULES[model];
  if (mod.scope === "company-root") {
    const c = await prisma.company.findFirst({ where: { id: companyId, deletedAt: null } });
    return c ? [c] : [];
  }
  const where: Record<string, unknown> = {};
  if (mod.softDelete) where.deletedAt = null;
  if (mod.scope === "company") where.companyId = companyId;
  const include = leafRelationInclude(mod);
  const rows = await (prisma as unknown as Record<string, { findMany: (args: Record<string, unknown>) => Promise<Record<string, unknown>[]> }>)[model]!.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    ...(include ? { include } : {}),
  });
  return rows;
}

/** Fetch a single record by id (for breadcrumb titles / detail). */
export async function findRecord(model: ModelKey, id: string): Promise<Record<string, unknown> | null> {
  const mod = MODULES[model];
  const include = leafRelationInclude(mod);
  return (prisma as unknown as Record<string, { findUnique: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null> }>)[model]!.findUnique({
    where: { id },
    ...(include ? { include } : {}),
  });
}

/** Fetch the live child records along a saved edge, given the parent record id. */
export async function listChildren(
  parentModel: ModelKey,
  parentId: string,
  hops: Hop[],
  leafModel: ModelKey,
): Promise<Record<string, unknown>[]> {
  return listChildrenCapped(parentModel, parentId, hops, leafModel);
}

/** Same as listChildren but caps each to-many hop to `take` records (for the live graph). */
export async function listChildrenCapped(
  parentModel: ModelKey,
  parentId: string,
  hops: Hop[],
  leafModel: ModelKey,
  take?: number,
): Promise<Record<string, unknown>[]> {
  const leafMod = MODULES[leafModel];
  const select = buildChainSelect(hops, leafMod, take);
  const parent = await (prisma as unknown as Record<string, { findUnique: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null> }>)[parentModel]!.findUnique({
    where: { id: parentId },
    select,
  });
  if (!parent) return [];
  const firstHop = hops[0];
  if (!firstHop) return [];
  const out: Record<string, unknown>[] = [];
  walkLeaves(parent[firstHop.field], hops, 0, out);
  // dedupe by id (through-relations can yield the same leaf many times)
  const seen = new Set<string>();
  const deduped: Record<string, unknown>[] = [];
  for (const r of out) {
    if (!r || seen.has(r.id as string)) continue;
    seen.add(r.id as string);
    deduped.push(r);
  }
  return deduped;
}

// ───────────────────────────────────────────────────────────
//  Live data graph — auto-traverse the real DB from the active
//  company outward through every registry relation, producing a
//  read-only DAG. Records reachable from more than one parent
//  (e.g. a StockLocation under both Company and a Project) are
//  rendered once and flagged as "shared". Cycles are avoided by
//  skipping any edge that points back at an ancestor in the BFS
//  tree.
// ───────────────────────────────────────────────────────────

const LIVE_MAX_DEPTH = 3;
const LIVE_MAX_PER_RELATION = 25;
const LIVE_MAX_NODES = 200;

/** Walk the BFS-tree parent pointers to test whether `candidate` is an ancestor of `node`. */
function isAncestor(candidate: string, node: string, parentOf: Map<string, string>): boolean {
  let cur: string | undefined = parentOf.get(node);
  let guard = 0;
  while (cur && guard++ < 1000) {
    if (cur === candidate) return true;
    cur = parentOf.get(cur);
  }
  return false;
}

/**
 * Build the live data graph for the active company. One node per real
 * record, edges per registry relation. Shared nodes (>=2 incoming edges)
 * are returned in `sharedIds`. Traversal is capped by depth / per-relation
 * / total-node limits; `truncated` is set when a cap is hit.
 */
export async function buildLiveGraph(companyId: string): Promise<LiveGraph> {
  const company = await prisma.company.findFirst({ where: { id: companyId, deletedAt: null } });
  if (!company) {
    return { nodes: [], edges: [], rootId: "", sharedIds: [], truncated: false };
  }

  const nodes = new Map<string, LiveNode>();
  const incoming = new Map<string, number>();
  const edges: { from: string; to: string; relationLabel: string; label: string; hops: Hop[]; toModel: ModelKey }[] = [];
  const edgeKeys = new Set<string>();
  const parentOf = new Map<string, string>();
  let truncated = false;

  const rootId = `Company:${company.id}`;
  nodes.set(rootId, {
    id: rootId,
    model: "Company",
    recordId: company.id,
    label: String(company.name ?? "Company"),
    secondary: (company as Record<string, unknown>).currency as string | null,
    depth: 0,
  });
  incoming.set(rootId, 0);

  const queue: { nodeId: string; model: ModelKey; recordId: string; depth: number }[] = [
    { nodeId: rootId, model: "Company", recordId: company.id, depth: 0 },
  ];

  while (queue.length > 0) {
    if (nodes.size >= LIVE_MAX_NODES) {
      truncated = true;
      break;
    }
    const item = queue.shift()!;
    if (item.depth >= LIVE_MAX_DEPTH) continue;

    const mod = MODULES[item.model];
    for (const rel of mod.relations) {
      if (nodes.size >= LIVE_MAX_NODES) {
        truncated = true;
        break;
      }
      let children: Record<string, unknown>[] = [];
      try {
        children = await listChildrenCapped(item.model, item.recordId, rel.hops, rel.toModel, LIVE_MAX_PER_RELATION);
      } catch {
        // A relation field may not exist on the model (registry drift) — skip it.
        continue;
      }
      for (const child of children) {
        if (nodes.size >= LIVE_MAX_NODES) {
          truncated = true;
          break;
        }
        if (!child || !child.id) continue;
        const childModel = rel.toModel;
        const childId = `${childModel}:${child.id}`;

        // Avoid cycles: never add an edge back to an ancestor of the current node.
        if (isAncestor(childId, item.nodeId, parentOf)) continue;

        const ekey = `${item.nodeId}->${childId}:${rel.label}`;
        if (!edgeKeys.has(ekey)) {
          edgeKeys.add(ekey);
          edges.push({
            from: item.nodeId,
            to: childId,
            relationLabel: rel.label,
            label: rel.label,
            hops: rel.hops,
            toModel: childModel,
          });
          incoming.set(childId, (incoming.get(childId) ?? 0) + 1);
        }

        if (!nodes.has(childId)) {
          const cmod = MODULES[childModel];
          const labelRaw = getField(child, cmod.displayField);
          const label = labelRaw != null && labelRaw !== "" ? String(labelRaw) : cmod.label;
          let secondary: string | null = null;
          if (cmod.secondaryField) {
            const secRaw = getField(child, cmod.secondaryField);
            secondary = secRaw != null && secRaw !== "" ? String(secRaw) : null;
          }
          nodes.set(childId, {
            id: childId,
            model: childModel,
            recordId: child.id as string,
            label,
            secondary,
            depth: item.depth + 1,
          });
          parentOf.set(childId, item.nodeId);
          queue.push({ nodeId: childId, model: childModel, recordId: child.id as string, depth: item.depth + 1 });
        }
      }
    }
  }

  const sharedIds = [...incoming.entries()].filter(([, c]) => c > 1).map(([id]) => id);

  return {
    nodes: [...nodes.values()],
    edges,
    rootId,
    sharedIds,
    truncated,
  };
}
