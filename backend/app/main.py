from __future__ import annotations

import mimetypes
import re
from contextlib import asynccontextmanager
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, File, HTTPException, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import db
from .exporter import export_pdf
from .parsers import parse_resume
from .schemas import (
    DuplicateRequest,
    RenameRequest,
    ResumeDocument,
    ResumeProfile,
    ResumeSummary,
)
from .settings import ASSET_DIR, FRONTEND_DIST, UPLOAD_DIR, ensure_directories


@asynccontextmanager
async def lifespan(_: FastAPI):
    ensure_directories()
    db.init_db()
    yield


app = FastAPI(title="Web Resume API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/resumes", response_model=list[ResumeSummary])
def get_resumes() -> list[ResumeSummary]:
    return db.list_resumes()


@app.get("/api/resumes/{resume_id}", response_model=ResumeDocument)
def get_resume(resume_id: str) -> ResumeDocument:
    document = db.get_resume(resume_id)
    if document is None:
        raise HTTPException(status_code=404, detail="简历不存在。")
    return document


def _latest_profile() -> ResumeProfile | None:
    summaries = db.list_resumes()
    if not summaries:
        return None
    document = db.get_resume(summaries[0].id)
    return document.profile if document else None


@app.post("/api/import", response_model=ResumeDocument)
async def import_resume(file: UploadFile = File(...)) -> ResumeDocument:
    filename = Path(file.filename or "resume").name
    suffix = Path(filename).suffix.lower()
    if suffix not in {".md", ".markdown", ".docx"}:
        raise HTTPException(status_code=415, detail="仅支持 Markdown 和 DOCX 文件。")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="上传文件为空。")
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="文件不能超过 10MB。")

    resume_id = uuid4().hex
    stored_name = f"{resume_id}{suffix}"
    (UPLOAD_DIR / stored_name).write_bytes(data)

    try:
        parsed = parse_resume(filename, data)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    previous = _latest_profile()
    for field in ("name", "email", "phone"):
        if not getattr(parsed.profile, field) and previous:
            setattr(parsed.profile, field, getattr(previous, field))
    if not parsed.photo_bytes and previous and previous.photo_url:
        parsed.profile.photo_url = previous.photo_url

    if parsed.photo_bytes:
        extension = re.sub(r"[^a-z0-9]", "", parsed.photo_extension.lower()) or "jpg"
        photo_name = f"{resume_id}.{extension}"
        (ASSET_DIR / photo_name).write_bytes(parsed.photo_bytes)
        parsed.profile.photo_url = f"/api/assets/{photo_name}"

    missing = [
        label
        for field, label in (("name", "姓名"), ("email", "邮箱"), ("phone", "电话"))
        if not getattr(parsed.profile, field)
    ]
    if missing:
        parsed.warnings.append(f"请补充基本信息：{'、'.join(missing)}。")

    title = Path(filename).stem
    return db.create_resume(
        {
            "id": resume_id,
            "title": f"{title} - 基础版",
            "profile": parsed.profile,
            "sections": parsed.sections,
            "warnings": parsed.warnings,
            "source": {"filename": filename, "format": "docx" if suffix == ".docx" else "md"},
        }
    )


@app.put("/api/resumes/{resume_id}", response_model=ResumeDocument)
def update_resume(resume_id: str, document: ResumeDocument) -> ResumeDocument:
    if resume_id != document.id:
        raise HTTPException(status_code=400, detail="简历 ID 不一致。")
    if db.get_resume(resume_id) is None:
        raise HTTPException(status_code=404, detail="简历不存在。")
    return db.save_resume(document)


@app.patch("/api/resumes/{resume_id}", response_model=ResumeDocument)
def rename_resume(resume_id: str, request: RenameRequest) -> ResumeDocument:
    document = db.get_resume(resume_id)
    if document is None:
        raise HTTPException(status_code=404, detail="简历不存在。")
    title = request.title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="版本名称不能为空。")
    document.title = title
    return db.save_resume(document)


@app.delete("/api/resumes/{resume_id}", status_code=204)
def delete_resume(resume_id: str) -> Response:
    if not db.delete_resume(resume_id):
        raise HTTPException(status_code=404, detail="简历不存在。")
    return Response(status_code=204)


@app.post("/api/resumes/{resume_id}/duplicate", response_model=ResumeDocument)
def duplicate_resume(resume_id: str, request: DuplicateRequest) -> ResumeDocument:
    document = db.get_resume(resume_id)
    if document is None:
        raise HTTPException(status_code=404, detail="简历不存在。")
    payload = document.model_dump(mode="python")
    payload["id"] = uuid4().hex
    payload["title"] = request.title or f"{document.title} - 岗位版"
    payload["source"] = {"filename": document.source.filename, "format": document.source.format}
    payload.pop("created_at", None)
    payload.pop("updated_at", None)
    return db.create_resume(payload)


@app.post("/api/resumes/{resume_id}/photo", response_model=ResumeDocument)
async def upload_photo(
    resume_id: str, file: UploadFile = File(...)
) -> ResumeDocument:
    document = db.get_resume(resume_id)
    if document is None:
        raise HTTPException(status_code=404, detail="简历不存在。")
    suffix = Path(file.filename or "photo.jpg").suffix.lower()
    if suffix not in {".jpg", ".jpeg", ".png", ".webp"}:
        raise HTTPException(status_code=415, detail="照片仅支持 JPG、PNG 或 WebP。")
    data = await file.read()
    if not data or len(data) > 8 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="照片为空或超过 8MB。")
    photo_name = f"{resume_id}-{uuid4().hex[:8]}{suffix}"
    (ASSET_DIR / photo_name).write_bytes(data)
    document.profile.photo_url = f"/api/assets/{photo_name}"
    return db.save_resume(document)


@app.get("/api/assets/{filename}")
def get_asset(filename: str) -> FileResponse:
    safe_name = Path(filename).name
    path = ASSET_DIR / safe_name
    if not path.is_file():
        raise HTTPException(status_code=404, detail="图片不存在。")
    media_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return FileResponse(path, media_type=media_type)


@app.get("/api/resumes/{resume_id}/export/pdf")
@app.post("/api/resumes/{resume_id}/export/pdf")
async def create_pdf(resume_id: str) -> FileResponse:
    document = db.get_resume(resume_id)
    if document is None:
        raise HTTPException(status_code=404, detail="简历不存在。")
    try:
        path, content_disposition = await export_pdf(resume_id, document.title)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"PDF 导出失败：{exc}") from exc
    return FileResponse(
        path,
        media_type="application/pdf",
        headers={"Content-Disposition": content_disposition},
    )


if FRONTEND_DIST.is_dir():
    assets = FRONTEND_DIST / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=assets), name="frontend-assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def frontend(full_path: str) -> FileResponse:
        candidate = (FRONTEND_DIST / full_path).resolve()
        if (
            full_path
            and candidate.is_file()
            and FRONTEND_DIST.resolve() in candidate.parents
        ):
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html")
