"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Plus, ClipboardList } from "lucide-react";
import { Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/field";
import { BoqView, BoqFormDialog, type BoqNode } from "./boq-view";
import { PageLoading } from "@/components/page-loading";
import { EmptyState } from "@/components/empty-state";

type Project = { id: string; name: string };
type Material = { id: string; code: string; name: string; unit: string };

export function BoqProjectView({
  projects,
  materials,
  canEdit,
}: {
  projects: Project[];
  materials: Material[];
  canEdit: boolean;
}) {
  const [projectId, setProjectId] = useState<string>(projects[0]?.id ?? "");
  const [tree, setTree] = useState<BoqNode[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [emptyDialogOpen, setEmptyDialogOpen] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    fetch(`/api/boq/tree?projectId=${projectId}`)
      .then((r) => r.json())
      .then((data) => {
        setTree(data.tree ?? []);
        setTotal(data.totalEstimatedAmount ?? 0);
      })
      .catch(() => toast.error("Failed to load BOQ"))
      .finally(() => setLoading(false));
  }, [projectId]);

  if (projects.length === 0) {
    return (
      <EmptyState
        icon={<ClipboardList />}
        title="No projects yet"
        description="Create a project first to start building its Bill of Quantities."
      />
    );
  }

  return (
    <div className="space-y-4">
      <Field label="Project">
        <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="max-w-sm">
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Select>
      </Field>

      {loading ? (
        <PageLoading label="Loading BOQ…" variant="default" />
      ) : tree.length === 0 ? (
        <>
          <EmptyState
            icon={<ClipboardList />}
            title="No BOQ items yet"
            description="Start by adding a section (e.g. Civil Works), then add subsections and line items with quantities and rates."
            action={canEdit ? (
              <Button size="sm" onClick={() => setEmptyDialogOpen(true)}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Add Section
              </Button>
            ) : undefined}
          />
          {canEdit && (
            <BoqFormDialog
              open={emptyDialogOpen}
              onOpenChange={setEmptyDialogOpen}
              projectId={projectId}
              materials={materials}
              item={null}
              parentId={null}
            />
          )}
        </>
      ) : (
        <BoqView
          projectId={projectId}
          tree={tree}
          totalEstimatedAmount={total}
          materials={materials}
          canEdit={canEdit}
        />
      )}
    </div>
  );
}
