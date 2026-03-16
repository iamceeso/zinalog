"use client";

import { useState, useEffect, useCallback } from "react";
import StatCard from "@/components/stat-card";
import LiveLogs from "@/components/live-logs";
import {
  ActivityChart,
  LevelPieChart,
  ServicesBarChart,
  RecentErrorsList,
  CardShell,
} from "@/components/dashboard-charts";
import { Activity, AlertTriangle, Server, ScrollText } from "lucide-react";
import type { Log } from "@/lib/db";
import type { getStats } from "@/lib/db";

type Stats = Awaited<ReturnType<typeof getStats>>;

interface OverviewClientProps {
  initialStats: Stats;
}

export default function OverviewClient({ initialStats }: OverviewClientProps) {
  const [stats, setStats] = useState<Stats>(initialStats);
  const [logs, setLogs] = useState<Log[]>([]);
  const [connected, setConnected] = useState(false);

  const refreshStats = useCallback(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then((data: Stats) => setStats(data))
      .catch(() => {
        /* silently ignore — stale data is fine */
      });
  }, []);

  useEffect(() => {
    const es = new EventSource("/api/stream");

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    es.onmessage = (event) => {
      const newLogs: Log[] = JSON.parse(event.data);
      // Update live stream
      setLogs((prev) => [...newLogs, ...prev].slice(0, 200));
      // Refresh stats so charts reflect the new data
      refreshStats();
    };

    return () => {
      es.close();
      setConnected(false);
    };
  }, [refreshStats]);

  const errorRate =
    stats.totalToday > 0
      ? Math.round((stats.errorsToday / stats.totalToday) * 100)
      : 0;

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-56px)] overflow-hidden pb-4">
      {/* Header */}
      <div className="shrink-0">
        <h1 className="text-[22px] font-bold mb-0.5">Overview</h1>
        <p className="text-[13px] text-(--text-muted)">
          Last 24 hours · All services
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3 shrink-0">
        <StatCard
          title="Total Logs"
          value={stats.total}
          subtitle="All time"
          icon={<ScrollText size={18} />}
        />
        <StatCard
          title="Today"
          value={stats.totalToday}
          subtitle="Last 24 hours"
          icon={<Activity size={18} />}
          accent="info"
        />
        <StatCard
          title="Errors Today"
          value={stats.errorsToday}
          subtitle={`${errorRate}% error rate`}
          icon={<AlertTriangle size={18} />}
          accent={stats.errorsToday > 0 ? "error" : "success"}
        />
        <StatCard
          title="Services"
          value={stats.services}
          subtitle="Unique services"
          icon={<Server size={18} />}
          accent="success"
        />
      </div>

      {/* Main grid */}
      <div className="flex-1 min-h-0 grid grid-cols-[1fr_340px] gap-3">
        {/* Left column — charts + recent errors */}
        <div className="flex flex-col gap-3 min-h-0 overflow-y-auto pr-0.5">
          <CardShell title="Activity (last 24h)">
            <ActivityChart hourlyByLevel={stats.hourlyByLevel} />
          </CardShell>

          <div className="grid grid-cols-2 gap-3 shrink-0">
            <CardShell title="Level Distribution (24h)">
              <LevelPieChart byLevel={stats.byLevel} />
            </CardShell>
            <CardShell title="Top Services">
              <ServicesBarChart byService={stats.byService} />
            </CardShell>
          </div>

          <CardShell title="Recent Errors">
            <RecentErrorsList errors={stats.recentErrors} />
          </CardShell>
        </div>

        {/* Right column — live stream */}
        <div className="min-h-0 flex flex-col">
          <LiveLogs
            logs={logs}
            connected={connected}
            className="flex-1 min-h-0"
          />
        </div>
      </div>
    </div>
  );
}
