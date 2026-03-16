import { NextRequest, NextResponse } from "next/server";
import { sendTestNotification, Channel } from "@/lib/notifications";
import { requireApiUser } from "@/lib/session-auth";

const VALID_CHANNELS: Channel[] = ["email", "telegram", "slack", "discord", "webhook"];

export async function POST(req: NextRequest) {
  const auth = await requireApiUser("admin");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const channel = (searchParams.get("channel") ?? "email") as Channel;

  if (!VALID_CHANNELS.includes(channel)) {
    return NextResponse.json({ error: `Invalid channel. Must be one of: ${VALID_CHANNELS.join(", ")}` }, { status: 400 });
  }

  const result = await sendTestNotification(channel);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ status: "sent", channel });
}
