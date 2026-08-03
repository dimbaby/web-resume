import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  LibraryEntry,
  ResumeDocument,
  ResumeItem,
  SectionKind,
} from "../types";
import { ContentLibraryDialog } from "./ContentLibraryDialog";

afterEach(cleanup);

const currentItem: ResumeItem = {
  id: "current-item",
  title: [{ text: "当前项目" }],
  subtitle: [{ text: "当前角色" }],
  title_style: { bold: true, italic: false },
  subtitle_style: { bold: false, italic: true },
  date: "2026",
  bullets: [{ id: "current-bullet", content: [{ text: "已经存在的要点" }] }],
};

const document: ResumeDocument = {
  id: "resume-1",
  revision: 1,
  title: "当前简历",
  profile: { name: "测试用户", email: "", phone: "", photo_url: "" },
  appearance: {
    template: "reference",
    bullet_style: "triangle",
    density: {
      preset: "standard",
      page_margin_vertical_mm: 19,
      page_margin_horizontal_mm: 19,
      font_size_pt: 10.9,
      line_height: 1.52,
      paragraph_spacing_percent: 100,
    },
  },
  sections: [
    { id: "project-section", kind: "project", title: "项目经历", items: [currentItem] },
  ],
  warnings: [],
  source: { filename: "current.md", format: "md" },
  created_at: "2026-07-17T00:00:00Z",
  updated_at: "2026-07-17T00:00:00Z",
};

function makeItem(
  id: string,
  title: string,
  bullets: Array<{ id: string; text: string }>,
): ResumeItem {
  return {
    id,
    title: [{ text: title }],
    subtitle: [{ text: "C# / .NET  中文平台" }],
    title_style: { bold: true, italic: false },
    subtitle_style: { bold: false, italic: false },
    date: "2025",
    bullets: bullets.map((bullet) => ({
      id: bullet.id,
      content: [{ text: bullet.text }],
    })),
  };
}

function makeEntry(
  id: string,
  kind: SectionKind,
  sectionTitle: string,
  item: ResumeItem,
): LibraryEntry {
  return {
    id,
    section_kind: kind,
    section_title: sectionTitle,
    item,
    source_resume_id: `source-${id}`,
    source_resume_title: "完整简历",
    source_filename: "resume.md",
    created_at: "2026-07-17T00:00:00Z",
    updated_at: "2026-07-17T00:00:00Z",
  };
}

const technicalEntry = makeEntry(
  "technical-entry",
  "project",
  "项目经历",
  makeItem("technical-item", "C++ 引擎", [
    { id: "technical-bullet", text: "支持 C++、C#、.NET 与中文  连续空格" },
  ]),
);

const educationEntry = makeEntry(
  "education-entry",
  "education",
  "教育经历",
  makeItem("education-item", "示例大学", [{ id: "course", text: "核心课程" }]),
);

function renderItemDialog(
  entries: LibraryEntry[] = [technicalEntry, educationEntry],
  overrides: Partial<React.ComponentProps<typeof ContentLibraryDialog>> = {},
) {
  const props: React.ComponentProps<typeof ContentLibraryDialog> = {
    document,
    entries,
    target: { mode: "item", sectionId: "project-section" },
    loading: false,
    error: "",
    notice: "",
    onClose: vi.fn(),
    onRetry: vi.fn(),
    onAddItem: vi.fn(),
    onAddBullet: vi.fn(),
    ...overrides,
  };
  render(<ContentLibraryDialog {...props} />);
  return props;
}

describe("ContentLibraryDialog search and filters", () => {
  it("searches C++, C#, .NET, Chinese, and consecutive spaces as literal text", () => {
    renderItemDialog();
    const search = screen.getByRole("textbox", { name: "搜索个人内容库" });

    for (const query of ["C++", "C#", ".NET", "中文", "中文  连续空格"]) {
      fireEvent.change(search, { target: { value: query } });
      expect(screen.getByRole("heading", { name: "C++ 引擎" })).toBeInTheDocument();
    }

    fireEvent.change(search, { target: { value: "中文 连续空格" } });
    expect(screen.queryByRole("heading", { name: "C++ 引擎" })).not.toBeInTheDocument();
    expect(screen.getByText("没有符合条件的内容")).toBeInTheDocument();
  });

  it("defaults to the destination module and lets the user switch module filters", () => {
    renderItemDialog();

    expect(screen.getByRole("combobox", { name: "筛选内容库模块" })).toHaveValue("project");
    expect(screen.getByRole("heading", { name: "C++ 引擎" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "示例大学" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "筛选内容库模块" }), {
      target: { value: "education" },
    });
    expect(screen.getByRole("heading", { name: "示例大学" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "C++ 引擎" })).not.toBeInTheDocument();
  });
});

describe("ContentLibraryDialog actions", () => {
  it("disables exact duplicate items and calls the add, close, and retry callbacks", () => {
    const duplicateEntry = makeEntry(
      "duplicate-entry",
      "project",
      "项目经历",
      { ...currentItem, id: "library-copy", bullets: [{ ...currentItem.bullets[0], id: "copy" }] },
    );
    const props = renderItemDialog([technicalEntry, duplicateEntry], {
      error: "读取失败",
    });

    expect(screen.getByRole("button", { name: "添加条目：当前项目" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "添加条目：C++ 引擎" }));
    expect(props.onAddItem).toHaveBeenCalledOnce();
    expect(props.onAddItem).toHaveBeenCalledWith(technicalEntry);

    fireEvent.click(screen.getByRole("button", { name: "关闭个人内容库" }));
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(props.onClose).toHaveBeenCalledOnce();
    expect(props.onRetry).toHaveBeenCalledOnce();
  });

  it("disables an existing bullet and calls onAddBullet with the selected source", () => {
    const entry = makeEntry(
      "bullet-entry",
      "project",
      "项目经历",
      makeItem("bullet-item", "历史项目", [
        { id: "duplicate-bullet", text: "已经存在的要点" },
        { id: "new-bullet", text: "可补回的 C++  要点" },
      ]),
    );
    const onAddBullet = vi.fn();
    render(
      <ContentLibraryDialog
        document={document}
        entries={[entry]}
        target={{ mode: "bullet", sectionId: "project-section", itemId: "current-item" }}
        loading={false}
        error=""
        notice=""
        onClose={vi.fn()}
        onRetry={vi.fn()}
        onAddItem={vi.fn()}
        onAddBullet={onAddBullet}
      />,
    );

    const card = screen.getByRole("heading", { name: "历史项目" }).closest("article");
    expect(card).not.toBeNull();
    expect(
      within(card as HTMLElement).getByRole("button", { name: "添加要点：已经存在的要点" }),
    ).toBeDisabled();

    const addButton = within(card as HTMLElement)
      .getAllByRole("button")
      .find((button) => button.getAttribute("aria-label")?.includes("可补回"));
    expect(addButton).toHaveAttribute("aria-label", "添加要点：可补回的 C++  要点");
    fireEvent.click(addButton as HTMLButtonElement);
    expect(onAddBullet).toHaveBeenCalledOnce();
    expect(onAddBullet).toHaveBeenCalledWith(entry, entry.item.bullets[1]);
  });
});
