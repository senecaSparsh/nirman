import { redirect } from "next/navigation";

export const metadata = { title: "Bank SMS · Nirman" };

export default function SmsPage() {
  redirect("/sales?tab=bank-sms");
}
