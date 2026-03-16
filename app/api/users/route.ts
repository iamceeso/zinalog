import { NextRequest, NextResponse } from "next/server";
import { getServices } from "@/lib/db";
import {
  canAccessUserManagement,
  createManagedUser,
  getRoleOptions,
  listManagedUsers,
  requireApiUser,
} from "@/lib/session-auth";

export async function GET() {
  const auth = await requireApiUser("operator");
  if (!auth.ok) return auth.response;
  if (!canAccessUserManagement(auth.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    currentUser: auth.user,
    users: await listManagedUsers(),
    roles: getRoleOptions(),
    availableServices: await getServices(auth.user.allowed_services),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireApiUser("admin");
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const username = typeof body.username === "string" ? body.username : "";
  const email = typeof body.email === "string" ? body.email : "";
  const role = typeof body.role === "string" ? body.role : "";
  const mfaEnabled = typeof body.mfa_enabled === "boolean" ? body.mfa_enabled : false;
  const allowedServices = body.allowed_services;
  const roles = getRoleOptions();

  if (!roles.includes(role as "admin" | "operator" | "viewer")) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  try {
    const user = await createManagedUser({
      username,
      email,
      role: role as "admin" | "operator" | "viewer",
      mfa_enabled: mfaEnabled,
      allowed_services: allowedServices,
      actor: auth.user,
      origin: req.nextUrl.origin,
    });
    return NextResponse.json(
      { user, message: "User created and temporary password emailed" },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create user" },
      { status: 400 }
    );
  }
}
