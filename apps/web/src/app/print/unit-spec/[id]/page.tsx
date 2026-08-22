import { connection } from "next/server";
import { PrintToolbar } from "@/components/print/print-button";
import { PrintHeader } from "@/components/print/print-header";
import { prisma } from "@nirman/db";
import { toNum, getUserRole, getCompany } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { notFound } from "next/navigation";

/**
 * Print-friendly Unit Specification Sheet — shows all details of a
 * built unit (type, area, RERA fields, pricing, status) in a clean
 * layout suitable for sharing with prospective buyers.
 *
 * Mobile-responsive via the `print-page` class + globals.css overrides.
 */
export default async function UnitSpecSheetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;

  const role = await getUserRole();
  if (!hasPermission(role, PERM.ASSETS_VIEW)) {
    notFound();
  }
  const company = await getCompany();

  const unit = await prisma.builtUnit.findFirst({
    where: { id, deletedAt: null, project: { companyId: company.id } },
    include: {
      project: { select: { id: true, name: true, address: true, totalBudget: true } },
      phase: { select: { name: true } },
    },
  });

  if (!unit) notFound();

  const askingPrice = unit.askingPrice ? toNum(unit.askingPrice) : null;
  const area = toNum(unit.area);
  const carpetArea = unit.carpetArea ? toNum(unit.carpetArea) : null;
  const superBuiltUpArea = unit.superBuiltUpArea ? toNum(unit.superBuiltUpArea) : null;
  const balconyArea = unit.balconyArea ? toNum(unit.balconyArea) : null;
  const pricePerSqft = askingPrice && superBuiltUpArea
    ? askingPrice / superBuiltUpArea
    : askingPrice && area > 0
      ? askingPrice / area
      : null;

  return (<>
          <PrintToolbar title={`Unit ${unit.unitNumber} — ${unit.project.name}`} />
    <div className="print-page mx-auto max-w-2xl bg-white p-8 text-black print:p-4">
      <PrintHeader
        company={company}
        title="Unit Specification Sheet"
        docNumber={unit.unitNumber}
        date={new Date()}
        extra={<div className="text-xs text-gray-500">{unit.unitType.replace(/_/g, " ")}</div>}
      />

      {/* Project info */}
      <div className="mt-4 text-sm">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="font-semibold">Project</div>
            <div className="text-gray-600">{unit.project.name}</div>
          </div>
          <div className="border-l border-gray-300 pl-4">
            <div className="font-semibold">Phase</div>
            <div className="text-gray-600">{unit.phase?.name ?? "—"}</div>
          </div>
        </div>
        {unit.project.address && (
          <div className="mt-2 text-gray-600">{unit.project.address}</div>
        )}
      </div>

      {/* Unit specifications */}
      <div className="mt-4 rounded-md border border-gray-300 p-3 text-sm">
        <div className="mb-2 font-semibold">Unit Specifications</div>
        <table className="w-full">
          <tbody>
            <tr className="border-b border-gray-200">
              <td className="py-1.5 pr-4 text-gray-600">Unit Number</td>
              <td className="py-1.5 font-medium">{unit.unitNumber}</td>
            </tr>
            <tr className="border-b border-gray-200">
              <td className="py-1.5 pr-4 text-gray-600">Unit Type</td>
              <td className="py-1.5 font-medium">{unit.unitType.replace(/_/g, " ")}</td>
            </tr>
            {unit.floor != null && (
              <tr className="border-b border-gray-200">
                <td className="py-1.5 pr-4 text-gray-600">Floor</td>
                <td className="py-1.5 font-medium">{unit.floor}</td>
              </tr>
            )}
            {unit.wing && (
              <tr className="border-b border-gray-200">
                <td className="py-1.5 pr-4 text-gray-600">Wing</td>
                <td className="py-1.5 font-medium">{unit.wing}</td>
              </tr>
            )}
            <tr className="border-b border-gray-200">
              <td className="py-1.5 pr-4 text-gray-600">Built-Up Area</td>
              <td className="py-1.5 font-medium tnum">{formatNumber(area)} {unit.areaUnit}</td>
            </tr>
            {carpetArea != null && (
              <tr className="border-b border-gray-200">
                <td className="py-1.5 pr-4 text-gray-600">Carpet Area (RERA)</td>
                <td className="py-1.5 font-medium tnum">{formatNumber(carpetArea)} {unit.areaUnit}</td>
              </tr>
            )}
            {superBuiltUpArea != null && (
              <tr className="border-b border-gray-200">
                <td className="py-1.5 pr-4 text-gray-600">Super Built-Up Area</td>
                <td className="py-1.5 font-medium tnum">{formatNumber(superBuiltUpArea)} {unit.areaUnit}</td>
              </tr>
            )}
            {balconyArea != null && (
              <tr className="border-b border-gray-200">
                <td className="py-1.5 pr-4 text-gray-600">Balcony Area</td>
                <td className="py-1.5 font-medium tnum">{formatNumber(balconyArea)} {unit.areaUnit}</td>
              </tr>
            )}
            {unit.clearHeight != null && (
              <tr className="border-b border-gray-200">
                <td className="py-1.5 pr-4 text-gray-600">Clear Height</td>
                <td className="py-1.5 font-medium tnum">{formatNumber(toNum(unit.clearHeight))} m</td>
              </tr>
            )}
            {unit.hasLoadingDock && (
              <tr className="border-b border-gray-200">
                <td className="py-1.5 pr-4 text-gray-600">Loading Dock</td>
                <td className="py-1.5 font-medium">Yes</td>
              </tr>
            )}
            <tr className="border-b border-gray-200">
              <td className="py-1.5 pr-4 text-gray-600">Status</td>
              <td className="py-1.5 font-medium">{unit.status.replace(/_/g, " ")}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Pricing */}
      {askingPrice != null && (
        <div className="mt-4 rounded-md border border-gray-300 p-3 text-sm">
          <div className="mb-2 font-semibold">Pricing</div>
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <span className="text-gray-600">Asking Price</span>
              <span className="font-bold tnum">{formatCurrency(askingPrice)}</span>
            </div>
            {pricePerSqft != null && (
              <div className="flex justify-between">
                <span className="text-gray-600">Price per Sq.Ft</span>
                <span className="font-medium tnum">{formatCurrency(pricePerSqft)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-gray-200 pt-1.5">
              <span className="text-gray-600">Availability</span>
              <span className="font-medium">
                {unit.status === "AVAILABLE" ? "Available for Sale" : unit.status.replace(/_/g, " ")}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Contact footer */}
      <div className="mt-6 border-t border-gray-300 pt-3 text-xs text-gray-600">
        <div className="font-semibold text-gray-700">For more information:</div>
        <div>{company.name}</div>
        {company.address && <div>{company.address}</div>}
        {company.phone && <div>Ph: {company.phone}</div>}
        {company.email && <div>{company.email}</div>}
        {company.gstin && <div>GSTIN: {company.gstin}</div>}
      </div>

      <div className="mt-4 text-center text-xs text-gray-400">
        Generated on {new Date().toLocaleDateString("en-IN")}
      </div>

    </div>
    </>
  );
}
