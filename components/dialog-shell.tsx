"use client";

import type { ReactNode } from "react";
import { AlertTriangle, X } from "lucide-react";

interface DialogShellProps {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  danger?: boolean;
  widthClassName?: string;
}

export default function DialogShell({
  title,
  description,
  children,
  footer,
  onClose,
  danger = false,
  widthClassName = "w-full max-w-[560px]",
}: DialogShellProps) {
  return (
    <div
      className="fixed inset-0 z-200 bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={`animate-fade-in bg-(--bg-surface) rounded-xl border ${danger ? "border-[rgba(248,81,73,0.3)]" : "border-(--border)"} shadow-[0_20px_60px_rgba(0,0,0,0.35)] ${widthClassName}`}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6">
          <div className="flex items-start gap-3 min-w-0">
            {danger && (
              <div className="w-9 h-9 rounded-lg bg-[rgba(248,81,73,0.12)] flex items-center justify-center shrink-0">
                <AlertTriangle size={18} color="var(--error)" />
              </div>
            )}
            <div className="min-w-0">
              <h2 className="text-[16px] font-bold text-foreground m-0">{title}</h2>
              {description && (
                <p className="text-[13px] text-(--text-muted) leading-[1.6] mt-2 mb-0">
                  {description}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="bg-transparent border-none text-(--text-dim) hover:text-foreground cursor-pointer p-1 rounded-md flex shrink-0"
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5">{children}</div>

        {footer && (
          <div className="px-6 pb-6 flex justify-end gap-2 border-t border-(--border) pt-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
