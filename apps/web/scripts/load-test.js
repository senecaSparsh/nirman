/**
 * k6 load test — run against a seeded staging/dev server.
 *
 * Usage:
 *   k6 run apps/web/scripts/load-test.js
 *
 * Prerequisites:
 *   - The app must be running (pnpm dev or pnpm start)
 *   - AUTH_BYPASS=true must be set (so we don't need to sign in)
 *   - The DB should have realistic data (run pnpm --filter web seed:prod)
 *
 * This script tests the highest-traffic list endpoints with cursor
 * pagination. Adjust BASE_URL and VUs as needed.
 */

import http from "k6/http";
import { check, sleep } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

export const options = {
  stages: [
    { duration: "10s", target: 10 },   // ramp up to 10 VUs
    { duration: "30s", target: 10 },   // hold at 10 VUs
    { duration: "10s", target: 20 },   // ramp up to 20 VUs
    { duration: "30s", target: 20 },   // hold at 20 VUs
    { duration: "10s", target: 0 },    // ramp down
  ],
  thresholds: {
    // SLO budgets from docs/PERFORMANCE.md
    http_req_duration: [
      { endpoint: "materials", p(95): 300 },
      { endpoint: "purchase-orders", p(95): 300 },
      { endpoint: "approvals", p(95): 500 },
      { endpoint: "dprs", p(95): 300 },
    ],
    http_req_failed: ["rate<0.01"],  // <1% failures
  },
};

const ENDPOINTS = [
  { name: "materials", path: "/api/materials?take=50" },
  { name: "purchase-orders", path: "/api/purchase-orders?take=50" },
  { name: "approvals", path: "/api/approvals" },
  { name: "dprs", path: "/api/dprs?take=50" },
  { name: "attendance", path: "/api/attendance?take=50" },
  { name: "equipment", path: "/api/equipment?take=50" },
  { name: "expenses", path: "/api/expenses?take=50" },
];

export default function () {
  for (const ep of ENDPOINTS) {
    const res = http.get(`${BASE_URL}${ep.path}`, {
      headers: { Accept: "application/json" },
    });
    check(res, {
      [`${ep.name} status 200`]: (r) => r.status === 200,
      [`${ep.name} has body`]: (r) => r.body && r.body.length > 0,
    });
  }
  sleep(0.5);
}
