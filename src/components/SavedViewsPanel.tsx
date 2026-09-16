"use client";

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState, useEffect, useCallback } from "react";
import { useI18n } from "./I18nProvider";

interface SavedViewsPanelProps {
  savedViews: unknown[];
  activeViewId: string | null;
  activeViewDirty: boolean;
  onApply: (view: unknown) => void;
  onDelete: (viewId: string) => void;
  onReorder: (viewIds: string[]) => void;
  onSave: (name: string) => void;
  onSaveChanges: () => void;
  onRevert: () => void;
  viewDraftName: string;
  setViewDraftName: (name: string) => void;
}

interface SavedViewItem {
  id: string;
  name: string;
  position?: number;
}

function SortableViewPill({
  view,
  isActive,
  onClick,
  onDelete,
  isDeletePending,
  onDeleteRequest,
}: {
  view: SavedViewItem;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
  isDeletePending: boolean;
  onDeleteRequest: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: view.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    cursor: isDragging ? "grabbing" : "grab",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`saved-view-pill ${isActive ? "active" : ""} ${isDragging ? "dragging" : ""}`}
      {...attributes}
      {...listeners}
    >
      <button
        type="button"
        className="saved-view-apply"
        onClick={onClick}
        aria-pressed={isActive}
      >
        {view.name}
      </button>
      <button
        type="button"
        className={`saved-view-delete ${isDeletePending ? "confirm" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          if (isDeletePending) {
            onDelete();
          } else {
            onDeleteRequest();
          }
        }}
        aria-label={isDeletePending ? `Confirm delete ${view.name}` : `Delete ${view.name}`}
      >
        {isDeletePending ? "Confirm" : "×"}
      </button>
    </div>
  );
}

export function SavedViewsPanel({
  savedViews,
  activeViewId,
  activeViewDirty,
  onApply,
  onDelete,
  onReorder,
  onSave,
  onSaveChanges,
  onRevert,
  viewDraftName,
  setViewDraftName,
}: SavedViewsPanelProps) {
  const { t } = useI18n();
  const [localViews, setLocalViews] = useState<SavedViewItem[]>([]);
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // Sync local state with props. localViews is independently mutated during
  // drag-reorder (see setLocalViews below), so it can't be pure derived
  // state — it needs to re-sync only when the savedViews prop itself changes.
  useEffect(() => {
    const views = (savedViews as SavedViewItem[]).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalViews(views);
    setPendingDeleteId(null);
  }, [savedViews]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (over && active.id !== over.id) {
        setLocalViews((items) => {
          const oldIndex = items.findIndex((item) => item.id === active.id);
          const newIndex = items.findIndex((item) => item.id === over.id);
          const newItems = arrayMove(items, oldIndex, newIndex);

          // Notify parent of new order
          const newOrder = newItems.map((v) => v.id);
          onReorder(newOrder);

          return newItems;
        });
      }
    },
    [onReorder]
  );

  const handleSave = useCallback(() => {
    if (viewDraftName.trim()) {
      onSave(viewDraftName.trim());
      setViewDraftName("");
    }
  }, [viewDraftName, onSave, setViewDraftName]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleSave();
      }
    },
    [handleSave]
  );

  return (
    <div className="saved-view-panel">
      <div className="saved-view-header">
        <span className="saved-view-title">{t('savedViews.title')}</span>
        {activeViewDirty && (
          <span className="saved-view-dirty" role="status">
            {t('savedViews.modified', 'Modified')}
          </span>
        )}
        {activeViewDirty && (
          <div className="saved-view-dirty-actions">
            <button type="button" className="link-button" onClick={onRevert}>
              {t('savedViews.revert', 'Revert')}
            </button>
            <button type="button" className="secondary-button" onClick={onSaveChanges}>
              {t('savedViews.saveChanges', 'Save changes')}
            </button>
          </div>
        )}
        {savedViews.length > 1 && (
          <button
            type="button"
            className={`reorder-toggle ${isReorderMode ? "active" : ""}`}
            onClick={() => setIsReorderMode(!isReorderMode)}
            aria-label={isReorderMode ? t('savedViews.done') : t('savedViews.reorder')}
          >
            {isReorderMode ? t('savedViews.done') : t('savedViews.reorder')}
          </button>
        )}
      </div>

      <div className="saved-view-row">
        <label className="view-name-field">
          {t('savedViews.saveCurrent')}
          <input
            placeholder={t('savedViews.placeholder')}
            value={viewDraftName}
            onChange={(e) => setViewDraftName(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </label>
        <button type="button" className="secondary-button" onClick={handleSave} disabled={!viewDraftName.trim()}>
          {t('savedViews.saveView')}
        </button>

        {savedViews.length > 0 ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext
              items={localViews.map((v) => v.id)}
              strategy={horizontalListSortingStrategy}
            >
              <div className="chip-row saved-view-chips">
                {localViews.map((view) => (
                  <SortableViewPill
                    key={view.id}
                    view={view}
                    isActive={activeViewId === view.id}
                    onClick={() => {
                      setPendingDeleteId(null);
                      onApply(view);
                    }}
                    onDelete={() => {
                      setPendingDeleteId(null);
                      onDelete(view.id);
                    }}
                    isDeletePending={pendingDeleteId === view.id}
                    onDeleteRequest={() => setPendingDeleteId(view.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <div className="chip-row saved-view-chips">
            <span className="muted">{t('savedViews.noViews')}</span>
          </div>
        )}
      </div>
    </div>
  );
}
