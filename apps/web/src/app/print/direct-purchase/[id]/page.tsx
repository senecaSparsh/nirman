import { connection } from "next/server";
import { PrintToolbar } from "@/components/print/print-button";
import { PrintHeader } from "@/components/print/print-header";
import { prisma } from "@nirman/db";
import { toNum, getUserRole, getCompany } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { amountInWords } from "@nirman/services";
import { formatCurrency, formatDate } from "@/lib/utils";
import { notFound } from "next/navigation";

/**
 * Print-friendly Store Purchase Voucher — matches the client's paper layout.
 * Shows the direct purchase with particulars, qty, rate, value, and total.
 * Opened in a new tab from the Purchase Register or Direct Purchases page.
 */
export default async function DirectPurchaseVoucherPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;

  // Gate access — purchase vouchers show material costs and supplier info.
  const role = await getUserRole();
  if (!hasPermission(role, PERM.PROCUREMENT_VIEW)) {
    notFound();
  }
  const company = await getCompany();

  const purchase = await prisma.directPurchase.findFirst({
    where: { id, companyId: company.id },
    include: {
      supplier: { select: { name: true, phone: true, gstin: true, address: true } },
      location: { select: { name: true } },
      lines: {
        include: {
          material: { select: { code: true, name: true, unit: true } },
        },
        orderBy: { material: { name: "asc" } },
      },
    },
  });

  if (!purchase) notFound();

  const subtotal = toNum(purchase.subtotal);
  const gstTotal = toNum(purchase.gstTotal);
  const roundOff = toNum(purchase.roundOff);
  const billAmount = toNum(purchase.billAmount);
  const words = amountInWords(billAmount);
  const supplierName = purchase.supplier?.name ?? purchase.supplierName;

  return (<>
          <PrintToolbar title="Direct Purchase Voucher" />
    <div className="print-page mx-auto max-w-2xl bg-white p-8 text-black print:p-4">
      <PrintHeader
        company={company}
        title="Direct Purchase Voucher"
        docNumber={purchase.billNumber}
        date={purchase.billDate}
      />

      {/* Supplier + receipt info */}
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-md border border-gray-300 p-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Supplier</div>
          <div className="font-semibold">{supplierName}</div>
          {purchase.supplier?.gstin && <div className="text-xs text-gray-500">GSTIN: {purchase.supplier.gstin}</div>}
          {purchase.supplier?.phone && <div className="text-xs text-gray-500">Ph: {purchase.supplier.phone}</div>}
        </div>
        <div className="rounded-md border border-gray-300 p-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Received At</div>
          <div className="font-semibold">{purchase.location.name}</div>
        </div>
      </div>

      {/* Line items table */}
      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-black">
            <th className="border-r border-gray-300 px-2 py-1.5 text-left font-semibold">Sr.</th>
            <th className="border-r border-gray-300 px-2 py-1.5 text-left font-semibold">
              Description of Goods
            </th>
            <th className="border-r border-gray-300 px-2 py-1.5 text-right font-semibold">Qty</th>
            <th className="border-r border-gray-300 px-2 py-1.5 text-right font-semibold">Rate</th>
            <th className="border-r border-gray-300 px-2 py-1.5 text-left font-semibold">Per</th>
            <th className="px-2 py-1.5 text-right font-semibold">Value</th>
          </tr>
        </thead>
        <tbody>
          {purchase.lines.map((line, i) => (
            <tr key={line.id} className="border-b border-gray-200">
              <td className="border-r border-gray-300 px-2 py-1.5 text-center">{i + 1}</td>
              <td className="border-r border-gray-300 px-2 py-1.5">
                {line.material.name}
                <span className="ml-1 text-xs text-gray-500">({line.material.code})</span>
              </td>
              <td className="border-r border-gray-300 px-2 py-1.5 text-right tnum">
                {toNum(line.qty)}
              </td>
              <td className="border-r border-gray-300 px-2 py-1.5 text-right tnum">
                {formatCurrency(toNum(line.unitCost))}
              </td>
              <td className="border-r border-gray-300 px-2 py-1.5 text-center text-gray-600">
                {line.material.unit}
              </td>
              <td className="px-2 py-1.5 text-right tnum">
                {formatCurrency(toNum(line.qty) * toNum(line.unitCost))}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          {purchase.lines.length === 0 && (
            <tr className="border-t border-black">
              <td colSpan={5} className="px-2 py-1.5 text-right font-semibold">
                Bill Amount:
              </td>
              <td className="px-2 py-1.5 text-right font-bold tnum">
                {formatCurrency(billAmount)}
              </td>
            </tr>
          )}
          {gstTotal > 0 && (
            <>
              <tr className="border-t border-gray-300">
                <td colSpan={5} className="px-2 py-1.5 text-right font-semibold">
                  Subtotal:
                </td>
                <td className="px-2 py-1.5 text-right tnum">{formatCurrency(subtotal)}</td>
              </tr>
              <tr>
                <td colSpan={5} className="px-2 py-1.5 text-right font-semibold">
                  GST Total:
                </td>
                <td className="px-2 py-1.5 text-right tnum">{formatCurrency(gstTotal)}</td>
              </tr>
            </>
          )}
          {roundOff !== 0 && (
            <tr>
              <td colSpan={5} className="px-2 py-1.5 text-right font-semibold">
                Round Off:
              </td>
              <td className="px-2 py-1.5 text-right tnum">{formatCurrency(roundOff)}</td>
            </tr>
          )}
          <tr className="border-t-2 border-black">
            <td colSpan={5} className="px-2 py-2 text-right font-bold">
              Bill Amount:
            </td>
            <td className="px-2 py-2 text-right font-bold tnum">{formatCurrency(billAmount)}</td>
          </tr>
        </tfoot>
      </table>

      {/* Amount in words */}
      <div className="mt-3 text-sm">
        <span className="font-semibold">Amount Chargeable (in words): </span>
        <span className="italic">{words}</span>
      </div>

      {purchase.notes && (
        <div className="mt-2 text-sm">
          <span className="font-semibold">Notes: </span>
          <span>{purchase.notes}</span>
        </div>
      )}

      {/* Signature blocks */}
      <div className="mt-12 grid grid-cols-3 gap-8 text-center text-sm">
        <div className="border-t border-black pt-1">For Supplier</div>
        <div className="border-t border-black pt-1">Store Received</div>
        <div className="border-t border-black pt-1">Authorised Signatory</div>
      </div>

    </div>
    </>
  );
}
