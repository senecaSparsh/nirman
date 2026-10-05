import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Native shell for Nirman Inventory OS.
 *
 * The app is a thin native wrapper: the WebView loads the production site
 * (nirman.life) and the existing middleware redirects the mobile user-agent
 * to the /m/* surface automatically. Auth is first-party cookies on the same
 * origin, so Better-Auth sessions just work — no token plumbing needed.
 *
 * For local dev against the Next dev server, set CAP_SERVER_URL:
 *   CAP_SERVER_URL=http://192.168.1.10:3000 pnpm --filter mobile sync
 * (use your LAN IP, not localhost — the simulator needs to reach your Mac).
 */
const config: CapacitorConfig = {
  appId: "life.nirman.app",
  appName: "Nirman",
  // webDir is required even though we load remotely — it's the bundled
  // fallback/error shell. Keep it minimal.
  webDir: "www",
  server: {
    url: process.env.CAP_SERVER_URL ?? "https://nirman.life",
    // Stay inside the WebView for our own origin; anything else (external
    // docs, tel:, WhatsApp, etc.) gets handed to the system browser.
    allowNavigation: ["nirman.life", "*.nirman.life"],
    // Bundled page shown when the remote site can't be reached — this is
    // what actually wires www/index.html in as the offline fallback.
    errorPath: "index.html",
  },
  ios: {
    // Native-feel scrolling + allows the WebView to draw under the notch;
    // the app already handles safe-area insets in CSS.
    contentInset: "never",
    scrollEnabled: true,
    limitsNavigationsToAppBoundDomains: false,
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: "#1a1a1a",
      androidSplashResourceName: "splash",
      showSpinner: false,
    },
    StatusBar: {
      // DEFAULT follows device appearance; the web bridge then re-syncs to
      // the app's own light/dark toggle (html.dark) at runtime.
      style: "DEFAULT",
      backgroundColor: "#faf8f4",
    },
    Keyboard: {
      // The web app already handles its own scroll; resize the WebView
      // so focused inputs aren't hidden behind the keyboard.
      resize: "native",
      resizeOnFullScreen: true,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
