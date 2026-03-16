import { NextRequest, NextResponse } from "next/server";
import { verifyMfaCode } from "@/lib/session-auth";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const code = typeof body.code === "string" ? body.code : "";
  if (!code.trim()) {
    return NextResponse.json({ error: "Verification code is required" }, { status: 400 });
  }

  try {
    return await verifyMfaCode(req, { code });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to verify code" },
      { status: 400 }
    );
  }
}
