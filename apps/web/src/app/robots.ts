import type { MetadataRoute } from "next";

// Internal ERP — nothing here should appear in search results, including
// the sign-in page. Disallow crawling entirely; X-Robots-Tag in
// next.config.ts covers the noindex side for already-crawled URLs.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
