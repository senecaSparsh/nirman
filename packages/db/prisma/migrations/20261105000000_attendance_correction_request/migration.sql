-- A worker's "I forgot to punch" — the request that replaces the WhatsApp
-- message to HR. Deciding edits the real WorkerAttendance row; this row is
-- the audit trail for why the day changed.
CREATE TABLE "AttendanceCorrectionRequest" (
  id                 TEXT PRIMARY KEY,
  "companyId"        TEXT NOT NULL,
  "employeeId"       TEXT NOT NULL,
  "date"             DATE NOT NULL,
  "requestedCheckIn" TIMESTAMP(3),
  "requestedCheckOut" TIMESTAMP(3),
  "requestedStatus"  "AttendanceStatus" NOT NULL,
  "reason"           TEXT NOT NULL,
  "status"           TEXT NOT NULL DEFAULT 'REQUESTED',
  "reviewedById"     TEXT,
  "reviewedAt"       TIMESTAMP(3),
  "reviewNote"       TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AttendanceCorrectionRequest_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company" (id) ON DELETE CASCADE,
  CONSTRAINT "AttendanceCorrectionRequest_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee" (id) ON DELETE CASCADE,
  CONSTRAINT "AttendanceCorrectionRequest_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "User" (id) ON DELETE SET NULL
);
CREATE INDEX "AttendanceCorrectionRequest_companyId_status_idx"
  ON "AttendanceCorrectionRequest" ("companyId", "status");
CREATE INDEX "AttendanceCorrectionRequest_employeeId_date_idx"
  ON "AttendanceCorrectionRequest" ("employeeId", "date");
