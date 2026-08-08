import { redirect } from "next/navigation";

export const metadata = { title: "Customers · Nirman" };

export default function CustomersPage() {
  redirect("/sales");
}
