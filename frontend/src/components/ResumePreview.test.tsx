import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ResumeDocument } from "../types";
import { ResumePreview } from "./ResumePreview";

const document: ResumeDocument = {
  id: "resume-1",
  title: "测试简历",
  profile: {
    name: "张三",
    email: "test@example.com",
    phone: "13800000000",
    photo_url: "",
  },
  appearance: {
    template: "reference",
    bullet_style: "triangle",
  },
  sections: [
    {
      id: "section-1",
      kind: "education",
      title: "教育经历",
      items: [
        {
          id: "item-1",
          title: [{ text: "示例大学", bold: true }],
          subtitle: [],
          title_style: { bold: true, italic: false },
          subtitle_style: { bold: false, italic: true },
          date: "2022.09 - 2026.06",
          bullets: [{ id: "bullet-1", content: [{ text: "专业：统计学" }] }],
        },
      ],
    },
  ],
  warnings: [],
  source: { filename: "resume.md", format: "md" },
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe("ResumePreview", () => {
  it("renders profile and structured sections", () => {
    render(<ResumePreview document={document} />);
    expect(screen.getByText("张三")).toBeInTheDocument();
    expect(screen.getByText("教育经历")).toBeInTheDocument();
    expect(screen.getByText("示例大学")).toBeInTheDocument();
    expect(screen.getByText("2022.09 - 2026.06")).toBeInTheDocument();
    expect(screen.getByText("专业：统计学")).toBeInTheDocument();
    expect(screen.getByRole("banner")).not.toHaveClass("has-photo");
  });

  it("uses the fixed default crop and reserves header space only when a photo exists", () => {
    const { container } = render(
      <ResumePreview
        document={{
          ...document,
          profile: { ...document.profile, photo_url: "/api/assets/photo.png" },
        }}
      />,
    );
    expect(container.querySelector(".resume-header")).toHaveClass("has-photo");
    expect(container.querySelector('img[alt="证件照"]')).not.toHaveAttribute("style");
  });

  it("can render a resume without bullet symbols", () => {
    const { container } = render(
      <ResumePreview
        document={{
          ...document,
          appearance: { ...document.appearance, bullet_style: "none" },
        }}
      />,
    );
    expect(container.querySelector(".resume-content")).toHaveClass("resume-bullet-none");
  });
});
