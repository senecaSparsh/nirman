import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Notice — Nirman",
  description: "What data Nirman collects about employees and how it is used.",
};

/**
 * Public privacy notice — readable without sign-in (middleware allows /privacy).
 *
 * Employee-facing notice covering the PII this product stores: gov IDs
 * (PAN/Aadhaar/PF/ESI/UAN), bank details, attendance + site check-ins, call
 * recordings where telephony is enabled, and audit trails.
 *
 * NOTE: this is a baseline internal-ERP notice — a lawyer should review it
 * before treating it as the company's formal privacy policy (DPDP Act 2023
 * compliance, state-specific labour requirements).
 */

const sections: { h: string; body: string[] }[] = [
  {
    h: "What this notice covers",
    body: [
      "Nirman is your employer's internal operations system — workforce, inventory, finance, and site records for the company that issued your login. This notice explains what the system stores about you and why.",
      "Your employer is the data controller. The software vendor operates the system on their behalf as a processor.",
    ],
  },
  {
    h: "What the system stores about employees",
    body: [
      "Identity and contact: name, phone, email, photo, address, emergency contact.",
      "Employment: role, department, reporting manager, hire date, wages and salary terms.",
      "Government identifiers: PAN, Aadhaar, PF/ESI/UAN numbers — used for payroll and statutory compliance only.",
      "Bank details: account number and IFSC — used for payroll disbursement only.",
      "Attendance and work: daily attendance records, site check-ins (which may include location where the feature is enabled), shift and leave records, daily progress reports you submit.",
      "Agreements: offer/contract documents and your acceptance or e-signature records.",
    ],
  },
  {
    h: "What the system stores about calls and activity",
    body: [
      "If your company uses in-app telephony, call metadata (time, duration, number) and call recordings may be stored where the company has enabled recording and you have signed the consent policy shown to you in-app.",
      "Every action you take creates an audit log entry (who did what, when) used for security, dispute resolution, and statutory record-keeping.",
      "Notifications you receive and read receipts are stored.",
    ],
  },
  {
    h: "Who can see it",
    body: [
      "Access is role-based: HR/finance staff see payroll-grade fields; supervisors see attendance and work records; other employees see only shared work data.",
      "Government identifiers and bank details are restricted to the roles that need them for payroll and compliance.",
      "Data is not sold or shared with advertisers. Third parties are limited to the company's own integrations (for example its accounting connector or SMS provider) and are bound by the company's own agreements.",
    ],
  },
  {
    h: "How long it is kept",
    body: [
      "Employment, payroll, and statutory records are retained for the period your company's policies and applicable labour/tax law require — commonly several years after separation.",
      "Call recordings follow the company's configured retention period and auto-delete policy where enabled.",
      "Backups keep encrypted copies until they rotate out on the backup schedule.",
    ],
  },
  {
    h: "Your choices and rights",
    body: [
      "You can view and correct your own profile details in the app (Profile → Settings).",
      "For access, correction, or deletion requests for records you cannot edit yourself, contact your company's HR or admin — they control what the system stores.",
      "Your company provides a separate consent flow for call recording — refusing may affect telephony features you can use.",
    ],
  },
  {
    h: "Contact",
    body: [
      "Questions about this notice or your data go to your company's administrator — the sign-in page shows your company name on the account you were given.",
      "This document is an in-product notice; the company's formal privacy policy is the version held in their legal records.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10 text-sm leading-6 text-zinc-800 dark:text-zinc-200">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Privacy Notice</h1>
      <p className="mb-8 text-xs text-zinc-500">
        Employee-facing notice for the Nirman operations system. Baseline
        wording — review by counsel before relying on it as your formal
        privacy policy.
      </p>
      {sections.map((s) => (
        <section key={s.h} className="mb-7">
          <h2 className="mb-2 text-base font-semibold">{s.h}</h2>
          <ul className="list-disc space-y-1.5 pl-5">
            {s.body.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
