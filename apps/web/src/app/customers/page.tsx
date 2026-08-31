import { redirect } from "next/navigation";

export const metadata = { title: "Customers · Nirman" };

export default function CustomersPage() {
  // The customer directory lives inside the Sales page as a tab.
  // Redirect there so the user lands on the customer list, not the sales pipeline.
  redirect("/sales?tab=customers");
}
