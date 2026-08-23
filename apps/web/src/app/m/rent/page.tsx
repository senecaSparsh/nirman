import { redirect } from "next/navigation";

/**
 * /m/rent — alias for the Rentals module at /m/rentals.
 * Users typing the obvious short URL should not get a 404.
 */
export default function RentRedirect() {
  redirect("/m/rentals");
}
