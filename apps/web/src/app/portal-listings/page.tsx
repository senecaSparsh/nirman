import { redirect } from "next/navigation";

export const metadata = { title: "Portal Listings · Nirman" };

export default function PortalListingsPage() {
  redirect("/units");
}
