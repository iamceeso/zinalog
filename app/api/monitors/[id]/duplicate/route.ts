import { NextResponse } from "next/server";
import { createMonitor, getMonitorById, listMonitors } from "@/lib/db";
import {
  monitorUniqueConstraintField,
  sanitizeMonitorForClient,
} from "@/lib/monitor-fields";
import { requireApiUser } from "@/lib/session-auth";
import { decryptSecret } from "@/lib/secret-crypto";
import type { MonitorType } from "@/lib/db";

function uniqueName(base: string, taken: Set<string>): string {
  let candidate = `${base} (copy)`;
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) {
    candidate = `${base} (copy ${n})`;
  }
  return candidate;
}

// `target` is UNIQUE, so an exact clone can't be inserted. For HTTP monitors
// a URL fragment is never sent to the server, so appending one produces a
// distinct row that still checks the identical resource. TCP/ping targets
// are bare hosts with no inert slot, so they get a visible "-copy" suffix
// the user is expected to correct.
function uniqueTarget(
  type: MonitorType,
  target: string,
  taken: Set<string>
): string {
  if (type === "http") {
    const url = new URL(target);
    url.hash = "";
    const base = url.toString();
    let candidate = `${base}#dup`;
    for (let n = 2; taken.has(candidate); n++) {
      candidate = `${base}#dup${n}`;
    }
    return candidate;
  }

  let candidate = `${target}-copy`;
  for (let n = 2; taken.has(candidate); n++) {
    candidate = `${target}-copy${n}`;
  }
  return candidate;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser("operator");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const monitorId = Number.parseInt(id, 10);
  if (!Number.isFinite(monitorId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const source = await getMonitorById(monitorId);
  if (!source) {
    return NextResponse.json({ error: "Monitor not found" }, { status: 404 });
  }

  const existing = await listMonitors();
  const takenNames = new Set(existing.map((m) => m.name.toLowerCase()));
  const takenTargets = new Set(existing.map((m) => m.target));

  let duplicate;
  try {
    duplicate = await createMonitor({
      name: uniqueName(source.name, takenNames),
      type: source.type,
      target: uniqueTarget(source.type, source.target, takenTargets),
      port: source.port,
      method: source.method,
      headers: source.headers ? decryptSecret(source.headers) : null,
      basic_auth_user: source.basic_auth_user,
      basic_auth_pass: source.basic_auth_pass
        ? decryptSecret(source.basic_auth_pass)
        : null,
      expected_status: source.expected_status,
      interval_seconds: source.interval_seconds,
      timeout_seconds: source.timeout_seconds,
      retries: source.retries,
      follow_redirects: source.follow_redirects === 1,
      verify_ssl: source.verify_ssl === 1,
      // start paused: the target is a placeholder (for tcp/ping) that needs review
      is_active: false,
      notify_enabled: source.notify_enabled === 1,
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
    { monitor: sanitizeMonitorForClient(duplicate) },
    { status: 201 }
  );
}
