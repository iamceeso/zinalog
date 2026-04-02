import assert from "node:assert/strict";
import test from "node:test";
import { toCSV } from "../lib/export-csv";

test("toCSV neutralizes formula-like cells", () => {
  const csv = toCSV([
    {
      id: 1,
      level: "error",
      message: '=HYPERLINK("https://evil.test")',
      service: "api",
      stack: "@SUM(1,1)",
      metadata: "-cmd",
      api_key_id: null,
      created_at: "2026-04-02T12:00:00.000Z",
    },
  ]);

  assert.match(csv, /"'=HYPERLINK/);
  assert.match(csv, /"'@SUM\(1,1\)"/);
  assert.match(csv, /"'-cmd"/);
});
