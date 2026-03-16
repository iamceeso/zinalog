import { NextRequest } from "next/server";
import { buildLogoutResponse } from "@/lib/session-auth";

export async function POST(req: NextRequest) {
  return await buildLogoutResponse(req);
}
