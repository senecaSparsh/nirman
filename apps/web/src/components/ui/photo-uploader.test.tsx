// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/render";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
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
});
