const sm = await import("./src/equipment.ts");
const dm = await import("@nirman/db");
const { assignEquipment } = sm.default ?? sm;
const { prisma } = dm.default ?? dm;
const eq = await prisma.equipment.findFirst({ where: { assetTag: "TRL-001" } }); // My Company, AVAILABLE
const loc = await prisma.stockLocation.findFirst({ where: { companyId: eq.companyId } });
try {
  await assignEquipment({ equipmentId: eq.id, locationId: loc.id, projectId: "cmu1avili000evli4udrm9x4z", companyId: eq.companyId });
  console.log("ASSIGNED — seal broken!");
} catch (e) { console.log("BLOCKED:", e.message); }
await prisma.$disconnect();
