import { BookOpen, Files, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { bulletFingerprint, itemFingerprint } from "../contentLibrary";
import type {
  LibraryEntry,
  ResumeBullet,
  ResumeDocument,
  SectionKind,
} from "../types";
import { plain } from "../utils";

export type ContentLibraryTarget =
  | { mode: "item"; sectionId: string }
  | { mode: "bullet"; sectionId: string; itemId: string };

export type ContentSourceMode = "library" | "versions";

type Props = {
  document: ResumeDocument;
  entries: LibraryEntry[];
  versions?: ResumeDocument[];
  initialSource?: ContentSourceMode;
  target: ContentLibraryTarget;
  loading: boolean;
  error: string;
  notice: string;
  onClose: () => void;
  onRetry: () => void;
  onAddItem: (entry: LibraryEntry) => void;
  onAddBullet: (entry: LibraryEntry, bullet: ResumeBullet) => void;
};

const KIND_OPTIONS: Array<{ value: SectionKind | "all"; label: string }> = [
  { value: "all", label: "全部模块" },
  { value: "education", label: "教育经历" },
  { value: "experience", label: "实习 / 工作" },
  { value: "project", label: "项目经历" },
  { value: "skills", label: "技能" },
  { value: "awards", label: "奖项" },
  { value: "campus", label: "校园经历" },
  { value: "custom", label: "自定义模块" },
  { value: "unresolved", label: "待确认内容" },
];

function entrySearchText(entry: LibraryEntry) {
  return [
    entry.section_title,
    entry.source_resume_title,
    entry.source_filename,
    plain(entry.item.title),
    plain(entry.item.subtitle),
    entry.item.date,
    ...entry.item.bullets.map((bullet) => plain(bullet.content)),
  ]
    .join("\n")
    .toLocaleLowerCase();
}

export function ContentLibraryDialog({
  document,
  entries,
  versions = [],
  initialSource = "library",
  target,
  loading,
  error,
  notice,
  onClose,
  onRetry,
  onAddItem,
  onAddBullet,
}: Props) {
  const targetSection = document.sections.find((section) => section.id === target.sectionId);
  const targetItem =
    target.mode === "bullet"
      ? targetSection?.items.find((item) => item.id === target.itemId)
      : undefined;
  const initialKind =
    targetSection?.kind && targetSection.kind !== "custom" ? targetSection.kind : "all";
  const availableVersions = useMemo(
    () => versions.filter((version) => version.id !== document.id),
    [document.id, versions],
  );
  const versionEntries = useMemo(
    () =>
      availableVersions.flatMap((version) =>
        version.sections.flatMap((section) =>
          section.items.map((item) => ({
            id: `version-${version.id}-${section.id}-${item.id}`,
            section_kind: section.kind,
            section_title: section.title,
            item,
            source_resume_id: version.id,
            source_resume_title: version.title,
            source_filename: version.source.filename,
            created_at: version.created_at,
            updated_at: version.updated_at,
          })),
        ),
      ),
    [availableVersions],
  );
  const [sourceMode, setSourceMode] = useState<ContentSourceMode>(initialSource);
  const [selectedVersionId, setSelectedVersionId] = useState(
    availableVersions[0]?.id ?? "",
  );
  const [kind, setKind] = useState<SectionKind | "all">(initialKind);
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  useEffect(() => {
    if (
      !selectedVersionId ||
      !availableVersions.some((version) => version.id === selectedVersionId)
    ) {
      setSelectedVersionId(availableVersions[0]?.id ?? "");
    }
  }, [availableVersions, selectedVersionId]);
  const sourceEntries =
    sourceMode === "library"
      ? entries
      : versionEntries.filter((entry) => entry.source_resume_id === selectedVersionId);
  const filteredEntries = useMemo(
    () =>
      sourceEntries.filter((entry) => {
        if (kind !== "all" && entry.section_kind !== kind) return false;
        if (target.mode === "bullet" && entry.item.bullets.length === 0) return false;
        return !normalizedQuery || entrySearchText(entry).includes(normalizedQuery);
      }),
    [kind, normalizedQuery, sourceEntries, target.mode],
  );

  const destination =
    target.mode === "item"
      ? targetSection?.title || "当前模块"
      : plain(targetItem?.title ?? []) || "当前条目";

  return (
    <div className="modal-backdrop content-library-backdrop">
      <section
        className="content-library-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="内容选择"
      >
        <header className="content-library-header">
          <div className="content-library-title">
            <span className="content-library-icon">
              {sourceMode === "library" ? <BookOpen size={19} /> : <Files size={19} />}
            </span>
            <div>
              <span className="eyebrow">REUSABLE RESUME CONTENT</span>
              <h2>{sourceMode === "library" ? "个人内容库" : "其他简历版本"}</h2>
              <p>
                {target.mode === "item" ? "添加完整条目到" : "补充历史要点到"}
                <strong>「{destination}」</strong>
              </p>
            </div>
          </div>
          <button type="button" className="icon-button subtle" aria-label="关闭内容选择" onClick={onClose}>
            <X size={19} />
          </button>
        </header>

        <div className="content-source-tabs" role="group" aria-label="选择内容来源">
          <button
            type="button"
            className={sourceMode === "library" ? "selected" : ""}
            aria-pressed={sourceMode === "library"}
            onClick={() => setSourceMode("library")}
          >
            <BookOpen size={14} /> 个人内容库
          </button>
          <button
            type="button"
            className={sourceMode === "versions" ? "selected" : ""}
            aria-pressed={sourceMode === "versions"}
            onClick={() => setSourceMode("versions")}
          >
            <Files size={14} /> 其他简历版本
          </button>
        </div>

        <div
          className={
            sourceMode === "versions"
              ? "content-library-toolbar with-version-filter"
              : "content-library-toolbar"
          }
        >
          {sourceMode === "versions" && (
            <select
              value={selectedVersionId}
              aria-label="选择简历版本"
              onChange={(event) => setSelectedVersionId(event.target.value)}
            >
              {availableVersions.length === 0 && <option value="">暂无其他版本</option>}
              {availableVersions.map((version) => (
                <option key={version.id} value={version.id}>
                  {version.title}
                </option>
              ))}
            </select>
          )}
          <label className="library-search-field">
            <Search size={15} />
            <input
              value={query}
              aria-label={
                sourceMode === "library" ? "搜索个人内容库" : "搜索其他简历版本"
              }
              placeholder={
                sourceMode === "library"
                  ? "搜索项目、单位、时间、关键词或来源文件"
                  : "搜索所选版本中的项目、单位、时间或关键词"
              }
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <select
            value={kind}
            aria-label="筛选内容库模块"
            onChange={(event) => setKind(event.target.value as SectionKind | "all")}
          >
            {KIND_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="content-library-status-row">
          <span>{loading ? "正在读取…" : `${filteredEntries.length} 个可用条目`}</span>
          <span>
            {sourceMode === "library"
              ? "内容库独立保存，当前版本删除内容不会影响这里。"
              : "从其他版本复制后生成独立内容，后续修改互不影响。"}
          </span>
        </div>

        {error && (
          <div className="content-library-error">
            <span>{error}</span>
            <button type="button" className="text-button compact" onClick={onRetry}>
              重试
            </button>
          </div>
        )}
        {notice && <div className="content-library-notice">{notice}</div>}

        <div className="content-library-list">
          {!loading &&
            !error &&
            sourceMode === "versions" &&
            availableVersions.length === 0 && (
              <div className="content-library-empty">
                <Files size={24} />
                <strong>没有其他简历版本</strong>
                <span>可以先在版本库复制一份简历，再从版本间选择内容。</span>
              </div>
            )}
          {!loading && !error && filteredEntries.length === 0 && (
            sourceMode !== "versions" || availableVersions.length > 0 ? (
              <div className="content-library-empty">
                <BookOpen size={24} />
                <strong>没有符合条件的内容</strong>
                <span>可以清除搜索、切换模块，或选择其他简历版本。</span>
              </div>
            ) : null
          )}
          {filteredEntries.map((entry) => {
            const title = plain(entry.item.title).trim() || "未命名条目";
            const duplicateItem =
              target.mode === "item" &&
              Boolean(
                targetSection?.items.some(
                  (item) => itemFingerprint(item) === itemFingerprint(entry.item),
                ),
              );
            return (
              <article className="content-library-card" key={entry.id}>
                <div className="content-library-card-header">
                  <div>
                    <span className="library-kind-pill">{entry.section_title}</span>
                    <h3>{title}</h3>
                    <p>
                      {[plain(entry.item.subtitle).trim(), entry.item.date]
                        .filter(Boolean)
                        .join(" · ") || "无副标题和时间"}
                    </p>
                  </div>
                  {target.mode === "item" && (
                    <button
                      type="button"
                      className="secondary-button library-add-item"
                      aria-label={`添加条目：${title}`}
                      disabled={duplicateItem}
                      onClick={() => onAddItem(entry)}
                    >
                      <Plus size={15} /> {duplicateItem ? "当前模块已有" : "加入条目"}
                    </button>
                  )}
                </div>

                {entry.item.bullets.length > 0 && (
                  <div className="content-library-bullets">
                    {entry.item.bullets.map((bullet) => {
                      const bulletText = plain(bullet.content).trim();
                      const duplicateBullet = Boolean(
                        targetItem?.bullets.some(
                          (value) => bulletFingerprint(value) === bulletFingerprint(bullet),
                        ),
                      );
                      return (
                        <div className="content-library-bullet" key={bullet.id}>
                          <span>{bulletText || "空要点"}</span>
                          {target.mode === "bullet" && (
                            <button
                              type="button"
                              className="text-button compact"
                              aria-label={`添加要点：${bulletText || "空要点"}`}
                              disabled={duplicateBullet || !bulletText}
                              onClick={() => onAddBullet(entry, bullet)}
                            >
                              <Plus size={13} /> {duplicateBullet ? "已存在" : "加入"}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                <footer className="content-library-source">
                  来源：{entry.source_resume_title || entry.source_filename || "已导入简历"}
                  {entry.source_filename && entry.source_resume_title
                    ? ` · ${entry.source_filename}`
                    : ""}
                </footer>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
