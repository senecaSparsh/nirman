"use client";

import * as React from "react";
import { type DeviceTier, DEVICE_TIER_COOKIE } from "./device-tier";

/**
 * Client-side device capability detection.
 *
 * The platform detects the user's device (RAM, CPU cores, network speed,
 * data-saver preference) and classifies it into a tier. High-tier devices
 * fetch data client-side (saving server RAM). Low-tier devices get
 * server-rendered HTML (saving their battery + working on slow networks).
 *
 * Browser APIs used:
 * - navigator.deviceMemory — RAM in GB (Chrome/Android, not Safari/iOS)
 * - navigator.hardwareConcurrency — CPU logical cores (widely supported)
 * - navigator.connection.effectiveType — "4g" | "3g" | "2g" | "slow-2g"
 * - navigator.connection.saveData — boolean (user's data-saver toggle)
 * - navigator.connection.rtt — round-trip time in ms
 *
 * Fallbacks for unsupported browsers (Safari/iOS):
 * - deviceMemory unknown → assume 4GB (modern iPhone baseline)
 * - connection unknown → assume 4g (WiFi/cellular default)
 * - The tier is conservative — unknown never gets "low" unless other
 *   signals are weak, because penalising an iPhone 15 Pro for not
 *   exposing deviceMemory would be wrong.
 */

export interface DeviceCapabilities {
  tier: DeviceTier;
  memoryGB: number | null;        // null = unknown (Safari/iOS)
  cpuCores: number | null;        // null = unknown
  networkType: string | null;     // "4g" | "3g" | "2g" | "slow-2g" | null
  saveData: boolean;
  rtt: number | null;             // round-trip time in ms
  isMobile: boolean;
}

/**
 * Detect device capabilities from browser APIs.
 * Returns null during SSR (no navigator).
 */
export function detectDeviceCapabilities(): DeviceCapabilities | null {
  if (typeof navigator === "undefined") return null;

  const nav = navigator as Navigator & {
    deviceMemory?: number;
    hardwareConcurrency?: number;
    connection?: {
      effectiveType?: string;
      saveData?: boolean;
      rtt?: number;
    };
  };

  const memoryGB = nav.deviceMemory ?? null;
  const cpuCores = nav.hardwareConcurrency ?? null;
  const conn = nav.connection;
  const networkType = conn?.effectiveType ?? null;
  const saveData = conn?.saveData ?? false;
  const rtt = conn?.rtt ?? null;
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

  return { tier: "high", memoryGB, cpuCores, networkType, saveData, rtt, isMobile };
}

/**
 * Classify device into a tier based on capabilities.
 *
 * Scoring: each signal contributes points. The total determines the tier.
 * - RAM: 4GB+ = 3, 2GB = 2, <2GB = 1, unknown = 2 (benefit of doubt)
 * - CPU: 8+ = 3, 4 = 2, <4 = 1, unknown = 2
 * - Network: 4g = 3, 3g = 2, 2g/slow-2g = 0, unknown = 2
 * - saveData: if true, subtract 2 (user explicitly wants less data)
 * - RTT: <50ms = 1, 50-200 = 0, >200 = -1, unknown = 0
 *
 * Total: 0-4 = low, 5-7 = mid, 8+ = high
 */
export function classifyDeviceTier(caps: DeviceCapabilities): DeviceTier {
  let score = 0;

  // RAM
  if (caps.memoryGB === null) score += 2;       // unknown — benefit of doubt
  else if (caps.memoryGB >= 4) score += 3;
  else if (caps.memoryGB >= 2) score += 2;
  else score += 1;

  // CPU
  if (caps.cpuCores === null) score += 2;
  else if (caps.cpuCores >= 8) score += 3;
  else if (caps.cpuCores >= 4) score += 2;
  else score += 1;

  // Network
  if (caps.networkType === null) score += 2;
  else if (caps.networkType === "4g") score += 3;
  else if (caps.networkType === "3g") score += 2;
  else score += 0;  // 2g / slow-2g

  // saveData penalty
  if (caps.saveData) score -= 2;

  // RTT bonus/penalty
  if (caps.rtt !== null && caps.rtt > 0) {
    if (caps.rtt < 50) score += 1;
    else if (caps.rtt > 200) score -= 1;
  }

  if (score >= 8) return "high";
  if (score >= 5) return "mid";
  return "low";
}

/**
 * React hook: detect device tier on the client.
 * Returns "high" during SSR (safe default — server renders full content).
 * Updates to the real tier after hydration.
 */
export function useDeviceTier(): DeviceTier {
  return useDeviceTierWithCaps().tier;
}

/**
 * React hook: detect device tier + raw capabilities.
 * Returns { tier: "high", ...nulls } during SSR.
 */
export function useDeviceTierWithCaps(): DeviceCapabilities {
  const [caps, setCaps] = React.useState<DeviceCapabilities>({
    tier: "high",
    memoryGB: null,
    cpuCores: null,
    networkType: null,
    saveData: false,
    rtt: null,
    isMobile: false,
  });

  React.useEffect(() => {
    const detected = detectDeviceCapabilities();
    if (!detected) return;
    const tier = classifyDeviceTier(detected);
    const final = { ...detected, tier };
    setCaps(final);

    // Persist to cookie so the server can read it on next navigation
    document.cookie = `${DEVICE_TIER_COOKIE}=${tier}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;

    // Listen for network changes (user moves from WiFi to 2G)
    const conn = (navigator as Navigator & { connection?: EventTarget & { effectiveType?: string } }).connection;
    if (conn) {
      const handler = () => {
        const updated = detectDeviceCapabilities();
        if (updated) {
          const newTier = classifyDeviceTier(updated);
          setCaps({ ...updated, tier: newTier });
          document.cookie = `${DEVICE_TIER_COOKIE}=${newTier}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
        }
      };
      conn.addEventListener("change", handler);
      return () => conn.removeEventListener("change", handler);
    }
  }, []);

  return caps;
}
