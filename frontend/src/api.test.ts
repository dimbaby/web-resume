import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "./api";

describe("api", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uploads the photo with the current revision", async () => {
    const response = {
      ok: true,
      json: vi.fn().mockResolvedValue({ id: "resume-1", revision: 4 }),
    } as unknown as Response;
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);

    await api.photo("resume-1", new File(["photo"], "photo.png"), 3);

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(options.method).toBe("POST");
    expect(options.body).toBeInstanceOf(FormData);
    expect((options.body as FormData).get("revision")).toBe("3");
    expect((options.body as FormData).get("file")).toBeInstanceOf(File);
  });

  it("keeps the HTTP status on API errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: vi.fn().mockResolvedValue({ detail: "版本冲突" }),
      }),
    );

    const request = api.get("resume-1");
    await expect(request).rejects.toMatchObject({
      message: "版本冲突",
      status: 409,
    } satisfies Partial<ApiError>);
  });

  it("waits for the PDF response and returns its Blob", async () => {
    const pdf = new Blob(["pdf"], { type: "application/pdf" });
    const blob = vi.fn().mockResolvedValue(pdf);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob });
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.exportPdf("resume-1")).resolves.toBe(pdf);
    expect(fetchMock).toHaveBeenCalledWith("/api/resumes/resume-1/export/pdf", {
      method: "POST",
    });
    expect(blob).toHaveBeenCalledOnce();
  });
});
