import { NextRequest, NextResponse } from "next/server";
import { buildLoginResponse, createInitialAdmin } from "@/lib/session-auth";
import { getUserByUsername } from "@/lib/db";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const username = typeof body.username === "string" ? body.username : "";
  const email = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!username.trim() || !email.trim() || !password) {
    return NextResponse.json(
      { error: "Username, email, and password are required" },
      { status: 400 }
    );
  }

  try {
    const createdUser = await createInitialAdmin({ username, email, password });
    const user = await getUserByUsername(createdUser.username);
    if (!user) {
      throw new Error("Failed to load newly created user");
    }
    return await buildLoginResponse(user, req);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to complete setup" },
      { status: 400 }
    );
  }
}
