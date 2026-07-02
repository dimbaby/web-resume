import { useState, type ReactNode } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import type { ResumeBullet, ResumeItem, ResumeSection } from "../types";
import { plain, rich, uid } from "../utils";
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
  return { id: uid(), title: [], subtitle: [], date: "", bullets: [] };
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

  function renderItem(item: ResumeItem, itemHandle: ReactNode) {
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
            <input
              value={plain(item.title)}
              placeholder="如：车险纯保费建模项目"
              onChange={(event) => updateItem({ ...item, title: rich(event.target.value) })}
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
          <input
            value={plain(item.subtitle)}
            placeholder="如：广义线性模型课程报告"
            onChange={(event) => updateItem({ ...item, subtitle: rich(event.target.value) })}
          />
        </label>
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
