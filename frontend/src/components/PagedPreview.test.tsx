import { afterEach, describe, expect, it, vi } from "vitest";
import { waitForImages } from "./PagedPreview";

describe("waitForImages", () => {
  afterEach(() => {
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
});
