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
      name_contact_gap_mm: 5,
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
      name_contact_gap_mm: 2.5,
    });
  });

  it("rounds a migrated header gap to the slider step", () => {
    const appearance = normalizeAppearance({
      template: "reference",
      bullet_style: "triangle",
      density: {
        preset: "custom",
        paragraph_spacing_percent: 80,
      },
    } as any);

    expect(appearance.density.name_contact_gap_mm).toBe(5.5);
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
        name_contact_gap_mm: 99,
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
      name_contact_gap_mm: 10,
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
        name_contact_gap_mm: 4.5,
      },
    };

    expect(makePageStylesheet(appearance)).toContain("margin: 14mm 15mm");
    const styles = makeResumeLayoutStyle(appearance, true);
    expect(styles["--resume-font-size"]).toBe("10.1pt");
    expect(styles["--resume-item-title-font-size"]).toBe("11.8pt");
    expect(styles["--resume-line-height"]).toBe("1.34");
    expect(styles["--resume-name-bottom-gap"]).toBe("4.5mm");
    expect(styles["--resume-photo-width"]).toBe("21mm");
    expect(styles["--resume-photo-height"]).toBe("29.4mm");
    expect(styles["--resume-photo-top"]).toBe("-3.4mm");
    expect(styles["--resume-photo-padding-right"]).toBe("23mm");
    expect(styles["--resume-item-gap"]).toBe("1.19mm");
    expect(styles["--resume-header-min-height"]).toBe("26mm");
  });

  it("shrinks the photo and occupied header height with the dense header gap", () => {
    const standard = makeResumeLayoutStyle(
      {
        template: "reference",
        bullet_style: "triangle",
        density: makeDensityPreset("reference", "standard"),
      },
      true,
    );
    const dense = makeResumeLayoutStyle(
      {
        template: "reference",
        bullet_style: "triangle",
        density: makeDensityPreset("reference", "dense"),
      },
      true,
    );

    expect(standard["--resume-photo-width"]).toBe("22.25mm");
    expect(standard["--resume-photo-height"]).toBe("31.15mm");
    expect(standard["--resume-header-min-height"]).toBe("27.25mm");
    expect(dense["--resume-photo-width"]).toBe("20mm");
    expect(dense["--resume-photo-height"]).toBe("28mm");
    expect(dense["--resume-header-min-height"]).toBe("25mm");
  });
});
