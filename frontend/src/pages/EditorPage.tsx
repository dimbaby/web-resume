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
import { ApiError, api, type RevisionedResumeDocument } from "../api";
import { NameDialog } from "../components/NameDialog";
import { PagedPreview } from "../components/PagedPreview";
import { SectionEditor } from "../components/SectionEditor";
import { SortableList } from "../components/SortableList";
import type {
  BulletStyle,
  ResumeBullet,
  ResumeAppearance,
  ResumeItem,
  ResumeSection,
  TemplateStyle,
} from "../types";
import { uid } from "../utils";

type SaveState = "saved" | "saving" | "error";

type UndoAction =
  | { kind: "section"; index: number; section: ResumeSection }
  | { kind: "item"; sectionId: string; index: number; item: ResumeItem }
  | {
      kind: "bullet";
      sectionId: string;
      itemId: string;
      index: number;
      bullet: ResumeBullet;
    }
  | { kind: "photo"; photoUrl: string };

const DEFAULT_APPEARANCE: ResumeAppearance = {
  template: "reference",
  bullet_style: "triangle",
};

const TEMPLATE_OPTIONS: { value: TemplateStyle; label: string; hint: string }[] = [
  {
    value: "reference",
    label: "参考版",
    hint: "接近经典中文简历版式，中文友好，右上照片。",
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

function insertAt<T>(values: T[], index: number, value: T) {
  const next = [...values];
  next.splice(Math.min(Math.max(index, 0), next.length), 0, value);
  return next;
}

function restoreUndoAction(document: RevisionedResumeDocument, undo: UndoAction) {
  if (undo.kind === "section") {
    if (document.sections.some((section) => section.id === undo.section.id)) return document;
    return {
      ...document,
      sections: insertAt(document.sections, undo.index, undo.section),
    };
  }
  if (undo.kind === "item") {
    return {
      ...document,
      sections: document.sections.map((section) =>
        section.id === undo.sectionId &&
        !section.items.some((item) => item.id === undo.item.id)
          ? { ...section, items: insertAt(section.items, undo.index, undo.item) }
          : section,
      ),
    };
  }
  if (undo.kind === "bullet") {
    return {
      ...document,
      sections: document.sections.map((section) =>
        section.id === undo.sectionId
          ? {
              ...section,
              items: section.items.map((item) =>
                item.id === undo.itemId &&
                !item.bullets.some((bullet) => bullet.id === undo.bullet.id)
                  ? { ...item, bullets: insertAt(item.bullets, undo.index, undo.bullet) }
                  : item,
              ),
            }
          : section,
      ),
    };
  }
  return {
    ...document,
    profile: { ...document.profile, photo_url: undo.photoUrl },
  };
}

function operationMessage(reason: unknown, fallback: string) {
  if (reason instanceof ApiError && reason.status === 409) {
    return `保存冲突：这份简历已在其他页面更新。当前修改仍保留在本页，请先备份本页修改，再刷新后重试。${reason.message ? `（${reason.message}）` : ""}`;
  }
  return reason instanceof Error ? reason.message : fallback;
}

export function EditorPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [document, setDocument] = useState<RevisionedResumeDocument | null>(null);
  const [undo, setUndo] = useState<UndoAction | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [loadError, setLoadError] = useState("");
  const [operationError, setOperationError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const loadedRef = useRef(false);
  const mountedRef = useRef(true);
  const documentRef = useRef<RevisionedResumeDocument | null>(null);
  const dirtyRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);
  const savePromiseRef = useRef<Promise<RevisionedResumeDocument | null> | null>(null);
  const blockingOperationRef = useRef<Promise<void> | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadedRef.current = false;
    setLoadError("");
    setOperationError("");
    const load = async () => {
      const previous = documentRef.current;
      if (previous && previous.id !== id) {
        try {
          await flushSave(false);
        } catch (reason) {
          if (!cancelled) {
            setLoadError(operationMessage(reason, "切换简历前保存失败"));
          }
          return;
        }
      }
      if (cancelled) return;
      dirtyRef.current = false;
      setUndo(null);
      setSaveState("saved");
      try {
        const value = await api.get(id);
        if (cancelled) return;
        documentRef.current = value;
        setDocument(value);
        loadedRef.current = true;
      } catch (reason) {
        if (!cancelled) {
          setLoadError(reason instanceof Error ? reason.message : "读取简历失败");
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    mountedRef.current = true;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current && !savePromiseRef.current && !blockingOperationRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      mountedRef.current = false;
      window.removeEventListener("beforeunload", beforeUnload);
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
      if (dirtyRef.current) void flushSave(false).catch(() => undefined);
    };
  }, []);

  function replaceDocument(
    updater:
      | RevisionedResumeDocument
      | ((current: RevisionedResumeDocument) => RevisionedResumeDocument),
    markDirty = true,
  ) {
    const current = documentRef.current;
    if (!current) return;
    const next = typeof updater === "function" ? updater(current) : updater;
    documentRef.current = next;
    if (mountedRef.current) setDocument(next);
    if (!markDirty || !loadedRef.current) return;
    dirtyRef.current = true;
    setSaveState("saving");
    setOperationError("");
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void flushSave().catch(() => undefined);
    }, 750);
  }

  async function flushSave(updateUi = true): Promise<RevisionedResumeDocument | null> {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const blockingOperation = blockingOperationRef.current;
    if (blockingOperation) {
      await blockingOperation;
      if (blockingOperationRef.current === blockingOperation) {
        blockingOperationRef.current = null;
      }
      return flushSave(updateUi);
    }
    const activeSave = savePromiseRef.current;
    if (activeSave) {
      await activeSave;
      return dirtyRef.current ? flushSave(updateUi) : documentRef.current;
    }
    if (!dirtyRef.current) return documentRef.current;

    const task = (async () => {
      while (dirtyRef.current) {
        const current = documentRef.current;
        if (!current) return null;
        dirtyRef.current = false;
        if (updateUi && mountedRef.current) setSaveState("saving");
        try {
          const saved = await api.save(structuredClone(current));
          const latest = documentRef.current;
          if (latest?.id === saved.id) {
            const merged = {
              ...latest,
              revision: saved.revision,
              updated_at: saved.updated_at,
            };
            documentRef.current = merged;
            if (mountedRef.current) setDocument(merged);
          }
        } catch (reason) {
          dirtyRef.current = true;
          if (updateUi && mountedRef.current) {
            setSaveState("error");
            setOperationError(operationMessage(reason, "保存失败"));
          }
          throw reason;
        }
      }
      if (updateUi && mountedRef.current) setSaveState("saved");
      return documentRef.current;
    })();
    savePromiseRef.current = task;
    try {
      return await task;
    } finally {
      if (savePromiseRef.current === task) savePromiseRef.current = null;
    }
  }

  async function leaveEditor() {
    setOperationError("");
    try {
      await flushSave();
      navigate("/");
    } catch (reason) {
      setOperationError(operationMessage(reason, "保存失败，暂时无法返回版本库"));
    }
  }

  if (loadError) {
    return (
      <main className="center-state">
        <div className="error-banner">{loadError}</div>
        <button type="button" className="text-button" onClick={() => navigate("/")}>
          返回版本库
        </button>
      </main>
    );
  }
  if (!document || document.id !== id) {
    return <main className="center-state">正在打开简历…</main>;
  }
  const currentDocument = document;
  const appearance = document.appearance ?? DEFAULT_APPEARANCE;

  function updateAppearance(next: Partial<ResumeAppearance>) {
    replaceDocument((current) => ({
      ...current,
      appearance: { ...(current.appearance ?? DEFAULT_APPEARANCE), ...next },
    }));
  }

  function updateSection(section: ResumeSection) {
    replaceDocument((current) => ({
      ...current,
      sections: current.sections.map((value) => (value.id === section.id ? section : value)),
    }));
  }

  function deleteSection(sectionId: string) {
    const current = documentRef.current;
    const index = current?.sections.findIndex((section) => section.id === sectionId) ?? -1;
    if (!current || index < 0) return;
    setUndo({ kind: "section", index, section: structuredClone(current.sections[index]) });
    replaceDocument({
      ...current,
      sections: current.sections.filter((section) => section.id !== sectionId),
    });
  }

  function deleteItem(sectionId: string, itemId: string) {
    const current = documentRef.current;
    const section = current?.sections.find((value) => value.id === sectionId);
    const index = section?.items.findIndex((item) => item.id === itemId) ?? -1;
    if (!current || !section || index < 0) return;
    setUndo({ kind: "item", sectionId, index, item: structuredClone(section.items[index]) });
    replaceDocument({
      ...current,
      sections: current.sections.map((section) =>
        section.id === sectionId
          ? { ...section, items: section.items.filter((item) => item.id !== itemId) }
          : section,
      ),
    });
  }

  function deleteBullet(sectionId: string, itemId: string, bulletId: string) {
    const current = documentRef.current;
    const item = current?.sections
      .find((section) => section.id === sectionId)
      ?.items.find((value) => value.id === itemId);
    const index = item?.bullets.findIndex((bullet) => bullet.id === bulletId) ?? -1;
    if (!current || !item || index < 0) return;
    setUndo({
      kind: "bullet",
      sectionId,
      itemId,
      index,
      bullet: structuredClone(item.bullets[index]),
    });
    replaceDocument({
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
    });
  }

  function removePhoto() {
    const current = documentRef.current;
    if (!current?.profile.photo_url) return;
    setUndo({ kind: "photo", photoUrl: current.profile.photo_url });
    replaceDocument({
      ...current,
      profile: { ...current.profile, photo_url: "" },
    });
  }

  async function duplicate(title: string) {
    try {
      setOperationError("");
      const saved = await flushSave();
      if (!saved) throw new Error("简历尚未加载完成");
      const copy = await api.duplicate(saved.id, title);
      navigate(`/edit/${copy.id}`);
    } catch (reason) {
      setOperationError(operationMessage(reason, "复制失败"));
    }
  }

  async function uploadPhoto(file?: File) {
    if (!file) return;
    let blocker: Promise<void> | null = null;
    let uploadStarted = false;
    try {
      setOperationError("");
      const current = await flushSave();
      if (!current) throw new Error("简历尚未加载完成");
      setSaveState("saving");
      uploadStarted = true;
      const upload = api.photo(current.id, file, current.revision);
      blocker = upload.then(() => undefined, () => undefined);
      blockingOperationRef.current = blocker;
      const saved = await upload;
      replaceDocument(
        (latest) => ({
          ...latest,
          profile: { ...latest.profile, photo_url: saved.profile.photo_url },
          revision: saved.revision,
          updated_at: saved.updated_at,
        }),
        false,
      );
      setSaveState(dirtyRef.current ? "saving" : "saved");
    } catch (reason) {
      if (uploadStarted) setSaveState(dirtyRef.current ? "saving" : "saved");
      setOperationError(operationMessage(reason, "照片上传失败"));
    } finally {
      if (blocker) await blocker;
      if (blockingOperationRef.current === blocker) blockingOperationRef.current = null;
      if (dirtyRef.current) void flushSave().catch(() => undefined);
      if (photoRef.current) photoRef.current.value = "";
    }
  }

  async function downloadPdf() {
    setExporting(true);
    setOperationError("");
    try {
      const saved = await flushSave();
      if (!saved) throw new Error("简历尚未加载完成");
      const blob = await api.exportPdf(saved.id);
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = `${saved.title}.pdf`;
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) {
      setOperationError(operationMessage(reason, "PDF 导出失败"));
    } finally {
      setExporting(false);
    }
  }

  return (
    <main className="editor-page">
      <header className="editor-toolbar">
        <button
          type="button"
          className="icon-button"
          aria-label="返回版本库"
          onClick={() => void leaveEditor()}
        >
          <ArrowLeft size={18} />
        </button>
        <input
          className="document-title-input"
          value={document.title}
          aria-label="版本名称"
          onChange={(event) =>
            replaceDocument((current) => ({ ...current, title: event.target.value }))
          }
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

      {operationError && <div className="floating-error">{operationError}</div>}
      {undo && (
        <div className="undo-toast">
          内容已删除
          <button
            type="button"
            onClick={() => {
              replaceDocument((current) => restoreUndoAction(current, undo));
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
                onClick={() =>
                  replaceDocument((current) => ({ ...current, warnings: [] }))
                }
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
                    onClick={removePhoto}
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
                    replaceDocument((current) => ({
                      ...current,
                      profile: { ...current.profile, name: event.target.value },
                    }))
                  }
                />
              </label>
              <label>
                邮箱
                <input
                  value={document.profile.email}
                  onChange={(event) =>
                    replaceDocument((current) => ({
                      ...current,
                      profile: { ...current.profile, email: event.target.value },
                    }))
                  }
                />
              </label>
              <label>
                电话
                <input
                  value={document.profile.phone}
                  onChange={(event) =>
                    replaceDocument((current) => ({
                      ...current,
                      profile: { ...current.profile, phone: event.target.value },
                    }))
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
            onChange={(sections) =>
              replaceDocument((current) => ({ ...current, sections }))
            }
            renderItem={(section, handle) => (
              <SectionEditor
                section={section}
                handle={handle}
                onChange={updateSection}
                onDeleteSection={() => deleteSection(section.id)}
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
              replaceDocument((current) => ({
                ...current,
                sections: [
                  ...current.sections,
                  { id: uid(), kind: "custom", title: "新模块", items: [] },
                ],
              }))
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
