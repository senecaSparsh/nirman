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
  // Returns + requisitions
  await wipe("supplierReturn");
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
  const users = [
    { email: "amit@nirman.in", name: "Amit Patil", role: "OWNER" },
    { email: "sneha@nirman.in", name: "Sneha Kulkarni", role: "MANAGER" },
    { email: "ravi@nirman.in", name: "Ravi Deshmukh", role: "SUPERVISOR" },
    { email: "priya@nirman.in", name: "Priya Nair", role: "ACCOUNTANT" },
    { email: "karan@nirman.in", name: "Karan Mehta", role: "SALES" },
  ];
  const userMap: Record<string, string> = {};
  for (const u of users) {
    const row = await ensure("user", { email: u.email }, { ...u, emailVerified: true });
    userMap[u.email] = row.id;
  }
  const U = {
    owner: userMap["amit@nirman.in"],
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
    { name: "UltraTech Cement Distributors", gstin: "27AAACU1234F1Z5", phone: "+91 98220 11234", email: "orders@ultratechdist.in", address: "MIDC, Bhosari, Pune" },
    { name: "JSW Steel Supplies", gstin: "27AAACJ5678K1Z2", phone: "+91 98220 55678", email: "sales@jswsupplies.in", address: "Turbhe, Navi Mumbai" },
    { name: "Shree Brick Works", phone: "+91 99700 88123", address: "Rajgurunagar, Pune" },
    { name: "Anand Electricals & Wiring", gstin: "27AAFFA9012L1Z9", phone: "+91 98190 33456", address: "Bhosari, Pune" },
    { name: "Krishna Sand & Aggregate", phone: "+91 98220 77999", address: "Wagholi, Pune" },
    { name: "Asian Paints Depot", gstin: "27AAACA3344P1Z7", phone: "+91 98220 66789", email: "b2b@asiandepot.in", address: "Pimpri, Pune" },
  ];
  const supplierMap: Record<string, string> = {};
  for (const s of suppliers) {
    const row = await ensure("supplier", { name: s.name }, s);
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
    const row = await ensure("subcontractor", { name: s.name }, s);
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
  await approvePurchaseOrder(po1.id);
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
  await approvePurchaseOrder(po2.id);
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
  // Partition the parent into Tower A plot + Tower B plot + amenity plot
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

  // ── 19. Built units ─────────────────────────────────────────
  // Tower A: ground + 4 floors, 2 units per floor (2BHK + 3BHK).
  // A-101 starts AVAILABLE and is sold via the sale service below (which flips it to SOLD).
  const unitDefs: { phase: string; type: "BHK_2" | "BHK_3" | "SHOP"; unitNumber: string; floor: number; wing?: string; area: number; status: "PLANNED" | "UNDER_CONSTRUCTION" | "AVAILABLE" | "HOLD" | "SOLD"; askingPrice?: number; currentValuation: number }[] = [];
  for (let f = 1; f <= 4; f++) {
    unitDefs.push({ phase: "Tower A", type: "BHK_2", unitNumber: `A-${f}01`, floor: f, wing: "A", area: 850, status: f === 2 ? "UNDER_CONSTRUCTION" : "AVAILABLE", askingPrice: 6500000, currentValuation: 6500000 });
    unitDefs.push({ phase: "Tower A", type: "BHK_3", unitNumber: `A-${f}02`, floor: f, wing: "A", area: 1200, status: f <= 1 ? "AVAILABLE" : "PLANNED", askingPrice: 9200000, currentValuation: 9200000 });
  }
  // Ground-floor retail shops
  unitDefs.push({ phase: "Tower A", type: "SHOP", unitNumber: "S-01", floor: 0, area: 400, status: "AVAILABLE", askingPrice: 4500000, currentValuation: 4500000 });
  unitDefs.push({ phase: "Tower A", type: "SHOP", unitNumber: "S-02", floor: 0, area: 400, status: "AVAILABLE", askingPrice: 4500000, currentValuation: 4500000 });
  // Tower B: planned only
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
      productionCost: 0, // set by reallocateProjectCosts below
      askingPrice: u.askingPrice ?? null,
      currentValuation: u.currentValuation,
    })),
  });

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
    const row = await ensure("customer", { name: c.name }, c);
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
    ],
  });

  // ── Summary ─────────────────────────────────────────────────
  const unitCount = await prisma.builtUnit.count({ where: { projectId: project1.id } });
  const poCount = await prisma.purchaseOrder.count();
  const grCount = await prisma.goodsReceipt.count();
  const issueCount = await prisma.materialIssue.count();
  const movementCount = await prisma.stockMovement.count();
  console.log("Seed complete.");
  console.log(`  Company: ${company.name}`);
  console.log(`  Users: ${Object.keys(userMap).length} · Employees: ${Object.keys(empMap).length}`);
  console.log(`  Projects: 2 · Phases: 3 · Locations: 4`);
  console.log(`  Categories: ${categories.length} · Materials: ${materials.length}`);
  console.log(`  Suppliers: ${suppliers.length} · Subcontractors: ${subcontractors.length}`);
  console.log(`  Requisitions: 2 · Purchase Orders: ${poCount} · Goods Receipts: ${grCount}`);
  console.log(`  Material Issues: ${issueCount} · Stock Movements: ${movementCount}`);
  console.log(`  Stock Transfers: 2 · Stock Counts: 1 · Supplier Returns: 1`);
  console.log(`  Equipment: ${equipmentItems.length} · Maintenance: 2`);
  console.log(`  Land: 1 (1 partitioned parent → 3 children) · Built Units: ${unitCount}`);
  console.log(`  Customers: ${customers.length} · Asset Sales: 3`);
  console.log(`  Project Costs: 7 · Expenses: 5 · Audit Logs: 7`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
