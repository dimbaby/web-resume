from __future__ import annotations

import sys
from zipfile import ZipFile

from backend.app import db, maintenance


def test_maintenance_backup_and_restore_commands(tmp_path, monkeypatch) -> None:
    data_dir = tmp_path / "data"
    assets = data_dir / "assets"
    uploads = data_dir / "uploads"
    backups = data_dir / "backups"
    for directory in (assets, uploads, backups):
        directory.mkdir(parents=True)

    monkeypatch.setattr(db, "DB_PATH", data_dir / "resumes.sqlite3")
    monkeypatch.setattr(maintenance, "ASSET_DIR", assets)
    monkeypatch.setattr(maintenance, "UPLOAD_DIR", uploads)
    monkeypatch.setattr(maintenance, "BACKUP_DIR", backups)
    db.init_db()
    db.create_resume(
        {
            "id": "resume-1",
            "title": "虚构简历",
            "profile": {"name": "林安"},
            "sections": [],
            "source": {"filename": "sample.md", "format": "md"},
        }
    )

    archive_path = tmp_path / "manual-backup.zip"
    monkeypatch.setattr(
        sys,
        "argv",
        ["webresume-maintenance", "backup", str(archive_path)],
    )
    maintenance.main()

    with ZipFile(archive_path) as archive:
        assert "manifest.json" in archive.namelist()
        assert "database/resumes.sqlite3" in archive.namelist()

    changed = db.get_resume("resume-1")
    assert changed is not None
    changed.title = "恢复前修改"
    db.save_resume(changed)

    monkeypatch.setattr(
        sys,
        "argv",
        ["webresume-maintenance", "restore", str(archive_path)],
    )
    maintenance.main()

    restored = db.get_resume("resume-1")
    assert restored is not None
    assert restored.title == "虚构简历"
