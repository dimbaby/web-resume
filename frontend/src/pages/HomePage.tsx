import { useEffect, useRef, useState } from "react";
import { FileText, FolderOpen, Pencil, Trash2, Upload } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { NameDialog } from "../components/NameDialog";
import type { ResumeSummary } from "../types";
import { formatTime } from "../utils";

export function HomePage() {
  const [resumes, setResumes] = useState<ResumeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [renameTarget, setRenameTarget] = useState<ResumeSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ResumeSummary | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api
      .list()
      .then(setResumes)
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, []);

  async function importFile(file?: File) {
    if (!file) return;
    setImporting(true);
    setError("");
    try {
      const document = await api.import(file);
      navigate(`/edit/${document.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "导入失败");
    } finally {
      setImporting(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function renameResume(resume: ResumeSummary, title: string) {
    try {
      const saved = await api.rename(resume.id, title);
      setResumes((current) =>
        current.map((value) =>
          value.id === resume.id
            ? { ...value, title: saved.title, updated_at: saved.updated_at }
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
      await api.remove(resume.id);
      setResumes((current) => current.filter((value) => value.id !== resume.id));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "删除失败");
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
        <button
          type="button"
          className="primary-button large"
          disabled={importing}
          onClick={() => inputRef.current?.click()}
        >
          <Upload size={18} /> {importing ? "正在解析…" : "导入简历"}
        </button>
        <input
          ref={inputRef}
          hidden
          type="file"
          accept=".md,.markdown,.docx"
          onChange={(event) => importFile(event.target.files?.[0])}
        />
      </header>

      {error && <div className="error-banner">{error}</div>}

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
          title="删除这个简历版本？"
          message={`将从版本库删除“${deleteTarget.title}”。其他简历版本和原始上传文件不会受影响。`}
          confirmLabel="删除版本"
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            const target = deleteTarget;
            setDeleteTarget(null);
            void deleteResume(target);
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
    </main>
  );
}
