/// <reference types="node" />
/**
 * Seed script — bootstraps a realistic construction firm ("Nirman Constructions")
 * with end-to-end data that exercises EVERY module of the platform exactly the way
 * a real company would use it:
 *
 *   1. Company + users (owner/manager/supervisor/accountant/sales) + employees
 *   2. Two projects (residential + commercial) with phases
 *   3. Stock locations: central warehouse + per-project/per-phase site yards
 *   4. Material catalog (categories + materials with reorder points + EOQ)
 *   5. Suppliers + subcontractors
 *   6. Procurement lifecycle: requisition → approve → PO → goods receipt (full + partial)
 *   7. Stock ledger via the real services (recordMovement / recordTransfer) so MAC + audit
 *      are always consistent — never hand-rolled.
 *   8. Material issues to projects (consumption) → triggers cost-per-sqft reallocation
 *   9. Stock transfers warehouse → site
 *  10. Stock count + reconciliation (variance)
 *  11. Supplier return (defective goods + credit note)
 *  12. Equipment + assignments + maintenance
 *  13. Land purchase + parcel + partition
 *  14. Built units (mix of statuses: sold / under-construction / available / planned)
 *  15. Customers + asset sales (built unit + land) + staged payments (partial + paid)
 *  16. Project costs (labour / overhead / permit / contractor) + company expenses
 *  17. Low-stock scenario (one material below reorder point) so the alerts page has data
 *  18. Audit logs
 *
 * Idempotent: wipes all transactional/seeded data on each run so re-seeding produces a
 * clean, deterministic dataset (master entities are upserted; everything else is
 * deleted then recreated in dependency order).
 *
 * Run with: pnpm --filter @nirman/db seed
 */
import {
  PrismaClient,
  type BuiltUnitCreateManyInput,
  type WorkerAttendanceCreateManyInput,
  type PayrollLineCreateManyInput,
  type ProjectCostCreateManyInput,
  type ExpenseCreateManyInput,
  type AuditLogCreateManyInput,
  type EquipmentMaintenanceCreateManyInput,
} from "@nirman/db";
import {
  recordMovement,
  recordTransfer,
  withStockTransaction,
  createPurchaseOrder,
  approvePurchaseOrder,
  orderPurchaseOrder,
  receiveGoods,
  issueMaterialsToProject,
  sellAsset,
  recordDeposit,
  reallocateProjectCosts,
  seedChartOfAccounts,
  createMaterialSale,
  createMaterialSalePayment,
  createScrapGeneration,
} from "../src";
import Decimal from "decimal.js";

const prisma = new PrismaClient();

// ── Helpers ──────────────────────────────────────────────────

/** Find-or-create a single record by a unique predicate (for master entities). */
async function ensure<T extends { id: string }>(
  model: string,
  where: Record<string, unknown>,
  data: Record<string, unknown>,
): Promise<T> {
  const existing = await (prisma as any)[model].findFirst({ where });
  if (existing) return existing as T;
  return (await (prisma as any)[model].create({ data })) as T;
}

/** Delete all rows in a model (used to wipe transactional/seeded data before re-seeding). */
async function wipe(model: string) {
  await (prisma as any)[model].deleteMany({});
}

/**
 * Wipe everything that this seed creates, in reverse dependency order so foreign keys
 * don't block. Master entities (Company, Project, Material, Supplier, etc.) are NOT
 * wiped — they're upserted by `ensure()` so their IDs stay stable across re-runs, which
 * keeps the dataset deterministic and lets us hard-delete the transactional tables.
 */
async function wipeTransactional() {
  // Audit + finance
  await wipe("auditLog");
  // GL — wipe journal lines then entries (FK order), keep GlAccount (seeded, not transactional)
  await wipe("journalLine");
  await wipe("journalEntry");
  await wipe("expense");
  await wipe("projectCost");
  // Sales
  await wipe("assetSalePayment");
  await wipe("assetSale");
  // Built units + land (recreated each run for clean partition state)
  await wipe("builtUnit");
  await wipe("landPartition");
  await wipe("landParcel");
  await wipe("landPurchase");
  // Equipment
  await wipe("equipmentMaintenance");
  await wipe("equipmentAssignment");
  await wipe("equipment");
  // Returns + requisitions + quotes
  await wipe("supplierReturn");
  await wipe("vendorQuoteLine");
  await wipe("vendorQuote");
  await wipe("materialRequisition");
  // Material sales + returns + scrap (create stock movements, so wipe before stockMovement)
  await wipe("materialSaleReturnLine");
  await wipe("materialSaleReturn");
  await wipe("materialSalePayment");
  await wipe("materialSaleLine");
  await wipe("materialSale");
  await wipe("scrapGenerationLine");
  await wipe("scrapGeneration");
  // Stock count
  await wipe("stockCount");
  // Transfers
  await wipe("stockTransfer");
  // Issues
  await wipe("materialIssue");
  // Goods receipts + POs
  await wipe("goodsReceipt");
  await wipe("purchaseOrder");
  // Stock ledger (movements + current-state cache)
  await wipe("stockMovement");
  await wipe("stockLocationItem");
  // HR — attendance, DPRs, payroll, tenancies, brokers, payment schedules
  await wipe("workerAttendance");
  await wipe("dPRLaborLine");
  await wipe("dPRMaterialLine");
  await wipe("dailyProgressReport");
  await wipe("payrollLine");
  await wipe("payrollPeriod");
  await wipe("tenancy");
  await wipe("broker");
  await wipe("paymentScheduleItem");
  await wipe("paymentSchedule");
}

// ── Main ─────────────────────────────────────────────────────

async function main() {
  console.log("Wiping existing transactional data…");
  await wipeTransactional();

  // ── 0. Chart of accounts ────────────────────────────────────
  // Must be seeded BEFORE any mutation that posts a journal entry (receiveGoods,
  // issueMaterials, sellAsset, etc.) — otherwise the FK on JournalLine.accountCode
  // fails. Idempotent — upserts each account.
  console.log("Seeding chart of accounts…");
  await seedChartOfAccounts();

  // ── 1. Company ──────────────────────────────────────────────
  const company = await ensure<{ id: string; name: string }>(
    "company",
    { deletedAt: null, name: "My Company" },
    {
      name: "My Company",
      currency: "INR",
    },
  );

  // ── 2. Users (auth + audit) ─────────────────────────────────
  // One user per role so one-click dev login (POST /api/auth/demo-login)
  // has a real account for every role. Passwords are NOT set here — the
  // demo-login endpoint provisions a credential Account with the shared
  // demo password ("nirman123") on first use.
  const users = [
    { email: "amit@nirman.in", name: "Amit Patil", role: "OWNER" },
    { email: "anita@nirman.in", name: "Anita Rao", role: "ADMIN" },
    { email: "sneha@nirman.in", name: "Sneha Kulkarni", role: "PROJECT_MANAGER" },
    { email: "ravi@nirman.in", name: "Ravi Deshmukh", role: "SUPERVISOR" },
    { email: "priya@nirman.in", name: "Priya Nair", role: "ACCOUNTANT" },
    { email: "karan@nirman.in", name: "Karan Mehta", role: "SALES_MANAGER" },
  ];
  const userMap: Record<string, string> = {};
  for (const u of users) {
    const row = await ensure("user", { email: u.email }, { ...u, emailVerified: true });
    userMap[u.email] = row.id;
    // Link user to the company via UserCompany membership + set default companyId
    await ensure("userCompany", { userId: row.id, companyId: company.id }, {
      userId: row.id,
      companyId: company.id,
      role: u.role,
    });
    await (prisma as any).user.update({ where: { id: row.id }, data: { companyId: company.id } });
  }
  const U = {
    owner: userMap["amit@nirman.in"],
    admin: userMap["anita@nirman.in"],
    manager: userMap["sneha@nirman.in"],
    supervisor: userMap["ravi@nirman.in"],
    accountant: userMap["priya@nirman.in"],
    sales: userMap["karan@nirman.in"],
  };

  // ── 3. Employees (site labour + supervisors) ────────────────
  const employees = [
    { name: "Suresh Kale", trade: "Masonry", phone: "+91 98220 45001", dailyRate: 850 },
    { name: "Mahesh Pawar", trade: "Electrical", phone: "+91 98220 45002", dailyRate: 950 },
    { name: "Vinod Jadhav", trade: "Plumbing", phone: "+91 98220 45003", dailyRate: 800 },
    { name: "Anil Shinde", trade: "Supervisor", phone: "+91 98220 45004", dailyRate: 1200 },
    { name: "Deepak More", trade: "Welding", phone: "+91 98220 45005", dailyRate: 1100 },
    { name: "Ramesh Gaikwad", trade: "Carpentry", phone: "+91 98220 45006", dailyRate: 900 },
    { name: "Fahim Sheikh", trade: "Painting", phone: "+91 98220 45007", dailyRate: 780 },
  ];
  const empMap: Record<string, string> = {};
  for (const e of employees) {
    const row = await ensure("employee", { name: e.name, companyId: company.id }, { ...e, companyId: company.id });
    empMap[e.name] = row.id;
  }

  // ── 4. Projects + phases ────────────────────────────────────
  const project1 = await ensure(
    "project",
    { companyId: company.id, name: "Greenfield Residency" },
    {
      companyId: company.id,
      name: "Greenfield Residency",
      type: "RESIDENTIAL",
      status: "ACTIVE",
      address: "Survey 21, Wagholi, Pune 412207",
      totalBudget: 85000000,
      startDate: new Date("2024-01-15"),
      description: "G+7 residential with 2 towers + retail shops",
    },
  );
  const project2 = await ensure(
    "project",
    { companyId: company.id, name: "Hillview Corporate Park" },
    {
      companyId: company.id,
      name: "Hillview Corporate Park",
      type: "COMMERCIAL",
      status: "PLANNED",
      address: "Baner Hill, Pune 411045",
      totalBudget: 220000000,
      description: "Grade-A office space, 2 blocks + parking",
    },
  );

  const phase1A = await ensure(
    "projectPhase",
    { projectId: project1.id, name: "Tower A" },
    { projectId: project1.id, name: "Tower A", status: "ACTIVE", budget: 45000000, startDate: new Date("2024-02-01"), sortOrder: 1 },
  );
  const phase1B = await ensure(
    "projectPhase",
    { projectId: project1.id, name: "Tower B" },
    { projectId: project1.id, name: "Tower B", status: "PLANNED", budget: 40000000, sortOrder: 2 },
  );
  const phase2A = await ensure(
    "projectPhase",
    { projectId: project2.id, name: "Block 1" },
    { projectId: project2.id, name: "Block 1", status: "PLANNED", budget: 120000000, sortOrder: 1 },
  );

  // ── 5. Stock locations ──────────────────────────────────────
  const warehouse = await ensure(
    "stockLocation",
    { companyId: company.id, type: "COMPANY_WAREHOUSE", name: "Central Warehouse" },
    { companyId: company.id, type: "COMPANY_WAREHOUSE", name: "Central Warehouse", address: "Plot 14, MIDC, Bhosari, Pune 411026" },
  );
  const site1 = await ensure(
    "stockLocation",
    { companyId: company.id, projectId: project1.id, name: "Greenfield Site Yard" },
    { companyId: company.id, type: "PROJECT_SITE", projectId: project1.id, name: "Greenfield Site Yard" },
  );
  const site1A = await ensure(
    "stockLocation",
    { companyId: company.id, phaseId: phase1A.id, name: "Tower A Laydown" },
    { companyId: company.id, type: "PROJECT_SITE", projectId: project1.id, phaseId: phase1A.id, name: "Tower A Laydown" },
  );
  const site2 = await ensure(
    "stockLocation",
    { companyId: company.id, projectId: project2.id, name: "Hillview Site" },
    { companyId: company.id, type: "PROJECT_SITE", projectId: project2.id, name: "Hillview Site" },
  );

  // ── 6. Material categories ─────────────────────────────────
  const categories = [
    { name: "Cement & Binding", unit: "BAG", class: "RAW_MATERIAL" as const },
    { name: "Steel & Rebar", unit: "KG", class: "RAW_MATERIAL" as const },
    { name: "Bricks & Blocks", unit: "NOS", class: "RAW_MATERIAL" as const },
    { name: "Sand & Aggregate", unit: "CFT", class: "RAW_MATERIAL" as const },
    { name: "Electrical", unit: "MTR", class: "RAW_MATERIAL" as const },
    { name: "Plumbing & Sanitary", unit: "NOS", class: "RAW_MATERIAL" as const },
    { name: "Paint & Finishes", unit: "LTR", class: "RAW_MATERIAL" as const },
    { name: "Formwork & Scaffolding", unit: "NOS", class: "TEMPORARY" as const },
    { name: "Safety & Consumables", unit: "NOS", class: "CONSUMABLE" as const },
  ];
  const catMap: Record<string, string> = {};
  for (const c of categories) {
    const row = await ensure("materialCategory", { name: c.name }, c);
    catMap[c.name] = row.id;
  }

  // ── 7. Materials (with reorder point + EOQ so alerts work) ──
  const materials = [
    { code: "CEM-OPC53", name: "Cement OPC 53 Grade (50kg)", categoryId: catMap["Cement & Binding"], unit: "BAG", standardCost: 380, gstRate: 28, minStock: 200, reorderPoint: 300, economicOrderQty: 800, hsnCode: "25232900" },
    { code: "CEM-PPC", name: "Cement PPC (50kg)", categoryId: catMap["Cement & Binding"], unit: "BAG", standardCost: 340, gstRate: 28, minStock: 150, reorderPoint: 250, economicOrderQty: 600, hsnCode: "25232900" },
    { code: "STL-TMT12", name: "TMT Steel Rebar 12mm", categoryId: catMap["Steel & Rebar"], unit: "KG", standardCost: 78, gstRate: 18, minStock: 5000, reorderPoint: 8000, economicOrderQty: 10000, hsnCode: "72142090" },
    { code: "STL-TMT16", name: "TMT Steel Rebar 16mm", categoryId: catMap["Steel & Rebar"], unit: "KG", standardCost: 80, gstRate: 18, minStock: 3000, reorderPoint: 5000, economicOrderQty: 8000, hsnCode: "72142090" },
    { code: "BRK-RED", name: "Red Clay Brick (Class A)", categoryId: catMap["Bricks & Blocks"], unit: "NOS", standardCost: 7, gstRate: 5, minStock: 20000, reorderPoint: 30000, economicOrderQty: 50000 },
    { code: "BLK-AAC", name: "AAC Block 600x200x150", categoryId: catMap["Bricks & Blocks"], unit: "NOS", standardCost: 45, gstRate: 18, minStock: 5000, reorderPoint: 8000, economicOrderQty: 12000 },
    { code: "SND-RIVER", name: "River Sand (Grade M)", categoryId: catMap["Sand & Aggregate"], unit: "CFT", standardCost: 45, gstRate: 5, minStock: 1000, reorderPoint: 1500, economicOrderQty: 3000 },
    { code: "AGG-20MM", name: "20mm Aggregate", categoryId: catMap["Sand & Aggregate"], unit: "CFT", standardCost: 55, gstRate: 5, minStock: 1000, reorderPoint: 1500, economicOrderQty: 3000 },
    { code: "ELC-WIRE25", name: "Electrical Wire 2.5sqmm", categoryId: catMap["Electrical"], unit: "MTR", standardCost: 18, gstRate: 18, minStock: 2000, reorderPoint: 3000, economicOrderQty: 5000 },
    { code: "ELC-CONDUIT", name: "PVC Conduit 20mm", categoryId: catMap["Electrical"], unit: "MTR", standardCost: 32, gstRate: 18, minStock: 500, reorderPoint: 800, economicOrderQty: 2000 },
    { code: "PLB-PIPE4", name: "PVC Pipe 4 inch", categoryId: catMap["Plumbing & Sanitary"], unit: "MTR", standardCost: 220, gstRate: 18, minStock: 200, reorderPoint: 300, economicOrderQty: 600 },
    { code: "PNT-ACPRM", name: "Acrylic Primer", categoryId: catMap["Paint & Finishes"], unit: "LTR", standardCost: 120, gstRate: 18, minStock: 150, reorderPoint: 200, economicOrderQty: 400 },
    { code: "PNT-EMULSION", name: "Acrylic Emulsion Paint White", categoryId: catMap["Paint & Finishes"], unit: "LTR", standardCost: 180, gstRate: 18, minStock: 100, reorderPoint: 150, economicOrderQty: 300 },
    { code: "FRM-PLY18", name: "Plywood Formwork 18mm", categoryId: catMap["Formwork & Scaffolding"], unit: "NOS", standardCost: 1450, gstRate: 18, minStock: 50, reorderPoint: 80, economicOrderQty: 200 },
    { code: "SAF-HELMET", name: "Safety Helmet (ISI)", categoryId: catMap["Safety & Consumables"], unit: "NOS", standardCost: 180, gstRate: 18, minStock: 40, reorderPoint: 60, economicOrderQty: 100 },
  ];
  const matMap: Record<string, string> = {};
  for (const m of materials) {
    const row = await ensure("material", { code: m.code }, m);
    matMap[m.code] = row.id;
  }

  // ── 8. Suppliers + subcontractors ───────────────────────────
  const suppliers = [
    { name: "UltraTech Cement Distributors", gstin: "27AAACU1234F1Z5", phone: "+91 98220 11234", email: "orders@ultratechdist.in", address: "MIDC, Bhosari, Pune", leadTimeDays: 3 },
    { name: "JSW Steel Supplies", gstin: "27AAACJ5678K1Z2", phone: "+91 98220 55678", email: "sales@jswsupplies.in", address: "Turbhe, Navi Mumbai", leadTimeDays: 7 },
    { name: "Shree Brick Works", phone: "+91 99700 88123", address: "Rajgurunagar, Pune", leadTimeDays: 2 },
    { name: "Anand Electricals & Wiring", gstin: "27AAFFA9012L1Z9", phone: "+91 98190 33456", email: "anand.elec@gmail.com", address: "Bhosari, Pune", leadTimeDays: 5 },
    { name: "Krishna Sand & Aggregate", phone: "+91 98220 77999", address: "Wagholi, Pune", leadTimeDays: 1 },
    { name: "Asian Paints Depot", gstin: "27AAACA3344P1Z7", phone: "+91 98220 66789", email: "b2b@asiandepot.in", address: "Pimpri, Pune", leadTimeDays: 4 },
    { name: "Ambuja Cement Agency", gstin: "27AAACC5678R1Z3", phone: "+91 98220 88100", email: "ambuja.agency@gmail.com", address: "Chakan, Pune", leadTimeDays: 3 },
    { name: "Tata Steel B2B Portal", gstin: "27AAACT0011K1Z8", phone: "+91 22 6666 4444", email: "b2b@tatasteel.in", address: "BKC, Mumbai", leadTimeDays: 10 },
    { name: "Bharat Sand Suppliers", phone: "+91 99230 11200", address: "Manchar, Pune", leadTimeDays: 1 },
    { name: "Viman Electricals", gstin: "27AABCV3344F1Z1", phone: "+91 98220 99001", email: "vimanelec@yahoo.com", address: "Viman Nagar, Pune", leadTimeDays: 4 },
    { name: "Perfect Plumbing Solutions", gstin: "27AAAFP7890M1Z4", phone: "+91 98220 99002", email: "pps.sales@gmail.com", address: "Kothrud, Pune", leadTimeDays: 6 },
    { name: "Berger Paints Wholesale", gstin: "27AAFCB1122P1Z6", phone: "+91 98220 99003", email: "wholesale@bergerp.in", address: "Nigdi, Pune", leadTimeDays: 5 },
    { name: "Supreme Formwork Systems", gstin: "27AAACS9090S1Z2", phone: "+91 98220 99004", email: "sales@supremeform.in", address: "Talegaon, Pune", leadTimeDays: 8 },
    { name: "SafeGuard Safety Equip", gstin: "27AAFFS5566G1Z9", phone: "+91 98220 99005", email: "orders@safeguard.in", address: "Bhosari, Pune", leadTimeDays: 3 },
    { name: "Maha Lakshmi Hardware", phone: "+91 98220 99006", address: "Raviwar Peth, Pune", leadTimeDays: 2 },
    { name: "Prism Cement & RMC", gstin: "27AAACP3344C1Z7", phone: "+91 98220 99007", email: "prism.rmc@gmail.com", address: "Wagholi, Pune", leadTimeDays: 2 },
    { name: "Agarwal Timber & Plywood", gstin: "27AAFFA2233T1Z5", phone: "+91 98220 99008", email: "agarwal.timber@gmail.com", address: "Market Yard, Pune", leadTimeDays: 7 },
    { name: "Shree Durga Transport", gstin: "27AAACD4455T1Z3", phone: "+91 98220 99009", email: "sd.transport@gmail.com", address: "Transport Nagar, Pune", leadTimeDays: 1 },
  ];
  const supplierMap: Record<string, string> = {};
  for (const s of suppliers) {
    const row = await ensure("supplier", { name: s.name, companyId: company.id }, { ...s, companyId: company.id } as any);
    supplierMap[s.name] = row.id;
  }

  const subcontractors = [
    { name: "Shri Ganesh Plumbing Works", trade: "Plumbing", gstin: "27AABBS1234M1Z3", phone: "+91 98220 66001", address: "Pimpri, Pune" },
    { name: "Sai Electricals Contractor", trade: "Electrical", phone: "+91 98220 66002", address: "Chinchwad, Pune" },
    { name: "Marathon Masonry", trade: "Masonry", phone: "+91 98220 66003", address: "Katraj, Pune" },
    { name: "Apex Painters", trade: "Painting", phone: "+91 98220 66004", address: "Hadapsar, Pune" },
  ];
  const subMap: Record<string, string> = {};
  for (const s of subcontractors) {
    const row = await ensure("subcontractor", { name: s.name, companyId: company.id }, { ...s, companyId: company.id });
    subMap[s.name] = row.id;
  }

  // ── 9. Opening stock (seeded directly as the starting position) ──
  // Recorded as PURCHASE_RECEIPT movements so the ledger + MAC are consistent from day 1.
  const openingStock = [
    { code: "CEM-OPC53", loc: warehouse.id, qty: 1200, cost: 380 },
    { code: "CEM-PPC", loc: warehouse.id, qty: 80, cost: 340 },
    { code: "STL-TMT12", loc: warehouse.id, qty: 8200, cost: 78 },
    { code: "STL-TMT16", loc: warehouse.id, qty: 1500, cost: 80 },
    { code: "BRK-RED", loc: site1.id, qty: 45000, cost: 7 },
    { code: "BLK-AAC", loc: site1.id, qty: 3200, cost: 45 },
    { code: "ELC-WIRE25", loc: warehouse.id, qty: 1800, cost: 18 },
    { code: "PNT-ACPRM", loc: warehouse.id, qty: 220, cost: 120 },
    { code: "SND-RIVER", loc: warehouse.id, qty: 600, cost: 45 },
    { code: "AGG-20MM", loc: warehouse.id, qty: 800, cost: 55 },
    { code: "SAF-HELMET", loc: warehouse.id, qty: 50, cost: 180 },
  ];
  for (const s of openingStock) {
    const mid = matMap[s.code];
    if (!mid) continue;
    await withStockTransaction(async (tx) => {
      await recordMovement(tx, {
        materialId: mid,
        movementType: "PURCHASE_RECEIPT",
        toLocationId: s.loc,
        qty: new Decimal(s.qty),
        unitCost: new Decimal(s.cost),
        reason: "Opening stock at go-live",
        refType: "SEED",
      });
    });
  }

  // ── 10. Requisition (planning layer) → approved ─────────────
  const req1 = await prisma.materialRequisition.create({
    data: {
      reqNumber: "REQ-2024-0001",
      projectId: project1.id,
      phaseId: phase1A.id,
      requestedById: U.supervisor,
      status: "APPROVED",
      requestDate: new Date("2024-03-01"),
      neededByDate: new Date("2024-03-15"),
      notes: "Materials for Tower A slab + beam casting",
      lines: {
        create: [
          { materialId: matMap["CEM-OPC53"], qtyRequested: 600, notes: "Slab mix" },
          { materialId: matMap["STL-TMT12"], qtyRequested: 4000, notes: "Reinforcement" },
          { materialId: matMap["SND-RIVER"], qtyRequested: 1200, notes: "Mortar + plaster" },
        ],
      },
    },
  });
  // A second requisition still pending approval (so the requisitions badge has a count)
  await prisma.materialRequisition.create({
    data: {
      reqNumber: "REQ-2024-0002",
      projectId: project1.id,
      phaseId: phase1B.id,
      requestedById: U.supervisor,
      status: "SUBMITTED",
      requestDate: new Date("2024-04-20"),
      neededByDate: new Date("2024-05-10"),
      notes: "Tower B foundation — pending approval",
      lines: {
        create: [
          { materialId: matMap["CEM-OPC53"], qtyRequested: 400, notes: "Foundation" },
          { materialId: matMap["STL-TMT16"], qtyRequested: 2500, notes: "Footings" },
        ],
      },
    },
  });
  // REQ-0003: approved — electrical rough-in for Tower A
  await prisma.materialRequisition.create({
    data: {
      reqNumber: "REQ-2024-0003",
      projectId: project1.id,
      phaseId: phase1A.id,
      requestedById: U.supervisor,
      status: "APPROVED",
      requestDate: new Date("2024-05-01"),
      neededByDate: new Date("2024-05-15"),
      notes: "Electrical rough-in — Tower A floors 1-2",
      lines: {
        create: [
          { materialId: matMap["ELC-WIRE25"], qtyRequested: 3000, notes: "Wiring for 2BHK units" },
          { materialId: matMap["ELC-CONDUIT"], qtyRequested: 800, notes: "Conduit for floor routing" },
        ],
      },
    },
  });
  // REQ-0004: submitted — plumbing materials for Tower A
  await prisma.materialRequisition.create({
    data: {
      reqNumber: "REQ-2024-0004",
      projectId: project1.id,
      phaseId: phase1A.id,
      requestedById: U.supervisor,
      status: "SUBMITTED",
      requestDate: new Date("2024-05-10"),
      neededByDate: new Date("2024-05-25"),
      notes: "Plumbing rough-in — Tower A",
      lines: {
        create: [
          { materialId: matMap["PLB-PIPE4"], qtyRequested: 400, notes: "Soil + waste lines" },
        ],
      },
    },
  });
  // REQ-0005: approved — paint + primer for Tower A finishing
  await prisma.materialRequisition.create({
    data: {
      reqNumber: "REQ-2024-0005",
      projectId: project1.id,
      phaseId: phase1A.id,
      requestedById: U.supervisor,
      status: "APPROVED",
      requestDate: new Date("2024-05-15"),
      neededByDate: new Date("2024-06-01"),
      notes: "Finishing — paint + primer for A-101 and A-201",
      lines: {
        create: [
          { materialId: matMap["PNT-ACPRM"], qtyRequested: 150, notes: "Primer coat" },
          { materialId: matMap["PNT-EMULSION"], qtyRequested: 100, notes: "Final coat white" },
        ],
      },
    },
  });
  // REQ-0006: rejected — duplicate request
  await prisma.materialRequisition.create({
    data: {
      reqNumber: "REQ-2024-0006",
      projectId: project2.id,
      requestedById: U.manager,
      status: "REJECTED",
      requestDate: new Date("2024-04-15"),
      neededByDate: new Date("2024-05-01"),
      notes: "Duplicate of REQ-0001 — rejected by manager",
      lines: {
        create: [
          { materialId: matMap["CEM-OPC53"], qtyRequested: 200, notes: "Duplicate" },
        ],
      },
    },
  });
  // REQ-0007: submitted — safety gear restock
  await prisma.materialRequisition.create({
    data: {
      reqNumber: "REQ-2024-0007",
      projectId: project1.id,
      requestedById: U.supervisor,
      status: "SUBMITTED",
      requestDate: new Date("2024-05-20"),
      neededByDate: new Date("2024-05-28"),
      notes: "Safety gear restock — helmets + gloves",
      lines: {
        create: [
          { materialId: matMap["SAF-HELMET"], qtyRequested: 80, notes: "New site staff" },
        ],
      },
    },
  });

  // ── 11. Purchase Orders (full lifecycle via services) ──────
  // PO-1: PROJECT scope → Greenfield site (cement + sand for slab)
  const po1 = await createPurchaseOrder({
    supplierId: supplierMap["UltraTech Cement Distributors"],
    procurementScope: "PROJECT",
    companyId: company.id,
    projectId: project1.id,
    destinationLocationId: site1.id,
    expectedDate: new Date("2024-03-20"),
    notes: "Against REQ-2024-0001 — cement + sand for Tower A slab",
    lines: [
      { materialId: matMap["CEM-OPC53"], qtyOrdered: 500, unitCost: 380, gstRate: 28 },
      { materialId: matMap["SND-RIVER"], qtyOrdered: 1200, unitCost: 45, gstRate: 5 },
    ],
  });
  await approvePurchaseOrder(po1.id, "OWNER");
  await orderPurchaseOrder(po1.id);
  // Backdate orderDate so "Age" column shows realistic elapsed time
  await prisma.purchaseOrder.update({ where: { id: po1.id }, data: { orderDate: new Date("2024-03-05"), createdAt: new Date("2024-03-01") } });
  // Mark the requisition as converted to this PO
  await prisma.materialRequisition.update({ where: { id: req1.id }, data: { status: "CONVERTED", convertedPoId: po1.id } });

  // PO-2: COMPANY scope → central warehouse (steel restock)
  const po2 = await createPurchaseOrder({
    supplierId: supplierMap["JSW Steel Supplies"],
    procurementScope: "COMPANY",
    companyId: company.id,
    destinationLocationId: warehouse.id,
    expectedDate: new Date("2024-03-25"),
    notes: "Quarterly steel restock",
    lines: [
      { materialId: matMap["STL-TMT12"], qtyOrdered: 5000, unitCost: 78, gstRate: 18 },
      { materialId: matMap["STL-TMT16"], qtyOrdered: 3000, unitCost: 80, gstRate: 18 },
    ],
  });
  await approvePurchaseOrder(po2.id, "OWNER");
  await orderPurchaseOrder(po2.id);
  await prisma.purchaseOrder.update({ where: { id: po2.id }, data: { orderDate: new Date("2024-03-08"), createdAt: new Date("2024-03-05") } });

  // PO-3: COMPANY scope → warehouse (bricks + blocks), still DRAFT (badge fodder)
  await createPurchaseOrder({
    supplierId: supplierMap["Shree Brick Works"],
    procurementScope: "COMPANY",
    companyId: company.id,
    destinationLocationId: warehouse.id,
    expectedDate: new Date("2024-04-30"),
    notes: "Draft — pending approval",
    lines: [
      { materialId: matMap["BRK-RED"], qtyOrdered: 40000, unitCost: 7, gstRate: 5 },
      { materialId: matMap["BLK-AAC"], qtyOrdered: 6000, unitCost: 45, gstRate: 18 },
    ],
  });

  // PO-4: PROJECT scope → Greenfield site (electrical wiring + conduit for Tower A)
  const po4 = await createPurchaseOrder({
    supplierId: supplierMap["Anand Electricals & Wiring"],
    procurementScope: "PROJECT",
    companyId: company.id,
    projectId: project1.id,
    destinationLocationId: site1.id,
    expectedDate: new Date("2024-05-18"),
    notes: "Against REQ-2024-0003 — electrical rough-in Tower A",
    lines: [
      { materialId: matMap["ELC-WIRE25"], qtyOrdered: 3000, unitCost: 18, gstRate: 18 },
      { materialId: matMap["ELC-CONDUIT"], qtyOrdered: 800, unitCost: 32, gstRate: 18 },
    ],
  });
  await approvePurchaseOrder(po4.id, "OWNER");
  await orderPurchaseOrder(po4.id);
  await prisma.purchaseOrder.update({ where: { id: po4.id }, data: { orderDate: new Date("2024-05-03"), createdAt: new Date("2024-04-28") } });

  // PO-5: PROJECT scope → Greenfield site (paint + primer for finishing)
  const po5 = await createPurchaseOrder({
    supplierId: supplierMap["Asian Paints Depot"],
    procurementScope: "PROJECT",
    companyId: company.id,
    projectId: project1.id,
    destinationLocationId: site1.id,
    expectedDate: new Date("2024-06-01"),
    notes: "Against REQ-2024-0005 — paint for Tower A finishing",
    lines: [
      { materialId: matMap["PNT-ACPRM"], qtyOrdered: 150, unitCost: 120, gstRate: 18 },
      { materialId: matMap["PNT-EMULSION"], qtyOrdered: 100, unitCost: 180, gstRate: 18 },
    ],
  });
  await approvePurchaseOrder(po5.id, "OWNER");
  await orderPurchaseOrder(po5.id);
  await prisma.purchaseOrder.update({ where: { id: po5.id }, data: { orderDate: new Date("2024-05-20"), createdAt: new Date("2024-05-15") } });

  // PO-6: COMPANY scope → warehouse (safety helmets restock)
  const po6 = await createPurchaseOrder({
    supplierId: supplierMap["SafeGuard Safety Equip"],
    procurementScope: "COMPANY",
    companyId: company.id,
    destinationLocationId: warehouse.id,
    expectedDate: new Date("2024-05-28"),
    notes: "Safety gear restock for new site staff",
    lines: [
      { materialId: matMap["SAF-HELMET"], qtyOrdered: 100, unitCost: 180, gstRate: 18 },
    ],
  });
  await approvePurchaseOrder(po6.id, "OWNER");
  await orderPurchaseOrder(po6.id);
  await prisma.purchaseOrder.update({ where: { id: po6.id }, data: { orderDate: new Date("2024-05-15"), createdAt: new Date("2024-05-10") } });

  // PO-7: PROJECT scope → Greenfield site (plumbing pipes)
  const po7 = await createPurchaseOrder({
    supplierId: supplierMap["Perfect Plumbing Solutions"],
    procurementScope: "PROJECT",
    companyId: company.id,
    projectId: project1.id,
    destinationLocationId: site1.id,
    expectedDate: new Date("2024-05-25"),
    notes: "Against REQ-2024-0004 — plumbing rough-in Tower A",
    lines: [
      { materialId: matMap["PLB-PIPE4"], qtyOrdered: 400, unitCost: 220, gstRate: 18 },
    ],
  });
  await approvePurchaseOrder(po7.id, "OWNER");
  await orderPurchaseOrder(po7.id);
  await prisma.purchaseOrder.update({ where: { id: po7.id }, data: { orderDate: new Date("2024-05-10"), createdAt: new Date("2024-05-05") } });

  // PO-8: COMPANY scope → warehouse (formwork plywood from new supplier)
  const po8 = await createPurchaseOrder({
    supplierId: supplierMap["Supreme Formwork Systems"],
    procurementScope: "COMPANY",
    companyId: company.id,
    destinationLocationId: warehouse.id,
    expectedDate: new Date("2024-06-10"),
    notes: "Formwork for Tower B slab preparation",
    lines: [
      { materialId: matMap["FRM-PLY18"], qtyOrdered: 150, unitCost: 1450, gstRate: 18 },
    ],
  });
  await approvePurchaseOrder(po8.id, "OWNER");
  await orderPurchaseOrder(po8.id);
  await prisma.purchaseOrder.update({ where: { id: po8.id }, data: { orderDate: new Date("2024-05-28"), createdAt: new Date("2024-05-25") } });

  // PO-9: COMPANY scope → warehouse (Ambuja cement — alternate supplier)
  await createPurchaseOrder({
    supplierId: supplierMap["Ambuja Cement Agency"],
    procurementScope: "COMPANY",
    companyId: company.id,
    destinationLocationId: warehouse.id,
    expectedDate: new Date("2024-06-15"),
    notes: "Draft — comparing Ambuja vs UltraTech pricing",
    lines: [
      { materialId: matMap["CEM-PPC"], qtyOrdered: 500, unitCost: 340, gstRate: 28 },
    ],
  });

  // PO-10: PROJECT scope → Hillview site (cement for commercial foundation)
  const po10 = await createPurchaseOrder({
    supplierId: supplierMap["Prism Cement & RMC"],
    procurementScope: "PROJECT",
    companyId: company.id,
    projectId: project2.id,
    destinationLocationId: site2.id,
    expectedDate: new Date("2024-06-20"),
    notes: "Hillview Block 1 foundation — ready mix + cement",
    lines: [
      { materialId: matMap["CEM-OPC53"], qtyOrdered: 800, unitCost: 385, gstRate: 28 },
      { materialId: matMap["AGG-20MM"], qtyOrdered: 2000, unitCost: 55, gstRate: 5 },
    ],
  });
  await approvePurchaseOrder(po10.id, "OWNER");
  await orderPurchaseOrder(po10.id);
  await prisma.purchaseOrder.update({ where: { id: po10.id }, data: { orderDate: new Date("2024-06-05"), createdAt: new Date("2024-06-01") } });

  // PO-11: COMPANY scope → warehouse (sand + aggregate restock from Bharat Sand)
  await createPurchaseOrder({
    supplierId: supplierMap["Bharat Sand Suppliers"],
    procurementScope: "COMPANY",
    companyId: company.id,
    destinationLocationId: warehouse.id,
    expectedDate: new Date("2024-06-25"),
    notes: "Draft — sand + aggregate for Q3",
    lines: [
      { materialId: matMap["SND-RIVER"], qtyOrdered: 3000, unitCost: 42, gstRate: 5 },
      { materialId: matMap["AGG-20MM"], qtyOrdered: 2000, unitCost: 52, gstRate: 5 },
    ],
  });

  // ── 12. Goods receipts (PO-1 full, PO-2 partial) ────────────
  // PO-1: full receipt, inspection passed
  const po1Lines = await prisma.purchaseOrderLine.findMany({ where: { purchaseOrderId: po1.id } });
  await receiveGoods({
    purchaseOrderId: po1.id,
    locationId: site1.id,
    receivedById: U.supervisor,
    notes: "Full delivery, quality OK",
    lines: po1Lines.map((l) => ({
      purchaseOrderLineId: l.id,
      materialId: l.materialId,
      qtyReceived: l.qtyOrdered,
      unitCost: l.unitCost,
    })),
  });
  // Mark inspection as passed (receiveGoods doesn't set inspection fields)
  const gr1 = await prisma.goodsReceipt.findFirstOrThrow({ where: { purchaseOrderId: po1.id } });
  await prisma.goodsReceipt.update({
    where: { id: gr1.id },
    data: { inspectionStatus: "PASSED", inspectionNotes: "All items within spec", inspectedById: U.manager, inspectedAt: new Date("2024-03-19") },
  });

  // PO-2: partial receipt (60% of each line) — leaves PO in PARTIAL
  const po2Lines = await prisma.purchaseOrderLine.findMany({ where: { purchaseOrderId: po2.id } });
  await receiveGoods({
    purchaseOrderId: po2.id,
    locationId: warehouse.id,
    receivedById: U.supervisor,
    notes: "Partial delivery — balance expected next week",
    lines: po2Lines.map((l) => ({
      purchaseOrderLineId: l.id,
      materialId: l.materialId,
      qtyReceived: new Decimal(l.qtyOrdered).times(0.6),
      unitCost: l.unitCost,
    })),
  });
  const gr2 = await prisma.goodsReceipt.findFirstOrThrow({ where: { purchaseOrderId: po2.id } });
  await prisma.goodsReceipt.update({
    where: { id: gr2.id },
    data: { inspectionStatus: "PENDING", notes: "Awaiting QC on 16mm samples" },
  });

  // PO-4: full receipt — electrical wiring + conduit
  const po4Lines = await prisma.purchaseOrderLine.findMany({ where: { purchaseOrderId: po4.id } });
  await receiveGoods({
    purchaseOrderId: po4.id,
    locationId: site1.id,
    receivedById: U.supervisor,
    notes: "Full delivery, quality OK",
    lines: po4Lines.map((l) => ({
      purchaseOrderLineId: l.id,
      materialId: l.materialId,
      qtyReceived: l.qtyOrdered,
      unitCost: l.unitCost,
    })),
  });
  const gr4 = await prisma.goodsReceipt.findFirstOrThrow({ where: { purchaseOrderId: po4.id } });
  await prisma.goodsReceipt.update({
    where: { id: gr4.id },
    data: { inspectionStatus: "PASSED", inspectionNotes: "Wire gauge + conduit diameter verified", inspectedById: U.manager, inspectedAt: new Date("2024-05-17") },
  });

  // PO-5: partial receipt (80% — primer delivered, paint back-ordered)
  const po5Lines = await prisma.purchaseOrderLine.findMany({ where: { purchaseOrderId: po5.id } });
  await receiveGoods({
    purchaseOrderId: po5.id,
    locationId: site1.id,
    receivedById: U.supervisor,
    notes: "Primer delivered, emulsion paint back-ordered by supplier",
    lines: po5Lines.map((l) => ({
      purchaseOrderLineId: l.id,
      materialId: l.materialId,
      qtyReceived: new Decimal(l.qtyOrdered).times(l.materialId === matMap["PNT-ACPRM"] ? 1 : 0.8),
      unitCost: l.unitCost,
    })),
  });
  const gr5 = await prisma.goodsReceipt.findFirstOrThrow({ where: { purchaseOrderId: po5.id } });
  await prisma.goodsReceipt.update({
    where: { id: gr5.id },
    data: { inspectionStatus: "PASSED", inspectionNotes: "Primer quality OK", inspectedById: U.manager, inspectedAt: new Date("2024-05-31") },
  });

  // PO-6: full receipt — safety helmets
  const po6Lines = await prisma.purchaseOrderLine.findMany({ where: { purchaseOrderId: po6.id } });
  await receiveGoods({
    purchaseOrderId: po6.id,
    locationId: warehouse.id,
    receivedById: U.supervisor,
    notes: "Full delivery — 100 helmets",
    lines: po6Lines.map((l) => ({
      purchaseOrderLineId: l.id,
      materialId: l.materialId,
      qtyReceived: l.qtyOrdered,
      unitCost: l.unitCost,
    })),
  });
  const gr6 = await prisma.goodsReceipt.findFirstOrThrow({ where: { purchaseOrderId: po6.id } });
  await prisma.goodsReceipt.update({
    where: { id: gr6.id },
    data: { inspectionStatus: "PASSED", inspectionNotes: "ISI mark verified on all units", inspectedById: U.manager, inspectedAt: new Date("2024-05-27") },
  });

  // PO-7: full receipt — plumbing pipes
  const po7Lines = await prisma.purchaseOrderLine.findMany({ where: { purchaseOrderId: po7.id } });
  await receiveGoods({
    purchaseOrderId: po7.id,
    locationId: site1.id,
    receivedById: U.supervisor,
    notes: "Full delivery, pipes in good condition",
    lines: po7Lines.map((l) => ({
      purchaseOrderLineId: l.id,
      materialId: l.materialId,
      qtyReceived: l.qtyOrdered,
      unitCost: l.unitCost,
    })),
  });
  const gr7 = await prisma.goodsReceipt.findFirstOrThrow({ where: { purchaseOrderId: po7.id } });
  await prisma.goodsReceipt.update({
    where: { id: gr7.id },
    data: { inspectionStatus: "PASSED", inspectionNotes: "Pipe diameter + wall thickness OK", inspectedById: U.manager, inspectedAt: new Date("2024-05-24") },
  });

  // PO-10: partial receipt (50% — cement received, aggregate delayed)
  const po10Lines = await prisma.purchaseOrderLine.findMany({ where: { purchaseOrderId: po10.id } });
  await receiveGoods({
    purchaseOrderId: po10.id,
    locationId: site2.id,
    receivedById: U.supervisor,
    notes: "Cement received, aggregate delayed due to transport strike",
    lines: po10Lines.map((l) => ({
      purchaseOrderLineId: l.id,
      materialId: l.materialId,
      qtyReceived: new Decimal(l.qtyOrdered).times(0.5),
      unitCost: l.unitCost,
    })),
  });
  const gr10 = await prisma.goodsReceipt.findFirstOrThrow({ where: { purchaseOrderId: po10.id } });
  await prisma.goodsReceipt.update({
    where: { id: gr10.id },
    data: { inspectionStatus: "PENDING", notes: "Cement samples sent to lab for compressive test" },
  });

  // ── 12b. Land purchase + parcel + partition ─────────────────
  // Created BEFORE material issues so reallocateProjectCosts (triggered
  // inside issueMaterialsToProject) sees the land cost + built units.
  const land = await prisma.landPurchase.create({
    data: {
      companyId: company.id,
      projectId: project1.id,
      sellerName: "Patil Family Trust",
      sellerContact: "+91 98220 77889",
      totalArea: 30000,
      areaUnit: "SQFT",
      totalCost: 90000000,
      registryNo: "REG/PUN/2024/04512",
      location: "Wagholi, Pune",
      purchaseDate: new Date("2023-11-10"),
      parcels: {
        create: {
          number: "PLOT-1",
          area: 30000,
          areaUnit: "SQFT",
          status: "PARTITIONED",
          acquisitionCost: 90000000,
          askingPrice: 120000000,
          currentValuation: 110000000,
          projectId: project1.id,
        },
      },
    },
  });
  const parentParcel = await prisma.landParcel.findFirstOrThrow({ where: { landPurchaseId: land.id, number: "PLOT-1" } });
  const childParcels = [
    { number: "PLOT-1A", area: 12000, status: "AVAILABLE" as const, acquisitionCost: 36000000, currentValuation: 45000000, askingPrice: 52000000 },
    { number: "PLOT-1B", area: 12000, status: "AVAILABLE" as const, acquisitionCost: 36000000, currentValuation: 44000000, askingPrice: 50000000 },
    { number: "PLOT-1C", area: 6000, status: "HOLD" as const, acquisitionCost: 18000000, currentValuation: 21000000 },
  ];
  await prisma.landParcel.createMany({
    data: childParcels.map((c) => ({
      landPurchaseId: land.id,
      parentParcelId: parentParcel.id,
      number: c.number,
      area: c.area,
      areaUnit: "SQFT",
      status: c.status,
      acquisitionCost: c.acquisitionCost,
      askingPrice: (c as any).askingPrice ?? null,
      currentValuation: c.currentValuation,
      projectId: project1.id,
    })),
  });
  await prisma.landPartition.create({
    data: {
      parentParcelId: parentParcel.id,
      partitionDate: new Date("2024-01-05"),
      childCount: childParcels.length,
      notes: "Split into Tower A / Tower B / amenity plots",
    },
  });

  // ── 12c. Built units ────────────────────────────────────────
  // Created BEFORE material issues so reallocateProjectCosts has sellable area.
  const unitDefs: { phase: string; type: "BHK_2" | "BHK_3" | "SHOP"; unitNumber: string; floor: number; wing?: string; area: number; status: "PLANNED" | "UNDER_CONSTRUCTION" | "AVAILABLE" | "HOLD" | "SOLD"; askingPrice?: number; currentValuation: number }[] = [];
  for (let f = 1; f <= 4; f++) {
    unitDefs.push({ phase: "Tower A", type: "BHK_2", unitNumber: `A-${f}01`, floor: f, wing: "A", area: 850, status: f === 2 ? "UNDER_CONSTRUCTION" : "AVAILABLE", askingPrice: 15000000, currentValuation: 15000000 });
    unitDefs.push({ phase: "Tower A", type: "BHK_3", unitNumber: `A-${f}02`, floor: f, wing: "A", area: 1200, status: f <= 2 ? "AVAILABLE" : f === 3 ? "UNDER_CONSTRUCTION" : "PLANNED", askingPrice: 21000000, currentValuation: 21000000 });
  }
  unitDefs.push({ phase: "Tower A", type: "SHOP", unitNumber: "S-01", floor: 0, area: 400, status: "AVAILABLE", askingPrice: 8000000, currentValuation: 8000000 });
  unitDefs.push({ phase: "Tower A", type: "SHOP", unitNumber: "S-02", floor: 0, area: 400, status: "AVAILABLE", askingPrice: 8000000, currentValuation: 8000000 });
  unitDefs.push({ phase: "Tower B", type: "BHK_2", unitNumber: "B-101", floor: 1, wing: "B", area: 850, status: "PLANNED", askingPrice: 16000000, currentValuation: 16000000 });
  unitDefs.push({ phase: "Tower B", type: "BHK_3", unitNumber: "B-102", floor: 1, wing: "B", area: 1200, status: "PLANNED", askingPrice: 22000000, currentValuation: 22000000 });

  const phaseByName: Record<string, string> = { "Tower A": phase1A.id, "Tower B": phase1B.id };
  await prisma.builtUnit.createMany({
    data: unitDefs.map((u) => ({
      projectId: project1.id,
      phaseId: phaseByName[u.phase],
      unitType: u.type,
      unitNumber: u.unitNumber,
      floor: u.floor,
      wing: u.wing,
      area: u.area,
      areaUnit: "SQFT",
      status: u.status,
      productionCost: 0,
      askingPrice: u.askingPrice ?? null,
      currentValuation: u.currentValuation,
    })),
  });

  // Hillview Corporate Park (project2) — planned office units so the project
  // has sellable area for cost-per-sqft allocation (material receipts from PO-10).
  const hillviewUnits: { unitNumber: string; floor: number; area: number; type: "BHK_2" | "BHK_3" | "SHOP"; status: "PLANNED" | "UNDER_CONSTRUCTION"; currentValuation: number }[] = [];
  for (let f = 1; f <= 3; f++) {
    hillviewUnits.push({ unitNumber: `H-${f}01`, floor: f, area: 1500, type: "SHOP", status: f === 1 ? "UNDER_CONSTRUCTION" : "PLANNED", currentValuation: 0 });
    hillviewUnits.push({ unitNumber: `H-${f}02`, floor: f, area: 2000, type: "SHOP", status: f === 1 ? "UNDER_CONSTRUCTION" : "PLANNED", currentValuation: 0 });
  }
  await prisma.builtUnit.createMany({
    data: hillviewUnits.map((u) => ({
      projectId: project2.id,
      phaseId: phase2A.id,
      unitType: u.type,
      unitNumber: u.unitNumber,
      floor: u.floor,
      area: u.area,
      areaUnit: "SQFT",
      status: u.status,
      productionCost: 0,
      askingPrice: null,
      currentValuation: u.currentValuation,
    })),
  });

  // ── 13. Material issues (consumption to project 1) ──────────
  // Issue 1: foundation pour from warehouse (cement + steel + sand)
  await issueMaterialsToProject({
    projectId: project1.id,
    fromLocationId: warehouse.id,
    issuedById: U.supervisor,
    notes: "Tower A foundation concrete pour",
    lines: [
      { materialId: matMap["CEM-OPC53"], qty: 200 },
      { materialId: matMap["STL-TMT12"], qty: 1500 },
      { materialId: matMap["SND-RIVER"], qty: 400 },
    ],
  });
  // Issue 2: brickwork from site1 (bricks + mortar sand)
  await issueMaterialsToProject({
    projectId: project1.id,
    fromLocationId: site1.id,
    issuedById: U.supervisor,
    notes: "Tower A ground-floor brickwork",
    lines: [
      { materialId: matMap["BRK-RED"], qty: 12000 },
      { materialId: matMap["SND-RIVER"], qty: 300 },
    ],
  });

  // ── 14. Stock transfers (warehouse → site1) ─────────────────
  // Transfer cement + aggregate to the site yard for the slab pour.
  // (Both materials have warehouse opening stock, so the ledger stays consistent.)
  const transfer1 = await prisma.stockTransfer.create({
    data: {
      fromLocationId: warehouse.id,
      toLocationId: site1.id,
      transferDate: new Date("2024-04-05"),
      status: "COMPLETED",
      notes: "Move cement to site for slab",
      lines: { create: [{ materialId: matMap["CEM-OPC53"], qty: 300 }] },
    },
  });
  await withStockTransaction(async (tx) => {
    await recordTransfer(tx, {
      materialId: matMap["CEM-OPC53"],
      fromLocationId: warehouse.id,
      toLocationId: site1.id,
      qty: new Decimal(300),
      reason: "Transfer cement to site for slab pour",
      refType: "STOCK_TRANSFER",
      refId: transfer1.id,
      userId: U.supervisor,
    });
  });
  const transfer2 = await prisma.stockTransfer.create({
    data: {
      fromLocationId: warehouse.id,
      toLocationId: site1.id,
      transferDate: new Date("2024-04-06"),
      status: "COMPLETED",
      notes: "Move aggregate to site",
      lines: { create: [{ materialId: matMap["AGG-20MM"], qty: 300 }] },
    },
  });
  await withStockTransaction(async (tx) => {
    await recordTransfer(tx, {
      materialId: matMap["AGG-20MM"],
      fromLocationId: warehouse.id,
      toLocationId: site1.id,
      qty: new Decimal(300),
      reason: "Transfer aggregate to site for slab",
      refType: "STOCK_TRANSFER",
      refId: transfer2.id,
      userId: U.supervisor,
    });
  });

  // ── 15. Stock count + reconciliation (variance) ──────────────
  // Physical count at the warehouse reveals a small shortage on cement and a surplus on steel.
  const countLines = [
    { material: "CEM-OPC53", counted: 980, system: 1000 }, // -20 (shortage)
    { material: "STL-TMT12", counted: 4600, system: 4500 }, // +100 (surplus)
  ];
  await prisma.stockCount.create({
    data: {
      locationId: warehouse.id,
      countDate: new Date("2024-04-10"),
      status: "COUNTED",
      notes: "Quarterly physical count — Q1",
      lines: {
        create: countLines.map((l) => ({
          materialId: matMap[l.material],
          countedQty: l.counted,
          systemQty: l.system,
          variance: l.counted - l.system,
        })),
      },
    },
  });

  // ── 16. Supplier return (defective cement) ───────────────────
  await prisma.supplierReturn.create({
    data: {
      returnNumber: "RET-2024-0001",
      supplierId: supplierMap["UltraTech Cement Distributors"],
      companyId: company.id,
      purchaseOrderId: po1.id,
      locationId: site1.id,
      status: "COMPLETED",
      returnDate: new Date("2024-03-25"),
      creditNoteNo: "CN-2024-0099",
      notes: "10 bags damaged in transit — credit note received",
      lines: {
        create: [{ materialId: matMap["CEM-OPC53"], qty: 10, unitCost: 380, reason: "Damaged in transit" }],
      },
    },
  });

  // ── 17. Equipment + assignments + maintenance ───────────────
  const equipmentItems = [
    { assetTag: "JCB-001", name: "JCB 3DX Excavator", model: "3DX Super", serialNumber: "JCB3DX2024001", category: "Heavy Machinery", acquisitionCost: 3500000, currentValue: 2800000, purchaseDate: new Date("2023-06-01") },
    { assetTag: "MIX-001", name: "Concrete Mixer 500L", model: "CM-500", serialNumber: "CM500001", category: "Heavy Machinery", acquisitionCost: 85000, currentValue: 65000, purchaseDate: new Date("2023-06-01") },
    { assetTag: "SCT-001", name: "Scaffolding Set A", model: "Cup-Lock", category: "Scaffolding", acquisitionCost: 450000, currentValue: 380000, purchaseDate: new Date("2023-08-01") },
    { assetTag: "TRL-001", name: "Site Pickup Truck", model: "Tata Ace", serialNumber: "TA2024001", category: "Vehicle", acquisitionCost: 650000, currentValue: 520000, purchaseDate: new Date("2023-09-01") },
    { assetTag: "PWR-001", name: "Diesel Generator 15kVA", model: "DG-15", serialNumber: "DG15001", category: "Power Tool", acquisitionCost: 180000, currentValue: 145000, purchaseDate: new Date("2023-07-01") },
    { assetTag: "VIB-001", name: "Concrete Vibrator", model: "CV-60", serialNumber: "CV60001", category: "Power Tool", acquisitionCost: 32000, currentValue: 24000, purchaseDate: new Date("2023-10-01") },
  ];
  const equipmentMap: Record<string, string> = {};
  for (const e of equipmentItems) {
    const row = await ensure("equipment", { assetTag: e.assetTag }, { ...e, companyId: company.id });
    equipmentMap[e.assetTag] = row.id;
  }

  // Assign excavator + vibrator to Greenfield site
  await prisma.equipmentAssignment.create({
    data: { equipmentId: equipmentMap["JCB-001"], locationId: site1.id, projectId: project1.id, status: "ACTIVE", assignedAt: new Date("2024-01-20") },
  });
  await prisma.equipment.update({ where: { id: equipmentMap["JCB-001"] }, data: { status: "ASSIGNED" } });
  await prisma.equipmentAssignment.create({
    data: { equipmentId: equipmentMap["VIB-001"], locationId: site1.id, projectId: project1.id, status: "ACTIVE", assignedAt: new Date("2024-02-01") },
  });
  await prisma.equipment.update({ where: { id: equipmentMap["VIB-001"] }, data: { status: "ASSIGNED" } });

  // Mixer in maintenance
  await prisma.equipmentMaintenance.create({
    data: {
      equipmentId: equipmentMap["MIX-001"],
      type: "REPAIR",
      startDate: new Date("2024-03-20"),
      endDate: new Date("2024-03-22"),
      cost: 8500,
      vendor: "Premier Motors",
      notes: "Drum bearing replacement",
    },
  });
  await prisma.equipment.update({ where: { id: equipmentMap["MIX-001"] }, data: { status: "IN_MAINTENANCE" } });

  // Scheduled service for the generator
  await prisma.equipmentMaintenance.create({
    data: {
      equipmentId: equipmentMap["PWR-001"],
      type: "SCHEDULED",
      startDate: new Date("2024-05-01"),
      cost: 4500,
      vendor: "Premier Motors",
      notes: "Quarterly oil + filter change",
    },
  });

  // ── 18. Land purchase + parcel + partition ──────────────────
  // MOVED BEFORE material issues so reallocateProjectCosts (called during
  // issue) sees the built units + land and can allocate costs per sqft.

  // ── 20. Customers ───────────────────────────────────────────
  const customers = [
    { name: "Rajesh Sharma", phone: "+91 98190 11111", email: "rajesh.sharma@gmail.com", address: "Kothrud, Pune" },
    { name: "Priya Deshpande", phone: "+91 98220 22222", email: "priya.d@gmail.com", address: "Baner, Pune" },
    { name: "Mohit Enterprises", phone: "+91 99700 33333", email: "accounts@mohitent.in", gstin: "27AAACM1234M1Z5", address: "Hadapsar, Pune" },
    { name: "Sunil Joshi", phone: "+91 98220 44444", email: "sunil.joshi@gmail.com", address: "Viman Nagar, Pune" },
    { name: "Verma Traders", phone: "+91 98220 55555", email: "contact@vermatraders.in", gstin: "27AAFCV4567N1Z2", address: "Kharadi, Pune" },
  ];
  const customerMap: Record<string, string> = {};
  for (const c of customers) {
    const row = await ensure("customer", { name: c.name, companyId: company.id }, { ...c, companyId: company.id });
    customerMap[c.name] = row.id;
  }

  // ── 21. Project costs (labour / overhead / permit / contractor) ──
  await prisma.projectCost.createMany({
    data: [
      { projectId: project1.id, costType: "LABOUR", amount: 2500000, date: new Date("2024-02-28"), vendor: "Sai Labour Contractors", notes: "Foundation + slab labour" },
      { projectId: project1.id, costType: "OVERHEAD", amount: 800000, date: new Date("2024-03-15"), notes: "Site office + security (Q1)" },
      { projectId: project1.id, costType: "PERMIT", amount: 350000, date: new Date("2024-01-20"), vendor: "Pune Municipal Corporation", notes: "Building permission fees" },
      { projectId: project1.id, costType: "CONTRACTOR", amount: 450000, date: new Date("2024-03-10"), subcontractorId: subMap["Shri Ganesh Plumbing Works"], notes: "Plumbing rough-in Tower A" },
      { projectId: project1.id, costType: "CONTRACTOR", amount: 380000, date: new Date("2024-03-25"), subcontractorId: subMap["Sai Electricals Contractor"], notes: "Electrical conduits Tower A" },
      { projectId: project1.id, costType: "EQUIPMENT", amount: 120000, date: new Date("2024-04-05"), notes: "Diesel + operator charges (JCB)" },
      { projectId: project2.id, costType: "PERMIT", amount: 1200000, date: new Date("2024-02-10"), vendor: "Pune Municipal Corporation", notes: "Commercial building plan sanction" },
    ],
  });

  // ── 22. Company expenses ─────────────────────────────────────
  await prisma.expense.createMany({
    data: [
      { companyId: company.id, category: "Office Rent", amount: 85000, date: new Date("2024-03-01"), notes: "Monthly office rent" },
      { companyId: company.id, category: "Utilities", amount: 22000, date: new Date("2024-03-05"), notes: "Electricity + internet" },
      { companyId: company.id, projectId: project1.id, category: "Travel", amount: 15000, date: new Date("2024-03-12"), notes: "Site visits — Wagholi" },
      { companyId: company.id, projectId: project2.id, category: "Consultancy", amount: 120000, date: new Date("2024-02-20"), notes: "Architect fees — Hillview concept" },
      { companyId: company.id, category: "Office Supplies", amount: 8500, date: new Date("2024-03-18"), notes: "Stationery + printing" },
    ],
  });

  // ── 23. Reallocate project costs → cost-per-sqft → unit productionCost ──
  // This must happen BEFORE selling units so costBasis (productionCost) is realistic.
  await withStockTransaction(async (tx) => {
    await reallocateProjectCosts(tx, project1.id);
  });

  // ── 24. Asset sales + staged payments ───────────────────────
  // Sale 1: Built unit A-101 (2BHK) sold to Rajesh Sharma — partial payment
  const unitA101 = await prisma.builtUnit.findFirstOrThrow({ where: { projectId: project1.id, unitNumber: "A-101" } });
  const sale1 = await sellAsset({
    assetType: "BUILT_UNIT",
    builtUnitId: unitA101.id,
    customerId: customerMap["Rajesh Sharma"],
    companyId: company.id,
    salePrice: 15000000,
    paymentMode: "Home Loan (SBI)",
    notes: "Booking amount + first installment received",
  });
  await recordPayment({ assetSaleId: sale1.id, amount: 1500000, mode: "RTGS", reference: "UTR123456" });
  await recordPayment({ assetSaleId: sale1.id, amount: 3000000, mode: "Cheque", reference: "CHQ-789" });

  // Sale 2: Built unit S-01 (shop) sold to Mohit Enterprises — fully paid
  const unitS01 = await prisma.builtUnit.findFirstOrThrow({ where: { projectId: project1.id, unitNumber: "S-01" } });
  const sale2 = await sellAsset({
    assetType: "BUILT_UNIT",
    builtUnitId: unitS01.id,
    customerId: customerMap["Mohit Enterprises"],
    companyId: company.id,
    salePrice: 8000000,
    paymentMode: "Bank Transfer",
    notes: "Full payment — commercial purchase",
  });
  await recordPayment({ assetSaleId: sale2.id, amount: 8000000, mode: "NEFT", reference: "NEFT-456789" });

  // Sale 3: Land parcel PLOT-1A sold to Verma Traders — partial payment
  const parcel1A = await prisma.landParcel.findFirstOrThrow({ where: { landPurchaseId: land.id, number: "PLOT-1A" } });
  const sale3 = await sellAsset({
    assetType: "LAND",
    landParcelId: parcel1A.id,
    customerId: customerMap["Verma Traders"],
    companyId: company.id,
    salePrice: 52000000,
    paymentMode: "Bank Loan (HDFC)",
    notes: "Commercial land acquisition — 20% booking",
  });
  await recordPayment({ assetSaleId: sale3.id, amount: 10400000, mode: "RTGS", reference: "UTR998877" });

  // ── 25. Low-stock scenario (so the alerts page has data) ─────
  // Drain SAF-HELMET well below its reorder point by issuing most of it.
  await issueMaterialsToProject({
    projectId: project1.id,
    fromLocationId: warehouse.id,
    issuedById: U.supervisor,
    notes: "Site safety gear issue",
    lines: [{ materialId: matMap["SAF-HELMET"], qty: 45 }],
  });

  // ── 25b. Vendor quotes (comparative quote engine) ───────────
  // Three quotes against REQ-2024-0003 (electrical rough-in) so the
  // comparative quote panel has data to show cheapest vs selected.
  // Helper: compute line-level fields the service would normally set.
  const computeQuoteLineFields = (qty: number, unitPrice: number, gstRate = 18) => {
    const taxableValue = qty * unitPrice;
    const gstAmount = (taxableValue * gstRate) / 100;
    const lineSubtotal = taxableValue;
    const lineTotal = taxableValue + gstAmount;
    const unitLandedCost = lineTotal / qty;
    return { taxableValue, gstAmount, lineSubtotal, lineTotal, unitLandedCost, gstRate };
  };
  const req3 = await prisma.materialRequisition.findFirstOrThrow({ where: { reqNumber: "REQ-2024-0003" } });
  const quoteData = [
    { supplier: "Anand Electricals & Wiring", lines: [{ material: "ELC-WIRE25", qty: 3000, unitPrice: 18 }, { material: "ELC-CONDUIT", qty: 800, unitPrice: 32 }], validUntil: new Date("2024-05-25") },
    { supplier: "Viman Electricals", lines: [{ material: "ELC-WIRE25", qty: 3000, unitPrice: 19 }, { material: "ELC-CONDUIT", qty: 800, unitPrice: 30 }], validUntil: new Date("2024-05-22") },
    { supplier: "Maha Lakshmi Hardware", lines: [{ material: "ELC-WIRE25", qty: 3000, unitPrice: 17.5 }, { material: "ELC-CONDUIT", qty: 800, unitPrice: 35 }], validUntil: new Date("2024-05-20") },
  ];
  for (const qd of quoteData) {
    const lineFields = qd.lines.map((l) => computeQuoteLineFields(l.qty, l.unitPrice));
    const subtotal = lineFields.reduce((s, f) => s + f.lineSubtotal, 0);
    const gstTotal = lineFields.reduce((s, f) => s + f.gstAmount, 0);
    const landedTotal = subtotal + gstTotal;
    const vq = await prisma.vendorQuote.create({
      data: {
        requisitionId: req3.id,
        supplierId: supplierMap[qd.supplier],
        fileUrl: `/uploads/quotes/quote-${qd.supplier.replace(/[^a-zA-Z]/g, "")}.pdf`,
        fileName: `Quote-${qd.supplier.replace(/\s+/g, "-")}.pdf`,
        mimeType: "application/pdf",
        landedTotal: new Decimal(landedTotal),
        subtotal: new Decimal(subtotal),
        gstTotal: new Decimal(gstTotal),
        validUntil: qd.validUntil,
        submittedById: U.manager,
        notes: `Quote from ${qd.supplier} for electrical rough-in`,
        status: "PENDING",
        lines: {
          create: qd.lines.map((l, i) => ({
            materialId: matMap[l.material],
            qty: new Decimal(l.qty),
            unitPrice: new Decimal(l.unitPrice),
            gstRate: new Decimal(lineFields[i].gstRate),
            gstAmount: new Decimal(lineFields[i].gstAmount),
            taxableValue: new Decimal(lineFields[i].taxableValue),
            lineSubtotal: new Decimal(lineFields[i].lineSubtotal),
            unitLandedCost: new Decimal(lineFields[i].unitLandedCost),
            lineTotal: new Decimal(lineFields[i].lineTotal),
          })),
        },
      },
    });
    // Select the cheapest quote (Anand Electricals: 3000×18 + 800×32 = 54000+25600 = 79600)
    // Viman: 3000×19 + 800×30 = 57000+24000 = 81000
    // Maha Lakshmi: 3000×17.5 + 800×35 = 52500+28000 = 80500
    // Cheapest = Anand at 79600
    if (qd.supplier === "Anand Electricals & Wiring") {
      await prisma.vendorQuote.update({
        where: { id: vq.id },
        data: { isCheapest: true, status: "SELECTED", selectedById: U.owner, selectedAt: new Date("2024-05-03"), selectionReason: "Lowest landed total with acceptable lead time" },
      });
    }
  }

  // Three quotes against REQ-2024-0005 (paint + primer)
  const req5 = await prisma.materialRequisition.findFirstOrThrow({ where: { reqNumber: "REQ-2024-0005" } });
  const paintQuotes = [
    { supplier: "Asian Paints Depot", lines: [{ material: "PNT-ACPRM", qty: 150, unitPrice: 120 }, { material: "PNT-EMULSION", qty: 100, unitPrice: 180 }], validUntil: new Date("2024-06-10") },
    { supplier: "Berger Paints Wholesale", lines: [{ material: "PNT-ACPRM", qty: 150, unitPrice: 115 }, { material: "PNT-EMULSION", qty: 100, unitPrice: 175 }], validUntil: new Date("2024-06-08") },
    { supplier: "Maha Lakshmi Hardware", lines: [{ material: "PNT-ACPRM", qty: 150, unitPrice: 125 }, { material: "PNT-EMULSION", qty: 100, unitPrice: 185 }], validUntil: new Date("2024-06-05") },
  ];
  for (const qd of paintQuotes) {
    const lineFields = qd.lines.map((l) => computeQuoteLineFields(l.qty, l.unitPrice));
    const subtotal = lineFields.reduce((s, f) => s + f.lineSubtotal, 0);
    const gstTotal = lineFields.reduce((s, f) => s + f.gstAmount, 0);
    const landedTotal = subtotal + gstTotal;
    const vq = await prisma.vendorQuote.create({
      data: {
        requisitionId: req5.id,
        supplierId: supplierMap[qd.supplier],
        fileUrl: `/uploads/quotes/quote-paint-${qd.supplier.replace(/[^a-zA-Z]/g, "")}.pdf`,
        fileName: `Quote-Paint-${qd.supplier.replace(/\s+/g, "-")}.pdf`,
        mimeType: "application/pdf",
        landedTotal: new Decimal(landedTotal),
        subtotal: new Decimal(subtotal),
        gstTotal: new Decimal(gstTotal),
        validUntil: qd.validUntil,
        submittedById: U.manager,
        notes: `Paint quote from ${qd.supplier}`,
        status: "PENDING",
        lines: {
          create: qd.lines.map((l, i) => ({
            materialId: matMap[l.material],
            qty: new Decimal(l.qty),
            unitPrice: new Decimal(l.unitPrice),
            gstRate: new Decimal(lineFields[i].gstRate),
            gstAmount: new Decimal(lineFields[i].gstAmount),
            taxableValue: new Decimal(lineFields[i].taxableValue),
            lineSubtotal: new Decimal(lineFields[i].lineSubtotal),
            unitLandedCost: new Decimal(lineFields[i].unitLandedCost),
            lineTotal: new Decimal(lineFields[i].lineTotal),
          })),
        },
      },
    });
    // Berger is cheapest: 150×115 + 100×175 = 17250+17500 = 34750
    // Asian: 150×120 + 100×180 = 18000+18000 = 36000
    // Maha Lakshmi: 150×125 + 100×185 = 18750+18500 = 37250
    if (qd.supplier === "Berger Paints Wholesale") {
      await prisma.vendorQuote.update({
        where: { id: vq.id },
        data: { isCheapest: true, status: "PENDING" },
      });
    }
  }

  // ── 25c. Additional supplier returns ────────────────────────
  // Return defective electrical conduit to Anand Electricals
  await prisma.supplierReturn.create({
    data: {
      returnNumber: "RET-2024-0002",
      supplierId: supplierMap["Anand Electricals & Wiring"],
      companyId: company.id,
      purchaseOrderId: po4.id,
      locationId: site1.id,
      status: "COMPLETED",
      returnDate: new Date("2024-05-20"),
      creditNoteNo: "CN-2024-0102",
      notes: "50m conduit cracked — manufacturing defect, credit note received",
      lines: {
        create: [{ materialId: matMap["ELC-CONDUIT"], qty: 50, unitCost: 32, reason: "Manufacturing defect — cracked conduit" }],
      },
    },
  });
  // Return excess safety helmets (wrong size)
  await prisma.supplierReturn.create({
    data: {
      returnNumber: "RET-2024-0003",
      supplierId: supplierMap["SafeGuard Safety Equip"],
      companyId: company.id,
      purchaseOrderId: po6.id,
      locationId: warehouse.id,
      status: "SUBMITTED",
      returnDate: new Date("2024-05-30"),
      notes: "15 helmets wrong size — awaiting credit note",
      lines: {
        create: [{ materialId: matMap["SAF-HELMET"], qty: 15, unitCost: 180, reason: "Wrong size — exchanged for correct size" }],
      },
    },
  });

  // ── 26. Audit logs ──────────────────────────────────────────
  await prisma.auditLog.createMany({
    data: [
      { userId: U.manager, action: "CREATE", entityType: "PurchaseOrder", entityId: po1.id, after: { poNumber: po1.poNumber, status: "DRAFT" } as any, timestamp: new Date("2024-03-05") },
      { userId: U.owner, action: "APPROVE", entityType: "PurchaseOrder", entityId: po1.id, after: { status: "APPROVED" } as any, timestamp: new Date("2024-03-06") },
      { userId: U.supervisor, action: "RECEIVE", entityType: "GoodsReceipt", entityId: gr1.id, after: { status: "PASSED" } as any, timestamp: new Date("2024-03-19") },
      { userId: U.supervisor, action: "ISSUE", entityType: "MaterialIssue", entityId: "Tower A foundation pour", after: { project: "Greenfield Residency" } as any, timestamp: new Date("2024-04-01") },
      { userId: U.owner, action: "APPROVE", entityType: "MaterialRequisition", entityId: req1.id, after: { status: "APPROVED" } as any, timestamp: new Date("2024-03-03") },
      { userId: U.sales, action: "CREATE", entityType: "AssetSale", entityId: sale1.id, after: { saleNumber: sale1.saleNumber, assetType: "BUILT_UNIT" } as any, timestamp: new Date("2024-05-15") },
      { userId: U.accountant, action: "RECEIVE", entityType: "AssetSalePayment", entityId: sale1.id, after: { amount: 650000, mode: "RTGS" } as any, timestamp: new Date("2024-05-15") },
      { userId: U.manager, action: "CREATE", entityType: "PurchaseOrder", entityId: po4.id, after: { status: "DRAFT" } as any, timestamp: new Date("2024-05-02") },
      { userId: U.owner, action: "APPROVE", entityType: "PurchaseOrder", entityId: po4.id, after: { status: "APPROVED" } as any, timestamp: new Date("2024-05-03") },
      { userId: U.supervisor, action: "RECEIVE", entityType: "GoodsReceipt", entityId: gr4.id, after: { status: "PASSED" } as any, timestamp: new Date("2024-05-17") },
      { userId: U.manager, action: "CREATE", entityType: "PurchaseOrder", entityId: po5.id, after: { status: "DRAFT" } as any, timestamp: new Date("2024-05-16") },
      { userId: U.owner, action: "APPROVE", entityType: "PurchaseOrder", entityId: po5.id, after: { status: "APPROVED" } as any, timestamp: new Date("2024-05-17") },
      { userId: U.supervisor, action: "RECEIVE", entityType: "GoodsReceipt", entityId: gr5.id, after: { status: "PARTIAL" } as any, timestamp: new Date("2024-05-31") },
      { userId: U.manager, action: "CREATE", entityType: "PurchaseOrder", entityId: po6.id, after: { status: "DRAFT" } as any, timestamp: new Date("2024-05-21") },
      { userId: U.owner, action: "APPROVE", entityType: "PurchaseOrder", entityId: po6.id, after: { status: "APPROVED" } as any, timestamp: new Date("2024-05-22") },
      { userId: U.supervisor, action: "RECEIVE", entityType: "GoodsReceipt", entityId: gr6.id, after: { status: "PASSED" } as any, timestamp: new Date("2024-05-27") },
      { userId: U.manager, action: "CREATE", entityType: "PurchaseOrder", entityId: po7.id, after: { status: "DRAFT" } as any, timestamp: new Date("2024-05-12") },
      { userId: U.owner, action: "APPROVE", entityType: "PurchaseOrder", entityId: po7.id, after: { status: "APPROVED" } as any, timestamp: new Date("2024-05-13") },
      { userId: U.supervisor, action: "RECEIVE", entityType: "GoodsReceipt", entityId: gr7.id, after: { status: "PASSED" } as any, timestamp: new Date("2024-05-24") },
      { userId: U.manager, action: "CREATE", entityType: "PurchaseOrder", entityId: po10.id, after: { status: "DRAFT" } as any, timestamp: new Date("2024-06-05") },
      { userId: U.owner, action: "APPROVE", entityType: "PurchaseOrder", entityId: po10.id, after: { status: "APPROVED" } as any, timestamp: new Date("2024-06-06") },
      { userId: U.supervisor, action: "RECEIVE", entityType: "GoodsReceipt", entityId: gr10.id, after: { status: "PARTIAL" } as any, timestamp: new Date("2024-06-18") },
    ],
  });

  // ── 27b. BOQ + Measurement Book (for Material Reconciliation) ──
  // A BOQ with sections + line items linked to materials, and a few
  // approved MB entries so the reconciliation page has real data.
  const boqSections = [
    { serialNo: "1", description: "Civil Works", type: "SECTION" },
    { serialNo: "1.1", description: "Foundation", type: "SUBSECTION" },
    { serialNo: "1.2", description: "Superstructure", type: "SUBSECTION" },
    { serialNo: "1.3", description: "Brickwork & Masonry", type: "SUBSECTION" },
    { serialNo: "1.4", description: "Plastering & Finishing", type: "SUBSECTION" },
    { serialNo: "2", description: "Electrical Works", type: "SECTION" },
    { serialNo: "3", description: "Plumbing Works", type: "SECTION" },
  ];
  const boqSectionMap: Record<string, string> = {};
  for (const s of boqSections) {
    const row = await ensure(
      "boqItem",
      { projectId: project1.id, serialNo: s.serialNo },
      { projectId: project1.id, serialNo: s.serialNo, description: s.description, type: s.type, sortOrder: parseInt(s.serialNo) || 0 },
    );
    boqSectionMap[s.serialNo] = row.id;
  }

  // BOQ line items — linked to materials so reconciliation can join
  const boqLines = [
    // Foundation
    { serialNo: "1.1.1", description: "PCC 1:4:8 for foundation", parentId: "1.1", materialCode: "CEM-OPC53", unit: "BAG", estimatedQty: 850, rate: 380, sortOrder: 1 },
    { serialNo: "1.1.2", description: "TMT steel reinforcement for footing", parentId: "1.1", materialCode: "STL-TMT12", unit: "KG", estimatedQty: 15000, rate: 78, sortOrder: 2 },
    { serialNo: "1.1.3", description: "20mm aggregate for PCC", parentId: "1.1", materialCode: "AGG-20MM", unit: "CFT", estimatedQty: 4500, rate: 55, sortOrder: 3 },
    { serialNo: "1.1.4", description: "River sand for PCC", parentId: "1.1", materialCode: "SND-RIVER", unit: "CFT", estimatedQty: 3000, rate: 45, sortOrder: 4 },
    // Superstructure (slab)
    { serialNo: "1.2.1", description: "M25 grade RCC slab", parentId: "1.2", materialCode: "CEM-OPC53", unit: "BAG", estimatedQty: 4600, rate: 380, sortOrder: 1 },
    { serialNo: "1.2.2", description: "TMT 16mm for slab reinforcement", parentId: "1.2", materialCode: "STL-TMT16", unit: "KG", estimatedQty: 12000, rate: 80, sortOrder: 2 },
    { serialNo: "1.2.3", description: "Plywood formwork for slab", parentId: "1.2", materialCode: "FRM-PLY18", unit: "NOS", estimatedQty: 60, rate: 1450, sortOrder: 3 },
    // Brickwork
    { serialNo: "1.3.1", description: "Brickwork in 230mm wall", parentId: "1.3", materialCode: "BRK-RED", unit: "NOS", estimatedQty: 25000, rate: 7, sortOrder: 1 },
    { serialNo: "1.3.2", description: "Cement mortar for brickwork", parentId: "1.3", materialCode: "CEM-PPC", unit: "BAG", estimatedQty: 1250, rate: 340, sortOrder: 2 },
    // Plastering
    { serialNo: "1.4.1", description: "Internal plaster 12mm", parentId: "1.4", materialCode: "CEM-OPC53", unit: "BAG", estimatedQty: 1750, rate: 380, sortOrder: 1 },
    { serialNo: "1.4.2", description: "Plastering sand", parentId: "1.4", materialCode: "SND-RIVER", unit: "CFT", estimatedQty: 6000, rate: 45, sortOrder: 2 },
    // Electrical
    { serialNo: "2.1", description: "Electrical wiring 2.5sqmm", parentId: "2", materialCode: "ELC-WIRE25", unit: "MTR", estimatedQty: 22500, rate: 18, sortOrder: 1 },
    { serialNo: "2.2", description: "PVC conduit 20mm", parentId: "2", materialCode: "ELC-CONDUIT", unit: "MTR", estimatedQty: 15000, rate: 32, sortOrder: 2 },
    // Plumbing
    { serialNo: "3.1", description: "PVC pipe 4 inch drainage", parentId: "3", materialCode: "PLB-PIPE4", unit: "MTR", estimatedQty: 4000, rate: 220, sortOrder: 1 },
  ];

  const boqLineMap: Record<string, string> = {};
  for (const l of boqLines) {
    const materialId = matMap[l.materialCode];
    const estimatedQty = l.estimatedQty;
    const rate = l.rate;
    const estimatedAmount = estimatedQty * rate;
    const row = await ensure(
      "boqItem",
      { projectId: project1.id, serialNo: l.serialNo },
      {
        projectId: project1.id,
        phaseId: phase1A.id,
        parentId: boqSectionMap[l.parentId],
        serialNo: l.serialNo,
        description: l.description,
        type: "LINE_ITEM",
        materialId,
        unit: l.unit,
        estimatedQty,
        rate,
        estimatedAmount,
        sortOrder: l.sortOrder,
      },
    );
    boqLineMap[l.serialNo] = row.id;
  }

  // Measurement Book entries — some approved (consumed), some pending
  // Foundation: slightly over-consumption on cement (wastage), steel on track
  const mbEntries = [
    { boqSerial: "1.1.1", mbNumber: "MB-240301-0001", measuredQty: 420, cumulativeQty: 420, description: "PCC for footing 1-4", locationRef: "Tower A, Foundation", measureDate: new Date("2024-03-01"), status: "APPROVED" },
    { boqSerial: "1.1.1", mbNumber: "MB-240315-0002", measuredQty: 460, cumulativeQty: 880, description: "PCC for footing 5-8", locationRef: "Tower A, Foundation", measureDate: new Date("2024-03-15"), status: "APPROVED" },
    // 880 consumed vs 850 required → ~3.5% wastage (within tolerance)
    { boqSerial: "1.1.2", mbNumber: "MB-240302-0001", measuredQty: 7800, cumulativeQty: 7800, description: "Steel for footing 1-4", locationRef: "Tower A, Foundation", measureDate: new Date("2024-03-02"), status: "APPROVED" },
    { boqSerial: "1.1.2", mbNumber: "MB-240316-0002", measuredQty: 7600, cumulativeQty: 15400, description: "Steel for footing 5-8", locationRef: "Tower A, Foundation", measureDate: new Date("2024-03-16"), status: "APPROVED" },
    // 15400 consumed vs 15000 required → ~2.7% wastage (OK)
    { boqSerial: "1.2.1", mbNumber: "MB-240420-0001", measuredQty: 2300, cumulativeQty: 2300, description: "Slab cast floor 1", locationRef: "Tower A, Floor 1", measureDate: new Date("2024-04-20"), status: "APPROVED" },
    { boqSerial: "1.2.1", mbNumber: "MB-240505-0002", measuredQty: 2500, cumulativeQty: 4800, description: "Slab cast floor 2", locationRef: "Tower A, Floor 2", measureDate: new Date("2024-05-05"), status: "APPROVED" },
    // 4800 consumed vs 4600 required → ~4.3% wastage (within 5% tolerance)
    { boqSerial: "1.3.1", mbNumber: "MB-240410-0001", measuredQty: 12500, cumulativeQty: 12500, description: "Brickwork ground floor", locationRef: "Tower A, GF", measureDate: new Date("2024-04-10"), status: "APPROVED" },
    { boqSerial: "1.3.1", mbNumber: "MB-240425-0002", measuredQty: 14000, cumulativeQty: 26500, description: "Brickwork first floor", locationRef: "Tower A, FF", measureDate: new Date("2024-04-25"), status: "APPROVED" },
    // 26500 consumed vs 25000 required → 6% wastage (OVER tolerance → WARNING)
    { boqSerial: "1.4.1", mbNumber: "MB-240515-0001", measuredQty: 950, cumulativeQty: 950, description: "Internal plaster GF", locationRef: "Tower A, GF", measureDate: new Date("2024-05-15"), status: "APPROVED" },
    // 950 consumed vs 1750 required → under-consumed (still in progress)
    { boqSerial: "2.1", mbNumber: "MB-240520-0001", measuredQty: 14000, cumulativeQty: 14000, description: "Wiring floor 1", locationRef: "Tower A, Floor 1", measureDate: new Date("2024-05-20"), status: "VERIFIED" },
    // VERIFIED but not APPROVED → won't show in reconciliation (only APPROVED counts)
  ];

  for (const mb of mbEntries) {
    await ensure(
      "measurementBookEntry",
      { projectId: project1.id, mbNumber: mb.mbNumber },
      {
        projectId: project1.id,
        phaseId: phase1A.id,
        boqItemId: boqLineMap[mb.boqSerial],
        mbNumber: mb.mbNumber,
        measuredQty: mb.measuredQty,
        cumulativeQty: mb.cumulativeQty,
        description: mb.description,
        locationRef: mb.locationRef,
        measureDate: mb.measureDate,
        status: mb.status,
        measuredById: U.supervisor,
        verifiedById: mb.status === "VERIFIED" || mb.status === "APPROVED" ? U.manager : null,
        approvedById: mb.status === "APPROVED" ? U.manager : null,
        approvedAt: mb.status === "APPROVED" ? mb.measureDate : null,
        verifiedAt: mb.status === "VERIFIED" || mb.status === "APPROVED" ? mb.measureDate : null,
      },
    );
  }

  // ── 28. Standard Consumption Benchmarks ─────────────────────
  // Typical Indian construction consumption rates per work type.
  // These power the DPR variance analysis / auto-scrap detection.
  const benchmarks = [
    // Foundation
    { workType: "Foundation", materialId: matMap["CEM-OPC53"], standardQty: 8.5, baseQty: 100, unitOfMeasure: "per 100 sqft", notes: "PCC + RCC foundation, 50kg bags" },
    { workType: "Foundation", materialId: matMap["STL-TMT12"], standardQty: 1500, baseQty: 100, unitOfMeasure: "per 100 sqft", notes: "Reinforcement steel for footing" },
    { workType: "Foundation", materialId: matMap["AGG-20MM"], standardQty: 45, baseQty: 100, unitOfMeasure: "per 100 sqft", notes: "Coarse aggregate for PCC" },
    { workType: "Foundation", materialId: matMap["SND-RIVER"], standardQty: 30, baseQty: 100, unitOfMeasure: "per 100 sqft", notes: "Fine aggregate for PCC" },

    // Slab Casting (RCC roof slab)
    { workType: "Slab Casting", materialId: matMap["CEM-OPC53"], standardQty: 9.2, baseQty: 100, unitOfMeasure: "per 100 sqft", notes: "M25 grade slab, 50kg bags" },
    { workType: "Slab Casting", materialId: matMap["STL-TMT16"], standardQty: 1200, baseQty: 100, unitOfMeasure: "per 100 sqft", notes: "Main bar + distribution steel" },
    { workType: "Slab Casting", materialId: matMap["STL-TMT12"], standardQty: 450, baseQty: 100, unitOfMeasure: "per 100 sqft", notes: "Secondary reinforcement" },
    { workType: "Slab Casting", materialId: matMap["AGG-20MM"], standardQty: 55, baseQty: 100, unitOfMeasure: "per 100 sqft", notes: "Coarse aggregate for RCC" },
    { workType: "Slab Casting", materialId: matMap["SND-RIVER"], standardQty: 35, baseQty: 100, unitOfMeasure: "per 100 sqft", notes: "Fine aggregate for RCC" },
    { workType: "Slab Casting", materialId: matMap["FRM-PLY18"], standardQty: 1.2, baseQty: 100, unitOfMeasure: "per 100 sqft", notes: "Formwork + shuttering ply (reusable 5×)" },

    // Brickwork
    { workType: "Brickwork", materialId: matMap["BRK-RED"], standardQty: 500, baseQty: 100, unitOfMeasure: "per 100 sqft", notes: "230mm thick wall, class A bricks" },
    { workType: "Brickwork", materialId: matMap["CEM-OPC53"], standardQty: 2.5, baseQty: 100, unitOfMeasure: "per 100 sqft", notes: "Cement mortar 1:6" },
    { workType: "Brickwork", materialId: matMap["SND-RIVER"], standardQty: 18, baseQty: 100, unitOfMeasure: "per 100 sqft", notes: "Sand for mortar" },

    // Blockwork (AAC)
    { workType: "Blockwork", materialId: matMap["BLK-AAC"], standardQty: 67, baseQty: 100, unitOfMeasure: "per 100 sqft", notes: "200mm thick AAC block wall" },
    { workType: "Blockwork", materialId: matMap["CEM-OPC53"], standardQty: 1.8, baseQty: 100, unitOfMeasure: "per 100 sqft", notes: "Thin-bed mortar adhesive" },
    { workType: "Blockwork", materialId: matMap["SND-RIVER"], standardQty: 8, baseQty: 100, unitOfMeasure: "per 100 sqft", notes: "Jointing sand" },

    // Plastering
    { workType: "Plastering", materialId: matMap["CEM-OPC53"], standardQty: 3.5, baseQty: 100, unitOfMeasure: "per 100 sqft", notes: "12mm thick internal plaster, 1:4" },
    { workType: "Plastering", materialId: matMap["SND-RIVER"], standardQty: 12, baseQty: 100, unitOfMeasure: "per 100 sqft", notes: "Plastering sand" },
    { workType: "Plastering", materialId: matMap["CEM-PPC"], standardQty: 3.2, baseQty: 100, unitOfMeasure: "per 100 sqft", notes: "External waterproof plaster" },

    // Flooring
    { workType: "Flooring", materialId: matMap["CEM-OPC53"], standardQty: 4.0, baseQty: 100, unitOfMeasure: "per 100 sqft", notes: "Vitrified tile fixing + bedding" },
    { workType: "Flooring", materialId: matMap["SND-RIVER"], standardQty: 10, baseQty: 100, unitOfMeasure: "per 100 sqft", notes: "Bedding sand" },

    // Painting
    { workType: "Painting", materialId: matMap["PNT-ACPRM"], standardQty: 2.5, baseQty: 100, unitOfMeasure: "per 100 sqft", notes: "Primer coat" },
    { workType: "Painting", materialId: matMap["PNT-EMULSION"], standardQty: 6.0, baseQty: 100, unitOfMeasure: "per 100 sqft", notes: "2 coats acrylic emulsion" },

    // Electrical
    { workType: "Electrical", materialId: matMap["ELC-WIRE25"], standardQty: 45, baseQty: 100, unitOfMeasure: "per 100 sqft", notes: "Points + loops" },
    { workType: "Electrical", materialId: matMap["ELC-CONDUIT"], standardQty: 30, baseQty: 100, unitOfMeasure: "per 100 sqft", notes: "Concealed conduit" },

    // Plumbing
    { workType: "Plumbing", materialId: matMap["PLB-PIPE4"], standardQty: 8, baseQty: 100, unitOfMeasure: "per 100 sqft", notes: "SWR drainage + water supply" },
  ];
  for (const b of benchmarks) {
    await ensure(
      "standardConsumption",
      { companyId: company.id, workType: b.workType, materialId: b.materialId },
      { ...b, companyId: company.id },
    );
  }

  // ── 29. MULTI-COMPANY GROUP ─────────────────────────────────
  // A parent group "Nirman Group" with 3 child companies to exercise
  // the company hierarchy (parentCompanyId), inter-company transfers,
  // and the company switcher with multiple entities.
  console.log("Seeding multi-company group…");

  const group = await ensure<{ id: string; name: string }>(
    "company",
    { deletedAt: null, name: "Nirman Group" },
    {
      name: "Nirman Group",
      currency: "INR",
      businessType: "Holding Company",
      gstin: "27AABCN1234F1Z5",
      address: "BKC, Mumbai 400051",
      phone: "+91 22 6666 7777",
      email: "accounts@nirmangroup.in",
    },
  );

  const childCompanies = [
    {
      name: "Nirman Realty",
      businessType: "Real Estate Development",
      gstin: "27AABCN2001F1Z1",
      address: "Baner, Pune 411045",
      phone: "+91 98220 10001",
      email: "ops@nirmanrealty.in",
      currency: "INR",
    },
    {
      name: "Nirman Infrastructure",
      businessType: "Infrastructure & Roads",
      gstin: "27AABCN2002F1Z2",
      address: "Talegaon, Pune 410507",
      phone: "+91 98220 20002",
      email: "ops@nirmaninfra.in",
      currency: "INR",
    },
    {
      name: "Nirman Interiors",
      businessType: "Interior Fit-Out",
      gstin: "27AABCN2003F1Z3",
      address: "Koregaon Park, Pune 411001",
      phone: "+91 98220 30003",
      email: "studio@nirmaninteriors.in",
      currency: "INR",
    },
  ];

  const childCompanyMap: Record<string, string> = {};
  for (const cc of childCompanies) {
    const row = await ensure<{ id: string; name: string }>(
      "company",
      { deletedAt: null, name: cc.name },
      { ...cc, parentCompanyId: group.id },
    );
    childCompanyMap[cc.name] = row.id;
  }

  // Link the owner + admin to all child companies (they're group-level execs)
  for (const email of ["amit@nirman.in", "anita@nirman.in"]) {
    const uid = userMap[email];
    if (!uid) continue;
    for (const ccName of Object.keys(childCompanyMap)) {
      await ensure("userCompany", { userId: uid, companyId: childCompanyMap[ccName] }, {
        userId: uid,
        companyId: childCompanyMap[ccName],
        role: email === "amit@nirman.in" ? "OWNER" : "ADMIN",
      });
    }
  }
  // Also link the group itself
  for (const email of ["amit@nirman.in", "anita@nirman.in"]) {
    const uid = userMap[email];
    if (!uid) continue;
    await ensure("userCompany", { userId: uid, companyId: group.id }, {
      userId: uid,
      companyId: group.id,
      role: email === "amit@nirman.in" ? "OWNER" : "ADMIN",
    });
  }

  // ── 30. Nirman Realty — projects, units, land ───────────────
  const realtyId = childCompanyMap["Nirman Realty"];

  // Employees for Nirman Realty
  const realtyEmps = [
    { name: "Vikram Patil", trade: "Masonry", phone: "+91 98220 31001", dailyRate: 900 },
    { name: "Sandeep Kale", trade: "Electrical", phone: "+91 98220 31002", dailyRate: 1000 },
    { name: "Raj Pawar", trade: "Plumbing", phone: "+91 98220 31003", dailyRate: 850 },
  ];
  for (const e of realtyEmps) {
    await ensure("employee", { name: e.name, companyId: realtyId }, { ...e, companyId: realtyId });
  }

  // Projects for Nirman Realty
  const realtyProj1 = await ensure(
    "project",
    { companyId: realtyId, name: "Skyline Heights" },
    {
      companyId: realtyId,
      name: "Skyline Heights",
      type: "RESIDENTIAL",
      status: "ACTIVE",
      address: "Wagholi, Pune 412207",
      totalBudget: 120000000,
      startDate: new Date("2024-06-01"),
      description: "G+12 premium residential tower with 3BHK + 4BHK units",
    },
  );
  const realtyProj2 = await ensure(
    "project",
    { companyId: realtyId, name: "Riverside Villas" },
    {
      companyId: realtyId,
      name: "Riverside Villas",
      type: "RESIDENTIAL",
      status: "ACTIVE",
      address: "Baner, Pune 411045",
      totalBudget: 95000000,
      startDate: new Date("2024-03-15"),
      description: "12 independent luxury villas with private gardens",
    },
  );

  // Phases for Skyline Heights
  const skylinePhase1 = await ensure(
    "projectPhase",
    { projectId: realtyProj1.id, name: "Tower 1" },
    { projectId: realtyProj1.id, name: "Tower 1", status: "ACTIVE", budget: 70000000, startDate: new Date("2024-06-15"), sortOrder: 1 },
  );
  const skylinePhase2 = await ensure(
    "projectPhase",
    { projectId: realtyProj1.id, name: "Tower 2" },
    { projectId: realtyProj1.id, name: "Tower 2", status: "PLANNED", budget: 50000000, sortOrder: 2 },
  );
  // Phase for Riverside Villas
  const villaPhase1 = await ensure(
    "projectPhase",
    { projectId: realtyProj2.id, name: "Villa Block A" },
    { projectId: realtyProj2.id, name: "Villa Block A", status: "ACTIVE", budget: 50000000, startDate: new Date("2024-04-01"), sortOrder: 1 },
  );

  // Stock locations for Nirman Realty
  const realtyWarehouse = await ensure(
    "stockLocation",
    { companyId: realtyId, type: "COMPANY_WAREHOUSE", name: "Realty Central Store" },
    { companyId: realtyId, type: "COMPANY_WAREHOUSE", name: "Realty Central Store", address: "Baner, Pune 411045" },
  );
  const skylineSite = await ensure(
    "stockLocation",
    { companyId: realtyId, projectId: realtyProj1.id, name: "Skyline Site Yard" },
    { companyId: realtyId, type: "PROJECT_SITE", projectId: realtyProj1.id, name: "Skyline Site Yard" },
  );
  const villaSite = await ensure(
    "stockLocation",
    { companyId: realtyId, projectId: realtyProj2.id, name: "Riverside Site" },
    { companyId: realtyId, type: "PROJECT_SITE", projectId: realtyProj2.id, name: "Riverside Site" },
  );

  // Built units for Skyline Heights (Tower 1: 8 floors × 2 units = 16 — created as AVAILABLE/UC/PLANNED, sold via sellAsset)
  const skylineUnits: { unitNumber: string; floor: number; wing: string; area: number; type: "BHK_3" | "BHK_4"; status: "PLANNED" | "UNDER_CONSTRUCTION" | "AVAILABLE"; askingPrice?: number; currentValuation: number }[] = [];
  for (let f = 1; f <= 8; f++) {
    skylineUnits.push({ unitNumber: `T1-${f}01`, floor: f, wing: "1", area: 1450, type: "BHK_3", status: f <= 3 ? "AVAILABLE" : f <= 5 ? "UNDER_CONSTRUCTION" : "PLANNED", askingPrice: 22000000, currentValuation: 22000000 });
    skylineUnits.push({ unitNumber: `T1-${f}02`, floor: f, wing: "1", area: 1850, type: "BHK_4", status: f <= 4 ? "AVAILABLE" : f <= 6 ? "UNDER_CONSTRUCTION" : "PLANNED", askingPrice: 32000000, currentValuation: 32000000 });
  }
  await prisma.builtUnit.createMany({
    data: skylineUnits.map((u) => ({
      projectId: realtyProj1.id,
      phaseId: skylinePhase1.id,
      unitType: u.type,
      unitNumber: u.unitNumber,
      floor: u.floor,
      wing: u.wing,
      area: u.area,
      areaUnit: "SQFT",
      status: u.status,
      productionCost: 0,
      askingPrice: u.askingPrice ?? null,
      currentValuation: u.currentValuation,
    })),
  });

  // Built units for Riverside Villas (12 villas — created as AVAILABLE, sold via sellAsset below)
  const villaUnits: { unitNumber: string; floor: number; area: number; type: "BHK_3"; status: "PLANNED" | "UNDER_CONSTRUCTION" | "AVAILABLE"; askingPrice?: number; currentValuation: number }[] = [];
  for (let i = 1; i <= 12; i++) {
    const status = i <= 7 ? "AVAILABLE" : i <= 10 ? "UNDER_CONSTRUCTION" : "PLANNED";
    villaUnits.push({ unitNumber: `V-${String(i).padStart(2, "0")}`, floor: 0, area: 2400, type: "BHK_3", status: status as "AVAILABLE" | "UNDER_CONSTRUCTION" | "PLANNED", askingPrice: 45000000, currentValuation: 45000000 });
  }
  await prisma.builtUnit.createMany({
    data: villaUnits.map((u) => ({
      projectId: realtyProj2.id,
      phaseId: villaPhase1.id,
      unitType: u.type,
      unitNumber: u.unitNumber,
      floor: u.floor,
      area: u.area,
      areaUnit: "SQFT",
      status: u.status,
      productionCost: 0,
      askingPrice: u.askingPrice ?? null,
      currentValuation: u.currentValuation,
    })),
  });

  // Land for Nirman Realty
  const realtyLand = await prisma.landPurchase.create({
    data: {
      companyId: realtyId,
      projectId: realtyProj1.id,
      sellerName: "Wagholi Land Holdings Pvt Ltd",
      sellerContact: "+91 98220 41000",
      totalArea: 50000,
      areaUnit: "SQFT",
      totalCost: 150000000,
      registryNo: "REG/PUN/2024/07890",
      location: "Wagholi, Pune",
      purchaseDate: new Date("2024-01-20"),
      parcels: {
        create: {
          number: "RLP-1",
          area: 50000,
          areaUnit: "SQFT",
          status: "AVAILABLE",
          acquisitionCost: 150000000,
          askingPrice: 200000000,
          currentValuation: 180000000,
          projectId: realtyProj1.id,
        },
      },
    },
  });

  // Customers for Nirman Realty
  const realtyCustomers = [
    { name: "Amitabh Bose", phone: "+91 98300 51001", email: "abose@gmail.com", address: "Worli, Mumbai" },
    { name: "Kavita Reddy", phone: "+91 98490 52002", email: "kavita.reddy@gmail.com", address: "Jubilee Hills, Hyderabad" },
    { name: "Pinnacle Investments", phone: "+91 98220 53003", email: "invest@pinnacle.in", gstin: "27AAFCP5678N1Z3", address: "BKC, Mumbai" },
  ];
  const realtyCustMap: Record<string, string> = {};
  for (const c of realtyCustomers) {
    const row = await ensure("customer", { name: c.name, companyId: realtyId }, { ...c, companyId: realtyId });
    realtyCustMap[c.name] = row.id;
  }

  // Suppliers for Nirman Realty
  const realtySuppliers = [
    { name: "Birla Cement Pune", gstin: "27AABCB1234F1Z1", phone: "+91 98220 61001", email: "b2b@birlacement.in", address: "Chakan, Pune", leadTimeDays: 3 },
    { name: "Shree Steel Mart", gstin: "27AABCS5678K1Z2", phone: "+91 98220 62002", email: "sales@shreesteel.in", address: "Bhosari, Pune", leadTimeDays: 5 },
    { name: "Premium Paints & Coatings", gstin: "27AABCP9012P1Z3", phone: "+91 98220 63003", email: "b2b@premiumcoatings.in", address: "Pimpri, Pune", leadTimeDays: 4 },
  ];
  const realtySuppMap: Record<string, string> = {};
  for (const s of realtySuppliers) {
    const row = await ensure("supplier", { name: s.name, companyId: realtyId }, { ...s, companyId: realtyId } as any);
    realtySuppMap[s.name] = row.id;
  }

  // Opening stock for Nirman Realty warehouse
  const realtyOpeningStock = [
    { code: "CEM-OPC53", loc: realtyWarehouse.id, qty: 500, cost: 385 },
    { code: "STL-TMT12", loc: realtyWarehouse.id, qty: 3000, cost: 79 },
    { code: "STL-TMT16", loc: realtyWarehouse.id, qty: 2000, cost: 81 },
    { code: "BRK-RED", loc: skylineSite.id, qty: 20000, cost: 7.5 },
    { code: "SND-RIVER", loc: realtyWarehouse.id, qty: 800, cost: 46 },
  ];
  for (const s of realtyOpeningStock) {
    const mid = matMap[s.code];
    if (!mid) continue;
    await withStockTransaction(async (tx) => {
      await recordMovement(tx, {
        materialId: mid,
        movementType: "PURCHASE_RECEIPT",
        toLocationId: s.loc,
        qty: new Decimal(s.qty),
        unitCost: new Decimal(s.cost),
        reason: "Opening stock — Nirman Realty",
        refType: "SEED",
      });
    });
  }

  // Equipment for Nirman Realty
  const realtyEquipment = [
    { assetTag: "RTL-JCB-01", name: "JCB 4DX Excavator", model: "4DX", serialNumber: "JCB4DX2024001", category: "Heavy Machinery", acquisitionCost: 4200000, currentValue: 3500000, purchaseDate: new Date("2024-01-15") },
    { assetTag: "RTL-TWR-01", name: "Tower Crane 6T", model: "TC-6T", serialNumber: "TC6T001", category: "Heavy Machinery", acquisitionCost: 8500000, currentValue: 7800000, purchaseDate: new Date("2024-02-01") },
    { assetTag: "RTL-MIX-01", name: "Batching Plant 30m³", model: "BP-30", serialNumber: "BP30001", category: "Heavy Machinery", acquisitionCost: 2500000, currentValue: 2200000, purchaseDate: new Date("2024-01-20") },
  ];
  for (const e of realtyEquipment) {
    await ensure("equipment", { assetTag: e.assetTag }, { ...e, companyId: realtyId });
  }

  // Project costs for Nirman Realty
  await prisma.projectCost.createMany({
    data: [
      { projectId: realtyProj1.id, costType: "LABOUR", amount: 3500000, date: new Date("2024-07-15"), vendor: "Skyline Labour Corp", notes: "Foundation + 3 floors labour" },
      { projectId: realtyProj1.id, costType: "OVERHEAD", amount: 1200000, date: new Date("2024-07-01"), notes: "Site office + security Q3" },
      { projectId: realtyProj1.id, costType: "PERMIT", amount: 850000, date: new Date("2024-05-20"), vendor: "PMC", notes: "Building permission" },
      { projectId: realtyProj2.id, costType: "LABOUR", amount: 2800000, date: new Date("2024-05-10"), vendor: "Villa Construction Co", notes: "Villa Block A structure" },
      { projectId: realtyProj2.id, costType: "CONTRACTOR", amount: 1500000, date: new Date("2024-06-01"), notes: "Plumbing + electrical for villas 1-7" },
    ],
  });

  // Asset sales for Nirman Realty (2 sold units in Skyline + 3 sold villas)
  const skylineT1_101 = await prisma.builtUnit.findFirstOrThrow({ where: { projectId: realtyProj1.id, unitNumber: "T1-101" } });
  const skylineT1_201 = await prisma.builtUnit.findFirstOrThrow({ where: { projectId: realtyProj1.id, unitNumber: "T1-201" } });
  const villa01 = await prisma.builtUnit.findFirstOrThrow({ where: { projectId: realtyProj2.id, unitNumber: "V-01" } });
  const villa02 = await prisma.builtUnit.findFirstOrThrow({ where: { projectId: realtyProj2.id, unitNumber: "V-02" } });
  const villa03 = await prisma.builtUnit.findFirstOrThrow({ where: { projectId: realtyProj2.id, unitNumber: "V-03" } });

  const realtySale1 = await sellAsset({
    assetType: "BUILT_UNIT",
    builtUnitId: skylineT1_101.id,
    customerId: realtyCustMap["Amitabh Bose"],
    companyId: realtyId,
    salePrice: 22000000,
    paymentMode: "Home Loan (ICICI)",
    notes: "Booking + 2 installments",
  });
  await recordPayment({ assetSaleId: realtySale1.id, amount: 2200000, mode: "RTGS", reference: "UTR-RTL-001" });
  await recordPayment({ assetSaleId: realtySale1.id, amount: 5000000, mode: "Cheque", reference: "CHQ-RTL-001" });

  const realtySale2 = await sellAsset({
    assetType: "BUILT_UNIT",
    builtUnitId: skylineT1_201.id,
    customerId: realtyCustMap["Kavita Reddy"],
    companyId: realtyId,
    salePrice: 22000000,
    paymentMode: "Bank Transfer",
    notes: "Full payment",
  });
  await recordPayment({ assetSaleId: realtySale2.id, amount: 22000000, mode: "NEFT", reference: "NEFT-RTL-002" });

  const villaSale1 = await sellAsset({
    assetType: "BUILT_UNIT",
    builtUnitId: villa01.id,
    customerId: realtyCustMap["Pinnacle Investments"],
    companyId: realtyId,
    salePrice: 45000000,
    paymentMode: "Bank Transfer",
    notes: "Investment purchase — full payment",
  });
  await recordPayment({ assetSaleId: villaSale1.id, amount: 45000000, mode: "RTGS", reference: "UTR-VILLA-01" });

  const villaSale2 = await sellAsset({
    assetType: "BUILT_UNIT",
    builtUnitId: villa02.id,
    customerId: realtyCustMap["Amitabh Bose"],
    companyId: realtyId,
    salePrice: 45000000,
    paymentMode: "Home Loan (HDFC)",
    notes: "Booking amount received",
  });
  await recordPayment({ assetSaleId: villaSale2.id, amount: 9000000, mode: "RTGS", reference: "UTR-VILLA-02" });

  const villaSale3 = await sellAsset({
    assetType: "BUILT_UNIT",
    builtUnitId: villa03.id,
    customerId: realtyCustMap["Kavita Reddy"],
    companyId: realtyId,
    salePrice: 45000000,
    paymentMode: "Bank Transfer",
    notes: "Partial payment — balance in 30 days",
  });
  await recordPayment({ assetSaleId: villaSale3.id, amount: 15000000, mode: "Cheque", reference: "CHQ-VILLA-03" });

  // Reallocate costs for Nirman Realty projects
  await withStockTransaction(async (tx) => {
    await reallocateProjectCosts(tx, realtyProj1.id);
  });
  await withStockTransaction(async (tx) => {
    await reallocateProjectCosts(tx, realtyProj2.id);
  });

  // ── 31. Nirman Infrastructure — projects, units ─────────────
  const infraId = childCompanyMap["Nirman Infrastructure"];

  // Employees for Nirman Infrastructure
  const infraEmps = [
    { name: "Ganesh More", trade: "Road Work", phone: "+91 98220 41001", dailyRate: 950 },
    { name: "Prakash Jadhav", trade: "Heavy Equipment", phone: "+91 98220 41002", dailyRate: 1300 },
    { name: "Nilesh Shinde", trade: "Surveying", phone: "+91 98220 41003", dailyRate: 1100 },
  ];
  for (const e of infraEmps) {
    await ensure("employee", { name: e.name, companyId: infraId }, { ...e, companyId: infraId });
  }

  // Projects for Nirman Infrastructure
  const infraProj1 = await ensure(
    "project",
    { companyId: infraId, name: "Alpha Road Highway Extension" },
    {
      companyId: infraId,
      name: "Alpha Road Highway Extension",
      type: "COMMERCIAL",
      status: "ACTIVE",
      address: "Talegaon to Chakan, Pune 410507",
      totalBudget: 350000000,
      startDate: new Date("2024-04-01"),
      description: "12km highway extension with 4 lanes + 2 service roads",
    },
  );
  const infraProj2 = await ensure(
    "project",
    { companyId: infraId, name: "Mula Canal Bridge" },
    {
      companyId: infraId,
      name: "Mula Canal Bridge",
      type: "COMMERCIAL",
      status: "ACTIVE",
      address: "Aundh, Pune 411007",
      totalBudget: 65000000,
      startDate: new Date("2024-05-15"),
      description: "3-span RCC bridge over Mula canal",
    },
  );

  // Phases for Alpha Road
  const alphaPhase1 = await ensure(
    "projectPhase",
    { projectId: infraProj1.id, name: "Section A (0-4km)" },
    { projectId: infraProj1.id, name: "Section A (0-4km)", status: "ACTIVE", budget: 120000000, startDate: new Date("2024-04-15"), sortOrder: 1 },
  );
  const alphaPhase2 = await ensure(
    "projectPhase",
    { projectId: infraProj1.id, name: "Section B (4-8km)" },
    { projectId: infraProj1.id, name: "Section B (4-8km)", status: "ACTIVE", budget: 130000000, startDate: new Date("2024-06-01"), sortOrder: 2 },
  );
  const alphaPhase3 = await ensure(
    "projectPhase",
    { projectId: infraProj1.id, name: "Section C (8-12km)" },
    { projectId: infraProj1.id, name: "Section C (8-12km)", status: "PLANNED", budget: 100000000, sortOrder: 3 },
  );

  // Stock locations for Nirman Infrastructure
  const infraWarehouse = await ensure(
    "stockLocation",
    { companyId: infraId, type: "COMPANY_WAREHOUSE", name: "Infra Central Depot" },
    { companyId: infraId, type: "COMPANY_WAREHOUSE", name: "Infra Central Depot", address: "Talegaon, Pune 410507" },
  );
  const alphaSite = await ensure(
    "stockLocation",
    { companyId: infraId, projectId: infraProj1.id, name: "Alpha Road Site A" },
    { companyId: infraId, type: "PROJECT_SITE", projectId: infraProj1.id, name: "Alpha Road Site A" },
  );
  const bridgeSite = await ensure(
    "stockLocation",
    { companyId: infraId, projectId: infraProj2.id, name: "Bridge Construction Site" },
    { companyId: infraId, type: "PROJECT_SITE", projectId: infraProj2.id, name: "Bridge Construction Site" },
  );

  // Built "units" for Alpha Road — toll booths + commercial shops at the highway plaza
  const alphaUnits: { unitNumber: string; floor: number; area: number; type: "SHOP"; status: "PLANNED" | "UNDER_CONSTRUCTION" | "AVAILABLE"; currentValuation: number }[] = [];
  for (let i = 1; i <= 6; i++) {
    alphaUnits.push({ unitNumber: `PLAZA-S${i}`, floor: 0, area: 500, type: "SHOP", status: i <= 2 ? "UNDER_CONSTRUCTION" : "AVAILABLE", currentValuation: 5000000 });
  }
  await prisma.builtUnit.createMany({
    data: alphaUnits.map((u) => ({
      projectId: infraProj1.id,
      phaseId: alphaPhase1.id,
      unitType: u.type,
      unitNumber: u.unitNumber,
      floor: u.floor,
      area: u.area,
      areaUnit: "SQFT",
      status: u.status,
      productionCost: 0,
      askingPrice: null,
      currentValuation: u.currentValuation,
    })),
  });

  // Suppliers for Nirman Infrastructure
  const infraSuppliers = [
    { name: "Road Materials Supply Co", gstin: "27AABCR1234M1Z1", phone: "+91 98220 71001", email: "sales@roadmaterials.in", address: "Chakan, Pune", leadTimeDays: 2 },
    { name: "Bridge Components India", gstin: "27AABCB5678N1Z2", phone: "+91 98220 72002", email: "b2b@bridgeindia.in", address: "Talegaon, Pune", leadTimeDays: 10 },
    { name: "Bitumen Express", gstin: "27AABCB9012P1Z3", phone: "+91 98220 73003", email: "orders@bitumenexpress.in", address: "Bhosari, Pune", leadTimeDays: 3 },
  ];
  const infraSuppMap: Record<string, string> = {};
  for (const s of infraSuppliers) {
    const row = await ensure("supplier", { name: s.name, companyId: infraId }, { ...s, companyId: infraId } as any);
    infraSuppMap[s.name] = row.id;
  }

  // Opening stock for Nirman Infrastructure
  const infraOpeningStock = [
    { code: "CEM-OPC53", loc: infraWarehouse.id, qty: 2000, cost: 382 },
    { code: "STL-TMT16", loc: infraWarehouse.id, qty: 5000, cost: 80 },
    { code: "AGG-20MM", loc: alphaSite.id, qty: 5000, cost: 56 },
    { code: "SND-RIVER", loc: alphaSite.id, qty: 3000, cost: 47 },
  ];
  for (const s of infraOpeningStock) {
    const mid = matMap[s.code];
    if (!mid) continue;
    await withStockTransaction(async (tx) => {
      await recordMovement(tx, {
        materialId: mid,
        movementType: "PURCHASE_RECEIPT",
        toLocationId: s.loc,
        qty: new Decimal(s.qty),
        unitCost: new Decimal(s.cost),
        reason: "Opening stock — Nirman Infrastructure",
        refType: "SEED",
      });
    });
  }

  // Equipment for Nirman Infrastructure
  const infraEquipment = [
    { assetTag: "INF-EXC-01", name: "Hitachi Excavator ZX350", model: "ZX350", serialNumber: "ZX350001", category: "Heavy Machinery", acquisitionCost: 5500000, currentValue: 4800000, purchaseDate: new Date("2024-01-10") },
    { assetTag: "INF-RLR-01", name: "Vibratory Road Roller", model: "VR-12T", serialNumber: "VR12T001", category: "Heavy Machinery", acquisitionCost: 2800000, currentValue: 2400000, purchaseDate: new Date("2024-02-01") },
    { assetTag: "INF-APH-01", name: "Asphalt Paver Finisher", model: "APF-180", serialNumber: "APF180001", category: "Heavy Machinery", acquisitionCost: 6500000, currentValue: 6000000, purchaseDate: new Date("2024-01-25") },
    { assetTag: "INF-CMP-01", name: "Soil Compactor", model: "SC-8T", serialNumber: "SC8T001", category: "Heavy Machinery", acquisitionCost: 1800000, currentValue: 1600000, purchaseDate: new Date("2024-03-01") },
  ];
  for (const e of infraEquipment) {
    await ensure("equipment", { assetTag: e.assetTag }, { ...e, companyId: infraId });
  }
  // Assign excavator + roller to Alpha Road site
  const infraExc = await prisma.equipment.findFirstOrThrow({ where: { assetTag: "INF-EXC-01" } });
  const infraRoller = await prisma.equipment.findFirstOrThrow({ where: { assetTag: "INF-RLR-01" } });
  await prisma.equipmentAssignment.create({
    data: { equipmentId: infraExc.id, locationId: alphaSite.id, projectId: infraProj1.id, status: "ACTIVE", assignedAt: new Date("2024-04-10") },
  });
  await prisma.equipment.update({ where: { id: infraExc.id }, data: { status: "ASSIGNED" } });
  await prisma.equipmentAssignment.create({
    data: { equipmentId: infraRoller.id, locationId: alphaSite.id, projectId: infraProj1.id, status: "ACTIVE", assignedAt: new Date("2024-04-12") },
  });
  await prisma.equipment.update({ where: { id: infraRoller.id }, data: { status: "ASSIGNED" } });

  // Project costs for Nirman Infrastructure
  await prisma.projectCost.createMany({
    data: [
      { projectId: infraProj1.id, costType: "LABOUR", amount: 8500000, date: new Date("2024-05-01"), vendor: "Highway Labour Corp", notes: "Section A earthwork + subgrade" },
      { projectId: infraProj1.id, costType: "EQUIPMENT", amount: 3500000, date: new Date("2024-05-15"), notes: "Equipment diesel + operator charges" },
      { projectId: infraProj1.id, costType: "PERMIT", amount: 2500000, date: new Date("2024-03-20"), vendor: "NHAI", notes: "Highway extension clearance" },
      { projectId: infraProj2.id, costType: "LABOUR", amount: 2200000, date: new Date("2024-06-01"), vendor: "Bridge Construction Co", notes: "Pier + abutment construction" },
      { projectId: infraProj2.id, costType: "CONTRACTOR", amount: 1800000, date: new Date("2024-06-15"), notes: "Pre-stressed girder fabrication" },
    ],
  });

  // Material issues for Alpha Road (from the site where stock was placed)
  await issueMaterialsToProject({
    projectId: infraProj1.id,
    fromLocationId: alphaSite.id,
    issuedById: U.supervisor,
    notes: "Section A subgrade — aggregate from site",
    lines: [
      { materialId: matMap["AGG-20MM"], qty: 2000 },
      { materialId: matMap["SND-RIVER"], qty: 1000 },
    ],
  });
  // Also issue cement + steel from warehouse (where they have opening stock)
  await issueMaterialsToProject({
    projectId: infraProj1.id,
    fromLocationId: infraWarehouse.id,
    issuedById: U.supervisor,
    notes: "Section A — cement + steel from warehouse",
    lines: [
      { materialId: matMap["CEM-OPC53"], qty: 500 },
      { materialId: matMap["STL-TMT16"], qty: 2000 },
    ],
  });

  // Reallocate costs for Nirman Infrastructure projects
  await withStockTransaction(async (tx) => {
    await reallocateProjectCosts(tx, infraProj1.id);
  });
  await withStockTransaction(async (tx) => {
    await reallocateProjectCosts(tx, infraProj2.id);
  });

  // ── 32. Nirman Interiors — projects, units ──────────────────
  const interiorsId = childCompanyMap["Nirman Interiors"];

  // Employees for Nirman Interiors
  const interiorsEmps = [
    { name: "Arjun Nair", trade: "Carpentry", phone: "+91 98220 81001", dailyRate: 1200 },
    { name: "Meera Kapoor", trade: "Interior Design", phone: "+91 98220 81002", dailyRate: 1500 },
    { name: "Sahil Khan", trade: "Painting", phone: "+91 98220 81003", dailyRate: 900 },
  ];
  for (const e of interiorsEmps) {
    await ensure("employee", { name: e.name, companyId: interiorsId }, { ...e, companyId: interiorsId });
  }

  // Projects for Nirman Interiors
  const interiorsProj1 = await ensure(
    "project",
    { companyId: interiorsId, name: "TechPark Office Fit-Out" },
    {
      companyId: interiorsId,
      name: "TechPark Office Fit-Out",
      type: "COMMERCIAL",
      status: "ACTIVE",
      address: "Hinjewadi Phase 2, Pune 411057",
      totalBudget: 25000000,
      startDate: new Date("2024-07-01"),
      description: "50,000 sqft IT office fit-out — workstations, cabins, conference rooms",
    },
  );
  const interiorsProj2 = await ensure(
    "project",
    { companyId: interiorsId, name: "Luxury Penthouse Reno" },
    {
      companyId: interiorsId,
      name: "Luxury Penthouse Reno",
      type: "RESIDENTIAL",
      status: "ACTIVE",
      address: "Koregaon Park, Pune 411001",
      totalBudget: 8500000,
      startDate: new Date("2024-08-01"),
      description: "4500 sqft penthouse — Italian marble, smart home, custom furniture",
    },
  );

  // Phases
  const techparkPhase1 = await ensure(
    "projectPhase",
    { projectId: interiorsProj1.id, name: "Floor 1 Workstations" },
    { projectId: interiorsProj1.id, name: "Floor 1 Workstations", status: "ACTIVE", budget: 12000000, startDate: new Date("2024-07-15"), sortOrder: 1 },
  );
  const techparkPhase2 = await ensure(
    "projectPhase",
    { projectId: interiorsProj1.id, name: "Floor 2 Conference" },
    { projectId: interiorsProj1.id, name: "Floor 2 Conference", status: "PLANNED", budget: 13000000, sortOrder: 2 },
  );
  const penthousePhase = await ensure(
    "projectPhase",
    { projectId: interiorsProj2.id, name: "Full Floor Reno" },
    { projectId: interiorsProj2.id, name: "Full Floor Reno", status: "ACTIVE", budget: 8500000, startDate: new Date("2024-08-01"), sortOrder: 1 },
  );

  // Stock location for Nirman Interiors
  const interiorsStore = await ensure(
    "stockLocation",
    { companyId: interiorsId, type: "COMPANY_WAREHOUSE", name: "Interiors Studio Store" },
    { companyId: interiorsId, type: "COMPANY_WAREHOUSE", name: "Interiors Studio Store", address: "Koregaon Park, Pune 411001" },
  );
  const techparkSite = await ensure(
    "stockLocation",
    { companyId: interiorsId, projectId: interiorsProj1.id, name: "TechPark Site" },
    { companyId: interiorsId, type: "PROJECT_SITE", projectId: interiorsProj1.id, name: "TechPark Site" },
  );

  // Built "units" for TechPark — conference rooms as sellable units
  const techparkUnits: { unitNumber: string; floor: number; area: number; type: "SHOP"; status: "UNDER_CONSTRUCTION" | "AVAILABLE" | "PLANNED"; currentValuation: number }[] = [];
  for (let f = 1; f <= 2; f++) {
    for (let r = 1; r <= 4; r++) {
      techparkUnits.push({ unitNumber: `F${f}-R${r}`, floor: f, area: 800, type: "SHOP", status: f === 1 && r <= 2 ? "UNDER_CONSTRUCTION" : f === 1 ? "AVAILABLE" : "PLANNED", currentValuation: 3000000 });
    }
  }
  await prisma.builtUnit.createMany({
    data: techparkUnits.map((u) => ({
      projectId: interiorsProj1.id,
      phaseId: u.floor === 1 ? techparkPhase1.id : techparkPhase2.id,
      unitType: u.type,
      unitNumber: u.unitNumber,
      floor: u.floor,
      area: u.area,
      areaUnit: "SQFT",
      status: u.status,
      productionCost: 0,
      askingPrice: null,
      currentValuation: u.currentValuation,
    })),
  });

  // Suppliers for Nirman Interiors
  const interiorsSuppliers = [
    { name: "Italian Marble Imports", gstin: "27AABCI1234M1Z1", phone: "+91 98220 91001", email: "imports@italianmarble.in", address: "BKC, Mumbai", leadTimeDays: 30 },
    { name: "Smart Home Systems India", gstin: "27AABCS5678N1Z2", phone: "+91 98220 92002", email: "b2b@smarthome.in", address: "Baner, Pune", leadTimeDays: 14 },
    { name: "Office Furniture Mart", gstin: "27AABCF9012P1Z3", phone: "+91 98220 93003", email: "b2b@furnituremart.in", address: "Pimpri, Pune", leadTimeDays: 7 },
  ];
  const interiorsSuppMap: Record<string, string> = {};
  for (const s of interiorsSuppliers) {
    const row = await ensure("supplier", { name: s.name, companyId: interiorsId }, { ...s, companyId: interiorsId } as any);
    interiorsSuppMap[s.name] = row.id;
  }

  // Opening stock for Nirman Interiors
  const interiorsOpeningStock = [
    { code: "PNT-EMULSION", loc: interiorsStore.id, qty: 200, cost: 185 },
    { code: "PNT-ACPRM", loc: interiorsStore.id, qty: 150, cost: 122 },
    { code: "ELC-WIRE25", loc: interiorsStore.id, qty: 1000, cost: 19 },
  ];
  for (const s of interiorsOpeningStock) {
    const mid = matMap[s.code];
    if (!mid) continue;
    await withStockTransaction(async (tx) => {
      await recordMovement(tx, {
        materialId: mid,
        movementType: "PURCHASE_RECEIPT",
        toLocationId: s.loc,
        qty: new Decimal(s.qty),
        unitCost: new Decimal(s.cost),
        reason: "Opening stock — Nirman Interiors",
        refType: "SEED",
      });
    });
  }

  // Equipment for Nirman Interiors
  const interiorsEquipment = [
    { assetTag: "INT-CNC-01", name: "CNC Wood Router", model: "CNC-WR-48", serialNumber: "CNCWR001", category: "Power Tool", acquisitionCost: 850000, currentValue: 720000, purchaseDate: new Date("2023-12-01") },
    { assetTag: "INT-LAS-01", name: "Laser Cutting Machine", model: "LCM-1500", serialNumber: "LCM001", category: "Power Tool", acquisitionCost: 1200000, currentValue: 1050000, purchaseDate: new Date("2024-01-15") },
    { assetTag: "INT-DRN-01", name: "Dust Extraction System", model: "DES-2000", serialNumber: "DES001", category: "Equipment", acquisitionCost: 350000, currentValue: 300000, purchaseDate: new Date("2024-02-01") },
  ];
  for (const e of interiorsEquipment) {
    await ensure("equipment", { assetTag: e.assetTag }, { ...e, companyId: interiorsId });
  }

  // Customers for Nirman Interiors
  const interiorsCustomers = [
    { name: "TechFirst Solutions", phone: "+91 98220 94001", email: "facilities@techfirst.in", gstin: "27AAFCT1234M1Z5", address: "Hinjewadi, Pune" },
    { name: "Aditya Kapoor", phone: "+91 98220 95002", email: "aditya.kapoor@gmail.com", address: "Koregaon Park, Pune" },
  ];
  const interiorsCustMap: Record<string, string> = {};
  for (const c of interiorsCustomers) {
    const row = await ensure("customer", { name: c.name, companyId: interiorsId }, { ...c, companyId: interiorsId });
    interiorsCustMap[c.name] = row.id;
  }

  // Project costs for Nirman Interiors
  await prisma.projectCost.createMany({
    data: [
      { projectId: interiorsProj1.id, costType: "LABOUR", amount: 1800000, date: new Date("2024-07-20"), vendor: "Interiors Labour Team", notes: "Floor 1 workstation installation" },
      { projectId: interiorsProj1.id, costType: "CONTRACTOR", amount: 2200000, date: new Date("2024-08-01"), notes: "Electrical + data cabling Floor 1" },
      { projectId: interiorsProj2.id, costType: "LABOUR", amount: 950000, date: new Date("2024-08-10"), vendor: "Premium Interiors Team", notes: "Marble laying + carpentry" },
      { projectId: interiorsProj2.id, costType: "OVERHEAD", amount: 300000, date: new Date("2024-08-05"), notes: "Design + project management" },
    ],
  });

  // Reallocate costs for Nirman Interiors projects
  await withStockTransaction(async (tx) => {
    await reallocateProjectCosts(tx, interiorsProj1.id);
  });
  await withStockTransaction(async (tx) => {
    await reallocateProjectCosts(tx, interiorsProj2.id);
  });

  // ── 30. Worker Attendance (5 days × 7 employees) ────────────
  // Seeds attendance so the HR dashboard, attendance list, and
  // tier computation (present/absent/late/PL/NPL) all have data.
  console.log("Seeding worker attendance…");
  const attendanceDates = [
    new Date("2024-08-12"),
    new Date("2024-08-13"),
    new Date("2024-08-14"),
    new Date("2024-08-15"),
    new Date("2024-08-16"),
  ];
  const empNames = Object.keys(empMap);
  for (let di = 0; di < attendanceDates.length; di++) {
    const date = attendanceDates[di];
    for (let ei = 0; ei < empNames.length; ei++) {
      const name = empNames[ei];
      // Vary statuses: most present, one late, one absent, one PL on day 3
      let status: "PRESENT" | "LATE" | "ABSENT" | "PAID_LEAVE" | "HALF_DAY" | "OVERTIME" = "PRESENT";
      if (ei === 3 && di === 2) status = "PAID_LEAVE";
      else if (ei === 5 && di === 1) status = "LATE";
      else if (ei === 2 && di === 4) status = "ABSENT";
      else if (ei === 0 && di === 3) status = "OVERTIME";
      else if (ei === 4 && di === 2) status = "HALF_DAY";

      const checkIn = status === "ABSENT" || status === "PAID_LEAVE" ? null : new Date(`${date.toISOString().split("T")[0]}T09:${status === "LATE" ? "30" : "00"}:00`);
      const checkOut = status === "ABSENT" || status === "PAID_LEAVE" ? null : new Date(`${date.toISOString().split("T")[0]}T${status === "OVERTIME" ? "19" : "18"}:00:00`);
      const hours = status === "ABSENT" || status === "PAID_LEAVE" ? null : status === "OVERTIME" ? 10 : status === "HALF_DAY" ? 4 : status === "LATE" ? 7.5 : 9;

      await prisma.workerAttendance.create({
        data: {
          companyId: company.id,
          employeeId: empMap[name],
          date,
          projectId: project1.id,
          checkIn,
          checkOut,
          hoursWorked: hours ? new Decimal(hours) : null,
          status,
          recordedById: U.supervisor,
        },
      });
    }
  }

  // ── 31. Daily Progress Reports (3 DPRs in different approval states) ──
  // Seeds DPRs with material + labour lines so the DPR list, detail,
  // and multi-tier approval pipeline (SUBMITTED → SUB_ADMIN_APPROVED → APPROVED)
  // all have data to display.
  console.log("Seeding DPRs…");
  const dprData = [
    {
      date: new Date("2024-08-12"),
      workSummary: "Foundation footing casting for Tower A — 4 footings completed. Concrete pouring ongoing.",
      progressPct: 15,
      weather: "Sunny, 32°C",
      blockers: "Steel delivery delayed by 2 hours",
      tomorrowPlan: "Complete remaining 3 footings, start column reinforcement",
      approvalStatus: "APPROVED" as const,
      subAdminApprovedById: U.manager,
      subAdminApprovedAt: new Date("2024-08-12T16:00:00"),
      adminApprovedById: U.admin,
      adminApprovedAt: new Date("2024-08-13T10:00:00"),
      workType: "Foundation",
      materials: [{ material: "CEM-OPC53", qty: 42 }, { material: "AGG-20MM", qty: 18 }, { material: "SND-RIVER", qty: 12 }],
      labour: [{ employee: "Suresh Kale", hours: 9, task: "Footing casting + finishing" }, { employee: "Deepak More", hours: 8, task: "Reinforcement tying" }],
    },
    {
      date: new Date("2024-08-14"),
      workSummary: "Column reinforcement for Tower A ground floor — 6 columns tied. Electrical conduit rough-in started.",
      progressPct: 22,
      weather: "Cloudy, 28°C",
      blockers: null,
      tomorrowPlan: "Complete column shuttering, pour columns by evening",
      approvalStatus: "SUB_ADMIN_APPROVED" as const,
      subAdminApprovedById: U.manager,
      subAdminApprovedAt: new Date("2024-08-14T17:00:00"),
      adminApprovedById: null,
      adminApprovedAt: null,
      workType: "RCC",
      materials: [{ material: "STL-TMT16", qty: 850 }, { material: "STL-TMT12", qty: 320 }, { material: "ELC-CONDUIT", qty: 120 }],
      labour: [{ employee: "Deepak More", hours: 9, task: "Column rebar tying" }, { employee: "Mahesh Pawar", hours: 8, task: "Electrical conduit installation" }],
    },
    {
      date: new Date("2024-08-16"),
      workSummary: "Column casting ground floor — 6 columns poured. Plastering started in stilt area.",
      progressPct: 28,
      weather: "Light rain, 26°C",
      blockers: "Rain slowed plastering — covered area only",
      tomorrowPlan: "Start first-floor slab shuttering, continue plastering",
      approvalStatus: "SUBMITTED" as const,
      subAdminApprovedById: null,
      subAdminApprovedAt: null,
      adminApprovedById: null,
      adminApprovedAt: null,
      workType: "RCC",
      materials: [{ material: "CEM-OPC53", qty: 55 }, { material: "AGG-20MM", qty: 25 }, { material: "STL-TMT16", qty: 600 }],
      labour: [{ employee: "Suresh Kale", hours: 9, task: "Column casting" }, { employee: "Ramesh Gaikwad", hours: 6, task: "Stilt area plastering" }],
    },
  ];
  for (const d of dprData) {
    const dpr = await prisma.dailyProgressReport.create({
      data: {
        companyId: company.id,
        projectId: project1.id,
        date: d.date,
        submittedById: U.supervisor,
        weather: d.weather,
        workSummary: d.workSummary,
        progressPct: new Decimal(d.progressPct),
        blockers: d.blockers,
        tomorrowPlan: d.tomorrowPlan,
        approvalStatus: d.approvalStatus,
        subAdminApprovedById: d.subAdminApprovedById,
        subAdminApprovedAt: d.subAdminApprovedAt,
        adminApprovedById: d.adminApprovedById,
        adminApprovedAt: d.adminApprovedAt,
        workType: d.workType,
      },
    });
    // Material lines
    for (const m of d.materials) {
      await prisma.dPRMaterialLine.create({
        data: {
          dprId: dpr.id,
          materialId: matMap[m.material],
          qty: new Decimal(m.qty),
          unitCost: new Decimal(0),
        },
      });
    }
    // Labour lines
    for (const l of d.labour) {
      await prisma.dPRLaborLine.create({
        data: {
          dprId: dpr.id,
          employeeId: empMap[l.employee],
          hoursWorked: new Decimal(l.hours),
          taskDescription: l.task,
        },
      });
    }
  }

  // ── 32. Payroll Period + Lines (Aug 2024) ───────────────────
  // Seeds one payroll period with lines for all 7 employees so the
  // payroll page, salary calculation, and GL posting all have data.
  console.log("Seeding payroll…");
  const payrollPeriod = await prisma.payrollPeriod.create({
    data: {
      companyId: company.id,
      month: 8,
      year: 2024,
      startDate: new Date("2024-08-01"),
      endDate: new Date("2024-08-31"),
      status: "PROCESSED",
      processedById: U.accountant,
      processedAt: new Date("2024-09-01T10:00:00"),
    },
  });
  let totalGross = new Decimal(0);
  let totalNet = new Decimal(0);
  let totalDed = new Decimal(0);
  for (const name of empNames) {
    const emp = employees.find((e) => e.name === name)!;
    // 26 working days × dailyRate (simplified — no OT for most)
    const overtimeDays = name === "Suresh Kale" ? 1 : 0;
    const halfDays = name === "Deepak More" ? 1 : 0;
    const paidLeaveDays = name === "Anil Shinde" ? 1 : 0;
    const absentDays = name === "Vinod Jadhav" ? 1 : 0;
    const presentDays = 26 - halfDays - paidLeaveDays - absentDays;
    const basic = new Decimal(emp.dailyRate).mul(presentDays);
    const overtime = new Decimal(emp.dailyRate).mul(overtimeDays).mul(1.5);
    const halfDayPay = new Decimal(emp.dailyRate).mul(halfDays).mul(0.5);
    const allowance = new Decimal(500); // flat monthly allowance
    const grossPay = basic.add(overtime).add(halfDayPay).add(allowance);
    const pf = grossPay.mul(0.12); // 12% PF
    const esi = grossPay.mul(0.01); // 1% ESI (simplified)
    const professionTax = new Decimal(200);
    const totalDeductions = pf.add(esi).add(professionTax);
    const netPay = grossPay.sub(totalDeductions);
    totalGross = totalGross.add(grossPay);
    totalDed = totalDed.add(totalDeductions);
    totalNet = totalNet.add(netPay);
    await prisma.payrollLine.create({
      data: {
        payrollPeriodId: payrollPeriod.id,
        employeeId: empMap[name],
        daysWorked: new Decimal(presentDays + halfDays * 0.5),
        basicAmount: basic,
        overtimeAmount: overtime,
        allowance: allowance,
        bonus: new Decimal(0),
        pf: pf,
        employerPf: pf,
        esi: esi,
        professionTax: professionTax,
        tax: new Decimal(0),
        deductions: new Decimal(0),
        grossPay: grossPay,
        totalDeductions: totalDeductions,
        netPay: netPay,
      },
    });
  }
  await prisma.payrollPeriod.update({
    where: { id: payrollPeriod.id },
    data: {
      totalGross: totalGross,
      totalOvertime: totalGross.mul(0.05), // approximate
      totalDeductions: totalDed,
      totalNet: totalNet,
    },
  });

  // ── 33. Brokers (2 brokers for Nirman Constructions) ────────
  console.log("Seeding brokers…");
  const broker1 = await ensure("broker", { companyId: company.id, name: "Sandeep Properties" }, {
    companyId: company.id,
    name: "Sandeep Properties",
    phone: "+91 98220 77001",
    agency: "Sandeep Real Estate Advisors",
    defaultCommissionPercent: new Decimal(2.0),
    createdById: U.sales,
  });
  const broker2 = await ensure("broker", { companyId: company.id, name: "Pinnacle Realty" }, {
    companyId: company.id,
    name: "Pinnacle Realty",
    phone: "+91 98220 77002",
    agency: "Pinnacle Property Solutions",
    defaultCommissionPercent: new Decimal(1.5),
    createdById: U.sales,
  });

  // ── 34. Broker-linked sale (Sale 1 gets a broker) ───────────
  // Update sale1 to have a broker + commission so the broker
  // section on the sale detail page has data.
  await prisma.assetSale.update({
    where: { id: sale1.id },
    data: {
      dealSource: "BROKER",
      brokerId: broker1.id,
      brokerName: "Sandeep Properties",
      brokerPhone: "+91 98220 77001",
      commissionAmount: new Decimal(300000), // 2% of 1.5Cr
      commissionPaid: false,
    },
  });

  // ── 35. Payment Schedule for Sale 1 (construction-linked) ───
  // Seeds a CLP payment schedule with milestones so the sale detail
  // page's "Payment Schedule" section has data.
  console.log("Seeding payment schedule…");
  const scheduleItems = [
    { installmentNo: 1, description: "On Booking", percentage: 10, dueDate: new Date("2024-06-15") },
    { installmentNo: 2, description: "On Foundation Completion", percentage: 15, dueDate: new Date("2024-09-30") },
    { installmentNo: 3, description: "On 1st Slab Completion", percentage: 20, dueDate: new Date("2024-12-31") },
    { installmentNo: 4, description: "On 4th Slab Completion", percentage: 20, dueDate: new Date("2025-03-31") },
    { installmentNo: 5, description: "On 7th Slab Completion", percentage: 15, dueDate: new Date("2025-06-30") },
    { installmentNo: 6, description: "On Brickwork + Plastering", percentage: 10, dueDate: new Date("2025-09-30") },
    { installmentNo: 7, description: "On Possession + Registry", percentage: 10, dueDate: new Date("2025-12-31") },
  ];
  const totalSaleAmount = new Decimal(15000000);
  const schedule = await prisma.paymentSchedule.create({
    data: {
      assetSaleId: sale1.id,
      type: "CLP",
      totalAmount: totalSaleAmount,
      gstAmount: new Decimal(0),
      grandTotal: totalSaleAmount,
    },
  });
  for (const item of scheduleItems) {
    const amount = totalSaleAmount.mul(item.percentage).div(100);
    await prisma.paymentScheduleItem.create({
      data: {
        paymentScheduleId: schedule.id,
        installmentNo: item.installmentNo,
        description: item.description,
        percentage: new Decimal(item.percentage),
        amount: amount,
        gstPercentage: new Decimal(0),
        gstAmount: new Decimal(0),
        totalAmount: amount,
        dueDate: item.dueDate,
        status: item.installmentNo <= 2 ? "PAID" : "PENDING",
        paidAmount: item.installmentNo <= 2 ? amount : new Decimal(0),
        paidAt: item.installmentNo <= 2 ? item.dueDate : null,
      },
    });
  }

  // ── 36. Tenancy (shop S-02 rented out) ──────────────────────
  // Seeds a tenancy on an available shop unit so the rentals page,
  // tenancy detail, and rent escalation features all have data.
  console.log("Seeding tenancy…");
  const unitS02 = await prisma.builtUnit.findFirstOrThrow({ where: { projectId: project1.id, unitNumber: "S-02" } });
  await prisma.tenancy.create({
    data: {
      companyId: company.id,
      assetType: "BUILT_UNIT",
      builtUnitId: unitS02.id,
      projectId: project1.id,
      tenantName: "Sharma Medical Store",
      tenantPhone: "+91 98220 66001",
      tenantEmail: "sharma.medical@gmail.com",
      startDate: new Date("2024-07-01"),
      endDate: new Date("2026-06-30"),
      monthlyRent: new Decimal(25000),
      baseRent: new Decimal(25000),
      securityDeposit: new Decimal(100000),
      rentAgreementNo: "RA-2024-001",
      sacCode: "997212",
      escalationPercent: new Decimal(5),
      escalationIntervalMonths: 12,
      nextEscalationDate: new Date("2025-07-01"),
      rentFreeDays: 15,
      status: "ACTIVE",
      notes: "Ground floor shop opposite Tower A entrance",
      createdById: U.sales,
    },
  });
  // Mark the unit as RENTED
  await prisma.builtUnit.update({
    where: { id: unitS02.id },
    data: { status: "RENTED" },
  });

  // ═══════════════════════════════════════════════════════════════
  // BULK DATA — volume for stress-testing lists, pagination, filters
  // ═══════════════════════════════════════════════════════════════
  console.log("Seeding bulk data…");

  // ── B1. Additional material categories ──────────────────────
  const bulkCategories = [
    { name: "Hardware & Fittings", unit: "NOS", class: "RAW_MATERIAL" as const },
    { name: "Roofing & Cladding", unit: "SQM", class: "RAW_MATERIAL" as const },
    { name: "Waterproofing", unit: "KG", class: "RAW_MATERIAL" as const },
    { name: "Flooring & Tiling", unit: "SQM", class: "RAW_MATERIAL" as const },
    { name: "Doors & Windows", unit: "NOS", class: "RAW_MATERIAL" as const },
    { name: "Welding & Gas", unit: "NOS", class: "CONSUMABLE" as const },
    { name: "Tools & Hardware", unit: "NOS", class: "CONSUMABLE" as const },
    { name: "Adhesives & Sealants", unit: "NOS", class: "RAW_MATERIAL" as const },
  ];
  for (const c of bulkCategories) {
    const row = await ensure("materialCategory", { name: c.name }, c);
    catMap[c.name] = row.id;
  }

  // ── B2. Additional materials (30+ more for a fuller catalog) ──
  const bulkMaterials = [
    // Steel & Rebar — more sizes
    { code: "STL-TMT08", name: "TMT Steel Rebar 8mm", categoryId: catMap["Steel & Rebar"], unit: "KG", standardCost: 82, gstRate: 18, minStock: 2000, reorderPoint: 4000, economicOrderQty: 8000, hsnCode: "72142090", grade: "Fe500D", specification: "IS 1786" },
    { code: "STL-TMT10", name: "TMT Steel Rebar 10mm", categoryId: catMap["Steel & Rebar"], unit: "KG", standardCost: 80, gstRate: 18, minStock: 3000, reorderPoint: 5000, economicOrderQty: 8000, hsnCode: "72142090", grade: "Fe500D", specification: "IS 1786" },
    { code: "STL-TMT20", name: "TMT Steel Rebar 20mm", categoryId: catMap["Steel & Rebar"], unit: "KG", standardCost: 79, gstRate: 18, minStock: 2000, reorderPoint: 4000, economicOrderQty: 6000, hsnCode: "72142090", grade: "Fe500D", specification: "IS 1786" },
    { code: "STL-TMT25", name: "TMT Steel Rebar 25mm", categoryId: catMap["Steel & Rebar"], unit: "KG", standardCost: 78, gstRate: 18, minStock: 1000, reorderPoint: 2500, economicOrderQty: 5000, hsnCode: "72142090", grade: "Fe500D", specification: "IS 1786" },
    // Cement — more variants
    { code: "CEM-OPC43", name: "Cement OPC 43 Grade (50kg)", categoryId: catMap["Cement & Binding"], unit: "BAG", standardCost: 360, gstRate: 28, minStock: 150, reorderPoint: 250, economicOrderQty: 500, hsnCode: "25232900", grade: "OPC 43", specification: "IS 269" },
    { code: "CEM-SRC", name: "Sulphate Resistant Cement (50kg)", categoryId: catMap["Cement & Binding"], unit: "BAG", standardCost: 420, gstRate: 28, minStock: 50, reorderPoint: 100, economicOrderQty: 300, hsnCode: "25232900", grade: "SRC", specification: "IS 12330" },
    { code: "CEM-WHITE", name: "White Cement (40kg)", categoryId: catMap["Cement & Binding"], unit: "BAG", standardCost: 550, gstRate: 28, minStock: 30, reorderPoint: 60, economicOrderQty: 150, hsnCode: "25232100" },
    // Sand & Aggregate — more
    { code: "SND-M", name: "M-Sand (Manufactured)", categoryId: catMap["Sand & Aggregate"], unit: "CFT", standardCost: 38, gstRate: 5, minStock: 1500, reorderPoint: 2500, economicOrderQty: 5000, hsnCode: "25051000" },
    { code: "AGG-10MM", name: "10mm Aggregate", categoryId: catMap["Sand & Aggregate"], unit: "CFT", standardCost: 58, gstRate: 5, minStock: 800, reorderPoint: 1200, economicOrderQty: 3000, hsnCode: "25171000" },
    { code: "AGG-40MM", name: "40mm Aggregate", categoryId: catMap["Sand & Aggregate"], unit: "CFT", standardCost: 50, gstRate: 5, minStock: 500, reorderPoint: 800, economicOrderQty: 2000, hsnCode: "25171000" },
    { code: "SND-CONC", name: "Concrete Sand (Grade II)", categoryId: catMap["Sand & Aggregate"], unit: "CFT", standardCost: 42, gstRate: 5, minStock: 1000, reorderPoint: 1800, economicOrderQty: 4000, hsnCode: "25051000" },
    // Bricks & Blocks — more
    { code: "BLK-FlyAsh", name: "Fly Ash Brick 230x110x75", categoryId: catMap["Bricks & Blocks"], unit: "NOS", standardCost: 6.5, gstRate: 5, minStock: 10000, reorderPoint: 20000, economicOrderQty: 50000, hsnCode: "68151000" },
    { code: "BLK-AAC100", name: "AAC Block 600x200x100", categoryId: catMap["Bricks & Blocks"], unit: "NOS", standardCost: 38, gstRate: 18, minStock: 3000, reorderPoint: 5000, economicOrderQty: 10000, hsnCode: "68151000" },
    { code: "BLK-AAC200", name: "AAC Block 600x200x200", categoryId: catMap["Bricks & Blocks"], unit: "NOS", standardCost: 52, gstRate: 18, minStock: 2000, reorderPoint: 4000, economicOrderQty: 8000, hsnCode: "68151000" },
    // Electrical — more
    { code: "ELC-WIRE4", name: "Electrical Wire 4sqmm", categoryId: catMap["Electrical"], unit: "MTR", standardCost: 32, gstRate: 18, minStock: 1000, reorderPoint: 2000, economicOrderQty: 4000, hsnCode: "85444290" },
    { code: "ELC-WIRE6", name: "Electrical Wire 6sqmm", categoryId: catMap["Electrical"], unit: "MTR", standardCost: 48, gstRate: 18, minStock: 500, reorderPoint: 1000, economicOrderQty: 3000, hsnCode: "85444290" },
    { code: "ELC-CONDUIT25", name: "PVC Conduit 25mm", categoryId: catMap["Electrical"], unit: "MTR", standardCost: 38, gstRate: 18, minStock: 400, reorderPoint: 700, economicOrderQty: 2000, hsnCode: "39171090" },
    { code: "ELC-SWITCH", name: "Modular Switch 16A", categoryId: catMap["Electrical"], unit: "NOS", standardCost: 45, gstRate: 18, minStock: 200, reorderPoint: 400, economicOrderQty: 1000, hsnCode: "85365090" },
    { code: "ELC-SOCKET", name: "Modular Socket 16A", categoryId: catMap["Electrical"], unit: "NOS", standardCost: 50, gstRate: 18, minStock: 200, reorderPoint: 400, economicOrderQty: 1000, hsnCode: "85366990" },
    { code: "ELC-MCB32", name: "MCB 32A Single Pole", categoryId: catMap["Electrical"], unit: "NOS", standardCost: 280, gstRate: 18, minStock: 50, reorderPoint: 100, economicOrderQty: 300, hsnCode: "85362090" },
    // Plumbing — more
    { code: "PLB-PIPE6", name: "PVC Pipe 6 inch", categoryId: catMap["Plumbing & Sanitary"], unit: "MTR", standardCost: 320, gstRate: 18, minStock: 150, reorderPoint: 250, economicOrderQty: 500, hsnCode: "39171090" },
    { code: "PLB-ELBOW", name: "PVC Elbow 4 inch", categoryId: catMap["Plumbing & Sanitary"], unit: "NOS", standardCost: 35, gstRate: 18, minStock: 300, reorderPoint: 500, economicOrderQty: 1500, hsnCode: "39171090" },
    { code: "PLB-WC", name: "Western Toilet Commode", categoryId: catMap["Plumbing & Sanitary"], unit: "NOS", standardCost: 3500, gstRate: 18, minStock: 20, reorderPoint: 40, economicOrderQty: 100, hsnCode: "69101000" },
    { code: "PLB-WASH", name: "Wash Basin 24inch", categoryId: catMap["Plumbing & Sanitary"], unit: "NOS", standardCost: 2200, gstRate: 18, minStock: 15, reorderPoint: 30, economicOrderQty: 80, hsnCode: "69101000" },
    // Paint & Finishes — more
    { code: "PNT-PUTTY", name: "Wall Putty 40kg", categoryId: catMap["Paint & Finishes"], unit: "BAG", standardCost: 850, gstRate: 18, minStock: 50, reorderPoint: 100, economicOrderQty: 250, hsnCode: "32149000" },
    { code: "PNT-ENAMEL", name: "Synthetic Enamel Paint Grey", categoryId: catMap["Paint & Finishes"], unit: "LTR", standardCost: 280, gstRate: 18, minStock: 50, reorderPoint: 80, economicOrderQty: 200, hsnCode: "32089090" },
    { code: "PNT-WEATHER", name: "Weatherproof Exterior Paint", categoryId: catMap["Paint & Finishes"], unit: "LTR", standardCost: 320, gstRate: 18, minStock: 60, reorderPoint: 100, economicOrderQty: 250, hsnCode: "32089090" },
    // Hardware & Fittings
    { code: "HDW-HINGE4", name: "SS Hinge 4 inch (Pair)", categoryId: catMap["Hardware & Fittings"], unit: "NOS", standardCost: 85, gstRate: 18, minStock: 200, reorderPoint: 400, economicOrderQty: 1000, hsnCode: "83021000" },
    { code: "HDW-LOCK", name: "Mortice Door Lock", categoryId: catMap["Hardware & Fittings"], unit: "NOS", standardCost: 650, gstRate: 18, minStock: 30, reorderPoint: 60, economicOrderQty: 150, hsnCode: "83014000" },
    { code: "HDW-HANDLE", name: "Door Handle SS", categoryId: catMap["Hardware & Fittings"], unit: "NOS", standardCost: 120, gstRate: 18, minStock: 100, reorderPoint: 200, economicOrderQty: 500, hsnCode: "83024100" },
    // Roofing & Cladding
    { code: "ROF-SHEET", name: "GI Corrugated Sheet 3m", categoryId: catMap["Roofing & Cladding"], unit: "NOS", standardCost: 850, gstRate: 18, minStock: 50, reorderPoint: 100, economicOrderQty: 300, hsnCode: "72107000" },
    { code: "ROF-INSUL", name: "Roof Insulation 50mm", categoryId: catMap["Roofing & Cladding"], unit: "SQM", standardCost: 280, gstRate: 18, minStock: 200, reorderPoint: 400, economicOrderQty: 1000, hsnCode: "68061000" },
    // Waterproofing
    { code: "WPR-MEMBRANE", name: "Waterproofing Membrane 4mm", categoryId: catMap["Waterproofing"], unit: "SQM", standardCost: 180, gstRate: 18, minStock: 500, reorderPoint: 1000, economicOrderQty: 3000, hsnCode: "68071000" },
    { code: "WPR-COATING", name: "Cementitious Waterproof Coating 25kg", categoryId: catMap["Waterproofing"], unit: "NOS", standardCost: 1800, gstRate: 18, minStock: 30, reorderPoint: 60, economicOrderQty: 150, hsnCode: "32149000" },
    // Flooring & Tiling
    { code: "FLR-VITRIFIED", name: "Vitrified Tile 600x600", categoryId: catMap["Flooring & Tiling"], unit: "SQM", standardCost: 220, gstRate: 18, minStock: 500, reorderPoint: 1000, economicOrderQty: 3000, hsnCode: "69079000" },
    { code: "FLR-GRANITE", name: "Granite Tile 600x600", categoryId: catMap["Flooring & Tiling"], unit: "SQM", standardCost: 450, gstRate: 18, minStock: 200, reorderPoint: 400, economicOrderQty: 1000, hsnCode: "68010000" },
    { code: "FLR-MARBLE", name: "Italian Marble Slab", categoryId: catMap["Flooring & Tiling"], unit: "SQM", standardCost: 1200, gstRate: 18, minStock: 50, reorderPoint: 100, economicOrderQty: 300, hsnCode: "68010000" },
    // Doors & Windows
    { code: "DR-WOODEN", name: "Flush Door 35x2100x900", categoryId: catMap["Doors & Windows"], unit: "NOS", standardCost: 2800, gstRate: 18, minStock: 20, reorderPoint: 40, economicOrderQty: 100, hsnCode: "44182000" },
    { code: "DR-ALUMINIUM", name: "Aluminium Sliding Window 1200x1500", categoryId: catMap["Doors & Windows"], unit: "NOS", standardCost: 4500, gstRate: 18, minStock: 15, reorderPoint: 30, economicOrderQty: 80, hsnCode: "76101000" },
    // Welding & Gas
    { code: "WLD-E6013", name: "Welding Electrode E6013 3.2mm", categoryId: catMap["Welding & Gas"], unit: "KG", standardCost: 180, gstRate: 18, minStock: 100, reorderPoint: 200, economicOrderQty: 500, hsnCode: "83111000" },
    { code: "WLD-OXYGEN", name: "Oxygen Cylinder 7m³", categoryId: catMap["Welding & Gas"], unit: "NOS", standardCost: 850, gstRate: 18, minStock: 10, reorderPoint: 20, economicOrderQty: 50, hsnCode: "28044000" },
    // Adhesives & Sealants
    { code: "ADH-TILE", name: "Tile Adhesive 25kg", categoryId: catMap["Adhesives & Sealants"], unit: "BAG", standardCost: 480, gstRate: 18, minStock: 50, reorderPoint: 100, economicOrderQty: 250, hsnCode: "32149000" },
    { code: "ADH-SEALANT", name: "Silicone Sealant 280ml", categoryId: catMap["Adhesives & Sealants"], unit: "NOS", standardCost: 220, gstRate: 18, minStock: 80, reorderPoint: 150, economicOrderQty: 400, hsnCode: "35061000" },
    // Safety & Consumables — more
    { code: "SAF-VEST", name: "Safety Reflective Vest", categoryId: catMap["Safety & Consumables"], unit: "NOS", standardCost: 120, gstRate: 18, minStock: 50, reorderPoint: 100, economicOrderQty: 250, hsnCode: "61172000" },
    { code: "SAF-GLOVES", name: "Safety Gloves (Pair)", categoryId: catMap["Safety & Consumables"], unit: "NOS", standardCost: 80, gstRate: 18, minStock: 100, reorderPoint: 200, economicOrderQty: 500, hsnCode: "61161000" },
    { code: "SAF-BOOTS", name: "Safety Steel Toe Boots", categoryId: catMap["Safety & Consumables"], unit: "NOS", standardCost: 850, gstRate: 18, minStock: 30, reorderPoint: 60, economicOrderQty: 150, hsnCode: "64011000" },
    { code: "SAF-GOGGLES", name: "Safety Goggles Clear", categoryId: catMap["Safety & Consumables"], unit: "NOS", standardCost: 65, gstRate: 18, minStock: 80, reorderPoint: 150, economicOrderQty: 400, hsnCode: "90049000" },
    // Scrap material
    { code: "SCR-STEEL", name: "Steel Scrap (Cut Pieces)", categoryId: catMap["Steel & Rebar"], unit: "KG", standardCost: 35, gstRate: 18, minStock: 0, reorderPoint: 0, economicOrderQty: 0, isScrap: true },
    { code: "SCR-WOOD", name: "Wood Scrap (Formwork)", categoryId: catMap["Formwork & Scaffolding"], unit: "NOS", standardCost: 200, gstRate: 18, minStock: 0, reorderPoint: 0, economicOrderQty: 0, isScrap: true },
  ];
  for (const m of bulkMaterials) {
    const row = await ensure("material", { code: m.code }, m);
    matMap[m.code] = row.id;
  }

  // ── B3. Opening stock for a selection of new materials ──────
  const bulkOpeningStock = [
    { code: "STL-TMT08", loc: warehouse.id, qty: 3000, cost: 82 },
    { code: "STL-TMT10", loc: warehouse.id, qty: 4000, cost: 80 },
    { code: "STL-TMT20", loc: warehouse.id, qty: 4000, cost: 79 },
    { code: "CEM-OPC43", loc: warehouse.id, qty: 300, cost: 360 },
    { code: "SND-M", loc: warehouse.id, qty: 1500, cost: 38 },
    { code: "AGG-10MM", loc: warehouse.id, qty: 1200, cost: 58 },
    { code: "BLK-FlyAsh", loc: site1.id, qty: 15000, cost: 6.5 },
    { code: "BLK-AAC100", loc: site1.id, qty: 2500, cost: 38 },
    { code: "ELC-WIRE4", loc: warehouse.id, qty: 1500, cost: 32 },
    { code: "ELC-SWITCH", loc: warehouse.id, qty: 300, cost: 45 },
    { code: "ELC-SOCKET", loc: warehouse.id, qty: 300, cost: 50 },
    { code: "PLB-WC", loc: warehouse.id, qty: 30, cost: 3500 },
    { code: "PNT-PUTTY", loc: warehouse.id, qty: 80, cost: 850 },
    { code: "FLR-VITRIFIED", loc: warehouse.id, qty: 1200, cost: 220 },
    { code: "HDW-HINGE4", loc: warehouse.id, qty: 300, cost: 85 },
    { code: "HDW-LOCK", loc: warehouse.id, qty: 50, cost: 650 },
    { code: "HDW-HANDLE", loc: warehouse.id, qty: 100, cost: 120 },
    { code: "DR-WOODEN", loc: warehouse.id, qty: 30, cost: 2800 },
    { code: "WLD-E6013", loc: warehouse.id, qty: 150, cost: 180 },
    { code: "ADH-TILE", loc: warehouse.id, qty: 80, cost: 480 },
    { code: "SAF-VEST", loc: warehouse.id, qty: 80, cost: 120 },
    { code: "SAF-GLOVES", loc: warehouse.id, qty: 150, cost: 80 },
    { code: "SAF-BOOTS", loc: warehouse.id, qty: 40, cost: 850 },
    { code: "WPR-MEMBRANE", loc: warehouse.id, qty: 1000, cost: 180 },
    { code: "WPR-COATING", loc: warehouse.id, qty: 30, cost: 1800 },
    { code: "STL-TMT25", loc: warehouse.id, qty: 3000, cost: 78 },
    { code: "ADH-TILE", loc: warehouse.id, qty: 100, cost: 480 },
  ];
  for (const s of bulkOpeningStock) {
    const mid = matMap[s.code];
    if (!mid) continue;
    await withStockTransaction(async (tx) => {
      await recordMovement(tx, {
        materialId: mid,
        movementType: "PURCHASE_RECEIPT",
        toLocationId: s.loc,
        qty: new Decimal(s.qty),
        unitCost: new Decimal(s.cost),
        reason: "Bulk opening stock",
        refType: "SEED",
      });
    });
  }

  // ── B4. Additional suppliers (15 more for a fuller vendor list) ──
  const bulkSuppliers = [
    { name: "ACC Cement Distributor", gstin: "27AAACC2001F1Z2", phone: "+91 98220 10001", email: "orders@accdist.in", address: "Chakan, Pune", leadTimeDays: 3 },
    { name: "Dalmia Cement Supply", gstin: "27AAACD3002F1Z3", phone: "+91 98220 10002", email: "sales@dalmiasupply.in", address: "Nigdi, Pune", leadTimeDays: 4 },
    { name: "SAIL Steel Direct", gstin: "27AAACS4003K1Z4", phone: "+91 98220 10003", email: "b2b@saildirect.in", address: "BKC, Mumbai", leadTimeDays: 12 },
    { name: "Vizag Steel Supplies", gstin: "27AAACV5004K1Z5", phone: "+91 98220 10004", email: "sales@vizagsteel.in", address: "Turbhe, Navi Mumbai", leadTimeDays: 14 },
    { name: "Bharat Brick Industries", phone: "+91 98220 10005", address: "Shirur, Pune", leadTimeDays: 3 },
    { name: "Modern Block Works", gstin: "27AAACM6007B1Z6", phone: "+91 98220 10006", email: "modern.blocks@gmail.com", address: "Rajgurunagar, Pune", leadTimeDays: 5 },
    { name: "Narmada Sand Suppliers", phone: "+91 98220 10007", address: "Manchar, Pune", leadTimeDays: 2 },
    { name: "Aggregate Direct", phone: "+91 98220 10008", address: "Wagholi, Pune", leadTimeDays: 1 },
    { name: "Anchor Electricals", gstin: "27AAACA7008E1Z7", phone: "+91 98220 10009", email: "b2b@anchorelec.in", address: "Mumbai, Pune", leadTimeDays: 6 },
    { name: "Havells Wholesale", gstin: "27AAACH7009E1Z8", phone: "+91 98220 10010", email: "wholesale@havells.in", address: "Pimpri, Pune", leadTimeDays: 5 },
    { name: "Jaquar Sanitary Ware", gstin: "27AAACJ8010S1Z9", phone: "+91 98220 10011", email: "b2b@jaquar.in", address: "Chinchwad, Pune", leadTimeDays: 7 },
    { name: "Kajaria Tiles Depot", gstin: "27AAACK9011T1Z0", phone: "+91 98220 10012", email: "depot@kajaria.in", address: "Market Yard, Pune", leadTimeDays: 6 },
    { name: "Godrej Locks & Hardware", gstin: "27AAACG0112H1Z1", phone: "+91 98220 10013", email: "b2b@godrejlocks.in", address: "Vikhroli, Mumbai", leadTimeDays: 8 },
    { name: "Tata Bluescope Steel", gstin: "27AAACT2113S1Z2", phone: "+91 98220 10014", email: "b2b@bluescope.in", address: "Talegaon, Pune", leadTimeDays: 10 },
    { name: "Dr Fixit Waterproofing", gstin: "27AAACD3114W1Z3", phone: "+91 98220 10015", email: "b2b@drfixit.in", address: "Andheri, Mumbai", leadTimeDays: 5 },
    { name: "Century Plywood Distributors", gstin: "27AAACC4115P1Z4", phone: "+91 98220 10016", email: "century.plydist@gmail.com", address: "Bhosari, Pune", leadTimeDays: 4 },
    { name: "Aditya Birla Roofing", gstin: "27AAACA5116R1Z5", phone: "+91 98220 10017", email: "roofing@birla.in", address: "Taloja, Navi Mumbai", leadTimeDays: 9 },
    { name: "Esab Welding Supplies", gstin: "27AAACE6117W1Z6", phone: "+91 98220 10018", email: "b2b@esab.in", address: "Bhosari, Pune", leadTimeDays: 6 },
    { name: "Fosroc Adhesives India", gstin: "27AAACF7118A1Z7", phone: "+91 98220 10019", email: "b2b@fosroc.in", address: "Chennai (via Pune)", leadTimeDays: 12 },
    { name: "Udyog Safety Equipment", gstin: "27AAACU8119S1Z8", phone: "+91 98220 10020", email: "orders@udyogsafety.in", address: "Bhosari, Pune", leadTimeDays: 3 },
  ];
  for (const s of bulkSuppliers) {
    const row = await ensure("supplier", { name: s.name, companyId: company.id }, { ...s, companyId: company.id } as any);
    supplierMap[s.name] = row.id;
  }

  // ── B5. Additional customers (15 more) ──────────────────────
  const bulkCustomers = [
    { name: "Suresh Kulkarni", phone: "+91 98220 20001", email: "suresh.k@gmail.com", address: "Aundh, Pune" },
    { name: "Lakshmi Enterprises", phone: "+91 98220 20002", email: "accounts@lakshmient.in", gstin: "27AAACL2003L1Z1", address: "Kharadi, Pune" },
    { name: "Rohit Patil", phone: "+91 98220 20003", email: "rohit.patil@gmail.com", address: "Baner, Pune" },
    { name: "Sharma Construction Co", phone: "+91 98220 20004", email: "info@sharmaconstr.in", gstin: "27AAACS2004C1Z2", address: "Hadapsar, Pune" },
    { name: "Anjali Desai", phone: "+91 98220 20005", email: "anjali.desai@gmail.com", address: "Kothrud, Pune" },
    { name: "Pinnacle Builders", phone: "+91 98220 20006", email: "purchase@pinnaclebuilders.in", gstin: "27AAACP2005B1Z3", address: "Viman Nagar, Pune" },
    { name: "Vikram Singh", phone: "+91 98220 20007", email: "vikram.singh@gmail.com", address: "Wagholi, Pune" },
    { name: "Maheshwari Traders", phone: "+91 98220 20008", email: "contact@maheshwaritraders.in", gstin: "27AAACM2006T1Z4", address: "Raviwar Peth, Pune" },
    { name: "Deepak Agarwal", phone: "+91 98220 20009", email: "deepak.agarwal@gmail.com", address: "Camp, Pune" },
    { name: "Sai Krupa Enterprises", phone: "+91 98220 20010", email: "saikrupa.ent@gmail.com", gstin: "27AAACS2007E1Z5", address: "Bhosari, Pune" },
    { name: "Nilesh Shah", phone: "+91 98220 20011", email: "nilesh.shah@gmail.com", address: "Model Colony, Pune" },
    { name: "Green Valley Resorts", phone: "+91 98220 20012", email: "purchase@greenvalley.in", gstin: "27AAACG2008R1Z6", address: "Lonavala, Pune" },
    { name: "Patil Family Trust", phone: "+91 98220 20013", email: "trust@patilfamily.in", address: "Shivajinagar, Pune" },
    { name: "Kumar Infra Projects", phone: "+91 98220 20014", email: "procurement@kumarinfra.in", gstin: "27AAACK2009I1Z7", address: "Hinjewadi, Pune" },
    { name: "Sneha Constructions", phone: "+91 98220 20015", email: "info@snehaconstr.in", gstin: "27AAACS2010C1Z8", address: "Wakad, Pune" },
  ];
  for (const c of bulkCustomers) {
    const row = await ensure("customer", { name: c.name, companyId: company.id }, { ...c, companyId: company.id });
    customerMap[c.name] = row.id;
  }

  // ── B6. Additional requisitions (10 more across projects + statuses) ──
  const bulkReqDefs = [
    { num: "REQ-2024-0008", project: "Greenfield Residency", phase: "Tower A", status: "APPROVED", date: "2024-06-01", needed: "2024-06-15", notes: "Blockwork AAC — Tower A floors 1-2", lines: [["BLK-AAC100", 2000, "AAC 100mm walls"], ["CEM-PPC", 200, "Mortar for blockwork"]] },
    { num: "REQ-2024-0009", project: "Greenfield Residency", phase: "Tower A", status: "SUBMITTED", date: "2024-06-05", needed: "2024-06-20", notes: "Plastering materials — Tower A GF", lines: [["SND-M", 1500, "M-sand for plaster"], ["PNT-PUTTY", 60, "Wall putty for finishing"]] },
    { num: "REQ-2024-0010", project: "Greenfield Residency", phase: "Tower B", status: "APPROVED", date: "2024-06-10", needed: "2024-06-25", notes: "Tower B foundation — steel + cement", lines: [["STL-TMT16", 3000, "Footing reinforcement"], ["CEM-OPC53", 500, "Foundation PCC"], ["AGG-20MM", 1500, "Aggregate for PCC"]] },
    { num: "REQ-2024-0011", project: "Hillview Corporate Park", status: "SUBMITTED", date: "2024-06-12", needed: "2024-06-30", notes: "Block 1 — structural steel", lines: [["STL-TMT20", 4000, "Column reinforcement"], ["STL-TMT25", 2000, "Beam reinforcement"]] },
    { num: "REQ-2024-0012", project: "Greenfield Residency", phase: "Tower A", status: "APPROVED", date: "2024-06-15", needed: "2024-07-01", notes: "Flooring — vitrified tiles for A-101", lines: [["FLR-VITRIFIED", 600, "Living + bedroom flooring"], ["ADH-TILE", 40, "Tile adhesive"]] },
    { num: "REQ-2024-0013", project: "Greenfield Residency", phase: "Tower A", status: "REJECTED", date: "2024-06-18", needed: "2024-07-05", notes: "Rejected — excessive qty, revise", lines: [["CEM-OPC53", 2000, "Over-estimated"]] },
    { num: "REQ-2024-0014", project: "Greenfield Residency", phase: "Tower A", status: "SUBMITTED", date: "2024-06-20", needed: "2024-07-10", notes: "Door + hardware for A-101 + A-102", lines: [["DR-WOODEN", 8, "Internal doors"], ["HDW-HINGE4", 50, "Hinges"], ["HDW-LOCK", 8, "Door locks"]] },
    { num: "REQ-2024-0015", project: "Hillview Corporate Park", status: "APPROVED", date: "2024-06-22", needed: "2024-07-12", notes: "Waterproofing for basement", lines: [["WPR-MEMBRANE", 800, "Basement membrane"], ["WPR-COATING", 20, "Coating for tanking"]] },
    { num: "REQ-2024-0016", project: "Greenfield Residency", phase: "Tower A", status: "SUBMITTED", date: "2024-06-25", needed: "2024-07-15", notes: "Electrical fittings — switches + sockets", lines: [["ELC-SWITCH", 200, "Modular switches"], ["ELC-SOCKET", 200, "Modular sockets"], ["ELC-MCB32", 20, "MCBs for sub-panel"]] },
    { num: "REQ-2024-0017", project: "Greenfield Residency", phase: "Tower A", status: "APPROVED", date: "2024-06-28", needed: "2024-07-18", notes: "Plumbing — WC + basin for 4 units", lines: [["PLB-WC", 8, "Western commodes"], ["PLB-WASH", 8, "Wash basins"], ["PLB-PIPE6", 200, "6-inch drainage"]] },
  ];
  const bulkReqIds: Record<string, string> = {};
  for (const r of bulkReqDefs) {
    const projectId = r.project === "Greenfield Residency" ? project1.id : project2.id;
    const phaseId = r.phase === "Tower A" ? phase1A.id : r.phase === "Tower B" ? phase1B.id : undefined;
    const req = await prisma.materialRequisition.create({
      data: {
        reqNumber: r.num,
        projectId,
        phaseId,
        requestedById: U.supervisor,
        status: r.status as any,
        requestDate: new Date(r.date),
        neededByDate: new Date(r.needed),
        notes: r.notes,
        lines: { create: r.lines.map(([code, qty, notes]) => ({ materialId: matMap[code as string], qtyRequested: qty as number, notes: notes as string })) },
      },
    });
    bulkReqIds[r.num] = req.id;
  }

  // ── B7. Additional Purchase Orders (15 more — mix of statuses) ──
  const bulkPoDefs: { supplier: string; scope: "PROJECT" | "COMPANY"; project?: string; dest: string; expected: string; notes: string; lines: [string, number, number, number][]; status: "DRAFT" | "ORDERED" | "PARTIAL" | "RECEIVED"; receive?: number }[] = [
    { supplier: "ACC Cement Distributor", scope: "PROJECT", project: "Greenfield Residency", dest: "site1", expected: "2024-07-05", notes: "AAC blocks + PPC for Tower A blockwork", lines: [["BLK-AAC100", 2000, 38, 18], ["CEM-PPC", 200, 340, 28]], status: "RECEIVED", receive: 1 },
    { supplier: "Modern Block Works", scope: "COMPANY", dest: "warehouse", expected: "2024-07-10", notes: "Fly ash bricks + AAC 200mm", lines: [["BLK-FlyAsh", 30000, 6.5, 5], ["BLK-AAC200", 3000, 52, 18]], status: "ORDERED" },
    { supplier: "Narmada Sand Suppliers", scope: "PROJECT", project: "Greenfield Residency", dest: "site1", expected: "2024-07-08", notes: "M-sand for plastering", lines: [["SND-M", 3000, 38, 5]], status: "RECEIVED", receive: 1 },
    { supplier: "Aggregate Direct", scope: "PROJECT", project: "Hillview Corporate Park", dest: "site2", expected: "2024-07-12", notes: "10mm + 40mm aggregate for concrete", lines: [["AGG-10MM", 2000, 58, 5], ["AGG-40MM", 1000, 50, 5]], status: "PARTIAL", receive: 0.6 },
    { supplier: "SAIL Steel Direct", scope: "COMPANY", dest: "warehouse", expected: "2024-07-20", notes: "20mm + 25mm rebar for Hillview columns", lines: [["STL-TMT20", 4000, 79, 18], ["STL-TMT25", 2000, 78, 18]], status: "ORDERED" },
    { supplier: "Havells Wholesale", scope: "PROJECT", project: "Greenfield Residency", dest: "site1", expected: "2024-07-15", notes: "Switches + sockets + MCBs", lines: [["ELC-SWITCH", 200, 42, 18], ["ELC-SOCKET", 200, 47, 18], ["ELC-MCB32", 20, 270, 18]], status: "RECEIVED", receive: 1 },
    { supplier: "Jaquar Sanitary Ware", scope: "PROJECT", project: "Greenfield Residency", dest: "site1", expected: "2024-07-18", notes: "WCs + wash basins for 4 units", lines: [["PLB-WC", 8, 3400, 18], ["PLB-WASH", 8, 2100, 18], ["PLB-PIPE6", 200, 310, 18]], status: "ORDERED" },
    { supplier: "Kajaria Tiles Depot", scope: "PROJECT", project: "Greenfield Residency", dest: "site1", expected: "2024-07-22", notes: "Vitrified tiles + adhesive for A-101", lines: [["FLR-VITRIFIED", 600, 215, 18], ["ADH-TILE", 40, 470, 18]], status: "DRAFT" },
    { supplier: "Godrej Locks & Hardware", scope: "PROJECT", project: "Greenfield Residency", dest: "site1", expected: "2024-07-25", notes: "Doors + hardware for A-101 + A-102", lines: [["DR-WOODEN", 8, 2750, 18], ["HDW-HINGE4", 50, 82, 18], ["HDW-LOCK", 8, 630, 18]], status: "DRAFT" },
    { supplier: "Dr Fixit Waterproofing", scope: "PROJECT", project: "Hillview Corporate Park", dest: "site2", expected: "2024-07-28", notes: "Basement waterproofing", lines: [["WPR-MEMBRANE", 800, 175, 18], ["WPR-COATING", 20, 1750, 18]], status: "ORDERED" },
    { supplier: "Berger Paints Wholesale", scope: "PROJECT", project: "Greenfield Residency", dest: "site1", expected: "2024-08-01", notes: "Putty + enamel for finishing", lines: [["PNT-PUTTY", 100, 830, 18], ["PNT-ENAMEL", 50, 275, 18]], status: "PARTIAL", receive: 0.5 },
    { supplier: "Esab Welding Supplies", scope: "COMPANY", dest: "warehouse", expected: "2024-08-05", notes: "Welding electrodes + oxygen", lines: [["WLD-E6013", 200, 175, 18], ["WLD-OXYGEN", 15, 820, 18]], status: "RECEIVED", receive: 1 },
    { supplier: "Udyog Safety Equipment", scope: "COMPANY", dest: "warehouse", expected: "2024-08-08", notes: "Safety gear bulk — vests + gloves + boots", lines: [["SAF-VEST", 100, 115, 18], ["SAF-GLOVES", 200, 78, 18], ["SAF-BOOTS", 50, 820, 18], ["SAF-GOGGLES", 100, 62, 18]], status: "RECEIVED", receive: 1 },
    { supplier: "Dalmia Cement Supply", scope: "COMPANY", dest: "warehouse", expected: "2024-08-12", notes: "OPC 43 + SRC for specialized pours", lines: [["CEM-OPC43", 400, 355, 28], ["CEM-SRC", 100, 415, 28]], status: "ORDERED" },
    { supplier: "Vizag Steel Supplies", scope: "COMPANY", dest: "warehouse", expected: "2024-08-15", notes: "8mm + 10mm rebar restock", lines: [["STL-TMT08", 3000, 80, 18], ["STL-TMT10", 4000, 78, 18]], status: "DRAFT" },
  ];

  const locMap: Record<string, string> = { warehouse: warehouse.id, site1: site1.id, site2: site2.id };
  for (const p of bulkPoDefs) {
    const projectId = p.project === "Greenfield Residency" ? project1.id : p.project === "Hillview Corporate Park" ? project2.id : undefined;
    const po = await createPurchaseOrder({
      supplierId: supplierMap[p.supplier],
      procurementScope: p.scope,
      companyId: company.id,
      projectId,
      destinationLocationId: locMap[p.dest],
      expectedDate: new Date(p.expected),
      notes: p.notes,
      lines: p.lines.map(([code, qty, cost, gst]) => ({ materialId: matMap[code], qtyOrdered: qty, unitCost: cost, gstRate: gst })),
    });
    if (p.status !== "DRAFT") {
      await approvePurchaseOrder(po.id, "OWNER");
      await orderPurchaseOrder(po.id);
      const daysBack = 30 + Math.floor(Math.random() * 30);
      await prisma.purchaseOrder.update({ where: { id: po.id }, data: { orderDate: new Date(`2024-06-${20 + Math.floor(Math.random() * 10)}`), createdAt: new Date(`2024-06-${15 + Math.floor(Math.random() * 10)}`) } });
      if (p.receive) {
        const poLines = await prisma.purchaseOrderLine.findMany({ where: { purchaseOrderId: po.id } });
        await receiveGoods({
          purchaseOrderId: po.id,
          locationId: locMap[p.dest],
          receivedById: U.supervisor,
          notes: p.receive === 1 ? "Full delivery" : "Partial delivery",
          lines: poLines.map((l) => ({
            purchaseOrderLineId: l.id,
            materialId: l.materialId,
            qtyReceived: new Decimal(l.qtyOrdered).times(p.receive!),
            unitCost: l.unitCost,
          })),
        });
        const gr = await prisma.goodsReceipt.findFirstOrThrow({ where: { purchaseOrderId: po.id } });
        await prisma.goodsReceipt.update({
          where: { id: gr.id },
          data: { inspectionStatus: p.receive === 1 ? "PASSED" : "PENDING", inspectionNotes: p.receive === 1 ? "Quality OK" : "Awaiting QC", inspectedById: p.receive === 1 ? U.manager : null, inspectedAt: p.receive === 1 ? new Date(p.expected) : null },
        });
      }
    }
  }

  // ── B8. Additional stock transfers (5 more) ─────────────────
  const bulkTransfers = [
    { from: "warehouse", to: "site1", date: "2024-07-05", material: "STL-TMT10", qty: 2000, notes: "10mm rebar to site for slab" },
    { from: "warehouse", to: "site1", date: "2024-07-08", material: "CEM-OPC43", qty: 150, notes: "OPC 43 to site for plastering" },
    { from: "warehouse", to: "site2", date: "2024-07-12", material: "STL-TMT20", qty: 1500, notes: "20mm to Hillview for columns" },
    { from: "warehouse", to: "site1", date: "2024-07-15", material: "ELC-SWITCH", qty: 150, notes: "Switches to site for Tower A" },
    { from: "warehouse", to: "site1", date: "2024-07-18", material: "FLR-VITRIFIED", qty: 400, notes: "Tiles to site for A-101 flooring" },
  ];
  for (const t of bulkTransfers) {
    const fromLoc = locMap[t.from];
    const toLoc = locMap[t.to];
    const transfer = await prisma.stockTransfer.create({
      data: {
        fromLocationId: fromLoc,
        toLocationId: toLoc,
        transferDate: new Date(t.date),
        status: "COMPLETED",
        notes: t.notes,
        lines: { create: [{ materialId: matMap[t.material], qty: t.qty }] },
      },
    });
    await withStockTransaction(async (tx) => {
      await recordTransfer(tx, {
        materialId: matMap[t.material],
        fromLocationId: fromLoc,
        toLocationId: toLoc,
        qty: new Decimal(t.qty),
        reason: t.notes,
        refType: "STOCK_TRANSFER",
        refId: transfer.id,
        userId: U.supervisor,
      });
    });
  }

  // ── B9. Additional material issues (8 more) ─────────────────
  const bulkIssues = [
    { from: "warehouse", project: "Greenfield Residency", notes: "Tower A slab 1 — cement + steel", lines: [["CEM-OPC53", 300], ["STL-TMT12", 2000], ["AGG-20MM", 400]] },
    { from: "site1", project: "Greenfield Residency", notes: "Tower A blockwork — AAC + mortar", lines: [["BLK-AAC100", 1500], ["CEM-PPC", 150]] },
    { from: "warehouse", project: "Greenfield Residency", notes: "Tower A flooring — tiles + adhesive", lines: [["FLR-VITRIFIED", 350], ["ADH-TILE", 30]] },
    { from: "warehouse", project: "Greenfield Residency", notes: "Tower A electrical — switches + sockets", lines: [["ELC-SWITCH", 150], ["ELC-SOCKET", 150]] },
    { from: "warehouse", project: "Greenfield Residency", notes: "Tower A doors + hardware", lines: [["DR-WOODEN", 6], ["HDW-HINGE4", 36], ["HDW-LOCK", 6]] },
    { from: "warehouse", project: "Hillview Corporate Park", notes: "Hillview — waterproofing", lines: [["WPR-MEMBRANE", 500], ["WPR-COATING", 12]] },
    { from: "warehouse", project: "Hillview Corporate Park", notes: "Hillview — steel for columns", lines: [["STL-TMT20", 2000], ["STL-TMT25", 1000]] },
    { from: "warehouse", project: "Greenfield Residency", notes: "Safety gear issue to site team", lines: [["SAF-VEST", 50], ["SAF-GLOVES", 100], ["SAF-BOOTS", 20], ["SAF-GOGGLES", 50]] },
  ];
  for (const iss of bulkIssues) {
    await issueMaterialsToProject({
      projectId: iss.project === "Greenfield Residency" ? project1.id : project2.id,
      fromLocationId: locMap[iss.from],
      issuedById: U.supervisor,
      notes: iss.notes,
      lines: iss.lines.map(([code, qty]) => ({ materialId: matMap[code as string], qty: qty as number })),
    });
  }

  // ── B10. Additional stock counts (3 more) ───────────────────
  const bulkCounts = [
    { loc: "warehouse", date: "2024-07-15", notes: "Monthly warehouse count — July", lines: [["CEM-OPC53", 950, 980], ["STL-TMT12", 4500, 4400], ["SND-M", 1400, 1500], ["ELC-WIRE25", 1700, 1800]] },
    { loc: "site1", date: "2024-07-20", notes: "Site yard count — Tower A materials", lines: [["BRK-RED", 32000, 33000], ["BLK-AAC", 2800, 3000], ["CEM-OPC53", 250, 240]] },
    { loc: "warehouse", date: "2024-08-15", notes: "Monthly warehouse count — August", lines: [["CEM-OPC43", 280, 300], ["STL-TMT08", 2800, 3000], ["SAF-HELMET", 95, 100], ["WLD-E6013", 140, 150]] },
  ];
  for (const c of bulkCounts) {
    await prisma.stockCount.create({
      data: {
        locationId: locMap[c.loc],
        countDate: new Date(c.date),
        status: "COUNTED",
        notes: c.notes,
        lines: {
          create: c.lines.map(([code, counted, system]) => ({
            materialId: matMap[code as string],
            countedQty: counted as number,
            systemQty: system as number,
            variance: (counted as number) - (system as number),
          })),
        },
      },
    });
  }

  // ── B11. Additional supplier returns (3 more) ───────────────
  const bulkReturns = [
    { num: "RET-2024-0004", supplier: "Havells Wholesale", loc: "site1", date: "2024-07-20", notes: "10 defective switches", lines: [["ELC-SWITCH", 10, 42, "Contact spring failure"]] },
    { num: "RET-2024-0005", supplier: "Kajaria Tiles Depot", loc: "site1", date: "2024-07-25", notes: "20 tiles chipped in transit", lines: [["FLR-VITRIFIED", 20, 215, "Chipped edges in transit"]] },
    { num: "RET-2024-0006", supplier: "Jaquar Sanitary Ware", loc: "site1", date: "2024-08-02", notes: "2 WCs with hairline cracks", lines: [["PLB-WC", 2, 3400, "Hairline crack in bowl"]] },
  ];
  for (const r of bulkReturns) {
    await prisma.supplierReturn.create({
      data: {
        returnNumber: r.num,
        supplierId: supplierMap[r.supplier],
        companyId: company.id,
        locationId: locMap[r.loc],
        status: "COMPLETED",
        returnDate: new Date(r.date),
        creditNoteNo: `CN-2024-${r.num.slice(-3)}`,
        notes: r.notes,
        lines: {
          create: r.lines.map(([code, qty, cost, reason]) => ({
            materialId: matMap[code as string],
            qty: qty as number,
            unitCost: cost as number,
            reason: reason as string,
          })),
        },
      },
    });
  }

  // ── B12. Additional equipment (10 more) ─────────────────────
  const bulkEquipment = [
    { assetTag: "JCB-002", name: "JCB 2DX Backhoe Loader", model: "2DX", serialNumber: "JCB2DX2024002", category: "Heavy Machinery", acquisitionCost: 2200000, currentValue: 1800000, purchaseDate: new Date("2023-09-15") },
    { assetTag: "MIX-002", name: "Concrete Mixer 350L", model: "CM-350", serialNumber: "CM350002", category: "Heavy Machinery", acquisitionCost: 65000, currentValue: 48000, purchaseDate: new Date("2023-11-01") },
    { assetTag: "BAR-001", name: "Bar Bending Machine", model: "BBM-32", serialNumber: "BBM32001", category: "Power Tool", acquisitionCost: 95000, currentValue: 72000, purchaseDate: new Date("2023-08-01") },
    { assetTag: "BAR-002", name: "Bar Cutting Machine", model: "BCM-40", serialNumber: "BCM40001", category: "Power Tool", acquisitionCost: 110000, currentValue: 85000, purchaseDate: new Date("2023-08-15") },
    { assetTag: "TRL-002", name: "Tipper Truck 6T", model: "Tata 610", serialNumber: "TA610002", category: "Vehicle", acquisitionCost: 1200000, currentValue: 950000, purchaseDate: new Date("2023-10-01") },
    { assetTag: "TRL-003", name: "Water Tanker 5000L", model: "WT-5000", serialNumber: "WT5000001", category: "Vehicle", acquisitionCost: 450000, currentValue: 380000, purchaseDate: new Date("2023-12-01") },
    { assetTag: "CMP-001", name: "Plate Compactor", model: "PC-90", serialNumber: "PC90001", category: "Heavy Machinery", acquisitionCost: 85000, currentValue: 62000, purchaseDate: new Date("2023-07-15") },
    { assetTag: "TRL-004", name: "Mini Tipper 3T", model: "Tata 407", serialNumber: "TA407003", category: "Vehicle", acquisitionCost: 850000, currentValue: 680000, purchaseDate: new Date("2024-01-10") },
    { assetTag: "PWR-002", name: "Diesel Generator 25kVA", model: "DG-25", serialNumber: "DG25002", category: "Power Tool", acquisitionCost: 280000, currentValue: 230000, purchaseDate: new Date("2023-06-20") },
    { assetTag: "WLD-001", name: "Welding Machine 400A", model: "WM-400", serialNumber: "WM400001", category: "Power Tool", acquisitionCost: 65000, currentValue: 48000, purchaseDate: new Date("2023-09-01") },
  ];
  for (const e of bulkEquipment) {
    const row = await ensure("equipment", { assetTag: e.assetTag }, { ...e, companyId: company.id });
    equipmentMap[e.assetTag] = row.id;
  }
  // Assign some equipment to sites
  await prisma.equipmentAssignment.create({ data: { equipmentId: equipmentMap["JCB-002"], locationId: site2.id, projectId: project2.id, status: "ACTIVE", assignedAt: new Date("2024-04-15") } });
  await prisma.equipment.update({ where: { id: equipmentMap["JCB-002"] }, data: { status: "ASSIGNED" } });
  await prisma.equipmentAssignment.create({ data: { equipmentId: equipmentMap["BAR-001"], locationId: site1.id, projectId: project1.id, status: "ACTIVE", assignedAt: new Date("2024-05-01") } });
  await prisma.equipment.update({ where: { id: equipmentMap["BAR-001"] }, data: { status: "ASSIGNED" } });
  await prisma.equipmentAssignment.create({ data: { equipmentId: equipmentMap["TRL-002"], locationId: site1.id, projectId: project1.id, status: "ACTIVE", assignedAt: new Date("2024-05-10") } });
  await prisma.equipment.update({ where: { id: equipmentMap["TRL-002"] }, data: { status: "ASSIGNED" } });
  // Maintenance for some
  await prisma.equipmentMaintenance.create({ data: { equipmentId: equipmentMap["BAR-002"], type: "REPAIR", startDate: new Date("2024-07-01"), endDate: new Date("2024-07-03"), cost: 6500, vendor: "Premier Motors", notes: "Blade replacement" } });
  await prisma.equipment.update({ where: { id: equipmentMap["BAR-002"] }, data: { status: "IN_MAINTENANCE" } });
  await prisma.equipmentMaintenance.create({ data: { equipmentId: equipmentMap["PWR-002"], type: "SCHEDULED", startDate: new Date("2024-08-01"), cost: 5500, vendor: "Premier Motors", notes: "Quarterly service" } });
  await prisma.equipmentMaintenance.create({ data: { equipmentId: equipmentMap["CMP-001"], type: "REPAIR", startDate: new Date("2024-06-15"), endDate: new Date("2024-06-16"), cost: 3200, vendor: "Local Mechanic", notes: "Engine oil leak" } });

  // ── B13. Additional employees (10 more) ─────────────────────
  const bulkEmployees = [
    { name: "Sachin Patil", trade: "Masonry", phone: "+91 98220 46001", dailyRate: 880 },
    { name: "Rajesh Verma", trade: "Electrical", phone: "+91 98220 46002", dailyRate: 980 },
    { name: "Imran Khan", trade: "Plumbing", phone: "+91 98220 46003", dailyRate: 820 },
    { name: "Vijay Salunkhe", trade: "Welding", phone: "+91 98220 46004", dailyRate: 1150 },
    { name: "Nitin Pawar", trade: "Carpentry", phone: "+91 98220 46005", dailyRate: 920 },
    { name: "Akash Jadhav", trade: "Painting", phone: "+91 98220 46006", dailyRate: 800 },
    { name: "Manoj Shinde", trade: "Bar Bending", phone: "+91 98220 46007", dailyRate: 850 },
    { name: "Pravin Kale", trade: "Supervisor", phone: "+91 98220 46008", dailyRate: 1300 },
    { name: "Sandesh More", trade: "Heavy Equipment", phone: "+91 98220 46009", dailyRate: 1400 },
    { name: "Tushar Gaikwad", trade: "Surveying", phone: "+91 98220 46010", dailyRate: 1100 },
  ];
  for (const e of bulkEmployees) {
    const row = await ensure("employee", { name: e.name, companyId: company.id }, { ...e, companyId: company.id });
    empMap[e.name] = row.id;
  }

  // ── B14. Additional DPRs (10 more across dates + statuses) ──
  const bulkDprDefs = [
    { date: "2024-08-19", summary: "First floor slab shuttering — 60% complete. Rebar tying ongoing.", pct: 32, weather: "Sunny, 30°C", blockers: null, tomorrow: "Complete shuttering, pour slab tomorrow", status: "APPROVED" as const, workType: "RCC", materials: [["STL-TMT16", 450], ["FRM-PLY18", 25]], labour: [["Suresh Kale", 9, "Slab shuttering"], ["Deepak More", 8, "Rebar tying"]] },
    { date: "2024-08-20", summary: "First floor slab cast — 1200 sqft poured. Concrete pumping used.", pct: 35, weather: "Cloudy, 28°C", blockers: "Concrete pump breakdown delayed pour by 2 hrs", tomorrow: "Cure slab, start 2nd floor shuttering", status: "SUB_ADMIN_APPROVED" as const, workType: "RCC", materials: [["CEM-OPC53", 65], ["AGG-20MM", 30], ["SND-RIVER", 18], ["STL-TMT16", 200]], labour: [["Suresh Kale", 10, "Slab casting + finishing"], ["Ramesh Gaikwad", 8, "Formwork removal prep"]] },
    { date: "2024-08-22", summary: "Slab curing Day 2. Started 2nd floor column reinforcement.", pct: 38, weather: "Sunny, 31°C", blockers: null, tomorrow: "Complete column rebar, start shuttering", status: "SUBMITTED" as const, workType: "RCC", materials: [["STL-TMT12", 380], ["STL-TMT16", 220]], labour: [["Deepak More", 9, "Column rebar tying"], ["Vijay Salunkhe", 7, "Welding for column cages"]] },
    { date: "2024-08-26", summary: "2nd floor columns cast — 6 columns. Plastering GF continued.", pct: 42, weather: "Light rain, 27°C", blockers: "Rain slowed plastering", tomorrow: "Start 2nd floor slab shuttering", status: "APPROVED" as const, workType: "RCC", materials: [["CEM-OPC53", 48], ["AGG-20MM", 22], ["STL-TMT16", 580]], labour: [["Suresh Kale", 9, "Column casting"], ["Akash Jadhav", 6, "GF plastering"]] },
    { date: "2024-08-28", summary: "2nd floor slab shuttering 80%. Electrical conduit rough-in for 1st floor.", pct: 45, weather: "Sunny, 29°C", blockers: null, tomorrow: "Complete shuttering, pour 2nd floor slab", status: "SUB_ADMIN_APPROVED" as const, workType: "RCC", materials: [["FRM-PLY18", 30], ["ELC-CONDUIT", 180]], labour: [["Ramesh Gaikwad", 9, "Slab shuttering"], ["Rajesh Verma", 8, "Electrical conduit 1st floor"]] },
    { date: "2024-08-29", summary: "2nd floor slab cast — 1200 sqft. Blockwork 1st floor started.", pct: 48, weather: "Sunny, 30°C", blockers: null, tomorrow: "Continue blockwork, start plastering 1st floor", status: "SUBMITTED" as const, workType: "Masonry", materials: [["CEM-OPC53", 60], ["AGG-20MM", 28], ["BLK-AAC100", 450], ["CEM-PPC", 40]], labour: [["Suresh Kale", 9, "Slab cast"], ["Sachin Patil", 8, "Blockwork 1st floor"]] },
    { date: "2024-09-02", summary: "Blockwork 1st floor 70% complete. Plumbing rough-in 1st floor started.", pct: 52, weather: "Cloudy, 28°C", blockers: "Plumbing material delayed by 1 day", tomorrow: "Complete blockwork, continue plumbing", status: "APPROVED" as const, workType: "Masonry", materials: [["BLK-AAC100", 600], ["CEM-PPC", 55], ["PLB-PIPE4", 80]], labour: [["Sachin Patil", 9, "Blockwork"], ["Imran Khan", 8, "Plumbing rough-in"]] },
    { date: "2024-09-04", summary: "Blockwork 1st floor complete. Painting prep — putty application started.", pct: 55, weather: "Sunny, 31°C", blockers: null, tomorrow: "Continue putty, start electrical 2nd floor", status: "SUB_ADMIN_APPROVED" as const, workType: "Finishing", materials: [["PNT-PUTTY", 25], ["SND-M", 200]], labour: [["Akash Jadhav", 9, "Putty application"], ["Nitin Pawar", 7, "Door frame fixing"]] },
    { date: "2024-09-06", summary: "Putty GF + 1st floor 50%. Flooring A-101 started — vitrified tiles.", pct: 58, weather: "Sunny, 32°C", blockers: "Tile adhesive stock low — ordered", tomorrow: "Continue flooring, receive adhesive", status: "SUBMITTED" as const, workType: "Finishing", materials: [["PNT-PUTTY", 30], ["FLR-VITRIFIED", 250], ["ADH-TILE", 15]], labour: [["Akash Jadhav", 9, "Putty"], ["Manoj Shinde", 8, "Tile laying A-101"]] },
    { date: "2024-09-09", summary: "Flooring A-101 complete. Door installation started. Electrical 2nd floor ongoing.", pct: 62, weather: "Rainy, 26°C", blockers: "Heavy rain — outdoor work halted after 3pm", tomorrow: "Continue doors + electrical, start painting", status: "APPROVED" as const, workType: "Finishing", materials: [["DR-WOODEN", 4], ["HDW-HINGE4", 24], ["ELC-WIRE25", 300], ["ELC-SWITCH", 80]], labour: [["Nitin Pawar", 9, "Door installation"], ["Rajesh Verma", 8, "Electrical 2nd floor"]] },
  ];
  for (const d of bulkDprDefs) {
    const dpr = await prisma.dailyProgressReport.create({
      data: {
        companyId: company.id,
        projectId: project1.id,
        date: new Date(d.date),
        submittedById: U.supervisor,
        weather: d.weather,
        workSummary: d.summary,
        progressPct: new Decimal(d.pct),
        blockers: d.blockers,
        tomorrowPlan: d.tomorrow,
        approvalStatus: d.status,
        subAdminApprovedById: d.status === "SUB_ADMIN_APPROVED" || d.status === "APPROVED" ? U.manager : null,
        subAdminApprovedAt: d.status === "SUB_ADMIN_APPROVED" || d.status === "APPROVED" ? new Date(d.date) : null,
        adminApprovedById: d.status === "APPROVED" ? U.admin : null,
        adminApprovedAt: d.status === "APPROVED" ? new Date(d.date) : null,
        workType: d.workType,
      },
    });
    for (const m of d.materials) {
      const matKey = m[0] as string;
      await prisma.dPRMaterialLine.create({ data: { dprId: dpr.id, materialId: matMap[matKey], qty: new Decimal(m[1]), unitCost: new Decimal(0) } });
    }
    for (const l of d.labour) {
      const empId = empMap[l[0] as string];
      if (empId) {
        await prisma.dPRLaborLine.create({ data: { dprId: dpr.id, employeeId: empId, hoursWorked: new Decimal(l[1]), taskDescription: l[2] as string } });
      }
    }
  }

  // ── B15. Additional attendance (10 more days × all employees) ──
  const bulkAttendanceDates: Date[] = [];
  for (let day = 19; day <= 30; day++) {
    bulkAttendanceDates.push(new Date(`2024-08-${String(day).padStart(2, "0")}`));
  }
  for (let day = 2; day <= 10; day++) {
    bulkAttendanceDates.push(new Date(`2024-09-${String(day).padStart(2, "0")}`));
  }
  const allEmpNames = Object.keys(empMap);
  for (let di = 0; di < bulkAttendanceDates.length; di++) {
    const date = bulkAttendanceDates[di];
    for (let ei = 0; ei < allEmpNames.length; ei++) {
      const name = allEmpNames[ei];
      // Skip if already has attendance for this date (original 7 emps on Aug 12-16)
      if (di < 5 && ei < 7) continue;
      let status: "PRESENT" | "LATE" | "ABSENT" | "PAID_LEAVE" | "HALF_DAY" | "OVERTIME" = "PRESENT";
      if ((ei + di) % 11 === 0) status = "LATE";
      else if ((ei + di) % 17 === 0) status = "ABSENT";
      else if ((ei + di) % 13 === 0) status = "PAID_LEAVE";
      else if ((ei + di) % 7 === 0) status = "HALF_DAY";
      else if ((ei + di) % 19 === 0) status = "OVERTIME";

      const checkIn = status === "ABSENT" || status === "PAID_LEAVE" ? null : new Date(`${date.toISOString().split("T")[0]}T09:${status === "LATE" ? "30" : "00"}:00`);
      const checkOut = status === "ABSENT" || status === "PAID_LEAVE" ? null : new Date(`${date.toISOString().split("T")[0]}T${status === "OVERTIME" ? "19" : "18"}:00:00`);
      const hours = status === "ABSENT" || status === "PAID_LEAVE" ? null : status === "OVERTIME" ? 10 : status === "HALF_DAY" ? 4 : status === "LATE" ? 7.5 : 9;

      await prisma.workerAttendance.create({
        data: {
          companyId: company.id,
          employeeId: empMap[name],
          date,
          projectId: project1.id,
          checkIn,
          checkOut,
          hoursWorked: hours ? new Decimal(hours) : null,
          status,
          recordedById: U.supervisor,
        },
      });
    }
  }

  // ── B16. Additional payroll period (Sep 2024) ───────────────
  const payrollPeriod2 = await prisma.payrollPeriod.create({
    data: {
      companyId: company.id,
      month: 9,
      year: 2024,
      startDate: new Date("2024-09-01"),
      endDate: new Date("2024-09-30"),
      status: "DRAFT",
      processedById: U.accountant,
    },
  });
  // Don't process lines for draft — just create the period so the list has 2 periods

  // ── B17. Additional project costs (10 more) ─────────────────
  const bulkProjectCosts = [
    { projectId: project1.id, costType: "LABOUR" as const, amount: 1800000, date: new Date("2024-07-31"), vendor: "Sai Labour Contractors", notes: "Tower A slab labour — July" },
    { projectId: project1.id, costType: "LABOUR" as const, amount: 2100000, date: new Date("2024-08-31"), vendor: "Sai Labour Contractors", notes: "Tower A slab + blockwork — August" },
    { projectId: project1.id, costType: "OVERHEAD" as const, amount: 850000, date: new Date("2024-07-15"), notes: "Site office + security Q3" },
    { projectId: project1.id, costType: "EQUIPMENT" as const, amount: 180000, date: new Date("2024-07-20"), notes: "JCB + mixer diesel + operator" },
    { projectId: project1.id, costType: "CONTRACTOR" as const, amount: 520000, date: new Date("2024-08-10"), subcontractorId: subMap["Marathon Masonry"], notes: "Blockwork Tower A floors 1-2" },
    { projectId: project1.id, costType: "CONTRACTOR" as const, amount: 420000, date: new Date("2024-08-25"), subcontractorId: subMap["Apex Painters"], notes: "Primer + putty Tower A GF" },
    { projectId: project2.id, costType: "LABOUR" as const, amount: 1500000, date: new Date("2024-07-15"), vendor: "Hillview Labour Co", notes: "Block 1 foundation labour" },
    { projectId: project2.id, costType: "EQUIPMENT" as const, amount: 220000, date: new Date("2024-07-20"), notes: "Excavator + compactor charges" },
    { projectId: project2.id, costType: "CONTRACTOR" as const, amount: 680000, date: new Date("2024-08-05"), notes: "Waterproofing subcontract" },
    { projectId: project2.id, costType: "PERMIT" as const, amount: 350000, date: new Date("2024-08-15"), vendor: "PMC", notes: "Additional environmental clearance" },
  ];
  await prisma.projectCost.createMany({ data: bulkProjectCosts });

  // ── B18. Additional expenses (10 more) ──────────────────────
  const bulkExpenses = [
    { companyId: company.id, category: "Office Rent", amount: 85000, date: new Date("2024-07-01"), notes: "Monthly office rent — July" },
    { companyId: company.id, category: "Office Rent", amount: 85000, date: new Date("2024-08-01"), notes: "Monthly office rent — August" },
    { companyId: company.id, category: "Utilities", amount: 24000, date: new Date("2024-07-05"), notes: "Electricity + internet — July" },
    { companyId: company.id, category: "Utilities", amount: 26000, date: new Date("2024-08-05"), notes: "Electricity + internet — August" },
    { companyId: company.id, projectId: project1.id, category: "Travel", amount: 18000, date: new Date("2024-07-12"), notes: "Site visits + client meetings" },
    { companyId: company.id, projectId: project1.id, category: "Consultancy", amount: 85000, date: new Date("2024-08-10"), notes: "Structural consultant — slab design review" },
    { companyId: company.id, projectId: project2.id, category: "Travel", amount: 12000, date: new Date("2024-07-18"), notes: "Hillview site visits" },
    { companyId: company.id, category: "Office Supplies", amount: 9500, date: new Date("2024-07-18"), notes: "Stationery + printing Q3" },
    { companyId: company.id, category: "Marketing", amount: 45000, date: new Date("2024-08-01"), notes: "Brochure printing + digital ads" },
    { companyId: company.id, category: "Insurance", amount: 120000, date: new Date("2024-08-15"), notes: "Project insurance premium — annual" },
  ];
  await prisma.expense.createMany({ data: bulkExpenses });

  // ── B19. Additional asset sales (5 more — mix of unit + land) ──
  // Sell a few more units in Greenfield to have more sales data
  const bulkSaleDefs = [
    { unit: "A-102", customer: "Priya Deshpande", price: 21000000, mode: "Home Loan (HDFC)", notes: "Booking + 1 installment", payments: [2100000, 4000000] },
    { unit: "A-202", customer: "Sunil Joshi", price: 21000000, mode: "Bank Transfer", notes: "Full payment", payments: [21000000] },
    { unit: "A-301", customer: "Suresh Kulkarni", price: 15000000, mode: "Home Loan (SBI)", notes: "Booking amount only", payments: [1500000] },
    { unit: "A-401", customer: "Rohit Patil", price: 15000000, mode: "Home Loan (ICICI)", notes: "Booking + 2 installments", payments: [1500000, 3000000] },
  ];
  for (const s of bulkSaleDefs) {
    const unit = await prisma.builtUnit.findFirst({ where: { projectId: project1.id, unitNumber: s.unit } });
    if (!unit || unit.status === "SOLD") continue;
    const sale = await sellAsset({
      assetType: "BUILT_UNIT",
      builtUnitId: unit.id,
      customerId: customerMap[s.customer],
      companyId: company.id,
      salePrice: s.price,
      paymentMode: s.mode,
      notes: s.notes,
    });
    for (const amt of s.payments) {
      await recordPayment({ assetSaleId: sale.id, amount: amt, mode: "RTGS", reference: `UTR-${s.unit}-${amt}` });
    }
  }

  // ── B20. Additional audit logs (15 more) ────────────────────
  const bulkAuditLogs = [
    { userId: U.supervisor, action: "ISSUE", entityType: "MaterialIssue", entityId: "Tower A blockwork", after: { project: "Greenfield Residency" } as any, timestamp: new Date("2024-07-05") },
    { userId: U.supervisor, action: "ISSUE", entityType: "MaterialIssue", entityId: "Tower A flooring", after: { project: "Greenfield Residency" } as any, timestamp: new Date("2024-07-10") },
    { userId: U.supervisor, action: "ISSUE", entityType: "MaterialIssue", entityId: "Tower A electrical", after: { project: "Greenfield Residency" } as any, timestamp: new Date("2024-07-15") },
    { userId: U.manager, action: "CREATE", entityType: "StockTransfer", entityId: "Transfer 10mm to site", after: { status: "COMPLETED" } as any, timestamp: new Date("2024-07-05") },
    { userId: U.manager, action: "CREATE", entityType: "StockTransfer", entityId: "Transfer tiles to site", after: { status: "COMPLETED" } as any, timestamp: new Date("2024-07-18") },
    { userId: U.supervisor, action: "COUNT", entityType: "StockCount", entityId: "Warehouse July count", after: { status: "COUNTED" } as any, timestamp: new Date("2024-07-15") },
    { userId: U.supervisor, action: "COUNT", entityType: "StockCount", entityId: "Site yard count", after: { status: "COUNTED" } as any, timestamp: new Date("2024-07-20") },
    { userId: U.accountant, action: "CREATE", entityType: "Expense", entityId: "Office rent July", after: { amount: 85000 } as any, timestamp: new Date("2024-07-01") },
    { userId: U.accountant, action: "CREATE", entityType: "Expense", entityId: "Project insurance", after: { amount: 120000 } as any, timestamp: new Date("2024-08-15") },
    { userId: U.sales, action: "CREATE", entityType: "AssetSale", entityId: "A-102 sale", after: { saleNumber: "A-102", assetType: "BUILT_UNIT" } as any, timestamp: new Date("2024-07-20") },
    { userId: U.sales, action: "CREATE", entityType: "AssetSale", entityId: "A-201 sale", after: { saleNumber: "A-201", assetType: "BUILT_UNIT" } as any, timestamp: new Date("2024-08-01") },
    { userId: U.manager, action: "CREATE", entityType: "ProjectCost", entityId: "Tower A slab labour July", after: { amount: 1800000 } as any, timestamp: new Date("2024-07-31") },
    { userId: U.manager, action: "CREATE", entityType: "ProjectCost", entityId: "Tower A blockwork contractor", after: { amount: 520000 } as any, timestamp: new Date("2024-08-10") },
    { userId: U.supervisor, action: "CREATE", entityType: "DailyProgressReport", entityId: "DPR 2024-08-19", after: { status: "SUBMITTED" } as any, timestamp: new Date("2024-08-19") },
    { userId: U.manager, action: "APPROVE", entityType: "DailyProgressReport", entityId: "DPR 2024-08-19", after: { status: "APPROVED" } as any, timestamp: new Date("2024-08-20") },
  ];
  await prisma.auditLog.createMany({ data: bulkAuditLogs });

  // ── B21. Material sales (5 — sell excess stock to walk-in customers) ──
  const bulkMaterialSales = [
    { customer: "Lakshmi Enterprises", lines: [["CEM-PPC", 50, 350, 28]], loc: "warehouse", notes: "Walk-in cement sale", vehicle: "MH12 AB 1234" },
    { customer: "Sharma Construction Co", lines: [["STL-TMT08", 500, 85, 18], ["STL-TMT10", 500, 83, 18]], loc: "warehouse", notes: "Steel sale to local contractor", vehicle: "MH14 CD 5678" },
    { customer: "Sai Krupa Enterprises", lines: [["SND-M", 200, 42, 5], ["AGG-10MM", 150, 60, 5]], loc: "warehouse", notes: "Sand + aggregate sale", vehicle: "MH12 EF 9012" },
    { customer: "Maheshwari Traders", lines: [["PNT-EMULSION", 20, 190, 18], ["PNT-PUTTY", 10, 880, 18]], loc: "warehouse", notes: "Paint sale", vehicle: "MH14 GH 3456" },
    { customer: "Kumar Infra Projects", lines: [["ELC-WIRE25", 300, 20, 18], ["ELC-CONDUIT", 100, 34, 18]], loc: "warehouse", notes: "Electrical materials sale", vehicle: "MH12 IJ 7890" },
  ];
  for (const ms of bulkMaterialSales) {
    try {
      const sale = await createMaterialSale({
        companyId: company.id,
        customerId: customerMap[ms.customer],
        lines: ms.lines.map(([code, qty, price, gst]) => ({ materialId: matMap[code as string], locationId: locMap[ms.loc], qty: qty as number, unitPrice: price as number, gstRate: gst as number })),
        paymentMode: "Cash",
        vehicleNumber: ms.vehicle,
        notes: ms.notes,
        userId: U.sales,
      });
      // Record a payment for each
      await createMaterialSalePayment({ saleId: sale.id, companyId: company.id, amount: sale.totalAmount, paymentMode: "Cash", userId: U.sales });
    } catch (e) {
      // Skip if insufficient stock — not fatal
      console.log(`  Skipping material sale to ${ms.customer}: ${(e as Error).message}`);
    }
  }

  // ── B22. Scrap generations (3 — steel + wood scrap from site) ──
  const bulkScraps = [
    { loc: "site1", notes: "Steel cut-piece scrap from Tower A slab reinforcement", lines: [["SCR-STEEL", 150, 35]] },
    { loc: "site1", notes: "Wood scrap from formwork dismantling", lines: [["SCR-WOOD", 8, 200]] },
    { loc: "site2", notes: "Steel scrap from Hillview column fabrication", lines: [["SCR-STEEL", 80, 35]] },
  ];
  for (const sg of bulkScraps) {
    try {
      await createScrapGeneration({
        companyId: company.id,
        toLocationId: locMap[sg.loc],
        projectId: sg.loc === "site1" ? project1.id : project2.id,
        notes: sg.notes,
        createdById: U.supervisor,
        lines: sg.lines.map(([code, qty, cost]) => ({ materialId: matMap[code as string], qty: qty as number, unitCost: cost as number })),
      });
    } catch (e) {
      console.log(`  Skipping scrap generation: ${(e as Error).message}`);
    }
  }

  // ── B23. Additional brokers (3 more) ────────────────────────
  const bulkBrokers = [
    { name: "Shree Properties", phone: "+91 98220 77003", agency: "Shree Real Estate", commission: 2.5 },
    { name: "Metro Realty Advisors", phone: "+91 98220 77004", agency: "Metro Property Solutions", commission: 1.8 },
    { name: "Pune Property Connect", phone: "+91 98220 77005", agency: "PPC Real Estate", commission: 2.0 },
  ];
  for (const b of bulkBrokers) {
    await ensure("broker", { companyId: company.id, name: b.name }, {
      companyId: company.id,
      name: b.name,
      phone: b.phone,
      agency: b.agency,
      defaultCommissionPercent: new Decimal(b.commission),
      createdById: U.sales,
    });
  }

  // ── B24. Additional tenancy (1 more — shop S-01 rented) ─────
  // Wait — S-01 is already sold. Let's rent a different available shop.
  // Actually S-02 is rented. Let's create a new shop unit and rent it.
  // Instead, let's rent an available unit in Hillview.
  const hillviewUnit = await prisma.builtUnit.findFirst({ where: { projectId: project2.id, status: "UNDER_CONSTRUCTION" } });
  if (hillviewUnit) {
    await prisma.tenancy.create({
      data: {
        companyId: company.id,
        assetType: "BUILT_UNIT",
        builtUnitId: hillviewUnit.id,
        projectId: project2.id,
        tenantName: "Cafe Coffee Day",
        tenantPhone: "+91 98220 66010",
        tenantEmail: "operations@ccd.in",
        startDate: new Date("2024-08-01"),
        endDate: new Date("2027-07-31"),
        monthlyRent: new Decimal(45000),
        baseRent: new Decimal(45000),
        securityDeposit: new Decimal(200000),
        rentAgreementNo: "RA-2024-002",
        sacCode: "997212",
        escalationPercent: new Decimal(5),
        escalationIntervalMonths: 12,
        nextEscalationDate: new Date("2025-08-01"),
        rentFreeDays: 30,
        status: "ACTIVE",
        notes: "Ground floor commercial space at Hillview",
        createdById: U.sales,
      },
    });
  }

  // ── B25. Additional vendor quotes (3 more against bulk requisitions) ──
  const bulkReqForQuotes = await prisma.materialRequisition.findFirst({ where: { reqNumber: "REQ-2024-0012" } });
  if (bulkReqForQuotes) {
    const tileQuotes = [
      { supplier: "Kajaria Tiles Depot", lines: [{ material: "FLR-VITRIFIED", qty: 600, unitPrice: 215 }, { material: "ADH-TILE", qty: 40, unitPrice: 470 }], validUntil: new Date("2024-07-15") },
      { supplier: "Asian Paints Depot", lines: [{ material: "FLR-VITRIFIED", qty: 600, unitPrice: 220 }, { material: "ADH-TILE", qty: 40, unitPrice: 460 }], validUntil: new Date("2024-07-12") },
      { supplier: "Maha Lakshmi Hardware", lines: [{ material: "FLR-VITRIFIED", qty: 600, unitPrice: 210 }, { material: "ADH-TILE", qty: 40, unitPrice: 480 }], validUntil: new Date("2024-07-10") },
    ];
    for (const qd of tileQuotes) {
      const lineFields = qd.lines.map((l) => computeQuoteLineFields(l.qty, l.unitPrice));
      const subtotal = lineFields.reduce((s, f) => s + f.lineSubtotal, 0);
      const gstTotal = lineFields.reduce((s, f) => s + f.gstAmount, 0);
      const landedTotal = subtotal + gstTotal;
      const vq = await prisma.vendorQuote.create({
        data: {
          requisitionId: bulkReqForQuotes.id,
          supplierId: supplierMap[qd.supplier],
          fileUrl: `/uploads/quotes/quote-tiles-${qd.supplier.replace(/[^a-zA-Z]/g, "")}.pdf`,
          fileName: `Quote-Tiles-${qd.supplier.replace(/\s+/g, "-")}.pdf`,
          mimeType: "application/pdf",
          landedTotal: new Decimal(landedTotal),
          subtotal: new Decimal(subtotal),
          gstTotal: new Decimal(gstTotal),
          validUntil: qd.validUntil,
          submittedById: U.manager,
          notes: `Tile quote from ${qd.supplier}`,
          status: "PENDING",
          lines: {
            create: qd.lines.map((l, i) => ({
              materialId: matMap[l.material],
              qty: new Decimal(l.qty),
              unitPrice: new Decimal(l.unitPrice),
              gstRate: new Decimal(lineFields[i].gstRate),
              gstAmount: new Decimal(lineFields[i].gstAmount),
              taxableValue: new Decimal(lineFields[i].taxableValue),
              lineSubtotal: new Decimal(lineFields[i].lineSubtotal),
              unitLandedCost: new Decimal(lineFields[i].unitLandedCost),
              lineTotal: new Decimal(lineFields[i].lineTotal),
            })),
          },
        },
      });
      // Kajaria is cheapest: 600×215 + 40×470 = 129000+18800 = 147800
      // Maha Lakshmi: 600×210 + 40×480 = 126000+19200 = 145200 (actually cheaper!)
      // Asian: 600×220 + 40×460 = 132000+18400 = 150400
      if (qd.supplier === "Maha Lakshmi Hardware") {
        await prisma.vendorQuote.update({ where: { id: vq.id }, data: { isCheapest: true } });
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // MEGA BULK — 10x volume for stress-testing lists, pagination, filters
  // Procedurally generates large volumes of realistic data using a
  // seeded PRNG (deterministic — same output every run).
  // ═══════════════════════════════════════════════════════════════
  console.log("Seeding mega bulk data (10x volume)…");

  // Seeded PRNG (mulberry32) — deterministic so re-runs produce the same data
  function mulberry32(seed: number) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rng = mulberry32(42);
  const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
  const randInt = (min: number, max: number) => Math.floor(rng() * (max - min + 1)) + min;
  const randDate = (start: Date, end: Date) => new Date(start.getTime() + rng() * (end.getTime() - start.getTime()));

  // Helper: bulk ensure via createMany (fetch existing, create missing, return all)
  async function bulkEnsure(model: string, whereField: string, items: Record<string, unknown>[]) {
    const keys = items.map((i) => i[whereField]);
    const existing = await (prisma as any)[model].findMany({ where: { [whereField]: { in: keys } } });
    const existingKeys = new Set(existing.map((e: any) => e[whereField]));
    const toCreate = items.filter((i) => !existingKeys.has(i[whereField]));
    if (toCreate.length > 0) await (prisma as any)[model].createMany({ data: toCreate });
    return await (prisma as any)[model].findMany({ where: { [whereField]: { in: keys } } });
  }

  // Collect existing IDs for procedural data references
  const allCompanies = await prisma.company.findMany({ where: { deletedAt: null } });
  const allCompanyIds = allCompanies.map((c) => c.id);
  const allWarehouses = await prisma.stockLocation.findMany({ where: { type: "COMPANY_WAREHOUSE", deletedAt: null } });
  const allWarehouseIds = allWarehouses.map((w) => w.id);
  const allCategoryIds = Object.values(catMap);
  const allMaterialCodes = Object.keys(matMap);
  const allSupplierNames = Object.keys(supplierMap);
  const allCustomerNames = Object.keys(customerMap);

  // Data pools for procedural generation
  const firstNames = ["Amit", "Suresh", "Rajesh", "Vijay", "Prakash", "Deepak", "Ramesh", "Sanjay", "Ajay", "Vinod", "Nilesh", "Sachin", "Rohit", "Karan", "Akash", "Manoj", "Pravin", "Tushar", "Imran", "Fahim", "Arjun", "Aditya", "Sandeep", "Ganesh", "Umesh", "Rakesh", "Dinesh", "Mahesh", "Kamlesh", "Naresh"];
  const lastNames = ["Patil", "Sharma", "Deshmukh", "Kulkarni", "Jadhav", "Shinde", "More", "Gaikwad", "Pawar", "Kale", "Verma", "Nair", "Mehta", "Reddy", "Bose", "Kapoor", "Singh", "Agarwal", "Shah", "Joshi", "Deshpande", "Naidu", "Rao", "Iyer", "Menon", "Pillai", "Gupta", "Malhotra", "Chopra", "Banerjee"];
  const companySuffixes = ["Enterprises", "Traders", "Constructions", "Infra Projects", "Builders", "Suppliers", "Distributors", "Wholesale", "Agency", "Mart", "Depot", "Works", "Industries", "Corp", "Solutions"];
  const projectPrefixes = ["Greenfield", "Hillview", "Skyline", "Riverside", "Lakeview", "Sunrise", "Pinnacle", "Prestige", "Royal", "Imperial", "Brigade", "Sobha", "Lodha", "DLF", "Embassy", "Puravankara", "Oberoi", "Kalpataru", "Runwal", "Hiranandani", "Mahindra", "Shapoorji", "Godrej", "Adani", "Tata"];
  const projectSuffixes = ["Residency", "Heights", "Towers", "Park", "Villas", "Apartments", "Corporate Park", "Greens", "Gardens", "Plaza", "Square", "City", "Township", "Enclave", "Ridge", "Valley", "Meadows", "Springs"];
  const trades = ["Masonry", "Electrical", "Plumbing", "Welding", "Carpentry", "Painting", "Bar Bending", "Supervisor", "Heavy Equipment", "Surveying", "Tile Laying", "Waterproofing", "HVAC", "Glass Fitting", "Demolition"];
  const projectTypes = ["RESIDENTIAL", "COMMERCIAL", "RESIDENTIAL", "RESIDENTIAL", "COMMERCIAL"];
  const projectStatuses = ["ACTIVE", "ACTIVE", "ACTIVE", "PLANNED", "COMPLETED"];
  const unitTypes = ["BHK_2", "BHK_3", "BHK_3", "BHK_4", "SHOP"];
  const unitStatuses = ["AVAILABLE", "UNDER_CONSTRUCTION", "PLANNED", "SOLD", "RENTED"];
  const costTypes = ["LABOUR", "OVERHEAD", "PERMIT", "CONTRACTOR", "EQUIPMENT", "MATERIAL"];
  const expenseCats = ["Office Rent", "Utilities", "Travel", "Consultancy", "Office Supplies", "Marketing", "Insurance", "Fuel", "Maintenance", "Miscellaneous"];
  const poStatuses = ["DRAFT", "ORDERED", "PARTIAL", "RECEIVED"];
  const dprWorkTypes = ["Foundation", "RCC", "Masonry", "Finishing", "Plumbing", "Electrical", "Painting", "Flooring", "Waterproofing"];
  const dprApprovalStatuses = ["SUBMITTED", "SUB_ADMIN_APPROVED", "APPROVED"];
  const attendanceStatuses = ["PRESENT", "PRESENT", "PRESENT", "PRESENT", "LATE", "ABSENT", "PAID_LEAVE", "HALF_DAY", "OVERTIME"];
  const equipCats = ["Heavy Machinery", "Vehicle", "Power Tool", "Scaffolding", "Equipment"];
  const equipNames = ["Excavator", "Backhoe Loader", "Concrete Mixer", "Tower Crane", "Batching Plant", "Road Roller", "Asphalt Paver", "Soil Compactor", "Generator", "Welding Machine", "Bar Bending Machine", "Bar Cutting Machine", "Plate Compactor", "Tipper Truck", "Water Tanker", "Pickup Truck", "Vibrator", "Scaffolding Set", "CNC Router", "Laser Cutter"];

  // ── MB1. Procedural materials (~576 more for ~640 total) ─────
  console.log("  MB1: Materials (576)…");
  const matCatEntries = Object.entries(catMap);
  const newMats: Record<string, unknown>[] = [];
  for (let i = 1; i <= 576; i++) {
    const [catName, catId] = matCatEntries[randInt(0, matCatEntries.length - 1)];
    newMats.push({
      code: `GEN-${String(i).padStart(4, "0")}`,
      name: `${catName} Item ${i}`,
      categoryId: catId,
      unit: pick(["KG", "NOS", "MTR", "BAG", "CFT", "SQM", "LTR", "SET"]),
      standardCost: randInt(20, 5000),
      gstRate: pick([5, 12, 18, 28]),
      minStock: randInt(10, 5000),
      reorderPoint: randInt(50, 10000),
      economicOrderQty: randInt(100, 20000),
      hsnCode: String(randInt(10000000, 99999999)),
    });
  }
  const newMatRows = await bulkEnsure("material", "code", newMats);
  for (const r of newMatRows) matMap[r.code] = r.id;
  const allMatCodesNow = Object.keys(matMap);

  // ── MB2. Procedural suppliers (~423 more for ~470 total) ─────
  console.log("  MB2: Suppliers (423)…");
  const newSupps: Record<string, unknown>[] = [];
  const usedSuppNames = new Set(allSupplierNames);
  let sIdx = 0;
  while (newSupps.length < 423) {
    const name = `${firstNames[sIdx % firstNames.length]} ${lastNames[(sIdx * 7) % lastNames.length]} ${pick(companySuffixes)}`;
    sIdx++;
    if (usedSuppNames.has(name)) continue;
    usedSuppNames.add(name);
    newSupps.push({
      name, companyId: company.id,
      gstin: `27${String.fromCharCode(65 + randInt(0, 25))}${String.fromCharCode(65 + randInt(0, 25))}${randInt(1000, 9999)}${String.fromCharCode(65 + randInt(0, 25))}1Z${randInt(1, 9)}`,
      phone: `+91 9822${randInt(100000, 999999)}`,
      address: `${pick(["Bhosari", "Chakan", "Wagholi", "Baner", "Pimpri", "Talegaan", "Hadapsar", "Kharadi", "Nigdi", "Market Yard"])}, Pune`,
      leadTimeDays: randInt(1, 14),
    });
  }
  const newSuppRows = await bulkEnsure("supplier", "name", newSupps);
  for (const r of newSuppRows) supplierMap[r.name] = r.id;
  const allSuppNamesNow = Object.keys(supplierMap);

  // ── MB3. Procedural customers (~315 more for ~350 total) ─────
  console.log("  MB3: Customers (315)…");
  const newCusts: Record<string, unknown>[] = [];
  const usedCustNames = new Set(allCustomerNames);
  let cIdx = 0;
  while (newCusts.length < 315) {
    const isBiz = rng() < 0.3;
    const name = isBiz
      ? `${firstNames[cIdx % firstNames.length]} ${pick(companySuffixes)}`
      : `${firstNames[cIdx % firstNames.length]} ${lastNames[(cIdx * 11) % lastNames.length]}`;
    cIdx++;
    if (usedCustNames.has(name)) continue;
    usedCustNames.add(name);
    newCusts.push({
      name, companyId: company.id,
      phone: `+91 98${randInt(10000000, 99999999)}`,
      email: `${name.toLowerCase().replace(/[^a-z]/g, ".")}@gmail.com`,
      address: `${pick(["Kothrud", "Baner", "Aundh", "Viman Nagar", "Kharadi", "Hadapsar", "Wagholi", "Shivajinagar", "Camp", "Model Colony"])}, Pune`,
      ...(isBiz ? { gstin: `27${String.fromCharCode(65 + randInt(0, 25))}${String.fromCharCode(65 + randInt(0, 25))}${randInt(1000, 9999)}${String.fromCharCode(65 + randInt(0, 25))}1Z${randInt(1, 9)}` } : {}),
    });
  }
  const newCustRows = await bulkEnsure("customer", "name", newCusts);
  for (const r of newCustRows) customerMap[r.name] = r.id;
  const allCustNamesNow = Object.keys(customerMap);

  // ── MB4. Procedural employees (~270 more for ~300 total) ─────
  console.log("  MB4: Employees (270)…");
  const newEmps: Record<string, unknown>[] = [];
  const usedEmpNames = new Set(Object.keys(empMap));
  let eIdx = 0;
  const compIdsForEmp = [company.id, ...Object.values(childCompanyMap)];
  while (newEmps.length < 270) {
    const name = `${firstNames[eIdx % firstNames.length]} ${lastNames[(eIdx * 13) % lastNames.length]}`;
    eIdx++;
    if (usedEmpNames.has(name)) continue;
    usedEmpNames.add(name);
    newEmps.push({
      name, companyId: pick(compIdsForEmp),
      trade: pick(trades), phone: `+91 9822${randInt(100000, 999999)}`, dailyRate: randInt(600, 1800),
    });
  }
  const newEmpRows = await bulkEnsure("employee", "name", newEmps);
  for (const r of newEmpRows) empMap[r.name] = r.id;
  const allEmpIds = Object.values(empMap);
  const companyEmpIds = (await prisma.employee.findMany({ where: { companyId: company.id }, select: { id: true } })).map((e) => e.id);

  // ── MB5. Projects + phases + locations (~72 more for ~80 total)
  console.log("  MB5: Projects + phases + locations (72)…");
  const newProjDefs: { name: string; companyId: string; type: string; status: string; budget: number; address: string; startDate: Date }[] = [];
  const usedProjNames = new Set<string>();
  while (newProjDefs.length < 72) {
    const name = `${pick(projectPrefixes)} ${pick(projectSuffixes)}`;
    if (usedProjNames.has(name)) continue;
    usedProjNames.add(name);
    const compId = pick(allCompanyIds);
    newProjDefs.push({
      name, companyId: compId,
      type: pick(projectTypes), status: pick(projectStatuses),
      budget: randInt(20000000, 500000000),
      address: `${pick(["Wagholi", "Baner", "Hinjewadi", "Kharadi", "Wakad", "Hadapsar", "Talegaon", "Chakan", "Ravet", "Pimpri"])}, Pune`,
      startDate: randDate(new Date("2023-01-01"), new Date("2024-12-01")),
    });
  }
  const newProjMap: Record<string, string> = {};
  for (const p of newProjDefs) {
    const row = await ensure("project", { companyId: p.companyId, name: p.name }, p);
    newProjMap[p.name] = row.id;
  }
  const allProjectIds = [project1.id, project2.id, realtyProj1.id, realtyProj2.id, infraProj1.id, infraProj2.id, interiorsProj1.id, interiorsProj2.id, ...Object.values(newProjMap)];

  // Phases (1-2 per new project)
  const newPhaseMap: Record<string, string> = {};
  for (const [projName, projId] of Object.entries(newProjMap)) {
    const phaseCount = randInt(1, 2);
    for (let pi = 1; pi <= phaseCount; pi++) {
      const row = await ensure("projectPhase", { projectId: projId, name: `Phase ${pi}` }, {
        projectId: projId, name: `Phase ${pi}`, status: pick(["ACTIVE", "PLANNED", "COMPLETED"]) as any,
        budget: randInt(5000000, 100000000), sortOrder: pi,
      });
      newPhaseMap[`${projName}:Phase ${pi}`] = row.id;
    }
  }

  // Project site locations (1 per new project)
  const newLocMap: Record<string, string> = {};
  for (const [projName, projId] of Object.entries(newProjMap)) {
    const compId = newProjDefs.find((p) => p.name === projName)!.companyId;
    const row = await ensure("stockLocation", { companyId: compId, projectId: projId, name: `${projName} Site` }, {
      companyId: compId, type: "PROJECT_SITE", projectId: projId, name: `${projName} Site`,
    });
    newLocMap[projName] = row.id;
  }
  const allSiteLocIds = Object.values(newLocMap);

  // ── MB6. Built units (~540 more for ~600 total) ──────────────
  console.log("  MB6: Built units (540+)…");
  const newUnits: BuiltUnitCreateManyInput[] = [];
  for (const [projName, projId] of Object.entries(newProjMap)) {
    const phaseId = newPhaseMap[`${projName}:Phase 1`];
    const unitCount = randInt(4, 12);
    for (let ui = 1; ui <= unitCount; ui++) {
      const type = pick(unitTypes) as string;
      const floor = type === "SHOP" ? 0 : randInt(1, 12);
      const area = type === "SHOP" ? randInt(300, 800) : type === "BHK_4" ? randInt(1800, 2500) : type === "BHK_3" ? randInt(1200, 1600) : randInt(800, 1100);
      const status = pick(unitStatuses) as string;
      const valuation = area * randInt(8000, 20000);
      newUnits.push({
        projectId: projId, phaseId, unitType: type,
        unitNumber: `U-${String(ui).padStart(3, "0")}`, floor, area, areaUnit: "SQFT",
        status, productionCost: 0,
        askingPrice: status === "SOLD" ? null : Math.round(valuation / 100000) * 100000,
        currentValuation: valuation,
      });
    }
  }
  if (newUnits.length > 0) await prisma.builtUnit.createMany({ data: newUnits });

  // ── MB7. Opening stock for ~30% of new materials ─────────────
  console.log("  MB7: Opening stock…");
  const genMatCodes = Object.keys(matMap).filter((k) => k.startsWith("GEN-"));
  for (const code of genMatCodes) {
    if (rng() > 0.3) continue;
    const mid = matMap[code];
    const mat = newMats.find((m) => m.code === code)!;
    try {
      await withStockTransaction(async (tx) => {
        await recordMovement(tx, {
          materialId: mid, movementType: "PURCHASE_RECEIPT",
          toLocationId: pick(allWarehouseIds),
          qty: new Decimal(randInt(50, 5000)),
          unitCost: new Decimal(mat.standardCost as number),
          reason: "Mega bulk opening stock", refType: "SEED",
        });
      });
    } catch (e) { /* skip — not fatal */ }
  }

  // ── MB8. Procedural POs + goods receipts (~234 more) ─────────
  console.log("  MB8: Purchase orders (234)…");
  for (let poi = 0; poi < 234; poi++) {
    const suppName = pick(allSuppNamesNow);
    const scope = rng() < 0.5 ? "COMPANY" : "PROJECT";
    const destLoc = scope === "COMPANY" || allSiteLocIds.length === 0 ? pick(allWarehouseIds) : pick(allSiteLocIds);
    const projectId = scope === "PROJECT" ? pick(allProjectIds) : undefined;
    const lines: { materialId: string; qtyOrdered: number; unitCost: number; gstRate: number }[] = [];
    for (let li = 0; li < randInt(1, 4); li++) {
      lines.push({ materialId: matMap[pick(allMatCodesNow)], qtyOrdered: randInt(10, 5000), unitCost: randInt(20, 5000), gstRate: pick([5, 12, 18, 28]) });
    }
    try {
      const po = await createPurchaseOrder({
        supplierId: supplierMap[suppName], procurementScope: scope as any,
        companyId: company.id, projectId, destinationLocationId: destLoc,
        expectedDate: randDate(new Date("2024-01-01"), new Date("2024-12-01")),
        notes: `Mega bulk PO ${poi + 1}`, lines,
      });
      const status = pick(poStatuses);
      if (status !== "DRAFT") {
        await approvePurchaseOrder(po.id, "OWNER");
        await orderPurchaseOrder(po.id);
        if (status === "RECEIVED" || status === "PARTIAL") {
          const poLines = await prisma.purchaseOrderLine.findMany({ where: { purchaseOrderId: po.id } });
          const frac = status === "RECEIVED" ? 1 : randInt(3, 8) / 10;
          await receiveGoods({
            purchaseOrderId: po.id, locationId: destLoc, receivedById: U.supervisor,
            notes: status === "RECEIVED" ? "Full delivery" : "Partial delivery",
            lines: poLines.map((l) => ({ purchaseOrderLineId: l.id, materialId: l.materialId, qtyReceived: new Decimal(l.qtyOrdered).times(frac), unitCost: l.unitCost })),
          });
        }
      }
    } catch (e) { /* skip — not fatal */ }
  }

  // ── MB9. Procedural material issues (~117 more) ──────────────
  console.log("  MB9: Material issues (117)…");
  for (let ii = 0; ii < 117; ii++) {
    const lines: { materialId: string; qty: number }[] = [];
    for (let li = 0; li < randInt(1, 3); li++) lines.push({ materialId: matMap[pick(allMatCodesNow)], qty: randInt(5, 500) });
    try {
      await issueMaterialsToProject({
        projectId: pick([project1.id, project2.id, ...allProjectIds.filter((id) => id !== project1.id && id !== project2.id)]),
        fromLocationId: pick(allWarehouseIds), issuedById: U.supervisor,
        notes: `Mega bulk issue ${ii + 1}`, lines,
      });
    } catch (e) { /* skip if insufficient stock — not fatal */ }
  }

  // ── MB10. Procedural stock transfers (~63 more) ──────────────
  console.log("  MB10: Stock transfers (63)…");
  for (let ti = 0; ti < 63; ti++) {
    const fromLoc = pick(allWarehouseIds);
    const toLoc = allSiteLocIds.length > 0 ? pick(allSiteLocIds) : pick([site1.id, site2.id]);
    if (fromLoc === toLoc) continue;
    const matCode = pick(allMatCodesNow);
    const qty = randInt(10, 500);
    try {
      const transfer = await prisma.stockTransfer.create({
        data: {
          fromLocationId: fromLoc, toLocationId: toLoc,
          transferDate: randDate(new Date("2024-01-01"), new Date("2024-12-01")),
          status: "COMPLETED", notes: `Mega bulk transfer ${ti + 1}`,
          lines: { create: [{ materialId: matMap[matCode], qty }] },
        },
      });
      await withStockTransaction(async (tx) => {
        await recordTransfer(tx, {
          materialId: matMap[matCode], fromLocationId: fromLoc, toLocationId: toLoc,
          qty: new Decimal(qty), reason: `Mega bulk transfer ${ti + 1}`,
          refType: "STOCK_TRANSFER", refId: transfer.id, userId: U.supervisor,
        });
      });
    } catch (e) { /* skip — not fatal */ }
  }

  // ── MB11. Procedural stock counts (~36 more) ─────────────────
  console.log("  MB11: Stock counts (36)…");
  for (let sci = 0; sci < 36; sci++) {
    const locId = pick([...allWarehouseIds, site1.id, site2.id]);
    const lines: { materialId: string; countedQty: number; systemQty: number; variance: number }[] = [];
    for (let li = 0; li < randInt(2, 5); li++) {
      const system = randInt(50, 5000);
      const counted = system + randInt(-50, 50);
      lines.push({ materialId: matMap[pick(allMatCodesNow)], countedQty: counted, systemQty: system, variance: counted - system });
    }
    await prisma.stockCount.create({
      data: {
        locationId: locId, countDate: randDate(new Date("2024-01-01"), new Date("2024-12-01")),
        status: pick(["COUNTED", "RECONCILED"]) as any, notes: `Mega bulk count ${sci + 1}`,
        lines: { create: lines },
      },
    });
  }

  // ── MB12. Procedural DPRs (~117 more for ~130 total) ─────────
  console.log("  MB12: DPRs (117)…");
  for (let di = 0; di < 117; di++) {
    const date = randDate(new Date("2024-01-01"), new Date("2024-12-01"));
    const status = pick(dprApprovalStatuses) as any;
    const dpr = await prisma.dailyProgressReport.create({
      data: {
        companyId: company.id, projectId: pick(allProjectIds), date,
        submittedById: U.supervisor,
        weather: `${pick(["Sunny", "Cloudy", "Rainy", "Overcast"])}, ${randInt(20, 38)}°C`,
        workSummary: `Mega bulk DPR ${di + 1} — ${pick(dprWorkTypes)} work in progress`,
        progressPct: new Decimal(randInt(5, 95)),
        blockers: rng() < 0.3 ? pick(["Material delay", "Weather interruption", "Equipment breakdown", "Labour shortage"]) : null,
        tomorrowPlan: `Continue ${pick(dprWorkTypes).toLowerCase()} work`,
        approvalStatus: status,
        subAdminApprovedById: status !== "SUBMITTED" ? U.manager : null,
        subAdminApprovedAt: status !== "SUBMITTED" ? date : null,
        adminApprovedById: status === "APPROVED" ? U.admin : null,
        adminApprovedAt: status === "APPROVED" ? date : null,
        workType: pick(dprWorkTypes),
      },
    });
    for (let li = 0; li < randInt(1, 3); li++) {
      await prisma.dPRMaterialLine.create({ data: { dprId: dpr.id, materialId: matMap[pick(allMatCodesNow)], qty: new Decimal(randInt(5, 200)), unitCost: new Decimal(0) } });
    }
    for (let li = 0; li < randInt(1, 2); li++) {
      await prisma.dPRLaborLine.create({ data: { dprId: dpr.id, employeeId: pick(allEmpIds), hoursWorked: new Decimal(randInt(4, 10)), taskDescription: pick(dprWorkTypes) } });
    }
  }

  // ── MB13. Procedural attendance (~3500+ more rows) ───────────
  console.log("  MB13: Attendance (3500+)…");
  const attBatch: WorkerAttendanceCreateManyInput[] = [];
  const attStart = new Date("2024-06-01");
  const attEnd = new Date("2024-11-30");
  const totalAttDays = Math.floor((attEnd.getTime() - attStart.getTime()) / 86400000);
  // Use a subset of employees to keep volume reasonable (~30 emps × ~120 days ≈ 3600)
  const attEmpIds = allEmpIds.slice(0, 30);
  for (let di = 0; di < totalAttDays; di++) {
    const date = new Date(attStart.getTime() + di * 86400000);
    if (date.getDay() === 0) continue; // skip Sundays
    for (const empId of attEmpIds) {
      const status = pick(attendanceStatuses);
      const dateStr = date.toISOString().split("T")[0];
      const checkIn = status === "ABSENT" || status === "PAID_LEAVE" ? null : new Date(`${dateStr}T09:${status === "LATE" ? "30" : "00"}:00`);
      const checkOut = status === "ABSENT" || status === "PAID_LEAVE" ? null : new Date(`${dateStr}T${status === "OVERTIME" ? "19" : "18"}:00:00`);
      const hours = status === "ABSENT" || status === "PAID_LEAVE" ? null : status === "OVERTIME" ? 10 : status === "HALF_DAY" ? 4 : status === "LATE" ? 7.5 : 9;
      attBatch.push({
        companyId: company.id, employeeId: empId, date, projectId: pick(allProjectIds),
        checkIn, checkOut, hoursWorked: hours ? new Decimal(hours) : null,
        status, recordedById: U.supervisor,
      });
    }
  }
  for (let i = 0; i < attBatch.length; i += 1000) {
    await prisma.workerAttendance.createMany({ data: attBatch.slice(i, i + 1000) });
  }

  // ── MB14. Procedural payroll periods (~18 more for ~20 total) ─
  console.log("  MB14: Payroll periods (18)…");
  for (let py = 0; py < 18; py++) {
    const month = (py % 12) + 1;
    const year = 2024 + Math.floor(py / 12);
    if ((month === 8 || month === 9) && year === 2024) continue; // already seeded
    const startDate = new Date(`${year}-${String(month).padStart(2, "0")}-01`);
    const endDate = new Date(year, month, 0);
    const isProcessed = rng() < 0.5;
    const period = await prisma.payrollPeriod.create({
      data: {
        companyId: company.id, month, year, startDate, endDate,
        status: isProcessed ? "PROCESSED" : "DRAFT",
        processedById: U.accountant,
        ...(isProcessed ? { processedAt: randDate(startDate, endDate) } : {}),
      },
    });
    if (isProcessed) {
      const payLines: PayrollLineCreateManyInput[] = [];
      let tG = new Decimal(0), tN = new Decimal(0), tD = new Decimal(0);
      for (const empId of companyEmpIds) {
        const emp = await prisma.employee.findUnique({ where: { id: empId } });
        if (!emp) continue;
        const days = randInt(20, 26);
        const basic = new Decimal(emp.dailyRate || 800).mul(days);
        const allowance = new Decimal(randInt(200, 1000));
        const gross = basic.add(allowance);
        const pf = gross.mul(0.12), esi = gross.mul(0.01), pt = new Decimal(200);
        const ded = pf.add(esi).add(pt);
        const net = gross.sub(ded);
        tG = tG.add(gross); tD = tD.add(ded); tN = tN.add(net);
        payLines.push({
          payrollPeriodId: period.id, employeeId: empId, daysWorked: new Decimal(days),
          basicAmount: basic, overtimeAmount: new Decimal(0), allowance, bonus: new Decimal(0),
          pf, employerPf: pf, esi, professionTax: pt, tax: new Decimal(0), deductions: new Decimal(0),
          grossPay: gross, totalDeductions: ded, netPay: net,
        });
      }
      for (let i = 0; i < payLines.length; i += 500) {
        await prisma.payrollLine.createMany({ data: payLines.slice(i, i + 500) });
      }
      await prisma.payrollPeriod.update({ where: { id: period.id }, data: { totalGross: tG, totalOvertime: new Decimal(0), totalDeductions: tD, totalNet: tN } });
    }
  }

  // ── MB15. Procedural asset sales (~108 more for ~120 total) ──
  console.log("  MB15: Asset sales (108)…");
  const availableUnits = await prisma.builtUnit.findMany({ where: { status: "AVAILABLE" }, take: 200 });
  let saleCnt = 0;
  for (const unit of availableUnits) {
    if (saleCnt >= 108) break;
    const price = unit.askingPrice ? Number(unit.askingPrice) : unit.currentValuation ? Number(unit.currentValuation) : randInt(5000000, 50000000);
    try {
      const sale = await sellAsset({
        assetType: "BUILT_UNIT", builtUnitId: unit.id,
        customerId: customerMap[pick(allCustNamesNow)], companyId: company.id,
        salePrice: price, paymentMode: pick(["Home Loan (SBI)", "Home Loan (HDFC)", "Bank Transfer", "Cash"]),
        notes: `Mega bulk sale ${saleCnt + 1}`,
      });
      const payCount = randInt(1, 3);
      const payAmt = Math.floor(price / payCount);
      for (let pi = 0; pi < payCount; pi++) {
        await recordPayment({ assetSaleId: sale.id, amount: pi === payCount - 1 ? price - payAmt * (payCount - 1) : payAmt, mode: pick(["RTGS", "NEFT", "Cheque", "Cash"]), reference: `UTR-MB-${saleCnt}-${pi}` });
      }
      saleCnt++;
    } catch (e) { /* skip — not fatal */ }
  }

  // ── MB16. Procedural material sales (~81 more for ~90 total) ─
  console.log("  MB16: Material sales (81)…");
  let matSaleCnt = 0;
  for (let msi = 0; msi < 200 && matSaleCnt < 81; msi++) {
    try {
      const sale = await createMaterialSale({
        companyId: company.id, customerId: customerMap[pick(allCustNamesNow)],
        lines: [{ materialId: matMap[pick(allMatCodesNow)], locationId: pick(allWarehouseIds), qty: randInt(5, 200), unitPrice: randInt(30, 5000), gstRate: pick([5, 12, 18, 28]) }],
        paymentMode: pick(["Cash", "Bank Transfer", "UPI"]),
        vehicleNumber: `MH${randInt(12, 14)} ${String.fromCharCode(65 + randInt(0, 25))}${String.fromCharCode(65 + randInt(0, 25))} ${randInt(1000, 9999)}`,
        notes: `Mega bulk material sale ${matSaleCnt + 1}`, userId: U.sales,
      });
      await createMaterialSalePayment({ saleId: sale.id, companyId: company.id, amount: sale.totalAmount, paymentMode: "Cash", userId: U.sales });
      matSaleCnt++;
    } catch (e) { /* skip if insufficient stock — not fatal */ }
  }

  // ── MB17. Project costs + expenses (~279 + ~135 more) ────────
  console.log("  MB17: Project costs (279) + expenses (135)…");
  const bulkPC: ProjectCostCreateManyInput[] = [];
  for (let i = 0; i < 279; i++) {
    bulkPC.push({
      projectId: pick(allProjectIds), costType: pick(costTypes),
      amount: randInt(50000, 5000000), date: randDate(new Date("2024-01-01"), new Date("2024-12-01")),
      vendor: `${pick(firstNames)} ${pick(lastNames)}`, notes: `Mega bulk cost ${i + 1}`,
    });
  }
  await prisma.projectCost.createMany({ data: bulkPC });

  const bulkExp: ExpenseCreateManyInput[] = [];
  for (let i = 0; i < 135; i++) {
    bulkExp.push({
      companyId: company.id, category: pick(expenseCats),
      amount: randInt(5000, 200000), date: randDate(new Date("2024-01-01"), new Date("2024-12-01")),
      notes: `Mega bulk expense ${i + 1}`,
      ...(rng() < 0.5 ? { projectId: pick(allProjectIds) } : {}),
    });
  }
  await prisma.expense.createMany({ data: bulkExp });

  // ── MB18. Audit logs (~1746 more for ~1940 total) ────────────
  console.log("  MB18: Audit logs (1746)…");
  const auditActions = ["CREATE", "APPROVE", "RECEIVE", "ISSUE", "UPDATE", "DELETE", "COUNT", "TRANSFER"];
  const auditEntities = ["PurchaseOrder", "GoodsReceipt", "MaterialIssue", "StockTransfer", "StockCount", "DailyProgressReport", "AssetSale", "ProjectCost", "Expense", "MaterialSale"];
  const bulkAudit: AuditLogCreateManyInput[] = [];
  for (let i = 0; i < 1746; i++) {
    bulkAudit.push({
      userId: pick([U.owner, U.admin, U.manager, U.supervisor, U.accountant, U.sales]),
      action: pick(auditActions), entityType: pick(auditEntities),
      entityId: `mega-bulk-${i}`, after: { note: `Mega bulk audit ${i + 1}` } as any,
      timestamp: randDate(new Date("2024-01-01"), new Date("2024-12-01")),
    });
  }
  await prisma.auditLog.createMany({ data: bulkAudit });

  // ── MB19. Supplier returns (~54 more for ~60 total) ───────────
  console.log("  MB19: Supplier returns (54)…");
  for (let ri = 0; ri < 54; ri++) {
    await prisma.supplierReturn.create({
      data: {
        returnNumber: `RET-MB-${String(ri + 1).padStart(4, "0")}`,
        supplierId: supplierMap[pick(allSuppNamesNow)], companyId: company.id,
        locationId: pick(allWarehouseIds), status: pick(["COMPLETED", "SUBMITTED"]) as any,
        returnDate: randDate(new Date("2024-01-01"), new Date("2024-12-01")),
        ...(rng() < 0.5 ? { creditNoteNo: `CN-MB-${ri + 1}` } : {}),
        notes: `Mega bulk return ${ri + 1}`,
        lines: { create: [{ materialId: matMap[pick(allMatCodesNow)], qty: randInt(1, 50), unitCost: randInt(20, 5000), reason: pick(["Damaged in transit", "Manufacturing defect", "Wrong size", "Quality issue", "Excess supply"]) }] },
      },
    });
  }

  // ── MB20. Equipment + maintenance (~234 more for ~260 total) ─
  console.log("  MB20: Equipment (234)…");
  const newEquip: Record<string, unknown>[] = [];
  for (let i = 1; i <= 234; i++) {
    newEquip.push({
      assetTag: `MB-EQ-${String(i).padStart(4, "0")}`,
      name: pick(equipNames), model: pick(["Model A", "Model B", "Model X", "Pro Series", "Heavy Duty", "Compact"]),
      serialNumber: `SN${randInt(100000, 999999)}`, category: pick(equipCats),
      acquisitionCost: randInt(50000, 10000000), currentValue: randInt(30000, 8000000),
      purchaseDate: randDate(new Date("2022-01-01"), new Date("2024-12-01")),
      companyId: pick(allCompanyIds), status: pick(["AVAILABLE", "ASSIGNED", "IN_MAINTENANCE", "RETIRED"]),
    });
  }
  const newEquipRows = await bulkEnsure("equipment", "assetTag", newEquip);
  const maintBatch: EquipmentMaintenanceCreateManyInput[] = [];
  for (const eq of newEquipRows) {
    if (rng() < 0.2) {
      maintBatch.push({
        equipmentId: eq.id, type: pick(["REPAIR", "SCHEDULED"]) as any,
        startDate: randDate(new Date("2024-01-01"), new Date("2024-12-01")),
        ...(rng() < 0.7 ? { endDate: randDate(new Date("2024-01-01"), new Date("2024-12-01")) } : {}),
        cost: randInt(1000, 50000), vendor: `${pick(firstNames)} Motors`, notes: "Mega bulk maintenance",
      });
    }
  }
  if (maintBatch.length > 0) await prisma.equipmentMaintenance.createMany({ data: maintBatch });

  // ── MB21. Brokers + tenancies ────────────────────────────────
  console.log("  MB21: Brokers (20) + tenancies…");
  const mbBrokers: Record<string, unknown>[] = [];
  for (let i = 1; i <= 20; i++) {
    mbBrokers.push({
      companyId: company.id, name: `${firstNames[i % firstNames.length]} ${pick(["Properties", "Realty", "Estate", "Advisors", "Consultants"])}`,
      phone: `+91 9822${randInt(100000, 999999)}`, agency: `${pick(["Premier", "City", "Metro", "Global", "Trust", "Elite"])} Real Estate`,
      defaultCommissionPercent: new Decimal(pick([1, 1.5, 2, 2.5, 3])), createdById: U.sales,
    });
  }
  await bulkEnsure("broker", "name", mbBrokers);

  // Tenancies — rent some available shops
  const rentable = await prisma.builtUnit.findMany({ where: { status: "AVAILABLE", unitType: "SHOP" }, take: 30 });
  for (const unit of rentable) {
    if (rng() < 0.5) {
      try {
        await prisma.tenancy.create({
          data: {
            companyId: company.id, assetType: "BUILT_UNIT", builtUnitId: unit.id, projectId: unit.projectId,
            tenantName: `${pick(firstNames)} ${pick(lastNames)}`, tenantPhone: `+91 98${randInt(10000000, 99999999)}`,
            startDate: randDate(new Date("2024-01-01"), new Date("2024-12-01")),
            endDate: randDate(new Date("2025-01-01"), new Date("2027-12-01")),
            monthlyRent: new Decimal(randInt(15000, 80000)), baseRent: new Decimal(randInt(15000, 80000)),
            securityDeposit: new Decimal(randInt(50000, 500000)), rentAgreementNo: `RA-MB-${unit.unitNumber}`,
            sacCode: "997212", escalationPercent: new Decimal(5), escalationIntervalMonths: 12,
            status: "ACTIVE", createdById: U.sales,
          },
        });
        await prisma.builtUnit.update({ where: { id: unit.id }, data: { status: "RENTED" } });
      } catch (e) { /* skip — not fatal */ }
    }
  }

  console.log("  Mega bulk complete.");

  // ── Summary ─────────────────────────────────────────────────
  const totalUnits = await prisma.builtUnit.count();
  const totalProjects = await prisma.project.count({ where: { deletedAt: null } });
  const totalCompanies = await prisma.company.count({ where: { deletedAt: null } });
  const poCount = await prisma.purchaseOrder.count();
  const grCount = await prisma.goodsReceipt.count();
  const issueCount = await prisma.materialIssue.count();
  const movementCount = await prisma.stockMovement.count();
  const reqCount = await prisma.materialRequisition.count();
  const quoteCount = await prisma.vendorQuote.count();
  const returnCount = await prisma.supplierReturn.count();
  const saleCount = await prisma.assetSale.count();
  const equipCount = await prisma.equipment.count();
  const dprCount = await prisma.dailyProgressReport.count();
  const attendanceCount = await prisma.workerAttendance.count();
  const payrollCount = await prisma.payrollPeriod.count();
  const tenancyCount = await prisma.tenancy.count();
  const brokerCount = await prisma.broker.count();
  const scheduleCount = await prisma.paymentSchedule.count();
  const materialCount = await prisma.material.count({ where: { deletedAt: null } });
  const categoryCount = await prisma.materialCategory.count({ where: { deletedAt: null } });
  const supplierCount = await prisma.supplier.count({ where: { deletedAt: null } });
  const customerCount = await prisma.customer.count({ where: { deletedAt: null } });
  const employeeCount = await prisma.employee.count();
  const transferCount = await prisma.stockTransfer.count();
  const stockCountCount = await prisma.stockCount.count();
  const equipMaintCount = await prisma.equipmentMaintenance.count();
  const expenseCount = await prisma.expense.count();
  const projectCostCount = await prisma.projectCost.count();
  const auditCount = await prisma.auditLog.count();
  const materialSaleCount = await prisma.materialSale.count();
  const scrapCount = await prisma.scrapGeneration.count();
  const phaseCount = await prisma.projectPhase.count();
  const locCount = await prisma.stockLocation.count({ where: { deletedAt: null } });
  const subCount = await prisma.subcontractor.count({ where: { deletedAt: null } });
  const payrollLineCount = await prisma.payrollLine.count();
  console.log("Seed complete.");
  console.log(`  Companies: ${totalCompanies} (1 parent group + 3 children + 1 standalone)`);
  console.log(`  Users: ${Object.keys(userMap).length} · Employees: ${employeeCount}`);
  console.log(`  Projects: ${totalProjects} · Phases: ${phaseCount} · Locations: ${locCount}`);
  console.log(`  Categories: ${categoryCount} · Materials: ${materialCount}`);
  console.log(`  Suppliers: ${supplierCount} · Subcontractors: ${subCount}`);
  console.log(`  Requisitions: ${reqCount} · Purchase Orders: ${poCount} · Goods Receipts: ${grCount}`);
  console.log(`  Vendor Quotes: ${quoteCount} · Supplier Returns: ${returnCount}`);
  console.log(`  Material Issues: ${issueCount} · Stock Movements: ${movementCount}`);
  console.log(`  Stock Transfers: ${transferCount} · Stock Counts: ${stockCountCount}`);
  console.log(`  Equipment: ${equipCount} · Maintenance: ${equipMaintCount}`);
  console.log(`  Built Units: ${totalUnits} (across all companies)`);
  console.log(`  Customers: ${customerCount} · Asset Sales: ${saleCount} · Material Sales: ${materialSaleCount}`);
  console.log(`  Project Costs: ${projectCostCount} · Expenses: ${expenseCount} · Audit Logs: ${auditCount}`);
  console.log(`  Scrap Generations: ${scrapCount}`);
  console.log(`  Consumption Benchmarks: ${benchmarks.length}`);
  console.log(`  BOQ Items: ${boqSections.length + boqLines.length} · MB Entries: ${mbEntries.length}`);
  console.log(`  DPRs: ${dprCount} · Attendance: ${attendanceCount} · Payroll Periods: ${payrollCount} · Payroll Lines: ${payrollLineCount}`);
  console.log(`  Brokers: ${brokerCount} · Tenancies: ${tenancyCount} · Payment Schedules: ${scheduleCount}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
