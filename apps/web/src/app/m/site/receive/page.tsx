import { redirect } from "next/navigation";

export default async function SiteReceivePage({
  searchParams,
}: {
  searchParams: Promise<{ po?: string }>;
}) {
  const params = await searchParams;
  redirect("/m/site/field" + (params.po ? "?po=" + params.po : ""));
}
