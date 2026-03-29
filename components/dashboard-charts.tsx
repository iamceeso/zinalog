"use client";

import {
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { PartyPopper } from "lucide-react";
import type { Log } from "@/lib/db";

//  Level colour maps
const LEVEL_HEX: Record<string, string> = {
  error: "#f85149",
  warning: "#e3b341",
  info: "#58a6ff",
  debug: "#8b949e",
};

const LEVEL_DOT_CLASS: Record<string, string> = {
  error: "bg-(--error)",
  warning: "bg-(--warning)",
  info: "bg-(--info)",
  debug: "bg-(--debug)",
};

//  Shared Recharts theme config
const TOOLTIP_STYLE = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--text-base)",
};

const TOOLTIP_LABEL_STYLE = { color: "var(--text-base)", marginBottom: 4 };
const TOOLTIP_ITEM_STYLE = { color: "var(--text-dim)" };

const AXIS_TICK = { fontSize: 10, fill: "var(--text-dim)" };
const YAXIS_TICK = { fontSize: 11, fill: "var(--text-muted)" };

//  Shared wrappers
export function CardShell({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-(--bg-card) border border-(--border) rounded-[10px] px-5 py-4 flex flex-col gap-3 ${className}`}
    >
      <div className="text-[13px] font-semibold text-foreground shrink-0">
        {title}
      </div>
      {children}
    </div>
  );
}

function Empty({ text = "No data yet" }: { text?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center flex-1 py-6 text-[13px] text-(--text-dim)">
      {text}
    </div>
  );
}

//  Area chart: activity over last 24h

export function ActivityChart({
  hourlyByLevel,
}: {
  hourlyByLevel: { hour: string; level: string; count: number }[];
}) {
  const buckets: Record<string, Record<string, number>> = {};
  for (const row of hourlyByLevel) {
    if (!buckets[row.hour]) buckets[row.hour] = {};
    buckets[row.hour][row.level] =
      (buckets[row.hour][row.level] ?? 0) + row.count;
  }

  const data = Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([hour, counts]) => ({
      label: new Date(
        hour + (hour.endsWith("Z") ? "" : "Z"),
      ).toLocaleTimeString("en-US", {
        hour: "numeric",
        hour12: true,
      }),
      error: counts.error ?? 0,
      warning: counts.warning ?? 0,
      info: counts.info ?? 0,
      debug: counts.debug ?? 0,
    }));

  if (data.length === 0) return <Empty text="No activity in the last 24h" />;

  return (
    <ResponsiveContainer width="100%" height={160}>
      <AreaChart
        data={data}
        margin={{ top: 4, right: 4, left: -28, bottom: 0 }}
      >
        <defs>
          {(["error", "warning", "info", "debug"] as const).map((l) => (
            <linearGradient
              key={l}
              id={`grad-${l}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="5%" stopColor={LEVEL_HEX[l]} stopOpacity={0.3} />
              <stop offset="95%" stopColor={LEVEL_HEX[l]} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <XAxis
          dataKey="label"
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          itemStyle={TOOLTIP_ITEM_STYLE}
        />
        {(["error", "warning", "info", "debug"] as const).map((l) => (
          <Area
            key={l}
            type="monotone"
            dataKey={l}
            stroke={LEVEL_HEX[l]}
            strokeWidth={1.5}
            fill={`url(#grad-${l})`}
            dot={false}
            activeDot={{ r: 3 }}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

//  Donut pie chart: level distribution
export function LevelPieChart({
  byLevel,
}: {
  byLevel: { level: string; count: number }[];
}) {
  if (byLevel.length === 0) return <Empty text="No logs in last 24h" />;

  const data = byLevel.map((l) => ({ name: l.level, value: l.count }));
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="flex items-center gap-4">
      <ResponsiveContainer width={110} height={110}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            cx="50%"
            cy="50%"
            innerRadius={28}
            outerRadius={48}
            paddingAngle={2}
            strokeWidth={0}
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={LEVEL_HEX[entry.name] ?? "#666"} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(v) =>
              v != null
                ? [`${v} (${Math.round((Number(v) / total) * 100)}%)`, ""]
                : ["", ""]
            }
          />
        </PieChart>
      </ResponsiveContainer>

      <div className="flex flex-col gap-2 flex-1">
        {data.map((d) => (
          <div
            key={d.name}
            className="flex items-center justify-between text-[12px]"
          >
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${LEVEL_DOT_CLASS[d.name] ?? "bg-(--text-dim)"}`}
              />
              <span className="text-(--text-muted) capitalize">{d.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-foreground font-medium [font-variant-numeric:tabular-nums]">
                {d.name}
              </span>
              <span className="text-(--text-dim) w-8 text-right tabular-nums">
                {Math.round((d.value / total) * 100)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

//  Horizontal bar chart: top services

export function ServicesBarChart({
  byService,
}: {
  byService: { service: string; count: number }[];
}) {
  if (byService.length === 0) return <Empty text="No services yet" />;

  const data = byService
    .slice(0, 8)
    .map((s) => ({ name: s.service, count: s.count }));

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 0, right: 8, left: 4, bottom: 0 }}
      >
        <XAxis
          type="number"
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={YAXIS_TICK}
          tickLine={false}
          axisLine={false}
          width={72}
          tickFormatter={(v: string) =>
            v.length > 10 ? v.slice(0, 10) + "…" : v
          }
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          cursor={{ fill: "var(--bg-hover)" }}
        />
        <Bar
          dataKey="count"
          fill="var(--accent)"
          radius={[0, 4, 4, 0]}
          maxBarSize={14}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

//  Recent errors compact list

function formatTime(dt: string): string {
  const d = new Date(dt + (dt.endsWith("Z") ? "" : "Z"));
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function RecentErrorsList({ errors }: { errors: Log[] }) {
  if (errors.length === 0) {
    return <Empty text={<>No recent errors <PartyPopper size={14} className="inline align-middle" /></>} />;
  }
  return (
    <div className="flex flex-col divide-y divide-(--border)">
      {errors.map((log) => (
        <div key={log.id} className="flex items-center gap-2 py-2 min-w-0">
          {log.service && (
            <span className="text-[11px] text-(--accent) shrink-0 font-medium">
              {log.service}
            </span>
          )}
          <span className="text-[12px] text-foreground flex-1 overflow-hidden text-ellipsis whitespace-nowrap min-w-0">
            {log.message}
          </span>
          <span className="text-[11px] text-(--text-dim) shrink-0 font-mono">
            {formatTime(log.created_at)}
          </span>
        </div>
      ))}
    </div>
  );
}
