"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useTabParam } from "@/lib/use-tab-param";

export function CostControlTabs({
  projectControl,
  budgetVariance,
  profitCenter,
}: {
  projectControl: React.ReactNode;
  budgetVariance: React.ReactNode;
  profitCenter: React.ReactNode;
}) {
  const [tab, setTab] = useTabParam(
    ["project-control", "budget-variance", "profit-center"] as const,
    "project-control",
  );
  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList>
        <TabsTrigger value="project-control">Project Control</TabsTrigger>
        <TabsTrigger value="budget-variance">Budget Variance</TabsTrigger>
        <TabsTrigger value="profit-center">Profit Center</TabsTrigger>
      </TabsList>
      <TabsContent value="project-control">{projectControl}</TabsContent>
      <TabsContent value="budget-variance">{budgetVariance}</TabsContent>
      <TabsContent value="profit-center">{profitCenter}</TabsContent>
    </Tabs>
  );
}
