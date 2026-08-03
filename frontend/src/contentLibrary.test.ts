import { describe, expect, it } from "vitest";
import type {
  LibraryEntry,
  ResumeBullet,
  ResumeDocument,
  ResumeItem,
} from "./types";
import {
  appendLibraryBullet,
  appendLibraryItem,
  cloneLibraryItem,
} from "./contentLibrary";

const sourceItem: ResumeItem = {
  id: "library-item",
  title: [
    { text: "跨平台工程", bold: true },
    { text: " C++ / C#", italic: true },
  ],
  subtitle: [{ text: ".NET  桌面端" }],
  title_style: { bold: true, italic: false },
  subtitle_style: { bold: false, italic: true },
  date: "2024.01 - 2024.06",
  bullets: [
    {
      id: "library-bullet-1",
      content: [{ text: "保留中文、C++、C#、.NET 和连续  空格", bold: true }],
    },
    {
      id: "library-bullet-2",
      content: [{ text: "第二条历史要点", italic: true }],
    },
  ],
};

function makeDocument(item: ResumeItem): ResumeDocument {
  return {
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
      {
        id: "project-section",
        kind: "project",
        title: "项目经历",
        items: [item],
      },
    ],
    warnings: [],
    source: { filename: "current.md", format: "md" },
    created_at: "2026-07-17T00:00:00Z",
    updated_at: "2026-07-17T00:00:00Z",
  };
}

function makeEntry(item = sourceItem): LibraryEntry {
  return {
    id: "entry-1",
    section_kind: "project",
    section_title: "项目经历",
    item,
    source_resume_id: "source-resume",
    source_resume_title: "完整简历",
    source_filename: "resume.md",
    created_at: "2026-07-17T00:00:00Z",
    updated_at: "2026-07-17T00:00:00Z",
  };
}

describe("content library cloning", () => {
  it("deep-clones an item with fresh item and bullet IDs without mutating the source", () => {
    const sourceSnapshot = structuredClone(sourceItem);

    const first = cloneLibraryItem(sourceItem);
    const second = cloneLibraryItem(sourceItem);

    expect(first).toEqual({
      ...sourceItem,
      id: expect.any(String),
      bullets: sourceItem.bullets.map((bullet) => ({
        ...bullet,
        id: expect.any(String),
      })),
    });
    expect(first.id).not.toBe(sourceItem.id);
    expect(second.id).not.toBe(first.id);
    expect(first.bullets.map((bullet) => bullet.id)).not.toContain(sourceItem.bullets[0].id);
    expect(new Set(first.bullets.map((bullet) => bullet.id)).size).toBe(first.bullets.length);
    expect(second.bullets.map((bullet) => bullet.id)).not.toEqual(
      first.bullets.map((bullet) => bullet.id),
    );
    expect(first.title).not.toBe(sourceItem.title);
    expect(first.title[0]).not.toBe(sourceItem.title[0]);
    expect(first.bullets[0].content).not.toBe(sourceItem.bullets[0].content);
    expect(first.bullets[0].content[0]).not.toBe(sourceItem.bullets[0].content[0]);
    expect(sourceItem).toEqual(sourceSnapshot);
  });
});

describe("content library insertion", () => {
  it("rejects an exact item duplicate while allowing a near-match and assigning fresh IDs", () => {
    const existing = cloneLibraryItem(sourceItem);
    const document = makeDocument(existing);

    const duplicate = appendLibraryItem(document, "project-section", makeEntry());
    expect(duplicate).toEqual({ document, added: false });

    const nearMatch: ResumeItem = {
      ...sourceItem,
      id: "near-match",
      subtitle: [{ text: ".NET 桌面端" }],
    };
    const added = appendLibraryItem(document, "project-section", makeEntry(nearMatch));
    const inserted = added.document.sections[0].items[1];

    expect(added.added).toBe(true);
    expect(inserted.id).not.toBe(nearMatch.id);
    expect(inserted.bullets.map((bullet) => bullet.id)).not.toEqual(
      nearMatch.bullets.map((bullet) => bullet.id),
    );
    expect(inserted.subtitle[0].text).toBe(".NET 桌面端");
    expect(document.sections[0].items).toHaveLength(1);
  });

  it("rejects an exact bullet duplicate but preserves literal technical text and spaces", () => {
    const existingBullet: ResumeBullet = {
      id: "current-bullet",
      content: sourceItem.bullets[0].content.map((span) => ({ ...span })),
    };
    const currentItem: ResumeItem = {
      ...sourceItem,
      id: "current-item",
      bullets: [existingBullet],
    };
    const document = makeDocument(currentItem);

    const duplicate = appendLibraryBullet(
      document,
      "project-section",
      "current-item",
      sourceItem.bullets[0],
    );
    expect(duplicate).toEqual({ document, added: false });

    const literalNearMatch: ResumeBullet = {
      id: "literal-near-match",
      content: [{ text: "保留中文、C++、C#、.NET 和连续 空格", bold: true }],
    };
    const added = appendLibraryBullet(
      document,
      "project-section",
      "current-item",
      literalNearMatch,
    );
    const inserted = added.document.sections[0].items[0].bullets[1];

    expect(added.added).toBe(true);
    expect(inserted.id).not.toBe(literalNearMatch.id);
    expect(inserted.content[0].text).toBe("保留中文、C++、C#、.NET 和连续 空格");
    expect(document.sections[0].items[0].bullets).toHaveLength(1);
  });
});
