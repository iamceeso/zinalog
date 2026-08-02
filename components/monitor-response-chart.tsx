"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { ClientMonitorCheck } from "./monitor-types";

const TOOLTIP_STYLE = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--text-base)",
};
const TOOLTIP_LABEL_STYLE = { color: "var(--text-base)", marginBottom: 4 };
const AXIS_TICK = { fontSize: 10, fill: "var(--text-dim)" };

function formatTime(dt: string): string {
  return new Date(dt + (dt.endsWith("Z") ? "" : "Z")).toLocaleTimeString(
    "en-US",
    { hour: "numeric", minute: "2-digit", hour12: true }
  );
}

export default function MonitorResponseChart({
  checks,
}: {
  checks: ClientMonitorCheck[];
}) {
  const data = [...checks].reverse().map((c) => ({
    label: formatTime(c.checked_at),
    responseTime: c.response_time_ms ?? 0,
    status: c.status,
  }));

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center py-10 text-[13px] text-(--text-dim)">
        No checks recorded yet
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart
        data={data}
        margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
      >
        <XAxis
          dataKey="label"
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          minTickGap={30}
        />
        <YAxis
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
          unit="ms"
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          formatter={(value, _name, item) => [
            `${value}ms${item.payload.status === "down" ? " (down)" : ""}`,
            "Response time",
          ]}
        />
        <Line
          type="monotone"
          dataKey="responseTime"
          stroke="var(--accent)"
          strokeWidth={1.5}
          dot={(props) => {
            const { cx, cy, payload, index } = props;
            return (
              <circle
                key={`dot-${index}`}
                cx={cx}
                cy={cy}
                r={2.5}
                fill={
                  payload.status === "down" ? "var(--error)" : "var(--accent)"
                }
                stroke="none"
              />
            );
          }}
          activeDot={{ r: 4 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
