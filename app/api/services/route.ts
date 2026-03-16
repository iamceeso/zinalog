import { NextResponse } from "next/server";
import { getServices } from "@/lib/db";
import { requireApiUser } from "@/lib/session-auth";

export async function GET() {
  const auth = await requireApiUser("viewer");
  if (!auth.ok) return auth.response;

  const services = await getServices(auth.user.allowed_services);
  return NextResponse.json({ services });
}
