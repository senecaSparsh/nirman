/**
 * local-reset-srg.mjs — LOCAL DEV ONLY. Wipes ALL data from the database
 * and creates the 8 SRG REALCON team member accounts with a shared dev
 * password ("nirman123") so the one-click quick-login buttons work
 * seamlessly.
 *
 * ──────────────────────────────────────────────────────────────────────
 *  WHAT THIS SCRIPT DOES:
 *
 *  1. TRUNCATES every table in the public schema (CASCADE) — all data is
 *     gone: companies, users, projects, stock, sales, etc. This is a
 *     full reset. Use only on a local dev database.
 *  2. Creates the "SRG REALCON" company.
 *  3. Creates 8 users with RBAC roles + phone-based login (phoneNormalized).
 *  4. Creates 8 UserCompany memberships with reportsTo hierarchy wiring.
 *  5. Creates 8 credential Accounts (scrypt-hashed, shared password
 *     "nirman123" — same as the demo-login endpoint).
 *  6. Creates 8 Employee records with hierarchyLevel (H1–H4).
 *  7. Creates 8 CompanyPhone records + 8 PhoneAssignment records.
 *
 *  HIERARCHY:
 *    H1  Vardaan Kumar   OWNER              7017988293  reportsTo: null
 *    H1  Sanjeev Kumar   ADMIN              9412230391  reportsTo: null
 *    H2  Anurag Garg     PROJECT_DIRECTOR   7302920202  reportsTo: Vardaan
 *    H3  Manish Kumar    FINANCE_HEAD       7302920201  reportsTo: Vardaan
 *    H3  Raviraj Singh   PROCUREMENT_MGR    9520002752  reportsTo: Vardaan
 *    H4  Mani Singh      SALES_MANAGER      7302920203  reportsTo: Manish
 *    H4  Yash Saxena     SITE_ENGINEER      7302920205  reportsTo: Anurag
 *    H4  Ramesh Guard    SECURITY_GUARD     7302920206  reportsTo: Yash
 *
 *  PASSWORD: "nirman123" for ALL accounts (shared dev password — matches
 *  the demo-login endpoint so quick-login buttons just work).
 *
 *  USAGE:
 *    node apps/web/scripts/local-reset-srg.mjs
 *
 *  The script reads DATABASE_URL from the environment (or .env file).
 *  It is NOT wired into docker-entrypoint.sh — this is for local dev only.
 *
 * ──────────────────────────────────────────────────────────────────────
 */
import { scrypt, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// ── Resolve the Prisma client path ──
const __dirname = dirname(fileURLToPath(import.meta.url));
const PRISMA_CLIENT_PATH = join(__dirname, "..", "..", "..", "packages", "db", "src", "generated", "prisma", "index.js");

const { PrismaClient } = await import(PRISMA_CLIENT_PATH);
const prisma = new PrismaClient({
  log: ["error"],
  transactionOptions: { maxWait: 10_000, timeout: 30_000 },
});

// ═══════════════════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════════════════

const COMPANY_NAME = "SRG REALCON";
const SHARED_PASSWORD = "nirman123"; // matches demo-login endpoint

const USERS = [
  {
    key: "vardaan",
    name: "Vardaan Kumar",
    designation: "Owner",
    role: "OWNER",
    hierarchyLevel: 1,
    phone: "7017988293",
    reportsTo: null,
    department: "Management",
  },
  {
    key: "sanjeev",
    name: "Sanjeev Kumar",
    designation: "Co-Admin / Owner",
    role: "ADMIN",
    hierarchyLevel: 1,
    phone: "9412230391",
    reportsTo: null,
    department: "Management",
  },
  {
    key: "anurag",
    name: "Anurag Garg",
    designation: "Civil Head",
    role: "PROJECT_DIRECTOR",
    hierarchyLevel: 2,
    phone: "7302920202",
    reportsTo: "vardaan",
    department: "Construction",
  },
  {
    key: "manish",
    name: "Manish Kumar",
    designation: "Accounts Head",
    role: "FINANCE_HEAD",
    hierarchyLevel: 3,
    phone: "7302920201",
    reportsTo: "vardaan",
    department: "Finance",
  },
  {
    key: "raviraj",
    name: "Raviraj Singh",
    designation: "Purchase Head",
    role: "PROCUREMENT_MANAGER",
    hierarchyLevel: 3,
    phone: "9520002752",
    reportsTo: "vardaan",
    department: "Procurement",
  },
  {
    key: "mani",
    name: "Mani Singh",
    designation: "Tele Calling Executive",
    role: "SALES_MANAGER",
    hierarchyLevel: 4,
    phone: "7302920203",
    reportsTo: "manish",
    department: "Sales",
  },
  {
    key: "yash",
    name: "Yash Saxena",
    designation: "Junior Engineer",
    role: "SITE_ENGINEER",
    hierarchyLevel: 4,
    phone: "7302920205",
    reportsTo: "anurag",
    department: "Construction",
  },
  {
    key: "ramesh",
    name: "Ramesh Guard",
    designation: "Security Guard",
    role: "SECURITY_GUARD",
    hierarchyLevel: 4,
    phone: "7302920206",
    reportsTo: "yash",
    department: "Security",
  },
];

// ═══════════════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════════════

function normalizePhone10(input) {
  let digits = input.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

function normalizePhone12(input) {
  let digits = input.replace(/\D/g, "");
  if (digits.length === 10) digits = "91" + digits;
  if (digits.length === 11 && digits.startsWith("0")) digits = "91" + digits.slice(1);
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length === 13 && digits.startsWith("910")) digits = "91" + digits.slice(3);
  return digits;
}

function formatPhoneDisplay(phone10) {
  return `+91 ${phone10.slice(0, 5)} ${phone10.slice(5)}`;
}

/**
 * Scrypt-hash a password using the SAME parameters as Better-Auth.
 * Format: "salt:hash" (both hex). N=16384, r=16, p=1, dkLen=64.
 */
async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const key = await new Promise((resolve, reject) => {
    scrypt(
      password.normalize("NFKC"),
      salt,
      64,
      { N: 16384, r: 16, p: 1, maxmem: 128 * 16384 * 16 * 2 },
      (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey);
      },
    );
  });
  return `${salt}:${key.toString("hex")}`;
}

// ═══════════════════════════════════════════════════════════════════════
//  WIPE — truncate all tables in the public schema
// ═══════════════════════════════════════════════════════════════════════

async function wipeAllData() {
  console.log("── Step 0: Wiping ALL data ─────────────────────────────");
  // Get all table names in the public schema, excluding Prisma's migration
  // table (we keep migrations so `prisma migrate status` still works).
  const tables = await prisma.$queryRawUnsafe(`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename != '_prisma_migrations'
    ORDER BY tablename;
  `);
  const tableNames = tables.map((t) => `"${t.tablename}"`);
  if (tableNames.length === 0) {
    console.log("  No tables found — nothing to wipe.");
    return;
  }
  // TRUNCATE all tables with CASCADE — drops all data, resets sequences.
  // Using a single TRUNCATE statement is atomic and handles FK constraints.
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${tableNames.join(", ")} RESTART IDENTITY CASCADE;`,
  );
  console.log(`  Truncated ${tableNames.length} tables.`);
}

// ═══════════════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════════════

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  SRG REALCON — LOCAL DEV RESET + SEED");
  console.log("  ⚠️  THIS WIPES ALL DATA — LOCAL DEV ONLY");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`Database: ${process.env.DATABASE_URL?.split("@")[1]?.split("/")[0] ?? "(from env)"}`);
  console.log(`Date: ${new Date().toISOString()}`);
  console.log("");

  // ── 0. Wipe all data ──
  await wipeAllData();
  console.log("");

  // ── 1. Create the parent company ──
  console.log("── Step 1: Company ──────────────────────────────────────");
  const company = await prisma.company.create({
    data: {
      name: COMPANY_NAME,
      businessType: "Real Estate Development",
      currency: "INR",
    },
  });
  console.log(`  CREATED: ${company.name} (id: ${company.id})`);
  const companyId = company.id;

  // ── 2. Create users (H1 first, then H2, H3, H4) ──
  console.log("");
  console.log("── Step 2: Users + Memberships + Accounts + Employees + Phones ──");

  const userCompanyIds = {}; // key → UserCompany.id (for reportsTo wiring)
  const hashedPassword = await hashPassword(SHARED_PASSWORD);

  for (const u of USERS) {
    const phone10 = normalizePhone10(u.phone);
    const phone12 = normalizePhone12(u.phone);
    const phoneDisplay = formatPhoneDisplay(phone10);
    const email = `phone+${phone12}@nirman.internal`;

    console.log(`\n  [${u.key}] ${u.name} (${u.role}, H${u.hierarchyLevel}) — ${phoneDisplay}`);

    // ── 2a. Create User ──
    const user = await prisma.user.create({
      data: {
        email,
        name: u.name,
        role: u.role,
        phone: phoneDisplay,
        phoneNormalized: phone10,
        companyId,
        emailVerified: true,
        designation: u.designation,
        department: u.department,
        joiningDate: new Date(),
        mustChangePassword: false,
      },
      select: { id: true, name: true, email: true, role: true },
    });
    console.log(`    User: CREATED (id: ${user.id})`);

    // ── 2b. Create UserCompany membership ──
    const membership = await prisma.userCompany.create({
      data: {
        userId: user.id,
        companyId,
        role: u.role,
      },
      select: { id: true, role: true },
    });
    console.log(`    Membership: CREATED (id: ${membership.id}, role: ${u.role})`);
    userCompanyIds[u.key] = membership.id;

    // ── 2c. Create credential Account (shared dev password) ──
    const account = await prisma.account.create({
      data: {
        userId: user.id,
        providerId: "credential",
        accountId: user.id,
        password: hashedPassword,
      },
    });
    console.log(`    Account: CREATED (credential, password: ${SHARED_PASSWORD})`);

    // ── 2d. Create Employee record with hierarchyLevel ──
    const employee = await prisma.employee.create({
      data: {
        name: u.name,
        phone: phoneDisplay,
        email,
        dailyRate: 0,
        wageType: "MONTHLY",
        monthlySalary: null,
        designation: u.designation,
        joinDate: new Date(),
        active: true,
        hierarchyLevel: u.hierarchyLevel,
        companyId,
        userId: user.id,
        employmentType: "PERMANENT",
      },
      select: { id: true, hierarchyLevel: true },
    });
    console.log(`    Employee: CREATED (id: ${employee.id}, H${u.hierarchyLevel})`);

    // ── 2e. Create CompanyPhone ──
    const companyPhone = await prisma.companyPhone.create({
      data: {
        companyId,
        phoneNumber: phoneDisplay,
        phoneNormalized: phone12,
        numberType: "MOBILE",
        provider: "MANUAL",
        label: u.name,
        department: u.department,
        status: "ACTIVE",
        assignedToUserId: user.id,
        assignedAt: new Date(),
      },
      select: { id: true, assignedToUserId: true },
    });
    console.log(`    CompanyPhone: CREATED (id: ${companyPhone.id}, ${phoneDisplay})`);

    // ── 2f. Create PhoneAssignment history record ──
    await prisma.phoneAssignment.create({
      data: {
        companyPhoneId: companyPhone.id,
        userId: user.id,
        reason: "Assigned during account creation",
      },
    });
    console.log(`    PhoneAssignment: CREATED`);
  }

  // ── 3. Wire reportsTo hierarchy ──
  console.log("");
  console.log("── Step 3: Reporting Hierarchy (reportsTo) ──────────────");
  for (const u of USERS) {
    if (!u.reportsTo) {
      console.log(`  ${u.name}: top-level (no reportsTo)`);
      continue;
    }
    const membershipId = userCompanyIds[u.key];
    const reportsToId = userCompanyIds[u.reportsTo];
    const reportsToUser = USERS.find((x) => x.key === u.reportsTo);
    await prisma.userCompany.update({
      where: { id: membershipId },
      data: { reportsToUserCompanyId: reportsToId },
    });
    console.log(`  ${u.name} → reports to ${reportsToUser.name}`);
  }

  // ── 3.5. Working project environment ──
  // Without this the app boots to empty pickers: field roles resolve to
  // PROJECT scope but have no UserScope rows, and there is no project/
  // stock/material data to act on. Seed the minimum a site engineer needs.
  console.log("");
  console.log("── Step 3.5: Project + Site Store + Materials + Workers ────");

  const project = await prisma.project.create({
    data: {
      companyId,
      name: "SRG Skyline Heights",
      type: "RESIDENTIAL",
      status: "ACTIVE",
      startDate: new Date(),
    },
  });
  console.log(`  Project: ${project.name} (id: ${project.id})`);

  const siteStore = await prisma.stockLocation.create({
    data: {
      companyId,
      projectId: project.id,
      type: "PROJECT_SITE",
      name: "Skyline Site Store",
    },
  });
  const warehouse = await prisma.stockLocation.create({
    data: {
      companyId,
      type: "COMPANY_WAREHOUSE",
      name: "SRG Central Store",
    },
  });
  console.log(`  Locations: ${siteStore.name}, ${warehouse.name}`);

  const catDefs = [
    { name: "Cement", unit: "BAG" },
    { name: "Steel", unit: "KG" },
    { name: "Aggregates", unit: "CFT" },
    { name: "Bricks & Blocks", unit: "NOS" },
  ];
  const cats = {};
  for (const c of catDefs) {
    cats[c.name] = await prisma.materialCategory.create({
      data: { companyId, name: c.name, unit: c.unit },
    });
  }

  const matDefs = [
    { code: "CEM-001", name: "Cement OPC53", grade: "OPC 53", cat: "Cement", unit: "BAG", cost: 350 },
    { code: "STL-001", name: "TMT Steel Fe500", grade: "Fe500", cat: "Steel", unit: "KG", cost: 58 },
    { code: "SND-001", name: "River Sand", cat: "Aggregates", unit: "CFT", cost: 55 },
    { code: "AGG-001", name: "Aggregate 20mm", grade: "20mm", cat: "Aggregates", unit: "CFT", cost: 48 },
    { code: "BRK-001", name: "Fly Ash Bricks", cat: "Bricks & Blocks", unit: "NOS", cost: 7 },
  ];
  const mats = [];
  for (const m of matDefs) {
    mats.push(await prisma.material.create({
      data: {
        companyId, code: m.code, name: m.name, grade: m.grade ?? null,
        categoryId: cats[m.cat].id, unit: m.unit,
        standardCost: m.cost, currentCost: m.cost,
      },
    }));
  }
  console.log(`  Materials: ${mats.length} created across ${catDefs.length} categories`);

  // Opening stock — enough for issue/transfer flows to exercise.
  const stockSeed = [
    { matIdx: 0, qty: 200 }, // cement bags
    { matIdx: 1, qty: 1000 }, // steel kg
    { matIdx: 2, qty: 300 }, // sand cft
    { matIdx: 3, qty: 400 }, // aggregate cft
    { matIdx: 4, qty: 5000 }, // bricks
  ];
  for (const loc of [siteStore, warehouse]) {
    for (const s of stockSeed) {
      await prisma.stockLocationItem.create({
        data: { locationId: loc.id, materialId: mats[s.matIdx].id, qty: s.qty, movingAvgCost: matDefs[s.matIdx].cost },
      });
    }
  }
  console.log(`  Stock: ${stockSeed.length} items at 2 locations`);

  // Field workers (employees without user accounts — for DPR labour lines
  // and attendance marking).
  const workerDefs = [
    { name: "Rakesh Mistri", trade: "Masonry", dailyRate: 850 },
    { name: "Sunil Yadav", trade: "Helper", dailyRate: 550 },
    { name: "Prakash Jadhav", trade: "Carpentry", dailyRate: 800 },
    { name: "Dinesh Kumar", trade: "Electrical", dailyRate: 750 },
  ];
  for (const w of workerDefs) {
    await prisma.employee.create({
      data: {
        name: w.name, trade: w.trade, dailyRate: w.dailyRate,
        wageType: "DAILY", joinDate: new Date(), active: true,
        companyId,
      },
    });
  }
  console.log(`  Workers: ${workerDefs.length} field workers`);

  // Expense categories — the claim form's category picker is free-text
  // with suggestions from this table; empty table = no suggestions.
  // glAccountCode must exist in GlAccount (6000 = Operating Expenses,
  // 6100 = Salaries & Wages — both seeded by the chart of accounts).
  const expCatDefs = [
    { name: "Travel & Fuel", gl: "6000" },
    { name: "Meals & Refreshments", gl: "6000" },
    { name: "Tools & Consumables", gl: "6000" },
    { name: "Site Materials (Minor)", gl: "6000" },
    { name: "Transport & Freight", gl: "6000" },
    { name: "Mobile & Internet", gl: "6000" },
    { name: "Office Supplies", gl: "6000" },
    { name: "Staff Welfare", gl: "6100" },
  ];
  for (const c of expCatDefs) {
    await prisma.expenseCategory.create({
      data: { companyId, name: c.name, glAccountCode: c.gl, isActive: true },
    });
  }
  console.log(`  Expense categories: ${expCatDefs.length}`);

  // UserScope rows for PROJECT-scoped members — SITE_ENGINEER et al. resolve
  // to PROJECT scope by role default; without a scope row their pickers are
  // empty and the emptyHint tells them to ask an admin forever.
  const PROJECT_SCOPED = new Set(["SITE_ENGINEER", "STORE_KEEPER", "SUPERVISOR", "QAQC_ENGINEER", "SECURITY_GUARD"]);
  for (const u of USERS) {
    if (!PROJECT_SCOPED.has(u.role)) continue;
    await prisma.userScope.create({
      data: {
        userCompanyId: userCompanyIds[u.key],
        scopeKind: "PROJECT",
        projectId: project.id,
      },
    });
    console.log(`  Scope: ${u.name} → ${project.name}`);
  }

  // ── 4. Summary ──
  console.log("");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  LOCAL DEV SEED COMPLETE");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("");
  console.log(`  Company: ${COMPANY_NAME} (id: ${companyId})`);
  console.log(`  Password (ALL accounts): ${SHARED_PASSWORD}`);
  console.log("");
  console.log("  ┌──────────────────┬────────────────────────┬───────┬────────────┐");
  console.log("  │ Name             │ Role                   │ H-Lvl │ Phone      │");
  console.log("  ├──────────────────┼────────────────────────┼───────┼────────────┤");
  for (const u of USERS) {
    const phone10 = normalizePhone10(u.phone);
    const namePad = u.name.padEnd(16);
    const rolePad = u.role.padEnd(22);
    const hPad = `H${u.hierarchyLevel}`.padEnd(5);
    const phonePad = phone10.padEnd(10);
    console.log(`  │ ${namePad} │ ${rolePad} │ ${hPad} │ ${phonePad} │`);
  }
  console.log("  └──────────────────┴────────────────────────┴───────┴────────────┘");
  console.log("");
  console.log("  LOGIN:");
  console.log("    • Phone mode: enter the 10-digit phone + password 'nirman123'");
  console.log("    • Quick login: click the team member button on the sign-in page");
  console.log("");
  console.log("═══════════════════════════════════════════════════════════════");
}

main()
  .catch((e) => {
    console.error("");
    console.error("═══════════════════════════════════════════════════════════════");
    console.error("  SCRIPT FAILED");
    console.error("═══════════════════════════════════════════════════════════════");
    console.error(e);
    console.error("");
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
