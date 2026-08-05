import { useEffect, useRef, useState, type CSSProperties } from "react";
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
import { appendLibraryBullet, appendLibraryItem } from "../contentLibrary";
import {
  ContentLibraryDialog,
  type ContentSourceMode,
  type ContentLibraryTarget,
} from "../components/ContentLibraryDialog";
import { NameDialog } from "../components/NameDialog";
import { PagedPreview } from "../components/PagedPreview";
import { SectionEditor } from "../components/SectionEditor";
import { SortableList } from "../components/SortableList";
import {
  DEFAULT_APPEARANCE,
  DENSITY_LIMITS,
  makeDensityPreset,
  normalizeAppearance,
} from "../printLayout";
import type {
  BulletStyle,
  DensityPreset,
  LibraryEntry,
  ResumeBullet,
  ResumeAppearance,
  ResumeDensity,
  ResumeItem,
  ResumeSection,
  TemplateStyle,
} from "../types";
import { plain, uid } from "../utils";

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

const DENSITY_OPTIONS: {
  value: Exclude<DensityPreset, "custom">;
  label: string;
  summary: string;
  hint: string;
}[] = [
  {
    value: "standard",
    label: "标准",
    summary: "舒适留白",
    hint: "保留舒适留白，适合内容已经较精简的简历。",
  },
  {
    value: "compact",
    label: "紧凑",
    summary: "优先收间距",
    hint: "优先收紧页边距和段落留白，字号只做小幅调整。",
  },
  {
    value: "dense",
    label: "单页密集",
    summary: "接近安全下限",
    hint: "使用安全下限排版；仍超过一页时应继续精简内容。",
  },
];

function densityRangeStyle(value: number, min: number, max: number): CSSProperties {
  const progress = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  return { "--range-progress": `${progress}%` } as CSSProperties;
}

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
  const [libraryTarget, setLibraryTarget] = useState<ContentLibraryTarget | null>(null);
  const [libraryEntries, setLibraryEntries] = useState<LibraryEntry[]>([]);
  const [resumeVersions, setResumeVersions] = useState<RevisionedResumeDocument[]>([]);
  const [contentSourceMode, setContentSourceMode] =
    useState<ContentSourceMode>("library");
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState("");
  const [libraryNotice, setLibraryNotice] = useState("");
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

  async function openContentLibrary(
    target: ContentLibraryTarget,
    sourceMode: ContentSourceMode = "library",
  ) {
    setContentSourceMode(sourceMode);
    setLibraryTarget(target);
    setLibraryNotice("");
    setLibraryError("");
    setLibraryEntries([]);
    setResumeVersions([]);
    setLibraryLoading(true);
    try {
      await flushSave();
      const [entries, summaries] = await Promise.all([api.library(), api.list()]);
      const otherSummaries = summaries.filter((summary) => summary.id !== id);
      const versions = await Promise.all(
        otherSummaries.map((summary) => api.get(summary.id)),
      );
      setLibraryEntries(entries);
      setResumeVersions(versions);
    } catch (reason) {
      setLibraryError(operationMessage(reason, "读取可选内容失败"));
    } finally {
      setLibraryLoading(false);
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
  const appearance = normalizeAppearance(document.appearance ?? DEFAULT_APPEARANCE);

  function updateAppearance(next: Partial<ResumeAppearance>) {
    replaceDocument((current) => ({
      ...current,
      appearance: { ...normalizeAppearance(current.appearance), ...next },
    }));
  }

  function selectTemplate(template: TemplateStyle) {
    replaceDocument((current) => {
      const currentAppearance = normalizeAppearance(current.appearance);
      const preset = currentAppearance.density.preset;
      return {
        ...current,
        appearance: {
          ...currentAppearance,
          template,
          density:
            preset === "custom"
              ? currentAppearance.density
              : makeDensityPreset(template, preset),
        },
      };
    });
  }

  function applyDensityPreset(preset: Exclude<DensityPreset, "custom">) {
    updateAppearance({ density: makeDensityPreset(appearance.template, preset) });
  }

  function updateDensity(next: Partial<ResumeDensity>) {
    replaceDocument((current) => {
      const currentAppearance = normalizeAppearance(current.appearance);
      return {
        ...current,
        appearance: {
          ...currentAppearance,
          density: {
            ...currentAppearance.density,
            ...next,
            preset: "custom",
          },
        },
      };
    });
  }

  function addItemFromLibrary(entry: LibraryEntry) {
    const current = documentRef.current;
    if (!current || libraryTarget?.mode !== "item") return;
    const result = appendLibraryItem(current, libraryTarget.sectionId, entry);
    const title = plain(entry.item.title).trim() || "未命名条目";
    if (!result.added) {
      setLibraryNotice(`“${title}”的相同内容已经在当前模块中。`);
      return;
    }
    replaceDocument(result.document);
    setLibraryNotice(`已加入“${title}”，可以继续选择其他内容。`);
  }

  function addBulletFromLibrary(entry: LibraryEntry, bullet: ResumeBullet) {
    const current = documentRef.current;
    if (!current || libraryTarget?.mode !== "bullet") return;
    const result = appendLibraryBullet(
      current,
      libraryTarget.sectionId,
      libraryTarget.itemId,
      bullet,
    );
    if (!result.added) {
      setLibraryNotice("相同要点已经在当前条目中。");
      return;
    }
    replaceDocument(result.document);
    const sourceTitle = plain(entry.item.title).trim();
    setLibraryNotice(
      sourceTitle
        ? `已从“${sourceTitle}”补充一条要点。`
        : "已补充一条历史要点。",
    );
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
      {libraryTarget && (
        <ContentLibraryDialog
          document={document}
          entries={libraryEntries}
          versions={resumeVersions}
          initialSource={contentSourceMode}
          target={libraryTarget}
          loading={libraryLoading}
          error={libraryError}
          notice={libraryNotice}
          onClose={() => {
            setLibraryTarget(null);
            setLibraryNotice("");
          }}
          onRetry={() => void openContentLibrary(libraryTarget, contentSourceMode)}
          onAddItem={addItemFromLibrary}
          onAddBullet={addBulletFromLibrary}
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
            <label className="styled-select-field">
              模板样式
              <select
                value={appearance.template}
                onChange={(event) =>
                  selectTemplate(event.target.value as TemplateStyle)
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
            <div className="density-control">
              <div className="density-label-row">
                <span>版面密度</span>
                {appearance.density.preset === "custom" && (
                  <span className="density-custom-pill">自定义</span>
                )}
              </div>
              <div className="density-preset-group" role="group" aria-label="版面密度预设">
                {DENSITY_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-label={option.label}
                    aria-pressed={appearance.density.preset === option.value}
                    className={
                      appearance.density.preset === option.value ? "selected" : ""
                    }
                    onClick={() => applyDensityPreset(option.value)}
                  >
                    <span className="density-preset-name">
                      {appearance.density.preset === option.value && <Check size={13} />}
                      {option.label}
                    </span>
                    <small>{option.summary}</small>
                  </button>
                ))}
              </div>
              <p className="style-hint density-hint">
                {appearance.density.preset === "custom"
                  ? "已使用自定义排版参数；点击任一预设可快速恢复成套设置。"
                  : DENSITY_OPTIONS.find(
                      (option) => option.value === appearance.density.preset,
                    )?.hint}
              </p>
            </div>

            <details className="density-advanced">
              <summary>
                <span>高级排版</span>
                <span>页边距、字号与间距</span>
              </summary>
              <div className="density-slider-list">
                <label className="density-slider">
                  <span>
                    上下页边距
                    <output>{appearance.density.page_margin_vertical_mm} mm</output>
                  </span>
                  <input
                    type="range"
                    aria-label="上下页边距"
                    min={DENSITY_LIMITS.pageMarginVerticalMm.min}
                    max={DENSITY_LIMITS.pageMarginVerticalMm.max}
                    step={DENSITY_LIMITS.pageMarginVerticalMm.step}
                    value={appearance.density.page_margin_vertical_mm}
                    style={densityRangeStyle(
                      appearance.density.page_margin_vertical_mm,
                      DENSITY_LIMITS.pageMarginVerticalMm.min,
                      DENSITY_LIMITS.pageMarginVerticalMm.max,
                    )}
                    onChange={(event) =>
                      updateDensity({ page_margin_vertical_mm: Number(event.target.value) })
                    }
                  />
                </label>
                <label className="density-slider">
                  <span>
                    左右页边距
                    <output>{appearance.density.page_margin_horizontal_mm} mm</output>
                  </span>
                  <input
                    type="range"
                    aria-label="左右页边距"
                    min={DENSITY_LIMITS.pageMarginHorizontalMm.min}
                    max={DENSITY_LIMITS.pageMarginHorizontalMm.max}
                    step={DENSITY_LIMITS.pageMarginHorizontalMm.step}
                    value={appearance.density.page_margin_horizontal_mm}
                    style={densityRangeStyle(
                      appearance.density.page_margin_horizontal_mm,
                      DENSITY_LIMITS.pageMarginHorizontalMm.min,
                      DENSITY_LIMITS.pageMarginHorizontalMm.max,
                    )}
                    onChange={(event) =>
                      updateDensity({ page_margin_horizontal_mm: Number(event.target.value) })
                    }
                  />
                </label>
                <label className="density-slider">
                  <span>
                    行间距
                    <output>{appearance.density.line_height.toFixed(2)}</output>
                  </span>
                  <input
                    type="range"
                    aria-label="行间距"
                    min={DENSITY_LIMITS.lineHeight.min}
                    max={DENSITY_LIMITS.lineHeight.max}
                    step={DENSITY_LIMITS.lineHeight.step}
                    value={appearance.density.line_height}
                    style={densityRangeStyle(
                      appearance.density.line_height,
                      DENSITY_LIMITS.lineHeight.min,
                      DENSITY_LIMITS.lineHeight.max,
                    )}
                    onChange={(event) =>
                      updateDensity({ line_height: Number(event.target.value) })
                    }
                  />
                </label>
                <label className="density-slider">
                  <span>
                    段间距
                    <output>{appearance.density.paragraph_spacing_percent}%</output>
                  </span>
                  <input
                    type="range"
                    aria-label="段间距"
                    min={DENSITY_LIMITS.paragraphSpacingPercent.min}
                    max={DENSITY_LIMITS.paragraphSpacingPercent.max}
                    step={DENSITY_LIMITS.paragraphSpacingPercent.step}
                    value={appearance.density.paragraph_spacing_percent}
                    style={densityRangeStyle(
                      appearance.density.paragraph_spacing_percent,
                      DENSITY_LIMITS.paragraphSpacingPercent.min,
                      DENSITY_LIMITS.paragraphSpacingPercent.max,
                    )}
                    onChange={(event) =>
                      updateDensity({
                        paragraph_spacing_percent: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label className="density-slider font-size-slider">
                  <span>
                    正文字号
                    <output>{appearance.density.font_size_pt.toFixed(1)} pt</output>
                  </span>
                  <input
                    type="range"
                    aria-label="正文字号"
                    min={DENSITY_LIMITS.fontSizePt.min}
                    max={DENSITY_LIMITS.fontSizePt.max}
                    step={DENSITY_LIMITS.fontSizePt.step}
                    value={appearance.density.font_size_pt}
                    style={densityRangeStyle(
                      appearance.density.font_size_pt,
                      DENSITY_LIMITS.fontSizePt.min,
                      DENSITY_LIMITS.fontSizePt.max,
                    )}
                    onChange={(event) =>
                      updateDensity({ font_size_pt: Number(event.target.value) })
                    }
                  />
                  <small>建议最后调整；优先压缩页边距和段落留白。</small>
                </label>
                <label className="density-slider font-size-slider">
                  <span>
                    条目标题字号
                    <output>
                      {appearance.density.item_title_font_size_pt.toFixed(1)} pt
                    </output>
                  </span>
                  <input
                    type="range"
                    aria-label="条目标题字号"
                    min={DENSITY_LIMITS.itemTitleFontSizePt.min}
                    max={DENSITY_LIMITS.itemTitleFontSizePt.max}
                    step={DENSITY_LIMITS.itemTitleFontSizePt.step}
                    value={appearance.density.item_title_font_size_pt}
                    style={densityRangeStyle(
                      appearance.density.item_title_font_size_pt,
                      DENSITY_LIMITS.itemTitleFontSizePt.min,
                      DENSITY_LIMITS.itemTitleFontSizePt.max,
                    )}
                    onChange={(event) =>
                      updateDensity({
                        item_title_font_size_pt: Number(event.target.value),
                      })
                    }
                  />
                  <small>建议比正文字号大 1–2 pt，以保持条目与要点的层级。</small>
                </label>
              </div>
              {(appearance.density.font_size_pt < 10 ||
                appearance.density.line_height < 1.34) && (
                <p className="density-caution" role="note">
                  当前属于密集排版，导出后请按 100% 比例检查打印可读性。
                </p>
              )}
              {appearance.density.item_title_font_size_pt -
                appearance.density.font_size_pt <
                0.8 && (
                <p className="density-caution" role="note">
                  条目标题与正文字号过于接近，建议至少保留 0.8 pt 的层级差。
                </p>
              )}
              <button
                type="button"
                className="text-button compact density-reset"
                onClick={() => applyDensityPreset("standard")}
              >
                恢复标准密度
              </button>
            </details>
            <label className="styled-select-field">
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
                onOpenItemLibrary={() =>
                  void openContentLibrary({ mode: "item", sectionId: section.id })
                }
                onOpenBulletLibrary={(itemId) =>
                  void openContentLibrary({
                    mode: "bullet",
                    sectionId: section.id,
                    itemId,
                  })
                }
                onOpenItemVersions={() =>
                  void openContentLibrary(
                    { mode: "item", sectionId: section.id },
                    "versions",
                  )
                }
                onOpenBulletVersions={(itemId) =>
                  void openContentLibrary(
                    {
                      mode: "bullet",
                      sectionId: section.id,
                      itemId,
                    },
                    "versions",
                  )
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
            <span
              className={`page-pill${
                pageCount === 1 ? " success" : pageCount > 2 ? " danger" : pageCount > 1 ? " warning" : ""
              }`}
            >
              {pageCount === 1
                ? "1 页 · 单页完成"
                : pageCount === 2
                  ? "2 页 · 超出单页"
                  : pageCount > 2
                    ? `${pageCount} 页 · 建议精简`
                    : "– 页"}
            </span>
          </div>
          <PagedPreview document={document} onPageCount={setPageCount} />
        </section>
      </div>
    </main>
  );
}
