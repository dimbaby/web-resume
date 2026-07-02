import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
      date: "2022 - 2026",
      bullets: [],
    },
  ],
};

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
      />,
    );

    expect(screen.queryByDisplayValue("示例大学")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "模块类型" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "展开模块" }));
    expect(screen.getByDisplayValue("示例大学")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "收起模块" })).toBeInTheDocument();
  });
});
