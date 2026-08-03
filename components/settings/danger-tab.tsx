"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle, Trash2, XCircle } from "lucide-react";
import ConfirmModal from "@/components/confirm-modal";
import { inputBase, SectionHeader } from "./shared";

export default function DangerTab() {
  const [purgeDays, setPurgeDays] = useState("30");
  const [purgeResult, setPurgeResult] = useState<{
    ok: boolean;
    msg: string;
  } | null>(null);
  const [purging, setPurging] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const doPurge = async () => {
    setShowConfirm(false);
    setPurging(true);
    setPurgeResult(null);
    const res = await fetch(`/api/settings?days=${purgeDays}`, {
      method: "DELETE",
    });
    const data = await res.json();
    setPurgeResult({
      ok: res.ok,
      msg: data.message ?? (res.ok ? "Done" : "Error"),
    });
    setPurging(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid rgba(248,81,73,0.25)",
          borderRadius: 10,
          padding: "22px 24px",
        }}
      >
        <SectionHeader
          icon={<AlertTriangle size={15} />}
          title="Danger Zone"
          description="These actions are permanent and cannot be undone. Proceed with caution."
        />
        <div
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "16px 18px",
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text-base)",
              marginBottom: 4,
            }}
          >
            Purge old logs
          </div>
          <p
            style={{
              fontSize: 12,
              color: "var(--text-dim)",
              margin: "0 0 16px",
              lineHeight: 1.6,
            }}
          >
            Permanently delete all log entries older than the specified number
            of days. The deleted logs cannot be recovered.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                fontSize: 13,
                color: "var(--text-muted)",
                whiteSpace: "nowrap",
              }}
            >
              Delete logs older than
            </span>
            <div style={{ position: "relative", width: 88 }}>
              <input
                type="number"
                min="1"
                value={purgeDays}
                onChange={(e) => setPurgeDays(e.target.value)}
                style={{
                  ...inputBase,
                  paddingRight: 22,
                  width: "100%",
                }}
              />
              <span
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  fontSize: 11,
                  color: "var(--text-dim)",
                  pointerEvents: "none",
                }}
              >
                d
              </span>
            </div>
            <button
              onClick={() => setShowConfirm(true)}
              disabled={purging}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                background: "rgba(248,81,73,0.1)",
                border: "1px solid rgba(248,81,73,0.3)",
                borderRadius: 8,
                padding: "9px 16px",
                fontSize: 13,
                fontWeight: 600,
                color: "var(--error)",
                cursor: purging ? "not-allowed" : "pointer",
                opacity: purging ? 0.65 : 1,
                whiteSpace: "nowrap",
              }}
            >
              <Trash2 size={13} />
              {purging ? "Deleting…" : "Purge logs"}
            </button>
          </div>
          {purgeResult && (
            <div
              style={{
                marginTop: 14,
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
                color: purgeResult.ok ? "var(--success)" : "var(--error)",
                padding: "9px 14px",
                background: purgeResult.ok
                  ? "rgba(63,185,80,0.08)"
                  : "rgba(248,81,73,0.08)",
                border: `1px solid ${purgeResult.ok ? "rgba(63,185,80,0.2)" : "rgba(248,81,73,0.2)"}`,
                borderRadius: 6,
              }}
            >
              {purgeResult.ok ? (
                <CheckCircle size={13} />
              ) : (
                <XCircle size={13} />
              )}
              {purgeResult.msg}
            </div>
          )}
        </div>
      </div>

      {showConfirm && (
        <ConfirmModal
          title="Purge Old Logs"
          message={`This will permanently delete all logs older than ${purgeDays} day${purgeDays === "1" ? "" : "s"}. This action cannot be undone.`}
          confirmLabel="Yes, purge logs"
          danger
          onConfirm={doPurge}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}
