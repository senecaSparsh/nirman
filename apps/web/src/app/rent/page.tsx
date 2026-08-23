import { redirect } from "next/navigation";

/**
 * /rent — alias for the Rentals module at /rentals.
 */
export default function RentRedirect() {
  redirect("/rentals");
}
