import { MODULES, relationsBetween, type GraphEdge, type GraphNode, type WorkspaceGraph } from "./registry";

export interface GraphIssue {
  message: string;
}

/**
 * Validate a saved workspace graph is a sound single-root tree whose every
 * edge maps to a real registry relation. Returns issues (empty = valid).
 */
export function validateGraph(graph: WorkspaceGraph): GraphIssue[] {
  const issues: GraphIssue[] = [];

  if (!graph.nodes || graph.nodes.length === 0) {
    issues.push({ message: "Add at least one module to the canvas." });
    return issues;
  }

  // node ids unique + models known
  const nodeIds = new Set<string>();
  for (const n of graph.nodes) {
    if (nodeIds.has(n.id)) issues.push({ message: `Duplicate node id ${n.id}.` });
    nodeIds.add(n.id);
    if (!MODULES[n.model as keyof typeof MODULES]) {
      issues.push({ message: `Unknown module "${n.model}".` });
    }
  }

  // root exists
  if (!nodeIds.has(graph.rootId)) {
    issues.push({ message: "Root node is missing." });
  }

  // edges reference existing nodes
  for (const e of graph.edges) {
    if (!nodeIds.has(e.from)) issues.push({ message: `Edge from missing node ${e.from}.` });
    if (!nodeIds.has(e.to)) issues.push({ message: `Edge to missing node ${e.to}.` });
  }

  if (issues.length) return issues;

  // DAG shape: root has no incoming; every other node is reachable (>=1
  // incoming). A node MAY have several incoming edges — that makes it a
  // "shared" node (e.g. one StockLocation under both Company and a Project).
  const incoming = new Map<string, number>();
  for (const n of graph.nodes) incoming.set(n.id, 0);
  for (const e of graph.edges) incoming.set(e.to, (incoming.get(e.to) ?? 0) + 1);

  for (const n of graph.nodes) {
    const inc = incoming.get(n.id) ?? 0;
    if (n.id === graph.rootId) {
      if (inc !== 0) issues.push({ message: "Root node must have no incoming connections." });
    } else if (inc === 0) {
      issues.push({ message: `Node is not connected to the root: ${n.id}.` });
    }
  }
  // no cycles
  if (hasCycle(graph)) issues.push({ message: "Graph contains a cycle — remove the loop." });

  // every edge must map to a real registry relation with matching hops
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  for (const e of graph.edges) {
    const from = nodeById.get(e.from);
    const to = nodeById.get(e.to);
    if (!from || !to) continue;
    const valid = relationsBetween(from.model, to.model);
    const match = valid.find((r) => r.label === e.relationLabel && r.hops.length === e.hops.length);
    if (!match) {
      issues.push({
        message: `No valid relation from ${from.model} to ${to.model} labelled "${e.relationLabel}".`,
      });
    } else {
      // verify hops match exactly
      for (let i = 0; i < match.hops.length; i++) {
        const a = match.hops[i];
        const b = e.hops[i];
        if (!a || !b || a.field !== b.field || a.toModel !== b.toModel || a.many !== b.many) {
          issues.push({ message: `Edge hops mismatch on ${from.model}→${to.model}.` });
          break;
        }
      }
    }
  }

  return issues;
}

/** Build the tree children map: nodeId -> outgoing edges. */
export function childrenMap(graph: WorkspaceGraph): Map<string, GraphEdge[]> {
  const map = new Map<string, GraphEdge[]>();
  for (const n of graph.nodes) map.set(n.id, []);
  for (const e of graph.edges) {
    const arr = map.get(e.from);
    if (arr) arr.push(e);
  }
  return map;
}

/** Find the edge between two nodes (parent -> child). */
export function edgeBetween(graph: WorkspaceGraph, fromId: string, toId: string): GraphEdge | undefined {
  return graph.edges.find((e) => e.from === fromId && e.to === toId);
}

export function nodeById(graph: WorkspaceGraph, id: string): GraphNode | undefined {
  return graph.nodes.find((n) => n.id === id);
}

/** Detect a cycle in the graph via DFS from the root (3-colour). */
function hasCycle(graph: WorkspaceGraph): boolean {
  const adj = new Map<string, string[]>();
  for (const n of graph.nodes) adj.set(n.id, []);
  for (const e of graph.edges) adj.get(e.from)?.push(e.to);

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const n of graph.nodes) color.set(n.id, WHITE);
  let cycle = false;

  const dfs = (u: string) => {
    if (cycle) return;
    color.set(u, GRAY);
    for (const v of adj.get(u) ?? []) {
      const c = color.get(v) ?? WHITE;
      if (c === GRAY) { cycle = true; return; }
      if (c === WHITE) dfs(v);
    }
    color.set(u, BLACK);
  };

  if ((color.get(graph.rootId) ?? WHITE) === WHITE) dfs(graph.rootId);
  return cycle;
}

/** Incoming-edge count per node id (a node with >1 is "shared"). */
export function incomingCounts(graph: WorkspaceGraph): Map<string, number> {
  const m = new Map<string, number>();
  for (const n of graph.nodes) m.set(n.id, 0);
  for (const e of graph.edges) m.set(e.to, (m.get(e.to) ?? 0) + 1);
  return m;
}
