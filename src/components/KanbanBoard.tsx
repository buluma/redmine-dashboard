"use client";

import React, { useMemo, useState } from "react";
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  DragOverlay,
  defaultDropAnimationSideEffects,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export interface BoardIssue {
  id: string;
  redmineIssueId: number;
  subject: string;
  projectName: string | null;
  priority: string | null;
  statusId: number;
  statusName: string;
  doneRatio: number | null;
}

export interface BoardStatus {
  id: number;
  name: string;
}

interface KanbanBoardProps {
  issues: BoardIssue[];
  statuses: BoardStatus[];
  onDrop: (issueId: number, targetStatusId: number) => void;
  onClick: (issue: BoardIssue) => void;
}

function SortableIssueCard({ issue, onClick }: { issue: BoardIssue; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: issue.id,
    data: {
      type: "Issue",
      issue,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="card kanban-card gap-1 flex-col"
      onClick={onClick}
      {...attributes}
      {...listeners}
    >
      <div className="flex justify-between items-start gap-2">
        <span className="text-xs muted font-mono">#{issue.redmineIssueId}</span>
        {issue.priority && (
          <span className={`priority-badge priority-${issue.priority.toLowerCase().replace(/\s+/g, "-")}`}>
            {issue.priority}
          </span>
        )}
      </div>
      <div className="kanban-card-title text-sm">{issue.subject}</div>
      <div className="flex justify-between items-center mt-2">
        <span className="text-xs muted">{issue.projectName}</span>
        {issue.doneRatio !== null && (
          <span className="text-xs badge badge-secondary">{issue.doneRatio}%</span>
        )}
      </div>
    </div>
  );
}

function KanbanColumn({ status, issues, onClick }: { status: BoardStatus; issues: BoardIssue[]; onClick: (issue: BoardIssue) => void }) {
  const { setNodeRef } = useSortable({
    id: `status-${status.id}`,
    data: {
      type: "Column",
      status,
    },
  });

  const issueIds = useMemo(() => issues.map((i) => i.id), [issues]);

  return (
    <div className="kanban-column flex-col gap-2">
      <div className="kanban-column-header shadow flex justify-between items-center mb-2 px-2">
        <h3 className="m-0 text-sm">{status.name}</h3>
        <span className="badge">{issues.length}</span>
      </div>
      <div ref={setNodeRef} className="kanban-column-content flex-col gap-3 min-h-[300px] p-1">
        <SortableContext items={issueIds} strategy={verticalListSortingStrategy}>
          {issues.map((issue) => (
            <SortableIssueCard key={issue.id} issue={issue} onClick={() => onClick(issue)} />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}

export function KanbanBoard({ issues, statuses, onDrop, onClick }: KanbanBoardProps) {
  const [activeIssue, setActiveIssue] = useState<BoardIssue | null>(null);

  // We group optimistic issues here to instantly reflect DND changes
  const [optimisticIssues, setOptimisticIssues] = useState<BoardIssue[]>(issues);

  // Sync props when issues update
  React.useEffect(() => {
    setOptimisticIssues(issues);
  }, [issues]);

  const columns = useMemo(() => {
    // Only show columns that are either open, or closed but have items
    const grouped = new Map<number, BoardIssue[]>();
    statuses.forEach((s) => grouped.set(s.id, []));
    
    optimisticIssues.forEach((issue) => {
      if (grouped.has(issue.statusId)) {
        grouped.get(issue.statusId)!.push(issue);
      } else {
        // Fallback for issues with unknown status
        grouped.set(issue.statusId, [issue]);
      }
    });

    return grouped;
  }, [optimisticIssues, statuses]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor)
  );

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const issueData = active.data.current?.issue;
    if (issueData) {
      setActiveIssue(issueData);
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;
    
    const activeId = active.id;
    const overId = over.id;
    
    if (activeId === overId) return;
    
    const isActiveAColumn = active.data.current?.type === "Column";
    if (isActiveAColumn) return;

    const overData = over.data.current;
    
    // Find what status we're hovering over
    let targetStatusId: number | null = null;
    
    if (overData?.type === "Column") {
      targetStatusId = overData.status.id;
    } else if (overData?.type === "Issue") {
      targetStatusId = overData.issue.statusId;
    }
    
    if (targetStatusId !== null && activeIssue && activeIssue.statusId !== targetStatusId) {
      setOptimisticIssues((prev) => 
        prev.map((i) => i.id === activeIssue.id ? { ...i, statusId: targetStatusId! } : i)
      );
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveIssue(null);
    const { active, over } = event;
    if (!over) {
      // Revert optimistic changes
      setOptimisticIssues(issues);
      return;
    }

    const overData = over.data.current;
    let targetStatusId: number | null = null;
    
    if (overData?.type === "Column") {
      targetStatusId = overData.status.id;
    } else if (overData?.type === "Issue") {
      targetStatusId = overData.issue.statusId;
    }

    const activeIssueData = active.data.current?.issue as BoardIssue | undefined;

    if (activeIssueData && targetStatusId !== null && activeIssueData.statusId !== targetStatusId) {
      // It's a valid remote swap
      onDrop(activeIssueData.redmineIssueId, targetStatusId);
    } else {
      // Maybe they just reordered natively within the same column
      // Optional: Store array order
      setOptimisticIssues(issues);
    }
  };

  return (
    <div className="kanban-wrapper w-full h-full overflow-x-auto min-h-[600px] mt-4">
      <div className="kanban-board flex gap-4 min-w-max p-2 items-start">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          {statuses.map((status) => {
             const colIssues = columns.get(status.id) || [];
             if (colIssues.length === 0 && Array.from(columns.values()).reduce((a, b) => a + b.length, 0) > 0 && status.name.toLowerCase().includes("closed")) {
               return null; // hide empty closed columns
             }
             return (
               <KanbanColumn key={status.id} status={status} issues={colIssues} onClick={onClick} />
             );
          })}
          
          <DragOverlay dropAnimation={{ sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: "0.5" } } }) }}>
            {activeIssue ? (
              <div className="card kanban-card gap-1 flex-col shadow-lg rotate-2 scale-105 opacity-80" style={{ cursor: "grabbing" }}>
                <div className="flex justify-between items-start gap-2">
                  <span className="text-xs muted font-mono">#{activeIssue.redmineIssueId}</span>
                  {activeIssue.priority && (
                    <span className={`priority-badge priority-${activeIssue.priority.toLowerCase().replace(/\s+/g, "-")}`}>
                      {activeIssue.priority}
                    </span>
                  )}
                </div>
                <div className="kanban-card-title text-sm">{activeIssue.subject}</div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}
