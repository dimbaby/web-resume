import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResumeSection } from "../types";
import { SectionEditor } from "./SectionEditor";

const section: ResumeSection = {
  id: "education",
  kind: "education",
  title: "教育经历",
  items: [
    {
      id: "school",
      title: [{ text: "示例大学" }],
      subtitle: [],
      title_style: { bold: true, italic: false },
      subtitle_style: { bold: false, italic: true },
      date: "2022 - 2026",
      bullets: [],
    },
  ],
};

afterEach(cleanup);

describe("SectionEditor", () => {
  it("starts collapsed and reveals nested editing on demand", () => {
    render(
      <SectionEditor
        section={section}
        handle={<span>handle</span>}
        onChange={vi.fn()}
        onDeleteSection={vi.fn()}
        onDeleteItem={vi.fn()}
        onDeleteBullet={vi.fn()}
        onOpenItemLibrary={vi.fn()}
        onOpenBulletLibrary={vi.fn()}
        onOpenItemVersions={vi.fn()}
        onOpenBulletVersions={vi.fn()}
      />,
    );

    expect(screen.queryByDisplayValue("示例大学")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "模块类型" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "展开模块" }));
    expect(screen.getByDisplayValue("示例大学")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "收起模块" })).toBeInTheDocument();
  });

  it("opens the library for a whole item or for bullets in the selected item", () => {
    const onOpenItemLibrary = vi.fn();
    const onOpenBulletLibrary = vi.fn();
    const onOpenItemVersions = vi.fn();
    const onOpenBulletVersions = vi.fn();
    render(
      <SectionEditor
        section={section}
        handle={<span>handle</span>}
        onChange={vi.fn()}
        onDeleteSection={vi.fn()}
        onDeleteItem={vi.fn()}
        onDeleteBullet={vi.fn()}
        onOpenItemLibrary={onOpenItemLibrary}
        onOpenBulletLibrary={onOpenBulletLibrary}
        onOpenItemVersions={onOpenItemVersions}
        onOpenBulletVersions={onOpenBulletVersions}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "展开模块" }));
    fireEvent.click(screen.getByRole("button", { name: "从库中添加条目" }));
    fireEvent.click(screen.getByRole("button", { name: "从库中选择要点" }));
    fireEvent.click(screen.getByRole("button", { name: "从其他版本选择条目" }));
    fireEvent.click(screen.getByRole("button", { name: "从其他版本选择要点" }));

    expect(onOpenItemLibrary).toHaveBeenCalledOnce();
    expect(onOpenBulletLibrary).toHaveBeenCalledOnce();
    expect(onOpenBulletLibrary).toHaveBeenCalledWith("school");
    expect(onOpenItemVersions).toHaveBeenCalledOnce();
    expect(onOpenBulletVersions).toHaveBeenCalledWith("school");
  });

  it("collapses an item into a compact row without changing resume data", () => {
    const onChange = vi.fn();
    render(
      <SectionEditor
        section={section}
        handle={<span>handle</span>}
        onChange={onChange}
        onDeleteSection={vi.fn()}
        onDeleteItem={vi.fn()}
        onDeleteBullet={vi.fn()}
        onOpenItemLibrary={vi.fn()}
        onOpenBulletLibrary={vi.fn()}
        onOpenItemVersions={vi.fn()}
        onOpenBulletVersions={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "展开模块" }));
    expect(screen.getByDisplayValue("示例大学")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "折叠条目：示例大学" }),
    );

    expect(screen.queryByDisplayValue("示例大学")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "展开条目：示例大学" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "展开条目：示例大学" }),
    );
    expect(screen.getByDisplayValue("示例大学")).toBeInTheDocument();
  });

  it("collapses and expands all items in a section with one action", () => {
    render(
      <SectionEditor
        section={section}
        handle={<span>handle</span>}
        onChange={vi.fn()}
        onDeleteSection={vi.fn()}
        onDeleteItem={vi.fn()}
        onDeleteBullet={vi.fn()}
        onOpenItemLibrary={vi.fn()}
        onOpenBulletLibrary={vi.fn()}
        onOpenItemVersions={vi.fn()}
        onOpenBulletVersions={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "展开模块" }));
    fireEvent.click(screen.getByRole("button", { name: "一键折叠全部" }));

    expect(screen.queryByDisplayValue("示例大学")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "展开条目：示例大学" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "一键展开全部" }));

    expect(screen.getByDisplayValue("示例大学")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "折叠条目：示例大学" }),
    ).toBeInTheDocument();
  });

  it("edits inline Markdown while preserving rich spans and technical symbols", () => {
    const onChange = vi.fn();
    const markdownSection: ResumeSection = {
      ...section,
      items: [
        {
          ...section.items[0],
          bullets: [
            {
              id: "result",
              content: [
                { text: "完成 ", bold: false, italic: false },
                { text: "核心模型", bold: true, italic: false },
              ],
            },
          ],
        },
      ],
    };
    render(
      <SectionEditor
        section={markdownSection}
        handle={<span>handle</span>}
        onChange={onChange}
        onDeleteSection={vi.fn()}
        onDeleteItem={vi.fn()}
        onDeleteBullet={vi.fn()}
        onOpenItemLibrary={vi.fn()}
        onOpenBulletLibrary={vi.fn()}
        onOpenItemVersions={vi.fn()}
        onOpenBulletVersions={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "展开模块" }));
    const bulletEditor = screen.getByRole("textbox", { name: "描述要点" });
    expect(bulletEditor).toHaveValue("完成 **核心模型**");

    fireEvent.change(bulletEditor, {
      target: { value: "完成 **核心  模型**、*验证*，保留 A* 与 x_y" },
    });

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            bullets: [
              expect.objectContaining({
                content: [
                  { text: "完成 ", bold: false, italic: false },
                  { text: "核心  模型", bold: true, italic: false },
                  { text: "、", bold: false, italic: false },
                  { text: "验证", bold: false, italic: true },
                  {
                    text: "，保留 A* 与 x_y",
                    bold: false,
                    italic: false,
                  },
                ],
              }),
            ],
          }),
        ],
      }),
    );
  });
});
