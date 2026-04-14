/**
 * Seed script: Create sample local-only issues for testing
 * Run: npx tsx scripts/seed-local-issues.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Find first user
  const user = await prisma.user.findFirst();
  if (!user) {
    console.log("No users found. Create a user first.");
    return;
  }

  console.log(`Creating local issues for user: ${user.displayName} (${user.id})`);

  const localIssues = [
    {
      subject: "Research Ollama + Tailscale integration",
      description: "Investigate wrapping Ollama around Tailscale aperture for secure remote access to the LLM.",
      tracker: "Feature",
      priority: "High",
      statusId: 1,
      statusName: "New",
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      doneRatio: 0,
    },
    {
      subject: "Implement AI tool calls for issue automation",
      description: "Add support for AI-driven tool calls to automatically assign, categorize, and prioritize issues.",
      tracker: "Feature",
      priority: "High",
      statusId: 2,
      statusName: "In Progress",
      dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      doneRatio: 25,
    },
    {
      subject: "Add timeline report to Heimdall dashboard",
      description: "Create a timeline visualization showing daily log counts by source type for the past 7 days.",
      tracker: "Task",
      priority: "Medium",
      statusId: 2,
      statusName: "In Progress",
      doneRatio: 50,
    },
    {
      subject: "Fix CSS styling on mobile issue view",
      description: "The issue detail page has overflow problems on screens < 768px.",
      tracker: "Bug",
      priority: "Low",
      statusId: 1,
      statusName: "New",
      doneRatio: 0,
    },
    {
      subject: "Update documentation for local ticket tracking",
      description: "Document the new local-only ticket feature in README and deployment guide.",
      tracker: "Documentation",
      priority: "Low",
      statusId: 1,
      statusName: "New",
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      doneRatio: 0,
    },
  ];

  for (const data of localIssues) {
    // Get next local issue number
    const maxNumber = await prisma.issue.aggregate({
      where: { userId: user.id, source: "local" },
      _max: { localIssueNumber: true },
    });
    const localIssueNumber = (maxNumber._max.localIssueNumber ?? 0) + 1;

    const issue = await prisma.issue.create({
      data: {
        userId: user.id,
        source: "local",
        localIssueNumber,
        redmineIssueId: null,
        redmineBaseUrl: null,
        subject: data.subject,
        description: data.description,
        tracker: data.tracker,
        priority: data.priority,
        statusId: data.statusId,
        statusName: data.statusName,
        dueDate: data.dueDate,
        doneRatio: data.doneRatio,
        updatedOnRemote: new Date(),
        lastActivityAt: new Date(),
        lastActivityType: "local_create",
      },
    });

    console.log(`  ✅ Created local #${localIssueNumber}: ${issue.subject}`);
  }

  console.log("Done! Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
