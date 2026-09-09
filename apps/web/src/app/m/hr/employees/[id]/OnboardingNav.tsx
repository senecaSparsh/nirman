"use client";


/**
 * OnboardingNav — 2-level navigation for the 10-step onboarding workflow.
 *
 * The old single-row RegisterTabs crammed 10 tabs into one row on mobile,
 * making labels truncate and merge. This component groups the 10 steps
 * into 3 logical phases:
 *
 *   Setup     → Profile, Account, Salary
 *   Paperwork → Offer, Agreement, Appointment, ID Card
 *   Finalize  → Deposit, Dossier, Offboard
 *
 * Level 1: 3 phase tabs (comfortable spacing, no truncation).
 * Level 2: 3-4 sub-section chips for the active phase (wrapped pills).
 *
 * No scrolling needed. Each label has enough room to be readable.
 */

export type OnboardingSubTab =
  | "profile" | "account" | "salary"
  | "offer" | "agreement" | "appointment" | "idcard"
  | "deposit" | "dossier" | "offboard";

interface Phase {
  value: string;
  label: string;
  subs: { value: OnboardingSubTab; label: string }[];
}

const PHASES: Phase[] = [
  {
    value: "setup",
    label: "Setup",
    subs: [
      { value: "profile", label: "Profile" },
      { value: "account", label: "Account" },
      { value: "salary", label: "Salary" },
    ],
  },
  {
    value: "paperwork",
    label: "Paperwork",
    subs: [
      { value: "offer", label: "Offer" },
      { value: "agreement", label: "Agreement" },
      { value: "appointment", label: "Appointment" },
      { value: "idcard", label: "ID Card" },
    ],
  },
  {
    value: "finalize",
    label: "Finalize",
    subs: [
      { value: "deposit", label: "Deposit" },
      { value: "dossier", label: "Dossier" },
      { value: "offboard", label: "Offboard" },
    ],
  },
];

const SUB_TO_PHASE: Record<OnboardingSubTab, string> = {
  profile: "setup", account: "setup", salary: "setup",
  offer: "paperwork", agreement: "paperwork", appointment: "paperwork", idcard: "paperwork",
  deposit: "finalize", dossier: "finalize", offboard: "finalize",
};

export function OnboardingNav({
  value,
  onChange,
}: {
  value: OnboardingSubTab;
  onChange: (next: OnboardingSubTab) => void;
}) {
  const activePhase = SUB_TO_PHASE[value];

  // When the sub-tab changes externally (e.g. via URL param), the phase
  // auto-highlights correctly because activePhase is derived from value.
  return (
    <div className="sticky top-0 z-20 mb-3" style={{ backgroundColor: "var(--color-paper-2)" }}>
      {/* Level 1: Phase tabs — 3 wide tabs, comfortable spacing */}
      <div className="flex gap-1 pt-1">
        {PHASES.map((phase) => {
          const active = phase.value === activePhase;
          return (
            <button
              key={phase.value}
              onClick={() => {
                // Switch to the first sub in this phase
                onChange(phase.subs[0]?.value ?? "profile");
              }}
              data-focus-ring="none"
              className="flex-1 py-2 rounded-[0.5rem] transition-colors press"
              style={{
                outline: "none",
                backgroundColor: active ? "var(--color-ink-950)" : "transparent",
                color: active ? "var(--color-paper)" : "var(--color-ink-500)",
              }}
            >
              <span className="text-m-label font-bold">{phase.label}</span>
            </button>
          );
        })}
      </div>

      {/* Level 2: Sub-section chips for the active phase */}
      <div className="flex flex-wrap justify-center gap-1 pt-3 pb-1">
        {PHASES.find((p) => p.value === activePhase)?.subs.map((sub) => {
          const active = sub.value === value;
          return (
            <button
              key={sub.value}
              onClick={() => onChange(sub.value)}
              data-focus-ring="none"
              className="px-2 py-0.5 rounded-full transition-colors press"
              style={{
                outline: "none",
                backgroundColor: active ? "var(--color-go-wash)" : "transparent",
                color: active ? "var(--color-go)" : "var(--color-ink-500)",
                border: `1px solid ${active ? "var(--color-go)" : "var(--color-line)"}`,
                fontWeight: active ? 700 : 500,
                fontSize: "var(--text-m-micro, 0.625rem)",
                lineHeight: 1.4,
              }}
            >
              {sub.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
