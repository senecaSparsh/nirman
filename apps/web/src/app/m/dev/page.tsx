import { redirect } from "next/navigation";

// /m/dev has no index — only the error-tester child. Same convention as
// /m/alerts: land the bare path on its one surface instead of a 404.
export default function MobileDevPage() {
  redirect("/m/dev/errors");
}
