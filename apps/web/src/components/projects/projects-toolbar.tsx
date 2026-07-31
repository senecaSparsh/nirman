"use client";

import { useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { ProjectFormDialog } from "./project-form-dialog";

export function ProjectsToolbar({
  filters,
  onFilterChange,
  canCreate = true,
}: {
  filters: { search: string; status: string; type: string };
  onFilterChange: (filters: { search: string; status: string; type: string }) => void;
  canCreate?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const hasFilters = filters.search || filters.status || filters.type;

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="flex flex-1 items-center gap-2">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.search}
            onChange={(e) => onFilterChange({ ...filters, search: e.target.value })}
            placeholder="Search projects…"
            className="pl-8"
          />
        </div>
        <Select
          value={filters.status}
          onChange={(e) => onFilterChange({ ...filters, status: e.target.value })}
          className="sm:max-w-[140px]"
        >
          <option value="">All statuses</option>
          <option value="PLANNED">Planned</option>
          <option value="ACTIVE">Active</option>
          <option value="COMPLETED">Completed</option>
          <option value="ON_HOLD">On Hold</option>
        </Select>
        <Select
          value={filters.type}
          onChange={(e) => onFilterChange({ ...filters, type: e.target.value })}
          className="sm:max-w-[140px]"
        >
          <option value="">All types</option>
          <option value="RESIDENTIAL">Residential</option>
          <option value="COMMERCIAL">Commercial</option>
          <option value="WAREHOUSE">Warehouse</option>
          <option value="MALL">Mall / Retail</option>
          <option value="LAND">Land Dev</option>
          <option value="OTHER">Other</option>
        </Select>
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onFilterChange({ search: "", status: "", type: "" })}
            className="text-muted-foreground"
          >
            <X className="h-3.5 w-3.5" /> Clear
          </Button>
        )}
      </div>
      {canCreate && (
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          New Project
        </Button>
      )}
      <ProjectFormDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
