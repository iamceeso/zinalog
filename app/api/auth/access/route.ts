import { NextRequest, NextResponse } from "next/server";
import { auditPageAccess, requireApiUser } from "@/lib/session-auth";

export async function POST(req: NextRequest) {
  const auth = await requireApiUser("viewer");
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const resource = typeof body.resource === "string" ? body.resource.trim() : "";
  if (!resource.startsWith("/dashboard")) {
    return NextResponse.json({ error: "A valid resource path is required" }, { status: 400 });
  }

  await auditPageAccess(auth.user, resource, req);
  return NextResponse.json({ status: "recorded" });
}
