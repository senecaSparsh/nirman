/**
 * Maps an audit log / GL entity type + ID to a clickable URL so users
 * can navigate from an audit entry or journal line to the source document.
 * Returns null when no deep-link exists for the entity type.
 */
export function entityUrl(entityType: string | null, entityId: string | null): string | null {
  if (!entityType || !entityId) return null;
  const map: Record<string, (id: string) => string> = {
    PurchaseOrder: (id) => `/procurement?po=${id}`,
    Project: (id) => `/projects/${id}`,
    AssetSale: () => `/sales`,
    AssetSalePayment: () => `/sales`,
    MaterialIssue: () => `/stock?tab=issues`,
    MaterialSale: () => `/material-sales`,
    MaterialRequisition: () => `/requisitions`,
    Customer: () => `/sales`,
    Supplier: () => `/procurement`,
    Material: () => `/materials`,
    ProjectCost: () => `/finance`,
    Expense: () => `/finance`,
    SupplierReturn: () => `/supplier-returns`,
    LandPurchase: () => `/land`,
    LandParcel: () => `/land`,
    BuiltUnit: () => `/units`,
    DirectPurchase: () => `/procurement`,
    StockCount: () => `/stock?tab=counts`,
    StockTransfer: () => `/stock?tab=transfers`,
    Equipment: () => `/equipment`,
    EquipmentMaintenance: () => `/equipment`,
    PayrollPeriod: () => `/hr/payroll`,
    DailyProgressReport: () => `/hr/dpr`,
    Tenancy: () => `/rentals`,
    RenovationProject: () => `/renovations`,
    RenovationCost: () => `/renovations`,
    ScrapGeneration: () => `/scrap-generations`,
    VendorQuote: () => `/requisitions`,
    PortalListing: () => `/portal-listings`,
    WorkOrder: () => `/work-orders`,
  };
  const fn = map[entityType];
  return fn ? fn(entityId) : null;
}
