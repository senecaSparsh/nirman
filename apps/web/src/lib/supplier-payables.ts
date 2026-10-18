/**
 * Supplier.balanceOwed is the reconciled AP subledger — reconcileSupplierAp
 * checks it against each supplier's GL AP slice. PO receipts are allocated to
 * POs FIFO after payments, but that allocation ignores supplier returns, so a
 * supplier's PO rows can sum above their card. Trim the newest PO payables down
 * to the card; whatever card balance the POs don't explain is the opening /
 * bills row. Per-supplier totals then equal the Vendors "Owed" column.
 */
export function squareToSupplierCards<T extends { supplierId: string; payable: number }>(
  poRows: T[],
  cards: { id: string; balanceOwed: number }[],
) {
  const rows = poRows.map((r) => ({ ...r }));
  const unexplained = new Map<string, number>();
  for (const card of cards) {
    const balance = Math.max(0, card.balanceOwed);
    const sumFor = () => rows.reduce((s, r) => (r.supplierId === card.id ? s + r.payable : s), 0);
    let excess = sumFor() - balance;
    for (let i = rows.length - 1; i >= 0 && excess > 0.005; i--) {
      const row = rows[i];
      if (!row || row.supplierId !== card.id) continue;
      const cut = Math.min(excess, row.payable);
      row.payable -= cut;
      excess -= cut;
    }
    const remainder = balance - sumFor();
    if (remainder > 0.01) unexplained.set(card.id, remainder);
  }
  return { poRows: rows.filter((r) => r.payable > 0.01), unexplained };
}
