"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProjectFormDialog, type ProjectFormValues } from "./project-form-dialog";
import { ConfirmDelete } from "@/components/confirm-delete";

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
  const isEditControlled = editOpen !== undefined && setEditOpen !== undefined;
  const open = isEditControlled ? editOpen : internalEditOpen;
  const onOpenChange = isEditControlled ? setEditOpen : setInternalEditOpen;

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => onOpenChange(true)}>
        <Pencil className="h-4 w-4" />
        Edit
      </Button>
      <Button variant="outline" size="sm" onClick={() => setDelOpen(true)}>
        <Trash2 className="h-4 w-4" />
        Delete
      </Button>
      <ProjectFormDialog open={open} onOpenChange={onOpenChange} projectId={projectId} initial={initial} />
      <ConfirmDelete
        open={delOpen}
        onOpenChange={setDelOpen}
        url={`/api/projects/${projectId}`}
        title="Delete project"
        description="The project will be archived. Active projects cannot be deleted — complete or put on hold first."
        successMessage="Project archived"
        redirectTo="/projects"
      />
    </div>
  );
}
