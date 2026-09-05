#!/usr/bin/env node
/**
 * Company-wide concurrent stress test.
 * Simulates all roles hitting the platform simultaneously.
 * Run with: AUTH_BYPASS=true node scripts/stress-test.mjs
 */

const BASE = "http://localhost:3000";
const CONCURRENT_USERS = 50;
const REQUESTS_PER_USER = 20;
// Fire requests in waves to avoid exhausting Node's default connection pool
// (~5 connections per host). Each wave = CONCURRENT_USERS simultaneous requests.
const WAVE_SIZE = CONCURRENT_USERS;

// Simulate different roles doing different things
const scenarios = [
  // Store keeper: checking stock, issuing materials
  { method: "GET", path: "/api/materials", label: "storekeeper: list materials" },
  { method: "GET", path: "/api/stock-locations", label: "storekeeper: list locations" },
  { method: "GET", path: "/api/stock-movements", label: "storekeeper: movements" },
  { method: "GET", path: "/api/projects", label: "storekeeper: projects" },

  // Project manager: checking projects, requisitions
  { method: "GET", path: "/api/projects", label: "pm: projects" },
  { method: "GET", path: "/api/requisitions", label: "pm: requisitions" },
  { method: "GET", path: "/api/procurement", label: "pm: procurement" },

  // Accountant: GL, expenses, payments
  { method: "GET", path: "/api/gl/accounts", label: "accountant: gl accounts" },
  { method: "GET", path: "/api/supplier-payments", label: "accountant: payments" },
  { method: "GET", path: "/api/expenses", label: "accountant: expenses" },

  // Sales manager: customers, sales
  { method: "GET", path: "/api/customers", label: "sales: customers" },
  { method: "GET", path: "/api/material-sales", label: "sales: material sales" },

  // Admin: everything
  { method: "GET", path: "/api/suppliers", label: "admin: suppliers" },
  { method: "GET", path: "/api/equipment", label: "admin: equipment" },
  { method: "GET", path: "/api/vehicles", label: "admin: vehicles" },

  // Health check (public)
  { method: "GET", path: "/api/health", label: "health" },
];

// Malicious payloads to test
const maliciousPayloads = [
  // SQL injection attempts
  { name: "SQL injection in name", body: { name: "'; DROP TABLE users; --" } },
  { name: "SQL injection in ID", path: "/api/materials/1' OR '1'='1" },
  // XSS attempts
  { name: "XSS in name", body: { name: "<script>alert('xss')</script>" } },
  { name: "XSS in description", body: { description: "<img src=x onerror=alert(1)>" } },
  // Overflow attempts
  { name: "Huge string", body: { name: "A".repeat(100000) } },
  { name: "Negative amount", body: { amount: -999999999 } },
  { name: "Huge number", body: { amount: 99999999999999999 } },
  // Type confusion
  { name: "Array instead of object", body: [{ name: "test" }] },
  { name: "Null values", body: { name: null, companyId: null } },
  { name: "Extra fields (mass assignment)", body: { name: "test", role: "OWNER", companyId: "hack" } },
];

async function makeRequest(method, path, body) {
  const start = Date.now();
  try {
    const opts = {
      method,
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10000), // 10s timeout
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${BASE}${path}`, opts);
    const duration = Date.now() - start;
    return { status: res.status, duration, ok: res.ok };
  } catch (err) {
    const duration = Date.now() - start;
    return { status: 0, duration, ok: false, error: err.message };
  }
}

async function runConcurrentTest() {
  console.log(`\n=== CONCURRENT STRESS TEST: ${CONCURRENT_USERS} users × ${REQUESTS_PER_USER} requests ===\n`);

  const allResults = [];

  // Fire in waves of WAVE_SIZE to avoid exhausting Node's connection pool
  for (let wave = 0; wave < REQUESTS_PER_USER; wave++) {
    const wavePromises = [];
    for (let user = 0; user < CONCURRENT_USERS; user++) {
      const scenario = scenarios[(user + wave) % scenarios.length];
      wavePromises.push(
        makeRequest(scenario.method, scenario.path).then(r => ({
          ...r,
          label: scenario.label,
          user,
        }))
      );
    }
    const waveResults = await Promise.all(wavePromises);
    allResults.push(...waveResults);
  }

  // Analyze
  const statusCounts = {};
  const errors = [];
  let maxDuration = 0;
  let totalDuration = 0;

  for (const r of allResults) {
    statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
    totalDuration += r.duration;
    maxDuration = Math.max(maxDuration, r.duration);
    if (r.status === 0 || r.status >= 500) {
      errors.push(r);
    }
  }

  console.log("Status distribution:");
  for (const [status, count] of Object.entries(statusCounts).sort()) {
    const label = status === "0" ? "TIMEOUT/ERROR" : status;
    console.log(`  ${label}: ${count}`);
  }
  console.log(`\nAvg response time: ${(totalDuration / allResults.length).toFixed(0)}ms`);
  console.log(`Max response time: ${maxDuration}ms`);
  console.log(`Total requests: ${allResults.length}`);
  console.log(`Errors (5xx/timeout): ${errors.length}`);

  if (errors.length > 0) {
    console.log("\n=== ERRORS ===");
    for (const e of errors.slice(0, 10)) {
      console.log(`  [${e.status}] ${e.label} (${e.duration}ms) ${e.error || ""}`);
    }
    if (errors.length > 10) console.log(`  ... and ${errors.length - 10} more`);
  }

  return { total: allResults.length, errors: errors.length, statusCounts };
}

async function runMaliciousPayloadTest() {
  console.log(`\n=== MALICIOUS PAYLOAD TEST: ${maliciousPayloads.length} attack vectors ===\n`);

  let blocked = 0;
  let passed = 0;

  for (const payload of maliciousPayloads) {
    const path = payload.path || "/api/materials";
    const method = "POST";
    const r = await makeRequest(method, path, payload.body);

    // Good if: 400 (validation), 401 (auth), 403 (forbidden)
    // Bad if: 200 (accepted), 500 (crash)
    const isBlocked = r.status === 400 || r.status === 401 || r.status === 403 || r.status === 429;
    const isCrash = r.status === 500 || r.status === 0;

    if (isBlocked) blocked++;
    else if (!isCrash) passed++;

    const icon = isCrash ? "💥" : isBlocked ? "🛡️" : "⚠️";
    console.log(`  ${icon} ${payload.name}: ${r.status} ${isBlocked ? "(blocked)" : isCrash ? "(CRASH!)" : "(accepted)"}`);
  }

  console.log(`\nBlocked: ${blocked}/${maliciousPayloads.length}`);
  console.log(`Accepted (non-crash): ${passed}/${maliciousPayloads.length}`);
  console.log(`Crashes: ${maliciousPayloads.length - blocked - passed}/${maliciousPayloads.length}`);

  return { blocked, passed, crashes: maliciousPayloads.length - blocked - passed };
}

async function runPermissionTest() {
  console.log("\n=== PERMISSION ESCALATION TEST ===\n");

  // Try to access admin-only endpoints without auth
  const adminEndpoints = [
    { path: "/api/users", method: "GET", label: "list all users" },
    { path: "/api/company", method: "GET", label: "company info" },
    { path: "/api/telephony/twilio/status", method: "GET", label: "twilio status" },
    { path: "/api/backup/records", method: "GET", label: "backup records" },
  ];

  for (const ep of adminEndpoints) {
    const r = await makeRequest(ep.method, ep.path);
    const isBlocked = r.status === 401 || r.status === 403;
    console.log(`  ${isBlocked ? "🛡️" : "⚠️"} ${ep.label}: ${r.status} ${isBlocked ? "(blocked)" : "(accessible!)"}`);
  }
}

// Main
async function main() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║  NIRMAN INVENTORY — COMPANY STRESS TEST      ║");
  console.log("╚══════════════════════════════════════════════╝");

  // Warmup
  console.log("\nWarming up...");
  await makeRequest("GET", "/api/health");

  const concurrent = await runConcurrentTest();
  const malicious = await runMaliciousPayloadTest();
  await runPermissionTest();

  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║  SUMMARY                                     ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log(`  Concurrent: ${concurrent.total} reqs, ${concurrent.errors} errors`);
  console.log(`  Malicious:  ${malicious.blocked} blocked, ${malicious.crashes} crashes`);
  console.log("");

  if (concurrent.errors > 0 || malicious.crashes > 0) {
    console.log("  ❌ ISSUES FOUND — see details above");
    process.exit(1);
  } else {
    console.log("  ✅ ALL TESTS PASSED");
    process.exit(0);
  }
}

main().catch(err => {
  console.error("Stress test crashed:", err);
  process.exit(1);
});
