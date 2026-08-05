import { describe, expect, it } from "vitest";
import {
  makeDensityPreset,
  makePageStylesheet,
  makeResumeLayoutStyle,
  normalizeAppearance,
} from "./printLayout";

describe("print layout density", () => {
  it("keeps legacy template typography when density is absent", () => {
    const appearance = normalizeAppearance({
      template: "compact",
      bullet_style: "triangle",
    } as any);

    expect(appearance.density).toMatchObject({
      preset: "standard",
      font_size_pt: 9.8,
      item_title_font_size_pt: 11.2,
      line_height: 1.38,
      page_margin_vertical_mm: 19,
      page_margin_horizontal_mm: 19,
    });
  });

  it("provides a readable lower bound for the dense preset", () => {
    const density = makeDensityPreset("compact", "dense");

    expect(density).toEqual({
      preset: "dense",
      page_margin_vertical_mm: 13,
      page_margin_horizontal_mm: 14,
      font_size_pt: 9.5,
      item_title_font_size_pt: 10.7,
      line_height: 1.28,
      paragraph_spacing_percent: 60,
    });
  });

  it("clamps untrusted custom values before generating CSS", () => {
    const appearance = normalizeAppearance({
      template: "reference",
      bullet_style: "dot",
      density: {
        preset: "custom",
        page_margin_vertical_mm: 2,
        page_margin_horizontal_mm: 90,
        font_size_pt: 3,
        item_title_font_size_pt: 30,
        line_height: 7,
        paragraph_spacing_percent: 5,
      },
    });

    expect(appearance.density).toEqual({
      preset: "custom",
      page_margin_vertical_mm: 13,
      page_margin_horizontal_mm: 22,
      font_size_pt: 9.5,
      item_title_font_size_pt: 14,
      line_height: 1.6,
      paragraph_spacing_percent: 60,
    });
  });

  it("generates Paged.js page CSS and print variables from one density", () => {
    const appearance = {
      template: "reference" as const,
      bullet_style: "triangle" as const,
      density: {
        preset: "custom" as const,
        page_margin_vertical_mm: 14,
        page_margin_horizontal_mm: 15,
        font_size_pt: 10.1,
        item_title_font_size_pt: 11.8,
        line_height: 1.34,
        paragraph_spacing_percent: 70,
      },
    };

    expect(makePageStylesheet(appearance)).toContain("margin: 14mm 15mm");
    const styles = makeResumeLayoutStyle(appearance, true);
    expect(styles["--resume-font-size"]).toBe("10.1pt");
    expect(styles["--resume-item-title-font-size"]).toBe("11.8pt");
    expect(styles["--resume-line-height"]).toBe("1.34");
    expect(styles["--resume-item-gap"]).toBe("1.19mm");
    expect(styles["--resume-header-min-height"]).toBe("32.5mm");
  });
});
