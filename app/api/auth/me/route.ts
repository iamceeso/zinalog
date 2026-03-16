import { NextResponse } from "next/server";
import { getCurrentUser, needsSetup } from "@/lib/session-auth";

export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json({ user, needsSetup: await needsSetup() });
}
