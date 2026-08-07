import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { ApiError } from "../api";
import type { LibraryEntry, ResumeDocument } from "../types";
import { EditorPage } from "./EditorPage";

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  save: vi.fn(),
  duplicate: vi.fn(),
  photo: vi.fn(),
  exportPdf: vi.fn(),
  library: vi.fn(),
  list: vi.fn(),
}));

vi.mock("../api", () => {
  class MockApiError extends Error {
    status: number;

    constructor(message: string, status: number) {
      super(message);
      this.name = "ApiError";
      this.status = status;
    }
  }
  return { ApiError: MockApiError, api: apiMock };
});

vi.mock("../components/PagedPreview", () => ({
  PagedPreview: ({ onPageCount }: { onPageCount?: (count: number) => void }) => {
    useEffect(() => onPageCount?.(1), [onPageCount]);
    return <div data-testid="preview" />;
  },
}));

vi.mock("../components/SortableList", () => ({
  SortableList: ({ items, renderItem }: any) => (
    <div>{items.map((item: any) => <div key={item.id}>{renderItem(item, <span />)}</div>)}</div>
  ),
}));

vi.mock("../components/SectionEditor", () => ({
  SectionEditor: ({
    section,
    onDeleteItem,
    onOpenItemLibrary,
    onOpenBulletLibrary,
    onOpenItemVersions,
    onOpenBulletVersions,
  }: any) => (
    <div>
      <button type="button" onClick={onOpenItemLibrary}>
        打开条目内容库
      </button>
      <button type="button" onClick={onOpenItemVersions}>
        打开其他版本条目
      </button>
      {section.items.map((item: any) => (
        <div key={item.id}>
          <span>{item.title[0]?.text}</span>
          <button type="button" onClick={() => onOpenBulletLibrary(item.id)}>
            打开要点内容库
          </button>
          <button type="button" onClick={() => onOpenBulletVersions(item.id)}>
            打开其他版本要点
          </button>
          <button type="button" onClick={() => onDeleteItem(item.id)}>
            删除测试条目
          </button>
        </div>
      ))}
    </div>
  ),
}));

const baseDocument: ResumeDocument = {
  id: "resume-1",
  revision: 1,
  title: "初始版本",
  profile: {
    name: "示例用户",
    email: "sample@example.com",
    phone: "13800000000",
    photo_url: "",
  },
  appearance: {
    template: "reference",
    bullet_style: "triangle",
    density: {
      preset: "standard",
      page_margin_vertical_mm: 19,
      page_margin_horizontal_mm: 19,
      font_size_pt: 10.9,
      item_title_font_size_pt: 12,
      line_height: 1.52,
      paragraph_spacing_percent: 100,
      name_contact_gap_mm: 7,
    },
  },
  sections: [
    {
      id: "section-1",
      kind: "project",
      title: "项目经历",
      items: [
        {
          id: "item-1",
          title: [{ text: "示例项目" }],
          subtitle: [],
          title_style: { bold: true, italic: false },
          subtitle_style: { bold: false, italic: true },
          date: "2026",
          bullets: [],
        },
      ],
    },
  ],
  warnings: [],
  source: { filename: "fixture.md", format: "md" },
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const libraryEntry: LibraryEntry = {
  id: "library-entry-1",
  section_kind: "project",
  section_title: "项目经历",
  item: {
    id: "library-item-1",
    title: [{ text: "历史风控项目", bold: true }],
    subtitle: [{ text: "课程项目", italic: true }],
    title_style: { bold: true, italic: false },
    subtitle_style: { bold: false, italic: true },
    date: "2025.01-2025.06",
    bullets: [
      {
        id: "library-bullet-1",
        content: [{ text: "使用 C++  建立可复用特征管线" }],
      },
    ],
  },
  source_resume_id: "source-resume",
  source_resume_title: "完整基础简历",
  source_filename: "完整简历.md",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function cloneDocument() {
  return structuredClone(baseDocument);
}

function RouteSwitch() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate("/edit/resume-2")}>
      切换测试简历
    </button>
  );
}

function renderEditor() {
  return render(
    <MemoryRouter initialEntries={["/edit/resume-1"]}>
      <RouteSwitch />
      <Routes>
        <Route path="/edit/:id" element={<EditorPage />} />
        <Route path="/" element={<div>版本库首页</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("EditorPage reliability", () => {
  beforeEach(() => {
    apiMock.get.mockResolvedValue(cloneDocument());
    apiMock.save.mockImplementation(async (document: ResumeDocument) => ({
      ...document,
      revision: document.revision + 1,
      updated_at: "2026-01-02T00:00:00Z",
    }));
    apiMock.duplicate.mockReset();
    apiMock.photo.mockReset();
    apiMock.exportPdf.mockReset();
    apiMock.library.mockReset().mockResolvedValue([structuredClone(libraryEntry)]);
    apiMock.list.mockReset().mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("serializes rapid saves and carries the returned revision forward", async () => {
    vi.useFakeTimers();
    const firstSave = deferred<ResumeDocument>();
    apiMock.save
      .mockReset()
      .mockImplementationOnce(() => firstSave.promise)
      .mockImplementationOnce(async (document: ResumeDocument) => ({
        ...document,
        revision: 3,
        updated_at: "2026-01-03T00:00:00Z",
      }));
    renderEditor();
    await act(async () => undefined);

    fireEvent.change(screen.getByRole("textbox", { name: "版本名称" }), {
      target: { value: "第一次编辑" },
    });
    await act(() => vi.advanceTimersByTimeAsync(750));
    expect(apiMock.save).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByRole("textbox", { name: "版本名称" }), {
      target: { value: "第二次编辑" },
    });
    await act(() => vi.advanceTimersByTimeAsync(750));
    expect(apiMock.save).toHaveBeenCalledTimes(1);

    await act(async () => {
      firstSave.resolve({
        ...cloneDocument(),
        title: "第一次编辑",
        revision: 2,
        updated_at: "2026-01-02T00:00:00Z",
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(apiMock.save).toHaveBeenCalledTimes(2));
    expect(apiMock.save.mock.calls[1][0]).toMatchObject({
      title: "第二次编辑",
      revision: 2,
    });
  });

  it("flushes pending edits before returning to the library", async () => {
    const save = deferred<ResumeDocument>();
    apiMock.save.mockReset().mockImplementationOnce(() => save.promise);
    renderEditor();
    await screen.findByDisplayValue("初始版本");

    fireEvent.change(screen.getByRole("textbox", { name: "版本名称" }), {
      target: { value: "离开前保存" },
    });
    fireEvent.click(screen.getByRole("button", { name: "返回版本库" }));

    expect(apiMock.save).toHaveBeenCalledOnce();
    expect(screen.queryByText("版本库首页")).not.toBeInTheDocument();
    await act(async () => {
      save.resolve({
        ...cloneDocument(),
        title: "离开前保存",
        revision: 2,
        updated_at: "2026-01-02T00:00:00Z",
      });
    });
    expect(await screen.findByText("版本库首页")).toBeInTheDocument();
  });

  it("flushes the previous resume before a route parameter switch", async () => {
    apiMock.get.mockImplementation(async (id: string) =>
      id === "resume-2"
        ? { ...cloneDocument(), id: "resume-2", title: "第二份简历", revision: 7 }
        : cloneDocument(),
    );
    renderEditor();
    await screen.findByDisplayValue("初始版本");

    fireEvent.change(screen.getByRole("textbox", { name: "版本名称" }), {
      target: { value: "切换前必须保存" },
    });
    fireEvent.click(screen.getByRole("button", { name: "切换测试简历" }));

    await waitFor(() =>
      expect(apiMock.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: "resume-1", title: "切换前必须保存" }),
      ),
    );
    expect(await screen.findByDisplayValue("第二份简历")).toBeInTheDocument();
    expect(apiMock.save.mock.calls.every(([value]) => value.id === "resume-1")).toBe(true);
  });

  it("shows a save conflict without replacing the editor", async () => {
    apiMock.save.mockReset().mockRejectedValueOnce(new ApiError("版本号已变化", 409));
    renderEditor();
    await screen.findByDisplayValue("初始版本");

    fireEvent.change(screen.getByRole("textbox", { name: "版本名称" }), {
      target: { value: "保留在编辑器里的内容" },
    });
    fireEvent.click(screen.getByRole("button", { name: "返回版本库" }));

    expect(await screen.findByText(/保存冲突/)).toBeInTheDocument();
    expect(screen.getByDisplayValue("保留在编辑器里的内容")).toBeInTheDocument();
    expect(screen.queryByText("版本库首页")).not.toBeInTheDocument();
  });

  it("restores only the deleted item and keeps later field edits", async () => {
    renderEditor();
    await screen.findByText("示例项目");

    fireEvent.click(screen.getByRole("button", { name: "删除测试条目" }));
    expect(screen.queryByText("示例项目")).not.toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue("示例用户"), {
      target: { value: "删除后修改的姓名" },
    });
    fireEvent.click(screen.getByRole("button", { name: "撤销" }));

    expect(screen.getByText("示例项目")).toBeInTheDocument();
    expect(screen.getByDisplayValue("删除后修改的姓名")).toBeInTheDocument();
  });

  it("saves before a photo upload and merges only photo metadata", async () => {
    const upload = deferred<ResumeDocument>();
    apiMock.photo.mockImplementationOnce(() => upload.promise);
    renderEditor();
    await screen.findByDisplayValue("初始版本");

    fireEvent.change(screen.getByRole("textbox", { name: "版本名称" }), {
      target: { value: "本地新标题" },
    });
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    fireEvent.change(input!, {
      target: { files: [new File(["photo"], "photo.png", { type: "image/png" })] },
    });

    await waitFor(() => expect(apiMock.photo).toHaveBeenCalledWith("resume-1", expect.any(File), 2));
    fireEvent.change(screen.getByDisplayValue("示例用户"), {
      target: { value: "上传期间修改的姓名" },
    });
    await act(async () => {
      upload.resolve({
        ...cloneDocument(),
        revision: 3,
        title: "服务端旧标题",
        profile: { ...cloneDocument().profile, photo_url: "/api/assets/new-photo.png" },
        updated_at: "2026-01-03T00:00:00Z",
      });
    });

    expect(screen.getByDisplayValue("本地新标题")).toBeInTheDocument();
    expect(screen.getByDisplayValue("上传期间修改的姓名")).toBeInTheDocument();
    await waitFor(() => expect(apiMock.save).toHaveBeenCalledTimes(2));
    expect(apiMock.save.mock.calls[1][0]).toMatchObject({
      revision: 3,
      title: "本地新标题",
      profile: { name: "上传期间修改的姓名", photo_url: "/api/assets/new-photo.png" },
    });
  });

  it("keeps the editor visible when PDF generation fails", async () => {
    apiMock.exportPdf.mockRejectedValueOnce(new Error("浏览器未能生成 PDF"));
    renderEditor();
    await screen.findByDisplayValue("初始版本");

    const exportButton = await screen.findByRole("button", { name: "导出 PDF" });
    fireEvent.click(exportButton);

    expect(await screen.findByText("浏览器未能生成 PDF")).toBeInTheDocument();
    expect(screen.getByDisplayValue("初始版本")).toBeInTheDocument();
  });

  it("applies the single-page density preset and autosaves it", async () => {
    vi.useFakeTimers();
    renderEditor();
    await act(async () => undefined);

    fireEvent.click(screen.getByRole("button", { name: "单页密集" }));
    expect(screen.getByRole("button", { name: "单页密集" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await act(() => vi.advanceTimersByTimeAsync(750));

    expect(apiMock.save).toHaveBeenCalledWith(
      expect.objectContaining({
        appearance: expect.objectContaining({
          density: {
            preset: "dense",
            page_margin_vertical_mm: 13,
            page_margin_horizontal_mm: 14,
            font_size_pt: 9.8,
            item_title_font_size_pt: 11.1,
            line_height: 1.3,
            paragraph_spacing_percent: 60,
            name_contact_gap_mm: 2.5,
          },
        }),
      }),
    );
  });

  it("marks advanced density adjustments as custom and saves the latest value", async () => {
    vi.useFakeTimers();
    renderEditor();
    await act(async () => undefined);

    fireEvent.change(screen.getByRole("slider", { name: "左右页边距" }), {
      target: { value: "15" },
    });
    fireEvent.change(screen.getByRole("slider", { name: "正文字号" }), {
      target: { value: "10.2" },
    });
    fireEvent.change(screen.getByRole("slider", { name: "条目标题字号" }), {
      target: { value: "12.6" },
    });
    fireEvent.change(
      screen.getByRole("slider", { name: "姓名与联系方式间距" }),
      { target: { value: "3.5" } },
    );
    expect(screen.getByText("自定义")).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(750));

    expect(apiMock.save).toHaveBeenCalledTimes(1);
    expect(apiMock.save.mock.calls[0][0].appearance.density).toMatchObject({
      preset: "custom",
      page_margin_horizontal_mm: 15,
      font_size_pt: 10.2,
      item_title_font_size_pt: 12.6,
      name_contact_gap_mm: 3.5,
    });
  });

  it("adds a complete historical item with fresh identifiers and autosaves it", async () => {
    vi.useFakeTimers();
    renderEditor();
    await act(async () => undefined);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "打开条目内容库" }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(apiMock.library).toHaveBeenCalledOnce();
    expect(apiMock.list).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "添加条目：历史风控项目" }));
    await act(() => vi.advanceTimersByTimeAsync(750));

    expect(apiMock.save).toHaveBeenCalledOnce();
    const savedItem = apiMock.save.mock.calls[0][0].sections[0].items[1];
    expect(savedItem).toMatchObject({
      title: libraryEntry.item.title,
      bullets: [expect.objectContaining({ content: libraryEntry.item.bullets[0].content })],
    });
    expect(savedItem.id).not.toBe(libraryEntry.item.id);
    expect(savedItem.bullets[0].id).not.toBe(libraryEntry.item.bullets[0].id);
  });

  it("adds one historical bullet to the chosen item and keeps literal spacing", async () => {
    vi.useFakeTimers();
    renderEditor();
    await act(async () => undefined);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "打开要点内容库" }));
      await Promise.resolve();
      await Promise.resolve();
    });

    fireEvent.click(
      screen.getByRole("button", { name: "添加要点：使用 C++ 建立可复用特征管线" }),
    );
    await act(() => vi.advanceTimersByTimeAsync(750));

    expect(apiMock.save).toHaveBeenCalledOnce();
    const savedBullet = apiMock.save.mock.calls[0][0].sections[0].items[0].bullets[0];
    expect(savedBullet.content).toEqual(libraryEntry.item.bullets[0].content);
    expect(savedBullet.id).not.toBe(libraryEntry.item.bullets[0].id);
  });

  it("copies an item directly from another resume version", async () => {
    vi.useFakeTimers();
    const otherVersion: ResumeDocument = {
      ...cloneDocument(),
      id: "resume-2",
      title: "算法岗位版",
      sections: [
        {
          id: "other-projects",
          kind: "project",
          title: "项目经历",
          items: [
            {
              ...structuredClone(libraryEntry.item),
              id: "version-item",
              title: [{ text: "跨版本项目" }],
            },
          ],
        },
      ],
    };
    apiMock.list.mockResolvedValue([
      {
        id: "resume-2",
        revision: 1,
        title: "算法岗位版",
        source_filename: "algorithm.md",
        section_count: 1,
        created_at: otherVersion.created_at,
        updated_at: otherVersion.updated_at,
      },
    ]);
    apiMock.get.mockImplementation(async (resumeId: string) =>
      structuredClone(resumeId === "resume-2" ? otherVersion : baseDocument),
    );
    renderEditor();
    await act(async () => undefined);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "打开其他版本条目" }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(apiMock.list).toHaveBeenCalledOnce();
    expect(apiMock.library).not.toHaveBeenCalled();
    expect(apiMock.get).toHaveBeenCalledWith("resume-2");
    expect(screen.getByRole("heading", { name: "其他简历版本" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "添加条目：跨版本项目" }));
    await act(() => vi.advanceTimersByTimeAsync(750));

    const savedItems = apiMock.save.mock.calls[0][0].sections[0].items;
    expect(savedItems[1].title).toEqual([{ text: "跨版本项目" }]);
    expect(savedItems[1].id).not.toBe("version-item");
  });

  it("retries the pending save before reloading the content library", async () => {
    apiMock.save.mockRejectedValueOnce(new ApiError("版本号已变化", 409));
    renderEditor();
    await screen.findByDisplayValue("初始版本");

    fireEvent.change(screen.getByRole("textbox", { name: "版本名称" }), {
      target: { value: "尚未成功保存的版本" },
    });
    fireEvent.click(screen.getByRole("button", { name: "打开条目内容库" }));

    await waitFor(() =>
      expect(document.querySelector(".content-library-error")).toHaveTextContent("保存冲突"),
    );
    expect(apiMock.library).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "重试" }));

    await waitFor(() => expect(apiMock.save).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(apiMock.library).toHaveBeenCalledOnce());
    expect(apiMock.save.mock.calls[1][0]).toMatchObject({
      title: "尚未成功保存的版本",
      revision: 1,
    });
  });
});
