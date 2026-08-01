export type MonitorType = "http" | "tcp" | "ping";
export type MonitorStatus = "up" | "down" | "pending";

export interface ClientMonitor {
  id: number;
  name: string;
  type: MonitorType;
  target: string;
  port: number | null;
  method: string | null;
  headers: string | null; // masked sentinel or null
  basic_auth_user: string | null;
  basic_auth_pass: string | null; // masked sentinel or null
  expected_status: string;
  interval_seconds: number;
  timeout_seconds: number;
  retries: number;
  follow_redirects: number;
  verify_ssl: number;
  is_active: number;
  notify_enabled: number;
  status: MonitorStatus;
  consecutive_fails: number;
  last_check_at: string | null;
  last_status_change_at: string | null;
  ssl_expires_at: string | null;
  ssl_issuer: string | null;
  ssl_valid: number | null;
  created_at: string;
  updated_at: string;
  last_response_time_ms?: number | null;
}

export interface ClientMonitorCheck {
  id: number;
  monitor_id: number;
  status: "up" | "down";
  status_code: number | null;
  response_time_ms: number | null;
  error: string | null;
  checked_at: string;
}

export const MASKED_SECRET = "********************";
