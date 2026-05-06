import { prisma } from "@/src/lib/db";
import { requireRedmineClient } from "@/src/lib/auth";
import { RedmineCustomField } from "@/src/lib/redmine";

type CustomFieldDefinition = {
  id: number;
  name: string;
  fieldFormat: string;
  possibleValues: Array<{ value: string }> | null;
  required: boolean;
  editable: boolean;
};

function normalizeCustomField(field: RedmineCustomField): CustomFieldDefinition {
  return {
    id: field.id,
    name: field.name,
    fieldFormat: field.field_format,
    possibleValues: field.possible_values,
    required: field.required,
    editable: field.editable,
  };
}

function fieldFromCachedValue(value: unknown): { id: number; name: string } | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const item = value as { id?: unknown; name?: unknown };
  if (typeof item.id !== "number" || typeof item.name !== "string" || item.name.trim().length === 0) {
    return null;
  }
  return { id: item.id, name: item.name };
}

async function cachedCustomFields(userId: string): Promise<CustomFieldDefinition[]> {
  const issues = await prisma.issue.findMany({
    where: { userId, customFieldsJson: { not: undefined } },
    select: { customFieldsJson: true },
    take: 500,
  });

  const byId = new Map<number, CustomFieldDefinition>();

  for (const issue of issues) {
    if (!Array.isArray(issue.customFieldsJson)) {
      continue;
    }
    for (const rawField of issue.customFieldsJson) {
      const field = fieldFromCachedValue(rawField);
      if (!field || byId.has(field.id)) {
        continue;
      }
      byId.set(field.id, {
        id: field.id,
        name: field.name,
        fieldFormat: "string",
        possibleValues: null,
        required: false,
        editable: true,
      });
    }
  }

  return Array.from(byId.values()).sort((a, b) => a.id - b.id);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");

    const { client, user } = await requireRedmineClient();

    try {
      let customFields: RedmineCustomField[];
      if (projectId) {
        const pid = parseInt(projectId, 10);
        if (isNaN(pid)) {
          return Response.json({ error: "Invalid project ID" }, { status: 400 });
        }
        customFields = await client.getProjectCustomFields(pid);
      } else {
        customFields = await client.getCustomFields();
      }

      return Response.json({
        customFields: customFields.map(normalizeCustomField),
        source: "redmine_api",
      });
    } catch {
      return Response.json({
        customFields: await cachedCustomFields(user.id),
        source: "issue_cache",
      });
    }
  } catch (error) {
    const status = error instanceof Error && error.message === "Unauthorized" ? 401 : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Server error" }, { status });
  }
}
