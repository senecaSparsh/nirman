"use client";

import { useEffect } from "react";
import { initNativeApp } from "@/lib/native";

/**
 * NativeAppInit — boots the Capacitor bridge (status-bar theme sync,
 * Android back button, push-token refresh + tap-to-navigate) once per
 * app launch. Renders nothing; on the open web every call is a no-op.
 */
export function NativeAppInit() {
  useEffect(() => {
    void initNativeApp();
  }, []);
  return null;
}
