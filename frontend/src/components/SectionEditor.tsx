import { useState, type ReactNode } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import type { ResumeBullet, ResumeItem, ResumeSection, TextStyle } from "../types";
import { plain, rich, styleRichText, uid } from "../utils";
import { SortableList } from "./SortableList";

type Props = {
  section: ResumeSection;
  handle: ReactNode;
  onChange: (section: ResumeSection) => void;
  onDeleteSection: () => void;
  onDeleteItem: (itemId: string) => void;
  onDeleteBullet: (itemId: string, bulletId: string) => void;
};

function emptyItem(): ResumeItem {
  return {
    id: uid(),
    title: [],
    subtitle: [],
    title_style: { bold: true, italic: false },
    subtitle_style: { bold: false, italic: true },
    date: "",
    bullets: [],
  };
}

function emptyBullet(): ResumeBullet {
  return { id: uid(), content: [] };
}

export function SectionEditor({
  section,
  handle,
  onChange,
  onDeleteSection,
  onDeleteItem,
  onDeleteBullet,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  function updateItem(next: ResumeItem) {
    onChange({
      ...section,
      items: section.items.map((item) => (item.id === next.id ? next : item)),
    });
  }

  function renderBullet(item: ResumeItem, bullet: ResumeBullet, bulletHandle: ReactNode) {
    return (
      <div className="bullet-editor">
        {bulletHandle}
        <textarea
          value={plain(bullet.content)}
          rows={2}
          aria-label="描述要点"
          placeholder="输入一条成果或职责"
          onChange={(event) =>
            updateItem({
              ...item,
              bullets: item.bullets.map((value) =>
                value.id === bullet.id
                  ? { ...value, content: rich(event.target.value) }
                  : value,
              ),
            })
          }
        />
        <button
          type="button"
          className="icon-button danger subtle"
          aria-label="删除要点"
          onClick={() => onDeleteBullet(item.id, bullet.id)}
        >
          <Trash2 size={15} />
        </button>
      </div>
    );
  }

  function renderStyleControls(
    label: string,
    style: TextStyle,
    onChange: (style: TextStyle) => void,
  ) {
    return (
      <div className="format-controls" aria-label={`${label}样式`}>
        <span>{label}</span>
        <label>
          <input
            type="checkbox"
            checked={style.bold}
            onChange={(event) => onChange({ ...style, bold: event.target.checked })}
          />
          加粗
        </label>
        <label>
          <input
            type="checkbox"
            checked={style.italic}
            onChange={(event) => onChange({ ...style, italic: event.target.checked })}
          />
          斜体
        </label>
      </div>
    );
  }

  function renderItem(item: ResumeItem, itemHandle: ReactNode) {
    const titleStyle = item.title_style ?? { bold: true, italic: false };
    const subtitleStyle = item.subtitle_style ?? { bold: false, italic: true };
    return (
      <div className="item-editor">
        <div className="item-editor-heading">
          {itemHandle}
          <span>子条目</span>
          <button
            type="button"
            className="icon-button danger subtle"
            aria-label="删除条目"
            onClick={() => onDeleteItem(item.id)}
          >
            <Trash2 size={16} />
          </button>
        </div>
        <div className="field-grid two-columns">
          <label>
            名称
            <textarea
              value={plain(item.title)}
              rows={2}
              placeholder="如：车险纯保费建模项目"
              onChange={(event) =>
                updateItem({
                  ...item,
                  title_style: titleStyle,
                  title: rich(event.target.value, titleStyle),
                })
              }
            />
          </label>
          <label>
            时间
            <input
              value={item.date}
              placeholder="2025.12-2026.01"
              onChange={(event) => updateItem({ ...item, date: event.target.value })}
            />
          </label>
        </div>
        <label>
          单位、角色或副标题
          <textarea
            value={plain(item.subtitle)}
            rows={2}
            placeholder="如：广义线性模型课程报告"
            onChange={(event) =>
              updateItem({
                ...item,
                subtitle_style: subtitleStyle,
                subtitle: rich(event.target.value, subtitleStyle),
              })
            }
          />
        </label>
        <div className="format-control-row">
          {renderStyleControls("主标题", titleStyle, (style) =>
            updateItem({
              ...item,
              title_style: style,
              title: styleRichText(item.title, style),
            }),
          )}
          {renderStyleControls("副标题", subtitleStyle, (style) =>
            updateItem({
              ...item,
              subtitle_style: style,
              subtitle: styleRichText(item.subtitle, style),
            }),
          )}
        </div>
        <SortableList
          items={item.bullets}
          className="bullet-list-editor"
          onChange={(bullets) => updateItem({ ...item, bullets })}
          renderItem={(bullet, bulletHandle) => renderBullet(item, bullet, bulletHandle)}
        />
        <button
          type="button"
          className="text-button compact"
          onClick={() => updateItem({ ...item, bullets: [...item.bullets, emptyBullet()] })}
        >
          <Plus size={14} /> 添加要点
        </button>
      </div>
    );
  }

  return (
    <section className="section-editor">
      <div className="section-editor-heading">
        {handle}
        <button
          type="button"
          className={expanded ? "section-toggle expanded" : "section-toggle"}
          aria-label={expanded ? "收起模块" : "展开模块"}
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          <ChevronDown size={16} />
        </button>
        <input
          className="section-title-input"
          value={section.title}
          aria-label="模块标题"
          onChange={(event) => onChange({ ...section, title: event.target.value })}
        />
        <button
          type="button"
          className="icon-button danger"
          aria-label="删除模块"
          onClick={onDeleteSection}
        >
          <Trash2 size={16} />
        </button>
      </div>
      {expanded && (
        <div className="section-editor-body">
          <SortableList
            items={section.items}
            className="item-list-editor"
            onChange={(items) => onChange({ ...section, items })}
            renderItem={renderItem}
          />
          <button
            type="button"
            className="text-button"
            onClick={() => onChange({ ...section, items: [...section.items, emptyItem()] })}
          >
            <Plus size={15} /> 添加子条目
          </button>
        </div>
      )}
    </section>
  );
}
