import type { CSSProperties } from "react";
import type {
  BulletStyle,
  DensityPreset,
  ResumeAppearance,
  ResumeDensity,
  TemplateStyle,
} from "./types";

type TemplateMetrics = {
  fontSizePt: number;
  lineHeight: number;
  headerMinMm: number;
  nameBottomMm: number;
  sectionGapMm: number;
  sectionTitleGapMm: number;
  sectionTitlePaddingMm: number;
  itemGapMm: number;
  subtitleTopMm: number;
  subtitleBottomMm: number;
  bulletsTopMm: number;
};

const TEMPLATE_METRICS: Record<TemplateStyle, TemplateMetrics> = {
  reference: {
    fontSizePt: 10.9,
    lineHeight: 1.52,
    headerMinMm: 34,
    nameBottomMm: 7,
    sectionGapMm: 2.3,
    sectionTitleGapMm: 1.7,
    sectionTitlePaddingMm: 0.7,
    itemGapMm: 1.7,
    subtitleTopMm: 0.5,
    subtitleBottomMm: 0.6,
    bulletsTopMm: 0.5,
  },
  ats: {
    fontSizePt: 10.4,
    lineHeight: 1.45,
    headerMinMm: 34,
    nameBottomMm: 7,
    sectionGapMm: 2.3,
    sectionTitleGapMm: 1.7,
    sectionTitlePaddingMm: 0.7,
    itemGapMm: 1.7,
    subtitleTopMm: 0.5,
    subtitleBottomMm: 0.6,
    bulletsTopMm: 0.5,
  },
  modern: {
    fontSizePt: 10.9,
    lineHeight: 1.52,
    headerMinMm: 34,
    nameBottomMm: 7,
    sectionGapMm: 2.3,
    sectionTitleGapMm: 1.7,
    sectionTitlePaddingMm: 0.7,
    itemGapMm: 1.7,
    subtitleTopMm: 0.5,
    subtitleBottomMm: 0.6,
    bulletsTopMm: 0.5,
  },
  compact: {
    fontSizePt: 9.8,
    lineHeight: 1.38,
    headerMinMm: 29,
    nameBottomMm: 5,
    sectionGapMm: 1.5,
    sectionTitleGapMm: 1.1,
    sectionTitlePaddingMm: 0.4,
    itemGapMm: 1.1,
    subtitleTopMm: 0.5,
    subtitleBottomMm: 0.6,
    bulletsTopMm: 0.5,
  },
  elegant: {
    fontSizePt: 10.6,
    lineHeight: 1.52,
    headerMinMm: 34,
    nameBottomMm: 7,
    sectionGapMm: 2.3,
    sectionTitleGapMm: 1.7,
    sectionTitlePaddingMm: 0.7,
    itemGapMm: 1.7,
    subtitleTopMm: 0.5,
    subtitleBottomMm: 0.6,
    bulletsTopMm: 0.5,
  },
};

export const DENSITY_LIMITS = {
  pageMarginVerticalMm: { min: 13, max: 24, step: 1 },
  pageMarginHorizontalMm: { min: 13, max: 22, step: 1 },
  fontSizePt: { min: 9.5, max: 11.5, step: 0.1 },
  lineHeight: { min: 1.28, max: 1.6, step: 0.02 },
  paragraphSpacingPercent: { min: 60, max: 120, step: 5 },
} as const;

const TEMPLATE_STYLES: TemplateStyle[] = [
  "reference",
  "ats",
  "modern",
  "compact",
  "elegant",
];
const BULLET_STYLES: BulletStyle[] = ["triangle", "dot", "dash", "square", "none"];
const DENSITY_PRESETS: DensityPreset[] = ["standard", "compact", "dense", "custom"];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function finiteOr(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function makeDensityPreset(
  template: TemplateStyle,
  preset: Exclude<DensityPreset, "custom">,
): ResumeDensity {
  const base = TEMPLATE_METRICS[template];
  if (preset === "standard") {
    return {
      preset,
      page_margin_vertical_mm: 19,
      page_margin_horizontal_mm: 19,
      font_size_pt: base.fontSizePt,
      line_height: base.lineHeight,
      paragraph_spacing_percent: 100,
    };
  }
  if (preset === "compact") {
    return {
      preset,
      page_margin_vertical_mm: 16,
      page_margin_horizontal_mm: 16,
      font_size_pt: Math.max(9.8, round(base.fontSizePt - 0.5, 1)),
      line_height: Math.max(1.34, round(base.lineHeight - 0.12, 2)),
      paragraph_spacing_percent: 78,
    };
  }
  return {
    preset,
    page_margin_vertical_mm: 13,
    page_margin_horizontal_mm: 14,
    font_size_pt: Math.max(9.5, round(base.fontSizePt - 1.1, 1)),
    line_height: Math.max(1.28, round(base.lineHeight - 0.22, 2)),
    paragraph_spacing_percent: 60,
  };
}

export const DEFAULT_APPEARANCE: ResumeAppearance = {
  template: "reference",
  bullet_style: "triangle",
  density: makeDensityPreset("reference", "standard"),
};

export function normalizeAppearance(
  value?: Partial<ResumeAppearance> | null,
): ResumeAppearance {
  const template = TEMPLATE_STYLES.includes(value?.template as TemplateStyle)
    ? (value?.template as TemplateStyle)
    : "reference";
  const bulletStyle = BULLET_STYLES.includes(value?.bullet_style as BulletStyle)
    ? (value?.bullet_style as BulletStyle)
    : "triangle";
  const rawDensity = value?.density as Partial<ResumeDensity> | undefined;
  const preset = DENSITY_PRESETS.includes(rawDensity?.preset as DensityPreset)
    ? (rawDensity?.preset as DensityPreset)
    : "standard";
  const fallback = makeDensityPreset(
    template,
    preset === "custom" ? "standard" : preset,
  );

  return {
    template,
    bullet_style: bulletStyle,
    density: {
      preset,
      page_margin_vertical_mm: Math.round(
        clamp(
          finiteOr(rawDensity?.page_margin_vertical_mm, fallback.page_margin_vertical_mm),
          DENSITY_LIMITS.pageMarginVerticalMm.min,
          DENSITY_LIMITS.pageMarginVerticalMm.max,
        ),
      ),
      page_margin_horizontal_mm: Math.round(
        clamp(
          finiteOr(
            rawDensity?.page_margin_horizontal_mm,
            fallback.page_margin_horizontal_mm,
          ),
          DENSITY_LIMITS.pageMarginHorizontalMm.min,
          DENSITY_LIMITS.pageMarginHorizontalMm.max,
        ),
      ),
      font_size_pt: round(
        clamp(
          finiteOr(rawDensity?.font_size_pt, fallback.font_size_pt),
          DENSITY_LIMITS.fontSizePt.min,
          DENSITY_LIMITS.fontSizePt.max,
        ),
        1,
      ),
      line_height: round(
        clamp(
          finiteOr(rawDensity?.line_height, fallback.line_height),
          DENSITY_LIMITS.lineHeight.min,
          DENSITY_LIMITS.lineHeight.max,
        ),
        2,
      ),
      paragraph_spacing_percent: Math.round(
        clamp(
          finiteOr(
            rawDensity?.paragraph_spacing_percent,
            fallback.paragraph_spacing_percent,
          ),
          DENSITY_LIMITS.paragraphSpacingPercent.min,
          DENSITY_LIMITS.paragraphSpacingPercent.max,
        ),
      ),
    },
  };
}

type ResumeLayoutProperties = CSSProperties & Record<`--resume-${string}`, string>;

function millimetres(value: number) {
  return `${round(value, 2)}mm`;
}

export function makeResumeLayoutStyle(
  appearance: ResumeAppearance,
  hasPhoto: boolean,
): ResumeLayoutProperties {
  const normalized = normalizeAppearance(appearance);
  const density = normalized.density;
  const base = TEMPLATE_METRICS[normalized.template];
  const spacingScale = density.paragraph_spacing_percent / 100;
  const headerMin = Math.max(hasPhoto ? 32.5 : 20, base.headerMinMm * spacingScale);

  return {
    "--resume-font-size": `${density.font_size_pt}pt`,
    "--resume-line-height": `${density.line_height}`,
    "--resume-item-line-height": `${Math.max(1.25, Math.min(1.4, density.line_height))}`,
    "--resume-header-min-height": millimetres(headerMin),
    "--resume-name-bottom-gap": millimetres(
      Math.max(3, base.nameBottomMm * spacingScale),
    ),
    "--resume-section-gap": millimetres(base.sectionGapMm * spacingScale),
    "--resume-section-title-gap": millimetres(
      base.sectionTitleGapMm * spacingScale,
    ),
    "--resume-section-title-padding": millimetres(
      base.sectionTitlePaddingMm * spacingScale,
    ),
    "--resume-item-gap": millimetres(base.itemGapMm * spacingScale),
    "--resume-subtitle-top": millimetres(base.subtitleTopMm * spacingScale),
    "--resume-subtitle-bottom": millimetres(
      base.subtitleBottomMm * spacingScale,
    ),
    "--resume-bullets-top": millimetres(base.bulletsTopMm * spacingScale),
  };
}

export function makePageStylesheet(appearance: ResumeAppearance) {
  const { density } = normalizeAppearance(appearance);
  const margin =
    density.page_margin_vertical_mm === 19 && density.page_margin_horizontal_mm === 19
      ? "18.9mm 19mm 19.1mm"
      : `${density.page_margin_vertical_mm}mm ${density.page_margin_horizontal_mm}mm`;
  return `@page { size: A4; margin: ${margin}; }`;
}
