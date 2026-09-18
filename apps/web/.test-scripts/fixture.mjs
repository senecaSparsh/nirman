// Test fixture for employee dept/role/permission flow testing.
// Creates: rohan (SITE_ENGINEER) + hema (HR_MANAGER) users w/ credential
// accounts, memberships, linked employees; QA dept in SRG; foreign dept
// in "My Company". Idempotent — safe to re-run.
import { prisma } from "@nirman/db";
import { hashPassword } from "better-auth/crypto";

const SRG = "cmu1990sa0000vlpqpegbainb";
const OTHER = "cmtxajzqh0000vl2sskqywa6b";
const PASSWORD = "nirman123";

async function upsertDept(companyId, code, name) {
  const existing = await prisma.department.findFirst({ where: { companyId, code } });
  if (existing) return existing;
  return prisma.department.create({ data: { companyId, code, name } });
}

async function upsertUser({ email, name, role, phone }) {
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: { email, name, role, phone, phoneNormalized: phone?.replace(/\D/g, "") ?? null, emailVerified: true, companyId: SRG },
    });
  } else {
    user = await prisma.user.update({ where: { id: user.id }, data: { role, companyId: SRG, active: true } });
  }
  // membership
  let mem = await prisma.userCompany.findUnique({ where: { userId_companyId: { userId: user.id, companyId: SRG } } });
  if (!mem) mem = await prisma.userCompany.create({ data: { userId: user.id, companyId: SRG, role } });
  else if (mem.role !== role || !mem.active) mem = await prisma.userCompany.update({ where: { id: mem.id }, data: { role, active: true } });
  // credential account (demo password)
  const hashed = await hashPassword(PASSWORD);
  const acct = await prisma.account.findFirst({ where: { userId: user.id, providerId: "credential" } });
  if (acct) await prisma.account.update({ where: { id: acct.id }, data: { password: hashed } });
  else await prisma.account.create({ data: { userId: user.id, providerId: "credential", accountId: user.id, password: hashed } });
  return { user, mem };
}

// employees
async function upsertEmployee({ userId, name, hierarchyLevel, designation }) {
  let emp = await prisma.employee.findFirst({ where: { userId, companyId: SRG, deletedAt: null } });
  if (!emp) {
    emp = await prisma.employee.create({
      data: { name, companyId: SRG, userId, hierarchyLevel, designation, dailyRate: 800, wageType: "MONTHLY", monthlySalary: 24000 },
    });
  } else {
    emp = await prisma.employee.update({ where: { id: emp.id }, data: { hierarchyLevel, designation, active: true } });
  }
  return emp;
}

const qaDept = await upsertDept(SRG, "QATEST", "QA-Test-Dept");
const foreignDept = await upsertDept(OTHER, "FTEST", "Foreign-Dept");

const rohan = await upsertUser({ email: "rohan.testemp@nirman.internal", name: "Rohan Testemp", role: "SITE_ENGINEER", phone: "919000001001" });
const rohanEmp = await upsertEmployee({ userId: rohan.user.id, name: "Rohan Testemp", hierarchyLevel: 5, designation: "Site Engineer" });

const hema = await upsertUser({ email: "hema.testhr@nirman.internal", name: "Hema Testhr", role: "HR_MANAGER", phone: "919000001002" });
const hemaEmp = await upsertEmployee({ userId: hema.user.id, name: "Hema Testhr", hierarchyLevel: 3, designation: "HR Manager" });

// A control employee in OTHER company for cross-tenant reportsTo probe (exists already: Suresh Kale)
const foreignEmp = await prisma.employee.findFirst({ where: { companyId: OTHER, deletedAt: null }, select: { id: true, name: true } });

// Reset rohan's per-user permission overrides + user state for a clean run
const rohanMem = await prisma.userCompany.findUnique({ where: { userId_companyId: { userId: rohan.user.id, companyId: SRG } } });
if (rohanMem) await prisma.userPermission.deleteMany({ where: { userCompanyId: rohanMem.id } });
await prisma.user.update({ where: { id: rohan.user.id }, data: { role: "SITE_ENGINEER", active: true, name: "Rohan Testemp" } });
await prisma.userCompany.update({ where: { userId_companyId: { userId: rohan.user.id, companyId: SRG } }, data: { role: "SITE_ENGINEER", active: true } });
await prisma.employee.update({ where: { id: rohanEmp.id }, data: { departmentId: null, reportsToEmployeeId: null, designation: "Site Engineer", active: true } });

// Clean prior custom roles from earlier runs
await prisma.customRole.deleteMany({ where: { companyId: SRG, key: { in: ["CUSTOM_SITE_LEAD", "CUSTOM_DIRECTOR", "CUSTOM_BOSS", "CUSTOM_T1", "CUSTOM_BADPERM"] } } });

// Clean prior NCRs from earlier runs (title prefix)
await prisma.nonConformanceReport.deleteMany({ where: { companyId: SRG, title: { startsWith: "ROLETEST" } } });

console.log(JSON.stringify({
  qaDeptId: qaDept.id, foreignDeptId: foreignDept.id,
  rohanUserId: rohan.user.id, rohanEmpId: rohanEmp.id,
  hemaUserId: hema.user.id, hemaEmpId: hemaEmp.id,
  foreignEmpId: foreignEmp?.id, foreignEmpName: foreignEmp?.name,
}));
await prisma.$disconnect();
