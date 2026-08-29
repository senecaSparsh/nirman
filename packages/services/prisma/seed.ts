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
import { PrismaClient } from "@nirman/db";
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
  recordPayment,
  reallocateProjectCosts,
  seedChartOfAccounts,
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

  // ── Summary ─────────────────────────────────────────────────
  const unitCount = await prisma.builtUnit.count({ where: { projectId: project1.id } });
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
  console.log("Seed complete.");
  console.log(`  Companies: ${totalCompanies} (1 parent group + 3 children + 1 standalone)`);
  console.log(`  Users: ${Object.keys(userMap).length} · Employees: ${Object.keys(empMap).length + realtyEmps.length + infraEmps.length + interiorsEmps.length}`);
  console.log(`  Projects: ${totalProjects} · Phases: 9 · Locations: 11`);
  console.log(`  Categories: ${categories.length} · Materials: ${materials.length}`);
  console.log(`  Suppliers: ${suppliers.length + realtySuppliers.length + infraSuppliers.length + interiorsSuppliers.length} · Subcontractors: ${subcontractors.length}`);
  console.log(`  Requisitions: ${reqCount} · Purchase Orders: ${poCount} · Goods Receipts: ${grCount}`);
  console.log(`  Vendor Quotes: ${quoteCount} · Supplier Returns: ${returnCount}`);
  console.log(`  Material Issues: ${issueCount} · Stock Movements: ${movementCount}`);
  console.log(`  Stock Transfers: 2 · Stock Counts: 1`);
  console.log(`  Equipment: ${equipCount} · Maintenance: 2`);
  console.log(`  Land: 2 parcels · Built Units: ${totalUnits} (across all companies)`);
  console.log(`  Customers: ${customers.length + realtyCustomers.length + interiorsCustomers.length} · Asset Sales: ${saleCount}`);
  console.log(`  Project Costs: 16 · Expenses: 5 · Audit Logs: 21`);
  console.log(`  Consumption Benchmarks: ${benchmarks.length}`);
  console.log(`  BOQ Items: ${boqSections.length + boqLines.length} · MB Entries: ${mbEntries.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
