import { describe, it } from "vitest";
import { prisma } from "@nirman/db";
import { runBookReconciliation } from "./reconciliation-health";

describe("books reconciliation live check", () => {
  it("prints all check statuses", async () => {
    const c = await prisma.company.findFirst({ where: { name: "SRG REALCON" }, select: { id: true } });
    const r = await runBookReconciliation(c!.id);
    for (const ch of r.checks) console.log(`${ch.status} ${ch.name} — ${ch.delta ?? ""} ${ch.message ?? ""}`.slice(0, 150));
    console.log("SUMMARY:", JSON.stringify(r.summary));
  }, 60000);
});
