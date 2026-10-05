# Nirman — Native App (Capacitor shell)

Native iOS + Android wrapper for the Nirman Inventory OS mobile web app.
The WebView loads **https://nirman.life** — the existing middleware detects
the mobile user-agent and serves the `/m/*` surface automatically. Auth is
first-party cookies on the same origin, so Better-Auth sessions work
unchanged.

```
apps/mobile/
├── capacitor.config.ts   # appId, server.url, plugin config
├── www/                  # server.errorPath target — shown when the site
│                         # can't be reached (offline/server-down screen)
├── assets/               # icon/splash sources (regenerate via script)
├── scripts/generate-assets.mjs
├── ios/                  # Xcode project (SPM — no CocoaPods)
│   └── App/App/          #   + PrintPlugin.swift (window.print bridge)
│                         #   + AppBridgeViewController.swift (registers it)
│                         #   + App.entitlements (aps-environment)
│                         #   + PrivacyInfo.xcprivacy
└── android/              # Android Studio project
    └── app/.../          #   + PrintPlugin.java, MainActivity registers it
```

## Native surface (what runs inside the shell)

- **Push** — `@capacitor/push-notifications`; token → `POST
/api/notifications/native-token`; tap → deep-links via `data.href`.
  iOS only until FCM creds exist (registration is Android-gated in
  `apps/web/src/lib/native.ts` so it can't crash on a missing
  google-services.json).
- **Print** — `window.print()` is a no-op in WebViews; the local `Print`
  plugin (Swift/Java) drives `UIPrintInteractionController` /
  `PrintManager` — the system dialog also covers Save-as-PDF. The web
  bridge rebinds `window.print` inside the shell, so every existing print
  button works unchanged.
- **Haptics** — `lib/haptic.ts` delegates to `@capacitor/haptics` natively
  (iOS WebView has no `navigator.vibrate`).
- **Status bar** — follows the in-app light/dark toggle via a
  MutationObserver on `html.dark` (not the OS theme).
- **Android back button** → in-app history back.
- **Offline** — `server.errorPath` serves `www/index.html` when the site
  can't load.
- **Safe areas** — the web app sets `viewport-fit=cover` and uses
  `env(safe-area-inset-*)` throughout, so the UI clears the notch and home
  indicator.
- **Privacy permissions** — Info.plist declares Camera (barcode scan /
  photo capture), Microphone (voice feedback), Location-when-in-use
  (attendance); Android manifest declares the same + POST_NOTIFICATIONS.
  Missing these would crash those features in-app.

## Requirements

- **iOS**: Xcode 15+, an Apple ID added to Xcode (free account works for
  dev builds; App Store uploads need the $99/yr Developer Program).
- **Android**: Android Studio + SDK 24+ (project generated; not yet built
  on this machine — no SDK installed).

## Run it

```bash
pnpm install                      # from repo root
pnpm --filter mobile sync         # push config/plugins into native projects
pnpm --filter mobile open:ios     # opens Xcode — pick a simulator, hit Run
pnpm --filter mobile open:android # opens Android Studio
```

### Point at a local dev server

```bash
CAP_SERVER_URL=http://192.168.1.10:3000 pnpm --filter mobile sync:ios
```

- iOS **simulator** can use `http://localhost:3000` directly (it shares the
  host's network).
- iOS **device** and Android emulator need your Mac's LAN IP
  (`http://192.168.x.x:3000`); on Android `http://10.0.2.2:3000` also works.
  `next dev` binds all interfaces by default, so the LAN IP works as-is.

> Note: iOS blocks plain-HTTP loads in the WebView unless ATS is relaxed.
> For LAN dev either keep `CAP_SERVER_URL` https, or add an
> `NSAppTransportSecurity` exception to `ios/App/App/Info.plist`
> (dev builds only — never ship it).

## Icons & splash

```bash
node scripts/generate-assets.mjs   # renders apps/web/public/icon.svg → assets/
pnpm --filter mobile assets        # @capacitor/assets → all platform sizes
```

## Push notifications

End-to-end path:

1. **App** — `@capacitor/push-notifications` registers the device, posts the
   token to `POST /api/notifications/native-token` (stored in
   `PushSubscription` with a `capacitor://<platform>/<token>` endpoint).
   Users enable via the existing notifications settings toggle
   (`use-push-notifications` detects the native shell automatically).
   Re-launching the app silently re-registers when permission is granted.

2. **Backend** — `sendPushToUser` in `packages/services/src/push.ts` routes
   `capacitor://` endpoints to APNs (iOS). Web-push subs are untouched.

3. **Server env** (iOS delivery):
   - `APNS_KEY_ID` + `APNS_TEAM_ID` + `APNS_AUTH_KEY_P8` — from
     [Apple Developer → Keys](https://developer.apple.com/account/resources/authkeys/list)
     (create a key with "Apple Push Notifications service" enabled; the .p8
     file downloads once — store it in the secrets vault, NOT the repo).
   - `APNS_TOPIC` — defaults to `life.nirman.app`
   - `APNS_PRODUCTION=true` — prefer the production host. Dev-signed
     tokens fail there with BadDeviceToken, so the sender automatically
     retries the sandbox once before deactivating — both build types work
     against one backend.
   - Android: needs a Firebase project — drop `google-services.json` into
     `android/app/`, add an FCM sender alongside `sendApns`, and remove the
     iOS gate in `registerNativePush`.

## iOS release checklist

1. **Bundle ID** `life.nirman.app` is set in `capacitor.config.ts` →
   change it _before_ the first App Store Connect record is created
   (it's locked afterwards). Keep it consistent with `APNS_TOPIC`.
2. In Xcode: **Signing & Capabilities → Team** — pick your team
   (automatic signing is already on; `App.entitlements` has
   `aps-environment` and `CODE_SIGN_ENTITLEMENTS` is wired for both
   Debug and Release).
3. `Product → Archive` → **Distribute → App Store Connect → Upload**.
   `ITSAppUsesNonExemptEncryption=false` is already set in Info.plist
   (skips the export-compliance prompt); `PrivacyInfo.xcprivacy` is bundled.
4. In App Store Connect: create the app record, fill the **privacy
   questionnaire honestly** (account/company data + camera/mic/location
   usage + push), upload screenshots (6.7" + 5.5" required — grab from the
   iPhone 16 Pro Max / iPhone 8 Plus simulators), submit for review.
   **Give the reviewer a working demo login** in the review notes —
   apps that can't be signed into get rejected outright.
5. **Guideline 4.2 risk**: "wrapper" apps get rejected when they add no
   native value. This app ships push notifications, native haptics, and
   hardware-back handling — point reviewers at those in the review notes
   ("native push for approval workflows; haptics; offline shell").
   Consider the "Request Desktop Site"/unlisted distribution option if the
   audience is internal staff only.

## Versioning

Bump `MARKETING_VERSION` (version) / `CURRENT_PROJECT_VERSION` (build) in
the Xcode target, or via `xcodebuild`/agvtool. Keep them ahead of the last
uploaded build or App Store Connect rejects the archive.

## How it stays in sync

- `pnpm --filter mobile sync` after changing `capacitor.config.ts` or
  upgrading `@capacitor/*` deps.
- The web app ships independently — deploys to nirman.life reach app users
  instantly (no app update needed for UI changes). Native changes (plugins,
  icons, permissions) do need a new store release.
