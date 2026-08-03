import type { Log } from "@/lib/db";
import { onNewLog, offNewLog } from "@/lib/log-events";
import { requireApiUser } from "@/lib/session-auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireApiUser("viewer");
  if (!auth.ok) return auth.response;
  const allowedServices = auth.user.allowed_services;

  const isAllowed = (service: string | null): boolean => {
    if (allowedServices === null) return true;
    if (allowedServices.length === 0) return false;
    return service !== null && allowedServices.includes(service);
  };

  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let onLog: ((log: Log) => void) | undefined;
  let closed = false;

  const cleanup = () => {
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = undefined;
    }
    if (onLog) {
      offNewLog(onLog);
      onLog = undefined;
    }
    closed = true;
  };

  const stream = new ReadableStream({
    start(controller) {
      // Send a heartbeat comment every 15s to keep connection alive
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          cleanup();
        }
      }, 15000);

      // Push new logs to the client as soon as they're written, instead of
      // polling the database on an interval per connection.
      onLog = (log) => {
        if (closed || !isAllowed(log.service)) return;
        try {
          const data = `data: ${JSON.stringify([log])}\n\n`;
          controller.enqueue(encoder.encode(data));
        } catch {
          cleanup();
        }
      };
      onNewLog(onLog);

      // Cleanup on abrupt client disconnect (abort signal fires before cancel())
      req.signal.addEventListener("abort", cleanup, { once: true });
    },
    cancel() {
      cleanup();
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
