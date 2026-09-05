import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  authMocks,
  setSessionUser,
  clearSession,
  makeRequest,
  getJson,
  mockPrisma,
} from "@/test/mock-auth";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/recording-storage", () => ({
  readRecording: vi.fn(() => Buffer.from("audio-data")),
  recordingMimeType: vi.fn(() => "audio/mpeg"),
  recordingFormatFromUrl: vi.fn(() => "mp3"),
}));

vi.spyOn(console, "error").mockImplementation(() => {});

import { GET } from "./route";

const OWNER = { role: "OWNER" as const };
const ACCOUNTANT = { role: "ACCOUNTANT" as const };

function prismaCallWithRecording(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "call-1",
    recording: {
      id: "rec-1",
      storageUrl: "/data/recordings/abc.mp3",
      deletedAt: null,
    },
    ...overrides,
  };
}

describe("GET /api/calls/[id]/recording", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().callLog!.findFirst.mockResolvedValue(prismaCallWithRecording());
    mockPrisma().recordingAccessLog!.create.mockResolvedValue({});
    mockPrisma().callRecording!.update.mockResolvedValue({});
  });

  it("returns 200 with audio data", async () => {
    const res = await GET(
      makeRequest("/api/calls/call-1/recording"),
      { params: Promise.resolve({ id: "call-1" }) },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
  });

  it("returns 404 when call not found", async () => {
    mockPrisma().callLog!.findFirst.mockResolvedValue(null);
    const res = await GET(
      makeRequest("/api/calls/call-99/recording"),
      { params: Promise.resolve({ id: "call-99" }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when no recording available", async () => {
    mockPrisma().callLog!.findFirst.mockResolvedValue({ id: "call-1", recording: null });
    const res = await GET(
      makeRequest("/api/calls/call-1/recording"),
      { params: Promise.resolve({ id: "call-1" }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns 410 when recording has been deleted", async () => {
    mockPrisma().callLog!.findFirst.mockResolvedValue(
      prismaCallWithRecording({ recording: { id: "rec-1", storageUrl: "/data/recordings/abc.mp3", deletedAt: new Date() } }),
    );
    const res = await GET(
      makeRequest("/api/calls/call-1/recording"),
      { params: Promise.resolve({ id: "call-1" }) },
    );
    expect(res.status).toBe(410);
  });

  it("returns 403 when the user lacks CALL_RECORDING_LISTEN", async () => {
    setSessionUser(ACCOUNTANT);
    const res = await GET(
      makeRequest("/api/calls/call-1/recording"),
      { params: Promise.resolve({ id: "call-1" }) },
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await GET(
      makeRequest("/api/calls/call-1/recording"),
      { params: Promise.resolve({ id: "call-1" }) },
    );
    expect(res.status).toBe(401);
  });
});
