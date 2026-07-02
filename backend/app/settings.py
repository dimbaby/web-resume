from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = Path(os.getenv("RESUME_DATA_DIR", ROOT_DIR / "data")).resolve()
UPLOAD_DIR = DATA_DIR / "uploads"
ASSET_DIR = DATA_DIR / "assets"
EXPORT_DIR = DATA_DIR / "exports"
DB_PATH = DATA_DIR / "resumes.sqlite3"
FRONTEND_DIST = ROOT_DIR / "frontend" / "dist"
APP_ORIGIN = os.getenv("APP_ORIGIN", "http://127.0.0.1:5173").rstrip("/")


def default_chrome_path() -> str:
    candidates: list[Path] = []
    if sys.platform == "darwin":
        candidates.append(
            Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
        )
    elif os.name == "nt":
        for root in (
            os.getenv("PROGRAMFILES"),
            os.getenv("PROGRAMFILES(X86)"),
            os.getenv("LOCALAPPDATA"),
        ):
            if root:
                candidates.append(Path(root) / "Google/Chrome/Application/chrome.exe")
    else:
        for command in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser"):
            found = shutil.which(command)
            if found:
                return found
        candidates.extend(
            [
                Path("/usr/bin/google-chrome"),
                Path("/usr/bin/chromium"),
                Path("/usr/bin/chromium-browser"),
                Path("/snap/bin/chromium"),
            ]
        )
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)
    return ""


CHROME_PATH = os.getenv("CHROME_PATH", default_chrome_path())


def ensure_directories() -> None:
    for directory in (DATA_DIR, UPLOAD_DIR, ASSET_DIR, EXPORT_DIR):
        directory.mkdir(parents=True, exist_ok=True)
