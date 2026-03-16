import { getLogGroups } from "@/lib/db";
import { Clock, Hash } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { requireUser } from "@/lib/session-auth";

function formatTime(dt: string): string {
  const d = new Date(dt + (dt.endsWith("Z") ? "" : "Z"));
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

interface Props {
  level: string;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  Icon: LucideIcon;
  emptyText: string;
  statLabel: string;
}

export default async function LogGroupPage({
  level,
  label,
  color,
  bgColor,
  borderColor,
  Icon,
  emptyText,
  statLabel,
}: Props) {
  const currentUser = await requireUser("viewer");
  const groups = await getLogGroups(level, currentUser.allowed_services);

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div>
        <h1 className="text-[22px] font-bold mb-1">{label} Groups</h1>
        <p className="text-[13px] text-(--text-muted)">
          Similar {label.toLowerCase()} logs grouped by message and service
        </p>
      </div>

      {/* Stats bar */}
      <div className="flex gap-5 px-4.5 py-3.5 bg-(--bg-card) border border-(--border) rounded-lg">
        <div>
          <span className="text-[11px] text-(--text-dim) uppercase tracking-[0.5px]">
            Unique {statLabel} Types
          </span>
          <div
            className="text-[22px] font-bold mt-0.5"
            style={{ color }}
          >
            {groups.length}
          </div>
        </div>

        <div className="w-px bg-(--border) self-stretch" />

        <div>
          <span className="text-[11px] text-(--text-dim) uppercase tracking-[0.5px]">
            Total Occurrences
          </span>
          <div className="text-[22px] font-bold text-foreground mt-0.5">
            {groups.reduce((acc, g) => acc + g.count, 0).toLocaleString()}
          </div>
        </div>
      </div>

      {/* Groups list */}
      {groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-5 py-15 bg-(--bg-card) border border-(--border) rounded-[10px] text-(--text-dim)">
          <Icon size={32} className="mb-3 opacity-40" />
          <div className="text-[14px]">
            No {label.toLowerCase()} logs recorded yet
          </div>
          <div className="text-[12px] mt-1">{emptyText}</div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {groups.map((group, i) => (
            <div
              key={i}
              className="bg-(--bg-card) border border-(--border) rounded-lg px-4.5 py-4 flex flex-col gap-2.5"
              style={{ borderLeft: `3px solid ${color}` }}
            >
              {/* Top row */}
              <div className="flex justify-between items-start gap-3">
                <div className="text-[14px] font-semibold text-foreground leading-[1.4] wrap-break-word flex-1 min-w-0">
                  {group.message}
                </div>

                <div
                  className="shrink-0 flex items-center gap-1 rounded-[20px] px-2.5 py-0.75 text-[12px] font-bold"
                  style={{
                    background: bgColor,
                    border: `1px solid ${borderColor}`,
                    color,
                  }}
                >
                  <Hash size={11} />
                  {group.count.toLocaleString()}
                </div>
              </div>

              {/* Meta row */}
              <div className="flex gap-4 text-[11px] text-(--text-dim)">
                {group.service && (
                  <span className="text-(--accent)">{group.service}</span>
                )}

                <span className="flex items-center gap-1">
                  <Clock size={10} />
                  Last seen {formatTime(group.last_seen)}
                </span>

                <span>First seen {formatTime(group.first_seen)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
