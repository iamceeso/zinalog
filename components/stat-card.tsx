import { ReactNode } from "react";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
  accent?: "default" | "error" | "warning" | "success" | "info";
}

const accentColors = {
  default: "var(--accent)",
  error: "var(--error)",
  warning: "var(--warning)",
  success: "var(--success)",
  info: "var(--info)",
};

export default function StatCard({
  title,
  value,
  subtitle,
  icon,
  accent = "default",
}: StatCardProps) {
  const color = accentColors[accent];

  return (
    <div className="bg-(--bg-card) border border-(--border) rounded-[10px] px-5.5 py-5 flex flex-col gap-2 transition-[border-color] duration-200">
      <div className="flex items-center justify-between">
        <span className="text-[12px] text-(--text-muted) font-medium uppercase tracking-[0.5px]">
          {title}
        </span>

        {icon && (
          <span className="opacity-80" style={{ color }}>
            {icon}
          </span>
        )}
      </div>

      <div
        className="text-[28px] font-bold leading-none [font-variant-numeric:tabular-nums]"
        style={{ color }}
      >
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>

      {subtitle && (
        <div className="text-[12px] text-(--text-dim)">{subtitle}</div>
      )}
    </div>
  );
}
