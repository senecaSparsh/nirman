/**
 * Unit tests for recording storage pure helpers.
 *
 *   recordingMimeType — map audio format to MIME type
 *   getRecordingPath  — convert storage URL to filesystem path
 */
import { describe, it, expect } from "vitest";
import { recordingMimeType, getRecordingPath } from "./recording-storage";
import { join } from "node:path";

describe("recordingMimeType", () => {
  it("maps mp3 to audio/mpeg", () => {
    expect(recordingMimeType("mp3")).toBe("audio/mpeg");
  });

  it("maps wav to audio/wav", () => {
    expect(recordingMimeType("wav")).toBe("audio/wav");
  });

  it("maps ogg to audio/ogg", () => {
    expect(recordingMimeType("ogg")).toBe("audio/ogg");
  });

  it("maps m4a to audio/mp4", () => {
    expect(recordingMimeType("m4a")).toBe("audio/mp4");
  });

  it("maps webm to audio/webm", () => {
    expect(recordingMimeType("webm")).toBe("audio/webm");
  });

  it("returns application/octet-stream for unknown format", () => {
    expect(recordingMimeType("flac")).toBe("application/octet-stream");
  });

  it("returns application/octet-stream for empty string", () => {
    expect(recordingMimeType("")).toBe("application/octet-stream");
  });

  it("strips leading dot from format", () => {
    expect(recordingMimeType(".mp3")).toBe("audio/mpeg");
    expect(recordingMimeType(".wav")).toBe("audio/wav");
  });

  it("is case-insensitive", () => {
    expect(recordingMimeType("MP3")).toBe("audio/mpeg");
    expect(recordingMimeType("WAV")).toBe("audio/wav");
    expect(recordingMimeType("Mp3")).toBe("audio/mpeg");
  });

  it("handles format with mixed case and dot", () => {
    expect(recordingMimeType(".MP3")).toBe("audio/mpeg");
  });
});

describe("getRecordingPath", () => {
  it("converts /data/recordings/ URL to filesystem path", () => {
    const path = getRecordingPath("/data/recordings/abc-123.mp3");
    expect(path).toContain("data");
    expect(path).toContain("recordings");
    expect(path).toContain("abc-123.mp3");
  });

  it("handles URL without /data/recordings/ prefix (passes through)", () => {
    const path = getRecordingPath("abc-123.mp3");
    expect(path).toContain("abc-123.mp3");
  });

  it("handles nested filename", () => {
    const path = getRecordingPath("/data/recordings/sub/dir/file.wav");
    expect(path).toContain("file.wav");
  });

  it("handles empty URL", () => {
    const path = getRecordingPath("");
    expect(path).toContain("recordings");
  });
});
