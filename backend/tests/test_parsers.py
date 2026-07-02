from pathlib import Path

from backend.app.parsers import parse_docx, parse_markdown, plain


SOURCE_ROOT = Path(__file__).resolve().parents[3]


def test_reference_markdown_is_structured_without_losing_core_content() -> None:
    source = SOURCE_ROOT / "简历.md"
    parsed = parse_markdown(source.read_bytes())

    assert [section.title for section in parsed.sections[:2]] == ["教育经历", "项目经历"]
    assert len(parsed.sections) == 5
    project = next(section for section in parsed.sections if section.title == "项目经历")
    assert plain(project.items[0].title) == "车险纯保费建模项目"
    assert project.items[0].date == "2025.12-2026.01"
    assert any("Gamma GLM" in plain(bullet.content) for bullet in project.items[0].bullets)
    education = parsed.sections[0]
    assert plain(education.items[0].bullets[0].content) == "专业：统计学"
    assert education.items[0].bullets[0].content[0].bold is True


def test_reference_docx_survives_corrupt_embedded_photo() -> None:
    source = SOURCE_ROOT / "示例用户简历.docx"
    parsed = parse_docx(source.read_bytes())

    assert parsed.profile.name == "示例用户"
    assert parsed.profile.email == "resume@example.com"
    assert [section.title for section in parsed.sections] == [
        "教育经历",
        "项目经历",
        "其他能力",
        "获奖经历",
        "校园经历",
    ]
    project = next(section for section in parsed.sections if section.title == "项目经历")
    skills = next(section for section in parsed.sections if section.title == "其他能力")
    assert len(project.items) == 5
    assert len(skills.items) == 2
    assert any("照片无法读取" in warning for warning in parsed.warnings)
    assert parsed.photo_bytes is None


def test_unclassified_markdown_is_preserved_for_manual_confirmation() -> None:
    parsed = parse_markdown(
        "# 李四\n这段开场白无法自动归类\n## 自定义模块\n普通说明段落".encode()
    )

    unresolved = next(section for section in parsed.sections if section.kind == "unresolved")
    preserved = [plain(item.bullets[0].content) for item in unresolved.items]
    assert preserved == ["这段开场白无法自动归类", "普通说明段落"]
    assert any("无法可靠归类" in warning for warning in parsed.warnings)
