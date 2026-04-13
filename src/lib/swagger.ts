import swaggerJsdoc from "swagger-jsdoc";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.3",
    info: {
      title: "NRCC API",
      description: "Nasc Redmine Command Center API - REST API for Redmine issue management with local caching, Slack integration, and mobile support.",
      version: "1.0.0",
      contact: {
        name: "NRCC Support",
      },
    },
    servers: [
      {
        url: "/api",
        description: "Current server",
      },
    ],
    tags: [
      { name: "Issues", description: "Issue management endpoints" },
      { name: "Time Entries", description: "Time tracking endpoints" },
      { name: "Sync", description: "Synchronization endpoints" },
      { name: "Reports", description: "Reporting endpoints" },
      { name: "Internal", description: "Internal/Catalog endpoints" },
      { name: "Slack", description: "Slack integration endpoints" },
      { name: "Mobile", description: "Mobile API endpoints" },
    ],
    paths: {
      "/issues": {
        get: {
          tags: ["Issues"],
          summary: "List issues",
          description: "Returns cached issues for current user with optional filtering and search",
          parameters: [
            { name: "status", in: "query", schema: { type: "string" } },
            { name: "priority", in: "query", schema: { type: "string" } },
            { name: "search", in: "query", schema: { type: "string" } },
            { name: "sort", in: "query", schema: { type: "string", enum: ["updated_desc", "updated_asc", "priority", "due_date"] } },
            { name: "page", in: "query", schema: { type: "integer" } },
            { name: "pageSize", in: "query", schema: { type: "integer" } },
            { name: "searchMode", in: "query", schema: { type: "string", enum: ["local", "remote", "hybrid"] } },
            { name: "openOnly", in: "query", schema: { type: "boolean" } },
          ],
          responses: {
            "200": { description: "Issues list with filters" },
            "401": { description: "Unauthorized" },
          },
        },
      },
      "/issues/{id}": {
        get: {
          tags: ["Issues"],
          summary: "Get issue detail",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": { description: "Issue detail with journals, attachments, relations" },
            "404": { description: "Issue not found" },
          },
        },
        put: {
          tags: ["Issues"],
          summary: "Update issue",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    subject: { type: "string" },
                    description: { type: "string" },
                    priorityId: { type: "integer" },
                    dueDate: { type: "string", format: "date" },
                    startDate: { type: "string", format: "date" },
                    estimatedHours: { type: "number" },
                    categoryId: { type: "integer" },
                    customFields: { type: "array", items: { type: "object" } },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Issue updated" },
            "400": { description: "Invalid request" },
          },
        },
      },
      "/issues/{id}/status": {
        get: {
          tags: ["Issues"],
          summary: "Get allowed status transitions",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": { description: "Allowed statuses" },
          },
        },
        post: {
          tags: ["Issues"],
          summary: "Update issue status",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    statusId: { type: "integer" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Status updated" },
            "400": { description: "Invalid transition" },
          },
        },
      },
      "/issues/{id}/comment": {
        post: {
          tags: ["Issues"],
          summary: "Add comment to issue",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    notes: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Comment added" },
          },
        },
      },
      "/issues/{id}/timelog": {
        post: {
          tags: ["Issues"],
          summary: "Log time on issue",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    hours: { type: "number" },
                    activityId: { type: "integer" },
                    comment: { type: "string" },
                    spentOn: { type: "string", format: "date" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Time logged" },
          },
        },
      },
      "/issues/{id}/assign": {
        post: {
          tags: ["Issues"],
          summary: "Assign issue to user",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    userId: { type: "integer" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Issue assigned" },
          },
        },
      },
      "/issues/{id}/attachments": {
        get: {
          tags: ["Issues"],
          summary: "List attachments",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": { description: "Attachment list" },
          },
        },
        post: {
          tags: ["Issues"],
          summary: "Upload attachment",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  properties: {
                    file: { type: "string", format: "binary" },
                    description: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Attachment uploaded" },
          },
        },
      },
      "/issues/{id}/github-links": {
        get: {
          tags: ["Issues"],
          summary: "List GitHub links",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": { description: "GitHub links list" },
          },
        },
        post: {
          tags: ["Issues"],
          summary: "Add GitHub link",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    url: { type: "string" },
                    repositoryFullName: { type: "string" },
                    githubIssueNumber: { type: "integer" },
                    githubPrNumber: { type: "integer" },
                  },
                },
              },
            },
          },
          responses: {
            "201": { description: "GitHub link added" },
          },
        },
      },
      "/time-entries": {
        get: {
          tags: ["Time Entries"],
          summary: "List time entries",
          parameters: [
            { name: "issueId", in: "query", schema: { type: "string" } },
            { name: "from", in: "query", schema: { type: "string", format: "date" } },
            { name: "to", in: "query", schema: { type: "string", format: "date" } },
            { name: "user", in: "query", schema: { type: "string" } },
          ],
          responses: {
            "200": { description: "Time entries list" },
          },
        },
      },
      "/time-entries/{id}": {
        patch: {
          tags: ["Time Entries"],
          summary: "Update time entry",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    hours: { type: "number" },
                    activityId: { type: "integer" },
                    comment: { type: "string" },
                    spentOn: { type: "string", format: "date" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Time entry updated" },
          },
        },
        delete: {
          tags: ["Time Entries"],
          summary: "Delete time entry",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": { description: "Time entry deleted" },
          },
        },
      },
      "/sync/manual-pull": {
        post: {
          tags: ["Sync"],
          summary: "Trigger manual sync",
          responses: {
            "200": { description: "Sync job started" },
            "429": { description: "Rate limited" },
          },
        },
      },
      "/sync/status": {
        get: {
          tags: ["Sync"],
          summary: "Get sync status",
          responses: {
            "200": { description: "Sync status" },
          },
        },
      },
      "/reports": {
        get: {
          tags: ["Reports"],
          summary: "Get reports",
          parameters: [
            { name: "timeEntries", in: "query", schema: { type: "string", enum: ["remote"] } },
            { name: "from", in: "query", schema: { type: "string", format: "date" } },
            { name: "to", in: "query", schema: { type: "string", format: "date" } },
          ],
          responses: {
            "200": { description: "Report data" },
          },
        },
      },
      "/internal/activities": {
        get: {
          tags: ["Internal"],
          summary: "Get time-entry activities",
          responses: {
            "200": { description: "Activities catalog" },
          },
        },
      },
      "/internal/users": {
        get: {
          tags: ["Internal"],
          summary: "Get assignable users",
          responses: {
            "200": { description: "User list" },
          },
        },
      },
      "/internal/priorities": {
        get: {
          tags: ["Internal"],
          summary: "Get issue priorities",
          responses: {
            "200": { description: "Priority list" },
          },
        },
      },
      "/health": {
        get: {
          tags: ["Internal"],
          summary: "Health check",
          responses: {
            "200": { description: "System health" },
            "503": { description: "Degraded" },
          },
        },
      },
      "/session/me": {
        get: {
          tags: ["Internal"],
          summary: "Get current session",
          responses: {
            "200": { description: "Session user" },
          },
        },
        delete: {
          tags: ["Internal"],
          summary: "Logout",
          responses: {
            "200": { description: "Logged out" },
          },
        },
      },
      "/redmine/connect": {
        post: {
          tags: ["Internal"],
          summary: "Connect Redmine account",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    baseUrl: { type: "string" },
                    apiKey: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Connected" },
            "502": { description: "Cannot reach Redmine" },
          },
        },
      },
      "/slack/messages": {
        get: {
          tags: ["Slack"],
          summary: "Get Slack channel messages",
          parameters: [
            { name: "channelId", in: "query", schema: { type: "string" } },
          ],
          responses: {
            "200": { description: "Messages list" },
          },
        },
      },
      "/slack/thread": {
        get: {
          tags: ["Slack"],
          summary: "Get Slack thread replies",
          parameters: [
            { name: "channelId", in: "query", required: true, schema: { type: "string" } },
            { name: "threadTs", in: "query", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": { description: "Thread messages" },
          },
        },
      },
      "/slack/test": {
        post: {
          tags: ["Slack"],
          summary: "Send test notification",
          responses: {
            "200": { description: "Test sent" },
            "500": { description: "Failed" },
          },
        },
      },
      "/slack/notify": {
        get: {
          tags: ["Slack"],
          summary: "Get Slack notifier status",
          responses: {
            "200": { description: "Status" },
          },
        },
        post: {
          tags: ["Slack"],
          summary: "Send Slack notification (webhook)",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    action: { type: "string", enum: ["create", "update", "close", "assign", "test"] },
                    issue: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        redmineIssueId: { type: "integer" },
                        subject: { type: "string" },
                        projectName: { type: "string" },
                        statusName: { type: "string" },
                        priorityName: { type: "string" },
                        assignedToName: { type: "string" },
                        updatedAt: { type: "string", format: "date-time" },
                      },
                    },
                    changes: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          field: { type: "string" },
                          oldValue: { type: "string" },
                          newValue: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Notification sent" },
          },
        },
      },
      "/mobile/v1/pair/connect": {
        post: {
          tags: ["Mobile"],
          summary: "Pair mobile device",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    code: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Paired" },
            "502": { description: "Cannot reach Redmine" },
          },
        },
      },
      "/mobile/v1/me": {
        get: {
          tags: ["Mobile"],
          summary: "Get mobile user info",
          security: [{ BearerAuth: [] }],
          responses: {
            "200": { description: "User info" },
          },
        },
      },
      "/mobile/v1/issues": {
        get: {
          tags: ["Mobile"],
          summary: "List issues (mobile)",
          security: [{ BearerAuth: [] }],
          responses: {
            "200": { description: "Issues list" },
          },
        },
      },
      "/mobile/v1/issues/{id}": {
        get: {
          tags: ["Mobile"],
          summary: "Get issue detail (mobile)",
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": { description: "Issue detail" },
          },
        },
      },
      "/mobile/v1/issues/{id}/comment": {
        post: {
          tags: ["Mobile"],
          summary: "Add comment (mobile)",
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": { description: "Comment added" },
          },
        },
      },
      "/mobile/v1/tokens/rotate": {
        post: {
          tags: ["Mobile"],
          summary: "Rotate mobile token",
          security: [{ BearerAuth: [] }],
          responses: {
            "200": { description: "Token rotated" },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Mobile API token",
        },
      },
    },
  },
  apis: [],
};

export const swaggerSpec = swaggerJsdoc(options);
