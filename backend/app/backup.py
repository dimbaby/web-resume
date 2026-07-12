from __future__ import annotations

import hashlib
import json
import shutil
import stat
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any, BinaryIO
from uuid import uuid4
from zipfile import ZIP_DEFLATED, BadZipFile, ZipFile, ZipInfo

from . import db


ARCHIVE_FORMAT = "web-resume-full-backup"
ARCHIVE_VERSION = 1
MANIFEST_PATH = "manifest.json"
DATABASE_PATH = "database/resumes.sqlite3"
MAX_MEMBER_COUNT = 50_000
MAX_MEMBER_SIZE = 512 * 1024 * 1024
MAX_TOTAL_SIZE = 2 * 1024 * 1024 * 1024
MAX_MANIFEST_SIZE = 1024 * 1024


class BackupArchiveError(ValueError):
    pass


@dataclass(frozen=True)
class ValidatedArchive:
    manifest: dict[str, Any]
    files: tuple[dict[str, Any], ...]


@dataclass(frozen=True)
class RestoreResult:
    safety_backup: Path
    restored_files: int
    quarantined_files: int


@dataclass(frozen=True)
class StagedFile:
    prefix: str
    relative_path: PurePosixPath
    source_path: Path


@dataclass(frozen=True)
class PreparedArchive:
    database_path: Path
    files: tuple[StagedFile, ...]


@dataclass(frozen=True)
class QuarantinedFile:
    original_path: Path
    quarantine_path: Path


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _copy_and_hash(source: BinaryIO, destination: BinaryIO) -> tuple[int, str]:
    digest = hashlib.sha256()
    size = 0
    while chunk := source.read(1024 * 1024):
        size += len(chunk)
        digest.update(chunk)
        destination.write(chunk)
    return size, digest.hexdigest()


def _iter_source_files(root: Path) -> list[Path]:
    root.mkdir(parents=True, exist_ok=True)
    resolved_root = root.resolve()
    files: list[Path] = []
    for candidate in root.rglob("*"):
        if candidate.is_symlink():
            raise BackupArchiveError(f"备份目录中不允许符号链接：{candidate.name}")
        if not candidate.is_file():
            continue
        resolved = candidate.resolve()
        if resolved_root not in resolved.parents:
            raise BackupArchiveError(f"文件超出备份目录：{candidate.name}")
        files.append(candidate)
    return sorted(files, key=lambda value: value.relative_to(root).as_posix())


def _add_file(
    archive: ZipFile,
    source_path: Path,
    archive_path: str,
) -> dict[str, Any]:
    with source_path.open("rb") as source, archive.open(
        archive_path, "w", force_zip64=True
    ) as destination:
        size, digest = _copy_and_hash(source, destination)
    return {"path": archive_path, "size": size, "sha256": digest}


def create_full_backup(
    *,
    backup_dir: Path,
    asset_dir: Path,
    upload_dir: Path,
    destination: Path | None = None,
) -> Path:
    backup_dir.mkdir(parents=True, exist_ok=True)
    timestamp = db.utcnow().strftime("%Y%m%dT%H%M%SZ")
    archive_path = Path(destination) if destination else (
        backup_dir / f"web-resume-{timestamp}-{uuid4().hex[:8]}.zip"
    )
    archive_path.parent.mkdir(parents=True, exist_ok=True)
    if archive_path.exists():
        raise FileExistsError(f"备份文件已存在：{archive_path}")

    # The final archive path first holds the SQLite online snapshot. Once its
    # bytes are in memory, ZipFile replaces that same path with the archive.
    db.backup_database(archive_path)
    database_bytes = archive_path.read_bytes()
    if len(database_bytes) > MAX_MEMBER_SIZE:
        raise BackupArchiveError("数据库快照超过备份大小限制。")

    file_entries: list[dict[str, Any]] = []
    with ZipFile(
        archive_path,
        "w",
        compression=ZIP_DEFLATED,
        compresslevel=6,
        allowZip64=True,
    ) as archive:
        archive.writestr(DATABASE_PATH, database_bytes)
        for prefix, root in (("assets", asset_dir), ("uploads", upload_dir)):
            for source_path in _iter_source_files(root):
                relative = source_path.relative_to(root).as_posix()
                file_entries.append(
                    _add_file(archive, source_path, f"{prefix}/{relative}")
                )

        manifest = {
            "format": ARCHIVE_FORMAT,
            "version": ARCHIVE_VERSION,
            "created_at": db.utcnow().isoformat(),
            "database": {
                "path": DATABASE_PATH,
                "size": len(database_bytes),
                "sha256": _sha256_bytes(database_bytes),
            },
            "files": file_entries,
        }
        archive.writestr(
            MANIFEST_PATH,
            json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8"),
        )
    return archive_path


def _validate_member_name(name: str) -> None:
    if not name or len(name) > 1024 or "\\" in name:
        raise BackupArchiveError("备份中包含非法文件路径。")
    path = PurePosixPath(name)
    if path.is_absolute() or path.as_posix() != name:
        raise BackupArchiveError(f"备份中包含非法文件路径：{name}")
    if any(part in {"", ".", ".."} or ":" in part for part in path.parts):
        raise BackupArchiveError(f"备份中包含不安全文件路径：{name}")


def _is_symlink(info: ZipInfo) -> bool:
    mode = info.external_attr >> 16
    return stat.S_ISLNK(mode)


def _hash_member(archive: ZipFile, info: ZipInfo) -> str:
    digest = hashlib.sha256()
    with archive.open(info, "r") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def _validate_entry(entry: Any, allowed_prefixes: tuple[str, ...]) -> dict[str, Any]:
    if not isinstance(entry, dict):
        raise BackupArchiveError("manifest 文件条目格式错误。")
    path = entry.get("path")
    size = entry.get("size")
    digest = entry.get("sha256")
    if not isinstance(path, str):
        raise BackupArchiveError("manifest 文件路径格式错误。")
    _validate_member_name(path)
    if not path.startswith(allowed_prefixes):
        raise BackupArchiveError(f"manifest 包含不允许的路径：{path}")
    if not isinstance(size, int) or isinstance(size, bool) or size < 0:
        raise BackupArchiveError(f"manifest 文件大小格式错误：{path}")
    if (
        not isinstance(digest, str)
        or len(digest) != 64
        or any(character not in "0123456789abcdef" for character in digest)
    ):
        raise BackupArchiveError(f"manifest 文件哈希格式错误：{path}")
    return {"path": path, "size": size, "sha256": digest}


def validate_full_backup(archive_path: Path) -> ValidatedArchive:
    archive_path = Path(archive_path)
    if not archive_path.is_file():
        raise BackupArchiveError("备份文件不存在。")
    try:
        with ZipFile(archive_path, "r") as archive:
            infos = archive.infolist()
            if len(infos) > MAX_MEMBER_COUNT:
                raise BackupArchiveError("备份中的文件数量过多。")
            names = [info.filename for info in infos if not info.is_dir()]
            if len(names) != len(set(names)):
                raise BackupArchiveError("备份中包含重复文件路径。")
            total_size = 0
            info_by_name: dict[str, ZipInfo] = {}
            for info in infos:
                _validate_member_name(info.filename.rstrip("/"))
                if _is_symlink(info):
                    raise BackupArchiveError("备份中不允许包含符号链接。")
                if info.is_dir():
                    continue
                if info.file_size > MAX_MEMBER_SIZE:
                    raise BackupArchiveError(f"备份成员过大：{info.filename}")
                total_size += info.file_size
                if total_size > MAX_TOTAL_SIZE:
                    raise BackupArchiveError("备份解压后的总体积过大。")
                info_by_name[info.filename] = info

            manifest_info = info_by_name.get(MANIFEST_PATH)
            if manifest_info is None:
                raise BackupArchiveError("备份中缺少 manifest.json。")
            if manifest_info.file_size > MAX_MANIFEST_SIZE:
                raise BackupArchiveError("manifest.json 过大。")
            try:
                manifest = json.loads(archive.read(manifest_info).decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError) as exc:
                raise BackupArchiveError("manifest.json 无法解析。") from exc
            if not isinstance(manifest, dict):
                raise BackupArchiveError("manifest.json 格式错误。")
            if manifest.get("format") != ARCHIVE_FORMAT:
                raise BackupArchiveError("不是 Web Resume 完整备份。")
            if manifest.get("version") != ARCHIVE_VERSION:
                raise BackupArchiveError("备份版本暂不受支持。")

            database = _validate_entry(manifest.get("database"), ("database/",))
            if database["path"] != DATABASE_PATH:
                raise BackupArchiveError("manifest 数据库路径不正确。")
            raw_files = manifest.get("files")
            if not isinstance(raw_files, list):
                raise BackupArchiveError("manifest 文件列表格式错误。")
            files = tuple(
                _validate_entry(entry, ("assets/", "uploads/"))
                for entry in raw_files
            )
            declared_names = [database["path"], *(entry["path"] for entry in files)]
            if len(declared_names) != len(set(declared_names)):
                raise BackupArchiveError("manifest 包含重复文件路径。")
            expected_names = {MANIFEST_PATH, *declared_names}
            if set(info_by_name) != expected_names:
                raise BackupArchiveError("备份成员与 manifest 不一致。")

            for entry in (database, *files):
                info = info_by_name[entry["path"]]
                if info.file_size != entry["size"]:
                    raise BackupArchiveError(f"文件大小校验失败：{entry['path']}")
                if _hash_member(archive, info) != entry["sha256"]:
                    raise BackupArchiveError(f"文件哈希校验失败：{entry['path']}")
    except BadZipFile as exc:
        raise BackupArchiveError("文件不是有效的 ZIP 备份。") from exc
    return ValidatedArchive(manifest=manifest, files=files)


def _safe_target(root: Path, relative: PurePosixPath) -> Path:
    root.mkdir(parents=True, exist_ok=True)
    root_resolved = root.resolve()
    target = root.joinpath(*relative.parts)
    target.parent.mkdir(parents=True, exist_ok=True)
    parent_resolved = target.parent.resolve()
    if parent_resolved != root_resolved and root_resolved not in parent_resolved.parents:
        raise BackupArchiveError(f"恢复路径超出数据目录：{relative.as_posix()}")
    if target.is_symlink() or target.is_dir():
        raise BackupArchiveError(f"恢复目标不是普通文件：{relative.as_posix()}")
    return target


def _restore_member(archive: ZipFile, archive_path: str, target: Path) -> None:
    staged = target.with_name(f".{target.name}.restore-{uuid4().hex}.tmp")
    with archive.open(archive_path, "r") as source, staged.open("xb") as destination:
        shutil.copyfileobj(source, destination, length=1024 * 1024)
    staged.replace(target)


def _stage_archive(
    archive_path: Path,
    validated: ValidatedArchive,
    staging_root: Path,
) -> PreparedArchive:
    database_path = _safe_target(
        staging_root, PurePosixPath(DATABASE_PATH)
    )
    staged_files: list[StagedFile] = []
    with ZipFile(archive_path, "r") as archive:
        _restore_member(archive, DATABASE_PATH, database_path)
        for entry in validated.files:
            archive_name = entry["path"]
            prefix, relative_name = archive_name.split("/", 1)
            relative_path = PurePosixPath(relative_name)
            staged_path = _safe_target(
                staging_root, PurePosixPath(prefix) / relative_path
            )
            _restore_member(archive, archive_name, staged_path)
            staged_files.append(
                StagedFile(
                    prefix=prefix,
                    relative_path=relative_path,
                    source_path=staged_path,
                )
            )
    db.validate_backup(database_path)
    return PreparedArchive(
        database_path=database_path,
        files=tuple(staged_files),
    )


def _commit_staged_file(source_path: Path, target: Path) -> None:
    staged = target.with_name(f".{target.name}.restore-{uuid4().hex}.tmp")
    with source_path.open("rb") as source, staged.open("xb") as destination:
        shutil.copyfileobj(source, destination, length=1024 * 1024)
    staged.replace(target)


def _apply_prepared_archive(
    prepared: PreparedArchive,
    *,
    asset_dir: Path,
    upload_dir: Path,
) -> None:
    db.restore_database(prepared.database_path)
    roots = {"assets": asset_dir, "uploads": upload_dir}
    for staged_file in prepared.files:
        target = _safe_target(
            roots[staged_file.prefix], staged_file.relative_path
        )
        _commit_staged_file(staged_file.source_path, target)


def _quarantine_unlisted_files(
    prepared: PreparedArchive,
    *,
    asset_dir: Path,
    upload_dir: Path,
    quarantine_root: Path,
) -> list[QuarantinedFile]:
    declared = {
        (staged_file.prefix, staged_file.relative_path.as_posix())
        for staged_file in prepared.files
    }
    roots = {"assets": asset_dir, "uploads": upload_dir}
    moved: list[QuarantinedFile] = []
    try:
        for prefix, root in roots.items():
            for source_path in _iter_source_files(root):
                relative = source_path.relative_to(root)
                if (prefix, relative.as_posix()) in declared:
                    continue
                quarantine_path = _safe_target(
                    quarantine_root,
                    PurePosixPath(prefix) / PurePosixPath(relative.as_posix()),
                )
                source_path.replace(quarantine_path)
                moved.append(
                    QuarantinedFile(
                        original_path=source_path,
                        quarantine_path=quarantine_path,
                    )
                )
    except Exception:
        _restore_quarantined_files(moved)
        raise
    return moved


def _restore_quarantined_files(files: list[QuarantinedFile]) -> None:
    first_error: Exception | None = None
    for moved in reversed(files):
        if not moved.quarantine_path.exists():
            continue
        try:
            moved.original_path.parent.mkdir(parents=True, exist_ok=True)
            moved.quarantine_path.replace(moved.original_path)
        except Exception as exc:
            if first_error is None:
                first_error = exc
    if first_error is not None:
        raise first_error


def restore_full_backup(
    archive_path: Path,
    *,
    backup_dir: Path,
    asset_dir: Path,
    upload_dir: Path,
) -> RestoreResult:
    validated = validate_full_backup(archive_path)
    backup_dir.mkdir(parents=True, exist_ok=True)
    prepared = _stage_archive(
        archive_path,
        validated,
        backup_dir / f"restore-stage-{uuid4().hex}",
    )

    safety_backup = create_full_backup(
        backup_dir=backup_dir,
        asset_dir=asset_dir,
        upload_dir=upload_dir,
        destination=backup_dir
        / f"pre-restore-{db.utcnow().strftime('%Y%m%dT%H%M%SZ')}-{uuid4().hex[:8]}.zip",
    )
    safety_validated = validate_full_backup(safety_backup)
    safety_prepared = _stage_archive(
        safety_backup,
        safety_validated,
        backup_dir / f"rollback-stage-{uuid4().hex}",
    )

    quarantined: list[QuarantinedFile] = []
    try:
        quarantined = _quarantine_unlisted_files(
            prepared,
            asset_dir=asset_dir,
            upload_dir=upload_dir,
            quarantine_root=backup_dir / f"restore-quarantine-{uuid4().hex}",
        )
        _apply_prepared_archive(
            prepared,
            asset_dir=asset_dir,
            upload_dir=upload_dir,
        )
    except Exception as restore_error:
        rollback_error: Exception | None = None
        try:
            _apply_prepared_archive(
                safety_prepared,
                asset_dir=asset_dir,
                upload_dir=upload_dir,
            )
        except Exception as exc:
            rollback_error = exc
        try:
            _restore_quarantined_files(quarantined)
        except Exception as exc:
            if rollback_error is None:
                rollback_error = exc
        if rollback_error is not None:
            raise BackupArchiveError(
                "恢复失败，自动回滚也未能完整执行；完整安全备份已保留。"
            ) from rollback_error
        raise BackupArchiveError(
            "恢复过程中发生错误，已自动回滚到恢复前状态。"
        ) from restore_error
    return RestoreResult(
        safety_backup=safety_backup,
        restored_files=len(validated.files),
        quarantined_files=len(quarantined),
    )
