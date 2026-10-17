import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Use — Nirman",
  description: "Terms for using the Nirman internal operations system.",
};

/**
 * Public terms page — readable without sign-in (middleware allows /terms).
 * Internal-ERP terms: acceptable use, access rules, and what employees
 * should expect from the system. Baseline wording — review by counsel.
 */

const sections: { h: string; body: string[] }[] = [
  {
    h: "Scope",
    body: [
      "Nirman is the internal operations system of the company that issued your login. These terms cover your use of it as an employee, contractor, or authorised user.",
      "By signing in you accept these terms on behalf of yourself; your company's agreement with the vendor governs the service itself.",
    ],
  },
  {
    h: "Your account",
    body: [
      "Keep your credentials confidential — actions taken under your login are attributed to you in the audit log.",
      "Tell your administrator immediately if you suspect unauthorised access.",
      "Accounts are provisioned and deactivated by your company — do not create shared logins.",
    ],
  },
  {
    h: "Acceptable use",
    body: [
      "Use the system for your assigned work only — do not probe other companies' data, scrape records, or attempt to exceed your role's permissions.",
      "Information you enter (attendance, reports, notes, files) must be accurate to the best of your knowledge — the system is the company's record of work.",
      "Do not upload content you are not allowed to share (third-party confidential data, unlawful material).",
    ],
  },
  {
    h: "What the system does",
    body: [
      "The system records work actions as the company's source of truth — approvals, stock movements, payments, and HR events are durable and auditable.",
      "Features may be enabled or restricted by your company's plan and role assignments.",
    ],
  },
  {
    h: "Liability",
    body: [
      "The system is provided as-is for your company's internal use. Your company's agreement with the vendor governs service levels, support, and liability between them.",
      "Nothing here creates obligations between you and the vendor beyond your company's own policies.",
    ],
  },
  {
    h: "Contact",
    body: [
      "Questions about these terms go to your company's administrator.",
    ],
  },
];

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10 text-sm leading-6 text-zinc-800 dark:text-zinc-200">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Terms of Use</h1>
      <p className="mb-8 text-xs text-zinc-500">
        For users of the Nirman operations system. Baseline wording —
        review by counsel before relying on it as your formal terms.
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
