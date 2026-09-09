import { redirect } from "next/navigation";

export const metadata = { title: "Real Estate Inventory · Nirman" };

export default function RealEstateInventoryPage() {
  redirect("/reports/real-estate-inventory");
}
