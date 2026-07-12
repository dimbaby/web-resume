import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ResumeDocument } from "../types";
import { ImportReviewPage } from "./ImportReviewPage";

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("../api", () => ({ api: apiMock }));

const document: ResumeDocument = {
  id: "resume-1",
  revision: 0,
  title: "导入版本",
  profile: {
    name: "林安",
    email: "lin.an@example.com",
    phone: "13800000000",
    photo_url: "",
  },
  appearance: { template: "reference", bullet_style: "triangle" },
  sections: [
    { id: "project", kind: "project", title: "项目经历", items: [] },
    {
      id: "unresolved",
      kind: "unresolved",
      title: "待确认内容",
      items: [
        {
          id: "item-1",
          title: [],
          subtitle: [],
          title_style: { bold: true, italic: false },
          subtitle_style: { bold: false, italic: true },
          date: "",
          bullets: [{ id: "bullet-1", content: [{ text: "未归类项目说明" }] }],
        },
      ],
    },
  ],
  warnings: ["有 1 段内容无法可靠归类。"],
  source: { filename: "sample.md", format: "md" },
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  deleted_at: null,
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/import/resume-1"]}>
      <Routes>
        <Route path="/import/:id" element={<ImportReviewPage />} />
        <Route path="/edit/:id" element={<div>详细编辑页</div>} />
        <Route path="/" element={<div>版本库首页</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ImportReviewPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.get.mockResolvedValue(structuredClone(document));
    apiMock.save.mockImplementation(async (value: ResumeDocument) => ({
      ...value,
      revision: value.revision + 1,
    }));
    apiMock.remove.mockResolvedValue(undefined);
  });

  it("edits and moves unresolved content before confirmation", async () => {
    renderPage();
    const textarea = await screen.findByRole("textbox", { name: "待确认内容" });
    fireEvent.change(textarea, { target: { value: "已校正的项目说明" } });
    fireEvent.change(screen.getByRole("combobox", { name: "目标模块" }), {
      target: { value: "project" },
    });
    fireEvent.click(screen.getByRole("button", { name: "移入模块" }));
    fireEvent.click(screen.getByRole("button", { name: "确认并进入编辑" }));

    await waitFor(() => expect(apiMock.save).toHaveBeenCalledOnce());
    const saved = apiMock.save.mock.calls[0][0] as ResumeDocument;
    expect(saved.warnings).toEqual([]);
    expect(saved.sections.some((section) => section.kind === "unresolved")).toBe(false);
    expect(saved.sections[0].items[0].bullets[0].content[0].text).toBe(
      "已校正的项目说明",
    );
    expect(await screen.findByText("详细编辑页")).toBeInTheDocument();
  });

  it("moves an abandoned import to the recycle bin", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "核对导入结果" });
    fireEvent.click(screen.getByRole("button", { name: "放弃本次导入" }));
    fireEvent.click(screen.getByRole("button", { name: "移入回收站" }));

    await waitFor(() => expect(apiMock.remove).toHaveBeenCalledWith("resume-1", 0));
    expect(await screen.findByText("版本库首页")).toBeInTheDocument();
  });
});
