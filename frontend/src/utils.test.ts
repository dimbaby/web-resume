import { describe, expect, it } from "vitest";
import {
  inlineMarkdownSource,
  parseInlineMarkdown,
  plain,
  rich,
  styleRichText,
} from "./utils";

describe("rich text helpers", () => {
  it("preserves spaces exactly when converting between plain and rich text", () => {
    const value = "项目  名称   with spaces";

    expect(plain(rich(value))).toBe(value);
  });

  it("keeps spaces while applying title or subtitle styles", () => {
    const spans = rich("副标题  信息", { bold: false, italic: true });

    expect(plain(styleRichText(spans, { bold: true, italic: false }))).toBe(
      "副标题  信息",
    );
  });

  it("parses bold, italic and bold-italic Markdown without collapsing spaces", () => {
    const source =
      "使用 **Logistic  回归**、*WOE* 和 ***稳定性分析***，保留 A* 与 x_y";
    const spans = parseInlineMarkdown(source);

    expect(spans).toEqual([
      { text: "使用 ", bold: false, italic: false },
      { text: "Logistic  回归", bold: true, italic: false },
      { text: "、", bold: false, italic: false },
      { text: "WOE", bold: false, italic: true },
      { text: " 和 ", bold: false, italic: false },
      { text: "稳定性分析", bold: true, italic: true },
      { text: "，保留 A* 与 x_y", bold: false, italic: false },
    ]);
    expect(plain(spans)).toBe(
      "使用 Logistic  回归、WOE 和 稳定性分析，保留 A* 与 x_y",
    );
  });

  it("keeps unmatched, escaped and technical asterisks literal", () => {
    const source = "A*、2*3、未闭合 **重点，以及 \\*不是斜体\\*";
    const spans = parseInlineMarkdown(source);

    expect(plain(spans)).toBe("A*、2*3、未闭合 **重点，以及 *不是斜体*");
    expect(spans.every((span) => !span.bold && !span.italic)).toBe(true);
    expect(inlineMarkdownSource(spans)).toBe(source);
  });

  it("round-trips imported rich spans through editable Markdown", () => {
    const spans = [
      { text: "普通  ", bold: false, italic: false },
      { text: "重点", bold: true, italic: false },
      { text: " 与 ", bold: false, italic: false },
      { text: "斜体", bold: false, italic: true },
    ];
    const source = inlineMarkdownSource(spans);

    expect(source).toBe("普通  **重点** 与 *斜体*");
    expect(parseInlineMarkdown(source)).toEqual(spans);
  });

  it("does not repeat whole-title styling as Markdown markers", () => {
    const inherited = { bold: true, italic: false };
    const spans = rich("项目  标题", inherited);

    expect(inlineMarkdownSource(spans, inherited)).toBe("项目  标题");
    expect(parseInlineMarkdown("项目  标题", inherited)).toEqual(spans);
  });

  it("keeps transient markers stable while the user is still typing", () => {
    for (const source of ["*", "**", "***", "前缀 **尚未闭合"]) {
      expect(inlineMarkdownSource(parseInlineMarkdown(source))).toBe(source);
    }
  });

  it("supports Chinese text touching a strong marker and line-local emphasis", () => {
    const source = "**专业：**统计学\n第二行 *说明*";
    const spans = parseInlineMarkdown(source);

    expect(spans).toEqual([
      { text: "专业：", bold: true, italic: false },
      { text: "统计学\n第二行 ", bold: false, italic: false },
      { text: "说明", bold: false, italic: true },
    ]);
    expect(inlineMarkdownSource(spans)).toBe(source);
  });
});
