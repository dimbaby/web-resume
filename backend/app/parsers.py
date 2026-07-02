from __future__ import annotations

import re
import zipfile
from dataclasses import dataclass, field
from io import BytesIO
from pathlib import Path
from typing import Iterable
from uuid import uuid4

from lxml import etree
from markdown_it import MarkdownIt

from .schemas import (
    ResumeBullet,
    ResumeItem,
    ResumeProfile,
    ResumeSection,
    RichTextSpan,
    SectionKind,
)


DATE_PATTERN = re.compile(
    r"(?P<date>(?:19|20)\d{2}[./-]\d{1,2}(?:\s*[-–—至]\s*(?:(?:19|20)\d{2}[./-]\d{1,2}|现在|至今))?|(?:19|20)\d{2}(?:\s*[-–—至]\s*(?:现在|至今|(?:19|20)\d{2}))?)\s*$"
)
EMAIL_PATTERN = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")
PHONE_PATTERN = re.compile(r"(?<!\d)(?:\+?86[- ]?)?1\d{10}(?!\d)")

SECTION_RULES: list[tuple[re.Pattern[str], SectionKind]] = [
    (re.compile(r"教育|学历"), "education"),
    (re.compile(r"项目|科研"), "project"),
    (re.compile(r"实习|工作|职业"), "experience"),
    (re.compile(r"技能|能力|证书|其他"), "skills"),
    (re.compile(r"获奖|荣誉|奖项"), "awards"),
    (re.compile(r"校园|社团|志愿|学生工作"), "campus"),
]

CANONICAL_SECTION_PATTERN = re.compile(
    r"^(教育经历|学历背景|项目经历|科研经历|实习经历|工作经历|职业经历|其他能力|专业技能|技能证书|获奖经历|荣誉奖项|校园经历|社团经历|志愿经历)$"
)

MD = MarkdownIt("commonmark", {"html": False})


def new_id() -> str:
    return uuid4().hex


def rich(text: str, *, bold: bool = False, italic: bool = False) -> list[RichTextSpan]:
    return [RichTextSpan(text=text, bold=bold, italic=italic)] if text else []


def plain(spans: Iterable[RichTextSpan]) -> str:
    return "".join(span.text for span in spans)


def parse_inline_markdown(value: str) -> list[RichTextSpan]:
    parsed = MD.parseInline(value)
    children = parsed[0].children if parsed and parsed[0].children else []
    spans: list[RichTextSpan] = []
    bold = False
    italic = False
    for token in children:
        if token.type == "strong_open":
            bold = True
        elif token.type == "strong_close":
            bold = False
        elif token.type == "em_open":
            italic = True
        elif token.type == "em_close":
            italic = False
        elif token.type in {"text", "code_inline", "html_inline"} and token.content:
            spans.append(
                RichTextSpan(text=token.content, bold=bold, italic=italic)
            )
        elif token.type == "softbreak":
            spans.append(RichTextSpan(text=" ", bold=bold, italic=italic))
    merged = _merge_spans(spans)
    if any(marker in plain(merged) for marker in ("**", "__", "*", "_")):
        return _parse_resume_emphasis(value)
    return merged or rich(re.sub(r"[*_`]", "", value))


def _parse_resume_emphasis(value: str) -> list[RichTextSpan]:
    """兼容中文紧贴 Markdown 标记，如 `**专业：**统计学`。"""
    spans: list[RichTextSpan] = []
    bold = False
    italic = False
    buffer: list[str] = []

    def flush() -> None:
        if buffer:
            spans.append(
                RichTextSpan(text="".join(buffer), bold=bold, italic=italic)
            )
            buffer.clear()

    index = 0
    while index < len(value):
        if value.startswith(("***", "___"), index):
            flush()
            bold = not bold
            italic = not italic
            index += 3
            continue
        if value.startswith(("**", "__"), index):
            marker = value[index : index + 2]
            if bold or marker in value[index + 2 :]:
                flush()
                bold = not bold
                index += 2
                continue
        if value[index] in {"*", "_"} and (
            italic or value[index] in value[index + 1 :]
        ):
            flush()
            italic = not italic
            index += 1
            continue
        if value[index] == "`" and "`" in value[index + 1 :]:
            index += 1
            continue
        buffer.append(value[index])
        index += 1
    flush()
    return _merge_spans(spans)


def _merge_spans(spans: list[RichTextSpan]) -> list[RichTextSpan]:
    merged: list[RichTextSpan] = []
    for span in spans:
        if not span.text:
            continue
        if merged and merged[-1].bold == span.bold and merged[-1].italic == span.italic:
            merged[-1].text += span.text
        else:
            merged.append(span.model_copy())
    return merged


def section_kind(title: str) -> SectionKind:
    normalized = re.sub(r"\s+", "", title)
    for pattern, kind in SECTION_RULES:
        if pattern.search(normalized):
            return kind
    return "custom"


def split_title_date(spans: list[RichTextSpan]) -> tuple[list[RichTextSpan], str]:
    value = plain(spans).replace("\t", " ").strip()
    match = DATE_PATTERN.search(value)
    if not match:
        return spans, ""
    date = match.group("date").strip()
    title = value[: match.start()].strip()
    return rich(title, bold=True), date


@dataclass
class ParsedResume:
    profile: ResumeProfile = field(default_factory=ResumeProfile)
    sections: list[ResumeSection] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    photo_bytes: bytes | None = None
    photo_extension: str = "jpg"


@dataclass
class ParsedParagraph:
    spans: list[RichTextSpan]
    is_list: bool = False
    style: str = ""
    has_tab: bool = False

    @property
    def text(self) -> str:
        return plain(self.spans).strip()

    @property
    def is_bold(self) -> bool:
        nonempty = [span for span in self.spans if span.text.strip()]
        return bool(nonempty) and all(span.bold for span in nonempty)

    @property
    def is_italic(self) -> bool:
        nonempty = [span for span in self.spans if span.text.strip()]
        return bool(nonempty) and all(span.italic for span in nonempty)


def _contact_from_text(profile: ResumeProfile, text: str) -> bool:
    matched = False
    email = EMAIL_PATTERN.search(text)
    phone = PHONE_PATTERN.search(text)
    if email:
        profile.email = email.group(0)
        matched = True
    if phone:
        profile.phone = phone.group(0).replace(" ", "").replace("-", "")
        matched = True
    return matched


def _add_unresolved(result: ParsedResume, values: list[list[RichTextSpan]]) -> None:
    if not values:
        return
    result.warnings.append(f"有 {len(values)} 段内容无法可靠归类，已放入“待确认内容”。")
    result.sections.append(
        ResumeSection(
            id=new_id(),
            kind="unresolved",
            title="待确认内容",
            items=[
                ResumeItem(
                    id=new_id(),
                    bullets=[ResumeBullet(id=new_id(), content=value)],
                )
                for value in values
            ],
        )
    )


def parse_markdown(data: bytes) -> ParsedResume:
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = data.decode("gb18030")
    result = ParsedResume()
    current_section: ResumeSection | None = None
    current_item: ResumeItem | None = None
    unresolved: list[list[RichTextSpan]] = []

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue

        heading = re.match(r"^(#{1,6})\s+(.+)$", line)
        if heading:
            title = plain(parse_inline_markdown(heading.group(2))).strip()
            if current_section is None and len(heading.group(1)) == 1 and not result.profile.name:
                result.profile.name = title
                continue
            current_section = ResumeSection(
                id=new_id(), kind=section_kind(title), title=title, items=[]
            )
            result.sections.append(current_section)
            current_item = None
            continue

        is_bullet = bool(re.match(r"^[-+*]\s+", line))
        value = re.sub(r"^[-+*]\s+", "", line) if is_bullet else line
        spans = parse_inline_markdown(value)
        text_value = plain(spans).strip()

        if current_section is None:
            if _contact_from_text(result.profile, text_value):
                continue
            if not result.profile.name and len(text_value) <= 20:
                result.profile.name = text_value
            else:
                unresolved.append(spans)
            continue

        if is_bullet:
            if current_item is None:
                current_item = ResumeItem(id=new_id())
                current_section.items.append(current_item)
            current_item.bullets.append(ResumeBullet(id=new_id(), content=spans))
            continue

        title_spans, date = split_title_date(spans)
        is_emphasis_line = line.startswith(("**", "__"))
        is_italic_line = line.startswith(("*", "_")) and not is_emphasis_line

        if date or is_emphasis_line:
            current_item = ResumeItem(
                id=new_id(), title=title_spans, date=date, bullets=[]
            )
            current_section.items.append(current_item)
        elif is_italic_line and current_item is not None:
            current_item.subtitle = spans
        elif current_item is not None and not current_item.subtitle:
            current_item.subtitle = spans
        elif current_item is not None:
            current_item.bullets.append(ResumeBullet(id=new_id(), content=spans))
        else:
            unresolved.append(spans)

    _add_unresolved(result, unresolved)
    if not result.sections:
        result.warnings.append("没有识别到 Markdown 标题，请在待确认区手动整理内容。")
    return result


W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
NS = {"w": W_NS, "r": R_NS}


def _docx_paragraphs(document_xml: bytes) -> list[ParsedParagraph]:
    root = etree.fromstring(document_xml)
    paragraphs: list[ParsedParagraph] = []
    for paragraph in root.xpath(".//w:body/w:p", namespaces=NS):
        ppr = paragraph.find(f"{{{W_NS}}}pPr")
        style = ""
        is_list = False
        if ppr is not None:
            style_node = ppr.find(f"{{{W_NS}}}pStyle")
            if style_node is not None:
                style = style_node.get(f"{{{W_NS}}}val", "")
            is_list = ppr.find(f"{{{W_NS}}}numPr") is not None

        spans: list[RichTextSpan] = []
        has_tab = False
        for run in paragraph.xpath("./w:r | ./w:hyperlink/w:r", namespaces=NS):
            rpr = run.find(f"{{{W_NS}}}rPr")
            bold = rpr is not None and rpr.find(f"{{{W_NS}}}b") is not None
            italic = rpr is not None and rpr.find(f"{{{W_NS}}}i") is not None
            pieces: list[str] = []
            for child in run:
                if child.tag == f"{{{W_NS}}}t":
                    pieces.append(child.text or "")
                elif child.tag == f"{{{W_NS}}}tab":
                    pieces.append("\t")
                    has_tab = True
                elif child.tag == f"{{{W_NS}}}br":
                    pieces.append(" ")
            if pieces:
                spans.append(
                    RichTextSpan(text="".join(pieces), bold=bold, italic=italic)
                )
        spans = _merge_spans(spans)
        if plain(spans).strip():
            paragraphs.append(
                ParsedParagraph(
                    spans=spans, is_list=is_list, style=style, has_tab=has_tab
                )
            )
    return paragraphs


def _extract_docx_photo(
    archive: zipfile.ZipFile, document_xml: bytes
) -> tuple[bytes | None, str, str | None]:
    root = etree.fromstring(document_xml)
    embeds = root.xpath(".//a:blip/@r:embed", namespaces={
        "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
        "r": R_NS,
    })
    if not embeds:
        return None, "jpg", None
    try:
        rels_xml = archive.read("word/_rels/document.xml.rels")
        rels_root = etree.fromstring(rels_xml)
        relation = rels_root.xpath(
            f".//*[local-name()='Relationship' and @Id='{embeds[0]}']"
        )
        if not relation:
            return None, "jpg", "DOCX 中检测到图片，但无法找到对应关系。"
        target = relation[0].get("Target", "")
        media_path = "word/" + target.lstrip("/")
        photo = archive.read(media_path)
        extension = Path(media_path).suffix.lstrip(".").lower() or "jpg"
        return photo, extension, None
    except (KeyError, zipfile.BadZipFile, OSError) as exc:
        return None, "jpg", f"DOCX 中的照片无法读取（{exc}），请在编辑页重新上传。"


def parse_docx(data: bytes) -> ParsedResume:
    result = ParsedResume()
    try:
        with zipfile.ZipFile(BytesIO(data)) as archive:
            document_xml = archive.read("word/document.xml")
            paragraphs = _docx_paragraphs(document_xml)
            photo, extension, warning = _extract_docx_photo(archive, document_xml)
            result.photo_bytes = photo
            result.photo_extension = extension
            if warning:
                result.warnings.append(warning)
    except (zipfile.BadZipFile, KeyError, etree.XMLSyntaxError) as exc:
        raise ValueError(f"无法解析 DOCX：{exc}") from exc

    current_section: ResumeSection | None = None
    current_item: ResumeItem | None = None
    unresolved: list[list[RichTextSpan]] = []

    for paragraph in paragraphs:
        value = paragraph.text
        kind = section_kind(value)
        canonical_value = re.sub(r"\s+", "", value).rstrip("：:")
        _, possible_date = split_title_date(paragraph.spans)
        is_known_section = bool(CANONICAL_SECTION_PATTERN.fullmatch(canonical_value))
        is_heading_style = (
            paragraph.style.lower().startswith("heading")
            and not possible_date
            and len(value) <= 20
        )

        if is_known_section or (is_heading_style and current_section is not None):
            current_section = ResumeSection(
                id=new_id(), kind=kind, title=value, items=[]
            )
            result.sections.append(current_section)
            current_item = None
            continue

        if current_section is None:
            if _contact_from_text(result.profile, value):
                continue
            if not result.profile.name and len(value) <= 20:
                result.profile.name = value
            else:
                unresolved.append(paragraph.spans)
            continue

        if paragraph.is_list:
            if current_item is None or current_section.kind in {"awards", "campus"}:
                current_item = ResumeItem(id=new_id())
                current_section.items.append(current_item)
            current_item.bullets.append(
                ResumeBullet(id=new_id(), content=paragraph.spans)
            )
            continue

        title_spans, date = split_title_date(paragraph.spans)
        if date or paragraph.has_tab:
            current_item = ResumeItem(
                id=new_id(), title=title_spans, date=date, bullets=[]
            )
            current_section.items.append(current_item)
        elif paragraph.is_italic and current_item is not None:
            current_item.subtitle = paragraph.spans
        elif paragraph.is_bold and current_section.kind == "skills":
            current_item = ResumeItem(id=new_id(), title=paragraph.spans)
            current_section.items.append(current_item)
        elif current_item is not None and not current_item.subtitle:
            current_item.subtitle = paragraph.spans
        elif current_item is not None:
            current_item.bullets.append(
                ResumeBullet(id=new_id(), content=paragraph.spans)
            )
        else:
            unresolved.append(paragraph.spans)

    _add_unresolved(result, unresolved)
    if not result.sections:
        result.warnings.append("没有识别到 DOCX 模块标题，请在待确认区手动整理内容。")
    return result


def parse_resume(filename: str, data: bytes) -> ParsedResume:
    suffix = Path(filename).suffix.lower()
    if suffix in {".md", ".markdown"}:
        return parse_markdown(data)
    if suffix == ".docx":
        return parse_docx(data)
    raise ValueError("仅支持 .md、.markdown 和 .docx 文件。")
