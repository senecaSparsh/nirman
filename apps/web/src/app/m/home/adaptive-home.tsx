"use client";

import * as React from "react";
import { AdaptiveData } from "@/components/mobile/v2/adaptive-data";
import { MobileSkeletonHome } from "@/components/mobile/mobile-skeleton";
import { MobileSelfCheckIn } from "@/components/mobile/mobile-self-check-in";
import { HomeTree } from "./home-tree";
import { MobileHomeClient, type CompanyCardData } from "./home-client";

/**
 * HomeData — the shape returned by /api/mobile/home and used by the SSR path.
 * Both paths produce the same shape so the rendering logic is identical.
 */
export interface HomeData {
  currentCompany: {
    id: string;
    name: string;
    businessType: string | null;
    currency: string;
  };
  companies: CompanyCardData[];
  canCreateCompany: boolean;
  userName: string | null;
  myEmployee: { id: string; name: string } | null;
  myAttendance: {
    checkIn: string | null;   // ISO string
    checkOut: string | null;  // ISO string
    hoursWorked: number | null;
  } | null;
}

/**
 * AdaptiveHomeContent — renders the home page using either server-provided
 * data (low/mid-tier) or client-fetched data (high-tier).
 *
 * The skeleton is shown while the client fetch is in progress.
 * Once data arrives, it's cached for 30s so navigating back is instant.
 */
export function AdaptiveHomeContent({
  serverData,
  apiUrl,
}: {
  serverData: HomeData | null;
  apiUrl: string;
}) {
  return (
    <AdaptiveData<HomeData>
      serverData={serverData}
      clientFetcher={() => fetch(apiUrl).then((r) => r.json())}
      cacheKey="mobile-home"
      renderSkeleton={<MobileSkeletonHome />}
    >
      {(data) => <HomeContent data={data} />}
    </AdaptiveData>
  );
}

function HomeContent({ data }: { data: HomeData }) {
  const checkInDate = data.myAttendance?.checkIn ? new Date(data.myAttendance.checkIn) : null;
  const checkOutDate = data.myAttendance?.checkOut ? new Date(data.myAttendance.checkOut) : null;

  return (
    <>
      {/* ── Home tree — briefing + recent in a file-system tree ── */}
      <HomeTree userName={data.userName} />

      {/* ── Self-check-in widget (only for employees with an employee record) ── */}
      {data.myEmployee && (
        <div className="mb-3">
          <MobileSelfCheckIn
            employeeId={data.myEmployee.id}
            employeeName={data.myEmployee.name}
            hasCheckedIn={!!data.myAttendance?.checkIn}
            checkInTime={checkInDate?.toTimeString().slice(0, 5) ?? null}
            hasCheckedOut={!!data.myAttendance?.checkOut}
            checkOutTime={checkOutDate?.toTimeString().slice(0, 5) ?? null}
            hoursWorked={data.myAttendance?.hoursWorked ?? null}
          />
        </div>
      )}

      <MobileHomeClient
        currentCompany={data.currentCompany}
        companies={data.companies}
        canCreateCompany={data.canCreateCompany}
      />
    </>
  );
}
