import { formatDate } from "@/lib/utils";

/**
 * Shared print document header — two-tier layout with clear visual hierarchy:
 *   Row 1: Company name (brand, large bold) + address/GSTIN subtext
 *   Row 2: Document title (small, in a dark pill) · doc number + date (right, mono)
 * No separator line — the size/weight contrast creates the distinction.
 */
export function PrintHeader({
  company,
  title,
  docNumber,
  date,
  extra,
}: {
  company: { name: string; address?: string | null; gstin?: string | null; phone?: string | null; email?: string | null };
  title: string;
  docNumber: string;
  date: Date | string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="border-b-2 border-black pb-2">
      {/* Row 1 — Company brand (full width, prominent) */}
      <div>
        <h1 className="text-xl font-bold leading-tight">{company.name}</h1>
        <div className="text-xs text-gray-500 leading-snug">
          {company.address && <span>{company.address}</span>}
          {(company.gstin || company.phone) && (
            <span className="ml-2">
              {company.gstin && <span>GSTIN: {company.gstin}</span>}
              {company.gstin && company.phone && <span className="mx-1.5 text-gray-300">|</span>}
              {company.phone && <span>Ph: {company.phone}</span>}
            </span>
          )}
        </div>
      </div>

      {/* Row 2 — Doc title pill (left) · number + date (right) */}
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="inline-block rounded bg-gray-900 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-white">
          {title}
        </span>
        <div className="text-right">
          <div className="font-mono text-sm font-bold leading-tight">{docNumber}</div>
          <div className="text-xs text-gray-500">{formatDate(date)}</div>
          {extra}
        </div>
      </div>
    </div>
  );
}
