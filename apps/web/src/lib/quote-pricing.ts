import Decimal from "decimal.js";

export type QuoteEntryLine = {
  qty: number;
  unitPrice: number;
  gstRate: number;
  freightPerUnit?: number;
  loadingPerUnit?: number;
  packingPerUnit?: number;
  insurancePerUnit?: number;
  handlingPerUnit?: number;
  buyerTransportPerUnit?: number;
  discountPerUnit?: number;
};

export function quoteEntryTotals(lines: QuoteEntryLine[]) {
  let subtotal = new Decimal(0);
  let gst = new Decimal(0);
  let freight = new Decimal(0);
  let loading = new Decimal(0);
  let packing = new Decimal(0);
  let insurance = new Decimal(0);
  let handling = new Decimal(0);
  let buyerTransport = new Decimal(0);
  let discount = new Decimal(0);

  for (const line of lines) {
    const qty = new Decimal(line.qty);
    const price = new Decimal(line.unitPrice);
    const lineDiscount = new Decimal(line.discountPerUnit ?? 0);
    const linePacking = new Decimal(line.packingPerUnit ?? 0);
    const taxable = price.minus(lineDiscount).plus(linePacking);
    subtotal = subtotal.plus(qty.times(price));
    gst = gst.plus(qty.times(taxable).times(line.gstRate).div(100));
    freight = freight.plus(qty.times(line.freightPerUnit ?? 0));
    loading = loading.plus(qty.times(line.loadingPerUnit ?? 0));
    packing = packing.plus(qty.times(linePacking));
    insurance = insurance.plus(qty.times(line.insurancePerUnit ?? 0));
    handling = handling.plus(qty.times(line.handlingPerUnit ?? 0));
    buyerTransport = buyerTransport.plus(qty.times(line.buyerTransportPerUnit ?? 0));
    discount = discount.plus(qty.times(lineDiscount));
  }

  const round = (amount: Decimal) => amount.toDecimalPlaces(2).toNumber();
  const gstTotal = round(gst);
  const freightTotal = round(freight);
  const otherLandedCosts = round(loading.plus(packing).plus(insurance).plus(handling).plus(buyerTransport));
  const discountTotal = round(discount);
  return {
    subtotal: round(subtotal),
    gst: gstTotal,
    freight: freightTotal,
    landed: round(subtotal.plus(gst).plus(freight).plus(loading).plus(packing).plus(insurance).plus(handling).plus(buyerTransport).minus(discount)),
    otherLandedCosts,
    discount: discountTotal,
  };
}
