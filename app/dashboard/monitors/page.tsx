"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Trash2,
  Pencil,
  RefreshCw,
  Pause,
  Play,
  Radio,
  Globe,
  Network,
} from "lucide-react";
import ConfirmModal from "@/components/confirm-modal";
import MonitorFormModal from "@/components/monitor-form-modal";
import type { ClientMonitor, MonitorStatus, MonitorType } from "@/components/monitor-types";

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

const TYPE_ICON: Record<MonitorType, typeof Globe> = {
  http: Globe,
  tcp: Network,
  ping: Radio,
};

const TYPE_LABEL: Record<MonitorType, string> = {
  http: "HTTP",
  tcp: "TCP",
  ping: "Ping",
};

function StatusPill({ status }: { status: MonitorStatus }) {
  const cfg: Record<MonitorStatus, { label: string; cls: string }> = {
    up: {
      label: "Up",
      cls: "bg-[rgba(63,185,80,0.15)] text-(--success) border-[rgba(63,185,80,0.3)]",
    },
    down: {
      label: "Down",
      cls: "bg-[rgba(248,81,73,0.15)] text-(--error) border-[rgba(248,81,73,0.3)]",
    },
    pending: {
      label: "Pending",
      cls: "bg-[rgba(139,148,158,0.15)] text-(--text-dim) border-[rgba(139,148,158,0.3)]",
    },
  };
  const { label, cls } = cfg[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-[11px] font-semibold border ${cls}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          status === "up"
            ? "bg-(--success)"
            : status === "down"
              ? "bg-(--error)"
              : "bg-(--text-dim)"
        }`}
      />
      {label}
    </span>
  );
}

export default function MonitorsPage() {
  const [monitors, setMonitors] = useState<ClientMonitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFormFor, setShowFormFor] = useState<ClientMonitor | "new" | null>(
    null
  );
  const [runningId, setRunningId] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadMonitors() {
      const res = await fetch("/api/monitors");
      const data = await res.json();
      if (cancelled) return;
      setMonitors(data.monitors ?? []);
      setLoading(false);
    }

    void loadMonitors();
    const interval = setInterval(() => void loadMonitors(), 15000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const handleSaved = (monitor: ClientMonitor) => {
    setShowFormFor(null);
    setMonitors((prev) => {
      const exists = prev.some((m) => m.id === monitor.id);
      return exists
        ? prev.map((m) => (m.id === monitor.id ? monitor : m))
        : [...prev, monitor].sort((a, b) => a.name.localeCompare(b.name));
    });
  };

  const handleDelete = (monitor: ClientMonitor) => {
    setConfirm({
      title: "Delete Monitor",
      message: `"${monitor.name}" and its check history will be permanently deleted. This cannot be undone.`,
      confirmLabel: "Delete Monitor",
      onConfirm: async () => {
        setConfirm(null);
        await fetch(`/api/monitors/${monitor.id}`, { method: "DELETE" });
        setMonitors((prev) => prev.filter((m) => m.id !== monitor.id));
      },
    });
  };

  const handleToggleActive = async (monitor: ClientMonitor) => {
    const res = await fetch(`/api/monitors/${monitor.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: monitor.name,
        type: monitor.type,
        target: monitor.target,
        port: monitor.port,
        method: monitor.method,
        expected_status: monitor.expected_status,
        interval_seconds: monitor.interval_seconds,
        timeout_seconds: monitor.timeout_seconds,
        retries: monitor.retries,
        follow_redirects: monitor.follow_redirects === 1,
        verify_ssl: monitor.verify_ssl === 1,
        notify_enabled: monitor.notify_enabled === 1,
        is_active: monitor.is_active !== 1,
      }),
    });
    const data = await res.json();
    if (data.monitor) handleSaved(data.monitor);
  };

  const handleRunNow = async (monitor: ClientMonitor) => {
    setRunningId(monitor.id);
    try {
      await fetch(`/api/monitors/${monitor.id}/test`, { method: "POST" });
      const res = await fetch("/api/monitors");
      const data = await res.json();
      setMonitors(data.monitors ?? []);
    } finally {
      setRunningId(null);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-[22px] font-bold mb-1">Monitors</h1>
          <p className="text-[13px] text-(--text-muted)">
            Watch your websites, APIs, and services for downtime
          </p>
        </div>
        <button
          onClick={() => setShowFormFor("new")}
          className="flex items-center gap-1.5 bg-(--accent-glow) border-none rounded-md py-2.25 px-4 text-[13px] font-semibold text-white cursor-pointer"
        >
          <Plus size={15} />
          New Monitor
        </button>
      </div>

      <div className="bg-(--bg-card) border border-(--border) rounded-[10px] overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-(--text-dim) text-[14px]">
            Loading…
          </div>
        ) : monitors.length === 0 ? (
          <div className="p-15 text-center text-(--text-dim)">
            <Globe size={32} className="mx-auto mb-3 opacity-30 block" />
            <div className="text-[14px]">No monitors yet</div>
            <div className="text-[12px] mt-1">
              Add one to start tracking uptime
            </div>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-(--bg-surface) border-b border-(--border)">
                {[
                  "Status",
                  "Name",
                  "Type",
                  "Target",
                  "Interval",
                  "Response",
                  "Last Check",
                  "Actions",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-3.5 py-2.5 text-left text-[11px] font-semibold text-(--text-dim) uppercase tracking-[0.5px] whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monitors.map((monitor, i) => {
                const Icon = TYPE_ICON[monitor.type];
                return (
                  <tr
                    key={monitor.id}
                    className={`${i < monitors.length - 1 ? "border-b border-(--border)" : ""} ${monitor.is_active ? "opacity-100" : "opacity-50"}`}
                  >
                    <td className="px-3.5 py-3">
                      <StatusPill status={monitor.status} />
                    </td>
                    <td className="px-3.5 py-3 text-[13px] font-semibold text-foreground">
                      <Link
                        href={`/dashboard/monitors/${monitor.id}`}
                        className="no-underline text-foreground hover:text-(--accent)"
                      >
                        {monitor.name}
                      </Link>
                    </td>
                    <td className="px-3.5 py-3">
                      <span className="inline-flex items-center gap-1.5 text-[12px] text-(--text-muted)">
                        <Icon size={13} />
                        {TYPE_LABEL[monitor.type]}
                      </span>
                    </td>
                    <td className="px-3.5 py-3 text-[12px] text-(--text-muted) max-w-55 truncate">
                      {monitor.target}
                      {monitor.port ? `:${monitor.port}` : ""}
                    </td>
                    <td className="px-3.5 py-3 text-[12px] text-(--text-muted) whitespace-nowrap">
                      {monitor.interval_seconds}s
                    </td>
                    <td className="px-3.5 py-3 text-[12px] text-(--text-muted) [font-variant-numeric:tabular-nums]">
                      {monitor.last_response_time_ms != null
                        ? `${monitor.last_response_time_ms}ms`
                        : "—"}
                    </td>
                    <td className="px-3.5 py-3 text-[11px] text-(--text-dim) font-mono whitespace-nowrap">
                      {formatDateTime(monitor.last_check_at)}
                    </td>
                    <td className="px-3.5 py-3">
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => handleRunNow(monitor)}
                          disabled={runningId === monitor.id}
                          title="Run check now"
                          className="bg-transparent border border-(--border) rounded-[5px] px-2 py-1 text-(--text-muted) cursor-pointer flex items-center"
                        >
                          <RefreshCw
                            size={13}
                            className={runningId === monitor.id ? "animate-spin" : ""}
                          />
                        </button>
                        <button
                          onClick={() => handleToggleActive(monitor)}
                          title={monitor.is_active ? "Pause" : "Resume"}
                          className="bg-transparent border border-(--border) rounded-[5px] px-2 py-1 text-(--text-muted) cursor-pointer flex items-center"
                        >
                          {monitor.is_active ? <Pause size={13} /> : <Play size={13} />}
                        </button>
                        <button
                          onClick={() => setShowFormFor(monitor)}
                          title="Edit"
                          className="bg-transparent border border-(--border) rounded-[5px] px-2 py-1 text-(--text-muted) cursor-pointer flex items-center"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => handleDelete(monitor)}
                          title="Delete"
                          className="bg-transparent border border-(--border) rounded-[5px] px-2 py-1 text-(--error) cursor-pointer flex items-center"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showFormFor && (
        <MonitorFormModal
          monitor={showFormFor === "new" ? undefined : showFormFor}
          onClose={() => setShowFormFor(null)}
          onSaved={handleSaved}
        />
      )}

      {confirm && (
        <ConfirmModal
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          danger
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
