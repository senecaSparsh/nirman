import { redirect } from "next/navigation";
import { withSurfaceParam } from "@/lib/surface-map";

/**
 * /m/rent — alias for the Rentals tab in the Real Estate hub.
 * Users typing the obvious short URL should not get a 404.
 */
export default async function RentRedirect({
  searchParams,
}: {
  searchParams: Promise<{ __surface?: string }>;
}) {
  const params = await searchParams;
  redirect(withSurfaceParam("/m/real-estate?tab=rentals", params));
}
