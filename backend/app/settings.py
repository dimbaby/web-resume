from __future__ import annotations

import os
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = Path(os.getenv("RESUME_DATA_DIR", ROOT_DIR / "data")).resolve()
UPLOAD_DIR = DATA_DIR / "uploads"
ASSET_DIR = DATA_DIR / "assets"
EXPORT_DIR = DATA_DIR / "exports"
DB_PATH = DATA_DIR / "resumes.sqlite3"
FRONTEND_DIST = ROOT_DIR / "frontend" / "dist"
APP_ORIGIN = os.getenv("APP_ORIGIN", "http://127.0.0.1:5173").rstrip("/")
CHROME_PATH = os.getenv(
    "CHROME_PATH",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
)


def ensure_directories() -> None:
    for directory in (DATA_DIR, UPLOAD_DIR, ASSET_DIR, EXPORT_DIR):
        directory.mkdir(parents=True, exist_ok=True)

