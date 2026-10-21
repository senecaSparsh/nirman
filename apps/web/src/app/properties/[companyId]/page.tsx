import { connection } from "next/server";
import { notFound } from "next/navigation";
import { prisma } from "@nirman/db";
import { formatCurrency } from "@/lib/utils";
import { EnquiryForm } from "./enquiry-form";
import Image from "next/image";
import Link from "next/link";
import { MapPin, Phone } from "lucide-react";
import { SitePourFigure } from "@/components/figures/site-pour/figure";

/**
 * Public property-discovery page — the buyer-facing catalogue. Renders a
 * company's LISTED portal listings with photos, price, area and a project
 * line, plus an enquiry form per card that lands as a PORTAL lead.
 * Unauthenticated by design; gated per-company by publicListingsEnabled.
 */
export default async function PublicPropertiesPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  await connection();
  const { companyId } = await params;

  const company = await prisma.company.findFirst({
    where: { id: companyId, deletedAt: null },
    select: {
      id: true, name: true, address: true, phone: true, email: true,
      publicListingsEnabled: true,
    },
  });
  if (!company || !company.publicListingsEnabled) notFound();

  const listings = await prisma.portalListing.findMany({
    where: {
      companyId: company.id,
      status: "LISTED",
      builtUnit: { deletedAt: null, status: "AVAILABLE" },
    },
    include: {
      builtUnit: {
        select: {
          unitNumber: true,
          project: { select: { name: true, address: true, reraNumber: true } },
        },
      },
    },
    orderBy: { listedAt: "desc" },
    take: 60,
  });

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Public header — deliberately minimal, no auth chrome */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{company.name}</h1>
            {company.address && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                <MapPin className="h-3 w-3" /> {company.address}
              </p>
            )}
          </div>
          {company.phone && (
            <a href={`tel:${company.phone}`} className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
              <Phone className="h-4 w-4" /> Call
            </a>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <h2 className="text-lg font-semibold text-slate-900">Available Properties</h2>
        <p className="mt-1 text-sm text-slate-500">{listings.length} unit{listings.length !== 1 ? "s" : ""} currently open for booking.</p>

        {listings.length === 0 ? (
          <div className="mt-8 rounded-lg border border-slate-200 bg-white p-8 text-center">
            <SitePourFigure className="mx-auto max-w-lg [&_.iso-plate]:border-0 [&_.iso-figure]:m-0 [&_.iso-plate]:rounded-none" />
            <p className="mt-2 font-medium text-slate-700">Still pouring.</p>
            <p className="mt-1 text-sm text-slate-500">No properties listed right now — check back soon, or call us and we&rsquo;ll tell you what&rsquo;s coming.</p>
          </div>
        ) : (
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            {listings.map((l) => {
              const u = l.builtUnit;
              const photo = l.photos[0];
              return (
                <div key={l.id} className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                  {photo ? (
                    <div className="relative h-44 w-full bg-slate-100">
                      <Image src={photo} alt={l.title} fill className="object-cover" sizes="(max-width: 640px) 100vw, 50vw" unoptimized />
                    </div>
                  ) : (
                    <div className="flex h-44 w-full items-center justify-center bg-slate-100 text-4xl text-slate-300">🏠</div>
                  )}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-slate-900 leading-snug">{l.title}</h3>
                      <span className="shrink-0 rounded bg-emerald-50 px-2 py-0.5 text-sm font-bold text-emerald-700">
                        {formatCurrency(Number(l.askingPrice))}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {[l.bedrooms && `${l.bedrooms} BHK`, l.area && `${Number(l.area)} ${l.areaUnit}`, u.project.name].filter(Boolean).join(" · ")}
                    </p>
                    {u.project.address && <p className="mt-0.5 text-xs text-slate-500">{u.project.address}</p>}
                    {u.project.reraNumber && <p className="mt-0.5 text-[11px] text-slate-400">RERA: {u.project.reraNumber}</p>}
                    {l.description && <p className="mt-2 line-clamp-2 text-xs text-slate-500">{l.description}</p>}

                    <details className="mt-3">
                      <summary className="cursor-pointer rounded-md bg-slate-900 px-3 py-2 text-center text-sm font-semibold text-white">
                        Enquire about this property
                      </summary>
                      <EnquiryForm companyId={company.id} builtUnitId={u.unitNumber ? l.builtUnitId : null} projectName={u.project.name} />
                    </details>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="mt-10 text-center text-[11px] text-slate-400">
          Powered by <Link href="/" className="underline">Nirman</Link> — inventory &amp; collections for Indian builders.
        </p>
      </main>
    </div>
  );
}
