import { NextRequest, NextResponse } from "next/server";
import {
  deleteAllUserAccessAuditLogs,
  deleteUserAccessAuditLogsOlderThan,
  getAccessAuditRetentionDays,
  isAccessAuditEnabled,
  listUserAccessAuditLogs,
  setSettings,
} from "@/lib/db";
import { requireApiUser } from "@/lib/session-auth";

function parsePositiveInt(value: unknown, field: string): number {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`Field '${field}' must be a positive integer`);
  }

  return Math.floor(parsed);
}

export async function GET() {
  const auth = await requireApiUser("admin");
  if (!auth.ok) return auth.response;

  return NextResponse.json({
    enabled: await isAccessAuditEnabled(),
    retention_days: String(await getAccessAuditRetentionDays()),
    logs: await listUserAccessAuditLogs(200),
  });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireApiUser("admin");
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const pairs: Record<string, string> = {};
  let trimmed = 0;

  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") {
      return NextResponse.json({ error: "Field 'enabled' must be boolean" }, { status: 400 });
    }
    pairs.access_audit_enabled = body.enabled ? "1" : "0";
  }

  if (body.retention_days !== undefined) {
    try {
      const retentionDays = parsePositiveInt(body.retention_days, "retention_days");
      pairs.access_audit_retention_days = String(retentionDays);
      trimmed = await deleteUserAccessAuditLogsOlderThan(retentionDays);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Invalid retention_days value" },
        { status: 400 }
      );
    }
  }

  if (Object.keys(pairs).length === 0) {
    return NextResponse.json({ error: "No changes supplied" }, { status: 400 });
  }

  await setSettings(pairs);
  return NextResponse.json({
    status: "updated",
    trimmed,
    enabled: await isAccessAuditEnabled(),
    retention_days: String(await getAccessAuditRetentionDays()),
  });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireApiUser("admin");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const scope = searchParams.get("scope") ?? "all";

  if (scope === "expired") {
    const deleted = await deleteUserAccessAuditLogsOlderThan(
      await getAccessAuditRetentionDays()
    );
    return NextResponse.json({
      deleted,
      message: "Deleted access audit logs older than the current retention period",
    });
  }

  if (scope === "all") {
    const deleted = await deleteAllUserAccessAuditLogs();
    return NextResponse.json({
      deleted,
      message: "Deleted all access audit logs",
    });
  }

  return NextResponse.json({ error: "Invalid purge scope" }, { status: 400 });
}
