import { redirect } from "next/navigation";

export const metadata = { title: "Scrap Generation · Nirman" };

export default function ScrapGenerationsPage() {
  redirect("/stock?tab=scrap");
}
