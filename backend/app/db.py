from __future__ import annotations

import hashlib
import json
import sqlite3
import time
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable
from uuid import uuid4

from pydantic import ValidationError

from .content_repair import repair_legacy_split_document
from .schemas import (
    LibraryEntry,
    ResumeDocument,
    ResumeItem,
    ResumeSummary,
    SectionKind,
)
from .settings import DB_PATH, ensure_directories


class ResumeNotFoundError(LookupError):
    pass


class RevisionConflictError(RuntimeError):
    def __init__(self, resume_id: str, expected: int, current: int):
        self.resume_id = resume_id
        self.expected = expected
        self.current = current
        super().__init__(
            f"简历版本冲突：期望版本 {expected}，当前版本 {current}。"
        )


class InvalidBackupError(ValueError):
    pass


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def connect() -> sqlite3.Connection:
    ensure_directories()
    connection = sqlite3.connect(DB_PATH, timeout=30)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA busy_timeout = 30000")
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
                revision INTEGER NOT NULL DEFAULT 0,
                deleted_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        columns = {
            row["name"]
            for row in connection.execute("PRAGMA table_info(resumes)").fetchall()
        }
        if "revision" not in columns:
            connection.execute(
                "ALTER TABLE resumes ADD COLUMN revision INTEGER NOT NULL DEFAULT 0"
            )
        if "deleted_at" not in columns:
            connection.execute("ALTER TABLE resumes ADD COLUMN deleted_at TEXT")
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_resumes_active_updated "
            "ON resumes(deleted_at, updated_at DESC)"
        )
        library_table_exists = (
            connection.execute(
                "SELECT 1 FROM sqlite_master "
                "WHERE type = 'table' AND name = 'library_entries'"
            ).fetchone()
            is not None
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS library_entries (
                id TEXT PRIMARY KEY,
                content_hash TEXT NOT NULL UNIQUE,
                section_kind TEXT NOT NULL,
                section_title TEXT NOT NULL,
                item_payload TEXT NOT NULL,
                search_text TEXT NOT NULL,
                source_resume_id TEXT NOT NULL,
                source_resume_title TEXT NOT NULL,
                source_filename TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        library_columns = {
            row["name"]
            for row in connection.execute(
                "PRAGMA table_info(library_entries)"
            ).fetchall()
        }
        if "updated_at" not in library_columns:
            connection.execute(
                "ALTER TABLE library_entries ADD COLUMN updated_at TEXT"
            )
            connection.execute(
                "UPDATE library_entries SET updated_at = created_at "
                "WHERE updated_at IS NULL"
            )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_library_kind_created "
            "ON library_entries(section_kind, created_at DESC)"
        )
        if not library_table_exists:
            _sync_all_resumes_to_library(connection)


def _serialize(document: ResumeDocument) -> str:
    return json.dumps(document.model_dump(mode="json"), ensure_ascii=False)


def _document_from_row(row: sqlite3.Row) -> ResumeDocument:
    payload = json.loads(row["payload"])
    payload["revision"] = int(row["revision"])
    payload["deleted_at"] = row["deleted_at"]
    document = ResumeDocument.model_validate(payload)
    repaired, _ = repair_legacy_split_document(document)
    return repaired


def _summary(document: ResumeDocument) -> ResumeSummary:
    return ResumeSummary(
        id=document.id,
        title=document.title,
        source_filename=document.source.filename,
        section_count=len(document.sections),
        revision=document.revision,
        deleted_at=document.deleted_at,
        created_at=document.created_at,
        updated_at=document.updated_at,
    )


def _plain_text(spans: list[Any]) -> str:
    return "".join(str(span.text) for span in spans)


def _item_has_content(item: ResumeItem) -> bool:
    if _plain_text(item.title).strip() or _plain_text(item.subtitle).strip():
        return True
    if item.date.strip():
        return True
    return any(_plain_text(bullet.content).strip() for bullet in item.bullets)


def _item_identity_payload(item: ResumeItem) -> dict[str, Any]:
    """Return stable item content without parser/editor generated identifiers."""
    payload = item.model_dump(mode="json")
    payload.pop("id", None)
    for bullet in payload.get("bullets", []):
        bullet.pop("id", None)
    return payload


def _library_content_hash(section_kind: SectionKind, item: ResumeItem) -> str:
    identity = {
        "section_kind": section_kind,
        "item": _item_identity_payload(item),
    }
    canonical = json.dumps(
        identity,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _library_search_text(
    document: ResumeDocument,
    section_title: str,
    item: ResumeItem,
) -> str:
    parts = [
        section_title,
        document.title,
        document.source.filename,
        _plain_text(item.title),
        _plain_text(item.subtitle),
        item.date,
        *(_plain_text(bullet.content) for bullet in item.bullets),
    ]
    return unicodedata.normalize("NFKC", "\n".join(parts)).casefold()


def _sync_document_to_library(
    connection: sqlite3.Connection,
    document: ResumeDocument,
) -> int:
    inserted = 0
    for section in document.sections:
        for item in section.items:
            if not _item_has_content(item):
                continue
            created_at = utcnow().isoformat()
            cursor = connection.execute(
                """
                INSERT OR IGNORE INTO library_entries (
                    id, content_hash, section_kind, section_title, item_payload,
                    search_text, source_resume_id, source_resume_title,
                    source_filename, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    uuid4().hex,
                    _library_content_hash(section.kind, item),
                    section.kind,
                    section.title,
                    json.dumps(item.model_dump(mode="json"), ensure_ascii=False),
                    _library_search_text(document, section.title, item),
                    document.id,
                    document.title,
                    document.source.filename,
                    created_at,
                    created_at,
                ),
            )
            inserted += cursor.rowcount
    return inserted


def _sync_all_resumes_to_library(connection: sqlite3.Connection) -> int:
    inserted = 0
    rows = connection.execute(
        "SELECT payload, revision, deleted_at FROM resumes ORDER BY created_at"
    ).fetchall()
    for row in rows:
        inserted += _sync_document_to_library(
            connection, _document_from_row(row)
        )
    return inserted


def refresh_library_entries(documents: list[ResumeDocument]) -> int:
    """Atomically reconcile library snapshots for saved original imports."""

    inserted = 0
    with connect() as connection:
        connection.execute("BEGIN IMMEDIATE")
        for document in documents:
            expected_hashes = {
                _library_content_hash(section.kind, item)
                for section in document.sections
                for item in section.items
                if _item_has_content(item)
            }
            if expected_hashes:
                placeholders = ", ".join("?" for _ in expected_hashes)
                connection.execute(
                    "DELETE FROM library_entries WHERE source_resume_id = ? "
                    f"AND content_hash NOT IN ({placeholders})",
                    [document.id, *sorted(expected_hashes)],
                )
            else:
                connection.execute(
                    "DELETE FROM library_entries WHERE source_resume_id = ?",
                    (document.id,),
                )
            inserted += _sync_document_to_library(connection, document)
    return inserted


def _library_entry_from_row(row: sqlite3.Row) -> LibraryEntry:
    return LibraryEntry(
        id=row["id"],
        section_kind=row["section_kind"],
        section_title=row["section_title"],
        item=ResumeItem.model_validate(json.loads(row["item_payload"])),
        source_resume_id=row["source_resume_id"],
        source_resume_title=row["source_resume_title"],
        source_filename=row["source_filename"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def list_library_entries(
    *,
    section_kind: SectionKind | None = None,
    query: str = "",
) -> list[LibraryEntry]:
    conditions: list[str] = []
    parameters: list[str] = []
    if section_kind is not None:
        conditions.append("section_kind = ?")
        parameters.append(section_kind)
    normalized_query = unicodedata.normalize("NFKC", query.strip()).casefold()
    if normalized_query:
        conditions.append("search_text LIKE ? ESCAPE '\\'")
        parameters.append(f"%{_escape_like(normalized_query)}%")
    where = f" WHERE {' AND '.join(conditions)}" if conditions else ""
    with connect() as connection:
        rows = connection.execute(
            "SELECT id, section_kind, section_title, item_payload, "
            "source_resume_id, source_resume_title, source_filename, created_at, "
            "updated_at "
            f"FROM library_entries{where} ORDER BY created_at DESC, id DESC",
            parameters,
        ).fetchall()
    return [_library_entry_from_row(row) for row in rows]


def _select_row(
    connection: sqlite3.Connection, resume_id: str
) -> sqlite3.Row | None:
    return connection.execute(
        "SELECT payload, revision, deleted_at FROM resumes WHERE id = ?",
        (resume_id,),
    ).fetchone()


def _check_revision(
    resume_id: str,
    expected_revision: int,
    current_revision: int,
) -> None:
    if expected_revision != current_revision:
        raise RevisionConflictError(
            resume_id, expected_revision, current_revision
        )


def _write_document(
    connection: sqlite3.Connection,
    document: ResumeDocument,
    previous_revision: int,
) -> None:
    cursor = connection.execute(
        """
        UPDATE resumes
        SET title = ?, payload = ?, source_filename = ?, revision = ?,
            deleted_at = ?, updated_at = ?
        WHERE id = ? AND revision = ?
        """,
        (
            document.title,
            _serialize(document),
            document.source.filename,
            document.revision,
            document.deleted_at.isoformat() if document.deleted_at else None,
            document.updated_at.isoformat(),
            document.id,
            previous_revision,
        ),
    )
    if cursor.rowcount != 1:
        row = _select_row(connection, document.id)
        current = int(row["revision"]) if row is not None else previous_revision
        raise RevisionConflictError(document.id, previous_revision, current)


def save_resume(
    document: ResumeDocument, expected_revision: int | None = None
) -> ResumeDocument:
    expected = document.revision if expected_revision is None else expected_revision
    with connect() as connection:
        connection.execute("BEGIN IMMEDIATE")
        row = _select_row(connection, document.id)
        if row is None or row["deleted_at"] is not None:
            raise ResumeNotFoundError(document.id)

        current_revision = int(row["revision"])
        _check_revision(document.id, expected, current_revision)
        current = _document_from_row(row)
        saved = document.model_copy(deep=True)
        saved.created_at = current.created_at
        saved.updated_at = utcnow()
        saved.revision = current_revision + 1
        saved.deleted_at = None
        _write_document(connection, saved, current_revision)
    return saved


def create_resume(
    payload: dict[str, Any], *, capture_library: bool = True
) -> ResumeDocument:
    now = utcnow()
    payload = dict(payload)
    payload["created_at"] = now
    payload["updated_at"] = now
    payload["revision"] = 0
    payload["deleted_at"] = None
    document = ResumeDocument.model_validate(payload)
    with connect() as connection:
        connection.execute(
            """
            INSERT INTO resumes (
                id, title, payload, source_filename, revision, deleted_at,
                created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                document.id,
                document.title,
                _serialize(document),
                document.source.filename,
                document.revision,
                None,
                document.created_at.isoformat(),
                document.updated_at.isoformat(),
            ),
        )
        if capture_library:
            _sync_document_to_library(connection, document)
    return document


def get_resume(
    resume_id: str, *, include_deleted: bool = False
) -> ResumeDocument | None:
    with connect() as connection:
        row = _select_row(connection, resume_id)
    if row is None or (row["deleted_at"] is not None and not include_deleted):
        return None
    return _document_from_row(row)


def list_resumes(*, deleted_only: bool = False) -> list[ResumeSummary]:
    condition = "deleted_at IS NOT NULL" if deleted_only else "deleted_at IS NULL"
    with connect() as connection:
        rows = connection.execute(
            "SELECT payload, revision, deleted_at FROM resumes "
            f"WHERE {condition} ORDER BY updated_at DESC"
        ).fetchall()
    return [_summary(_document_from_row(row)) for row in rows]


def delete_resume(
    resume_id: str, expected_revision: int
) -> bool:
    with connect() as connection:
        connection.execute("BEGIN IMMEDIATE")
        row = _select_row(connection, resume_id)
        if row is None or row["deleted_at"] is not None:
            return False
        current_revision = int(row["revision"])
        _check_revision(resume_id, expected_revision, current_revision)
        document = _document_from_row(row)
        document.deleted_at = utcnow()
        document.updated_at = document.deleted_at
        document.revision = current_revision + 1
        _write_document(connection, document, current_revision)
    return True


def restore_resume(
    resume_id: str, expected_revision: int
) -> ResumeDocument | None:
    with connect() as connection:
        connection.execute("BEGIN IMMEDIATE")
        row = _select_row(connection, resume_id)
        if row is None or row["deleted_at"] is None:
            return None
        current_revision = int(row["revision"])
        _check_revision(resume_id, expected_revision, current_revision)
        document = _document_from_row(row)
        document.deleted_at = None
        document.updated_at = utcnow()
        document.revision = current_revision + 1
        _write_document(connection, document, current_revision)
    return document


def purge_resume(resume_id: str, expected_revision: int) -> bool:
    with connect() as connection:
        connection.execute("BEGIN IMMEDIATE")
        row = _select_row(connection, resume_id)
        if row is None or row["deleted_at"] is None:
            return False
        current_revision = int(row["revision"])
        _check_revision(resume_id, expected_revision, current_revision)
        cursor = connection.execute(
            "DELETE FROM resumes "
            "WHERE id = ? AND revision = ? AND deleted_at IS NOT NULL",
            (resume_id, current_revision),
        )
    return cursor.rowcount > 0


def update_photo(
    resume_id: str,
    photo_url: str,
    expected_revision: int,
    write_asset: Callable[[], None] | None = None,
) -> ResumeDocument:
    with connect() as connection:
        connection.execute("BEGIN IMMEDIATE")
        row = _select_row(connection, resume_id)
        if row is None or row["deleted_at"] is not None:
            raise ResumeNotFoundError(resume_id)
        current_revision = int(row["revision"])
        _check_revision(resume_id, expected_revision, current_revision)
        # BEGIN IMMEDIATE prevents another writer from changing the revision
        # between this check and the document update.
        if write_asset is not None:
            write_asset()
        document = _document_from_row(row)
        document.profile.photo_url = photo_url
        document.updated_at = utcnow()
        document.revision = current_revision + 1
        _write_document(connection, document, current_revision)
    return document


def validate_backup(path: Path) -> None:
    candidate = Path(path)
    if not candidate.is_file():
        raise InvalidBackupError("备份文件不存在。")
    try:
        with sqlite3.connect(candidate) as connection:
            connection.row_factory = sqlite3.Row
            check = connection.execute("PRAGMA quick_check").fetchone()
            if check is None or check[0] != "ok":
                raise InvalidBackupError("SQLite 完整性校验失败。")
            table = connection.execute(
                "SELECT name FROM sqlite_master "
                "WHERE type = 'table' AND name = 'resumes'"
            ).fetchone()
            if table is None:
                raise InvalidBackupError("备份中缺少 resumes 数据表。")
            columns = {
                row[1]
                for row in connection.execute("PRAGMA table_info(resumes)").fetchall()
            }
            required = {
                "id",
                "title",
                "payload",
                "source_filename",
                "created_at",
                "updated_at",
            }
            if not required.issubset(columns):
                raise InvalidBackupError("备份中的 resumes 数据表结构不完整。")
            selected = ["id", "payload"]
            if "revision" in columns:
                selected.append("revision")
            if "deleted_at" in columns:
                selected.append("deleted_at")
            for row in connection.execute(
                f"SELECT {', '.join(selected)} FROM resumes"
            ).fetchall():
                try:
                    payload = json.loads(row["payload"])
                    if not isinstance(payload, dict):
                        raise TypeError("payload 必须是 JSON 对象")
                    if "revision" in columns:
                        payload["revision"] = row["revision"]
                    if "deleted_at" in columns:
                        payload["deleted_at"] = row["deleted_at"]
                    document = ResumeDocument.model_validate(payload)
                    if document.id != row["id"]:
                        raise ValueError("payload ID 与数据表 ID 不一致")
                except (
                    json.JSONDecodeError,
                    TypeError,
                    ValueError,
                    ValidationError,
                ) as exc:
                    raise InvalidBackupError(
                        f"备份中的简历数据无效：{row['id']}"
                    ) from exc
    except sqlite3.DatabaseError as exc:
        raise InvalidBackupError("文件不是有效的 SQLite 简历备份。") from exc


def backup_database(destination: Path | None = None) -> Path:
    init_db()
    timestamp = utcnow().strftime("%Y%m%dT%H%M%SZ")
    backup_dir = DB_PATH.parent / "backups"
    target = Path(destination) if destination else (
        backup_dir / f"web-resume-{timestamp}-{uuid4().hex[:8]}.sqlite3"
    )
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.resolve() == DB_PATH.resolve():
        raise ValueError("备份目标不能是正在使用的数据库。")
    if target.exists():
        raise FileExistsError(f"备份文件已存在：{target}")
    with connect() as source, sqlite3.connect(target) as destination_connection:
        source.backup(destination_connection)
    validate_backup(target)
    return target


def bump_all_revisions(minimum_revision: int = 0) -> int:
    with connect() as connection:
        connection.execute("BEGIN IMMEDIATE")
        rows = connection.execute(
            "SELECT id, payload, revision, deleted_at FROM resumes ORDER BY id"
        ).fetchall()
        current_max = max((int(row["revision"]) for row in rows), default=-1)
        first_revision = max(
            time.time_ns() // 1_000_000,
            current_max + 1,
            minimum_revision,
        )
        for offset, row in enumerate(rows):
            revision = first_revision + offset
            payload = json.loads(row["payload"])
            payload["revision"] = revision
            payload["deleted_at"] = row["deleted_at"]
            connection.execute(
                "UPDATE resumes SET payload = ?, revision = ? WHERE id = ?",
                (json.dumps(payload, ensure_ascii=False), revision, row["id"]),
            )
    return first_revision


def restore_database(source_path: Path) -> Path:
    source_path = Path(source_path)
    validate_backup(source_path)
    if source_path.resolve() == DB_PATH.resolve():
        raise ValueError("不能从正在使用的数据库自身执行恢复。")

    with connect() as connection:
        row = connection.execute("SELECT MAX(revision) FROM resumes").fetchone()
        previous_max_revision = int(row[0]) if row and row[0] is not None else -1

    timestamp = utcnow().strftime("%Y%m%dT%H%M%SZ")
    safety_backup = backup_database(
        DB_PATH.parent
        / "backups"
        / f"pre-restore-{timestamp}-{uuid4().hex[:8]}.sqlite3"
    )
    try:
        with sqlite3.connect(source_path) as source, connect() as destination:
            source.backup(destination)
        init_db()
        validate_backup(DB_PATH)
        bump_all_revisions(previous_max_revision + 1)
    except Exception:
        with sqlite3.connect(safety_backup) as source, connect() as destination:
            source.backup(destination)
        init_db()
        bump_all_revisions(previous_max_revision + 1)
        raise
    return safety_backup
