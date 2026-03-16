import { NextRequest, NextResponse } from "next/server";
import { exportLogs, Log } from "@/lib/db";
import { requireApiUser } from "@/lib/session-auth";

function toCSV(logs: Log[]): string {
  if (logs.length === 0) return "id,level,message,service,stack,metadata,created_at\n";
  const headers = ["id", "level", "message", "service", "stack", "metadata", "created_at"];
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = String(v).replace(/"/g, '""');
    return `"${s}"`;
  };
  const rows = logs.map((l) =>
    headers.map((h) => escape(l[h as keyof Log])).join(",")
  );
  return [headers.join(","), ...rows].join("\n");
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUser("viewer");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") ?? "json";

  const filters = {
    level: searchParams.get("level") ?? undefined,
    service: searchParams.get("service") ?? undefined,
    search: searchParams.get("search") ?? undefined,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  };

  const logs = await exportLogs(filters, auth.user.allowed_services);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  if (format === "csv") {
    return new NextResponse(toCSV(logs), {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="zinalog-logs-${timestamp}.csv"`,
      },
    });
  }

  return new NextResponse(JSON.stringify(logs, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="zinalog-logs-${timestamp}.json"`,
    },
  });
}
