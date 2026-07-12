from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


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


class ResumeAppearance(BaseModel):
    template: TemplateStyle = "reference"
    bullet_style: BulletStyle = "triangle"


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


class DuplicateRequest(BaseModel):
    title: Optional[str] = None


class RenameRequest(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    revision: int = Field(ge=0)
