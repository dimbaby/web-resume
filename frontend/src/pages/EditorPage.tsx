import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  ImagePlus,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { NameDialog } from "../components/NameDialog";
import { PagedPreview } from "../components/PagedPreview";
import { SectionEditor } from "../components/SectionEditor";
import { SortableList } from "../components/SortableList";
import type {
  BulletStyle,
  ResumeAppearance,
  ResumeDocument,
  ResumeSection,
  TemplateStyle,
} from "../types";
import { uid } from "../utils";

type SaveState = "saved" | "saving" | "error";

const DEFAULT_APPEARANCE: ResumeAppearance = {
  template: "reference",
  bullet_style: "triangle",
};

const TEMPLATE_OPTIONS: { value: TemplateStyle; label: string; hint: string }[] = [
  {
    value: "reference",
    label: "参考版",
    hint: "接近当前示例用户简历版式，中文友好，右上照片。",
  },
  {
    value: "ats",
    label: "ATS 极简",
    hint: "标准单栏、少装饰，适合网申系统读取。",
  },
  {
    value: "modern",
    label: "现代清爽",
    hint: "更轻的分隔线和强调色，适合产品、数据、互联网岗位。",
  },
  {
    value: "compact",
    label: "紧凑单页",
    hint: "字号和间距更紧，适合内容较多时压缩页数。",
  },
  {
    value: "elegant",
    label: "典雅学术",
    hint: "更接近英文 CV/学术简历质感，适合科研或申请场景。",
  },
];

const BULLET_OPTIONS: { value: BulletStyle; label: string }[] = [
  { value: "triangle", label: "三角 ➢" },
  { value: "dot", label: "圆点 •" },
  { value: "dash", label: "短横 -" },
  { value: "square", label: "方块 ▪" },
  { value: "none", label: "无符号" },
];

export function EditorPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [document, setDocument] = useState<ResumeDocument | null>(null);
  const [undo, setUndo] = useState<ResumeDocument | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const loadedRef = useRef(false);
  const photoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadedRef.current = false;
    api
      .get(id)
      .then((value) => {
        setDocument(value);
        loadedRef.current = true;
      })
      .catch((reason: Error) => setError(reason.message));
  }, [id]);

  useEffect(() => {
    if (!document || !loadedRef.current) return;
    setSaveState("saving");
    const timer = window.setTimeout(() => {
      api
        .save(document)
        .then((saved) => {
          setDocument((current) =>
            current?.id === saved.id ? { ...current, updated_at: saved.updated_at } : current,
          );
          setSaveState("saved");
        })
        .catch(() => setSaveState("error"));
    }, 750);
    return () => window.clearTimeout(timer);
  }, [
    document?.title,
    document?.profile,
    document?.appearance,
    document?.sections,
    document?.warnings,
  ]);

  if (error) {
    return (
      <main className="center-state">
        <div className="error-banner">{error}</div>
        <button type="button" className="text-button" onClick={() => navigate("/")}>
          返回版本库
        </button>
      </main>
    );
  }
  if (!document) return <main className="center-state">正在打开简历…</main>;
  const currentDocument = document;
  const appearance = document.appearance ?? DEFAULT_APPEARANCE;

  function updateAppearance(next: Partial<ResumeAppearance>) {
    setDocument({
      ...currentDocument,
      appearance: { ...appearance, ...next },
    });
  }

  function updateSection(section: ResumeSection) {
    setDocument((current) =>
      current
        ? {
            ...current,
            sections: current.sections.map((value) =>
              value.id === section.id ? section : value,
            ),
          }
        : current,
    );
  }

  function deleteWithUndo(mutator: (value: ResumeDocument) => ResumeDocument) {
    setDocument((current) => {
      if (!current) return current;
      setUndo(structuredClone(current));
      return mutator(current);
    });
  }

  function deleteItem(sectionId: string, itemId: string) {
    deleteWithUndo((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.id === sectionId
          ? { ...section, items: section.items.filter((item) => item.id !== itemId) }
          : section,
      ),
    }));
  }

  function deleteBullet(sectionId: string, itemId: string, bulletId: string) {
    deleteWithUndo((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              items: section.items.map((item) =>
                item.id === itemId
                  ? {
                      ...item,
                      bullets: item.bullets.filter((bullet) => bullet.id !== bulletId),
                    }
                  : item,
              ),
            }
          : section,
      ),
    }));
  }

  async function duplicate(title: string) {
    try {
      setSaveState("saving");
      await api.save(currentDocument);
      const copy = await api.duplicate(currentDocument.id, title);
      navigate(`/edit/${copy.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "复制失败");
    }
  }

  async function uploadPhoto(file?: File) {
    if (!file) return;
    try {
      const saved = await api.photo(currentDocument.id, file);
      setDocument(saved);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "照片上传失败");
    } finally {
      if (photoRef.current) photoRef.current.value = "";
    }
  }

  async function downloadPdf() {
    setExporting(true);
    setError("");
    try {
      await api.save(currentDocument);
      const link = window.document.createElement("a");
      link.href = `/api/resumes/${currentDocument.id}/export/pdf`;
      link.download = `${currentDocument.title}.pdf`;
      window.document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "PDF 导出失败");
    } finally {
      setExporting(false);
    }
  }

  return (
    <main className="editor-page">
      <header className="editor-toolbar">
        <button type="button" className="icon-button" onClick={() => navigate("/")}>
          <ArrowLeft size={18} />
        </button>
        <input
          className="document-title-input"
          value={document.title}
          aria-label="版本名称"
          onChange={(event) => setDocument({ ...document, title: event.target.value })}
        />
        <div className={`save-status ${saveState}`}>
          {saveState === "saved" && <Check size={14} />}
          {saveState === "saving" ? "正在保存" : saveState === "error" ? "保存失败" : "已保存"}
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={() => setCopyDialogOpen(true)}
        >
          <Copy size={16} /> 复制岗位版
        </button>
        <button
          type="button"
          className="primary-button"
          disabled={exporting}
          onClick={downloadPdf}
        >
          <Download size={16} /> {exporting ? "正在导出…" : "导出 PDF"}
        </button>
      </header>

      {error && <div className="floating-error">{error}</div>}
      {undo && (
        <div className="undo-toast">
          内容已删除
          <button
            type="button"
            onClick={() => {
              setDocument(undo);
              setUndo(null);
            }}
          >
            <RotateCcw size={14} /> 撤销
          </button>
        </div>
      )}
      {copyDialogOpen && (
        <NameDialog
          title="复制为新的岗位版本"
          message="请写明公司、岗位或日期，方便以后区分。当前版本会继续保留，新版本是一份互不影响的独立快照。"
          initialValue={`${currentDocument.title} - 公司/岗位 - ${new Date()
            .toISOString()
            .slice(0, 10)}`}
          confirmLabel="创建复制版本"
          onCancel={() => setCopyDialogOpen(false)}
          onConfirm={(title) => {
            setCopyDialogOpen(false);
            void duplicate(title);
          }}
        />
      )}

      <div className="editor-workspace">
        <aside className="structure-panel">
          {document.warnings.length > 0 && (
            <div className="warning-panel">
              <strong>导入后需要确认</strong>
              {document.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
              <button
                type="button"
                onClick={() => setDocument({ ...document, warnings: [] })}
              >
                我已确认
              </button>
            </div>
          )}

          <section className="profile-editor panel-card">
            <div className="panel-title-row">
              <div>
                <span className="eyebrow">PROFILE</span>
                <h2>基本信息</h2>
              </div>
              <div className="profile-photo-actions">
                <button
                  type="button"
                  className="text-button compact"
                  onClick={() => photoRef.current?.click()}
                >
                  <ImagePlus size={15} />
                  {document.profile.photo_url ? "替换照片" : "添加照片"}
                </button>
                {document.profile.photo_url && (
                  <button
                    type="button"
                    className="text-button compact danger-text"
                    onClick={() =>
                      deleteWithUndo((current) => ({
                        ...current,
                        profile: { ...current.profile, photo_url: "" },
                      }))
                    }
                  >
                    <Trash2 size={14} /> 去掉照片
                  </button>
                )}
              </div>
              <input
                ref={photoRef}
                hidden
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => uploadPhoto(event.target.files?.[0])}
              />
            </div>
            <div className="field-grid">
              <label>
                姓名
                <input
                  value={document.profile.name}
                  onChange={(event) =>
                    setDocument({
                      ...document,
                      profile: { ...document.profile, name: event.target.value },
                    })
                  }
                />
              </label>
              <label>
                邮箱
                <input
                  value={document.profile.email}
                  onChange={(event) =>
                    setDocument({
                      ...document,
                      profile: { ...document.profile, email: event.target.value },
                    })
                  }
                />
              </label>
              <label>
                电话
                <input
                  value={document.profile.phone}
                  onChange={(event) =>
                    setDocument({
                      ...document,
                      profile: { ...document.profile, phone: event.target.value },
                    })
                  }
                />
              </label>
            </div>
          </section>

          <section className="appearance-editor panel-card">
            <div className="panel-title-row">
              <div>
                <span className="eyebrow">STYLE</span>
                <h2>模板与符号</h2>
              </div>
            </div>
            <label>
              模板样式
              <select
                value={appearance.template}
                onChange={(event) =>
                  updateAppearance({ template: event.target.value as TemplateStyle })
                }
              >
                {TEMPLATE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="style-hint">
              {TEMPLATE_OPTIONS.find((option) => option.value === appearance.template)?.hint}
            </p>
            <label>
              要点符号
              <select
                value={appearance.bullet_style}
                onChange={(event) =>
                  updateAppearance({ bullet_style: event.target.value as BulletStyle })
                }
              >
                {BULLET_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <div className="panel-title-row module-heading">
            <div>
              <span className="eyebrow">STRUCTURE</span>
              <h2>内容模块</h2>
            </div>
            <span className="helper-text">拖动 ≡ 调整顺序</span>
          </div>

          <SortableList
            items={document.sections}
            className="section-list-editor"
            onChange={(sections) => setDocument({ ...document, sections })}
            renderItem={(section, handle) => (
              <SectionEditor
                section={section}
                handle={handle}
                onChange={updateSection}
                onDeleteSection={() =>
                  deleteWithUndo((current) => ({
                    ...current,
                    sections: current.sections.filter((value) => value.id !== section.id),
                  }))
                }
                onDeleteItem={(itemId) => deleteItem(section.id, itemId)}
                onDeleteBullet={(itemId, bulletId) =>
                  deleteBullet(section.id, itemId, bulletId)
                }
              />
            )}
          />
          <button
            type="button"
            className="add-section-button"
            onClick={() =>
              setDocument({
                ...document,
                sections: [
                  ...document.sections,
                  { id: uid(), kind: "custom", title: "新模块", items: [] },
                ],
              })
            }
          >
            <Plus size={17} /> 添加模块
          </button>
        </aside>

        <section className="preview-panel">
          <div className="preview-meta">
            <div>
              <span className="eyebrow">LIVE A4 PREVIEW</span>
              <strong>实时成品预览</strong>
            </div>
            <span className={pageCount > 2 ? "page-pill warning" : "page-pill"}>
              {pageCount || "–"} 页{pageCount > 2 ? " · 建议精简" : ""}
            </span>
          </div>
          <PagedPreview document={document} onPageCount={setPageCount} />
        </section>
      </div>
    </main>
  );
}
