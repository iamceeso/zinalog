"use client";

import { useState } from "react";
import {
  Save,
  CheckCircle,
  Eye,
  EyeOff,
  Send,
  ToggleLeft,
  ToggleRight,
  XCircle,
} from "lucide-react";
import type { NotifChannel } from "./types";

export const inputBase: React.CSSProperties = {
  width: "100%",
  background: "var(--bg-surface)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "9px 12px",
  fontSize: 13,
  color: "var(--text-base)",
  outline: "none",
  transition: "border-color 0.15s",
  boxSizing: "border-box",
};

export function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <label className="text-[12px] font-medium text-(--text-muted) tracking-[0.3px]">
          {label}
        </label>
        {required && (
          <span style={{ color: "var(--error)", fontSize: 11 }}>*</span>
        )}
      </div>
      {children}
      {hint && (
        <p className="text-[11px] text-(--text-dim) leading-normal m-0">
          {hint}
        </p>
      )}
    </div>
  );
}

export function SectionHeader({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-6">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 6,
        }}
      >
        <div className="w-8 h-8 rounded-lg bg-[rgba(88,166,255,0.1)] border border-[rgba(88,166,255,0.15)] flex items-center justify-center text-(--accent) shrink-0">
          {icon}
        </div>
        <h2
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: "var(--text-base)",
            margin: 0,
          }}
        >
          {title}
        </h2>
      </div>
      <p
        style={{
          fontSize: 12,
          color: "var(--text-dim)",
          margin: "0 0 0 42px",
          lineHeight: 1.6,
        }}
      >
        {description}
      </p>
    </div>
  );
}

export function PasswordInput({
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete ?? "new-password"}
        style={{ ...inputBase, paddingRight: 38 }}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer text-(--text-dim) p-0 flex"
      >
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );
}

export function SaveBar({
  onSave,
  saving,
  saved,
  extra,
}: {
  onSave: () => void;
  saving: boolean;
  saved: boolean;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 pt-5 border-t border-(--border) mt-2">
      <button
        onClick={onSave}
        disabled={saving}
        className={`
    flex items-center gap-1.75 rounded-lg px-5 py-2.25
    text-[13px] font-semibold transition-all duration-200
    ${
      saved
        ? "bg-[rgba(63,185,80,0.15)] border border-[rgba(63,185,80,0.3)] text-(--success)"
        : "bg-(--accent-glow) text-white"
    }
    ${saving ? "cursor-not-allowed opacity-[0.65]" : "cursor-pointer"}
  `}
      >
        {saved ? <CheckCircle size={14} /> : <Save size={14} />}
        {saved ? "Saved" : saving ? "Saving…" : "Save changes"}
      </button>
      {extra}
    </div>
  );
}

export function Toggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: 0,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          fontSize: 12,
          color: value ? "var(--success)" : "var(--text-dim)",
          fontWeight: 500,
        }}
      >
        {value ? "Enabled" : "Disabled"}
      </span>
      {value ? (
        <ToggleRight size={22} color="var(--success)" />
      ) : (
        <ToggleLeft size={22} color="var(--text-dim)" />
      )}
    </button>
  );
}

export function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "10px 14px",
        background: "rgba(88,166,255,0.05)",
        border: "1px solid rgba(88,166,255,0.15)",
        borderRadius: 8,
        fontSize: 12,
        color: "var(--text-muted)",
        lineHeight: 1.6,
      }}
    >
      {children}
    </div>
  );
}

export function TestButton({
  channel,
  testing,
  status,
  onTest,
}: {
  channel: NotifChannel;
  testing: NotifChannel | null;
  status: { ok: boolean; msg: string } | null;
  onTest: (c: NotifChannel) => void;
}) {
  const isLoading = testing === channel;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button
        onClick={() => onTest(channel)}
        disabled={isLoading}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "9px 16px",
          fontSize: 13,
          color: "var(--text-muted)",
          cursor: isLoading ? "not-allowed" : "pointer",
          opacity: isLoading ? 0.65 : 1,
        }}
      >
        <Send size={13} />
        {isLoading ? "Sending…" : "Send test"}
      </button>
      {status && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            color: status.ok ? "var(--success)" : "var(--error)",
            padding: "6px 12px",
            background: status.ok
              ? "rgba(63,185,80,0.08)"
              : "rgba(248,81,73,0.08)",
            border: `1px solid ${status.ok ? "rgba(63,185,80,0.2)" : "rgba(248,81,73,0.2)"}`,
            borderRadius: 6,
          }}
        >
          {status.ok ? <CheckCircle size={12} /> : <XCircle size={12} />}
          {status.msg}
        </div>
      )}
    </div>
  );
}
