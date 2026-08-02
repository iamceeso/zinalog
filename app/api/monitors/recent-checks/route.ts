import { NextRequest, NextResponse } from "next/server";
import { listRecentChecksAcrossMonitors } from "@/lib/db";
import { requireApiUser } from "@/lib/session-auth";

export async function GET(req: NextRequest) {
  const auth = await requireApiUser("viewer");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const limit = Math.min(
    Math.max(Number.parseInt(searchParams.get("limit") ?? "20", 10) || 20, 1),
    100
  );

  const checks = await listRecentChecksAcrossMonitors(limit);
  return NextResponse.json({ checks });
}
