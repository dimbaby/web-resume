import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResumeDocument } from "../types";
import { PagedPreview, waitForImages } from "./PagedPreview";

const previewMock = vi.hoisted(() => vi.fn());

vi.mock("pagedjs", () => ({
  Previewer: class {
    preview(...args: unknown[]) {
      return previewMock(...args);
    }
  },
}));

const resumeDocument: ResumeDocument = {
  id: "resume-density",
  revision: 1,
  title: "密度分页测试",
  profile: { name: "林安", email: "", phone: "", photo_url: "" },
  appearance: {
    template: "reference",
    bullet_style: "triangle",
    density: {
      preset: "custom",
      page_margin_vertical_mm: 14,
      page_margin_horizontal_mm: 15,
      font_size_pt: 10.1,
      item_title_font_size_pt: 11.8,
      line_height: 1.34,
      paragraph_spacing_percent: 70,
    },
  },
  sections: [],
  warnings: [],
  source: { filename: "fixture.md", format: "md" },
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("waitForImages", () => {
  afterEach(() => {
    cleanup();
    previewMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("does not wait forever for an image that already failed", async () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    const container = document.createElement("div");
    const image = document.createElement("img");
    Object.defineProperties(image, {
      complete: { configurable: true, value: true },
      naturalWidth: { configurable: true, value: 0 },
    });
    container.appendChild(image);

    await expect(waitForImages(container)).resolves.toBeUndefined();
  });

  it("injects dynamic page margins into the Paged.js layout pass", async () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    previewMock.mockImplementation(
      async (_content: string, _stylesheets: unknown[], target: HTMLElement) => {
        target.appendChild(window.document.createElement("div"));
        return { total: 1 };
      },
    );
    const onPageCount = vi.fn();

    render(<PagedPreview document={resumeDocument} onPageCount={onPageCount} />);

    await waitFor(() => expect(previewMock).toHaveBeenCalledOnce());
    const stylesheets = previewMock.mock.calls[0][1] as Array<
      string | Record<string, string>
    >;
    expect(stylesheets[0]).toBe("/print.css");
    expect(Object.values(stylesheets[1] as Record<string, string>)[0]).toContain(
      "margin: 14mm 15mm",
    );
    await waitFor(() => expect(onPageCount).toHaveBeenCalledWith(1));
  });
});
