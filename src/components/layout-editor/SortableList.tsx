import React from "react";
import { DragDropContext, Droppable, Draggable, type DraggableProvidedDragHandleProps, type DropResult } from "@hello-pangea/dnd";

export interface RowMove {
  up: (() => void) | null;
  down: (() => void) | null;
}

/** A vertical list the user can reorder by dragging a handle, or (for touch,
 *  where dragging fights with scrolling) with the move up/down buttons the
 *  row gets. Reordering only happens inside one list; moving an item
 *  elsewhere is a separate control. */
export default function SortableList<T extends { id: string }>({
  listId, items, onReorder, renderItem,
}: {
  listId: string;
  items: T[];
  onReorder: (ids: string[]) => void;
  renderItem: (item: T, handle: DraggableProvidedDragHandleProps | null | undefined, dragging: boolean, move: RowMove) => React.ReactNode;
}) {
  const reorder = (from: number, to: number) => {
    if (to < 0 || to >= items.length || from === to) return;
    const ids = items.map((i) => i.id);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    onReorder(ids);
  };
  const onDragEnd = (result: DropResult) => {
    if (result.destination) reorder(result.source.index, result.destination.index);
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <Droppable droppableId={listId}>
        {(drop) => (
          <div ref={drop.innerRef} {...drop.droppableProps} className="space-y-1.5">
            {items.map((item, index) => (
              <Draggable key={item.id} draggableId={item.id} index={index}>
                {(drag, snapshot) => {
                  // The library's style type clashes with the app's CSSProperties augmentation.
                  const { style, ...props } = drag.draggableProps;
                  const move: RowMove = {
                    up: index > 0 ? () => reorder(index, index - 1) : null,
                    down: index < items.length - 1 ? () => reorder(index, index + 1) : null,
                  };
                  return (
                    <div ref={drag.innerRef} {...props} style={style as React.CSSProperties}>
                      {renderItem(item, drag.dragHandleProps, snapshot.isDragging, move)}
                    </div>
                  );
                }}
              </Draggable>
            ))}
            {drop.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
}
