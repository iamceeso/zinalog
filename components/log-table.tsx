"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Search,
  Filter,
  Calendar,
  ChevronDown,
} from "lucide-react";
import LevelBadge from "./level-badge";
import type { Log } from "@/lib/db";

interface LogTableProps {
  logs: Log[];
  total: number;
  page: number;
  limit: number;
  onPageChange: (page: number) => void;
  onFilterChange: (key: string, value: string) => void;
  onDateRangeChange: (from: string, to: string) => void;
  onClearFilters: () => void;
  filters: {
    level: string;
    service: string;
    search: string;
    from: string;
    to: string;
  };
  services: string[];
  loading?: boolean;
}

//  Quick preset helpers 

type Preset = "1h" | "24h" | "7d" | "30d" | "custom" | "";

function toLocalDatetimeValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localToISO(local: string): string {
  if (!local) return "";
  return new Date(local).toISOString();
}

const PRESETS: { id: Preset; label: string }[] = [
  { id: "1h", label: "Last 1h" },
  { id: "24h", label: "Last 24h" },
  { id: "7d", label: "Last 7d" },
  { id: "30d", label: "Last 30d" },
  { id: "custom", label: "Custom…" },
];

function presetRange(preset: Preset): { from: string; to: string } | null {
  const now = new Date();
  const map: Record<string, number> = {
    "1h": 1,
    "24h": 24,
    "7d": 168,
    "30d": 720,
  };
  if (!map[preset]) return null;
  const from = new Date(now.getTime() - map[preset] * 60 * 60 * 1000);
  return { from: from.toISOString(), to: now.toISOString() };
}

function detectPreset(from: string, to: string): Preset {
  if (!from && !to) return "";
  return "custom";
}

//  Date range picker 

function DateRangePicker({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [localFrom, setLocalFrom] = useState(
    from ? toLocalDatetimeValue(new Date(from)) : "",
  );
  const [localTo, setLocalTo] = useState(
    to ? toLocalDatetimeValue(new Date(to)) : "",
  );
  const [activePreset, setActivePreset] = useState<Preset>(() =>
    detectPreset(from, to),
  );
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const applyPreset = (preset: Preset) => {
    setActivePreset(preset);
    if (preset === "custom") return;
    const range = presetRange(preset);
    if (!range) {
      onChange("", "");
      setLocalFrom("");
      setLocalTo("");
    } else {
      onChange(range.from, range.to);
      setLocalFrom(toLocalDatetimeValue(new Date(range.from)));
      setLocalTo(toLocalDatetimeValue(new Date(range.to)));
      setOpen(false);
    }
  };

  const applyCustom = () => {
    onChange(
      localFrom ? localToISO(localFrom) : "",
      localTo ? localToISO(localTo) : "",
    );
    setOpen(false);
  };

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActivePreset("");
    setLocalFrom("");
    setLocalTo("");
    onChange("", "");
  };

  const hasFilter = !!(from || to);

  const label = (() => {
    if (!hasFilter) return "Date range";
    const presetDef = PRESETS.find(
      (p) =>
        p.id === activePreset &&
        activePreset !== "custom" &&
        activePreset !== "",
    );
    if (presetDef) return presetDef.label;
    const parts: string[] = [];
    if (from)
      parts.push(
        new Date(from).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }),
      );
    if (to)
      parts.push(
        new Date(to).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }),
      );
    return parts.join(" → ") || "Date range";
  })();

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          background: hasFilter ? "rgba(88,166,255,0.1)" : "var(--bg-card)",
          border: hasFilter
            ? "1px solid rgba(88,166,255,0.4)"
            : "1px solid var(--border)",
          borderRadius: 6,
          padding: "7px 10px",
          fontSize: 13,
          color: hasFilter ? "var(--accent)" : "var(--text-muted)",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        <Calendar size={13} />
        <span
          style={{
            maxWidth: 180,
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {label}
        </span>
        {hasFilter ? (
          <X
            size={12}
            onClick={clear}
            style={{ marginLeft: 2, opacity: 0.7 }}
          />
        ) : (
          <ChevronDown size={12} style={{ opacity: 0.5 }} />
        )}
      </button>

      {open && (
        <div className="absolute top-[calc(100%+6px)] left-0 z-100 bg-(--bg-card) border border-(--border) rounded-[10px] p-4 min-w-75 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
          {/* Preset pills */}
          <div
            style={{
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
              marginBottom: 14,
            }}
          >
            {PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => applyPreset(p.id)}
                style={{
                  padding: "5px 12px",
                  borderRadius: 5,
                  fontSize: 12,
                  cursor: "pointer",
                  border:
                    activePreset === p.id
                      ? "1px solid var(--accent)"
                      : "1px solid var(--border)",
                  background:
                    activePreset === p.id
                      ? "rgba(88,166,255,0.12)"
                      : "var(--bg-surface)",
                  color:
                    activePreset === p.id
                      ? "var(--accent)"
                      : "var(--text-muted)",
                  transition: "all 0.12s",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom inputs */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-dim)",
                  marginBottom: 5,
                }}
              >
                From
              </div>
              <input
                type="datetime-local"
                value={localFrom}
                onChange={(e) => {
                  setLocalFrom(e.target.value);
                  setActivePreset("custom");
                }}
                className="w-full bg-(--bg-surface) border border-(--border) rounded-md px-2.5 py-1.75 text-[12px] text-foreground outline-none box-border"
              />
            </div>
            <div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-dim)",
                  marginBottom: 5,
                }}
              >
                To
              </div>
              <input
                type="datetime-local"
                value={localTo}
                onChange={(e) => {
                  setLocalTo(e.target.value);
                  setActivePreset("custom");
                }}
                className="w-full bg-(--bg-surface) border border-(--border) rounded-md py-1.75 px-2.5 text-[12px] text-foreground outline-none box-border"
              />
            </div>
            <button
              onClick={applyCustom}
              className="w-full bg-(--accent-glow) border-none rounded-md p-2 text-[13px] font-semibold text-white cursor-pointer"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

//  Utilities 

function formatTime(dt: string): string {
  const d = new Date(dt + (dt.endsWith("Z") ? "" : "Z"));
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

//  Log detail panel 

function LogDetailPanel({ log, onClose }: { log: Log; onClose: () => void }) {
  let meta: unknown = null;
  if (log.metadata) {
    try {
      meta = JSON.parse(log.metadata);
    } catch {
      meta = log.metadata;
    }
  }

  return (
    <div className="fixed right-0 top-0 bottom-0 w-115 bg-(--bg-surface) border-l border-(--border) z-50 overflow-y-auto p-6">
      <div className="flex justify-between items-center mb-5">
        <span className="font-semibold text-[14px]">Log Detail</span>
        <button
          onClick={onClose}
          className="bg-none border-none text-(--text-muted) cursor-pointer p-1"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex gap-2.5 items-center">
          <LevelBadge level={log.level} />
          <span className="text-[12px] text-(--text-dim)">#{log.id}</span>
        </div>

        <div>
          <div className="text-[11px] text-(--text-dim) uppercase tracking-[0.5px] mb-1.5">
            Message
          </div>
          <div className="text-[13px] text-foreground leading-[1.6] wrap-break-word">
            {log.message}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[11px] text-(--text-dim) uppercase tracking-[0.5px] mb-1">
              Service
            </div>
            <div className="text-[13px] text-(--accent)">
              {log.service ?? "—"}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-(--text-dim) uppercase tracking-[0.5px] mb-1">
              Timestamp
            </div>
            <div className="text-[12px] text-(--text-muted) font-(--font-geist-mono,monospace)">
              {formatTime(log.created_at)}
            </div>
          </div>
        </div>

        {log.stack && (
          <div>
            <div className="text-[11px] text-(--text-dim) uppercase tracking-[0.5px] mb-1.5">
              Stack Trace
            </div>
            <pre className="bg-background border border-(--border) rounded-md px-3 py-2.5 text-[11px] text-(--error) overflow-auto max-h-60 whitespace-pre-wrap break-all leading-normal font-(--font-geist-mono,monospace)">
              {log.stack}
            </pre>
          </div>
        )}

        {meta !== null && (
          <div>
            <div className="text-[11px] text-(--text-dim) uppercase tracking-[0.5px] mb-1.5">
              Metadata
            </div>
            <pre className="bg-background border border-(--border) rounded-md px-3 py-2.5 text-[11px] text-(--text-muted) overflow-auto max-h-75 whitespace-pre-wrap font-(--font-geist-mono,monospace) leading-normal">
              {JSON.stringify(meta, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

//  Main table 

export default function LogTable({
  logs,
  total,
  page,
  limit,
  onPageChange,
  onFilterChange,
  onDateRangeChange,
  onClearFilters,
  filters,
  services,
  loading,
}: LogTableProps) {
  const [selectedLog, setSelectedLog] = useState<Log | null>(null);
  const totalPages = Math.ceil(total / limit);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) =>
      onFilterChange("search", e.target.value),
    [onFilterChange],
  );

  const handleDateRange = useCallback(
    (from: string, to: string) => {
      onDateRangeChange(from, to);
    },
    [onDateRangeChange],
  );

  const hasDateFilter = !!(filters.from || filters.to);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* ── Filter bar ── */}

      <div className="flex gap-2 py-3 flex-wrap items-center shrink-0">
        <div className="relative flex-1 min-w-50">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-(--text-dim)"
          />
          <input
            type="text"
            placeholder="Search logs…"
            value={filters.search}
            onChange={handleSearchChange}
            className="w-full bg-(--bg-card) border border-(--border) rounded-md py-1.75 pr-2.5 pl-8 text-[13px] text-foreground outline-none box-border"
          />
        </div>

        <Filter size={13} className="text-(--text-dim)" />

        <DateRangePicker
          key={`${filters.from}|${filters.to}`}
          from={filters.from}
          to={filters.to}
          onChange={handleDateRange}
        />

        <div className="flex items-center gap-1.5">
          <select
            value={filters.level}
            onChange={(e) => onFilterChange("level", e.target.value)}
            className="bg-(--bg-card) border border-(--border) rounded-md py-1.75 px-2.5 text-[13px] text-foreground outline-none box-border"
          >
            <option value="all">All levels</option>
            <option value="error">Error</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
            <option value="debug">Debug</option>
          </select>
        </div>

        {services.length > 0 && (
          <select
            value={filters.service}
            onChange={(e) => onFilterChange("service", e.target.value)}
            className="bg-(--bg-card) border border-(--border) rounded-md py-1.75 px-2.5 text-[13px] text-foreground outline-none box-border"
          >
            <option value="all">All services</option>
            {services.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}

        {(filters.level !== "all" ||
          filters.service !== "all" ||
          filters.search ||
          hasDateFilter) && (
          <button
            onClick={() => {
              onClearFilters();
            }}
            className="flex items-center gap-1.25 bg-none border border-(--border) rounded-md px-2.5 py-1.5 text-[12px] text-(--text-dim) cursor-pointer"
          >
            <X size={12} />
            Clear filters
          </button>
        )}

        <span className="text-[12px] text-(--text-dim) ml-auto">
          {total.toLocaleString()} log{total !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Active date range badge ── */}
      {hasDateFilter && (
        <div className="flex items-center gap-2 mb-2 px-3 py-1.5 bg-[rgba(88,166,255,0.06)] border border-[rgba(88,166,255,0.18)] rounded-md text-[12px] text-(--text-muted) shrink-0">
          <Calendar size={12} className="text-(--accent) shrink-0" />
          {filters.from && (
            <span>
              From:{" "}
              <code className="font-(--font-mono,monospace) text-[11px]">
                {new Date(filters.from).toLocaleString()}
              </code>
            </span>
          )}
          {filters.from && filters.to && (
            <span className="text-(--text-dim)">→</span>
          )}
          {filters.to && (
            <span>
              To:{" "}
              <code className="font-(--font-mono,monospace) text-[11px]">
                {new Date(filters.to).toLocaleString()}
              </code>
            </span>
          )}
        </div>
      )}

      {/* ── Table ── */}
      <div className="flex-1 overflow-auto border border-(--border) rounded-lg bg-(--bg-card)">
        {loading ? (
          <div className="flex items-center justify-center h-50 text-(--text-dim) text-[14px]">
            Loading…
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-50 gap-2">
            <span className="text-[14px] text-(--text-dim)">
              No logs found
            </span>
            {(filters.level !== "all" ||
              filters.service !== "all" ||
              filters.search ||
              hasDateFilter) && (
              <span className="text-[12px] text-(--text-dim)">
                Try adjusting your filters
              </span>
            )}
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-(--border) bg-(--bg-surface)">
                <th className="px-3.5 py-2.5 text-left text-[11px] font-semibold text-(--text-dim) uppercase tracking-[0.5px] whitespace-nowrap">
                  Level
                </th>
                <th className="hide-mobile px-3.5 py-2.5 text-left text-[11px] font-semibold text-(--text-dim) uppercase tracking-[0.5px] whitespace-nowrap">
                  Service
                </th>
                <th className="px-3.5 py-2.5 text-left text-[11px] font-semibold text-(--text-dim) uppercase tracking-[0.5px] whitespace-nowrap">
                  Message
                </th>
                <th className="px-3.5 py-2.5 text-left text-[11px] font-semibold text-(--text-dim) uppercase tracking-[0.5px] whitespace-nowrap">
                  Time
                </th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log, i) => (
                <tr
                  key={log.id}
                  onClick={() =>
                    setSelectedLog(selectedLog?.id === log.id ? null : log)
                  }
                  className={`cursor-pointer transition-colors ${
                    selectedLog?.id === log.id
                      ? "bg-[rgba(88,166,255,0.05)]"
                      : "hover:bg-(--bg-hover)"
                  } ${i < logs.length - 1 ? "border-b border-(--border)" : ""}`}
                >
                  <td className="px-3.5 py-2.25 whitespace-nowrap">
                    <LevelBadge level={log.level} size="sm" />
                  </td>
                  <td className="hide-mobile px-3.5 py-2.25 text-[12px] text-(--accent) whitespace-nowrap max-w-30 overflow-hidden text-ellipsis">
                    {log.service ?? "—"}
                  </td>
                  <td className="px-3.5 py-2.25 text-[13px] text-foreground max-w-125 overflow-hidden text-ellipsis whitespace-nowrap">
                    {log.message}
                  </td>
                  <td className="px-3.5 py-2.25 text-[11px] text-(--text-dim) whitespace-nowrap font-(--font-geist-mono,monospace)">
                    {formatTime(log.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {/* ── Pagination ── */}
      <div className="flex items-center justify-between pt-3 gap-3 flex-wrap">
        <span className="text-[12px] text-(--text-dim) shrink-0">
          {total === 0
            ? "No logs"
            : `Showing ${((page - 1) * limit + 1).toLocaleString()}–${Math.min(page * limit, total).toLocaleString()} of ${total.toLocaleString()} log${total !== 1 ? "s" : ""}`}
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className={`bg-(--bg-card) border border-(--border) rounded-md px-2 py-1.5 flex items-center ${
                page <= 1 ? "text-(--text-dim) cursor-not-allowed opacity-50" : "text-foreground cursor-pointer hover:bg-(--bg-hover)"
              }`}
            >
              <ChevronLeft size={14} />
            </button>
            {(() => {
              const pages: (number | "…")[] = [];
              if (totalPages <= 7) {
                for (let i = 1; i <= totalPages; i++) pages.push(i);
              } else {
                pages.push(1);
                if (page > 3) pages.push("…");
                for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
                if (page < totalPages - 2) pages.push("…");
                pages.push(totalPages);
              }
              return pages.map((p, i) =>
                p === "…" ? (
                  <span key={`ellipsis-${i}`} className="px-1.5 text-[12px] text-(--text-dim)">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => onPageChange(p as number)}
                    className={`min-w-7.5 h-7.5 rounded-md text-[12px] font-medium border ${
                      p === page
                        ? "bg-(--accent) border-(--accent) text-white cursor-default"
                        : "bg-(--bg-card) border-(--border) text-foreground cursor-pointer hover:bg-(--bg-hover)"
                    }`}
                  >
                    {p}
                  </button>
                )
              );
            })()}
            <button
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className={`bg-(--bg-card) border border-(--border) rounded-md px-2 py-1.5 flex items-center ${
                page >= totalPages ? "text-(--text-dim) cursor-not-allowed opacity-50" : "text-foreground cursor-pointer hover:bg-(--bg-hover)"
              }`}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
      {/* ── Detail panel ── */}
      {selectedLog && (
        <>
          <div
            onClick={() => setSelectedLog(null)}
            className="fixed inset-0 z-49"
          />
          <LogDetailPanel
            log={selectedLog}
            onClose={() => setSelectedLog(null)}
          />
        </>
      )}
    </div>
  );
}
