import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";
import { requireRole, getRoleDisplayName } from "@/src/lib/rbac";
import { z } from "zod";

const updateRoleSchema = z.object({
  newRole: z.enum(["ADMIN", "EDITOR", "USER", "VIEWER"]),
});

// PATCH /api/admin/users/[id]/role
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // Require admin role
    await requireRole("ADMIN");
    
    const { id: targetUserId } = await context.params;
    const body = await request.json();
    const { newRole } = updateRoleSchema.parse(body);
    
    // Get current user
    const users = await prisma.user.findMany({
      where: { role: "ADMIN" },
      select: { id: true },
    });
    
    const adminUserId = users[0]?.id;
    
    // Cannot change own role
    if (targetUserId === adminUserId) {
      return NextResponse.json(
        { error: "Cannot change your own role" },
        { status: 400 }
      );
    }
    
    // Update the user's role
    const updated = await prisma.user.update({
      where: { id: targetUserId },
      data: { role: newRole },
    });
    
    return NextResponse.json({
      success: true,
      user: {
        id: updated.id,
        displayName: updated.displayName,
        role: getRoleDisplayName(updated.role),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Role requirement")) {
      return NextResponse.json(
        { error: "Only administrators can change user roles" },
        { status: 403 }
      );
    }
    console.error("Failed to update user role:", error);
    return NextResponse.json(
      { error: "Failed to update role" },
      { status: 500 }
    );
  }
}