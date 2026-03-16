import { NextRequest, NextResponse } from "next/server";
import {
  canAccessUserManagement,
  canManageUserTarget,
  deleteManagedUser,
  getRoleOptions,
  listManagedUsers,
  requireApiUser,
  updateManagedUserActive,
  updateManagedUserEmail,
  updateManagedUserMfa,
  updateManagedUserPassword,
  updateManagedUserRole,
  updateManagedUserServiceAccess,
  sendManagedUserPasswordReset,
} from "@/lib/session-auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser("operator");
  if (!auth.ok) return auth.response;
  if (!canAccessUserManagement(auth.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const userId = Number.parseInt(id, 10);
  if (!Number.isFinite(userId)) {
    return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const targetUser = (await listManagedUsers()).find((user) => user.id === userId);
    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (!canManageUserTarget(auth.user.role, targetUser.role)) {
      return NextResponse.json(
        { error: "You cannot edit a user with the admin role" },
        { status: 403 }
      );
    }

    let changed = false;
    const roles = getRoleOptions();
    const isAdmin = auth.user.role === "admin";

    if (body.role !== undefined) {
      if (!isAdmin) {
        return NextResponse.json({ error: "Admin access is required to change roles" }, { status: 403 });
      }
      const role = typeof body.role === "string" ? body.role : "";
      if (!roles.includes(role as "admin" | "operator" | "viewer")) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      }
      changed =
        (await updateManagedUserRole(
          userId,
          role as "admin" | "operator" | "viewer",
          auth.user
        )) ||
        changed;
    }

    if (body.is_active !== undefined) {
      if (!isAdmin) {
        return NextResponse.json({ error: "Admin access is required to change status" }, { status: 403 });
      }
      if (typeof body.is_active !== "boolean") {
        return NextResponse.json({ error: "Field 'is_active' must be boolean" }, { status: 400 });
      }
      changed = (await updateManagedUserActive(userId, body.is_active, auth.user)) || changed;
    }

    if (body.email !== undefined) {
      if (typeof body.email !== "string" || !body.email.trim()) {
        return NextResponse.json({ error: "Field 'email' must be a non-empty string" }, { status: 400 });
      }
      changed = (await updateManagedUserEmail(userId, body.email, auth.user)) || changed;
    }

    if (body.allowed_services !== undefined) {
      if (!isAdmin) {
        return NextResponse.json(
          { error: "Admin access is required to change service access" },
          { status: 403 }
        );
      }
      changed =
        (await updateManagedUserServiceAccess(userId, body.allowed_services, auth.user)) ||
        changed;
    }

    if (body.mfa_enabled !== undefined) {
      if (!isAdmin) {
        return NextResponse.json(
          { error: "Admin access is required to change MFA settings" },
          { status: 403 }
        );
      }
      if (typeof body.mfa_enabled !== "boolean") {
        return NextResponse.json(
          { error: "Field 'mfa_enabled' must be boolean" },
          { status: 400 }
        );
      }
      changed = (await updateManagedUserMfa(userId, body.mfa_enabled, auth.user)) || changed;
    }

    if (body.password !== undefined) {
      if (!isAdmin) {
        return NextResponse.json(
          { error: "Admin access is required to change passwords" },
          { status: 403 }
        );
      }
      if (typeof body.password !== "string" || !body.password) {
        return NextResponse.json({ error: "Field 'password' must be a non-empty string" }, { status: 400 });
      }
      changed = (await updateManagedUserPassword(userId, body.password, auth.user)) || changed;
    }

    if (body.send_reset_email !== undefined) {
      if (!isAdmin) {
        return NextResponse.json(
          { error: "Admin access is required to send reset emails" },
          { status: 403 }
        );
      }
      if (typeof body.send_reset_email !== "boolean" || !body.send_reset_email) {
        return NextResponse.json(
          { error: "Field 'send_reset_email' must be true when provided" },
          { status: 400 }
        );
      }
      changed =
        (await sendManagedUserPasswordReset({
          id: userId,
          actor: auth.user,
          origin: req.nextUrl.origin,
        })) || changed;
    }

    if (!changed) {
      return NextResponse.json({ error: "No changes applied" }, { status: 400 });
    }

    return NextResponse.json({ status: "updated" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update user" },
      { status: 400 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser("operator");
  if (!auth.ok) return auth.response;
  if (!canAccessUserManagement(auth.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const userId = Number.parseInt(id, 10);
  if (!Number.isFinite(userId)) {
    return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
  }

  try {
    const targetUser = (await listManagedUsers()).find((user) => user.id === userId);
    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (!canManageUserTarget(auth.user.role, targetUser.role)) {
      return NextResponse.json(
        { error: "You cannot delete a user with the admin role" },
        { status: 403 }
      );
    }

    const deleted = await deleteManagedUser(userId, auth.user);
    if (!deleted) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ status: "deleted" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete user" },
      { status: 400 }
    );
  }
}
