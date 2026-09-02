import { redirect } from "next/navigation";

export const metadata = { title: "Scrap Generations · Nirman" };

export default function MobileScrapGenerationsPage() {
  // Scrap generations live inside the Stock hub as a tab.
  redirect("/m/stock?tab=scrap");
}
