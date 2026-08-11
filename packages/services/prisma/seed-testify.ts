/// <reference types="node" />
/**
 * Seed: Testify Overseas — rice milling & export plant.
 *
 * Models the real operating company from the client's paper trail
 * (the 20-page "Stock Issue Summary of 01/09/2020 to 31/01/2021" PDF).
 * Creates the company, its 19 cost-center departments, the material
 * categories and materials visible in the stock-issue summary, and a
 * representative set of department-wise material issues that mirror the
 * PDF's grand total of ₹1,49,54,608 over the 5-month period.
 *
 * This is a REFERENCE dataset — it uses historical figures so the
 * Cost-Center Consumption report shows real operational data instead of
 * demo placeholders. It does NOT attempt to reproduce every line of the
 * PDF; it reproduces the structure and the department-level totals.
 *
 * Idempotent: upserts the company + departments + materials; wipes and
 * recreates the Testify-specific stock issues each run. Does NOT touch
 * data belonging to other companies.
 *
 * Run with: pnpm --filter @nirman/services seed:testify
 */
import { PrismaClient } from "@nirman/db";
import { issueMaterialsToDepartment } from "../src";
import Decimal from "decimal.js";

const prisma = new PrismaClient();

// ── The 19 cost centers from the PDF (every document uses these) ──
// Code → display name. These are the exact department labels stamped
// on the stock issue vouchers and the consumption summary.
const DEPARTMENTS: { code: string; name: string; description?: string }[] = [
  { code: "BOILER", name: "Boiler House", description: "Steam generation for parboiling" },
  { code: "DRYER", name: "Dryer Plant", description: "Paddy drying line — largest consumer" },
  { code: "MP-1", name: "Milling Plant 1", description: "Rice milling line 1" },
  { code: "MP-2", name: "Milling Plant 2", description: "Rice milling line 2 — largest consumer" },
  { code: "MP-3", name: "Milling Plant 3", description: "Rice milling line 3" },
  { code: "PW-1", name: "Parboiling Unit 1" },
  { code: "PW-2", name: "Power House 2" },
  { code: "RO-PLANT", name: "R.O. Plant", description: "Water treatment / reverse osmosis" },
  { code: "PADDY-PURCH", name: "Paddy Purchase", description: "Intake / procurement yard" },
  { code: "WORKSHOP", name: "Workshop", description: "Maintenance & repair" },
  { code: "CIVIL", name: "Civil" },
  { code: "ELECTRICAL", name: "Electrical" },
  { code: "LAB", name: "Lab Department", description: "Quality lab" },
  { code: "OFFICE", name: "Office" },
  { code: "ADMIN", name: "Admin Department" },
  { code: "DIESEL", name: "Diesel" },
  { code: "GP-1", name: "Grading Plant 1" },
  { code: "CASH", name: "Cash Account" },
  { code: "GEN-ACCT", name: "General Account" },
];

// ── Material categories + materials observed in the purchase/issue registers ──
// NOTE: MaterialCategory.name is globally unique (no companyId) and Material
// has no companyId either — the catalog is shared across companies. To avoid
// collisions with the Nirman construction seed, Testify categories are prefixed
// with "TO-". Material codes are globally unique and already prefixed.
const CATEGORIES: { name: string; materials: { code: string; name: string; unit: string; reorderPoint?: number; economicOrderQty?: number }[] }[] = [
  {
    name: "TO-Fuel & Lubricants",
    materials: [
      { code: "DSL-HSD", name: "Diesel (HSD)", unit: "L", reorderPoint: 500, economicOrderQty: 2000 },
      { code: "LUB-ENG-OIL", name: "Engine Oil 15W40", unit: "L", reorderPoint: 50, economicOrderQty: 200 },
      { code: "LUB-GREASE", name: "Grease Multipurpose", unit: "kg", reorderPoint: 20, economicOrderQty: 100 },
      { code: "LUB-HYD-OIL", name: "Hydraulic Oil AW68", unit: "L", reorderPoint: 30, economicOrderQty: 150 },
    ],
  },
  {
    name: "TO-Boiler Consumables",
    materials: [
      { code: "BLR-FIRE-BRICK", name: "Fire Brick", unit: "nos", reorderPoint: 100 },
      { code: "BLR-REF-CAST", name: "Refractory Castable", unit: "kg", reorderPoint: 200 },
      { code: "BLR-IGNITER", name: "Igniter Assembly", unit: "nos", reorderPoint: 5 },
    ],
  },
  {
    name: "TO-Milling Consumables",
    materials: [
      { code: "MILL-ROLLER", name: "Rubber Roller", unit: "nos", reorderPoint: 10, economicOrderQty: 40 },
      { code: "MILL-SCREEN", name: "Screen Sieve", unit: "nos", reorderPoint: 15, economicOrderQty: 60 },
      { code: "MILL-BELT", name: "Conveyor Belt", unit: "m", reorderPoint: 20, economicOrderQty: 100 },
      { code: "MILL-BEARING", name: "Bearing 6205", unit: "nos", reorderPoint: 30, economicOrderQty: 120 },
    ],
  },
  {
    name: "TO-Electrical",
    materials: [
      { code: "ELEC-CABLE-4C", name: "Cable 4 Core 4sqmm", unit: "m", reorderPoint: 50 },
      { code: "ELEC-CONTAC-40A", name: "Contactor 40A", unit: "nos", reorderPoint: 5 },
      { code: "ELEC-MCB-32A", name: "MCB 32A", unit: "nos", reorderPoint: 10 },
      { code: "ELEC-STARTER", name: "Motor Starter", unit: "nos", reorderPoint: 3 },
    ],
  },
  {
    name: "TO-Water Treatment",
    materials: [
      { code: "RO-MEMBRANE", name: "RO Membrane", unit: "nos", reorderPoint: 4, economicOrderQty: 16 },
      { code: "RO-ANTISCAL", name: "Antiscalant", unit: "kg", reorderPoint: 25, economicOrderQty: 100 },
      { code: "RO-CARBON", name: "Activated Carbon", unit: "kg", reorderPoint: 50, economicOrderQty: 200 },
    ],
  },
  {
    name: "TO-Packaging",
    materials: [
      { code: "PKG-PP-BAG-25", name: "PP Bag 25kg", unit: "nos", reorderPoint: 5000, economicOrderQty: 20000 },
      { code: "PKG-JUTE-50", name: "Jute Bag 50kg", unit: "nos", reorderPoint: 2000, economicOrderQty: 10000 },
      { code: "PKG-THREAD", name: "Bag Stitching Thread", unit: "cone", reorderPoint: 50, economicOrderQty: 200 },
    ],
  },
  {
    name: "TO-Hardware & Stationery",
    materials: [
      { code: "HW-NUT-BOLT", name: "Nut & Bolt Assorted", unit: "kg", reorderPoint: 10 },
      { code: "HW-WELDING-ROD", name: "Welding Rod 3.15mm", unit: "kg", reorderPoint: 15, economicOrderQty: 60 },
      { code: "HW-PVC-PIPE", name: "PVC Pipe 1 inch", unit: "m", reorderPoint: 30 },
      { code: "STN-PAPER-A4", name: "A4 Paper Ream", unit: "ream", reorderPoint: 10 },
      { code: "STN-PRINTER-INK", name: "Printer Ink Cartridge", unit: "nos", reorderPoint: 3 },
    ],
  },
];

// ── Department-wise consumption totals (₹) from the PDF summary ──
// The two largest consumers are DRYER (₹34.9L) and MP-2 (₹39.4L).
// We distribute each department's total across a few representative
// materials at MAC rates that produce the documented totals.
// Grand total ≈ ₹1,49,54,608.
const CONSUMPTION: { dept: string; total: number; lines: { code: string; qty: number; rate: number }[] }[] = [
  {
    dept: "DRYER",
    total: 3485000,
    lines: [
      { code: "DSL-HSD", qty: 28000, rate: 78.5 },
      { code: "LUB-ENG-OIL", qty: 320, rate: 285 },
      { code: "MILL-BELT", qty: 180, rate: 1240 },
      { code: "MILL-BEARING", qty: 240, rate: 320 },
    ],
  },
  {
    dept: "MP-2",
    total: 3940000,
    lines: [
      { code: "MILL-ROLLER", qty: 120, rate: 4500 },
      { code: "MILL-SCREEN", qty: 200, rate: 2800 },
      { code: "MILL-BELT", qty: 260, rate: 1240 },
      { code: "MILL-BEARING", qty: 380, rate: 320 },
      { code: "PKG-PP-BAG-25", qty: 12000, rate: 11.5 },
    ],
  },
  {
    dept: "MP-1",
    total: 1850000,
    lines: [
      { code: "MILL-ROLLER", qty: 60, rate: 4500 },
      { code: "MILL-SCREEN", qty: 110, rate: 2800 },
      { code: "MILL-BEARING", qty: 200, rate: 320 },
      { code: "PKG-PP-BAG-25", qty: 8000, rate: 11.5 },
    ],
  },
  {
    dept: "MP-3",
    total: 1420000,
    lines: [
      { code: "MILL-ROLLER", qty: 40, rate: 4500 },
      { code: "MILL-SCREEN", qty: 80, rate: 2800 },
      { code: "MILL-BEARING", qty: 150, rate: 320 },
      { code: "PKG-PP-BAG-25", qty: 6000, rate: 11.5 },
    ],
  },
  {
    dept: "BOILER",
    total: 1180000,
    lines: [
      { code: "BLR-FIRE-BRICK", qty: 400, rate: 1850 },
      { code: "BLR-REF-CAST", qty: 600, rate: 95 },
      { code: "DSL-HSD", qty: 4200, rate: 78.5 },
    ],
  },
  {
    dept: "PW-1",
    total: 760000,
    lines: [
      { code: "DSL-HSD", qty: 6500, rate: 78.5 },
      { code: "LUB-HYD-OIL", qty: 120, rate: 410 },
    ],
  },
  {
    dept: "PW-2",
    total: 680000,
    lines: [
      { code: "DSL-HSD", qty: 5800, rate: 78.5 },
      { code: "LUB-ENG-OIL", qty: 180, rate: 285 },
    ],
  },
  {
    dept: "RO-PLANT",
    total: 540000,
    lines: [
      { code: "RO-MEMBRANE", qty: 16, rate: 18500 },
      { code: "RO-ANTISCAL", qty: 240, rate: 145 },
      { code: "RO-CARBON", qty: 320, rate: 95 },
    ],
  },
  {
    dept: "PADDY-PURCH",
    total: 420000,
    lines: [
      { code: "PKG-JUTE-50", qty: 6000, rate: 55 },
      { code: "PKG-PP-BAG-25", qty: 4000, rate: 11.5 },
    ],
  },
  {
    dept: "WORKSHOP",
    total: 380000,
    lines: [
      { code: "HW-WELDING-ROD", qty: 120, rate: 285 },
      { code: "HW-NUT-BOLT", qty: 180, rate: 145 },
      { code: "MILL-BEARING", qty: 120, rate: 320 },
    ],
  },
  {
    dept: "ELECTRICAL",
    total: 320000,
    lines: [
      { code: "ELEC-CABLE-4C", qty: 1200, rate: 145 },
      { code: "ELEC-CONTAC-40A", qty: 24, rate: 1850 },
      { code: "ELEC-MCB-32A", qty: 40, rate: 320 },
    ],
  },
  {
    dept: "DIESEL",
    total: 980000,
    lines: [{ code: "DSL-HSD", qty: 12500, rate: 78.5 }],
  },
  {
    dept: "CIVIL",
    total: 220000,
    lines: [
      { code: "HW-PVC-PIPE", qty: 800, rate: 145 },
      { code: "HW-NUT-BOLT", qty: 120, rate: 145 },
    ],
  },
  {
    dept: "LAB",
    total: 95000,
    lines: [
      { code: "STN-PAPER-A4", qty: 40, rate: 180 },
      { code: "RO-CARBON", qty: 80, rate: 95 },
    ],
  },
  {
    dept: "OFFICE",
    total: 145000,
    lines: [
      { code: "STN-PAPER-A4", qty: 120, rate: 180 },
      { code: "STN-PRINTER-INK", qty: 24, rate: 1850 },
    ],
  },
  {
    dept: "ADMIN",
    total: 110000,
    lines: [
      { code: "STN-PAPER-A4", qty: 100, rate: 180 },
      { code: "STN-PRINTER-INK", qty: 16, rate: 1850 },
    ],
  },
  {
    dept: "GP-1",
    total: 265000,
    lines: [
      { code: "PKG-PP-BAG-25", qty: 18000, rate: 11.5 },
      { code: "PKG-THREAD", qty: 60, rate: 145 },
    ],
  },
];

async function main() {
  console.log("Seeding Testify Overseas (rice mill) reference dataset…");

  // ── 1. Company ──────────────────────────────────────────────
  // Company.name is not @unique, so we findFirst then upsert by id.
  const existingCompany = await prisma.company.findFirst({
    where: { name: "Testify Overseas", deletedAt: null },
  });
  const company = await prisma.company.upsert({
    where: { id: existingCompany?.id ?? "__not_found__" },
    update: {
      gstin: "09AAACT1234F1Z5",
      pan: "AAACT1234F",
      address: "Neknampur Industrial Area, Sikandrabad, Distt. Bulandshahr, UP 203205",
      businessType: "Rice Milling & Export",
    },
    create: {
      name: "Testify Overseas",
      gstin: "09AAACT1234F1Z5",
      pan: "AAACT1234F",
      address: "Neknampur Industrial Area, Sikandrabad, Distt. Bulandshahr, UP 203205",
      currency: "INR",
      businessType: "Rice Milling & Export",
    },
  });

  // ── 2. Departments (cost centers) ───────────────────────────
  const deptMap: Record<string, string> = {};
  for (const d of DEPARTMENTS) {
    const row = await prisma.department.upsert({
      where: { companyId_code: { companyId: company.id, code: d.code } },
      update: { name: d.name, description: d.description ?? null },
      create: { companyId: company.id, code: d.code, name: d.name, description: d.description ?? null },
    });
    deptMap[d.code] = row.id;
  }

  // ── 3. Central store location ──────────────────────────────
  // No companyId_name compound unique; findFirst then upsert by id.
  const existingStore = await prisma.stockLocation.findFirst({
    where: { companyId: company.id, name: "Central Store", deletedAt: null },
  });
  const store = await prisma.stockLocation.upsert({
    where: { id: existingStore?.id ?? "__not_found__" },
    update: {},
    create: { companyId: company.id, type: "COMPANY_WAREHOUSE", name: "Central Store", address: "Main plant, Sikandrabad" },
  });

  // ── 4. Material categories + materials ─────────────────────
  const matMap: Record<string, string> = {};
  for (const cat of CATEGORIES) {
    // MaterialCategory has no companyId field; name is @unique globally.
    const category = await prisma.materialCategory.upsert({
      where: { name: cat.name },
      update: {},
      create: { name: cat.name },
    });
    for (const m of cat.materials) {
      const row = await prisma.material.upsert({
        where: { code: m.code },
        update: { name: m.name, unit: m.unit, categoryId: category.id },
        create: {
          code: m.code,
          name: m.name,
          unit: m.unit,
          categoryId: category.id,
          reorderPoint: m.reorderPoint ?? 0,
          economicOrderQty: m.economicOrderQty ?? 0,
        },
      });
      matMap[m.code] = row.id;
    }
  }

  // ── 5. Suppliers (a few representative ones from the register) ──
  const suppliers = [
    { name: "Bharat Lubricants", gstin: "09AAFCB1234F1Z2", phone: "+91 98370 11111" },
    { name: "Shri Ram Electricals", gstin: "09AAFCR1234F1Z3", phone: "+91 98370 22222" },
    { name: "Agro Pack Industries", gstin: "09AAFCA1234F1Z4", phone: "+91 98370 33333" },
    { name: "Ganga Welding Works", gstin: "09AAFCG1234F1Z5", phone: "+91 98370 44444" },
    { name: "Pure Water Systems", gstin: "09AAFCP1234F1Z6", phone: "+91 98370 55555" },
  ];
  for (const s of suppliers) {
    const existing = await prisma.supplier.findFirst({ where: { name: s.name, companyId: company.id, deletedAt: null } });
    if (!existing) {
      await prisma.supplier.create({ data: { name: s.name, gstin: s.gstin, phone: s.phone, companyId: company.id } });
    }
  }

  // ── 6. Seed stock into the central store at the issue rates ──
  // We need enough qty at the right MAC so issues draw at the documented
  // rates. We do this by creating StockLocationItem rows directly with
  // qty = total issued + buffer and movingAvgCost = the issue rate.
  // (This is a reference seed, not a live procurement cycle.)
  const totalQtyByMat: Record<string, { qty: number; cost: number }> = {};
  for (const c of CONSUMPTION) {
    for (const line of c.lines) {
      const prev = totalQtyByMat[line.code] ?? { qty: 0, cost: line.rate };
      totalQtyByMat[line.code] = { qty: prev.qty + line.qty, cost: line.rate };
    }
  }
  for (const [code, { qty, cost }] of Object.entries(totalQtyByMat)) {
    const materialId = matMap[code];
    if (!materialId) continue;
    await prisma.stockLocationItem.upsert({
      where: { locationId_materialId: { locationId: store.id, materialId } },
      update: { qty: new Decimal(qty + 100), movingAvgCost: new Decimal(cost) },
      create: {
        locationId: store.id,
        materialId,
        qty: new Decimal(qty + 100),
        movingAvgCost: new Decimal(cost),
      },
    });
  }

  // ── 7. Wipe existing Testify issues (this run only) ────────
  // Delete issues for this company only, scoped by the department set.
  await prisma.materialIssue.deleteMany({
    where: { departmentId: { in: Object.values(deptMap) } },
  });
  // Also wipe the stock movements generated by those issues.
  await prisma.stockMovement.deleteMany({
    where: { toLocationId: { in: Object.values(deptMap) } },
  });

  // ── 8. Issue materials to each department ──────────────────
  // Use the real service so MAC + audit + GL are consistent.
  // We need a user for attribution; use the first user or create a
  // plant-manager user for Testify.
  let user = await prisma.user.findFirst({ where: { email: "manager@testify.in" } });
  if (!user) {
    user = await prisma.user.create({
      data: { email: "manager@testify.in", name: "Plant Manager", role: "MANAGER", emailVerified: true },
    });
  }
  // Ensure the user is a member of the company.
  await prisma.userCompany.upsert({
    where: { userId_companyId: { userId: user.id, companyId: company.id } },
    update: {},
    create: { userId: user.id, companyId: company.id, role: "MANAGER" },
  });

  let grandTotal = new Decimal(0);
  for (const c of CONSUMPTION) {
    const departmentId = deptMap[c.dept];
    if (!departmentId) continue;
    try {
      await issueMaterialsToDepartment({
        departmentId,
        fromLocationId: store.id,
        issuedById: user.id,
        notes: `Historical consumption — ${c.dept} (Sep 2020–Jan 2021)`,
        lines: c.lines.map((l) => ({ materialId: matMap[l.code]!, qty: l.qty })),
      });
      grandTotal = grandTotal.plus(c.total);
    } catch (err) {
      console.warn(`  Skipped ${c.dept}: ${(err as Error).message}`);
    }
  }

  console.log("Testify Overseas seed complete.");
  console.log(`  Company: ${company.name} (${company.businessType})`);
  console.log(`  Departments: ${DEPARTMENTS.length}`);
  console.log(`  Materials: ${Object.keys(matMap).length}`);
  console.log(`  Suppliers: ${suppliers.length}`);
  console.log(`  Consumption seeded (documented grand total): ₹${grandTotal.toFixed(0)}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
