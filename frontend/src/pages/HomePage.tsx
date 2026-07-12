import { useEffect, useRef, useState } from "react";
import {
  DatabaseBackup,
  FileText,
  FolderOpen,
  Pencil,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { NameDialog } from "../components/NameDialog";
import type { ResumeSummary } from "../types";
import { formatTime } from "../utils";

export function HomePage() {
  const [resumes, setResumes] = useState<ResumeSummary[]>([]);
  const [trash, setTrash] = useState<ResumeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [renameTarget, setRenameTarget] = useState<ResumeSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ResumeSummary | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<ResumeSummary | null>(null);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  async function refreshLibrary(showLoading = false) {
    if (showLoading) setLoading(true);
    try {
      const [active, deleted] = await Promise.all([api.list(), api.trash()]);
      setResumes(active);
      setTrash(deleted);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "读取版本库失败");
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  useEffect(() => {
    void refreshLibrary(true);
  }, []);

  async function importFile(file?: File) {
    if (!file) return;
    setImporting(true);
    setError("");
    try {
      const document = await api.import(file);
      navigate(`/import/${document.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "导入失败");
    } finally {
      setImporting(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function renameResume(resume: ResumeSummary, title: string) {
    try {
      const saved = await api.rename(resume.id, title, resume.revision);
      setResumes((current) =>
        current.map((value) =>
          value.id === resume.id
            ? {
                ...value,
                title: saved.title,
                revision: saved.revision,
                updated_at: saved.updated_at,
              }
            : value,
        ),
      );
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "重命名失败");
    }
  }

  async function deleteResume(resume: ResumeSummary) {
    try {
      await api.remove(resume.id, resume.revision);
      await refreshLibrary();
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "删除失败");
    }
  }

  async function restoreResume(resume: ResumeSummary) {
    try {
      await api.restoreResume(resume.id, resume.revision);
      await refreshLibrary();
      setNotice(`已恢复“${resume.title}”。`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "恢复失败");
    }
  }

  async function purgeResume(resume: ResumeSummary) {
    try {
      await api.purge(resume.id, resume.revision);
      await refreshLibrary();
      setNotice(`已永久删除“${resume.title}”。`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "永久删除失败");
    }
  }

  async function downloadBackup() {
    try {
      const backup = await api.backup();
      const url = URL.createObjectURL(backup.blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = backup.filename;
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("备份文件已生成。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "备份失败");
    }
  }

  async function restoreBackup(file: File) {
    try {
      await api.restoreBackup(file);
      await refreshLibrary(true);
      setNotice("备份已恢复，恢复前的数据也已自动创建安全备份。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "恢复备份失败");
    } finally {
      setRestoreFile(null);
      if (restoreRef.current) restoreRef.current.value = "";
    }
  }

  return (
    <main className="home-page">
      <header className="home-header">
        <div>
          <span className="eyebrow">LOCAL RESUME STUDIO</span>
          <h1>把一份简历，变成每个岗位的合身版本。</h1>
          <p>导入 Markdown 或 DOCX，重排内容，边改边看，最后下载 A4 PDF。</p>
        </div>
        <div className="home-header-actions">
          <button type="button" className="secondary-button" onClick={() => void downloadBackup()}>
            <DatabaseBackup size={17} /> 备份
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => restoreRef.current?.click()}
          >
            <RotateCcw size={17} /> 恢复
          </button>
          <button
            type="button"
            className="primary-button large"
            disabled={importing}
            onClick={() => inputRef.current?.click()}
          >
            <Upload size={18} /> {importing ? "正在解析…" : "导入简历"}
          </button>
        </div>
        <input
          ref={inputRef}
          hidden
          type="file"
          accept=".md,.markdown,.docx"
          onChange={(event) => importFile(event.target.files?.[0])}
        />
        <input
          ref={restoreRef}
          hidden
          type="file"
          accept=".zip,application/zip"
          onChange={(event) => setRestoreFile(event.target.files?.[0] ?? null)}
        />
      </header>

      {error && <div className="error-banner">{error}</div>}
      {notice && <div className="notice-banner">{notice}</div>}

      {renameTarget && (
        <NameDialog
          title="重命名简历版本"
          message="建议写明公司、岗位或用途，方便以后快速找到这份版本。"
          initialValue={renameTarget.title}
          confirmLabel="保存名称"
          onCancel={() => setRenameTarget(null)}
          onConfirm={(title) => {
            const target = renameTarget;
            setRenameTarget(null);
            void renameResume(target, title);
          }}
        />
      )}
      {deleteTarget && (
        <ConfirmDialog
          title="移入回收站？"
          message={`“${deleteTarget.title}”会从版本库移入回收站，之后仍可恢复。`}
          confirmLabel="移入回收站"
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            const target = deleteTarget;
            setDeleteTarget(null);
            void deleteResume(target);
          }}
        />
      )}
      {purgeTarget && (
        <ConfirmDialog
          title="永久删除这个版本？"
          message={`“${purgeTarget.title}”将无法再从回收站恢复。`}
          confirmLabel="永久删除"
          onCancel={() => setPurgeTarget(null)}
          onConfirm={() => {
            const target = purgeTarget;
            setPurgeTarget(null);
            void purgeResume(target);
          }}
        />
      )}
      {restoreFile && (
        <ConfirmDialog
          title="恢复这份备份？"
          message="当前版本库会先自动创建安全备份，再恢复所选文件中的简历、照片和上传原件。"
          confirmLabel="开始恢复"
          onCancel={() => {
            setRestoreFile(null);
            if (restoreRef.current) restoreRef.current.value = "";
          }}
          onConfirm={() => {
            const file = restoreFile;
            setRestoreFile(null);
            void restoreBackup(file);
          }}
        />
      )}

      <section className="library-section">
        <div className="section-label-row">
          <div>
            <span className="eyebrow">VERSION LIBRARY</span>
            <h2>我的简历版本</h2>
          </div>
          <span className="count-pill">{resumes.length} 份</span>
        </div>

        {loading ? (
          <div className="empty-library">正在读取本地版本库…</div>
        ) : resumes.length === 0 ? (
          <button
            type="button"
            className="empty-library import-dropzone"
            onClick={() => inputRef.current?.click()}
          >
            <FolderOpen size={36} />
            <strong>还没有简历版本</strong>
            <span>导入当前的 Markdown 或 DOCX，建立第一份基础版。</span>
          </button>
        ) : (
          <div className="resume-grid">
            {resumes.map((resume) => (
              <article className="resume-card" key={resume.id}>
                <button
                  type="button"
                  className="resume-card-main"
                  onClick={() => navigate(`/edit/${resume.id}`)}
                >
                  <div className="resume-card-icon">
                    <FileText size={23} />
                  </div>
                  <div className="resume-card-copy">
                    <h3>{resume.title}</h3>
                    <p>{resume.source_filename || "手动创建"}</p>
                    <span>
                      {resume.section_count} 个模块 · 更新于 {formatTime(resume.updated_at)}
                    </span>
                  </div>
                  <span className="resume-card-arrow">↗</span>
                </button>
                <div className="resume-card-actions" aria-label={`${resume.title} 版本管理`}>
                  <button
                    type="button"
                    className="icon-button subtle"
                    aria-label={`重命名 ${resume.title}`}
                    title="重命名"
                    onClick={() => setRenameTarget(resume)}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-button danger subtle"
                    aria-label={`删除 ${resume.title}`}
                    title="删除"
                    onClick={() => setDeleteTarget(resume)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {trash.length > 0 && (
        <section className="library-section trash-section">
          <div className="section-label-row">
            <div>
              <span className="eyebrow">RECYCLE BIN</span>
              <h2>回收站</h2>
            </div>
            <span className="count-pill">{trash.length} 份</span>
          </div>
          <div className="resume-grid">
            {trash.map((resume) => (
              <article className="resume-card" key={resume.id}>
                <div className="resume-card-main trash-card-main">
                  <div className="resume-card-icon">
                    <FileText size={23} />
                  </div>
                  <div className="resume-card-copy">
                    <h3>{resume.title}</h3>
                    <p>{resume.source_filename || "手动创建"}</p>
                    <span>移入回收站于 {formatTime(resume.updated_at)}</span>
                  </div>
                </div>
                <div className="resume-card-actions" aria-label={`${resume.title} 回收站操作`}>
                  <button
                    type="button"
                    className="icon-button subtle"
                    aria-label={`恢复 ${resume.title}`}
                    title="恢复"
                    onClick={() => void restoreResume(resume)}
                  >
                    <RotateCcw size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-button danger subtle"
                    aria-label={`永久删除 ${resume.title}`}
                    title="永久删除"
                    onClick={() => setPurgeTarget(resume)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
