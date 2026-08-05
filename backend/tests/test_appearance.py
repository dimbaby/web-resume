from __future__ import annotations

from copy import deepcopy

import pytest
from fastapi.testclient import TestClient

from backend.app import db, main


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


def create_document(*, template: str = "reference"):
    return db.create_resume(
        {
            "id": f"resume-{template}",
            "title": "排版测试简历",
            "appearance": {
                "template": template,
                "bullet_style": "triangle",
            },
            "sections": [],
            "source": {"filename": "fixture.md", "format": "md"},
        }
    )


@pytest.mark.parametrize(
    ("template", "font_size", "line_height"),
    [
        ("reference", 10.9, 1.52),
        ("ats", 10.4, 1.45),
        ("compact", 9.8, 1.38),
        ("elegant", 10.6, 1.52),
    ],
)
def test_old_appearance_without_density_keeps_template_metrics(
    tmp_path, monkeypatch, template, font_size, line_height
) -> None:
    configure_storage(tmp_path, monkeypatch)
    document = create_document(template=template)

    assert document.appearance.density.preset == "standard"
    assert document.appearance.density.font_size_pt == font_size
    expected_item_title_size = 11.2 if template == "compact" else 12.0
    assert document.appearance.density.item_title_font_size_pt == expected_item_title_size
    assert document.appearance.density.line_height == line_height

    with TestClient(main.app) as client:
        payload = client.get(f"/api/resumes/{document.id}").json()

    assert payload["appearance"]["density"]["font_size_pt"] == font_size
    assert (
        payload["appearance"]["density"]["item_title_font_size_pt"]
        == expected_item_title_size
    )
    assert payload["appearance"]["density"]["line_height"] == line_height


def test_old_density_without_item_title_size_uses_template_default(
    tmp_path, monkeypatch
) -> None:
    configure_storage(tmp_path, monkeypatch)
    document = db.create_resume(
        {
            "id": "resume-legacy-compact-density",
            "title": "旧版密度数据",
            "appearance": {
                "template": "compact",
                "bullet_style": "triangle",
                "density": {
                    "preset": "custom",
                    "page_margin_vertical_mm": 14,
                    "page_margin_horizontal_mm": 15,
                    "font_size_pt": 9.8,
                    "line_height": 1.38,
                    "paragraph_spacing_percent": 80,
                },
            },
            "sections": [],
            "source": {"filename": "fixture.md", "format": "md"},
        }
    )

    assert document.appearance.density.item_title_font_size_pt == 11.2
    assert document.appearance.density.font_size_pt == 9.8
    assert document.appearance.density.paragraph_spacing_percent == 80


def test_density_round_trip_and_duplicate_are_independent(tmp_path, monkeypatch) -> None:
    configure_storage(tmp_path, monkeypatch)
    original = create_document()
    payload = original.model_dump(mode="json")
    payload["appearance"]["density"] = {
        "preset": "custom",
        "page_margin_vertical_mm": 14,
        "page_margin_horizontal_mm": 15,
        "font_size_pt": 10.1,
        "item_title_font_size_pt": 11.8,
        "line_height": 1.34,
        "paragraph_spacing_percent": 70,
    }

    with TestClient(main.app) as client:
        saved_response = client.put(f"/api/resumes/{original.id}", json=payload)
        assert saved_response.status_code == 200
        saved = saved_response.json()
        assert saved["revision"] == 1
        assert saved["appearance"]["density"] == payload["appearance"]["density"]

        copied_response = client.post(
            f"/api/resumes/{original.id}/duplicate",
            json={"title": "密集排版岗位版"},
        )
        assert copied_response.status_code == 200
        copied = copied_response.json()
        assert copied["appearance"]["density"] == payload["appearance"]["density"]

        changed_copy = deepcopy(copied)
        changed_copy["appearance"]["density"]["page_margin_horizontal_mm"] = 18
        assert client.put(
            f"/api/resumes/{copied['id']}", json=changed_copy
        ).status_code == 200
        unchanged = client.get(f"/api/resumes/{original.id}").json()

    assert unchanged["appearance"]["density"]["page_margin_horizontal_mm"] == 15


@pytest.mark.parametrize(
    ("field", "invalid_value"),
    [
        ("page_margin_vertical_mm", 12),
        ("page_margin_horizontal_mm", 23),
        ("font_size_pt", 9.4),
        ("item_title_font_size_pt", 10.1),
        ("line_height", 1.27),
        ("paragraph_spacing_percent", 59),
    ],
)
def test_density_rejects_values_below_readability_limits(
    tmp_path, monkeypatch, field, invalid_value
) -> None:
    configure_storage(tmp_path, monkeypatch)
    original = create_document()
    payload = original.model_dump(mode="json")
    payload["appearance"]["density"][field] = invalid_value

    with TestClient(main.app) as client:
        response = client.put(f"/api/resumes/{original.id}", json=payload)

    assert response.status_code == 422
    assert db.get_resume(original.id).revision == 0
