#!/usr/bin/env node
/**
 * migrate-departments.mjs — one-time data migration to backfill
 * Employee.departmentId from the free-text User.department field.
 *
 * For each employee with a linked User that has a non-empty `department`
 * string, find a Department in the same company whose name matches
 * (case-insensitive) and set Employee.departmentId.
 *
 * Employees without a linked User or with no matching department are
 * left untouched (departmentId stays null — assign manually via UI).
 *
 * Usage: node scripts/migrate-departments.mjs
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const __dirname = dirname(fileURLToPath(import.meta.url));
const PRISMA_CLIENT_PATH = join(__dirname, "..", "..", "..", "packages", "db", "src", "generated", "prisma", "index.js");
const { PrismaClient } = await import(PRISMA_CLIENT_PATH);

const prisma = new PrismaClient();

async function main() {
  console.log("─ migrate-departments.mjs ─");
  console.log("Backfilling Employee.departmentId from User.department...\n");

  // Step 1: Auto-create missing departments from User.department strings
  const usersWithDepts = await prisma.user.findMany({
    where: { department: { not: null } },
    select: { department: true, memberships: { select: { companyId: true } } },
  });

  // Collect unique (companyId, departmentName) pairs
  const needed = new Map(); // key: "companyId|name" → { companyId, name }
  for (const u of usersWithDepts) {
    const name = u.department?.trim();
    if (!name) continue;
    for (const uc of u.memberships) {
      needed.set(`${uc.companyId}|${name}`, { companyId: uc.companyId, name });
    }
  }

  console.log(`Step 1: Auto-creating ${needed.size} department(s) from User.department strings...`);
  for (const { companyId, name } of needed.values()) {
    const code = name.toUpperCase().replace(/\s+/g, "-").slice(0, 20);
    const existing = await prisma.department.findFirst({
      where: { companyId, OR: [{ name }, { code }] },
    });
    if (!existing) {
      await prisma.department.create({
        data: { companyId, name, code, active: true },
      });
      console.log(`  + Created department "${name}" (${code})`);
    } else {
      console.log(`  = Department "${name}" already exists`);
    }
  }

  // Reload departments
  const departments = await prisma.department.findMany({
    where: { deletedAt: null },
    select: { id: true, companyId: true, name: true, code: true },
  });
  const deptByCompany = new Map();
  for (const d of departments) {
    if (!deptByCompany.has(d.companyId)) deptByCompany.set(d.companyId, []);
    deptByCompany.get(d.companyId).push(d);
  }

  // Step 2: Assign employees to departments
  console.log(`\nStep 2: Assigning employees to departments...`);
  const employees = await prisma.employee.findMany({
    where: {
      deletedAt: null,
      departmentId: null,
      user: { isNot: null },
    },
    select: {
      id: true,
      companyId: true,
      name: true,
      user: { select: { department: true } },
    },
  });

  console.log(`Found ${employees.length} employees with User.department but no departmentId.\n`);

  let matched = 0;
  let unmatched = 0;

  for (const emp of employees) {
    const userDept = emp.user?.department?.trim();
    if (!userDept) {
      unmatched++;
      continue;
    }

    const companyDepts = deptByCompany.get(emp.companyId) ?? [];
    const match = companyDepts.find(
      (d) => d.name.toLowerCase() === userDept.toLowerCase() ||
            d.code.toLowerCase() === userDept.toLowerCase()
    );

    if (match) {
      await prisma.employee.update({
        where: { id: emp.id },
        data: { departmentId: match.id },
      });
      console.log(`  ✓ ${emp.name} → "${match.name}" (${match.code})`);
      matched++;
    } else {
      console.log(`  ✗ ${emp.name} → no match for "${userDept}"`);
      unmatched++;
    }
  }

  console.log(`\nDone. Matched: ${matched}, Unmatched: ${unmatched}`);
  if (unmatched > 0) {
    console.log("\nUnmatched employees need manual department assignment via the edit form.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
