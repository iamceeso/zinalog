"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, Ban, Key, Copy, Check } from "lucide-react";
import ConfirmModal from "@/components/confirm-modal";
import DialogShell from "@/components/dialog-shell";

interface ApiKey {
  id: number;
  name: string;
  key: string;
  service: string | null;
  allowed_ips: string | null;
  rate_limit: number;
  is_active: number;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  usage_count: number;
}

function formatDate(dt: string): string {
  return new Date(dt + (dt.endsWith("Z") ? "" : "Z")).toLocaleDateString(
    "en-US",
    {
      month: "short",
      day: "numeric",
      year: "numeric",
    },
  );
}

function formatDateTime(dt: string): string {
  return new Date(dt + (dt.endsWith("Z") ? "" : "Z")).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function toLocalDateTimeValue(dt: string): string {
  const d = new Date(dt + (dt.endsWith("Z") ? "" : "Z"));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getKeyStatus(key: ApiKey): "active" | "expired" | "revoked" {
  if (!key.is_active) return "revoked";
  if (key.expires_at && new Date(key.expires_at).getTime() <= Date.now())
    return "expired";
  return "active";
}

const inputCls =
  "w-full bg-(--bg-card) border border-(--border) rounded-md px-3 py-2 text-[13px] text-(--text-base) outline-none";
const labelCls = "text-[12px] text-(--text-muted) block mb-1.5";

function NewKeyModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (key: ApiKey, rawKey: string) => void;
}) {
  const [name, setName] = useState("");
  const [service, setService] = useState("");
  const [allowedIps, setAllowedIps] = useState("");
  const [rateLimit, setRateLimit] = useState("1000");
  const [expiresAt, setExpiresAt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          service: service.trim() || null,
          allowed_ips: allowedIps.trim() || null,
          rate_limit: parseInt(rateLimit, 10) || 1000,
          expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create key");
        return;
      }
      onCreated(data.key, data.key.key);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DialogShell
      title="Create API Key"
      onClose={onClose}
      widthClassName="w-full max-w-[560px]"
      footer={
        <>
          <button
            onClick={onClose}
            className="bg-(--bg-card) border border-(--border) rounded-md py-2.25 px-4 text-[13px] text-(--text-muted) cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={loading}
            className={`bg-(--accent-glow) border-none rounded-md py-2.25 px-4 text-[13px] font-semibold text-white ${loading ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}
          >
            {loading ? "Creating…" : "Create Key"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <div>
          <label className={labelCls}>Name *</label>
          <input
            type="text"
            placeholder="e.g. billing-api-prod"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputCls}
          />
        </div>

        <div>
          <label className={labelCls}>Restrict to Service (optional)</label>
          <input
            type="text"
            placeholder="e.g. billing-api (leave blank for all)"
            value={service}
            onChange={(e) => setService(e.target.value)}
            className={inputCls}
          />
        </div>

        <div>
          <label className={labelCls}>
            Allowed IPs (optional, comma-separated)
          </label>
          <input
            type="text"
            placeholder="e.g. 192.168.1.1, 10.0.0.5"
            value={allowedIps}
            onChange={(e) => setAllowedIps(e.target.value)}
            className={inputCls}
          />
        </div>

        <div>
          <label className={labelCls}>Rate Limit (requests/minute)</label>
          <input
            type="number"
            value={rateLimit}
            onChange={(e) => setRateLimit(e.target.value)}
            className={inputCls}
          />
        </div>

        <div>
          <label className={labelCls}>Expiry Date (optional)</label>
          <input
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            min={toLocalDateTimeValue(new Date().toISOString())}
            className={inputCls}
          />
        </div>

        {error && (
          <div className="px-3 py-2 bg-[rgba(248,81,73,0.1)] border border-[rgba(248,81,73,0.3)] rounded-md text-[12px] text-(--error)">
            {error}
          </div>
        )}
      </div>
    </DialogShell>
  );
}

function KeyRevealModal({
  apiKey,
  onClose,
}: {
  apiKey: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <DialogShell
      title="API Key Created"
      description="Copy this key now — it will not be shown again."
      onClose={onClose}
      widthClassName="w-full max-w-[640px]"
      footer={
        <button
          onClick={onClose}
          className="bg-(--accent-glow) border-none rounded-md py-2.25 px-4 text-[13px] font-semibold text-white cursor-pointer"
        >
          Done
        </button>
      }
    >
      <div className="flex gap-2 bg-background border border-(--border) rounded-lg px-3.5 py-3">
        <code className="flex-1 text-[12px] text-(--success) font-mono break-all">
          {apiKey}
        </code>
        <button
          onClick={copy}
          className={`shrink-0 bg-transparent border-none cursor-pointer p-1 flex items-center ${copied ? "text-(--success)" : "text-(--text-muted)"}`}
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
        </button>
      </div>
    </DialogShell>
  );
}

export default function KeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [revealKey, setRevealKey] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadKeys() {
      const res = await fetch("/api/keys");
      const data = await res.json();

      if (cancelled) {
        return;
      }

      setKeys(data.keys ?? []);
      setLoading(false);
    }

    void loadKeys();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleDelete = async (id: number) => {
    setConfirm({
      title: "Delete API Key",
      message:
        "This key will be permanently deleted and any applications using it will stop being able to send logs. This cannot be undone.",
      confirmLabel: "Delete Key",
      onConfirm: async () => {
        setConfirm(null);
        await fetch(`/api/keys/${id}`, { method: "DELETE" });
        setKeys((prev) => prev.filter((k) => k.id !== id));
      },
    });
  };

  const handleRevoke = async (id: number) => {
    setConfirm({
      title: "Revoke API Key",
      message:
        "This key will stop working immediately. Applications using it will receive 401 errors. You can delete the key afterward.",
      confirmLabel: "Revoke Key",
      onConfirm: async () => {
        setConfirm(null);
        await fetch(`/api/keys/${id}?action=revoke`, { method: "DELETE" });
        setKeys((prev) =>
          prev.map((k) => (k.id === id ? { ...k, is_active: 0 } : k)),
        );
      },
    });
  };

  const handleCreated = (key: ApiKey, rawKey: string) => {
    setShowNewModal(false);
    setRevealKey(rawKey);
    setKeys((prev) => [key, ...prev]);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-[22px] font-bold mb-1">API Keys</h1>
          <p className="text-[13px] text-(--text-muted)">
            Manage authentication keys for your applications
          </p>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="flex items-center gap-1.5 bg-(--accent-glow) border-none rounded-md py-2.25 px-4 text-[13px] font-semibold text-white cursor-pointer"
        >
          <Plus size={15} />
          New Key
        </button>
      </div>

      {/* Keys table */}
      <div className="bg-(--bg-card) border border-(--border) rounded-[10px] overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-(--text-dim) text-[14px]">
            Loading…
          </div>
        ) : keys.length === 0 ? (
          <div className="p-15 text-center text-(--text-dim)">
            <Key size={32} className="mx-auto mb-3 opacity-30 block" />
            <div className="text-[14px]">No API keys yet</div>
            <div className="text-[12px] mt-1">
              Create one to start sending logs
            </div>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-(--bg-surface) border-b border-(--border)">
                {[
                  "Name",
                  "Key",
                  "Service",
                  "Rate Limit",
                  "Expires",
                  "Usage",
                  "Created",
                  "Status",
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
              {keys.map((key, i) => {
                const status = getKeyStatus(key);

                return (
                  <tr
                    key={key.id}
                    className={`${i < keys.length - 1 ? "border-b border-(--border)" : ""} ${status === "revoked" ? "opacity-50" : "opacity-100"}`}
                  >
                    <td className="px-3.5 py-3 text-[13px] font-semibold text-foreground">
                      {key.name}
                    </td>
                    <td className="px-3.5 py-3">
                      <code className="text-[11px] text-(--text-dim) font-mono">
                        {key.key}
                      </code>
                    </td>
                    <td
                      className={`px-3.5 py-3 text-[12px] ${key.service ? "text-(--accent)" : "text-(--text-dim)"}`}
                    >
                      {key.service ?? "All"}
                    </td>
                    <td className="px-3.5 py-3 text-[12px] text-(--text-muted)">
                      {key.rate_limit}/min
                    </td>
                    <td className="px-3.5 py-3 text-[11px] text-(--text-dim) font-mono whitespace-nowrap">
                      {key.expires_at
                        ? formatDateTime(key.expires_at)
                        : "Never"}
                    </td>
                    <td className="px-3.5 py-3 text-[12px] text-(--text-muted) [font-variant-numeric:tabular-nums]">
                      {key.usage_count.toLocaleString()}
                    </td>
                    <td className="px-3.5 py-3 text-[11px] text-(--text-dim) font-mono whitespace-nowrap">
                      {formatDate(key.created_at)}
                    </td>
                    <td className="px-3.5 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-sm text-[11px] font-semibold ${
                          status === "active"
                            ? "bg-[rgba(63,185,80,0.15)] text-(--success) border border-[rgba(63,185,80,0.3)]"
                            : status === "expired"
                              ? "bg-[rgba(210,153,34,0.15)] text-(--warning) border border-[rgba(210,153,34,0.3)]"
                              : "bg-[rgba(139,148,158,0.15)] text-(--text-dim) border border-[rgba(139,148,158,0.3)]"
                        }`}
                      >
                        {status === "active"
                          ? "Active"
                          : status === "expired"
                            ? "Expired"
                            : "Revoked"}
                      </span>
                    </td>
                    <td className="px-3.5 py-3">
                      <div className="flex gap-1.5">
                        {status === "active" ? (
                          <button
                            onClick={() => handleRevoke(key.id)}
                            title="Revoke"
                            className="bg-transparent border border-(--border) rounded-[5px] px-2 py-1 text-(--warning) cursor-pointer flex items-center"
                          >
                            <Ban size={13} />
                          </button>
                        ) : null}
                        <button
                          onClick={() => handleDelete(key.id)}
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

      {/* Quick guide */}
      <div className="bg-(--bg-card) border border-(--border) rounded-[10px] px-5 py-4.5">
        <div className="text-[13px] font-semibold mb-3.5 text-foreground">
          Integration Examples
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-[11px] text-(--text-dim) mb-2">
              Node.js / fetch
            </div>
            <pre className="bg-background border border-(--border) rounded-md px-3 py-2.5 text-[11px] text-(--text-muted) overflow-auto font-mono leading-[1.6]">
              {`fetch("http://your-zinalog-server/api/logs", {
  method: "POST",
  headers: {
    "Authorization": "Bearer YOUR_KEY",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    level: "error",
    message: "Something broke",
    service: "my-api"
  })
})`}
            </pre>
          </div>
          <div>
            <div className="text-[11px] text-(--text-dim) mb-2">
              Python / requests
            </div>
            <pre className="bg-background border border-(--border) rounded-md px-3 py-2.5 text-[11px] text-(--text-muted) overflow-auto font-mono leading-[1.6]">
              {`import requests

requests.post(
  "http://your-zinalog-server/api/logs",
  headers={
    "Authorization": "Bearer YOUR_KEY"
  },
  json={
    "level": "error",
    "message": "DB connection failed",
    "service": "worker",
    "metadata": {"retries": 3}
  }
)`}
            </pre>
          </div>
        </div>
      </div>

      {showNewModal && (
        <NewKeyModal
          onClose={() => setShowNewModal(false)}
          onCreated={handleCreated}
        />
      )}

      {revealKey && (
        <KeyRevealModal apiKey={revealKey} onClose={() => setRevealKey(null)} />
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
