/**
 * Customer-dues helpers — the ONE definition of "how much does this buyer
 * still owe us".
 *
 * Why this exists: the owner screens each re-derived the number and disagreed
 * on the same data. `/finance` netted TDS out and excluded GST, the bookings
 * board used `contract + GST − paid` (so it billed customers for the 1% TDS
 * they had already deposited with the Income Tax Department), and the Today
 * AR tile read the GL instead. The owner saw ₹49K, ₹9.49L and ₹1.09L for the
 * same book of business and could not tell which to chase.
 *
 * The correct obligation is:
 *
 *   dues = salePrice + GST − TDS withheld by the buyer − principal received
 *
 * GST is part of what the buyer pays. TDS under s.194-IA is withheld from the
 * payment and deposited by the buyer, so it discharges that much of the
 * obligation. Late-payment interest is income, not principal — collecting it
 * must never reduce outstanding dues. Payments marked VOID never happened.
 *
 * Per-sale floor at zero: an overpaid sale is a customer credit, not a
 * discount against another buyer's dues.
 */

export type SalePaymentLike = {
  amount: number | string | { toString(): string };
  interestAmount?: number | string | { toString(): string } | null;
  status?: string | null;
};

export type SaleDueLike = {
  salePrice: number | string | { toString(): string };
  gstAmount?: number | string | { toString(): string } | null;
  tdsAmount?: number | string | { toString(): string } | null;
  payments?: SalePaymentLike[];
  /**
   * Already-computed principal received (VOID excluded, interest stripped).
   * List payloads often carry this instead of the raw payment rows; when set
   * it wins over `payments`.
   */
  principalPaid?: number | null;
};

function n(v: number | string | { toString(): string } | null | undefined): number {
  if (v == null) return 0;
  const num = typeof v === "number" ? v : Number(v.toString());
  return Number.isFinite(num) ? num : 0;
}

/** Contract value the buyer agreed to pay, GST included. */
export function saleContractValue(sale: SaleDueLike): number {
  return n(sale.salePrice) + n(sale.gstAmount);
}

/** Principal received — VOID payments ignored, late interest stripped out. */
export function principalCollected(payments: SalePaymentLike[] | undefined): number {
  if (!payments) return 0;
  return payments.reduce((sum, p) => {
    if (p.status === "VOID") return sum;
    return sum + n(p.amount) - n(p.interestAmount);
  }, 0);
}

/** What the buyer still owes on this sale (never negative). */
export function saleDues(sale: SaleDueLike): number {
  const paid = sale.principalPaid != null ? n(sale.principalPaid) : principalCollected(sale.payments);
  const owed = saleContractValue(sale) - n(sale.tdsAmount) - paid;
  return Math.max(0, owed);
}

/**
 * Receivables summary over a set of sales — what every owner surface shows.
 * `dues` counts only positive balances so overpayments don't mask real dues.
 */
export function saleDuesSummary(sales: SaleDueLike[]): {
  booked: number;
  collected: number;
  dues: number;
  salesWithDues: number;
} {
  let booked = 0;
  let collected = 0;
  let dues = 0;
  let salesWithDues = 0;
  for (const sale of sales) {
    booked += n(sale.salePrice);
    collected += sale.principalPaid != null ? n(sale.principalPaid) : principalCollected(sale.payments);
    const d = saleDues(sale);
    dues += d;
    if (d > 0.5) salesWithDues += 1;
  }
  return { booked, collected, dues, salesWithDues };
}
