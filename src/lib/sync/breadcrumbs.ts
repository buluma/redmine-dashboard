// Walks an issue's parent chain via Redmine (not the local cache — a parent
// may not be synced yet) to build the breadcrumb trail shown on the issue
// detail page.

import { RedmineClient } from "@/src/lib/redmine";
import { asNumber, asObject, asString, nestedId, nestedName } from "@/src/lib/sync/parsers";

export async function buildBreadcrumbChain(
  client: RedmineClient,
  issueId: number,
  maxDepth: number = 20,
): Promise<Array<{ id: number; subject: string; tracker?: string }>> {
  const chain: Array<{ id: number; subject: string; tracker?: string }> = [];
  let currentId: number | null = issueId;
  let depth = 0;
  const visited = new Set<number>();

  while (currentId && depth < maxDepth && !visited.has(currentId)) {
    visited.add(currentId);
    try {
      const data = await client.getIssue(currentId, ["parent"]);
      const issue = asObject(data?.issue);
      const currentIssueId = asNumber(issue.id);
      if (!currentIssueId) break;

      chain.unshift({
        id: currentIssueId,
        subject: asString(issue.subject) ?? `Issue #${currentIssueId}`,
        tracker: nestedName(issue.tracker) ?? undefined,
      });

      const parentId = nestedId(issue.parent);
      currentId = parentId ? Number(parentId) : null;
      if (!currentId || !Number.isInteger(currentId) || currentId <= 0) break;

      depth++;
    } catch {
      break;
    }
  }

  return chain;
}
