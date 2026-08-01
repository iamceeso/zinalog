"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Pencil,
  Trash2,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import ConfirmModal from "@/components/confirm-modal";
import MonitorFormModal from "@/components/monitor-form-modal";
import MonitorResponseChart from "@/components/monitor-response-chart";
import StatCard from "@/components/stat-card";
import type { ClientMonitor, ClientMonitorCheck } from "@/components/monitor-types";

interface Stats {
  uptimePercent: number | null;
  avgResponseMs: number | null;
  totalChecks: number;
}

function formatDateTime(dt: string | null): string {
  if (!dt) return "Never";
  return new Date(dt + (dt.endsWith("Z") ? "" : "Z")).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function daysUntil(dt: string): number {
  return Math.ceil((new Date(dt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

const STATUS_COLOR: Record<string, string> = {
  up: "var(--success)",
  down: "var(--error)",
  pending: "var(--text-dim)",
};

export default function MonitorDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const monitorId = params.id;

  const [monitor, setMonitor] = useState<ClientMonitor | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [checks, setChecks] = useState<ClientMonitorCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [running, setRunning] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const applyMonitorResponse = useCallback(
    (data: {
      monitor: ClientMonitor;
      stats24h: Stats;
      recentChecks: ClientMonitorCheck[];
    }) => {
      setMonitor(data.monitor);
      setStats(data.stats24h);
      setChecks(data.recentChecks ?? []);
      setLoading(false);
    },
    []
  );

  const load = useCallback(async () => {
    const res = await fetch(`/api/monitors/${monitorId}`);
    if (res.status === 404) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    applyMonitorResponse(await res.json());
  }, [monitorId, applyMonitorResponse]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const res = await fetch(`/api/monitors/${monitorId}`);
      if (cancelled) return;
      if (res.status === 404) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      applyMonitorResponse(await res.json());
    }

    void run();
    const interval = setInterval(() => void run(), 15000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [monitorId, applyMonitorResponse]);

  const handleRunNow = async () => {
    setRunning(true);
    try {
      await fetch(`/api/monitors/${monitorId}/test`, { method: "POST" });
      await load();
    } finally {
      setRunning(false);
    }
  };

  const handleDelete = async () => {
    setConfirmDelete(false);
    await fetch(`/api/monitors/${monitorId}`, { method: "DELETE" });
    router.push("/dashboard/monitors");
  };

  if (loading) {
    return (
      <div className="p-10 text-center text-(--text-dim) text-[14px]">
        Loading…
      </div>
    );
  }

  if (notFound || !monitor) {
    return (
      <div className="flex flex-col gap-4">
        <Link
          href="/dashboard/monitors"
          className="inline-flex items-center gap-1.5 text-[13px] text-(--text-muted) no-underline"
        >
          <ArrowLeft size={14} /> Back to Monitors
        </Link>
        <div className="p-10 text-center text-(--text-dim) text-[14px]">
          Monitor not found
        </div>
      </div>
    );
  }

  const sslDays = monitor.ssl_expires_at ? daysUntil(monitor.ssl_expires_at) : null;

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/dashboard/monitors"
        className="inline-flex items-center gap-1.5 text-[13px] text-(--text-muted) no-underline w-fit"
      >
        <ArrowLeft size={14} /> Back to Monitors
      </Link>

      <div className="flex justify-between items-start flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: STATUS_COLOR[monitor.status] }}
            />
            <h1 className="text-[22px] font-bold">{monitor.name}</h1>
          </div>
          <p className="text-[13px] text-(--text-muted) mt-1 font-mono">
            {monitor.type.toUpperCase()} · {monitor.target}
            {monitor.port ? `:${monitor.port}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleRunNow}
            disabled={running}
            className="flex items-center gap-1.5 bg-(--bg-card) border border-(--border) rounded-md py-2 px-3.5 text-[13px] text-(--text-muted) cursor-pointer"
          >
            <RefreshCw size={14} className={running ? "animate-spin" : ""} />
            Run Now
          </button>
          <button
            onClick={() => setShowEdit(true)}
            className="flex items-center gap-1.5 bg-(--bg-card) border border-(--border) rounded-md py-2 px-3.5 text-[13px] text-(--text-muted) cursor-pointer"
          >
            <Pencil size={14} />
            Edit
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-1.5 bg-(--bg-card) border border-(--border) rounded-md py-2 px-3.5 text-[13px] text-(--error) cursor-pointer"
          >
            <Trash2 size={14} />
            Delete
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Status"
          value={monitor.status === "up" ? "Up" : monitor.status === "down" ? "Down" : "Pending"}
          accent={monitor.status === "up" ? "success" : monitor.status === "down" ? "error" : "default"}
        />
        <StatCard
          title="Uptime (24h)"
          value={stats?.uptimePercent != null ? `${stats.uptimePercent}%` : "—"}
          accent="info"
        />
        <StatCard
          title="Avg Response (24h)"
          value={stats?.avgResponseMs != null ? `${stats.avgResponseMs}ms` : "—"}
        />
        {monitor.type === "http" && monitor.target.startsWith("https:") ? (
          <StatCard
            title="SSL Expiry"
            value={sslDays != null ? `${sslDays}d` : "—"}
            subtitle={monitor.ssl_issuer ?? undefined}
            icon={
              monitor.ssl_valid === 0 ? (
                <ShieldAlert size={16} />
              ) : (
                <ShieldCheck size={16} />
              )
            }
            accent={
              sslDays != null && sslDays < 14
                ? "warning"
                : monitor.ssl_valid === 0
                  ? "error"
                  : "success"
            }
          />
        ) : (
          <StatCard title="Last Check" value={formatDateTime(monitor.last_check_at)} />
        )}
      </div>

      <div className="bg-(--bg-card) border border-(--border) rounded-[10px] px-5 py-4 flex flex-col gap-3">
        <div className="text-[13px] font-semibold text-foreground">
          Response Time
        </div>
        <MonitorResponseChart checks={checks} />
      </div>

      <div className="bg-(--bg-card) border border-(--border) rounded-[10px] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-(--border) text-[13px] font-semibold text-foreground">
          Recent Checks
        </div>
        {checks.length === 0 ? (
          <div className="p-10 text-center text-(--text-dim) text-[13px]">
            No checks recorded yet
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-(--bg-surface) border-b border-(--border)">
                {["Status", "Code", "Response Time", "Error", "Checked At"].map((h) => (
                  <th
                    key={h}
                    className="px-3.5 py-2.5 text-left text-[11px] font-semibold text-(--text-dim) uppercase tracking-[0.5px]"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {checks.slice(0, 30).map((check, i) => (
                <tr
                  key={check.id}
                  className={i < 29 && i < checks.length - 1 ? "border-b border-(--border)" : ""}
                >
                  <td className="px-3.5 py-2.5">
                    <span
                      className="inline-flex items-center gap-1.5 text-[12px] font-semibold"
                      style={{ color: STATUS_COLOR[check.status] }}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: STATUS_COLOR[check.status] }}
                      />
                      {check.status === "up" ? "Up" : "Down"}
                    </span>
                  </td>
                  <td className="px-3.5 py-2.5 text-[12px] text-(--text-muted) font-mono">
                    {check.status_code ?? "—"}
                  </td>
                  <td className="px-3.5 py-2.5 text-[12px] text-(--text-muted) [font-variant-numeric:tabular-nums]">
                    {check.response_time_ms != null ? `${check.response_time_ms}ms` : "—"}
                  </td>
                  <td className="px-3.5 py-2.5 text-[12px] text-(--error) max-w-70 truncate">
                    {check.error ?? ""}
                  </td>
                  <td className="px-3.5 py-2.5 text-[11px] text-(--text-dim) font-mono whitespace-nowrap">
                    {formatDateTime(check.checked_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showEdit && (
        <MonitorFormModal
          monitor={monitor}
          onClose={() => setShowEdit(false)}
          onSaved={(updated) => {
            setMonitor(updated);
            setShowEdit(false);
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Delete Monitor"
          message={`"${monitor.name}" and its check history will be permanently deleted. This cannot be undone.`}
          confirmLabel="Delete Monitor"
          danger
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
