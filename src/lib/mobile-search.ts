import { Prisma } from "@prisma/client";

export function buildMobileSearchWhere(
  userId: string,
  query: string,
): Prisma.IssueWhereInput {
  const q = query.trim();
  if (q.length < 2) {
    return { userId };
  }
  return {
    userId,
    OR: [
      { subject: { contains: q } },
      { description: { contains: q } },
      { projectName: { contains: q } },
      { assignedToName: { contains: q } },
    ],
  };
}
