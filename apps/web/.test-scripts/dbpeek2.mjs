import { prisma } from "@nirman/db";
const companies = await prisma.company.findMany({ select: { id: true, name: true } });
console.log("COMPANIES:", JSON.stringify(companies));
const emps = await prisma.employee.findMany({ where: { deletedAt: null, companyId: "cmu1990sa0000vlpqpegbainb" }, select: { id: true, name: true, departmentId: true, userId: true, hierarchyLevel: true, activeProjectId: true }, take: 40 });
console.log("SRG EMPLOYEES:", JSON.stringify(emps, null, 1));
const memberships = await prisma.userCompany.findMany({ where: { companyId: "cmu1990sa0000vlpqpegbainb" }, select: { id: true, userId: true, role: true, active: true } });
console.log("SRG MEMBERSHIPS:", JSON.stringify(memberships, null, 1));
await prisma.$disconnect();
