import { describe, expect, it } from "vitest";
import { assertTestDatabaseResetTarget } from "./test/setup";

describe("database reset target guard", () => {
  it("accepts only the dedicated test database in the test environment", () => {
    expect(() => assertTestDatabaseResetTarget("postgresql://localhost/nirman_inventory_test?schema=public", "test")).not.toThrow();
  });

  it.each([
    ["postgresql://localhost/nirman_inventory", "test"],
    ["postgresql://localhost/nirman_inventory_test", "production"],
    ["postgresql://localhost/nirman_inventory_test", "development"],
    ["https://localhost/nirman_inventory_test", "test"],
    ["", "test"],
  ])("refuses an unsafe reset target %s in %s", (url, environment) => {
    expect(() => assertTestDatabaseResetTarget(url, environment)).toThrow("Database reset is restricted");
  });
});
