"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Building2, MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ProjectsToolbar } from "./projects-toolbar";

type ProjectRow = {
  id: string;
  name: string;
  type: string;
  status: string;
  address: string | null;
  startDate: string | null;
  totalBudget: number;
  phaseCount: number;
  unitCount: number;
  locationCount: number;
};

export function ProjectsView({
  projects,
  typeLabels,
  statusVariant,
  permissions,
}: {
  projects: ProjectRow[];
  typeLabels: Record<string, string>;
  statusVariant: Record<string, "default" | "success" | "warning" | "muted" | "danger">;
  permissions?: { canCreate?: boolean; canEdit?: boolean; canDelete?: boolean; canApprove?: boolean };
}) {
  const [filters, setFilters] = useState({ search: "", status: "", type: "" });

  const filtered = useMemo(() => {
    return projects.filter((p) => {
      if (filters.search) {
        const q = filters.search.toLowerCase();
        if (!p.name.toLowerCase().includes(q) && !(p.address ?? "").toLowerCase().includes(q)) {
          return false;
        }
      }
      if (filters.status && p.status !== filters.status) return false;
      if (filters.type && p.type !== filters.type) return false;
      return true;
    });
  }, [projects, filters]);

  return (
    <>
      <ProjectsToolbar filters={filters} onFilterChange={setFilters} canCreate={permissions?.canCreate ?? true} />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>All Projects</CardTitle>
          <Badge variant="muted">
            {filtered.length}{filtered.length !== projects.length ? ` of ${projects.length}` : ""} total
          </Badge>
        </CardHeader>
        <CardContent>
          {projects.length === 0 ? (
            <EmptyState
              icon={<Building2 className="h-5 w-5" />}
              title="No projects yet"
              description="Create your first project to start tracking materials, land and built units."
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Building2 className="h-5 w-5" />}
              title="No projects match the filters"
              description="Try adjusting your search or filters."
            />
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Name</TH>
                  <TH>Type</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Phases</TH>
                  <TH className="text-right">Units</TH>
                  <TH className="text-right">Locations</TH>
                  <TH className="text-right">Budget</TH>
                  <TH>Starts</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((p) => (
                  <TR key={p.id}>
                    <TD>
                      <Link href={`/projects/${p.id}`} className="font-medium text-foreground hover:text-primary">
                        {p.name}
                      </Link>
                      {p.address && (
                        <div className="flex items-center gap-1 text-caption text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          {p.address}
                        </div>
                      )}
                    </TD>
                    <TD>
                      <Badge variant="outline">{typeLabels[p.type] ?? p.type}</Badge>
                    </TD>
                    <TD>
                      <Badge variant={statusVariant[p.status] ?? "muted"}>{p.status.replace("_", " ")}</Badge>
                    </TD>
                    <TD className="tnum text-right">{p.phaseCount}</TD>
                    <TD className="tnum text-right">{p.unitCount}</TD>
                    <TD className="tnum text-right">{p.locationCount}</TD>
                    <TD className="tnum text-right">{p.totalBudget ? formatCurrency(p.totalBudget) : "—"}</TD>
                    <TD className="text-caption text-muted-foreground">{formatDate(p.startDate)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
