from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from typing import Any

from .schemas import ResumeDocument, ResumeSummary
from .settings import DB_PATH, ensure_directories


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def connect() -> sqlite3.Connection:
    ensure_directories()
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def init_db() -> None:
    with connect() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS resumes (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                payload TEXT NOT NULL,
                source_filename TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )


def save_resume(document: ResumeDocument) -> ResumeDocument:
    document.updated_at = utcnow()
    payload = document.model_dump(mode="json")
    with connect() as connection:
        connection.execute(
            """
            INSERT INTO resumes (id, title, payload, source_filename, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                title=excluded.title,
                payload=excluded.payload,
                source_filename=excluded.source_filename,
                updated_at=excluded.updated_at
            """,
            (
                document.id,
                document.title,
                json.dumps(payload, ensure_ascii=False),
                document.source.filename,
                document.created_at.isoformat(),
                document.updated_at.isoformat(),
            ),
        )
    return document


def create_resume(payload: dict[str, Any]) -> ResumeDocument:
    now = utcnow()
    payload["created_at"] = now
    payload["updated_at"] = now
    document = ResumeDocument.model_validate(payload)
    return save_resume(document)


def get_resume(resume_id: str) -> ResumeDocument | None:
    with connect() as connection:
        row = connection.execute(
            "SELECT payload FROM resumes WHERE id = ?", (resume_id,)
        ).fetchone()
    if row is None:
        return None
    return ResumeDocument.model_validate(json.loads(row["payload"]))


def list_resumes() -> list[ResumeSummary]:
    with connect() as connection:
        rows = connection.execute(
            "SELECT payload FROM resumes ORDER BY updated_at DESC"
        ).fetchall()
    summaries: list[ResumeSummary] = []
    for row in rows:
        document = ResumeDocument.model_validate(json.loads(row["payload"]))
        summaries.append(
            ResumeSummary(
                id=document.id,
                title=document.title,
                source_filename=document.source.filename,
                section_count=len(document.sections),
                created_at=document.created_at,
                updated_at=document.updated_at,
            )
        )
    return summaries


def delete_resume(resume_id: str) -> bool:
    with connect() as connection:
        cursor = connection.execute("DELETE FROM resumes WHERE id = ?", (resume_id,))
    return cursor.rowcount > 0
