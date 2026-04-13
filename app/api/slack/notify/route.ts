import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logEvent } from "@/src/lib/log";
import { getSlackNotificationService } from "@/src/lib/slack-notification-service";

// Schema for incoming webhook payload
const notifyPayloadSchema = z.object({
  action: z.enum(["create", "update", "close", "assign", "test"]),
  issue: z.object({
    id: z.string(),
    redmineIssueId: z.number(),
    subject: z.string(),
    projectName: z.string().nullable(),
    statusName: z.string(),
    priorityName: z.string().nullable(),
    assignedToName: z.string().nullable(),
    updatedAt: z.string(),
    doneRatio: z.number().nullable().optional(),
    dueDate: z.string().nullable().optional(),
  }),
  changes: z.array(z.object({
    field: z.string(),
    oldValue: z.string().nullable(),
    newValue: z.string().nullable(),
  })).optional(),
  previousAssignee: z.string().nullable().optional(),
});

type NotifyPayload = z.infer<typeof notifyPayloadSchema>;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate payload
    const parseResult = notifyPayloadSchema.safeParse(body);
    if (!parseResult.success) {
      logEvent("slack.webhook.invalid_payload", {
        error: parseResult.error.message,
      }, "warn");
      return NextResponse.json(
        { error: "Invalid payload", details: parseResult.error.message },
        { status: 400 }
      );
    }

    const payload = parseResult.data;
    const service = getSlackNotificationService();

    // Handle test action
    if (payload.action === "test") {
      const result = await service.testNotification();
      return NextResponse.json(result, { status: result.success ? 200 : 500 });
    }

    // Build state objects
    const newState = {
      ...payload.issue,
      doneRatio: payload.issue.doneRatio ?? null,
      dueDate: payload.issue.dueDate ?? null,
    };

    // Build old state from changes if it's an update
    let oldState = null;
    if (payload.action === "update" && payload.changes) {
      // Reconstruct old state from changes
      oldState = { ...newState };
      for (const change of payload.changes) {
        switch (change.field) {
          case "status":
            oldState.statusName = change.oldValue || oldState.statusName;
            break;
          case "priority":
            oldState.priorityName = change.oldValue;
            break;
          case "assigned_to":
            oldState.assignedToName = change.oldValue;
            break;
          case "subject":
            oldState.subject = change.oldValue || oldState.subject;
            break;
          case "due_date":
            oldState.dueDate = change.oldValue;
            break;
          case "done_ratio":
            oldState.doneRatio = change.oldValue ? parseFloat(change.oldValue) : null;
            break;
        }
      }
    } else if (payload.action === "assign" && payload.previousAssignee !== undefined) {
      oldState = {
        ...newState,
        assignedToName: payload.previousAssignee,
      };
    }

    // Send notification based on action
    const result = await service.notifyIssueChanges(oldState, newState);

    logEvent("slack.webhook.notification_sent", {
      action: payload.action,
      issueId: payload.issue.redmineIssueId,
      success: result.success,
    });

    return NextResponse.json(result, { status: result.success ? 200 : 500 });

  } catch (error) {
    logEvent("slack.webhook.error", {
      error: error instanceof Error ? error.message : "Unknown error",
    }, "error");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET endpoint to check webhook status
export async function GET() {
  const service = getSlackNotificationService();
  const testResult = await service.testNotification();

  return NextResponse.json({
    configured: testResult.success || testResult.error?.includes("not configured"),
    lastTest: testResult,
  });
}
