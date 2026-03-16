"use client";

import { useState, useEffect, useRef } from "react";
import LevelBadge from "./level-badge";
import type { Log } from "@/lib/db";

function formatTime(dt: string): string {
  const d = new Date(dt + (dt.endsWith("Z") ? "" : "Z"));
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

interface LiveLogsProps {
  className?: string;
  // Controlled mode: caller manages the SSE and passes data in
  logs?: Log[];
  connected?: boolean;
}

export default function LiveLogs({
  className = "",
  logs: externalLogs,
  connected: externalConnected,
}: LiveLogsProps) {
  const controlled = externalLogs !== undefined;

  const [internalLogs, setInternalLogs] = useState<Log[]>([]);
  const [internalConnected, setInternalConnected] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Self-managed SSE — only used when not in controlled mode
  useEffect(() => {
    if (controlled) return;
    const es = new EventSource("/api/stream");
    es.onopen = () => setInternalConnected(true);
    es.onerror = () => setInternalConnected(false);
    es.onmessage = (event) => {
      const newLogs: Log[] = JSON.parse(event.data);
      setInternalLogs((prev) => [...prev, ...newLogs].slice(-200));
    };
    return () => {
      es.close();
      setInternalConnected(false);
    };
  }, [controlled]);

  const logs = controlled ? externalLogs! : internalLogs;
  const connected = controlled
    ? (externalConnected ?? false)
    : internalConnected;

  // Auto-scroll to top (newest logs prepended)
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div
      className={`bg-background border border-(--border) rounded-lg overflow-hidden flex flex-col ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-(--bg-surface) border-b border-(--border) shrink-0">
        <span className="text-[13px] font-semibold">Live Stream</span>
        <div className="flex items-center gap-1.5">
          <span
            className={`w-1.75 h-1.75 rounded-full ${connected ? "bg-(--success) pulse-dot" : "bg-(--text-dim)"}`}
          />
          <span
            className={`text-[11px] ${connected ? "text-(--success)" : "text-(--text-dim)"}`}
          >
            {connected ? "Connected" : "Disconnected"}
          </span>
        </div>
      </div>

      {/* Log stream */}
      <div className="flex-1 min-h-0 overflow-y-auto font-mono text-[12px] py-2">
        {logs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-(--text-dim) text-[13px] font-sans">
            Waiting for logs…
          </div>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              className="animate-fade-in flex items-baseline gap-2.5 px-3.5 py-1 border-b border-[rgba(48,54,61,0.4)]"
            >
              <span className="text-(--text-dim) min-w-17.5">
                {formatTime(log.created_at)}
              </span>
              <LevelBadge level={log.level} size="sm" />
              {log.service && (
                <span className="text-(--accent) min-w-20 max-w-25 overflow-hidden text-ellipsis whitespace-nowrap">
                  {log.service}
                </span>
              )}
              <span className="text-foreground flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                {log.message}
              </span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
