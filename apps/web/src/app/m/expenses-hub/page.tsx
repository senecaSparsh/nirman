import { redirect } from "next/navigation";

export default function ExpensesHubPage() {
  redirect("/m/accounts?tab=expenses");
}
