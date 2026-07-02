from __future__ import annotations

from pathlib import Path
from urllib.parse import quote

from playwright.async_api import async_playwright

from .settings import APP_ORIGIN, CHROME_PATH, EXPORT_DIR, ensure_directories


async def export_pdf(resume_id: str, title: str) -> tuple[Path, str]:
    ensure_directories()
    output_path = EXPORT_DIR / f"{resume_id}.pdf"
    if not CHROME_PATH:
        raise RuntimeError("未找到 Google Chrome。请设置 CHROME_PATH 指向可执行文件。")
    chrome = Path(CHROME_PATH)
    if not chrome.exists():
        raise RuntimeError(
            "未找到 Google Chrome。请设置 CHROME_PATH 指向可执行文件。"
        )

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(
            executable_path=str(chrome),
            headless=True,
            args=["--font-render-hinting=none"],
        )
        page = await browser.new_page(viewport={"width": 1280, "height": 900})
        try:
            await page.goto(
                f"{APP_ORIGIN}/print/{resume_id}?export=1",
                wait_until="networkidle",
                timeout=30_000,
            )
            await page.wait_for_function(
                "window.__RESUME_READY__ === true", timeout=30_000
            )
            await page.emulate_media(media="print")
            await page.pdf(
                path=str(output_path),
                format="A4",
                print_background=True,
                prefer_css_page_size=True,
                margin={"top": "0", "right": "0", "bottom": "0", "left": "0"},
            )
        finally:
            await browser.close()

    filename = f"{title or '简历'}.pdf"
    content_disposition = f"attachment; filename*=UTF-8''{quote(filename)}"
    return output_path, content_disposition
