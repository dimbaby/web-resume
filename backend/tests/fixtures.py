from __future__ import annotations

from io import BytesIO
from xml.sax.saxutils import escape
from zipfile import ZIP_DEFLATED, ZipFile


SAMPLE_MARKDOWN = """# 林安
lin.an@example.com | 13800000000

## 教育经历
**示例大学** 2022.09-2026.06
*统计学专业*
- **专业：**统计学

## 项目经历
**车险纯保费建模项目** 2025.12-2026.01
*广义线性模型课程项目*
- 使用 Gamma GLM 完成建模与评估
- 保留 model_v2_test 等技术标识

## 其他能力
**编程语言**
- Python、R、SQL

## 获奖经历
- 全国大学生统计建模竞赛二等奖

## 校园经历
- 学生数据分析社团负责人
""".encode("utf-8")


def _run(text: str, *, bold: bool = False, italic: bool = False) -> str:
    properties = ""
    if bold or italic:
        tags = ("<w:b/>" if bold else "") + ("<w:i/>" if italic else "")
        properties = f"<w:rPr>{tags}</w:rPr>"
    pieces = text.split("\t")
    body: list[str] = []
    for index, piece in enumerate(pieces):
        if index:
            body.append("<w:tab/>")
        if piece:
            body.append(f'<w:t xml:space="preserve">{escape(piece)}</w:t>')
    return f"<w:r>{properties}{''.join(body)}</w:r>"


def _paragraph(
    text: str,
    *,
    bold: bool = False,
    italic: bool = False,
    style: str = "",
    list_item: bool = False,
) -> str:
    properties: list[str] = []
    if style:
        properties.append(f'<w:pStyle w:val="{escape(style)}"/>')
    if list_item:
        properties.append('<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>')
    ppr = f"<w:pPr>{''.join(properties)}</w:pPr>" if properties else ""
    return f"<w:p>{ppr}{_run(text, bold=bold, italic=italic)}</w:p>"


def build_sample_docx(*, corrupt_photo: bool = True) -> bytes:
    paragraphs = [
        _paragraph("林安"),
        _paragraph("lin.an@example.com 13800000000"),
        _paragraph("教育经历", style="Heading1"),
        _paragraph("示例大学\t2022.09-2026.06", bold=True),
        _paragraph("统计学专业", italic=True),
        _paragraph("专业：统计学", list_item=True),
        _paragraph("项目经历", style="Heading1"),
        _paragraph("车险纯保费建模项目\t2025.12-2026.01", bold=True),
        _paragraph("广义线性模型课程项目", italic=True),
        _paragraph("使用 Gamma GLM 完成建模与评估", list_item=True),
        _paragraph("其他能力", style="Heading1"),
        _paragraph("编程语言", bold=True),
        _paragraph("Python、R、SQL", list_item=True),
        _paragraph("获奖经历", style="Heading1"),
        _paragraph("全国大学生统计建模竞赛二等奖", list_item=True),
        _paragraph("校园经历", style="Heading1"),
        _paragraph("学生数据分析社团负责人", list_item=True),
    ]
    if corrupt_photo:
        paragraphs.insert(
            2,
            '<w:p><w:r><w:drawing><a:blip r:embed="rIdPhoto"/></w:drawing></w:r></w:p>',
        )

    document_xml = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <w:body>{''.join(paragraphs)}<w:sectPr/></w:body>
</w:document>
""".encode("utf-8")

    relationships = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdPhoto"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"
    Target="media/missing-photo.jpg"/>
</Relationships>
""".encode("utf-8")

    buffer = BytesIO()
    with ZipFile(buffer, "w", ZIP_DEFLATED) as archive:
        archive.writestr("word/document.xml", document_xml)
        archive.writestr("word/_rels/document.xml.rels", relationships)
    return buffer.getvalue()
