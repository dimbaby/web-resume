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


def test_database_backup_contains_library_entries(tmp_path, monkeypatch) -> None:
    configure_database(tmp_path, monkeypatch)
    create_resume("backed-up")

    backup_path = db.backup_database()
    with sqlite3.connect(backup_path) as connection:
        count = connection.execute(
            "SELECT COUNT(*) FROM library_entries"
        ).fetchone()[0]

    assert count == 1
