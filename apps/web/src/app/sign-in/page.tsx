import { SignInPage } from "./sign-in-client";

/**
 * Sign-in route — server component shell.
 *
 * `showDevLogin` is read from `process.env.NODE_ENV` here (server side, where
 * it is safely inlined at build time) and passed down as a prop. Reading
 * `process.env.NODE_ENV` inside the client component is what triggered the
 * Turbopack `process.js` polyfill chunk desync ("module factory is not
 * available") — see `nirman/no-process-env-node-env-in-client`.
 */
import { isOtpSmsConfigured } from "@/lib/otp-sms";

export default function Page() {
  return (
    <SignInPage
      showDevLogin={process.env.NODE_ENV !== "production"}
      otpEnabled={isOtpSmsConfigured()}
    />
  );
}
