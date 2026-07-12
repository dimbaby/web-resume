import { useEffect, useState } from "react";
import { ArrowLeft, Check, FileWarning, Trash2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { ConfirmDialog } from "../components/ConfirmDialog";
import type { ResumeDocument } from "../types";
import { plain, rich } from "../utils";

export function ImportReviewPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [document, setDocument] = useState<ResumeDocument | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [destinations, setDestinations] = useState<Record<string, string>>({});

  useEffect(() => {
    api.get(id).then(setDocument).catch((reason: Error) => setError(reason.message));
  }, [id]);

  async function confirmImport() {
    if (!document) return;
    setSaving(true);
    setError("");
    try {
      const hasUnresolved = document.sections.some(
        (section) => section.kind === "unresolved" && section.items.length > 0,
      );
      const saved = await api.save({
        ...document,
        warnings: hasUnresolved ? document.warnings : [],
      });
      navigate(`/edit/${saved.id}`, { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存导入结果失败");
    } finally {
      setSaving(false);
    }
  }

  async function cancelImport() {
    if (!document) return;
    setSaving(true);
    try {
      await api.remove(document.id, document.revision);
      navigate("/", { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "取消导入失败");
    } finally {
      setSaving(false);
      setCancelOpen(false);
    }
  }

  function updateUnresolvedItem(itemId: string, value: string) {
    setDocument((current) =>
      current
        ? {
            ...current,
            sections: current.sections.map((section) =>
              section.kind === "unresolved"
                ? {
                    ...section,
                    items: section.items.map((item) =>
                      item.id === itemId
                        ? {
                            ...item,
                            bullets: item.bullets.length
                              ? [{ ...item.bullets[0], content: rich(value) }]
                              : item.bullets,
                          }
                        : item,
                    ),
                  }
                : section,
            ),
          }
        : current,
    );
  }

  function removeUnresolvedItem(itemId: string) {
    setDocument((current) => {
      if (!current) return current;
      const sections = current.sections
        .map((section) =>
          section.kind === "unresolved"
            ? { ...section, items: section.items.filter((item) => item.id !== itemId) }
            : section,
        )
        .filter((section) => section.kind !== "unresolved" || section.items.length > 0);
      return { ...current, sections };
    });
  }

  function moveUnresolvedItem(itemId: string) {
    const targetId = destinations[itemId];
    if (!targetId) return;
    setDocument((current) => {
      if (!current) return current;
      const unresolvedSection = current.sections.find((section) => section.kind === "unresolved");
      const item = unresolvedSection?.items.find((value) => value.id === itemId);
      if (!item) return current;
      const sections = current.sections
        .map((section) => {
          if (section.kind === "unresolved") {
            return { ...section, items: section.items.filter((value) => value.id !== itemId) };
          }
          if (section.id === targetId) {
            return { ...section, items: [...section.items, item] };
          }
          return section;
        })
        .filter((section) => section.kind !== "unresolved" || section.items.length > 0);
      return { ...current, sections };
    });
    setDestinations((current) => {
      const next = { ...current };
      delete next[itemId];
      return next;
    });
  }

  if (error && !document) {
    return (
      <main className="center-state">
        <div className="error-banner">{error}</div>
        <button type="button" className="text-button" onClick={() => navigate("/")}>
          返回版本库
        </button>
      </main>
    );
  }
  if (!document) return <main className="center-state">正在检查导入结果…</main>;

  const unresolved = document.sections.find((section) => section.kind === "unresolved");

  return (
    <main className="import-review-page">
      <header className="import-review-header">
        <button
          type="button"
          className="icon-button"
          aria-label="返回版本库"
          onClick={() => navigate("/")}
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <span className="eyebrow">IMPORT REVIEW</span>
          <h1>核对导入结果</h1>
          <p>{document.source.filename}</p>
        </div>
        <button
          type="button"
          className="primary-button"
          disabled={saving}
          onClick={() => void confirmImport()}
        >
          <Check size={16} /> {saving ? "正在保存…" : "确认并进入编辑"}
        </button>
      </header>

      {error && <div className="error-banner">{error}</div>}
      {cancelOpen && (
        <ConfirmDialog
          title="放弃本次导入？"
          message="这份导入结果会移入回收站，之后仍可恢复。"
          confirmLabel="移入回收站"
          onCancel={() => setCancelOpen(false)}
          onConfirm={() => void cancelImport()}
        />
      )}

      <div className="import-review-layout">
        <section className="import-review-main">
          <div className="review-section">
            <div className="panel-title-row">
              <div>
                <span className="eyebrow">PROFILE</span>
                <h2>基本信息</h2>
              </div>
              {document.profile.photo_url && (
                <img
                  className="review-photo"
                  src={document.profile.photo_url}
                  alt="导入的证件照"
                />
              )}
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
          </div>

          <div className="review-section">
            <div className="panel-title-row">
              <div>
                <span className="eyebrow">SECTIONS</span>
                <h2>识别到的模块</h2>
              </div>
              <span className="count-pill">{document.sections.length} 个</span>
            </div>
            <div className="review-section-list">
              {document.sections.map((section) => (
                <div className={section.kind === "unresolved" ? "needs-review" : ""} key={section.id}>
                  <strong>{section.title}</strong>
                  <span>{section.items.length} 个条目</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <aside className="import-review-aside">
          <div className="review-section">
            <div className="review-warning-title">
              <FileWarning size={18} />
              <h2>需要确认</h2>
            </div>
            {document.warnings.length > 0 ? (
              document.warnings.map((warning) => <p key={warning}>{warning}</p>)
            ) : (
              <p>没有解析警告。</p>
            )}
          </div>

          {unresolved && (
            <div className="review-section unresolved-review">
              <h2>待确认内容</h2>
              {unresolved.items.map((item) => (
                <div className="unresolved-review-item" key={item.id}>
                  <textarea
                    rows={3}
                    aria-label="待确认内容"
                    value={item.bullets.map((bullet) => plain(bullet.content)).join(" ")}
                    onChange={(event) => updateUnresolvedItem(item.id, event.target.value)}
                  />
                  <div className="unresolved-review-actions">
                    <select
                      aria-label="目标模块"
                      value={destinations[item.id] ?? ""}
                      onChange={(event) =>
                        setDestinations((current) => ({
                          ...current,
                          [item.id]: event.target.value,
                        }))
                      }
                    >
                      <option value="">选择目标模块</option>
                      {document.sections
                        .filter((section) => section.kind !== "unresolved")
                        .map((section) => (
                          <option key={section.id} value={section.id}>
                            {section.title}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={!destinations[item.id]}
                      onClick={() => moveUnresolvedItem(item.id)}
                    >
                      移入模块
                    </button>
                    <button
                      type="button"
                      className="icon-button danger subtle"
                      aria-label="删除待确认内容"
                      onClick={() => removeUnresolvedItem(item.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            className="text-button danger-text abandon-import-button"
            disabled={saving}
            onClick={() => setCancelOpen(true)}
          >
            <Trash2 size={15} /> 放弃本次导入
          </button>
        </aside>
      </div>
    </main>
  );
}
