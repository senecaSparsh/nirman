"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { MobileOnboardingTab, type OnboardingEmployeeData } from "./MobileOnboardingTab";

/**
 * OnboardingModal — full-screen modal that contains the complete onboarding
 * workflow (MobileOnboardingTab). Opens from the employee profile page so
 * HR can complete onboarding without navigating away.
 *
 * Uses the same spring-in animation pattern as MobileFabModal:
 *  · Backdrop blurs + dims the background.
 *  · The panel slides up from the bottom (bottom-sheet style).
 *  · Reduced-motion: cross-fade only.
 */
export function OnboardingModal({
  employee,
  canManage,
  canManagePayroll,
  actorRole,
  projects,
  stockLocations,
  departments,
  onClose,
}: {
  employee: OnboardingEmployeeData;
  canManage: boolean;
  canManagePayroll: boolean;
  actorRole: string;
  projects: { id: string; name: string }[];
  stockLocations: { id: string; name: string }[];
  departments: { id: string; name: string; active: boolean }[];
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [, setClosing] = useState(false);

  // Mount + enter animation
  useEffect(() => {
    setMounted(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setVisible(true));
    });
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleClose() {
    setClosing(true);
    setVisible(false);
    setTimeout(() => {
      setClosing(false);
      onClose();
    }, 300);
  }

  if (!mounted) return null;

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={handleClose}
      style={{
        backgroundColor: visible ? "rgba(0, 0, 0, 0.45)" : "rgba(0, 0, 0, 0)",
        backdropFilter: visible ? "blur(8px)" : "blur(0px)",
        WebkitBackdropFilter: visible ? "blur(8px)" : "blur(0px)",
        transition:
          "background-color 0.3s cubic-bezier(0.32, 0.72, 0, 1), backdrop-filter 0.3s cubic-bezier(0.32, 0.72, 0, 1)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md h-[100dvh] overflow-y-auto"
        style={{
          backgroundColor: "var(--color-paper)",
          transform: visible ? "translateY(0)" : "translateY(100%)",
          opacity: visible ? 1 : 0,
          transition:
            "transform 0.4s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.25s cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      >
        {/* Sticky header with close button */}
        <div
          className="sticky top-0 z-30 flex items-center gap-2 px-3 py-2.5 border-b"
          style={{
            backgroundColor: "color-mix(in srgb, var(--color-paper) 92%, transparent)",
            backdropFilter: "blur(20px) saturate(180%)",
            WebkitBackdropFilter: "blur(20px) saturate(180%)",
            borderColor: "var(--color-line)",
          }}
        >
          <button
            onClick={handleClose}
            aria-label="Close onboarding"
            className="flex items-center justify-center size-8 rounded-[0.375rem] press shrink-0"
            style={{ backgroundColor: "var(--color-concrete)", color: "var(--color-ink-700)" }}
          >
            <X className="size-4" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-m-label font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
              Onboarding
            </p>
            <p className="text-m-caption truncate" style={{ color: "var(--color-ink-500)" }}>
              {employee.name}
            </p>
          </div>
          {employee.onboardingComplete === true && (
            <span
              className="text-m-caption font-bold px-2 py-0.5 rounded-full shrink-0"
              style={{
                color: "var(--color-go)",
                backgroundColor: "color-mix(in srgb, var(--color-go) 10%, transparent)",
              }}
            >
              Complete
            </span>
          )}
        </div>

        {/* Onboarding workflow content */}
        <div className="pt-3 pb-20">
          <MobileOnboardingTab
            employee={employee}
            canManage={canManage}
            canManagePayroll={canManagePayroll}
            actorRole={actorRole}
            projects={projects}
            stockLocations={stockLocations}
            departments={departments}
            onEdit={handleClose}
          />
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
