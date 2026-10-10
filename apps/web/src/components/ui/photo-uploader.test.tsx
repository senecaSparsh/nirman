// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@/test/render";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const putPendingPhoto = vi.fn(async (_id: string, _blob: Blob, _fileName?: string) => ({ id: _id }));
const getPendingPhoto = vi.fn(async (_id: string) => null as { id: string; blob: Blob; fileName?: string } | null);
const deletePendingPhoto = vi.fn(async (_id: string) => {});
vi.mock("@/lib/offline/photo-store", () => ({
  putPendingPhoto: (id: string, blob: Blob, fileName?: string) => putPendingPhoto(id, blob, fileName),
  getPendingPhoto: (id: string) => getPendingPhoto(id),
  deletePendingPhoto: (id: string) => deletePendingPhoto(id),
}));

import { PhotoUploader } from "./photo-uploader";

describe("PhotoUploader", () => {
  it("renders the upload zone with label", () => {
    render(<PhotoUploader photos={[]} onChange={vi.fn()} label="Add Photo" />);
    expect(screen.getByText("Add Photo")).toBeInTheDocument();
  });

  it("renders custom label", () => {
    render(<PhotoUploader photos={[]} onChange={vi.fn()} label="Upload Images" />);
    expect(screen.getByText("Upload Images")).toBeInTheDocument();
  });

  it("renders photo previews when photos are provided", () => {
    const photos = [
      { url: "https://example.com/1.jpg", fileName: "photo1.jpg" },
      { url: "https://example.com/2.jpg", fileName: "photo2.jpg" },
    ];
    render(<PhotoUploader photos={photos} onChange={vi.fn()} />);
    const imgs = screen.getAllByRole("img");
    expect(imgs).toHaveLength(2);
    expect(imgs[0]).toHaveAttribute("src", "https://example.com/1.jpg");
    expect(imgs[0]).toHaveAttribute("alt", "photo1.jpg");
  });

  it("renders remove button for each photo", () => {
    const photos = [{ url: "https://example.com/1.jpg", fileName: "p1.jpg" }];
    render(<PhotoUploader photos={photos} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Remove photo" })).toBeInTheDocument();
  });

  it("calls onChange when remove button is clicked", async () => {
    const onChange = vi.fn();
    const photos = [{ url: "https://example.com/1.jpg", fileName: "p1.jpg" }];
    const { user } = render(<PhotoUploader photos={photos} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Remove photo" }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("hides upload zone when max photos is reached", () => {
    const photos = [{ url: "https://example.com/1.jpg" }];
    render(<PhotoUploader photos={photos} onChange={vi.fn()} maxPhotos={1} label="Add" />);
    expect(screen.queryByText("Add")).not.toBeInTheDocument();
  });

  it("renders a hidden file input", () => {
    const { container } = render(<PhotoUploader photos={[]} onChange={vi.fn()} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.accept).toBe("image/*");
  });

  it("renders alt text with index when fileName is missing", () => {
    const photos = [{ url: "https://example.com/1.jpg" }];
    render(<PhotoUploader photos={photos} onChange={vi.fn()} />);
    expect(screen.getByAltText("Photo 1")).toBeInTheDocument();
  });

  describe("offline photo retention", () => {
    let fetchSpy: { mockRestore: () => void; mock: { calls: unknown[][] } };
    beforeEach(() => {
      fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error")) as never;
      Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
      vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:mock-url") });
    });
    afterEach(() => {
      fetchSpy.mockRestore();
      Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
      vi.unstubAllGlobals();
      vi.clearAllMocks();
    });

    it("retains the photo as a pending preview when the upload fails offline", async () => {
      const onChange = vi.fn();
      const { container } = render(<PhotoUploader photos={[]} onChange={onChange} />);
      const input = container.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(["x".repeat(100)], "site.jpg", { type: "image/jpeg" });
      // Fire the change event directly (userEvent upload goes through the same path).
      const evt = new Event("change", { bubbles: true });
      Object.defineProperty(input, "files", { value: [file], configurable: true });
      input.dispatchEvent(evt);
      await vi.waitFor(() => expect(putPendingPhoto).toHaveBeenCalled());
      // onChange gets a photo whose url is the local blob preview + a pendingId ref.
      const added = onChange.mock.calls.flat().flat()[0] as { url: string; pendingId?: string };
      expect(added.url).toBe("blob:mock-url");
      expect(added.pendingId).toBeTruthy();
    });

    it("does NOT retain when online (the error just toasts)", async () => {
      Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
      const onChange = vi.fn();
      const { container } = render(<PhotoUploader photos={[]} onChange={onChange} />);
      const input = container.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(["x"], "site.jpg", { type: "image/jpeg" });
      const evt = new Event("change", { bubbles: true });
      Object.defineProperty(input, "files", { value: [file], configurable: true });
      input.dispatchEvent(evt);
      await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled());
      await new Promise((r) => setTimeout(r, 0));
      expect(putPendingPhoto).not.toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
    });
  });
});
