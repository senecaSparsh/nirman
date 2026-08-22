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
    { deletedAt: null, name: "Nirman Constructions" },
    {
      name: "Nirman Constructions",
      gstin: "27AAACN1234F1Z5",
      pan: "AAACN1234F",
      currency: "INR",
      address: "4th Floor, Phoenix Plaza, FC Road, Pune 411005",
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
    unitDefs.push({ phase: "Tower A", type: "BHK_2", unitNumber: `A-${f}01`, floor: f, wing: "A", area: 850, status: f === 2 ? "UNDER_CONSTRUCTION" : "AVAILABLE", askingPrice: 6500000, currentValuation: 6500000 });
    unitDefs.push({ phase: "Tower A", type: "BHK_3", unitNumber: `A-${f}02`, floor: f, wing: "A", area: 1200, status: f <= 1 ? "AVAILABLE" : "PLANNED", askingPrice: 9200000, currentValuation: 9200000 });
  }
  unitDefs.push({ phase: "Tower A", type: "SHOP", unitNumber: "S-01", floor: 0, area: 400, status: "AVAILABLE", askingPrice: 4500000, currentValuation: 4500000 });
  unitDefs.push({ phase: "Tower A", type: "SHOP", unitNumber: "S-02", floor: 0, area: 400, status: "AVAILABLE", askingPrice: 4500000, currentValuation: 4500000 });
  unitDefs.push({ phase: "Tower B", type: "BHK_2", unitNumber: "B-101", floor: 1, wing: "B", area: 850, status: "PLANNED", currentValuation: 0 });
  unitDefs.push({ phase: "Tower B", type: "BHK_3", unitNumber: "B-102", floor: 1, wing: "B", area: 1200, status: "PLANNED", currentValuation: 0 });

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
    hillviewUnits.push({ unitNumber: `H-${f}01`, floor: f, area: 1500, type: "SHOP", status: "PLANNED", currentValuation: 0 });
    hillviewUnits.push({ unitNumber: `H-${f}02`, floor: f, area: 2000, type: "SHOP", status: "PLANNED", currentValuation: 0 });
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
    salePrice: 6500000,
    paymentMode: "Home Loan (SBI)",
    notes: "Booking amount + first installment received",
  });
  await recordPayment({ assetSaleId: sale1.id, amount: 650000, mode: "RTGS", reference: "UTR123456" });
  await recordPayment({ assetSaleId: sale1.id, amount: 1300000, mode: "Cheque", reference: "CHQ-789" });

  // Sale 2: Built unit S-01 (shop) sold to Mohit Enterprises — fully paid
  const unitS01 = await prisma.builtUnit.findFirstOrThrow({ where: { projectId: project1.id, unitNumber: "S-01" } });
  const sale2 = await sellAsset({
    assetType: "BUILT_UNIT",
    builtUnitId: unitS01.id,
    customerId: customerMap["Mohit Enterprises"],
    companyId: company.id,
    salePrice: 4500000,
    paymentMode: "Bank Transfer",
    notes: "Full payment — commercial purchase",
  });
  await recordPayment({ assetSaleId: sale2.id, amount: 4500000, mode: "NEFT", reference: "NEFT-456789" });

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
  const req3 = await prisma.materialRequisition.findFirstOrThrow({ where: { reqNumber: "REQ-2024-0003" } });
  const quoteData = [
    { supplier: "Anand Electricals & Wiring", lines: [{ material: "ELC-WIRE25", qty: 3000, unitPrice: 18 }, { material: "ELC-CONDUIT", qty: 800, unitPrice: 32 }], validUntil: new Date("2024-05-25") },
    { supplier: "Viman Electricals", lines: [{ material: "ELC-WIRE25", qty: 3000, unitPrice: 19 }, { material: "ELC-CONDUIT", qty: 800, unitPrice: 30 }], validUntil: new Date("2024-05-22") },
    { supplier: "Maha Lakshmi Hardware", lines: [{ material: "ELC-WIRE25", qty: 3000, unitPrice: 17.5 }, { material: "ELC-CONDUIT", qty: 800, unitPrice: 35 }], validUntil: new Date("2024-05-20") },
  ];
  for (const qd of quoteData) {
    const landedTotal = qd.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
    const vq = await prisma.vendorQuote.create({
      data: {
        requisitionId: req3.id,
        supplierId: supplierMap[qd.supplier],
        fileUrl: `/uploads/quotes/quote-${qd.supplier.replace(/[^a-zA-Z]/g, "")}.pdf`,
        fileName: `Quote-${qd.supplier.replace(/\s+/g, "-")}.pdf`,
        mimeType: "application/pdf",
        landedTotal: new Decimal(landedTotal),
        validUntil: qd.validUntil,
        submittedById: U.manager,
        notes: `Quote from ${qd.supplier} for electrical rough-in`,
        status: "PENDING",
        lines: {
          create: qd.lines.map((l) => ({
            materialId: matMap[l.material],
            qty: new Decimal(l.qty),
            unitPrice: new Decimal(l.unitPrice),
            lineTotal: new Decimal(l.qty * l.unitPrice),
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
    const landedTotal = qd.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
    const vq = await prisma.vendorQuote.create({
      data: {
        requisitionId: req5.id,
        supplierId: supplierMap[qd.supplier],
        fileUrl: `/uploads/quotes/quote-paint-${qd.supplier.replace(/[^a-zA-Z]/g, "")}.pdf`,
        fileName: `Quote-Paint-${qd.supplier.replace(/\s+/g, "-")}.pdf`,
        mimeType: "application/pdf",
        landedTotal: new Decimal(landedTotal),
        validUntil: qd.validUntil,
        submittedById: U.manager,
        notes: `Paint quote from ${qd.supplier}`,
        status: "PENDING",
        lines: {
          create: qd.lines.map((l) => ({
            materialId: matMap[l.material],
            qty: new Decimal(l.qty),
            unitPrice: new Decimal(l.unitPrice),
            lineTotal: new Decimal(l.qty * l.unitPrice),
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

  // ── Summary ─────────────────────────────────────────────────
  const unitCount = await prisma.builtUnit.count({ where: { projectId: project1.id } });
  const poCount = await prisma.purchaseOrder.count();
  const grCount = await prisma.goodsReceipt.count();
  const issueCount = await prisma.materialIssue.count();
  const movementCount = await prisma.stockMovement.count();
  const reqCount = await prisma.materialRequisition.count();
  const quoteCount = await prisma.vendorQuote.count();
  const returnCount = await prisma.supplierReturn.count();
  console.log("Seed complete.");
  console.log(`  Company: ${company.name}`);
  console.log(`  Users: ${Object.keys(userMap).length} · Employees: ${Object.keys(empMap).length}`);
  console.log(`  Projects: 2 · Phases: 3 · Locations: 4`);
  console.log(`  Categories: ${categories.length} · Materials: ${materials.length}`);
  console.log(`  Suppliers: ${suppliers.length} · Subcontractors: ${subcontractors.length}`);
  console.log(`  Requisitions: ${reqCount} · Purchase Orders: ${poCount} · Goods Receipts: ${grCount}`);
  console.log(`  Vendor Quotes: ${quoteCount} · Supplier Returns: ${returnCount}`);
  console.log(`  Material Issues: ${issueCount} · Stock Movements: ${movementCount}`);
  console.log(`  Stock Transfers: 2 · Stock Counts: 1`);
  console.log(`  Equipment: ${equipmentItems.length} · Maintenance: 2`);
  console.log(`  Land: 1 (1 partitioned parent → 3 children) · Built Units: ${unitCount}`);
  console.log(`  Customers: ${customers.length} · Asset Sales: 3`);
  console.log(`  Project Costs: 7 · Expenses: 5 · Audit Logs: 21`);
  console.log(`  Consumption Benchmarks: ${benchmarks.length}`);
  console.log(`  BOQ Items: ${boqSections.length + boqLines.length} · MB Entries: ${mbEntries.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
