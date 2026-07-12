import base64
from io import BytesIO
from pathlib import Path

from fastapi.testclient import TestClient

from backend.app import db, main
from backend.tests.fixtures import SAMPLE_MARKDOWN, build_sample_docx


def configure_test_storage(tmp_path, monkeypatch):
    uploads = tmp_path / "uploads"
    assets = tmp_path / "assets"
    uploads.mkdir()
    assets.mkdir()
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "test.sqlite3")
    monkeypatch.setattr(main, "UPLOAD_DIR", uploads)
    monkeypatch.setattr(main, "ASSET_DIR", assets)
    return uploads, assets


def test_import_save_and_duplicate_are_independent(tmp_path, monkeypatch) -> None:
    configure_test_storage(tmp_path, monkeypatch)

    with TestClient(main.app) as client:
        response = client.post(
            "/api/import",
            files={"file": ("sample.md", SAMPLE_MARKDOWN, "text/markdown")},
        )
        assert response.status_code == 200
        original = response.json()

        duplicate = client.post(
            f"/api/resumes/{original['id']}/duplicate",
            json={"title": "数据分析岗位版"},
        )
        assert duplicate.status_code == 200
        copied = duplicate.json()
        assert copied["id"] != original["id"]
        assert copied["title"] == "数据分析岗位版"

        copied["sections"][0]["title"] = "已修改教育经历"
        saved = client.put(f"/api/resumes/{copied['id']}", json=copied)
        assert saved.status_code == 200
        unchanged = client.get(f"/api/resumes/{original['id']}").json()
        assert unchanged["sections"][0]["title"] == "教育经历"


def test_resume_can_be_renamed_and_deleted_without_affecting_other_versions(
    tmp_path, monkeypatch
) -> None:
    configure_test_storage(tmp_path, monkeypatch)

    with TestClient(main.app) as client:
        original = client.post(
            "/api/import",
            files={"file": ("sample.md", SAMPLE_MARKDOWN, "text/markdown")},
        ).json()
        copied = client.post(
            f"/api/resumes/{original['id']}/duplicate",
            json={"title": "待重命名版本"},
        ).json()

        renamed = client.patch(
            f"/api/resumes/{copied['id']}",
            json={
                "title": "某公司 - 数据分析岗位",
                "revision": copied["revision"],
            },
        )
        assert renamed.status_code == 200
        assert renamed.json()["title"] == "某公司 - 数据分析岗位"

        deleted = client.delete(
            f"/api/resumes/{copied['id']}",
            params={"revision": renamed.json()["revision"]},
        )
        assert deleted.status_code == 204
        assert client.get(f"/api/resumes/{copied['id']}").status_code == 404
        assert client.get(f"/api/resumes/{original['id']}").status_code == 200


def test_photo_upload_updates_resume_and_writes_private_asset(tmp_path, monkeypatch) -> None:
    _, assets = configure_test_storage(tmp_path, monkeypatch)
    png = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    )

    with TestClient(main.app) as client:
        imported = client.post(
            "/api/import",
            files={"file": ("sample.md", SAMPLE_MARKDOWN, "text/markdown")},
        ).json()
        response = client.post(
            f"/api/resumes/{imported['id']}/photo",
            data={"revision": str(imported["revision"])},
            files={"file": ("photo.png", png, "image/png")},
        )

    assert response.status_code == 200
    photo_url = response.json()["profile"]["photo_url"]
    assert photo_url.startswith("/api/assets/")
    assert (assets / Path(photo_url).name).read_bytes() == png


def test_markdown_import_reuses_profile_from_latest_docx(tmp_path, monkeypatch) -> None:
    configure_test_storage(tmp_path, monkeypatch)

    with TestClient(main.app) as client:
        first = client.post(
            "/api/import",
            files={
                "file": (
                    "sample.docx",
                    BytesIO(build_sample_docx()),
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                )
            },
        )
        assert first.status_code == 200

        second = client.post(
            "/api/import",
            files={
                "file": (
                    "sample.md",
                    SAMPLE_MARKDOWN.replace(
                        b"lin.an@example.com | 13800000000\n", b""
                    ),
                    "text/markdown",
                )
            },
        )

    assert second.status_code == 200
    profile = second.json()["profile"]
    assert profile["name"] == "林安"
    assert profile["email"] == "lin.an@example.com"
    assert profile["phone"] == "13800000000"
