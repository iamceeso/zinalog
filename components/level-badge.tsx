interface LevelBadgeProps {
  level: string;
  size?: "sm" | "md";
}

export default function LevelBadge({ level, size = "md" }: LevelBadgeProps) {
  const cls = `badge-${level.toLowerCase()}`;

  return (
    <span
      className={`${cls} inline-block rounded-sm font-semibold uppercase tracking-[0.5px] font-mono whitespace-nowrap ${
        size === "sm" ? "px-1.5 py-px text-[10px]" : "px-2 py-0.5 text-[11px]"
      }`}
    >
      {level}
    </span>
  );
}
