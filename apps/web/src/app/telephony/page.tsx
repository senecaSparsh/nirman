import { redirect } from "next/navigation";

export const metadata = { title: "Telephony · Nirman" };

export default function TelephonyPage() {
  redirect("/calls?tab=telephony");
}
