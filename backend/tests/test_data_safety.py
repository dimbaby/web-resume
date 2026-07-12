from __future__ import annotations

import base64
import json
import sqlite3
import time
from copy import deepcopy
from io import BytesIO
from zipfile import ZIP_DEFLATED, ZipFile

import pytest
from fastapi.testclient import TestClient

from backend.app import backup, db, main
from backend.tests.fixtures import build_sample_docx


VALID_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
)


def configure_storage(tmp_path, monkeypatch) -> None:
    uploads = tmp_path / "uploads"
    assets = tmp_path / "assets"
    backups = tmp_path / "backups"
    uploads.mkdir()
    assets.mkdir()
    backups.mkdir()
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "test.sqlite3")
    monkeypatch.setattr(main, "UPLOAD_DIR", uploads)
    monkeypatch.setattr(main, "ASSET_DIR", assets)
    monkeypatch.setattr(main, "BACKUP_DIR", backups)
    db.init_db()


def create_document(resume_id: str = "resume-1"):
    return db.create_resume(
        {
            "id": resume_id,
            "title": "基础简历",
            "profile": {
                "name": "林安",
                "email": "lin.an@example.com",
                "phone": "13800000000",
            },
            "sections": [],
            "source": {"filename": "sample.md", "format": "md"},
        }
    )


def test_stale_full_save_returns_revision_conflict(tmp_path, monkeypatch) -> None:
    configure_storage(tmp_path, monkeypatch)
    original = create_document()
    first_update = original.model_dump(mode="json")
    stale_update = deepcopy(first_update)
    first_update["title"] = "先保存的版本"
    stale_update["title"] = "过期副本"

    with TestClient(main.app) as client:
        saved = client.put(f"/api/resumes/{original.id}", json=first_update)
        conflict = client.put(f"/api/resumes/{original.id}", json=stale_update)

    assert saved.status_code == 200
    assert saved.json()["revision"] == 1
    assert conflict.status_code == 409
    assert conflict.json()["current_revision"] == 1
    assert db.get_resume(original.id).title == "先保存的版本"


def test_soft_delete_restore_and_purge(tmp_path, monkeypatch) -> None:
    configure_storage(tmp_path, monkeypatch)
    document = create_document()

    with TestClient(main.app) as client:
        deleted = client.delete(
            f"/api/resumes/{document.id}", params={"revision": document.revision}
        )
        active = client.get("/api/resumes")
        missing = client.get(f"/api/resumes/{document.id}")
        trash = client.get("/api/trash")
        restored = client.post(
            f"/api/resumes/{document.id}/restore", params={"revision": 1}
        )

        assert deleted.status_code == 204
        assert active.json() == []
        assert missing.status_code == 404
        assert trash.json()[0]["revision"] == 1
        assert trash.json()[0]["deleted_at"] is not None
        assert restored.status_code == 200
        assert restored.json()["revision"] == 2
        assert restored.json()["deleted_at"] is None

        assert client.delete(
            f"/api/resumes/{document.id}", params={"revision": 2}
        ).status_code == 204
        assert client.delete(
            f"/api/resumes/{document.id}/purge", params={"revision": 2}
        ).status_code == 409
        assert client.delete(
            f"/api/resumes/{document.id}/purge", params={"revision": 3}
        ).status_code == 204
        assert client.get("/api/trash").json() == []


def test_photo_is_decoded_and_revision_checked(tmp_path, monkeypatch) -> None:
    configure_storage(tmp_path, monkeypatch)
    document = create_document()

    with TestClient(main.app) as client:
        invalid = client.post(
            f"/api/resumes/{document.id}/photo",
            data={"revision": "0"},
            files={"file": ("photo.png", b"not-an-image", "image/png")},
        )
        assert invalid.status_code == 422
        assert client.get(f"/api/resumes/{document.id}").json()["revision"] == 0

        uploaded = client.post(
            f"/api/resumes/{document.id}/photo",
            data={"revision": "0"},
            files={"file": ("photo.png", VALID_PNG, "image/png")},
        )
        assert uploaded.status_code == 200
        assert uploaded.json()["revision"] == 1
        first_photo_url = uploaded.json()["profile"]["photo_url"]
        assets_after_upload = sorted((tmp_path / "assets").iterdir())

        conflict = client.post(
            f"/api/resumes/{document.id}/photo",
            data={"revision": "0"},
            files={"file": ("photo.png", VALID_PNG, "image/png")},
        )
        assert conflict.status_code == 409
        current = client.get(f"/api/resumes/{document.id}").json()
        assert current["revision"] == 1
        assert current["profile"]["photo_url"] == first_photo_url
        assert sorted((tmp_path / "assets").iterdir()) == assets_after_upload


def test_corrupt_docx_photo_does_not_inherit_previous_photo(
    tmp_path, monkeypatch
) -> None:
    configure_storage(tmp_path, monkeypatch)
    previous = create_document()
    db.update_photo(previous.id, "/api/assets/previous.png", previous.revision)

    with TestClient(main.app) as client:
        imported = client.post(
            "/api/import",
            files={
                "file": (
                    "sample.docx",
                    build_sample_docx(corrupt_photo=True),
                    "application/vnd.openxmlformats-officedocument."
                    "wordprocessingml.document",
                )
            },
        )

    assert imported.status_code == 200
    assert imported.json()["profile"]["photo_url"] == ""
    assert any("照片" in warning for warning in imported.json()["warnings"])


def test_database_backup_and_restore(tmp_path, monkeypatch) -> None:
    configure_storage(tmp_path, monkeypatch)
    original = create_document()
    deleted = create_document("deleted-resume")
    assert db.delete_resume(deleted.id, deleted.revision)
    backup_path = db.backup_database()

    changed = original.model_copy(deep=True)
    changed.title = "备份后的修改"
    changed = db.save_resume(changed)
    assert db.get_resume(original.id).title == "备份后的修改"

    safety_backup = db.restore_database(backup_path)
    restored = db.get_resume(original.id)
    assert safety_backup.is_file()
    assert restored is not None
    assert restored.title == "基础简历"
    assert restored.revision > changed.revision
    assert restored.revision >= int(time.time() * 1000) - 1000
    restored_deleted = db.get_resume(deleted.id, include_deleted=True)
    assert restored_deleted is not None
    assert restored_deleted.deleted_at is not None
    assert restored_deleted.revision > deleted.revision

    first_restored_revision = restored.revision
    db.restore_database(backup_path)
    assert db.get_resume(original.id).revision > first_restored_revision


def test_full_backup_api_restores_database_assets_and_uploads(
    tmp_path, monkeypatch
) -> None:
    configure_storage(tmp_path, monkeypatch)
    document = create_document()
    asset_path = tmp_path / "assets" / "profile.png"
    upload_path = tmp_path / "uploads" / "source.md"
    asset_path.write_bytes(b"original-asset")
    upload_path.write_bytes(b"original-upload")
    document = db.update_photo(
        document.id,
        "/api/assets/profile.png",
        document.revision,
    )

    with TestClient(main.app) as client:
        response = client.post("/api/backup")
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("application/zip")
        with ZipFile(BytesIO(response.content), "r") as archive:
            names = set(archive.namelist())
            assert "manifest.json" in names
            assert "database/resumes.sqlite3" in names
            assert "assets/profile.png" in names
            assert "uploads/source.md" in names
            assert all(not name.startswith("exports/") for name in names)

        changed = document.model_copy(deep=True)
        changed.title = "恢复前的修改"
        db.save_resume(changed)
        asset_path.write_bytes(b"changed-asset")
        upload_path.write_bytes(b"changed-upload")
        extra_path = tmp_path / "assets" / "keep-me.txt"
        extra_path.write_bytes(b"not-in-backup")

        restored = client.post(
            "/api/restore",
            files={"file": ("backup.zip", response.content, "application/zip")},
        )

    assert restored.status_code == 200
    assert restored.json()["restored_files"] == 2
    assert restored.json()["quarantined_files"] == 1
    assert db.get_resume(document.id).title == "基础简历"
    assert db.get_resume(document.id).revision > document.revision
    assert asset_path.read_bytes() == b"original-asset"
    assert upload_path.read_bytes() == b"original-upload"
    assert not extra_path.exists()
    quarantined_extra = list(
        (tmp_path / "backups").glob(
            "restore-quarantine-*/assets/keep-me.txt"
        )
    )
    assert len(quarantined_extra) == 1
    assert quarantined_extra[0].read_bytes() == b"not-in-backup"

    safety_backup = tmp_path / "backups" / restored.json()["safety_backup"]
    assert safety_backup.is_file()
    with ZipFile(safety_backup, "r") as archive:
        assert archive.read("assets/profile.png") == b"changed-asset"
        assert archive.read("assets/keep-me.txt") == b"not-in-backup"
        assert archive.read("uploads/source.md") == b"changed-upload"


def test_restore_rejects_zip_traversal_without_changing_data(
    tmp_path, monkeypatch
) -> None:
    configure_storage(tmp_path, monkeypatch)
    document = create_document()
    malicious = BytesIO()
    with ZipFile(malicious, "w", compression=ZIP_DEFLATED) as archive:
        archive.writestr("assets/../../outside.txt", b"unsafe")
        archive.writestr("manifest.json", b"{}")

    with TestClient(main.app) as client:
        response = client.post(
            "/api/restore",
            files={
                "file": (
                    "malicious.zip",
                    malicious.getvalue(),
                    "application/zip",
                )
            },
        )

    assert response.status_code == 422
    assert db.get_resume(document.id).title == "基础简历"
    assert not (tmp_path / "outside.txt").exists()


def test_restore_attachment_failure_rolls_back_database_and_files(
    tmp_path, monkeypatch
) -> None:
    configure_storage(tmp_path, monkeypatch)
    document = create_document()
    asset_path = tmp_path / "assets" / "profile.png"
    upload_path = tmp_path / "uploads" / "source.md"
    asset_path.write_bytes(b"backup-asset")
    upload_path.write_bytes(b"backup-upload")
    source_backup = backup.create_full_backup(
        backup_dir=tmp_path / "backups",
        asset_dir=tmp_path / "assets",
        upload_dir=tmp_path / "uploads",
    )

    current = document.model_copy(deep=True)
    current.title = "恢复前应保留的状态"
    current = db.save_resume(current)
    asset_path.write_bytes(b"current-asset")
    upload_path.write_bytes(b"current-upload")
    extra_path = tmp_path / "assets" / "current-only.txt"
    extra_path.write_bytes(b"current-extra")

    original_commit = backup._commit_staged_file
    calls = 0

    def fail_second_attachment(source_path, target):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise OSError("simulated attachment failure")
        original_commit(source_path, target)

    monkeypatch.setattr(backup, "_commit_staged_file", fail_second_attachment)
    with pytest.raises(backup.BackupArchiveError, match="已自动回滚"):
        backup.restore_full_backup(
            source_backup,
            backup_dir=tmp_path / "backups",
            asset_dir=tmp_path / "assets",
            upload_dir=tmp_path / "uploads",
        )

    rolled_back = db.get_resume(document.id)
    assert rolled_back is not None
    assert rolled_back.title == "恢复前应保留的状态"
    assert rolled_back.revision > current.revision
    assert asset_path.read_bytes() == b"current-asset"
    assert upload_path.read_bytes() == b"current-upload"
    assert extra_path.read_bytes() == b"current-extra"
    assert not list(
        (tmp_path / "backups").glob(
            "restore-quarantine-*/assets/current-only.txt"
        )
    )


@pytest.mark.parametrize(
    "payload",
    ["not-json", json.dumps({"id": "resume-1", "title": "字段不完整"})],
)
def test_validate_backup_rejects_invalid_resume_payload(
    tmp_path, monkeypatch, payload
) -> None:
    configure_storage(tmp_path, monkeypatch)
    create_document()
    database_backup = db.backup_database()
    with sqlite3.connect(database_backup) as connection:
        connection.execute(
            "UPDATE resumes SET payload = ? WHERE id = ?",
            (payload, "resume-1"),
        )

    with pytest.raises(db.InvalidBackupError, match="简历数据无效"):
        db.validate_backup(database_backup)


def test_mutating_endpoints_require_revision(tmp_path, monkeypatch) -> None:
    configure_storage(tmp_path, monkeypatch)
    document = create_document()

    with TestClient(main.app) as client:
        update_without_revision = document.model_dump(mode="json")
        update_without_revision.pop("revision")
        assert client.put(
            f"/api/resumes/{document.id}", json=update_without_revision
        ).status_code == 422
        assert client.patch(
            f"/api/resumes/{document.id}", json={"title": "缺少版本号"}
        ).status_code == 422
        assert client.delete(f"/api/resumes/{document.id}").status_code == 422
        assert client.post(
            f"/api/resumes/{document.id}/photo",
            files={"file": ("photo.png", VALID_PNG, "image/png")},
        ).status_code == 422

        assert client.delete(
            f"/api/resumes/{document.id}", params={"revision": 0}
        ).status_code == 204
        assert client.post(
            f"/api/resumes/{document.id}/restore"
        ).status_code == 422
        assert client.delete(
            f"/api/resumes/{document.id}/purge"
        ).status_code == 422
