import React from "react";
import { DragDropContext, Droppable, Draggable, type DraggableProvidedDragHandleProps, type DropResult } from "@hello-pangea/dnd";

/** A vertical list the user can reorder by dragging a handle. Reordering only
 *  happens inside one list; moving an item elsewhere is a separate control. */
export default function SortableList<T extends { id: string }>({
  listId, items, onReorder, renderItem,
}: {
  listId: string;
  items: T[];
  onReorder: (ids: string[]) => void;
  renderItem: (item: T, handle: DraggableProvidedDragHandleProps | null | undefined, dragging: boolean) => React.ReactNode;
}) {
  const onDragEnd = (result: DropResult) => {
    if (!result.destination || result.destination.index === result.source.index) return;
    const ids = items.map((i) => i.id);
    const [moved] = ids.splice(result.source.index, 1);
    ids.splice(result.destination.index, 0, moved);
    onReorder(ids);
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
                  return (
                    <div ref={drag.innerRef} {...props} style={style as React.CSSProperties}>
                      {renderItem(item, drag.dragHandleProps, snapshot.isDragging)}
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
