"use client";

import { useEffect, useState } from "react";
import { Globe, Network, Radio } from "lucide-react";
import type {
  ClientMonitor,
  MonitorType,
  RecentMonitorCheck,
} from "./monitor-types";

const TYPE_ICON: Record<MonitorType, typeof Globe> = {
  http: Globe,
  tcp: Network,
  ping: Radio,
};

const STATUS_COLOR: Record<"up" | "down", string> = {
  up: "var(--success)",
  down: "var(--error)",
};

function formatRelativeTime(dt: string): string {
  const d = new Date(dt + (dt.endsWith("Z") ? "" : "Z"));
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 5) return "just now";
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

export default function LivePingsCard({
  monitors,
}: {
  monitors: ClientMonitor[];
}) {
  const [checks, setChecks] = useState<RecentMonitorCheck[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const res = await fetch("/api/monitors/recent-checks?limit=20");
      if (cancelled || !res.ok) return;
      const data = await res.json();
      if (cancelled) return;
      setChecks(data.checks ?? []);
    }

    void load();
    const interval = setInterval(() => void load(), 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const upCount = monitors.filter(
    (m) => m.is_active === 1 && m.status === "up"
  ).length;
  const downCount = monitors.filter(
    (m) => m.is_active === 1 && m.status === "down"
  ).length;
  const pausedCount = monitors.filter((m) => m.is_active !== 1).length;

  return (
    <div className="bg-(--bg-card) border border-(--border) rounded-[10px] overflow-hidden flex flex-col">
      <div className="px-4 py-3.5 border-b border-(--border) flex items-center justify-between">
        <span className="text-[13px] font-semibold text-foreground">
          Live Pings
        </span>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-(--text-dim)">
          <span className="w-1.5 h-1.5 rounded-full bg-(--success) animate-pulse" />
          Live
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 px-4 py-3 border-b border-(--border)">
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[15px] font-bold text-(--success)">
            {upCount}
          </span>
          <span className="text-[10px] text-(--text-dim) uppercase tracking-[0.5px]">
            Up
          </span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[15px] font-bold text-(--error)">
            {downCount}
          </span>
          <span className="text-[10px] text-(--text-dim) uppercase tracking-[0.5px]">
            Down
          </span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[15px] font-bold text-(--text-dim)">
            {pausedCount}
          </span>
          <span className="text-[10px] text-(--text-dim) uppercase tracking-[0.5px]">
            Paused
          </span>
        </div>
      </div>

      <div className="flex flex-col max-h-140 overflow-y-auto">
        {checks.length === 0 ? (
          <div className="p-6 text-center text-(--text-dim) text-[12px]">
            No pings recorded yet
          </div>
        ) : (
          checks.map((check, i) => {
            const Icon = TYPE_ICON[check.monitor_type];
            return (
              <div
                key={check.id}
                className={`flex items-center gap-2.5 px-4 py-2.5 ${i < checks.length - 1 ? "border-b border-(--border)" : ""}`}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: STATUS_COLOR[check.status] }}
                />
                <Icon size={12} className="text-(--text-dim) shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] text-foreground font-medium truncate">
                    {check.monitor_name}
                  </div>
                  <div className="text-[11px] text-(--text-dim) truncate">
                    {check.status === "up"
                      ? check.response_time_ms != null
                        ? `${check.response_time_ms}ms`
                        : "OK"
                      : (check.error ?? "Failed")}
                  </div>
                </div>
                <span className="text-[10px] text-(--text-dim) font-mono whitespace-nowrap shrink-0">
                  {formatRelativeTime(check.checked_at)}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
