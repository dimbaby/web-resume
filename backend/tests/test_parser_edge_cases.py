from io import BytesIO
from zipfile import ZIP_DEFLATED, ZipFile

from backend.app.parsers import (
    parse_docx,
    parse_inline_markdown,
    parse_markdown,
    plain,
    split_title_date,
)
from backend.app.schemas import RichTextSpan


def _docx_with_tables_and_wrapped_text() -> bytes:
    document_xml = b"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:v="urn:schemas-microsoft-com:vml">
  <w:body>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
      <w:r><w:t>Selected Work</w:t></w:r>
    </w:p>
    <w:tbl>
      <w:tr>
        <w:tc>
          <w:p>
            <w:r><w:rPr><w:b/></w:rPr><w:t>API Platform</w:t></w:r>
            <w:r><w:tab/><w:t>Jan 2024 - Present</w:t></w:r>
          </w:p>
          <w:p>
            <w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr>
            <w:hyperlink>
              <w:r><w:t>Built a searchable service</w:t></w:r>
            </w:hyperlink>
          </w:p>
        </w:tc>
      </w:tr>
    </w:tbl>
    <w:sdt>
      <w:sdtContent>
        <w:p>
          <w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr>
          <w:sdt>
            <w:sdtContent><w:r><w:t>Validated wrapped content</w:t></w:r></w:sdtContent>
          </w:sdt>
        </w:p>
      </w:sdtContent>
    </w:sdt>
    <w:p>
      <w:r>
        <w:pict>
          <v:shape>
            <v:textbox>
              <w:txbxContent>
                <w:p><w:r><w:t>Text box note</w:t></w:r></w:p>
              </w:txbxContent>
            </v:textbox>
          </v:shape>
        </w:pict>
      </w:r>
    </w:p>
    <w:p><w:r><w:t>Technical Skills</w:t></w:r></w:p>
    <w:p>
      <w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr>
      <w:r><w:t>Python</w:t></w:r>
    </w:p>
    <w:sectPr/>
  </w:body>
</w:document>
"""
    buffer = BytesIO()
    with ZipFile(buffer, "w", ZIP_DEFLATED) as archive:
        archive.writestr("word/document.xml", document_xml)
    return buffer.getvalue()


def _docx_with_header_and_footer_content() -> bytes:
    document_xml = b"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Professional Experience</w:t></w:r></w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>Example Labs</w:t></w:r>
      <w:r><w:tab/><w:t>May 2023 - Present</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr>
      <w:r><w:t>Built reliable services</w:t></w:r>
    </w:p>
    <w:sectPr/>
  </w:body>
</w:document>
"""
    header_xml = b"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <w:tbl>
    <w:tr>
      <w:tc><w:p><w:r><w:t>Alice Zhang</w:t></w:r></w:p></w:tc>
      <w:tc>
        <w:p><w:r><w:t>alice@example.com | 13800138000</w:t></w:r></w:p>
      </w:tc>
    </w:tr>
  </w:tbl>
  <w:sdt>
    <w:sdtContent>
      <w:p><w:hyperlink><w:r><w:t>github.com/alice</w:t></w:r></w:hyperlink></w:p>
    </w:sdtContent>
  </w:sdt>
  <w:p><w:r><w:drawing><a:blip r:embed="rIdHeaderImage"/></w:drawing></w:r></w:p>
</w:hdr>
"""
    footer_xml = b"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:v="urn:schemas-microsoft-com:vml">
  <w:tbl>
    <w:tr><w:tc><w:p><w:r><w:t>Portfolio note</w:t></w:r></w:p></w:tc></w:tr>
  </w:tbl>
  <w:p>
    <w:r><w:pict><v:shape><v:textbox><w:txbxContent>
      <w:p><w:r><w:t>Footer box note</w:t></w:r></w:p>
    </w:txbxContent></v:textbox></v:shape></w:pict></w:r>
  </w:p>
</w:ftr>
"""
    buffer = BytesIO()
    with ZipFile(buffer, "w", ZIP_DEFLATED) as archive:
        archive.writestr("word/document.xml", document_xml)
        archive.writestr("word/header1.xml", header_xml)
        archive.writestr("word/footer1.xml", footer_xml)
    return buffer.getvalue()


def test_inline_markdown_preserves_technical_markers_and_real_emphasis() -> None:
    assert plain(parse_inline_markdown("model_v2_test")) == "model_v2_test"
    assert plain(parse_inline_markdown("__init__")) == "__init__"
    assert plain(parse_inline_markdown("a*b*c")) == "a*b*c"
    underscore_bold = parse_inline_markdown("__important__")
    assert plain(underscore_bold) == "important"
    assert underscore_bold[0].bold is True

    spans = parse_inline_markdown("**专业：**统计学与 *analysis* 模块")
    assert plain(spans) == "专业：统计学与 analysis 模块"
    assert spans[0].text == "专业："
    assert spans[0].bold is True
    assert next(span for span in spans if span.text == "analysis").italic is True


def test_markdown_preserves_contact_remainder_and_supports_ordered_lists() -> None:
    parsed = parse_markdown(
        """张三 | zhang@example.com | backup@example.net | 13800138000 | 上海
## Projects
**Parser Toolkit** Jan 2024 - Present
1. 保留 model_v2_test
2) 调用 __init__ 并计算 a*b*c
""".encode("utf-8")
    )

    assert parsed.profile.name == "张三"
    assert parsed.profile.email == "zhang@example.com"
    assert parsed.profile.phone == "13800138000"
    project = next(section for section in parsed.sections if section.kind == "project")
    assert project.items[0].date == "Jan 2024 - Present"
    assert [plain(bullet.content) for bullet in project.items[0].bullets] == [
        "保留 model_v2_test",
        "调用 __init__ 并计算 a*b*c",
    ]
    unresolved = next(
        section for section in parsed.sections if section.kind == "unresolved"
    )
    unresolved_text = plain(unresolved.items[0].bullets[0].content)
    assert "backup@example.net" in unresolved_text
    assert "上海" in unresolved_text


def test_split_title_date_preserves_title_span_formatting() -> None:
    spans = [
        RichTextSpan(text="API", bold=True),
        RichTextSpan(text=" Platform", italic=True),
        RichTextSpan(text="\tMay 2023 - Dec 2024"),
    ]

    title, date = split_title_date(spans)

    assert date == "May 2023 - Dec 2024"
    assert [(span.text, span.bold, span.italic) for span in title] == [
        ("API", True, False),
        (" Platform", False, True),
    ]


def test_docx_reads_tables_wrappers_and_preserves_textbox_content() -> None:
    parsed = parse_docx(_docx_with_tables_and_wrapped_text())

    assert [(section.title, section.kind) for section in parsed.sections] == [
        ("Selected Work", "custom"),
        ("Technical Skills", "skills"),
        ("待确认内容", "unresolved"),
    ]
    selected_work = parsed.sections[0]
    assert plain(selected_work.items[0].title) == "API Platform"
    assert selected_work.items[0].title[0].bold is True
    assert selected_work.items[0].date == "Jan 2024 - Present"
    assert [plain(bullet.content) for bullet in selected_work.items[0].bullets] == [
        "Built a searchable service",
        "Validated wrapped content",
    ]
    unresolved = parsed.sections[-1]
    assert plain(unresolved.items[0].bullets[0].content) == "Text box note"
    assert any("文本框内容" in warning for warning in parsed.warnings)


def test_docx_preserves_visible_header_and_footer_content() -> None:
    parsed = parse_docx(_docx_with_header_and_footer_content())

    assert parsed.profile.name == "Alice Zhang"
    assert parsed.profile.email == "alice@example.com"
    assert parsed.profile.phone == "13800138000"
    experience = next(
        section for section in parsed.sections if section.kind == "experience"
    )
    assert experience.title == "Professional Experience"
    assert plain(experience.items[0].title) == "Example Labs"
    assert experience.items[0].date == "May 2023 - Present"

    unresolved = next(
        section for section in parsed.sections if section.kind == "unresolved"
    )
    unresolved_text = [
        plain(item.bullets[0].content) for item in unresolved.items
    ]
    assert "github.com/alice" in unresolved_text
    assert "Portfolio note" in unresolved_text
    assert "Footer box note" in unresolved_text
    assert any("页眉/页脚中检测到文本框内容" in warning for warning in parsed.warnings)
    assert any("页眉/页脚中检测到图片" in warning for warning in parsed.warnings)
