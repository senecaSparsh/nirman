import { MobileSkeletonHome } from "@/components/mobile/mobile-skeleton";

/**
 * /m/loading.tsx — instant skeleton during route transitions.
 *
 * Without this, navigating between mobile routes shows a blank white
 * screen while the server renders the next page. With this, Next.js
 * shows the skeleton immediately (from the client bundle) while the
 * server-rendered HTML streams in. This is especially important on
 * slow 3G connections at job sites.
 */
export default function MobileLoading() {
  return <MobileSkeletonHome />;
}
