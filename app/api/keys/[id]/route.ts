import { NextRequest, NextResponse } from "next/server";
import { deleteApiKey, revokeApiKey } from "@/lib/db";
import { requireApiUser } from "@/lib/session-auth";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser("operator");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const numId = parseInt(id, 10);
  if (isNaN(numId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action") ?? "delete";

  let ok: boolean;
  if (action === "revoke") {
    ok = await revokeApiKey(numId);
  } else {
    ok = await deleteApiKey(numId);
  }

  if (!ok) {
    return NextResponse.json({ error: "API key not found" }, { status: 404 });
  }

  return NextResponse.json({ status: action === "revoke" ? "revoked" : "deleted" });
}
