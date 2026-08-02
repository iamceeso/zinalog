"use client";

import { useState } from "react";
import DialogShell from "./dialog-shell";
import type { ClientMonitor, MonitorType } from "./monitor-types";
import { MASKED_SECRET } from "./monitor-types";

const inputCls =
  "w-full bg-(--bg-card) border border-(--border) rounded-md px-3 py-2 text-[13px] text-(--text-base) outline-none";
const labelCls = "text-[12px] text-(--text-muted) block mb-1.5";
const sectionCls =
  "text-[11px] font-semibold text-(--text-dim) uppercase tracking-[0.5px] mt-1";
const checkboxRowCls = "flex items-center gap-2 text-[13px] text-(--text-base)";

const HTTP_METHODS = ["GET", "POST", "HEAD", "PUT", "DELETE", "PATCH", "OPTIONS"];

function targetPlaceholder(type: MonitorType): string {
  if (type === "http") return "https://example.com/health";
  return "example.com or 10.0.0.5";
}

function parseHeadersForSubmit(
  text: string
): { ok: true; value: string | Record<string, string> | null } | { ok: false; error: string } {
  const trimmed = text.trim();
  if (!trimmed) return { ok: true, value: null };
  if (trimmed === MASKED_SECRET) return { ok: true, value: MASKED_SECRET };
  try {
    const parsed = JSON.parse(trimmed);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed) ||
      Object.values(parsed).some((v) => typeof v !== "string")
    ) {
      return { ok: false, error: "Headers must be a JSON object of string values" };
    }
    return { ok: true, value: parsed as Record<string, string> };
  } catch {
    return { ok: false, error: "Headers must be valid JSON" };
  }
}

interface FormState {
  name: string;
  type: MonitorType;
  target: string;
  port: string;
  method: string;
  headers: string;
  basicAuthUser: string;
  basicAuthPass: string;
  expectedStatus: string;
  intervalSeconds: string;
  timeoutSeconds: string;
  retries: string;
  followRedirects: boolean;
  verifySsl: boolean;
  isActive: boolean;
  notifyEnabled: boolean;
}

function initialState(monitor?: ClientMonitor): FormState {
  if (!monitor) {
    return {
      name: "",
      type: "http",
      target: "",
      port: "",
      method: "GET",
      headers: "",
      basicAuthUser: "",
      basicAuthPass: "",
      expectedStatus: "200-299",
      intervalSeconds: "60",
      timeoutSeconds: "10",
      retries: "0",
      followRedirects: true,
      verifySsl: true,
      isActive: true,
      notifyEnabled: true,
    };
  }

  return {
    name: monitor.name,
    type: monitor.type,
    target: monitor.target,
    port: monitor.port != null ? String(monitor.port) : "",
    method: monitor.method ?? "GET",
    headers: monitor.headers ?? "",
    basicAuthUser: monitor.basic_auth_user ?? "",
    basicAuthPass: monitor.basic_auth_pass ?? "",
    expectedStatus: monitor.expected_status,
    intervalSeconds: String(monitor.interval_seconds),
    timeoutSeconds: String(monitor.timeout_seconds),
    retries: String(monitor.retries),
    followRedirects: monitor.follow_redirects === 1,
    verifySsl: monitor.verify_ssl === 1,
    isActive: monitor.is_active === 1,
    notifyEnabled: monitor.notify_enabled === 1,
  };
}

export default function MonitorFormModal({
  monitor,
  onClose,
  onSaved,
}: {
  monitor?: ClientMonitor;
  onClose: () => void;
  onSaved: (monitor: ClientMonitor) => void;
}) {
  const isEdit = !!monitor;
  const [form, setForm] = useState<FormState>(() => initialState(monitor));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async () => {
    setError("");

    if (!form.name.trim()) {
      setError("Name is required");
      return;
    }
    if (!form.target.trim()) {
      setError("Target is required");
      return;
    }
    if (form.type === "tcp" && !form.port.trim()) {
      setError("Port is required for TCP monitors");
      return;
    }

    const headersResult = form.type === "http" ? parseHeadersForSubmit(form.headers) : { ok: true as const, value: null };
    if (!headersResult.ok) {
      setError(headersResult.error);
      return;
    }

    const body: Record<string, unknown> = {
      name: form.name.trim(),
      type: form.type,
      target: form.target.trim(),
      interval_seconds: Number(form.intervalSeconds),
      timeout_seconds: Number(form.timeoutSeconds),
      retries: Number(form.retries),
      is_active: form.isActive,
      notify_enabled: form.notifyEnabled,
    };

    if (form.type === "tcp") {
      body.port = Number(form.port);
    }

    if (form.type === "http") {
      body.method = form.method;
      body.headers = headersResult.value;
      body.basic_auth_user = form.basicAuthUser.trim() || null;
      body.basic_auth_pass = form.basicAuthPass === "" ? null : form.basicAuthPass;
      body.expected_status = form.expectedStatus.trim() || "200-299";
      body.follow_redirects = form.followRedirects;
      body.verify_ssl = form.verifySsl;
    }

    setLoading(true);
    try {
      const res = await fetch(
        isEdit ? `/api/monitors/${monitor!.id}` : "/api/monitors",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.details ? data.details.join("; ") : data.error ?? "Failed to save monitor");
        return;
      }
      onSaved(data.monitor);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DialogShell
      title={isEdit ? "Edit Monitor" : "New Monitor"}
      onClose={onClose}
      widthClassName={form.type === "http" ? "w-full max-w-[860px]" : "w-full max-w-[560px]"}
      footer={
        <>
          <button
            onClick={onClose}
            className="bg-(--bg-card) border border-(--border) rounded-md py-2.25 px-4 text-[13px] text-(--text-muted) cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={loading}
            className={`bg-(--accent-glow) border-none rounded-md py-2.25 px-4 text-[13px] font-semibold text-white ${loading ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}
          >
            {loading ? "Saving…" : isEdit ? "Save Changes" : "Create Monitor"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5 max-h-[85vh] overflow-y-auto pr-1">
        <div className={form.type === "http" ? "grid grid-cols-2 gap-x-6 gap-y-3.5" : "flex flex-col gap-3.5"}>
          <div className="flex flex-col gap-3.5">
            <div>
              <label className={labelCls}>Name *</label>
              <input
                type="text"
                placeholder="e.g. Production API"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                className={inputCls}
              />
            </div>

            <div className="grid grid-cols-2 gap-3.5">
              <div>
                <label className={labelCls}>Type</label>
                <select
                  value={form.type}
                  onChange={(e) => update("type", e.target.value as MonitorType)}
                  className={inputCls}
                >
                  <option value="http">HTTP/HTTPS</option>
                  <option value="tcp">TCP Port</option>
                  <option value="ping">Ping</option>
                </select>
              </div>

              {form.type === "tcp" && (
                <div>
                  <label className={labelCls}>Port *</label>
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    value={form.port}
                    onChange={(e) => update("port", e.target.value)}
                    className={inputCls}
                  />
                </div>
              )}

              {form.type === "http" && (
                <div>
                  <label className={labelCls}>Method</label>
                  <select
                    value={form.method}
                    onChange={(e) => update("method", e.target.value)}
                    className={inputCls}
                  >
                    {HTTP_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div>
              <label className={labelCls}>Target *</label>
              <input
                type="text"
                placeholder={targetPlaceholder(form.type)}
                value={form.target}
                onChange={(e) => update("target", e.target.value)}
                className={inputCls}
              />
            </div>

            {form.type === "http" && (
              <div>
                <label className={labelCls}>Expected Status Codes</label>
                <input
                  type="text"
                  placeholder="200-299"
                  value={form.expectedStatus}
                  onChange={(e) => update("expectedStatus", e.target.value)}
                  className={inputCls}
                />
              </div>
            )}
          </div>

          {form.type === "http" && (
            <div className="flex flex-col gap-3.5">
              <div className={`${sectionCls} mt-0`}>Auth & Headers</div>

              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className={labelCls}>Basic Auth Username</label>
                  <input
                    type="text"
                    value={form.basicAuthUser}
                    onChange={(e) => update("basicAuthUser", e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Basic Auth Password</label>
                  <input
                    type="password"
                    value={form.basicAuthPass}
                    onChange={(e) => update("basicAuthPass", e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>

              <div className="flex-1 flex flex-col">
                <label className={labelCls}>Custom Headers (JSON)</label>
                <textarea
                  placeholder='{"X-Api-Key": "secret"}'
                  value={form.headers}
                  onChange={(e) => update("headers", e.target.value)}
                  rows={3}
                  className={`${inputCls} font-mono resize-y flex-1`}
                />
              </div>

              <div className="flex gap-5">
                <label className={checkboxRowCls}>
                  <input
                    type="checkbox"
                    checked={form.followRedirects}
                    onChange={(e) => update("followRedirects", e.target.checked)}
                  />
                  Follow redirects
                </label>
                <label className={checkboxRowCls}>
                  <input
                    type="checkbox"
                    checked={form.verifySsl}
                    onChange={(e) => update("verifySsl", e.target.checked)}
                  />
                  Verify SSL certificate
                </label>
              </div>
            </div>
          )}
        </div>

        <div className={sectionCls}>Check Settings</div>

        <div className="grid grid-cols-3 gap-3.5">
          <div>
            <label className={labelCls}>Interval (seconds)</label>
            <input
              type="number"
              min={10}
              value={form.intervalSeconds}
              onChange={(e) => update("intervalSeconds", e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Timeout (seconds)</label>
            <input
              type="number"
              min={1}
              value={form.timeoutSeconds}
              onChange={(e) => update("timeoutSeconds", e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Retries</label>
            <input
              type="number"
              min={0}
              max={10}
              value={form.retries}
              onChange={(e) => update("retries", e.target.value)}
              className={inputCls}
            />
          </div>
        </div>

        <div className="flex gap-5">
          <label className={checkboxRowCls}>
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => update("isActive", e.target.checked)}
            />
            Active
          </label>
          <label className={checkboxRowCls}>
            <input
              type="checkbox"
              checked={form.notifyEnabled}
              onChange={(e) => update("notifyEnabled", e.target.checked)}
            />
            Send alerts on status change
          </label>
        </div>

        {error && (
          <div className="px-3 py-2 bg-[rgba(248,81,73,0.1)] border border-[rgba(248,81,73,0.3)] rounded-md text-[12px] text-(--error)">
            {error}
          </div>
        )}
      </div>
    </DialogShell>
  );
}
