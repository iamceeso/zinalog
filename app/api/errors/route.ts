import { NextResponse } from "next/server";
import { getErrorGroups } from "@/lib/db";
import { requireApiUser } from "@/lib/session-auth";

export async function GET() {
  const auth = await requireApiUser("viewer");
  if (!auth.ok) return auth.response;

  const groups = await getErrorGroups(auth.user.allowed_services);
  return NextResponse.json({ groups });
}
