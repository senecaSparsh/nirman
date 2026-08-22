import { notFound } from "next/navigation";
import { getPrintableSaleData } from "@nirman/services";
import { PrintHeader } from "@/components/print/print-header";
import { PrintButton } from "./print-button";
import { formatCurrency, formatDate } from "@/lib/utils";
import { toNum, getCompany } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function PrintableSaleFormPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userCompany = await getCompany();

  let data;
  try {
    data = await getPrintableSaleData(id, userCompany.id);
  } catch {
    notFound();
  }

  const { sale, landParcel, projectUnits } = data;

  if (!sale) notFound();

  const company = sale.company;
  const customer = sale.customer;
  const totalPaid = sale.payments.reduce((s, p) => s + toNum(p.amount), 0);
  const balanceDue = toNum(sale.salePrice) + toNum(sale.gstAmount) - totalPaid;

  const sellerBorneExpenses = sale.expenses.filter((e) => e.borneBy === "SELLER");
  const clientBorneExpenses = sale.expenses.filter((e) => e.borneBy === "CLIENT");
  const totalSellerBorne = sellerBorneExpenses.reduce((s, e) => s + toNum(e.amount), 0);
  const totalClientBorne = clientBorneExpenses.reduce((s, e) => s + toNum(e.amount), 0);

  const extraTermsTotal = sale.terms
    .filter((t) => !t.isIncluded && t.extraAmount)
    .reduce((s, t) => s + toNum(t.extraAmount!), 0);

  return (
    <div className="mx-auto max-w-4xl bg-white p-8 print:p-0">
      <PrintHeader
        company={{
          name: company.name,
          address: company.address,
          gstin: company.gstin,
          phone: company.phone,
          email: company.email,
        }}
        title="Sale Booking Form"
        docNumber={sale.saleNumber}
        date={sale.saleDate}
        extra={
          <div className="text-xs text-gray-500">
            {sale.assetType === "LAND" ? "Land Sale" : sale.assetType === "BUILT_UNIT" ? "Unit Sale" : "Project Sale"}
          </div>
        }
      />

      {/* Print button (hidden on print) */}
      <div className="mt-4 flex justify-end print:hidden">
        <PrintButton />
      </div>

      {/* ── Party Details ── */}
      <Section title="Party Details">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h3 className="text-xs font-semibold uppercase text-gray-500 mb-1">Seller (Company)</h3>
            <div className="text-sm">
              <div className="font-bold">{company.name}</div>
              {company.address && <div className="text-gray-600">{company.address}</div>}
              {company.gstin && <div className="text-gray-600">GSTIN: {company.gstin}</div>}
              {company.phone && <div className="text-gray-600">Ph: {company.phone}</div>}
            </div>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase text-gray-500 mb-1">Buyer (Customer)</h3>
            <div className="text-sm">
              <div className="font-bold">{customer.name}</div>
              {customer.phone && <div className="text-gray-600">Ph: {customer.phone}</div>}
              {customer.email && <div className="text-gray-600">{customer.email}</div>}
              {customer.address && <div className="text-gray-600">{customer.address}</div>}
            </div>
          </div>
        </div>
      </Section>

      {/* ── Asset Details ── */}
      <Section title="Asset Details">
        {sale.assetType === "LAND" && landParcel && (
          <div className="grid grid-cols-3 gap-4 text-sm">
            <Field label="Plot Number" value={landParcel.number} />
            <Field label="Area" value={`${toNum(landParcel.area)} ${landParcel.areaUnit}`} />
            <Field label="Project" value={sale.project?.name ?? "Standalone"} />
          </div>
        )}
        {sale.assetType === "BUILT_UNIT" && sale.builtUnit && (
          <div className="grid grid-cols-3 gap-4 text-sm">
            <Field label="Unit Number" value={sale.builtUnit.unitNumber} />
            <Field label="Type" value={sale.builtUnit.unitType.replace(/_/g, " ")} />
            <Field label="Area" value={`${toNum(sale.builtUnit.area)} ${sale.builtUnit.areaUnit}`} />
            <Field label="Floor" value={sale.builtUnit.floor?.toString() ?? "—"} />
            <Field label="Wing" value={sale.builtUnit.wing ?? "—"} />
            <Field label="Project" value={sale.project?.name ?? "—"} />
          </div>
        )}
        {sale.assetType === "PROJECT" && projectUnits.length > 0 && (
          <div>
            <div className="mb-2 text-sm">
              <span className="font-semibold">Project:</span> {sale.project?.name}
              <span className="ml-3 text-gray-600">{projectUnits.length} units</span>
            </div>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-gray-300 bg-gray-50">
                  <th className="py-1 px-2 text-left">Unit No.</th>
                  <th className="py-1 px-2 text-left">Type</th>
                  <th className="py-1 px-2 text-right">Area</th>
                </tr>
              </thead>
              <tbody>
                {projectUnits.map((u) => (
                  <tr key={u.id} className="border-b border-gray-200">
                    <td className="py-1 px-2">{u.unitNumber}</td>
                    <td className="py-1 px-2">{u.unitType.replace(/_/g, " ")}</td>
                    <td className="py-1 px-2 text-right">{toNum(u.area)} {u.areaUnit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ── Financial Summary ── */}
      <Section title="Financial Summary">
        <table className="w-full text-sm">
          <tbody>
            <tr className="border-b border-gray-200">
              <td className="py-1.5 font-medium">Deal Price</td>
              <td className="py-1.5 text-right tnum">{formatCurrency(toNum(sale.salePrice))}</td>
            </tr>
            {toNum(sale.gstAmount) > 0 && (
              <tr className="border-b border-gray-200">
                <td className="py-1.5">GST ({toNum(sale.gstRate)}%)</td>
                <td className="py-1.5 text-right tnum">{formatCurrency(toNum(sale.gstAmount))}</td>
              </tr>
            )}
            {totalClientBorne > 0 && (
              <tr className="border-b border-gray-200">
                <td className="py-1.5">Client-Borne Expenses</td>
                <td className="py-1.5 text-right tnum">{formatCurrency(totalClientBorne)}</td>
              </tr>
            )}
            {extraTermsTotal > 0 && (
              <tr className="border-b border-gray-200">
                <td className="py-1.5">Extra Charges (Terms)</td>
                <td className="py-1.5 text-right tnum">{formatCurrency(extraTermsTotal)}</td>
              </tr>
            )}
            {sale.commissionAmount && sale.commissionIsPartOfDeal && (
              <tr className="border-b border-gray-200 text-gray-600">
                <td className="py-1.5">Less: Broker Commission (in deal)</td>
                <td className="py-1.5 text-right tnum">- {formatCurrency(toNum(sale.commissionAmount))}</td>
              </tr>
            )}
            <tr className="border-b-2 border-gray-400 font-bold">
              <td className="py-2">Total Collectible</td>
              <td className="py-2 text-right tnum">
                {formatCurrency(toNum(sale.salePrice) + toNum(sale.gstAmount) + totalClientBorne + extraTermsTotal - (sale.commissionIsPartOfDeal ? toNum(sale.commissionAmount ?? 0) : 0))}
              </td>
            </tr>
            <tr className="border-b border-gray-200">
              <td className="py-1.5">Total Paid</td>
              <td className="py-1.5 text-right tnum text-green-700">{formatCurrency(totalPaid)}</td>
            </tr>
            <tr className="font-bold">
              <td className="py-2">Balance Due</td>
              <td className="py-2 text-right tnum text-red-700">{formatCurrency(balanceDue)}</td>
            </tr>
          </tbody>
        </table>
      </Section>

      {/* ── Payment Schedule ── */}
      {sale.paymentSchedule && sale.paymentSchedule.items.length > 0 && (
        <Section title={`Payment Schedule (${sale.paymentSchedule.type})`}>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-gray-300 bg-gray-50">
                <th className="py-1 px-2 text-left">#</th>
                <th className="py-1 px-2 text-left">Description</th>
                <th className="py-1 px-2 text-right">%</th>
                <th className="py-1 px-2 text-right">Amount</th>
                <th className="py-1 px-2 text-right">Due Date</th>
              </tr>
            </thead>
            <tbody>
              {sale.paymentSchedule.items.map((item) => (
                <tr key={item.id} className="border-b border-gray-200">
                  <td className="py-1 px-2">{item.installmentNo}</td>
                  <td className="py-1 px-2">{item.description}</td>
                  <td className="py-1 px-2 text-right">{toNum(item.percentage)}%</td>
                  <td className="py-1 px-2 text-right tnum">{formatCurrency(toNum(item.amount))}</td>
                  <td className="py-1 px-2 text-right">{item.dueDate ? formatDate(item.dueDate) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* ── Expense Heads ── */}
      {sale.expenses.length > 0 && (
        <Section title="Expense Heads">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-gray-300 bg-gray-50">
                <th className="py-1 px-2 text-left">Head</th>
                <th className="py-1 px-2 text-left">Borne By</th>
                <th className="py-1 px-2 text-right">Amount</th>
                <th className="py-1 px-2 text-center">Included?</th>
              </tr>
            </thead>
            <tbody>
              {sale.expenses.map((e) => (
                <tr key={e.id} className="border-b border-gray-200">
                  <td className="py-1 px-2">{e.label ?? e.head.replace(/_/g, " ")}</td>
                  <td className="py-1 px-2">{e.borneBy === "CLIENT" ? "Client" : e.borneBy === "SELLER" ? "Seller" : "N/A"}</td>
                  <td className="py-1 px-2 text-right tnum">{formatCurrency(toNum(e.amount))}</td>
                  <td className="py-1 px-2 text-center">{e.isIncluded ? "✓" : "Extra"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* ── Terms & Conditions ── */}
      {sale.terms.length > 0 && (
        <Section title="Terms & Conditions">
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {sale.terms.map((t) => (
              <li key={t.id}>
                {t.description}
                {t.extraAmount && !t.isIncluded && (
                  <span className="ml-2 text-gray-600">(Extra: {formatCurrency(toNum(t.extraAmount))})</span>
                )}
              </li>
            ))}
          </ol>
        </Section>
      )}

      {/* ── Broker Details ── */}
      {sale.dealSource === "BROKER" && (sale.brokerName || sale.broker?.name) && (
        <Section title="Broker Details">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <Field label="Name" value={sale.broker?.name ?? sale.brokerName ?? "—"} />
            <Field label="Phone" value={sale.broker?.phone ?? sale.brokerPhone ?? "—"} />
            <Field label="Agency" value={sale.broker?.agency ?? "—"} />
            <Field label="Commission" value={sale.commissionAmount ? formatCurrency(toNum(sale.commissionAmount)) : "—"} />
            <Field label="Part of Deal" value={sale.commissionIsPartOfDeal ? "Yes" : "No"} />
            <Field label="Commission Paid" value={sale.commissionPaid ? "Yes" : "Pending"} />
          </div>
        </Section>
      )}

      {/* ── Compliance ── */}
      <Section title="Compliance & Documents">
        <div className="grid grid-cols-3 gap-4 text-sm">
          <Field label="Allotment Letter No." value={sale.allotmentLetterNo ?? "—"} />
          <Field label="Allotment Date" value={sale.allotmentDate ? formatDate(sale.allotmentDate) : "—"} />
          <Field label="BBA No." value={sale.bbaNo ?? "—"} />
          <Field label="BBA Date" value={sale.bbaDate ? formatDate(sale.bbaDate) : "—"} />
          <Field label="Sale Deed No." value={sale.saleDeedNo ?? "—"} />
          <Field label="Expected Registry" value={sale.expectedRegistryDate ? formatDate(sale.expectedRegistryDate) : "—"} />
          {sale.homeLoanBank && (
            <>
              <Field label="Home Loan Bank" value={sale.homeLoanBank} />
              <Field label="Loan Amount" value={sale.homeLoanAmount ? formatCurrency(toNum(sale.homeLoanAmount)) : "—"} />
              <Field label="Sanction No." value={sale.homeLoanSanctionNo ?? "—"} />
            </>
          )}
          {sale.tdsAmount && (
            <>
              <Field label="TDS Amount" value={formatCurrency(toNum(sale.tdsAmount))} />
              <Field label="TDS Certificate" value={sale.tdsCertificateNo ?? "—"} />
            </>
          )}
        </div>
      </Section>

      {/* ── Deal Terms ── */}
      {(sale.dealMaturityMonths || sale.paymentCycle) && (
        <Section title="Deal Terms">
          <div className="grid grid-cols-3 gap-4 text-sm">
            {sale.dealMaturityMonths && (
              <Field label="Maturity (months)" value={String(sale.dealMaturityMonths)} />
            )}
            {sale.dealMaturityDate && (
              <Field label="Maturity Date" value={formatDate(sale.dealMaturityDate)} />
            )}
            {sale.paymentCycle && (
              <Field label="Payment Cycle" value={sale.paymentCycle} />
            )}
          </div>
        </Section>
      )}

      {/* ── Notes ── */}
      {sale.notes && (
        <Section title="Notes">
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{sale.notes}</p>
        </Section>
      )}

      {/* ── Signatures ── */}
      <div className="mt-12 grid grid-cols-3 gap-8 text-sm">
        <div className="border-t border-gray-400 pt-1">
          <div className="text-gray-600">Seller Signature</div>
          <div className="text-xs text-gray-400 mt-0.5">Authorized Signatory</div>
        </div>
        <div className="border-t border-gray-400 pt-1">
          <div className="text-gray-600">Buyer Signature</div>
          <div className="text-xs text-gray-400 mt-0.5">Customer Acknowledgement</div>
        </div>
        <div className="border-t border-gray-400 pt-1">
          <div className="text-gray-600">Witness</div>
          <div className="text-xs text-gray-400 mt-0.5">Name & Signature</div>
        </div>
      </div>

      {/* ── Payments History ── */}
      {sale.payments.length > 0 && (
        <Section title="Payment History">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-gray-300 bg-gray-50">
                <th className="py-1 px-2 text-left">Date</th>
                <th className="py-1 px-2 text-left">Mode</th>
                <th className="py-1 px-2 text-left">Reference</th>
                <th className="py-1 px-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {sale.payments.map((p) => (
                <tr key={p.id} className="border-b border-gray-200">
                  <td className="py-1 px-2">{formatDate(p.paymentDate)}</td>
                  <td className="py-1 px-2">{p.mode.replace(/_/g, " ")}</td>
                  <td className="py-1 px-2">{p.reference ?? "—"}</td>
                  <td className="py-1 px-2 text-right tnum">{formatCurrency(toNum(p.amount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      <div className="mt-6 text-center text-xs text-gray-400">
        Generated on {formatDate(new Date())} · {sale.saleNumber}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <h2 className="mb-3 border-b border-gray-300 pb-1 text-sm font-bold uppercase tracking-wide text-gray-700">
        {title}
      </h2>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
