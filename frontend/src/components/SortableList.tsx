import type { ReactNode } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

type WithId = { id: string };

type SortableListProps<T extends WithId> = {
  items: T[];
  onChange: (items: T[]) => void;
  renderItem: (item: T, handle: ReactNode) => ReactNode;
  className?: string;
};

function SortableRow<T extends WithId>({
  item,
  renderItem,
}: {
  item: T;
  renderItem: SortableListProps<T>["renderItem"];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "sortable-row is-dragging" : "sortable-row"}
    >
      {renderItem(
        item,
        <button
          type="button"
          className="drag-handle"
          aria-label="拖动排序"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} />
        </button>,
      )}
    </div>
  );
}

export function SortableList<T extends WithId>({
  items,
  onChange,
  renderItem,
  className,
}: SortableListProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = items.findIndex((item) => item.id === active.id);
    const to = items.findIndex((item) => item.id === over.id);
    if (from >= 0 && to >= 0) onChange(arrayMove(items, from, to));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        <div className={className}>
          {items.map((item) => (
            <SortableRow item={item} renderItem={renderItem} key={item.id} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

