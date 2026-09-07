"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useTabParam } from "@/lib/use-tab-param";

export function CallsTabs({
  callLog,
  telephony,
  canViewTelephony,
}: {
  callLog: React.ReactNode;
  telephony: React.ReactNode;
  canViewTelephony: boolean;
}) {
  const [tab, setTab] = useTabParam(["log", "telephony"] as const, "log");
  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList>
        <TabsTrigger value="log">Call Log</TabsTrigger>
        {canViewTelephony ? <TabsTrigger value="telephony">Telephony</TabsTrigger> : null}
      </TabsList>
      <TabsContent value="log">{callLog}</TabsContent>
      <TabsContent value="telephony">{telephony}</TabsContent>
    </Tabs>
  );
}
