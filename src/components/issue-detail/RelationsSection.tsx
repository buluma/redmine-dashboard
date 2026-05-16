"use client";

import Link from "next/link";

import { useI18n } from "@/src/components/I18nProvider";

export interface IssueRelation {
  id: string;
  redmineRelationId: number;
  targetIssueId: number;
  relationType: string;
  delay: number | null;
}

interface RelationsSectionProps {
  relations: IssueRelation[];
}

const TYPE_LABELS: Record<string, string> = {
  relates: "Relates to",
  duplicates: "Duplicates",
  duplicated: "Duplicated by",
  blocks: "Blocks",
  blocked: "Blocked by",
  precedes: "Precedes",
  follows: "Follows",
  copied_to: "Copied to",
  copied_from: "Copied from",
};

function labelFor(type: string): string {
  return TYPE_LABELS[type] ?? type;
}

export function RelationsSection({ relations }: RelationsSectionProps) {
  const { t } = useI18n();

  if (relations.length === 0) {
    return null;
  }

  const grouped = new Map<string, IssueRelation[]>();
  for (const rel of relations) {
    const arr = grouped.get(rel.relationType) ?? [];
    arr.push(rel);
    grouped.set(rel.relationType, arr);
  }

  return (
    <article className="report-card">
      <details className="issue-collapsible" open>
        <summary>
          {t("issues.sections.relations", "Relations")}
          <span className="muted"> ({relations.length})</span>
        </summary>
        <div className="relations-groups">
          {Array.from(grouped.entries()).map(([type, items]) => (
            <div key={type} className="relations-group">
              <h4 className="relations-group-label">{labelFor(type)}</h4>
              <ul className="relations-list">
                {items.map((rel) => (
                  <li key={rel.id} className="relations-item">
                    <Link href={`/issues/${rel.targetIssueId}`} className="relations-link">
                      #{rel.targetIssueId}
                    </Link>
                    {rel.delay != null && (
                      <span className="muted relations-delay">delay {rel.delay}d</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </details>
    </article>
  );
}
