import { NextResponse } from "next/server";
import { getStats } from "@/lib/db";
import { requireApiUser } from "@/lib/session-auth";

export async function GET() {
  const auth = await requireApiUser("viewer");
  if (!auth.ok) return auth.response;

  const stats = await getStats(auth.user.allowed_services);
  return NextResponse.json(stats);
}
