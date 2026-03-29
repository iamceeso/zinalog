"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle,
  Save,
  ShieldCheck,
  ToggleLeft,
  ToggleRight,
  Trash2,
} from "lucide-react";
import ConfirmModal from "@/components/confirm-modal";

interface AccessAuditLog {
  id: number;
  actor_username: string | null;
  resource: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

const inputCls =
  "w-full bg-(--bg-card) border border-(--border) rounded-md px-3 py-2 text-[13px] text-foreground outline-none";

function formatDate(value: string): string {
  return new Date(value + (value.endsWith("Z") ? "" : "Z")).toLocaleString();
}

export default function AccessAuditPage() {
  const [enabled, setEnabled] = useState(true);
  const [retentionDays, setRetentionDays] = useState("30");
  const [logs, setLogs] = useState<AccessAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [purging, setPurging] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmScope, setConfirmScope] = useState<"all" | "expired" | null>(
    null,
  );

  const loadData = async () => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/access-audit");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to load access audit settings");
        return;
      }

      setEnabled(Boolean(data.enabled));
      setRetentionDays(String(data.retention_days ?? "30"));
      setLogs(data.logs ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const saveSettings = async () => {
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const res = await fetch("/api/access-audit", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, retention_days: retentionDays }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to save access audit settings");
        return;
      }

      setSaved(true);
      setMessage(
        data.trimmed
          ? `Saved. Removed ${data.trimmed} expired access audit log${data.trimmed === 1 ? "" : "s"}.`
          : "Saved access audit settings.",
      );
      setTimeout(() => setSaved(false), 2500);
      await loadData();
    } finally {
      setSaving(false);
    }
  };

  const purgeLogs = async (scope: "all" | "expired") => {
    setConfirmScope(null);
    setPurging(true);
    setError("");
    setMessage("");

    try {
      const res = await fetch(`/api/access-audit?scope=${scope}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to purge access audit logs");
        return;
      }

      setMessage(data.message ?? "Access audit logs deleted");
      await loadData();
    } finally {
      setPurging(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-bold mb-1">Access Audit</h1>
        <p className="text-[13px] text-(--text-muted)">
          Review dashboard access events and control how long those records are
          kept.
        </p>
      </div>

      <div className="bg-(--bg-card) border border-(--border) rounded-[10px] p-5 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[14px] font-semibold text-foreground flex items-center gap-2">
              <ShieldCheck size={16} />
              Access audit controls
            </div>
            <p className="text-[12px] text-(--text-dim) mt-1">
              Turn dashboard page-access auditing on or off and set the
              retention interval.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEnabled((value) => !value)}
            className="bg-transparent border border-(--border) rounded-md px-3 py-2 text-[12px] text-(--text-muted) cursor-pointer flex items-center gap-2"
          >
            {enabled ? (
              <ToggleRight size={20} color="var(--success)" />
            ) : (
              <ToggleLeft size={20} color="var(--text-dim)" />
            )}
            {enabled ? "Enabled" : "Disabled"}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[220px_auto] gap-3 items-end">
          <div>
            <label className="text-[12px] text-(--text-muted) block mb-1.5">
              Retention interval (days)
            </label>
            <input
              type="number"
              min="1"
              className={inputCls}
              suppressHydrationWarning
              value={retentionDays}
              onChange={(e) => setRetentionDays(e.target.value)}
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={saveSettings}
              disabled={saving}
              className="bg-(--accent-glow) rounded-md py-2 px-4 text-[13px] font-semibold text-white cursor-pointer disabled:opacity-70"
            >
              <span className="inline-flex items-center gap-1.5">
                {saved ? <CheckCircle size={14} /> : <Save size={14} />}
                {saved ? "Saved" : saving ? "Saving..." : "Save settings"}
              </span>
            </button>
            <button
              onClick={() => setConfirmScope("expired")}
              disabled={purging}
              className="bg-transparent border border-(--border) rounded-md py-2 px-4 text-[13px] text-(--text-muted) cursor-pointer disabled:opacity-70"
            >
              Delete expired logs now
            </button>
            <button
              onClick={() => setConfirmScope("all")}
              disabled={purging}
              className="bg-transparent border border-[rgba(248,81,73,0.3)] rounded-md py-2 px-4 text-[13px] text-(--error) cursor-pointer disabled:opacity-70 inline-flex items-center gap-1.5"
            >
              <Trash2 size={14} />
              Delete all access logs
            </button>
          </div>
        </div>

        {message && (
          <div className="px-3 py-2 rounded-md border border-[rgba(63,185,80,0.25)] bg-[rgba(63,185,80,0.1)] text-[12px] text-(--success)">
            {message}
          </div>
        )}
        {error && (
          <div className="px-3 py-2 rounded-md border border-[rgba(248,81,73,0.3)] bg-[rgba(248,81,73,0.1)] text-[12px] text-(--error)">
            {error}
          </div>
        )}
      </div>

      <div className="bg-(--bg-card) border border-(--border) rounded-[10px] overflow-hidden">
        <div className="px-4 py-3 border-b border-(--border)">
          <h2 className="text-[15px] font-semibold text-foreground">
            Recent access events
          </h2>
        </div>
        {loading ? (
          <div className="p-8 text-[13px] text-(--text-dim)">Loading…</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-[13px] text-(--text-dim)">
            No access audit logs recorded.
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-(--bg-surface) border-b border-(--border)">
                {["Time", "User", "Resource", "IP", "User Agent"].map(
                  (heading) => (
                    <th
                      key={heading}
                      className="px-3.5 py-2.5 text-left text-[11px] font-semibold text-(--text-dim) uppercase tracking-[0.5px]"
                    >
                      {heading}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {logs.map((log, index) => (
                <tr
                  key={log.id}
                  className={
                    index < logs.length - 1 ? "border-b border-(--border)" : ""
                  }
                >
                  <td className="px-3.5 py-3 text-[12px] text-(--text-dim)">
                    {formatDate(log.created_at)}
                  </td>
                  <td className="px-3.5 py-3 text-[12px] text-foreground">
                    {log.actor_username ?? "Unknown"}
                  </td>
                  <td className="px-3.5 py-3 text-[12px] text-(--text-muted)">
                    {log.resource ?? "N/A"}
                  </td>
                  <td className="px-3.5 py-3 text-[12px] text-(--text-dim)">
                    {log.ip_address ?? "unknown"}
                  </td>
                  <td className="px-3.5 py-3 text-[12px] text-(--text-dim)">
                    <span className="line-clamp-2">
                      {log.user_agent ?? "unknown"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {confirmScope && (
        <ConfirmModal
          title={
            confirmScope === "all"
              ? "Delete all access audit logs?"
              : "Delete expired access audit logs?"
          }
          message={
            confirmScope === "all"
              ? "This will permanently remove every recorded dashboard access event."
              : "This will permanently remove access audit logs older than the configured retention interval."
          }
          confirmLabel={
            confirmScope === "all" ? "Delete all" : "Delete expired"
          }
          danger
          onConfirm={() => void purgeLogs(confirmScope)}
          onCancel={() => setConfirmScope(null)}
        />
      )}
    </div>
  );
}
