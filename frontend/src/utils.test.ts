import { describe, expect, it } from "vitest";
import { plain, rich, styleRichText } from "./utils";

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
});
