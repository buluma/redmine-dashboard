"use client";

import { useMemo, useCallback } from "react";
import { useI18n } from "./I18nProvider";

interface ProjectFilterProps {
  issues: { projectName?: string | null }[];
  selectedProject: string | null;
  onChange: (project: string | null) => void;
}

export function ProjectFilter({ issues, selectedProject, onChange }: ProjectFilterProps) {
  const { t } = useI18n();
  
  // Extract unique projects
  const projects = useMemo(() => {
    const projectSet = new Set<string>();
    issues.forEach((i) => {
      if (i.projectName) {
        projectSet.add(i.projectName);
      }
    });
    return Array.from(projectSet).sort();
  }, [issues]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    issues.forEach((i) => {
      if (i.projectName) {
        map.set(i.projectName, (map.get(i.projectName) ?? 0) + 1);
      }
    });
    return map;
  }, [issues]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value;
      onChange(value === "" ? null : value);
    },
    [onChange]
  );

  return (
    <div className="project-filter">
      <select value={selectedProject ?? ""} onChange={handleChange} className="project-filter-select">
        <option value="">{t("projectFilter.allProjects", { count: issues.length })}</option>
        {projects.map((project) => (
          <option key={project} value={project}>
            {project} ({counts.get(project)})
          </option>
        ))}
      </select>
    </div>
  );
}

// Also export a hook for filtering by project
export function useProjectFilter<T extends { projectName?: string | null }>(
  issues: T[],
  selectedProject: string | null
): T[] {
  return useMemo(() => {
    if (!selectedProject) return issues;
    return issues.filter((i) => i.projectName === selectedProject);
  }, [issues, selectedProject]);
}
