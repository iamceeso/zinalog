import type { Log } from "./db";

function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const raw = String(value);
  return /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
}

export function toCSV(logs: Log[]): string {
  if (logs.length === 0)
    return "id,level,message,service,stack,metadata,created_at\n";
  const headers = [
    "id",
    "level",
    "message",
    "service",
    "stack",
    "metadata",
    "created_at",
  ];
  const escape = (value: unknown) =>
    `"${sanitizeCsvCell(value).replace(/"/g, '""')}"`;
  const rows = logs.map((log) =>
    headers.map((header) => escape(log[header as keyof Log])).join(","),
  );
  return [headers.join(","), ...rows].join("\n");
}
