/**
 * Status-bearing error for user-facing service failures.
 * The web `apiHandler` reads `err.status` and returns it as the HTTP status.
 *
 * Use this for validation / state-machine errors that are the client's fault
 * (e.g. "Cannot receive goods against PO in status APPROVED").
 * For server-side / unexpected failures, throw a plain Error (→ 500).
 */
export class ServiceError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "ServiceError";
    this.status = status;
  }
}
