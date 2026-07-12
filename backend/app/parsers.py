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


ENGLISH_MONTH = (
    r"(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|"
    r"Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|"
    r"Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?"
)
DATE_POINT = (
    rf"(?:(?:19|20)\d{{2}}[./-]\d{{1,2}}|"
    rf"\d{{1,2}}/(?:19|20)\d{{2}}|"
    rf"{ENGLISH_MONTH}\s+(?:19|20)\d{{2}}|"
    rf"(?:Spring|Summer|Fall|Autumn|Winter)\s+(?:19|20)\d{{2}}|"
    rf"(?:19|20)\d{{2}})"
)
DATE_END = rf"(?:{DATE_POINT}|现在|至今|今|Present|Current|Now)"
DATE_PATTERN = re.compile(
    rf"(?P<date>{DATE_POINT}(?:\s*(?:[-–—至]|to)\s*{DATE_END})?)\s*$",
    re.IGNORECASE,
)
EMAIL_PATTERN = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")
PHONE_PATTERN = re.compile(r"(?<!\d)(?:\+?86[- ]?)?1\d{10}(?!\d)")

SECTION_RULES: list[tuple[re.Pattern[str], SectionKind]] = [
    (
        re.compile(
            r"教育|学历|education(?:al)?(?:background)?|academicbackground",
            re.IGNORECASE,
        ),
        "education",
    ),
    (
        re.compile(
            r"项目|科研|projects?|projectexperience|research(?:experience)?",
            re.IGNORECASE,
        ),
        "project",
    ),
    (
        re.compile(
            r"实习|工作|职业|internships?|experience|workexperience|professionalexperience|employment(?:history)?|careerhistory",
            re.IGNORECASE,
        ),
        "experience",
    ),
    (
        re.compile(
            r"技能|能力|证书|其他|skills?|technicalskills?|certifications?|qualifications?",
            re.IGNORECASE,
        ),
        "skills",
    ),
    (
        re.compile(
            r"获奖|荣誉|奖项|awards?|honou?rs?(?:andawards?)?",
            re.IGNORECASE,
        ),
        "awards",
    ),
    (
        re.compile(
            r"校园|社团|志愿|学生工作|campus|leadership(?:andactivities)?|activities|extracurricular|volunteer",
            re.IGNORECASE,
        ),
        "campus",
    ),
]

CANONICAL_SECTION_PATTERN = re.compile(
    r"^(教育经历|学历背景|项目经历|科研经历|实习经历|工作经历|职业经历|其他能力|专业技能|技能证书|"
    r"获奖经历|荣誉奖项|校园经历|社团经历|志愿经历|Education(?:al)?Background|Education|AcademicBackground|"
    r"Projects?|ProjectExperience|Research(?:Experience)?|Internships?|Experience|WorkExperience|"
    r"ProfessionalExperience|Employment(?:History)?|CareerHistory|Skills?|TechnicalSkills?|Certifications?|"
    r"Qualifications?|Awards?|Honou?rs?(?:(?:and)?Awards?)?|CampusActivities|Leadership(?:(?:and)?Activities)?|"
    r"Activities|ExtracurricularActivities|VolunteerExperience)$",
    re.IGNORECASE,
)

MD = MarkdownIt("commonmark", {"html": False})


def new_id() -> str:
    return uuid4().hex


def rich(text: str, *, bold: bool = False, italic: bool = False) -> list[RichTextSpan]:
    return [RichTextSpan(text=text, bold=bold, italic=italic)] if text else []


def plain(spans: Iterable[RichTextSpan]) -> str:
    return "".join(span.text for span in spans)


_PROTECTED_UNDERSCORE = "\ue000"
_PROTECTED_ASTERISK = "\ue001"
PYTHON_DUNDER_NAMES = {
    "all",
    "annotations",
    "call",
    "class",
    "contains",
    "dict",
    "doc",
    "enter",
    "eq",
    "exit",
    "file",
    "getitem",
    "hash",
    "init",
    "iter",
    "len",
    "lt",
    "main",
    "module",
    "name",
    "new",
    "next",
    "repr",
    "setitem",
    "slots",
    "str",
}


def _protect_technical_markers(value: str) -> str:
    """保护技术标识中的 Markdown 字符，避免把标识误当成强调语法。"""
    protected = list(value)

    # Python dunder 名称在 CommonMark 中会被解释为粗体。
    for match in re.finditer(
        r"(?<![A-Za-z0-9_])__(?P<name>[A-Za-z][A-Za-z0-9_]*)__(?![A-Za-z0-9_])",
        value,
    ):
        name = match.group("name")
        if name not in PYTHON_DUNDER_NAMES and "_" not in name:
            continue
        for index in range(match.start(), match.end()):
            if protected[index] == "_":
                protected[index] = _PROTECTED_UNDERSCORE

    # 标识符内部的星号和下划线是内容，例如 model_v2_test、a*b*c。
    for index, character in enumerate(value):
        if character not in {"_", "*"} or protected[index] != character:
            continue
        if index == 0 or index + 1 >= len(value):
            continue
        previous_is_identifier = (
            value[index - 1].isascii() and value[index - 1].isalnum()
        )
        next_is_identifier = (
            value[index + 1].isascii() and value[index + 1].isalnum()
        )
        if previous_is_identifier and next_is_identifier:
            protected[index] = (
                _PROTECTED_UNDERSCORE if character == "_" else _PROTECTED_ASTERISK
            )
    return "".join(protected)


def _restore_technical_markers(value: str) -> str:
    return value.replace(_PROTECTED_UNDERSCORE, "_").replace(
        _PROTECTED_ASTERISK, "*"
    )


def parse_inline_markdown(value: str) -> list[RichTextSpan]:
    protected_value = _protect_technical_markers(value)
    parsed = MD.parseInline(protected_value)
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
                RichTextSpan(
                    text=token.content,
                    bold=bold,
                    italic=italic,
                )
            )
        elif token.type == "softbreak":
            spans.append(RichTextSpan(text=" ", bold=bold, italic=italic))
    merged = _merge_spans(spans)
    if any(marker in plain(merged) for marker in ("**", "__", "*", "_")):
        parsed_fallback = _parse_resume_emphasis(protected_value)
        for span in parsed_fallback:
            span.text = _restore_technical_markers(span.text)
        return parsed_fallback
    for span in merged:
        span.text = _restore_technical_markers(span.text)
    return merged or rich(_restore_technical_markers(protected_value))


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
        if value[index] == "`":
            closing_index = value.find("`", index + 1)
            if closing_index >= 0:
                buffer.extend(value[index + 1 : closing_index])
                index = closing_index + 1
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


def _slice_spans(
    spans: list[RichTextSpan], start: int, end: int
) -> list[RichTextSpan]:
    sliced: list[RichTextSpan] = []
    cursor = 0
    for span in spans:
        span_end = cursor + len(span.text)
        overlap_start = max(start, cursor)
        overlap_end = min(end, span_end)
        if overlap_start < overlap_end:
            sliced.append(
                RichTextSpan(
                    text=span.text[overlap_start - cursor : overlap_end - cursor],
                    bold=span.bold,
                    italic=span.italic,
                )
            )
        cursor = span_end
        if cursor >= end:
            break
    return _merge_spans(sliced)


def _trim_spans(
    spans: list[RichTextSpan], *, extra_characters: str = ""
) -> list[RichTextSpan]:
    value = plain(spans)

    def removable(character: str) -> bool:
        return character.isspace() or character in extra_characters

    start = 0
    while start < len(value) and removable(value[start]):
        start += 1
    end = len(value)
    while end > start and removable(value[end - 1]):
        end -= 1
    return _slice_spans(spans, start, end)


def split_title_date(spans: list[RichTextSpan]) -> tuple[list[RichTextSpan], str]:
    value = plain(spans).replace("\t", " ")
    match = DATE_PATTERN.search(value)
    if not match:
        return spans, ""
    date = match.group("date").strip()
    title = _trim_spans(_slice_spans(spans, 0, match.start()))
    return title, date


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


CONTACT_LABEL_PATTERN = re.compile(
    r"(?:电子邮箱|邮箱|e-?mail|电话|手机|phone|mobile|tel)\s*[:：]?\s*$",
    re.IGNORECASE,
)
CONTACT_SEPARATOR_CHARACTERS = "|｜·•,，;；/、-—–:："


def _remove_span_ranges(
    spans: list[RichTextSpan], ranges: list[tuple[int, int]]
) -> list[RichTextSpan]:
    if not ranges:
        return [span.model_copy() for span in spans]
    value_length = len(plain(spans))
    kept: list[RichTextSpan] = []
    cursor = 0
    for start, end in sorted(ranges):
        if cursor < start:
            kept.extend(_slice_spans(spans, cursor, start))
        cursor = max(cursor, end)
    if cursor < value_length:
        kept.extend(_slice_spans(spans, cursor, value_length))
    return _merge_spans(kept)


def _consume_contacts(
    profile: ResumeProfile, spans: list[RichTextSpan]
) -> tuple[bool, list[RichTextSpan]]:
    text = plain(spans)
    matches: list[re.Match[str]] = []
    for email in EMAIL_PATTERN.finditer(text):
        if not profile.email:
            profile.email = email.group(0)
            matches.append(email)
        elif email.group(0).casefold() == profile.email.casefold():
            matches.append(email)
    for phone in PHONE_PATTERN.finditer(text):
        normalized_phone = phone.group(0).replace(" ", "").replace("-", "")
        if not profile.phone:
            profile.phone = normalized_phone
            matches.append(phone)
        elif normalized_phone == profile.phone:
            matches.append(phone)
    if not matches:
        return False, spans

    ranges: list[tuple[int, int]] = []
    for match in sorted(matches, key=lambda item: item.start()):
        start = match.start()
        label = CONTACT_LABEL_PATTERN.search(text[:start])
        if label:
            start = label.start()
        ranges.append((start, match.end()))

    remainder = _remove_span_ranges(spans, ranges)
    remainder = _trim_spans(
        remainder, extra_characters=CONTACT_SEPARATOR_CHARACTERS
    )
    return True, remainder


def _name_from_remainder(value: str) -> str | None:
    candidate = re.sub(r"^(?:姓名|name)\s*[:：]\s*", "", value.strip(), flags=re.I)
    if re.fullmatch(r"[\u3400-\u9fff·]{2,8}", candidate):
        return candidate
    if re.fullmatch(
        r"[A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*){1,3}",
        candidate,
    ):
        return candidate
    return None


def _preserve_profile_remainder(
    result: ParsedResume,
    remainder: list[RichTextSpan],
    unresolved: list[list[RichTextSpan]],
) -> None:
    if not remainder:
        return
    remaining = remainder
    if not result.profile.name:
        value = plain(remainder)
        for segment in re.finditer(r"[^|｜·•,，;；/、]+", value):
            candidate = _name_from_remainder(segment.group(0))
            if not candidate:
                continue
            result.profile.name = candidate
            remaining = _remove_span_ranges(
                remainder, [(segment.start(), segment.end())]
            )
            remaining = _trim_spans(
                remaining, extra_characters=CONTACT_SEPARATOR_CHARACTERS
            )
            break
    if remaining:
        unresolved.append(remaining)


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
            heading_spans = parse_inline_markdown(heading.group(2))
            title = plain(heading_spans).strip()
            if current_section is None and len(heading.group(1)) == 1 and not result.profile.name:
                matched_contact, remainder = _consume_contacts(
                    result.profile, heading_spans
                )
                if matched_contact:
                    _preserve_profile_remainder(result, remainder, unresolved)
                else:
                    result.profile.name = title
                continue
            current_section = ResumeSection(
                id=new_id(), kind=section_kind(title), title=title, items=[]
            )
            result.sections.append(current_section)
            current_item = None
            continue

        list_prefix = re.match(r"^(?:[-+*]|\d+[.)])\s+", line)
        is_bullet = bool(list_prefix)
        value = line[list_prefix.end() :] if list_prefix else line
        spans = parse_inline_markdown(value)
        text_value = plain(spans).strip()

        if current_section is None:
            matched_contact, remainder = _consume_contacts(result.profile, spans)
            if matched_contact:
                _preserve_profile_remainder(result, remainder, unresolved)
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


def _word_property_enabled(properties: etree._Element | None, name: str) -> bool:
    if properties is None:
        return False
    node = properties.find(f"{{{W_NS}}}{name}")
    if node is None:
        return False
    value = node.get(f"{{{W_NS}}}val", "1").lower()
    return value not in {"0", "false", "off", "none"}


def _parse_docx_paragraph_node(
    paragraph: etree._Element, *, include_textbox_runs: bool = False
) -> ParsedParagraph | None:
    ppr = paragraph.find(f"{{{W_NS}}}pPr")
    style = ""
    is_list = False
    if ppr is not None:
        style_node = ppr.find(f"{{{W_NS}}}pStyle")
        if style_node is not None:
            style = style_node.get(f"{{{W_NS}}}val", "")
        is_list = ppr.find(f"{{{W_NS}}}numPr") is not None

    run_xpath = ".//w:r[not(ancestor::w:del)]"
    if not include_textbox_runs:
        run_xpath = ".//w:r[not(ancestor::w:del) and not(ancestor::w:txbxContent)]"

    spans: list[RichTextSpan] = []
    has_tab = False
    for run in paragraph.xpath(run_xpath, namespaces=NS):
        rpr = run.find(f"{{{W_NS}}}rPr")
        bold = _word_property_enabled(rpr, "b")
        italic = _word_property_enabled(rpr, "i")
        pieces: list[str] = []
        for child in run:
            if child.tag == f"{{{W_NS}}}t":
                pieces.append(child.text or "")
            elif child.tag == f"{{{W_NS}}}tab":
                pieces.append("\t")
                has_tab = True
            elif child.tag in {f"{{{W_NS}}}br", f"{{{W_NS}}}cr"}:
                pieces.append(" ")
            elif child.tag == f"{{{W_NS}}}noBreakHyphen":
                pieces.append("-")
        if pieces:
            spans.append(
                RichTextSpan(text="".join(pieces), bold=bold, italic=italic)
            )

    spans = _merge_spans(spans)
    if not plain(spans).strip():
        return None
    return ParsedParagraph(
        spans=spans, is_list=is_list, style=style, has_tab=has_tab
    )


def _iter_docx_body_paragraphs(container: etree._Element) -> Iterable[etree._Element]:
    """按 Word 正文块顺序遍历段落，包括表格和块级内容控件。"""
    recursive_containers = {
        "body",
        "tbl",
        "tr",
        "tc",
        "sdt",
        "sdtContent",
        "customXml",
        "ins",
        "moveTo",
    }
    for child in container:
        local_name = etree.QName(child).localname
        if local_name == "p":
            yield child
        elif local_name in recursive_containers:
            yield from _iter_docx_body_paragraphs(child)


def _docx_paragraphs(
    document_xml: bytes,
) -> tuple[list[ParsedParagraph], list[list[RichTextSpan]], bool]:
    root = etree.fromstring(document_xml)
    body = root.find(f"{{{W_NS}}}body")
    content_root = body if body is not None else root
    paragraphs: list[ParsedParagraph] = []
    for paragraph_node in _iter_docx_body_paragraphs(content_root):
        paragraph = _parse_docx_paragraph_node(paragraph_node)
        if paragraph is not None:
            paragraphs.append(paragraph)

    textbox_values: list[list[RichTextSpan]] = []
    textbox_contents = root.xpath(".//w:txbxContent", namespaces=NS)
    for textbox_content in textbox_contents:
        for paragraph_node in textbox_content.xpath(".//w:p", namespaces=NS):
            paragraph = _parse_docx_paragraph_node(
                paragraph_node, include_textbox_runs=True
            )
            if paragraph is not None:
                textbox_values.append(paragraph.spans)

    has_textbox = bool(
        textbox_contents
        or root.xpath(
            ".//*[local-name()='textbox' or local-name()='txbx']"
        )
    )
    return paragraphs, textbox_values, has_textbox


DOCX_HEADER_FOOTER_PATTERN = re.compile(
    r"^word/(?P<kind>header|footer)\d*\.xml$", re.IGNORECASE
)


def _docx_has_image_reference(part_xml: bytes) -> bool:
    root = etree.fromstring(part_xml)
    drawing_images = root.xpath(
        ".//a:blip[@r:embed or @r:link]",
        namespaces={
            "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
            "r": R_NS,
        },
    )
    legacy_images = root.xpath(".//*[local-name()='imagedata']")
    return bool(drawing_images or legacy_images)


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
    textbox_values: list[list[RichTextSpan]] = []
    has_textbox = False
    peripheral_paragraphs: list[ParsedParagraph] = []
    peripheral_textbox_values: list[list[RichTextSpan]] = []
    peripheral_textbox_parts: list[str] = []
    unreadable_textbox_parts: list[str] = []
    peripheral_image_parts: list[str] = []
    try:
        with zipfile.ZipFile(BytesIO(data)) as archive:
            document_xml = archive.read("word/document.xml")
            paragraphs, textbox_values, has_textbox = _docx_paragraphs(document_xml)
            photo, extension, warning = _extract_docx_photo(archive, document_xml)
            result.photo_bytes = photo
            result.photo_extension = extension
            if warning:
                result.warnings.append(warning)

            supplemental_parts = [
                name
                for name in archive.namelist()
                if DOCX_HEADER_FOOTER_PATTERN.fullmatch(name)
            ]
            supplemental_parts.sort(
                key=lambda name: (
                    0 if Path(name).name.lower().startswith("header") else 1,
                    name,
                )
            )
            for part_name in supplemental_parts:
                match = DOCX_HEADER_FOOTER_PATTERN.fullmatch(part_name)
                if match is None:
                    continue
                kind_label = "页眉" if match.group("kind").lower() == "header" else "页脚"
                part_label = f"{kind_label} {Path(part_name).name}"
                part_xml = archive.read(part_name)
                try:
                    part_paragraphs, part_textboxes, part_has_textbox = (
                        _docx_paragraphs(part_xml)
                    )
                    part_has_image = _docx_has_image_reference(part_xml)
                except etree.XMLSyntaxError:
                    result.warnings.append(
                        f"DOCX 的{part_label}无法解析，请在导入后核对原文。"
                    )
                    continue
                peripheral_paragraphs.extend(part_paragraphs)
                peripheral_textbox_values.extend(part_textboxes)
                if part_textboxes:
                    peripheral_textbox_parts.append(part_label)
                elif part_has_textbox:
                    unreadable_textbox_parts.append(part_label)
                if part_has_image:
                    peripheral_image_parts.append(part_label)
    except (zipfile.BadZipFile, KeyError, etree.XMLSyntaxError) as exc:
        raise ValueError(f"无法解析 DOCX：{exc}") from exc

    current_section: ResumeSection | None = None
    current_item: ResumeItem | None = None
    unresolved: list[list[RichTextSpan]] = list(textbox_values)

    for paragraph in peripheral_paragraphs:
        matched_contact, remainder = _consume_contacts(
            result.profile, paragraph.spans
        )
        if matched_contact:
            _preserve_profile_remainder(result, remainder, unresolved)
            continue
        candidate = _name_from_remainder(paragraph.text)
        if candidate and not result.profile.name:
            result.profile.name = candidate
        elif paragraph.text != result.profile.name:
            unresolved.append(paragraph.spans)
    unresolved.extend(peripheral_textbox_values)

    if textbox_values:
        result.warnings.append(
            "DOCX 中检测到文本框内容，已放入“待确认内容”以避免遗漏。"
        )
    elif has_textbox:
        result.warnings.append(
            "DOCX 中检测到无法可靠读取的文本框，请在导入后核对原文。"
        )
    if peripheral_textbox_parts:
        part_names = "、".join(peripheral_textbox_parts)
        result.warnings.append(
            f"DOCX 页眉/页脚中检测到文本框内容（{part_names}），"
            "已放入“待确认内容”以避免遗漏。"
        )
    if unreadable_textbox_parts:
        part_names = "、".join(unreadable_textbox_parts)
        result.warnings.append(
            f"DOCX 页眉/页脚中检测到无法可靠读取的文本框（{part_names}），"
            "请在导入后核对原文。"
        )
    if peripheral_image_parts:
        part_names = "、".join(peripheral_image_parts)
        result.warnings.append(
            f"DOCX 页眉/页脚中检测到图片（{part_names}）；"
            "当前不会将其作为简历照片自动导入，"
            "请在导入后核对或重新上传照片。"
        )

    for paragraph in paragraphs:
        value = paragraph.text
        kind = section_kind(value)
        canonical_value = re.sub(r"[\s&/]+", "", value).rstrip("：:")
        _, possible_date = split_title_date(paragraph.spans)
        is_known_section = bool(CANONICAL_SECTION_PATTERN.fullmatch(canonical_value))
        is_heading_style = (
            (
                paragraph.style.lower().startswith("heading")
                or paragraph.style.startswith("标题")
            )
            and not possible_date
            and len(value) <= 60
        )

        if is_known_section or is_heading_style:
            current_section = ResumeSection(
                id=new_id(), kind=kind, title=value, items=[]
            )
            result.sections.append(current_section)
            current_item = None
            continue

        if current_section is None:
            matched_contact, remainder = _consume_contacts(
                result.profile, paragraph.spans
            )
            if matched_contact:
                _preserve_profile_remainder(result, remainder, unresolved)
                continue
            if result.profile.name and value == result.profile.name:
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
