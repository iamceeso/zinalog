import { NextRequest, NextResponse } from "next/server";
import { exportLogs } from "@/lib/db";
import { toCSV } from "@/lib/export-csv";
import { requireApiUser } from "@/lib/session-auth";

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
