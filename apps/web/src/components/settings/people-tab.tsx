"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, Phone, Mail, HardHat, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { StatusPill } from "@/components/page";
import { formatCurrency } from "@/lib/utils";

type Subcontractor = {
  id: string;
  name: string;
  trade: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  address: string | null;
};

type Employee = {
  id: string;
  name: string;
  trade: string | null;
  phone: string | null;
  email: string | null;
  dailyRate: number;
  active: boolean;
};

/**
 * People tab — combines subcontractors (external labour) and employees
 * (internal staff) into one tab with a segmented toggle. Both are workforce
 * master data; splitting them into separate top-level tabs cluttered the
 * Settings tab bar.
 */
export function PeopleTab({
  subcontractors,
  employees,
  onNewSub,
  onEditSub,
  onDeleteSub,
  onNewEmp,
  onEditEmp,
  onDeleteEmp,
}: {
  subcontractors: Subcontractor[];
  employees: Employee[];
  onNewSub: () => void;
  onEditSub: (s: Subcontractor) => void;
  onDeleteSub: (id: string) => void;
  onNewEmp: () => void;
  onEditEmp: (e: Employee) => void;
  onDeleteEmp: (id: string) => void;
}) {
  const [subTab, setSubTab] = useState<"subcontractors" | "employees">("subcontractors");

  return (
    <div className="space-y-4">
      {/* Segmented toggle */}
      <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-0.5">
        <button
          type="button"
          onClick={() => setSubTab("subcontractors")}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-body font-medium transition-colors ${
            subTab === "subcontractors" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <HardHat className="h-3.5 w-3.5" /> Subcontractors
          <span className="text-caption text-muted-foreground">({subcontractors.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setSubTab("employees")}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-body font-medium transition-colors ${
            subTab === "employees" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <UserPlus className="h-3.5 w-3.5" /> Employees
          <span className="text-caption text-muted-foreground">({employees.length})</span>
        </button>
      </div>

      {subTab === "subcontractors" ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-body text-muted-foreground">
              {subcontractors.length} subcontractor{subcontractors.length !== 1 ? "s" : ""}
            </span>
            <Button onClick={onNewSub}>
              <Plus className="h-4 w-4" /> New Subcontractor
            </Button>
          </div>

          {subcontractors.length === 0 ? (
            <div className="rounded-lg border border-dashed py-12 text-center text-muted-foreground">
              No subcontractors yet
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {subcontractors.map((s) => (
                <Card key={s.id} className="group relative">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold truncate">{s.name}</div>
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" onClick={() => onEditSub(s)} aria-label="Edit subcontractor">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => onDeleteSub(s.id)} aria-label="Delete subcontractor">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {s.trade ? <Badge variant="outline">{s.trade}</Badge> : <span className="text-sm text-muted-foreground">No trade set</span>}
                    {s.phone && (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Phone className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{s.phone}</span>
                      </div>
                    )}
                    {s.email && (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Mail className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{s.email}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-body text-muted-foreground">
              {employees.length} employee{employees.length !== 1 ? "s" : ""}
            </span>
            <Button onClick={onNewEmp}>
              <Plus className="h-4 w-4" /> New Employee
            </Button>
          </div>
          {employees.length === 0 ? (
            <div className="rounded-lg border border-dashed py-12 text-center text-muted-foreground">
              No employees yet — add people to assign to playground task nodes
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {employees.map((e) => (
                <Card key={e.id} className="group relative">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold truncate">{e.name}</div>
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" onClick={() => onEditEmp(e)} aria-label="Edit employee">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => onDeleteEmp(e.id)} aria-label="Delete employee">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {e.trade && <div className="text-sm text-muted-foreground">{e.trade}</div>}
                    <div className="flex items-center justify-between pt-1 border-t">
                      <span className="tnum font-bold">{formatCurrency(e.dailyRate)}</span>
                      <span className="text-sm text-muted-foreground">/day</span>
                    </div>
                    <StatusPill status={e.active ? "ACTIVE" : "INACTIVE"} />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
