import nodemailer from "nodemailer";
import { Resend } from "resend";
import { getAllSettings } from "./db";

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

export interface EmailConfig {
  provider: "smtp" | "resend" | "disabled";
  from: string;
  to: string;
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
  };
  resendApiKey: string;
}

export async function getEmailConfig(): Promise<EmailConfig> {
  const s = await getAllSettings();
  return {
    provider: (s.email_provider ?? "disabled") as EmailConfig["provider"],
    from: s.email_from ?? "zinalog@example.com",
    to: s.email_to ?? "",
    smtp: {
      host: s.smtp_host ?? "",
      port: parseInt(s.smtp_port ?? "587", 10),
      secure: s.smtp_secure === "1",
      user: s.smtp_user ?? "",
      pass: s.smtp_pass ?? "",
    },
    resendApiKey: s.resend_api_key ?? "",
  };
}

export async function sendEmail(
  payload: EmailPayload,
): Promise<{ ok: boolean; error?: string }> {
  const cfg = await getEmailConfig();

  if (cfg.provider === "disabled") {
    return { ok: false, error: "Email provider is disabled" };
  }

  try {
    if (cfg.provider === "resend") {
      if (!cfg.resendApiKey)
        return { ok: false, error: "Resend API key not configured" };
      const resend = new Resend(cfg.resendApiKey);
      const { error } = await resend.emails.send({
        from: cfg.from,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    }

    // SMTP
    if (!cfg.smtp.host) return { ok: false, error: "SMTP host not configured" };
    const transporter = nodemailer.createTransport({
      host: cfg.smtp.host,
      port: cfg.smtp.port,
      secure: cfg.smtp.secure,
      auth: cfg.smtp.user
        ? { user: cfg.smtp.user, pass: cfg.smtp.pass }
        : undefined,
    });
    await transporter.sendMail({
      from: cfg.from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

//  Alert email builder

export function buildAlertEmail(log: {
  level: string;
  message: string;
  service: string | null;
  stack: string | null;
  metadata: string | null;
  created_at: string;
}): { subject: string; html: string } {
  const levelColors: Record<string, string> = {
    error: "#f85149",
    warning: "#d29922",
    info: "#8b949e",
    debug: "#79c0ff",
  };
  const color = levelColors[log.level] ?? "#8b949e";
  const service = log.service ?? "unknown service";

  let metaHtml = "";
  if (log.metadata) {
    try {
      const parsed = JSON.parse(log.metadata);
      metaHtml = `
        <tr>
          <td style="padding:8px 0;color:#8b949e;font-size:12px;vertical-align:top;width:100px">Metadata</td>
          <td style="padding:8px 0;font-size:12px">
            <pre style="margin:0;background:#0d1117;border:1px solid #30363d;border-radius:6px;padding:10px;color:#8b949e;overflow:auto;font-family:monospace">${JSON.stringify(parsed, null, 2)}</pre>
          </td>
        </tr>`;
    } catch {
      /* ignore */
    }
  }

  const stackHtml = log.stack
    ? `<tr>
        <td style="padding:8px 0;color:#8b949e;font-size:12px;vertical-align:top;width:100px">Stack</td>
        <td style="padding:8px 0">
          <pre style="margin:0;background:#0d1117;border:1px solid #30363d;border-radius:6px;padding:10px;color:#f85149;overflow:auto;font-size:11px;font-family:monospace">${log.stack}</pre>
        </td>
      </tr>`
    : "";

  const subject = `[ZinaLog] ${log.level.toUpperCase()}: ${log.message.slice(0, 60)}${log.message.length > 60 ? "…" : ""}`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#0f1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e6edf3">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;padding:32px 16px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">

        <!-- Header -->
        <tr>
          <td style="background:#161b22;border:1px solid #30363d;border-radius:12px 12px 0 0;padding:20px 24px;border-bottom:none">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <span style="font-size:18px;font-weight:700;color:#e6edf3">⚡ ZinaLog</span>
                  <span style="font-size:12px;color:#8b949e;margin-left:8px">Alert</span>
                </td>
                <td align="right">
                  <span style="display:inline-block;padding:3px 10px;background:${color}22;border:1px solid ${color}55;border-radius:4px;font-size:11px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:0.5px">${log.level}</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:#1c2128;border:1px solid #30363d;border-top:none;border-radius:0 0 12px 12px;padding:24px">

            <!-- Message -->
            <p style="margin:0 0 20px;font-size:15px;font-weight:600;color:#e6edf3;line-height:1.5">${log.message}</p>

            <!-- Details table -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #30363d;margin-top:4px">
              <tr>
                <td style="padding:8px 0;color:#8b949e;font-size:12px;width:100px">Service</td>
                <td style="padding:8px 0;font-size:13px;color:#58a6ff">${service}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#8b949e;font-size:12px">Time</td>
                <td style="padding:8px 0;font-size:12px;font-family:monospace;color:#8b949e">${log.created_at} UTC</td>
              </tr>
              ${stackHtml}
              ${metaHtml}
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:16px 0;text-align:center;font-size:11px;color:#6e7681">
            Sent by ZinaLog · <a href="#" style="color:#6e7681">Manage alerts</a>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html };
}

export function buildUserInviteEmail(input: {
  username: string;
  temporaryPassword: string;
  expiresAt: string;
  loginUrl: string;
}): { subject: string; html: string } {
  const expiresAt = new Date(input.expiresAt).toLocaleString();

  return {
    subject: "[ZinaLog] Your dashboard account is ready",
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
        <h2 style="margin-bottom:12px">Welcome to ZinaLog</h2>
        <p>An administrator created your dashboard account.</p>
        <p><strong>Username:</strong> ${input.username}</p>
        <p><strong>Temporary password:</strong> <code>${input.temporaryPassword}</code></p>
        <p>This temporary password expires at <strong>${expiresAt}</strong>. Sign in and change it immediately.</p>
        <p><a href="${input.loginUrl}">Open the login page</a></p>
      </div>
    `,
  };
}

export function buildMfaEmail(input: {
  username: string;
  code: string;
  expiresAt: string;
}): { subject: string; html: string } {
  const expiresAt = new Date(input.expiresAt).toLocaleString();

  return {
    subject: "[ZinaLog] Your verification code",
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
        <h2 style="margin-bottom:12px">Verification code</h2>
        <p>Use this one-time code to finish signing in to ZinaLog.</p>
        <p style="font-size:28px;font-weight:700;letter-spacing:4px">${input.code}</p>
        <p>This code expires at <strong>${expiresAt}</strong>.</p>
        <p>If you did not try to sign in, ignore this email and contact your administrator.</p>
      </div>
    `,
  };
}
