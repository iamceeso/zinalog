import { NextRequest, NextResponse } from "next/server";
import { createMonitor, listMonitors } from "@/lib/db";
import {
  monitorUniqueConstraintField,
  sanitizeMonitorForClient,
} from "@/lib/monitor-fields";
import { validateMonitorPayload } from "@/lib/monitor-validation";
import { requireApiUser } from "@/lib/session-auth";

export async function GET() {
  const auth = await requireApiUser("viewer");
  if (!auth.ok) return auth.response;

  const monitors = await listMonitors();
  return NextResponse.json({
    monitors: monitors.map(sanitizeMonitorForClient),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireApiUser("operator");
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { errors, value } = validateMonitorPayload(body);
  if (!value) {
    return NextResponse.json(
      { error: "Validation failed", details: errors },
      { status: 400 }
    );
  }

  let monitor;
  try {
    monitor = await createMonitor({
      name: value.name,
      type: value.type,
      target: value.target,
      port: value.port,
      method: value.method,
      headers: value.headers ?? null,
      basic_auth_user: value.basic_auth_user,
      basic_auth_pass: value.basic_auth_pass ?? null,
      expected_status: value.expected_status,
      interval_seconds: value.interval_seconds,
      timeout_seconds: value.timeout_seconds,
      retries: value.retries,
      follow_redirects: value.follow_redirects,
      verify_ssl: value.verify_ssl,
      is_active: value.is_active,
      notify_enabled: value.notify_enabled,
    });
  } catch (err) {
    const field = monitorUniqueConstraintField(err);
    if (!field) throw err;
    return NextResponse.json(
      {
        error: "Validation failed",
        details: [`${field}: must be unique - already used by another monitor`],
      },
      { status: 409 }
    );
  }

  return NextResponse.json(
    { monitor: sanitizeMonitorForClient(monitor) },
    { status: 201 }
  );
}
