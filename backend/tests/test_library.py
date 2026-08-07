from __future__ import annotations

import json
import sqlite3

from fastapi.testclient import TestClient

from backend.app import db, main
from backend.app.schemas import ResumeDocument, RichTextSpan


def configure_database(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "test.sqlite3")
    db.init_db()


def rich(text: str, *, bold: bool = False) -> list[dict[str, object]]:
    return [{"text": text, "bold": bold, "italic": False}]


def item(
    item_id: str,
    title: str,
    bullet: str,
    *,
    bullet_id: str | None = None,
    title_bold: bool = False,
) -> dict[str, object]:
    return {
        "id": item_id,
        "title": rich(title, bold=title_bold),
        "subtitle": [],
        "date": "2026.01-2026.06",
        "bullets": [
            {
                "id": bullet_id or f"{item_id}-bullet",
                "content": rich(bullet),
            }
        ],
    }


def create_resume(
    resume_id: str,
    *,
    section_kind: str = "project",
    section_title: str = "项目经历",
    resume_item: dict[str, object] | None = None,
) -> ResumeDocument:
    return db.create_resume(
        {
            "id": resume_id,
            "title": f"{resume_id} 简历",
            "sections": [
                {
                    "id": f"{resume_id}-section",
                    "kind": section_kind,
                    "title": section_title,
                    "items": [
                        resume_item
                        or item(
                            f"{resume_id}-item",
                            "风控建模项目",
                            "使用 Gamma GLM 完成损失率建模",
                        )
                    ],
                }
            ],
            "source": {"filename": f"{resume_id}.md", "format": "md"},
        }
    )


def test_init_db_backfills_library_from_legacy_resume_data(
    tmp_path, monkeypatch
) -> None:
    database_path = tmp_path / "legacy.sqlite3"
    monkeypatch.setattr(db, "DB_PATH", database_path)
    now = db.utcnow()
    document = ResumeDocument.model_validate(
        {
            "id": "legacy-resume",
            "title": "旧版基础简历",
            "sections": [
                {
                    "id": "legacy-section",
                    "kind": "education",
                    "title": "教育经历",
                    "items": [item("legacy-item", "示例大学", "核心课程：统计学")],
                }
            ],
            "source": {"filename": "legacy.md", "format": "md"},
            "created_at": now,
            "updated_at": now,
        }
    )
    with sqlite3.connect(database_path) as connection:
        connection.execute(
            """
            CREATE TABLE resumes (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                payload TEXT NOT NULL,
                source_filename TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            INSERT INTO resumes (
                id, title, payload, source_filename, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                document.id,
                document.title,
                json.dumps(document.model_dump(mode="json"), ensure_ascii=False),
                document.source.filename,
                now.isoformat(),
                now.isoformat(),
            ),
        )

    db.init_db()
    entries = db.list_library_entries()

    assert len(entries) == 1
    assert entries[0].section_kind == "education"
    assert entries[0].section_title == "教育经历"
    assert entries[0].source_resume_id == document.id
    assert entries[0].item.title[0].text == "示例大学"


def test_library_deduplicates_exact_content_without_generated_ids(
    tmp_path, monkeypatch
) -> None:
    configure_database(tmp_path, monkeypatch)
    create_resume(
        "first",
        resume_item=item(
            "item-first",
            "风控建模项目",
            "使用 Gamma GLM 完成损失率建模",
            bullet_id="bullet-first",
        ),
    )
    create_resume(
        "second",
        resume_item=item(
            "item-second",
            "风控建模项目",
            "使用 Gamma GLM 完成损失率建模",
            bullet_id="bullet-second",
        ),
    )

    assert len(db.list_library_entries()) == 1

    create_resume(
        "styled",
        resume_item=item(
            "item-styled",
            "风控建模项目",
            "使用 Gamma GLM 完成损失率建模",
            title_bold=True,
        ),
    )

    assert len(db.list_library_entries()) == 2


def test_library_api_searches_and_filters_snapshots(tmp_path, monkeypatch) -> None:
    configure_database(tmp_path, monkeypatch)
    create_resume("project")
    create_resume(
        "education",
        section_kind="education",
        section_title="教育经历",
        resume_item=item("education-item", "示例大学", "核心课程：机器学习"),
    )

    with TestClient(main.app) as client:
        all_entries = client.get("/api/library")
        project_entries = client.get(
            "/api/library", params={"kind": "project", "query": "gamma glm"}
        )
        education_entries = client.get(
            "/api/library", params={"query": "机器学习"}
        )
        invalid_kind = client.get("/api/library", params={"kind": "unknown"})

    assert all_entries.status_code == 200
    assert len(all_entries.json()) == 2
    assert project_entries.status_code == 200
    assert len(project_entries.json()) == 1
    assert project_entries.json()[0]["section_kind"] == "project"
    assert education_entries.status_code == 200
    assert education_entries.json()[0]["item"]["title"][0]["text"] == "示例大学"
    assert invalid_kind.status_code == 422


def test_library_snapshot_survives_source_resume_purge(tmp_path, monkeypatch) -> None:
    configure_database(tmp_path, monkeypatch)
    document = create_resume("disposable")
    entry_id = db.list_library_entries()[0].id

    assert db.delete_resume(document.id, expected_revision=0)
    assert db.purge_resume(document.id, expected_revision=1)
    assert db.get_resume(document.id, include_deleted=True) is None

    with TestClient(main.app) as client:
        response = client.get("/api/library")

    assert response.status_code == 200
    assert [entry["id"] for entry in response.json()] == [entry_id]


def test_library_does_not_capture_partial_editor_versions_when_opened(
    tmp_path, monkeypatch
) -> None:
    configure_database(tmp_path, monkeypatch)
    document = create_resume("editing")
    changed = document.model_copy(deep=True)
    changed.sections[0].items[0].bullets[0].content = [
        RichTextSpan(text="编辑完成的最终描述")
    ]
    db.save_resume(changed)

    assert len(db.list_library_entries()) == 1

    with TestClient(main.app) as client:
        response = client.get("/api/library", params={"query": "最终描述"})

    assert response.status_code == 200
    assert response.json() == []
    assert len(db.list_library_entries()) == 1


def test_duplicate_does_not_add_edited_version_snapshot_to_library(
    tmp_path, monkeypatch
) -> None:
    configure_database(tmp_path, monkeypatch)
    document = create_resume("source")
    changed = document.model_copy(deep=True)
    changed.sections[0].items[0].bullets[0].content = [
        RichTextSpan(text="只存在于岗位版本的修改")
    ]
    saved = db.save_resume(changed)

    with TestClient(main.app) as client:
        response = client.post(
            f"/api/resumes/{saved.id}/duplicate",
            json={"title": "岗位定制版"},
        )

    assert response.status_code == 200
    assert len(db.list_library_entries()) == 1
    assert db.list_library_entries(query="只存在于岗位版本的修改") == []


def test_loading_resume_repairs_legacy_year_ending_italic_subtitle(
    tmp_path, monkeypatch
) -> None:
    configure_database(tmp_path, monkeypatch)
    document = db.create_resume(
        {
            "id": "legacy-split",
            "title": "旧解析结果",
            "sections": [
                {
                    "id": "projects",
                    "kind": "project",
                    "title": "项目经历",
                    "items": [
                        {
                            "id": "heading",
                            "title": rich("DEC-Graph RAG", bold=True),
                            "subtitle": [],
                            "date": "2026.04-2026.08",
                            "bullets": [],
                        },
                        {
                            "id": "false-item",
                            "title": [
                                {
                                    "text": "京东物流 ｜ Submitted to AAAI",
                                    "bold": False,
                                    "italic": True,
                                }
                            ],
                            "subtitle": [],
                            "date": "2027",
                            "bullets": [
                                {
                                    "id": "result",
                                    "content": rich("完整项目要点"),
                                }
                            ],
                        },
                    ],
                }
            ],
            "source": {"filename": "resume.md", "format": "md"},
        }
    )

    loaded = db.get_resume(document.id)

    assert loaded is not None
    assert len(loaded.sections[0].items) == 1
    repaired = loaded.sections[0].items[0]
    assert "".join(span.text for span in repaired.subtitle) == (
        "京东物流 ｜ Submitted to AAAI 2027"
    )
    assert repaired.date == "2026.04-2026.08"
    assert repaired.bullets[0].content[0].text == "完整项目要点"


def test_startup_reparses_saved_upload_for_library_without_overwriting_editor(
    tmp_path, monkeypatch
) -> None:
    configure_database(tmp_path, monkeypatch)
    upload_dir = tmp_path / "uploads"
    upload_dir.mkdir()
    monkeypatch.setattr(main, "UPLOAD_DIR", upload_dir)
    document = create_resume(
        "saved-source",
        resume_item=item(
            "edited-item",
            "网页中编辑后的项目",
            "网页中编辑后的要点",
        ),
    )
    (upload_dir / f"{document.id}.md").write_text(
        "\n".join(
            [
                "# 测试用户",
                "## 项目经历",
                "**重新识别项目** 2026.04-2026.08",
                "*京东物流 ｜ Submitted to AAAI 2027*",
                "- 重新识别的完整要点",
            ]
        ),
        encoding="utf-8",
    )

    with TestClient(main.app) as client:
        library = client.get("/api/library").json()
        stored = client.get(f"/api/resumes/{document.id}").json()

    assert len(library) == 1
    assert library[0]["item"]["title"][0]["text"] == "重新识别项目"
    assert library[0]["item"]["subtitle"][0]["text"] == (
        "京东物流 ｜ Submitted to AAAI 2027"
    )
    assert len(library[0]["item"]["bullets"]) == 1
    assert stored["sections"][0]["items"][0]["title"][0]["text"] == (
        "网页中编辑后的项目"
    )

    source_path = upload_dir / f"{document.id}.md"
    source_path.write_text(
        source_path.read_text(encoding="utf-8").replace(
            "重新识别项目", "第二次启动重新识别项目"
        ),
        encoding="utf-8",
    )
    with TestClient(main.app) as client:
        refreshed = client.get("/api/library").json()
        stored_again = client.get(f"/api/resumes/{document.id}").json()

    assert refreshed[0]["item"]["title"][0]["text"] == (
        "第二次启动重新识别项目"
    )
    assert stored_again["sections"][0]["items"][0]["title"][0]["text"] == (
        "网页中编辑后的项目"
    )


def test_refreshing_import_library_preserves_unrelated_history(
    tmp_path, monkeypatch
) -> None:
    configure_database(tmp_path, monkeypatch)
    source = create_resume(
        "refresh-source",
        resume_item=item("old", "旧识别项目", "旧识别要点"),
    )
    create_resume(
        "unrelated-history",
        resume_item=item("unrelated", "保留的历史项目", "保留的历史要点"),
    )
    refreshed = source.model_copy(deep=True)
    refreshed_item = refreshed.sections[0].items[0]
    refreshed_item.id = "new"
    refreshed_item.title = [RichTextSpan(text="重新识别项目")]
    refreshed_item.bullets[0].content = [RichTextSpan(text="重新识别要点")]
    refreshed.sections[0].items = [refreshed_item]

    db.refresh_library_entries([refreshed])

    assert db.list_library_entries(query="旧识别项目") == []
    assert len(db.list_library_entries(query="重新识别项目")) == 1
    assert len(db.list_library_entries(query="保留的历史项目")) == 1


def test_database_backup_contains_library_entries(tmp_path, monkeypatch) -> None:
    configure_database(tmp_path, monkeypatch)
    create_resume("backed-up")

    backup_path = db.backup_database()
    with sqlite3.connect(backup_path) as connection:
        count = connection.execute(
            "SELECT COUNT(*) FROM library_entries"
        ).fetchone()[0]

    assert count == 1
