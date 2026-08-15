"use client";

import { useState } from "react";
import { CheckSquare, ListChecks } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MyTasksPanel } from "@/components/tasks/my-tasks-panel";
import { TasksManager } from "@/components/tasks/tasks-manager";

interface TaskUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  instructions: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  dueDateRaw: string | null;
  assignedTo: TaskUser | null;
  assignedBy: { id: string; name: string } | null;
  completedAt: string | null;
  createdAt: string;
}

export function MyTasksHub({
  teamTasks,
  users,
  canAssign,
  canManage,
  currentUserId,
  canViewTeam,
}: {
  teamTasks: TaskRow[];
  users: TaskUser[];
  canAssign: boolean;
  canManage: boolean;
  currentUserId: string;
  canViewTeam: boolean;
}) {
  const [tab, setTab] = useState("mine");

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList>
        <TabsTrigger value="mine">
          <span className="flex items-center gap-1.5">
            <CheckSquare className="h-3.5 w-3.5" /> My Tasks
          </span>
        </TabsTrigger>
        {canViewTeam && (
          <TabsTrigger value="team">
            <span className="flex items-center gap-1.5">
              <ListChecks className="h-3.5 w-3.5" /> Team Tasks
            </span>
          </TabsTrigger>
        )}
      </TabsList>

      <TabsContent value="mine">
        <MyTasksPanel />
      </TabsContent>

      {canViewTeam && (
        <TabsContent value="team">
          <TasksManager
            tasks={teamTasks}
            users={users}
            canAssign={canAssign}
            canManage={canManage}
            currentUserId={currentUserId}
          />
        </TabsContent>
      )}
    </Tabs>
  );
}
