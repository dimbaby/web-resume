from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator


class RichTextSpan(BaseModel):
    text: str
    bold: bool = False
    italic: bool = False


RichText = list[RichTextSpan]


class TextStyle(BaseModel):
    bold: bool = False
    italic: bool = False


class ResumeBullet(BaseModel):
    id: str
    content: RichText = Field(default_factory=list)


class ResumeItem(BaseModel):
    id: str
    title: RichText = Field(default_factory=list)
    subtitle: RichText = Field(default_factory=list)
    title_style: TextStyle = Field(
        default_factory=lambda: TextStyle(bold=True, italic=False)
    )
    subtitle_style: TextStyle = Field(
        default_factory=lambda: TextStyle(bold=False, italic=True)
    )
    date: str = ""
    bullets: list[ResumeBullet] = Field(default_factory=list)


SectionKind = Literal[
    "education",
    "project",
    "experience",
    "skills",
    "awards",
    "campus",
    "custom",
    "unresolved",
]


class ResumeSection(BaseModel):
    id: str
    kind: SectionKind = "custom"
    title: str
    items: list[ResumeItem] = Field(default_factory=list)


class ResumeProfile(BaseModel):
    name: str = ""
    email: str = ""
    phone: str = ""
    photo_url: str = ""


class SourceInfo(BaseModel):
    filename: str = ""
    format: Literal["md", "docx", "manual"] = "manual"


TemplateStyle = Literal["reference", "ats", "modern", "compact", "elegant"]
BulletStyle = Literal["triangle", "dot", "dash", "square", "none"]
DensityPreset = Literal["standard", "compact", "dense", "custom"]


class ResumeDensity(BaseModel):
    preset: DensityPreset = "standard"
    page_margin_vertical_mm: int = Field(default=19, ge=13, le=24)
    page_margin_horizontal_mm: int = Field(default=19, ge=13, le=22)
    font_size_pt: float = Field(default=10.9, ge=9.5, le=11.5)
    item_title_font_size_pt: float = Field(default=12.0, ge=10.2, le=14.0)
    line_height: float = Field(default=1.52, ge=1.28, le=1.6)
    paragraph_spacing_percent: int = Field(default=100, ge=60, le=120)


_LEGACY_TEMPLATE_DENSITY: dict[str, tuple[float, float, float]] = {
    "reference": (10.9, 12.0, 1.52),
    "ats": (10.4, 12.0, 1.45),
    "modern": (10.9, 12.0, 1.52),
    "compact": (9.8, 11.2, 1.38),
    "elegant": (10.6, 12.0, 1.52),
}


def _standard_density(template: str) -> ResumeDensity:
    font_size, item_title_font_size, line_height = _LEGACY_TEMPLATE_DENSITY.get(
        template, _LEGACY_TEMPLATE_DENSITY["reference"]
    )
    return ResumeDensity(
        font_size_pt=font_size,
        item_title_font_size_pt=item_title_font_size,
        line_height=line_height,
    )


class ResumeAppearance(BaseModel):
    template: TemplateStyle = "reference"
    bullet_style: BulletStyle = "triangle"
    density: ResumeDensity = Field(default_factory=ResumeDensity)

    @model_validator(mode="before")
    @classmethod
    def preserve_legacy_template_density(cls, value):
        if isinstance(value, dict) and not value.get("density"):
            migrated = dict(value)
            migrated["density"] = _standard_density(
                str(migrated.get("template", "reference"))
            ).model_dump()
            return migrated
        if isinstance(value, dict) and isinstance(value.get("density"), dict):
            density = value["density"]
            if "item_title_font_size_pt" not in density:
                template = str(value.get("template", "reference"))
                legacy = _standard_density(template)
                migrated = dict(value)
                migrated["density"] = {
                    **density,
                    "item_title_font_size_pt": legacy.item_title_font_size_pt,
                }
                return migrated
        return value


class ResumeDocument(BaseModel):
    id: str
    title: str
    profile: ResumeProfile = Field(default_factory=ResumeProfile)
    appearance: ResumeAppearance = Field(default_factory=ResumeAppearance)
    sections: list[ResumeSection] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    source: SourceInfo = Field(default_factory=SourceInfo)
    revision: int = Field(default=0, ge=0)
    deleted_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class ResumeSummary(BaseModel):
    id: str
    title: str
    source_filename: str = ""
    section_count: int = 0
    revision: int = Field(default=0, ge=0)
    deleted_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class LibraryEntry(BaseModel):
    id: str
    section_kind: SectionKind
    section_title: str
    item: ResumeItem
    source_resume_id: str
    source_resume_title: str
    source_filename: str = ""
    created_at: datetime
    updated_at: datetime


class DuplicateRequest(BaseModel):
    title: Optional[str] = None


class RenameRequest(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    revision: int = Field(ge=0)
