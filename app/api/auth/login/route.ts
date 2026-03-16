import { NextRequest, NextResponse } from "next/server";
import { beginSignInWithPassword, needsSetup } from "@/lib/session-auth";

export async function POST(req: NextRequest) {
  if (await needsSetup()) {
    return NextResponse.json(
      { error: "Initial setup is required before logging in" },
      { status: 403 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const username = typeof body.username === "string" ? body.username : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!username.trim() || !password) {
    return NextResponse.json(
      { error: "username and password are required" },
      { status: 400 }
    );
  }

  try {
    return await beginSignInWithPassword(req, { username, password });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to sign in" },
      { status: 400 }
    );
  }
}
