import { NextRequest, NextResponse } from "next/server";
import { completeTemporaryPasswordChange } from "@/lib/session-auth";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const password = typeof body.password === "string" ? body.password : "";
  if (!password) {
    return NextResponse.json({ error: "A new password is required" }, { status: 400 });
  }

  try {
    return await completeTemporaryPasswordChange(req, { password });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to change password" },
      { status: 400 }
    );
  }
}
