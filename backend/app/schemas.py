from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


class RichTextSpan(BaseModel):
    text: str
    bold: bool = False
    italic: bool = False


RichText = list[RichTextSpan]


class ResumeBullet(BaseModel):
    id: str
    content: RichText = Field(default_factory=list)


class ResumeItem(BaseModel):
    id: str
    title: RichText = Field(default_factory=list)
    subtitle: RichText = Field(default_factory=list)
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


class ResumeDocument(BaseModel):
    id: str
    title: str
    profile: ResumeProfile = Field(default_factory=ResumeProfile)
    sections: list[ResumeSection] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    source: SourceInfo = Field(default_factory=SourceInfo)
    created_at: datetime
    updated_at: datetime


class ResumeSummary(BaseModel):
    id: str
    title: str
    source_filename: str = ""
    section_count: int = 0
    created_at: datetime
    updated_at: datetime


class DuplicateRequest(BaseModel):
    title: Optional[str] = None


class RenameRequest(BaseModel):
    title: str = Field(min_length=1, max_length=120)
