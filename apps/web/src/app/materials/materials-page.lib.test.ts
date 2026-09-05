/**
 * Unit tests for materials page pure helpers.
 *
 *   mapMaterialRow    — map raw Prisma material to MaterialRow
 *   mapCategoryRow    — map raw Prisma category to MaterialCategory
 *   buildLowStockRows — filter materials below minStock, sorted by shortfall
 *   computeStockValue — sum totalValue of all material rows
 */
import { describe, it, expect } from "vitest";
import {
  mapMaterialRow,
  mapCategoryRow,
  buildLowStockRows,
  computeStockValue,
} from "./materials-page.lib";
import type { MaterialRow } from "@/lib/types";

describe("mapMaterialRow", () => {
  const rawMaterial = {
    id: "mat-1",
    code: "CEM-001",
    name: "Cement OPC 53",
    grade: "53",
    specification: "IS 12269",
    categoryId: "cat-1",
    unit: "BAG",
    hsnCode: "25232900",
    gstRate: 28,
    standardCost: 350,
    minStock: 100,
    reorderPoint: 50,
    economicOrderQty: 200,
    volumetricDensity: null,
    bulkDiscountPct: 5,
    isCorporateCommodity: true,
    isLotTracked: false,
    isScrap: null,
    baseUnit: "BAG",
    secondaryUnit: "MT",
    uomConversionFactor: 0.05,
    description: "Ordinary Portland Cement 53 grade",
    category: { id: "cat-1", name: "Cement", unit: "BAG" },
    stockItems: [
      { qty: 50, movingAvgCost: 340 },
      { qty: 30, movingAvgCost: 350 },
    ],
  };

  it("maps basic fields correctly", () => {
    const row = mapMaterialRow(rawMaterial);
    expect(row.id).toBe("mat-1");
    expect(row.code).toBe("CEM-001");
    expect(row.name).toBe("Cement OPC 53");
    expect(row.unit).toBe("BAG");
  });

  it("computes totalQty from stock items", () => {
    const row = mapMaterialRow(rawMaterial);
    expect(row.totalQty).toBe(80); // 50 + 30
  });

  it("computes totalValue from qty × cost", () => {
    const row = mapMaterialRow(rawMaterial);
    expect(row.totalValue).toBe(50 * 340 + 30 * 350); // 17000 + 10500 = 27500
  });

  it("maps category name from nested object", () => {
    const row = mapMaterialRow(rawMaterial);
    expect(row.categoryName).toBe("Cement");
  });

  it("handles null booleans with false default", () => {
    const row = mapMaterialRow({ ...rawMaterial, isScrap: null });
    expect(row.isScrap).toBe(false);
  });

  it("handles null numeric fields", () => {
    const row = mapMaterialRow({ ...rawMaterial, minStock: null, reorderPoint: null });
    expect(row.minStock).toBeNull();
    expect(row.reorderPoint).toBeNull();
  });

  it("detects low stock when totalQty < minStock", () => {
    const row = mapMaterialRow(rawMaterial);
    expect(row.lowStock).toBe(true); // 80 < 100
  });

  it("does not flag low stock when totalQty >= minStock", () => {
    const row = mapMaterialRow({ ...rawMaterial, stockItems: [{ qty: 150, movingAvgCost: 340 }] });
    expect(row.lowStock).toBe(false); // 150 >= 100
  });

  it("does not flag low stock when minStock is null", () => {
    const row = mapMaterialRow({ ...rawMaterial, minStock: null });
    expect(row.lowStock).toBe(false);
  });

  it("handles empty stock items", () => {
    const row = mapMaterialRow({ ...rawMaterial, stockItems: [] });
    expect(row.totalQty).toBe(0);
    expect(row.totalValue).toBe(0);
  });
});

describe("mapCategoryRow", () => {
  it("maps category fields correctly", () => {
    const row = mapCategoryRow({
      id: "cat-1",
      name: "Cement",
      unit: "BAG",
      class: "CONSUMABLE",
      _count: { materials: 15 },
    });
    expect(row.id).toBe("cat-1");
    expect(row.name).toBe("Cement");
    expect(row.unit).toBe("BAG");
    expect(row.class).toBe("CONSUMABLE");
    expect(row._count!.materials).toBe(15);
  });

  it("handles null class", () => {
    const row = mapCategoryRow({
      id: "cat-2",
      name: "Steel",
      unit: "KG",
      class: null,
      _count: { materials: 0 },
    });
    expect(row.class).toBeNull();
  });
});

describe("buildLowStockRows", () => {
  const materials = [
    {
      id: "m1",
      code: "A",
      name: "Material A",
      category: { name: "Cat A" },
      unit: "BAG",
      minStock: 100,
      standardCost: 350,
      stockItems: [{ qty: 50 }], // shortfall = 50
    },
    {
      id: "m2",
      code: "B",
      name: "Material B",
      category: { name: "Cat B" },
      unit: "KG",
      minStock: 200,
      standardCost: 50,
      stockItems: [{ qty: 100 }], // shortfall = 100
    },
    {
      id: "m3",
      code: "C",
      name: "Material C",
      category: { name: "Cat C" },
      unit: "L",
      minStock: 50,
      standardCost: 100,
      stockItems: [{ qty: 60 }], // NOT low stock (60 >= 50)
    },
  ];

  it("filters to only materials below minStock", () => {
    const rows = buildLowStockRows(materials);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.id)).toEqual(["m2", "m1"]); // sorted by shortfall desc
  });

  it("sorts by shortfall descending", () => {
    const rows = buildLowStockRows(materials);
    expect(rows[0]!.shortfall).toBeGreaterThanOrEqual(rows[1]!.shortfall);
    expect(rows[0]!.id).toBe("m2"); // shortfall 100
    expect(rows[1]!.id).toBe("m1"); // shortfall 50
  });

  it("computes shortfall correctly", () => {
    const rows = buildLowStockRows(materials);
    const m1 = rows.find((r) => r.id === "m1");
    expect(m1?.shortfall).toBe(50); // 100 - 50
  });

  it("computes totalQty from stock items", () => {
    const rows = buildLowStockRows(materials);
    const m1 = rows.find((r) => r.id === "m1");
    expect(m1?.totalQty).toBe(50);
  });

  it("returns empty array for materials with no low stock", () => {
    const allInStock = [
      {
        id: "m1",
        code: "A",
        name: "Material A",
        category: { name: "Cat A" },
        unit: "BAG",
        minStock: 10,
        standardCost: 100,
        stockItems: [{ qty: 50 }],
      },
    ];
    expect(buildLowStockRows(allInStock)).toHaveLength(0);
  });

  it("handles multiple stock items", () => {
    const multi = [
      {
        id: "m1",
        code: "A",
        name: "Material A",
        category: { name: "Cat A" },
        unit: "BAG",
        minStock: 100,
        standardCost: 100,
        stockItems: [{ qty: 20 }, { qty: 30 }, { qty: 10 }], // total = 60
      },
    ];
    const rows = buildLowStockRows(multi);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.totalQty).toBe(60);
    expect(rows[0]!.shortfall).toBe(40);
  });
});

describe("computeStockValue", () => {
  it("sums totalValue across all rows", () => {
    const rows: MaterialRow[] = [
      { totalValue: 1000 } as MaterialRow,
      { totalValue: 2000 } as MaterialRow,
      { totalValue: 3000 } as MaterialRow,
    ];
    expect(computeStockValue(rows)).toBe(6000);
  });

  it("returns 0 for empty array", () => {
    expect(computeStockValue([])).toBe(0);
  });

  it("handles single row", () => {
    const rows: MaterialRow[] = [{ totalValue: 5000 } as MaterialRow];
    expect(computeStockValue(rows)).toBe(5000);
  });
});
