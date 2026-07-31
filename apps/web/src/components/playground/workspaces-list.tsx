"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Workflow, Pencil, ExternalLink, Trash2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { MODULES, type ModelKey, type WorkspaceGraph } from "@/lib/modules/registry";
import { cn } from "@/lib/utils";

type Workspace = {
  id: string;
  name: string;
  description: string | null;
  rootModel: string;
  icon: string | null;
  graphJson: unknown;
  createdAt: Date;
};

/** Build a flat chain of module labels from the graph root, depth-first. */
function hierarchyChain(graph: WorkspaceGraph): string[] {
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  const childrenMap = new Map<string, string[]>();
  graph.nodes.forEach((n) => childrenMap.set(n.id, []));
  graph.edges.forEach((e) => {
    const arr = childrenMap.get(e.from);
    if (arr) arr.push(e.to);
  });

  const chain: string[] = [];
  const visited = new Set<string>();
  function walk(id: string, depth: number) {
    if (visited.has(id) || depth > 4) return; // limit chain depth for display
    visited.add(id);
    const node = nodeMap.get(id);
    if (node) chain.push(MODULES[node.model as ModelKey]?.label ?? node.model);
    for (const child of childrenMap.get(id) ?? []) walk(child, depth + 1);
  }
  walk(graph.rootId, 0);
  return chain;
}

export function WorkspacesList({ workspaces }: { workspaces: Workspace[] }) {
  const router = useRouter();

  const onDelete = async (id: string, name: string) => {
    if (!confirm(`Delete workspace "${name}"? This removes the tab (soft delete).`)) return;
    const res = await fetch(`/api/workspaces/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Workspace deleted.");
      router.refresh();
    } else {
      toast.error("Failed to delete workspace.");
    }
  };

  if (workspaces.length === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            icon={<Workflow className="h-5 w-5" />}
            title="No saved workspaces yet"
            description="Build a hierarchy on the canvas above and save it — it will appear here and in the sidebar."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {workspaces.map((ws) => {
        const graph = ws.graphJson as WorkspaceGraph | null;
        const nodeCount = graph?.nodes.length ?? 0;
        const rootMod = MODULES[ws.rootModel as ModelKey];
        const chain = graph ? hierarchyChain(graph) : [];
        return (
          <Card key={ws.id} className="transition-shadow hover:shadow-md">
            <CardContent className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5">
                  <Link href={`/workspaces/${ws.id}`} className="font-semibold text-foreground hover:text-primary">
                    {ws.name}
                  </Link>
                  {ws.description && (
                    <p className="text-meta text-muted-foreground line-clamp-2">{ws.description}</p>
                  )}
                </div>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Workflow className="h-4 w-4" />
                </span>
              </div>

              {/* Hierarchy chain preview */}
              {chain.length > 0 && (
                <div className="flex flex-wrap items-center gap-0.5 rounded-md bg-muted/40 px-2 py-1.5">
                  {chain.slice(0, 5).map((label, i) => (
                    <span key={i} className="flex items-center gap-0.5">
                      {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground/40" />}
                      <span className={cn(
                        "text-caption",
                        i === 0 ? "font-semibold text-foreground" : "text-muted-foreground",
                      )}>
                        {label}
                      </span>
                    </span>
                  ))}
                  {chain.length > 5 && (
                    <span className="text-caption text-muted-foreground/60"> +{chain.length - 5} more</span>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline">Root: {rootMod?.label ?? ws.rootModel}</Badge>
                <Badge variant="muted">{nodeCount} modules</Badge>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Button asChild variant="outline" size="xs">
                  <Link href={`/workspaces/${ws.id}`}>
                    <ExternalLink /> Open
                  </Link>
                </Button>
                <Button asChild variant="ghost" size="xs">
                  <Link href={`/playground/${ws.id}`}>
                    <Pencil /> Edit
                  </Link>
                </Button>
                <Button variant="ghost" size="xs" className="ml-auto text-danger hover:text-danger" onClick={() => onDelete(ws.id, ws.name)}>
                  <Trash2 /> Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
