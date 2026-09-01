import { PageHeader } from "@/components/page-header";
import { BackupSettings } from "./BackupSettings";

export const metadata = { title: "Backup & Restore" };

export default function BackupPage() {
  return (
    <>
      <PageHeader
        title="Backup & Restore"
        description="Download a complete copy of your company data. Store it safely — it contains all financial, operational, and customer records."
      />
      <BackupSettings />
    </>
  );
}
