import { prisma } from "@nirman/db";
const rows = await prisma.auditLog.findMany({
  where: { action: { in: ["CUSTOM_ROLE_CREATED", "USER_ROLE_CHANGE", "EMPLOYEE_UPDATE", "EMPLOYEE_REPORTS_TO_UPDATE", "USER_PERMISSIONS_UPDATE", "User_UPDATE", "Employee_UPDATE"] } },
  orderBy: { timestamp: "desc" }, take: 20,
  select: { action: true, entityType: true, entityId: true, before: true, after: true, timestamp: true },
});
for (const r of rows) console.log(r.timestamp.toISOString().slice(11,19), r.action, r.entityType, JSON.stringify(r.before), "→", JSON.stringify(r.after));
await prisma.$disconnect();
