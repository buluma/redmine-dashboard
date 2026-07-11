"use client";

import React, { useMemo } from "react";

export interface GanttIssue {
  id: string;
  redmineIssueId: number;
  subject: string;
  projectName: string | null;
  priority: string | null;
  statusName: string;
  startDate: string | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  doneRatio: number | null;
}

interface GanttChartProps {
  issues: GanttIssue[];
  onClick: (issue: GanttIssue) => void;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dayDiff(start: Date, end: Date) {
  const dStart = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const dEnd = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.max(0, Math.round((dEnd.getTime() - dStart.getTime()) / DAY_MS));
}

export function GanttChart({ issues, onClick }: GanttChartProps) {
  // 1. Calculate boundaries
  const { minDate, totalDays, dates } = useMemo(() => {
    let minT = Number.MAX_SAFE_INTEGER;
    let maxT = 0;

    if (issues.length === 0) {
      const today = new Date();
      minT = today.getTime() - 7 * DAY_MS;
      maxT = today.getTime() + 14 * DAY_MS;
    } else {
      issues.forEach((i) => {
        const start = new Date(i.startDate || i.createdAt).getTime();
        const end = new Date(i.dueDate || i.updatedAt).getTime();
        if (!isNaN(start) && start < minT) minT = start;
        if (!isNaN(end) && end > maxT) maxT = end;
        if (!isNaN(start) && start > maxT) maxT = start;
      });
    }

    // Add padding (1 week before, 2 weeks after)
    minT -= 7 * DAY_MS;
    maxT += 14 * DAY_MS;

    const minD = new Date(minT);
    const maxD = new Date(maxT);

    const span = dayDiff(minD, maxD);
    const dateArray: Date[] = [];
    for (let i = 0; i <= span; i++) {
       dateArray.push(new Date(minD.getTime() + i * DAY_MS));
    }

    return {
      minDate: minD,
      maxDate: maxD,
      totalDays: span,
      dates: dateArray,
    };
  }, [issues]);

  const todayOffset = dayDiff(minDate, new Date());

  return (
    <div className="gantt-wrapper w-full mt-4 bg-surface br-md border shadow-sm flex flex-col h-[70vh] overflow-hidden">
      <div className="gantt-scroll-container flex-1 overflow-auto relative">
        <div 
           className="gantt-grid min-w-max pb-8" 
           style={{ 
             display: 'grid', 
             gridTemplateColumns: `300px repeat(${totalDays + 1}, minmax(32px, 1fr))`,
             gridAutoRows: '40px'
           }}
        >
          {/* Header Row */}
          <div className="gantt-header-col sticky left-0 z-20 bg-surface border-r border-b flex items-center px-4 font-bold text-sm tracking-wide shadow-sm">
            Issue Timeline
          </div>
          {dates.map((d, idx) => {
            const isToday = d.toDateString() === new Date().toDateString();
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
            return (
              <div 
                key={idx} 
                className={`flex flex-col items-center justify-center border-b text-[10px] uppercase font-mono tracking-tighter ${isWeekend ? 'bg-black/5' : ''} ${isToday ? 'bg-primary/10 text-primary font-bold' : 'text-muted'}`}
              >
                <span>{d.toLocaleDateString(undefined, { weekday: 'narrow' })}</span>
                <span>{d.getDate()}</span>
              </div>
            );
          })}

          {/* Today Line Indicator */}
          {todayOffset >= 0 && todayOffset <= totalDays && (
             <div 
                className="absolute top-10 bottom-0 border-l-2 border-primary/50 z-10 pointer-events-none"
                style={{ 
                   left: `calc(300px + ${todayOffset} * 32px + 16px)`,
                }}
             />
          )}

          {/* Issue Rows */}
          {issues.map((issue) => {
            const iStart = new Date(issue.startDate || issue.createdAt);
            // Default span 1 day if no due date
            const iEnd = issue.dueDate ? new Date(issue.dueDate) : new Date(iStart.getTime() + DAY_MS * 1);
            
            const startOffset = dayDiff(minDate, iStart);
            const spanDays = Math.max(1, dayDiff(iStart, iEnd));

            return (
              <React.Fragment key={issue.id}>
                <div className="gantt-row-title sticky left-0 z-10 bg-surface border-r border-b px-3 flex flex-col justify-center overflow-hidden shrink-0 hover:bg-black/5 cursor-pointer" onClick={() => onClick(issue)}>
                  <div className="flex items-center gap-2 truncate">
                    <span className="text-xs muted font-mono">#{issue.redmineIssueId}</span>
                    <span className="text-sm truncate font-medium">{issue.subject}</span>
                  </div>
                  <div className="text-[10px] muted truncate">{issue.projectName} • {issue.statusName}</div>
                </div>
                
                {/* Background cells for alignment */}
                {dates.map((d, idx) => {
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  return (
                    <div key={`bg-${idx}`} className={`border-r border-b border-white/5 opacity-50 ${isWeekend ? 'bg-black/5' : ''}`} />
                  )
                })}

                {/* The Gantt Bar */}
                <div 
                  className="gantt-bar-container border-b relative group"
                  style={{ 
                    gridColumnStart: 2 + startOffset, 
                    gridColumnEnd: 2 + startOffset + spanDays 
                  }}
                >
                  <div 
                     className="absolute top-1.5 bottom-1.5 left-1 right-1 rounded-sm shadow border border-primary/20 bg-primary/10 overflow-hidden cursor-pointer"
                     onClick={() => onClick(issue)}
                  >
                     {/* Progress bar fill */}
                     <div 
                        className="absolute top-0 bottom-0 left-0 bg-primary/40 transition-all"
                        style={{ width: `${issue.doneRatio || 0}%` }}
                     />
                     <div className="absolute inset-0 flex items-center px-2 text-[10px] font-bold text-primary truncate pointer-events-none">
                       {issue.doneRatio || 0}%
                     </div>
                  </div>
                  
                  {/* Tooltip */}
                  <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-popover text-popover-foreground text-xs p-2 rounded shadow-xl border opacity-0 group-hover:opacity-100 pointer-events-none z-50 whitespace-nowrap transition-opacity">
                    <p className="font-bold mb-1">{issue.subject}</p>
                    <p>Start: {iStart.toLocaleDateString()}</p>
                    <p>End: {iEnd.toLocaleDateString()}</p>
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
