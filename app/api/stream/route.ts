import { getDb, type Log } from "@/lib/db";
import { requireApiUser } from "@/lib/session-auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireApiUser("viewer");
  if (!auth.ok) return auth.response;
  const allowedServices = auth.user.allowed_services;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Send a heartbeat comment every 15s to keep connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          clearInterval(heartbeat);
        }
      }, 15000);

      // Poll for new logs every 2 seconds
      const db = await getDb();
      const serviceConditions: string[] = [];
      const serviceParams: unknown[] = [];

      if (allowedServices !== null) {
        if (allowedServices.length === 0) {
          serviceConditions.push("1 = 0");
        } else {
          serviceConditions.push(`service IN (${allowedServices.map(() => "?").join(", ")})`);
          serviceParams.push(...allowedServices);
        }
      }

      const baseWhere = serviceConditions.length ? `WHERE ${serviceConditions.join(" AND ")}` : "";
      let lastId =
        ((await db.get<{ id: number }>(
          `SELECT COALESCE(MAX(id), 0) as id FROM logs ${baseWhere}`,
          serviceParams
        )) as { id: number } | undefined)?.id ?? 0;
      let polling = false;

      const poll = setInterval(() => {
        if (polling) {
          return;
        }

        polling = true;
        void (async () => {
          try {
            const pollConditions = ["id > ?"];
            const pollParams: unknown[] = [lastId];
            if (serviceConditions.length > 0) {
              pollConditions.push(...serviceConditions);
              pollParams.push(...serviceParams);
            }
            const newLogs = (await db.all<Log[]>(
              `SELECT * FROM logs WHERE ${pollConditions.join(" AND ")} ORDER BY id ASC LIMIT 50`,
              pollParams
            )) as Log[];

            if (newLogs.length > 0) {
              lastId = newLogs[newLogs.length - 1].id;
              const data = `data: ${JSON.stringify(newLogs)}\n\n`;
              controller.enqueue(encoder.encode(data));
            }
          } catch {
            clearInterval(poll);
            clearInterval(heartbeat);
          } finally {
            polling = false;
          }
        })();
      }, 2000);

      // Cleanup on abrupt client disconnect (abort signal fires before cancel())
      req.signal.addEventListener("abort", () => {
        clearInterval(poll);
        clearInterval(heartbeat);
      });

      // Cleanup when the stream is cancelled normally
      return () => {
        clearInterval(poll);
        clearInterval(heartbeat);
      };
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
