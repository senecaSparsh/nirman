"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Plus, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectWithCreate } from "@/components/ui/select-with-create";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import { BoqView, BoqFormDialog, type BoqNode } from "./boq-view";
import { PageLoading } from "@/components/page-loading";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";
import type { ProjectOption } from "@/lib/types";

type Project = ProjectOption;
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
  // Local copy so freshly created projects appear in the dropdown without
  // waiting for router.refresh.
  const [localProjects, setLocalProjects] = useState<Project[]>(projects);
  useEffect(() => { setLocalProjects(projects); }, [projects]);

  const fetchTree = () => {
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
  };

  useEffect(() => {
    fetchTree();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const projectSelector = (
    <div className="shrink-0">
      <SelectWithCreate
        value={projectId}
        onChange={setProjectId}
        placeholder="Select project…"
        createLabel="project"
        className="h-7 min-w-[180px] text-caption"
        options={localProjects.map((p) => ({ value: p.id, label: p.name }))}
        renderCreateDialog={({ open: o, onCreated, onClose }) => (
          <ProjectFormDialog
            open={o}
            onOpenChange={onClose}
            onCreated={(e) => {
              setLocalProjects((p) => [...p, { id: e.id, name: e.label ?? "", type: "RESIDENTIAL", status: "PLANNED" }]);
              onCreated(e);
            }}
          />
        )}
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center gap-3 min-w-0">
        {projectSelector}
      </header>

      {loading && tree.length === 0 ? (
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
              parentNode={null}
              tree={[]}
              onSaved={fetchTree}
            />
          )}
        </>
      ) : (
        <div className={cn("space-y-4", loading && "pointer-events-none opacity-60 transition-opacity")}>
          <BoqView
            projectId={projectId}
            tree={tree}
            totalEstimatedAmount={total}
            materials={materials}
            canEdit={canEdit}
            onChanged={fetchTree}
          />
        </div>
      )}
    </div>
  );
}
