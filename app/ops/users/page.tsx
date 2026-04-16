import { redirect } from "next/navigation";
import { prisma } from "@/src/lib/db";
import { getSessionUserId } from "@/src/lib/session";
import { requireRole, getRoleDisplayName } from "@/src/lib/rbac";
import { UserManagementAccessDenied } from "./access-denied";
import { UsersClient } from "./users-client";

export const runtime = "nodejs";

export default async function UsersPage() {
  // Graceful auth
  const userId = await getSessionUserId();
  if (!userId) {
    redirect("/");
  }

  // Check admin role
  try {
    await requireRole("ADMIN");
  } catch {
    return <UserManagementAccessDenied />;
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      credential: {
        select: { baseUrl: true },
      },
    },
  });

  const mappedUsers = users.map(u => ({
    id: u.id,
    emailOrUsername: u.emailOrUsername,
    displayName: u.displayName,
    role: getRoleDisplayName(u.role),
    createdAt: u.createdAt.toISOString(),
    redmineBaseUrl: u.credential?.baseUrl ?? null,
  }));

  return <UsersClient initialUsers={mappedUsers} currentUserId={userId} />;
}