import { NextRequest, NextResponse } from "next/server";
import { getAllSettings, setSettings } from "@/lib/db";
import {
  ALL_ALERT_SETTING_KEYS,
  isMaskedAlertSettingValue,
  sanitizeAlertSettingsForClient,
} from "@/lib/alert-settings";
import { requireApiUser } from "@/lib/session-auth";

// Validation helpers

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE   = /^https?:\/\/.+/;

function isValidEmail(v: string)   { return !v || EMAIL_RE.test(v); }
function isValidUrl(v: string)     { return !v || URL_RE.test(v); }
function isValidPort(v: string)    { const n = Number(v); return !v || (Number.isInteger(n) && n >= 1 && n <= 65535); }
function isPositiveInt(v: string)  { const n = Number(v); return !v || (Number.isInteger(n) && n > 0); }

type Validator = (v: string) => boolean;
const FIELD_VALIDATORS: Record<string, [Validator, string]> = {
  email_from:          [isValidEmail,  "must be a valid email address"],
  email_to:            [isValidEmail,  "must be a valid email address"],
  slack_webhook_url:   [isValidUrl,    "must be a valid http/https URL"],
  discord_webhook_url: [isValidUrl,    "must be a valid http/https URL"],
  webhook_url:         [isValidUrl,    "must be a valid http/https URL"],
  smtp_port:           [isValidPort,   "must be an integer between 1 and 65535"],
  alert_threshold:     [isPositiveInt, "must be a positive integer"],
  alert_cooldown:      [isPositiveInt, "must be a positive integer"],
}

export async function GET() {
  const auth = await requireApiUser("admin");
  if (!auth.ok) return auth.response;

  return NextResponse.json(sanitizeAlertSettingsForClient(await getAllSettings()));
}

export async function POST(req: NextRequest) {
  const auth = await requireApiUser("admin");
  if (!auth.ok) return auth.response;

  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updates: Record<string, string> = {};
  const validationErrors: string[] = [];

  for (const key of ALL_ALERT_SETTING_KEYS) {
    if (!(key in body)) continue;
    const val = String(body[key]);
    if (isMaskedAlertSettingValue(key, val)) continue;

    const validator = FIELD_VALIDATORS[key];
    if (validator) {
      const [check, message] = validator;
      if (!check(val)) validationErrors.push(`${key}: ${message}`);
    }

    updates[key] = val;
  }

  if (validationErrors.length > 0) {
    return NextResponse.json({ error: "Validation failed", details: validationErrors }, { status: 400 });
  }

  await setSettings(updates);
  return NextResponse.json({ status: "saved" });
}
