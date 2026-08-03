"use client";

import { Database, Server, Settings } from "lucide-react";
import { Field, inputBase, SaveBar, SectionHeader } from "./shared";
import type { GeneralSettings } from "./types";

export default function GeneralTab({
  general,
  setGeneral,
  saveGeneral,
  saving,
  saved,
}: {
  general: GeneralSettings;
  setGeneral: (update: (s: GeneralSettings) => GeneralSettings) => void;
  saveGeneral: () => void;
  saving: boolean;
  saved: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: "22px 24px",
        }}
      >
        <SectionHeader
          icon={<Settings size={15} />}
          title="Session"
          description="Control how long a signed-in user can stay idle before zinalog requires them to log in again."
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 360px)",
            gap: 16,
          }}
        >
          <Field
            label="Idle timeout"
            hint="Users are logged out after this many minutes without activity"
            required
          >
            <div className="relative">
              <input
                type="number"
                min="1"
                value={general.session_idle_timeout_minutes}
                onChange={(e) =>
                  setGeneral((s) => ({
                    ...s,
                    session_idle_timeout_minutes: e.target.value,
                  }))
                }
                style={{ ...inputBase, paddingRight: 58 }}
              />
              <span
                style={{
                  position: "absolute",
                  right: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  fontSize: 11,
                  color: "var(--text-dim)",
                  pointerEvents: "none",
                }}
              >
                minutes
              </span>
            </div>
          </Field>
        </div>
        <SaveBar onSave={saveGeneral} saving={saving} saved={saved} />
      </div>

      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: "22px 24px",
        }}
      >
        <SectionHeader
          icon={<Database size={15} />}
          title="Log Retention"
          description="Control how long logs are kept and the maximum storage size."
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
          }}
        >
          <Field
            label="Retention period"
            hint="Logs older than this are automatically purged"
            required
          >
            <div className="relative">
              <input
                type="number"
                min="1"
                value={general.retention_days}
                onChange={(e) =>
                  setGeneral((s) => ({
                    ...s,
                    retention_days: e.target.value,
                  }))
                }
                style={{ ...inputBase, paddingRight: 44 }}
              />
              <span
                style={{
                  position: "absolute",
                  right: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  fontSize: 11,
                  color: "var(--text-dim)",
                  pointerEvents: "none",
                }}
              >
                days
              </span>
            </div>
          </Field>
          <Field
            label="Max log count"
            hint="Oldest entries are removed when this is exceeded"
            required
          >
            <input
              type="number"
              min="1000"
              value={general.max_logs}
              onChange={(e) =>
                setGeneral((s) => ({
                  ...s,
                  max_logs: e.target.value,
                }))
              }
              className="w-full bg-(--bg-surface) border border-(--border) rounded-lg px-3 py-2.25 text-[13px] text-foreground outline-none box-border transition-colors"
            />
          </Field>
        </div>
        <SaveBar onSave={saveGeneral} saving={saving} saved={saved} />
      </div>

      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: "22px 24px",
        }}
      >
        <SectionHeader
          icon={<Server size={15} />}
          title="System Information"
          description="Read-only runtime environment details."
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 0,
            borderRadius: 8,
            border: "1px solid var(--border)",
            overflow: "hidden",
          }}
        >
          {[
            {
              label: "Database Path",
              value: process.env.DATABASE_PATH ?? "./data/logs.db",
              mono: true,
            },
            {
              label: "Port",
              value: process.env.PORT ?? "4000",
              mono: true,
            },
            {
              label: "Environment",
              value: process.env.NODE_ENV ?? "development",
              mono: false,
            },
          ].map((item, i) => (
            <div
              key={item.label}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "10px 14px",
                background:
                  i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
                borderBottom: i < 2 ? "1px solid var(--border)" : "none",
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  color: "var(--text-dim)",
                  width: 140,
                  flexShrink: 0,
                }}
              >
                {item.label}
              </span>
              <code
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  fontFamily: item.mono
                    ? "var(--font-mono, monospace)"
                    : "inherit",
                }}
              >
                {item.value}
              </code>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
