import { redirect } from "next/navigation";

/**
 * /m/rent — alias for the Rentals tab in the Real Estate hub.
 * Users typing the obvious short URL should not get a 404.
 */
export default function RentRedirect() {
  redirect("/m/real-estate?tab=rentals");
}
