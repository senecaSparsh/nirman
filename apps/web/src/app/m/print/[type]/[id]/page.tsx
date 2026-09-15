import { notFound } from "next/navigation";
import type { ComponentType } from "react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Document" };

type PrintPage = ComponentType<{ params: Promise<{ id: string }> }>;

/**
 * Mobile print dispatcher — renders the same document components as
 * /print/<type>/<id> under the /m namespace so mobile users never leave
 * the mobile surface (and never trigger a desktop-route redirect).
 */
const PAGES: Record<string, () => Promise<{ default: PrintPage }>> = {
  "allotment-letter": () => import("@/app/print/allotment-letter/[id]/page"),
  "appointment-letter": () => import("@/app/print/appointment-letter/[id]/page"),
  "demand-notice": () => import("@/app/print/demand-notice/[id]/page"),
  "direct-purchase": () => import("@/app/print/direct-purchase/[id]/page"),
  "employee-id-card": () => import("@/app/print/employee-id-card/[id]/page"),
  "employment-agreement": () => import("@/app/print/employment-agreement/[id]/page"),
  "gate-pass": () => import("@/app/print/gate-pass/[id]/page"),
  "goods-receipt": () => import("@/app/print/goods-receipt/[id]/page"),
  "issue": () => import("@/app/print/issue/[id]/page"),
  "material-sale": () => import("@/app/print/material-sale/[id]/page"),
  "material-sale-receipt": () => import("@/app/print/material-sale-receipt/[id]/page"),
  "measurement-book": () => import("@/app/print/measurement-book/[id]/page"),
  "offer-letter": () => import("@/app/print/offer-letter/[id]/page"),
  "payment-receipt": () => import("@/app/print/payment-receipt/[id]/page"),
  "purchase-order": () => import("@/app/print/purchase-order/[id]/page"),
  "requisition": () => import("@/app/print/requisition/[id]/page"),
  "sale-draft": () => import("@/app/print/sale-draft/[id]/page"),
  "sale-invoice": () => import("@/app/print/sale-invoice/[id]/page"),
  "scrap": () => import("@/app/print/scrap/[id]/page"),
  "stock-counts": () => import("@/app/print/stock-counts/[id]/page"),
  "stock-transfer": () => import("@/app/print/stock-transfer/[id]/page"),
  "supplier-invoice": () => import("@/app/print/supplier-invoice/[id]/page"),
  "supplier-payment": () => import("@/app/print/supplier-payment/[id]/page"),
  "tenancy-draft": () => import("@/app/print/tenancy-draft/[id]/page"),
  "unit-spec": () => import("@/app/print/unit-spec/[id]/page"),
  // Sale booking form lives outside /print/ but is the same kind of document.
  "sale-form": () => import("@/app/sales/[id]/print/page"),
};

export default async function MobilePrintPage({
  params,
}: {
  params: Promise<{ type: string; id: string }>;
}) {
  const { type, id } = await params;
  const loader = PAGES[type];
  if (!loader) notFound();
  const { default: Page } = await loader();
  return <Page params={Promise.resolve({ id })} />;
}
