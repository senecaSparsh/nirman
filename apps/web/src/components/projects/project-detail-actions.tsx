"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Trash2, Milestone, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProjectFormDialog, type ProjectFormValues } from "./project-form-dialog";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { formatCurrency } from "@/lib/utils";

export function ProjectDetailActions({
  projectId,
  initial,
  editOpen,
  setEditOpen,
}: {
  projectId: string;
  initial: ProjectFormValues;
  editOpen?: boolean;
  setEditOpen?: (open: boolean) => void;
}) {
  const [internalEditOpen, setInternalEditOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [checkingMilestones, setCheckingMilestones] = useState(false);
  const [reallocating, setReallocating] = useState(false);
  const isEditControlled = editOpen !== undefined && setEditOpen !== undefined;
  const open = isEditControlled ? editOpen : internalEditOpen;
  const onOpenChange = isEditControlled ? setEditOpen : setInternalEditOpen;

  async function checkMilestones() {
    setCheckingMilestones(true);
    try {
      const res = await fetch(`/api/milestone-payments/check?projectId=${projectId}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to check milestones");
      if (data.newlyDue > 0) {
        toast.success(`${data.newlyDue} milestone payment${data.newlyDue === 1 ? "" : "s"} now due`, {
          description: `Checked ${data.checked} linked payment schedule items.`,
        });
      } else {
        toast.info(`No new milestone payments due`, {
          description: `Checked ${data.checked} linked payment schedule items — all still pending.`,
        });
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to check milestones");
    } finally {
      setCheckingMilestones(false);
    }
  }

  async function reallocateCosts() {
    setReallocating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/reallocate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to reallocate costs");
      toast.success("Costs reallocated", {
        description: `Cost/sqft: ${formatCurrency(data.costPerSqft)} · Total: ${formatCurrency(data.totalProjectCost)}`,
      });
      // Refresh the page to show updated values
      window.location.reload();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to reallocate costs");
    } finally {
      setReallocating(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={reallocateCosts} disabled={reallocating}>
        {reallocating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        Reallocate Costs
      </Button>
      <Button variant="outline" size="sm" onClick={checkMilestones} disabled={checkingMilestones}>
        {checkingMilestones ? <Loader2 className="h-4 w-4 animate-spin" /> : <Milestone className="h-4 w-4" />}
        Check Milestones
      </Button>
      <Button variant="outline" size="sm" onClick={() => onOpenChange(true)}>
        <Pencil className="h-4 w-4" />
        Edit
      </Button>
      <Button variant="outline" size="sm" onClick={() => setDelOpen(true)}>
        <Trash2 className="h-4 w-4" />
        Delete
      </Button>
      <ProjectFormDialog open={open} onOpenChange={onOpenChange} projectId={projectId} initial={initial} />
      <DeleteConfirmDialog
        open={delOpen}
        onOpenChange={setDelOpen}
        endpoint={`/api/projects/${projectId}`}
        title="Delete project"
        description="The project will be archived. Active projects cannot be deleted — complete or put on hold first."
        successMessage="Project archived"
        redirectTo="/projects"
      />
    </div>
  );
}
