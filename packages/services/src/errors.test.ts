/**
 * Unit tests for the ServiceError class.
 */
import { describe, it, expect } from "vitest";
import { ServiceError } from "./errors";

describe("ServiceError", () => {
  it("creates with default status 400", () => {
    const err = new ServiceError("Bad request");
    expect(err.message).toBe("Bad request");
    expect(err.status).toBe(400);
    expect(err.name).toBe("ServiceError");
  });

  it("creates with custom status", () => {
    const err = new ServiceError("Not found", 404);
    expect(err.message).toBe("Not found");
    expect(err.status).toBe(404);
  });

  it("creates with 409 status", () => {
    const err = new ServiceError("Conflict", 409);
    expect(err.status).toBe(409);
  });

  it("creates with 500 status", () => {
    const err = new ServiceError("Server error", 500);
    expect(err.status).toBe(500);
  });

  it("is an instance of Error", () => {
    const err = new ServiceError("Test");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ServiceError);
  });

  it("has the correct name", () => {
    const err = new ServiceError("Test");
    expect(err.name).toBe("ServiceError");
  });
});
