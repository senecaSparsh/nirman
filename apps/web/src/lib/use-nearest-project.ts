"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * useNearestProject — uses the browser Geolocation API to find the user's
 * current GPS position, then queries the API for project site locations
 * (StockLocations of type PROJECT_SITE with lat/lng) and returns the
 * nearest project ID + name.
 *
 * Used by mobile forms (DPR, attendance, stock issue, gate pass) to
 * auto-select the project the user is physically standing at.
 *
 * Usage:
 *   const { nearestProjectId, nearestProjectName, loading, error, request } = useNearestProject();
 *   // Call request() on mount or via a "Use my location" button
 *   // If a project is found, auto-set the form's projectId field
 */

type NearestProject = {
  projectId: string;
  projectName: string;
  locationName: string;
  distanceMeters: number;
};

export function useNearestProject() {
  const [nearest, setNearest] = useState<NearestProject | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Geolocation not supported on this device");
      return;
    }

    setLoading(true);
    setError(null);

    // Step 1: Get the user's GPS position
    const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000, // accept a cached position up to 1 min old
      });
    }).catch((err: GeolocationPositionError) => {
      const msg = err.code === err.PERMISSION_DENIED
        ? "Location permission denied"
        : err.code === err.POSITION_UNAVAILABLE
          ? "Location unavailable"
          : err.code === err.TIMEOUT
            ? "Location request timed out"
            : "Could not get location";
      setError(msg);
      return null;
    });

    if (!pos) {
      setLoading(false);
      return;
    }

    const { latitude, longitude } = pos.coords;

    // Step 2: Query the API for project site locations with coordinates
    try {
      const res = await fetch(`/api/projects/nearest?lat=${latitude}&lng=${longitude}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to fetch project locations");

      if (data.projectId) {
        setNearest({
          projectId: data.projectId,
          projectName: data.projectName,
          locationName: data.locationName,
          distanceMeters: data.distanceMeters,
        });
      } else {
        setError("No project sites with GPS coordinates found nearby");
      }
    } catch {
      setError("Could not fetch nearby project sites");
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-request on mount if geolocation is available
  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      // Don't auto-request — requires explicit user permission.
      // The caller should invoke request() via a button or on first form focus.
    }
  }, []);

  return {
    nearestProjectId: nearest?.projectId ?? null,
    nearestProjectName: nearest?.projectName ?? null,
    nearestLocationName: nearest?.locationName ?? null,
    distanceMeters: nearest?.distanceMeters ?? null,
    loading,
    error,
    request,
  };
}
