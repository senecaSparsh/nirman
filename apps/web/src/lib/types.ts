/** Shared client-side types for the Materials module. */

export type MaterialCategory = {
  id: string;
  name: string;
  unit: string;
  _count?: { materials: number };
};

export type MaterialRow = {
  id: string;
  code: string;
  name: string;
  categoryId: string;
  categoryName: string;
  unit: string;
  hsnCode: string | null;
  gstRate: number;
  standardCost: number;
  minStock: number | null;
  description: string | null;
  totalQty: number;
  totalValue: number;
  lowStock: boolean;
};

export type StockLocationRow = {
  id: string;
  type: "COMPANY_WAREHOUSE" | "PROJECT_SITE";
  name: string;
  address: string | null;
  projectId: string | null;
  projectName: string | null;
  stockValue: number;
  itemCount: number;
};

export type StockRow = {
  id: string;
  locationId: string;
  locationName: string;
  locationType: "COMPANY_WAREHOUSE" | "PROJECT_SITE";
  materialId: string;
  materialCode: string;
  materialName: string;
  categoryName: string;
  unit: string;
  qty: number;
  mac: number;
  value: number;
};

export type LowStockRow = {
  id: string;
  code: string;
  name: string;
  categoryName: string;
  unit: string;
  totalQty: number;
  minStock: number;
  shortfall: number;
  standardCost: number;
};

export type ProjectOption = {
  id: string;
  name: string;
  type: string;
  status: string;
};
