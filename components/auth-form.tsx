"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Image from "next/image";

const inputCls =
  "w-full bg-(--bg-card) border border-(--border) rounded-md px-3 py-2.5 text-[14px] text-foreground outline-none";

type LoginStage = "credentials" | "passwordChange" | "mfa";

const landingFeatures = [
  "HTTP ingestion",
  "SQLite-backed",
  "Real-time dashboard",
];

export default function AuthForm({ mode }: { mode: "login" | "setup" }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [stage, setStage] = useState<LoginStage>("credentials");

  const submitSetup = async () => {
    const res = await fetch("/api/auth/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Authentication failed");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  };

  const submitLogin = async () => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Authentication failed");
      return;
    }

    if (data.requiresPasswordChange) {
      setStage("passwordChange");
      setMessage(data.message ?? "Set a new password to finish signing in.");
      setPassword("");
      return;
    }

    if (data.requiresMfa) {
      setStage("mfa");
      setMessage(
        data.message ?? "Enter the verification code sent to your email.",
      );
      setPassword("");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  };

  const submitPasswordChange = async () => {
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation must match");
      return;
    }

    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPassword }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to change password");
      return;
    }

    setNewPassword("");
    setConfirmPassword("");

    if (data.requiresMfa) {
      setStage("mfa");
      setMessage(
        data.message ?? "Enter the verification code sent to your email.",
      );
      return;
    }

    router.push("/dashboard");
    router.refresh();
  };

  const submitMfa = async () => {
    const res = await fetch("/api/auth/mfa/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: mfaCode }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to verify code");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  };

  const submit = async () => {
    setLoading(true);
    setError("");

    try {
      if (mode === "setup") {
        await submitSetup();
        return;
      }

      if (stage === "credentials") {
        await submitLogin();
        return;
      }

      if (stage === "passwordChange") {
        await submitPasswordChange();
        return;
      }

      await submitMfa();
    } finally {
      setLoading(false);
    }
  };

  const showSetup = mode === "setup";
  const showCredentials = mode === "login" && stage === "credentials";
  const showPasswordChange = mode === "login" && stage === "passwordChange";
  const showMfa = mode === "login" && stage === "mfa";
  const showLandingPanel = showSetup || showCredentials;

  return (
    <div className="min-h-screen bg-background px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 lg:flex-row lg:items-center lg:gap-12">
        {showLandingPanel && (
          <section className="flex-1">
            <div className="mb-6 flex items-center gap-3">
              <Image
                src="/logo.png"
                alt="ZinaLog"
                className="h-12 w-12"
                width={64}
                height={64}
                draggable={false}
              />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-(--accent)">
                  ZinaLog
                </p>
                <p className="text-sm text-(--text-muted)">
                  lightweight, self-hosted logging and monitoring.
                </p>
              </div>
            </div>

            <div className="mt-8 space-y-3">
              {landingFeatures.map((feature) => (
                <div
                  key={feature}
                  className="rounded-xl border border-(--border) bg-(--bg-surface) px-4 py-3 text-[15px] font-medium text-foreground shadow-[0_8px_30px_rgba(0,0,0,0.18)]"
                >
                  {feature}
                </div>
              ))}
            </div>

            <div className="animate-slide-up mt-5 rounded-2xl border border-(--border) bg-(--bg-surface) p-3 shadow-[0_20px_60px_rgba(0,0,0,0.28)]">
              <Image
                src="/dashboard.png"
                alt="ZinaLog dashboard overview"
                width={1917}
                height={887}
                priority
                className="h-auto w-full rounded-xl border border-[rgba(255,255,255,0.05)]"
                sizes="(min-width: 1024px) 50vw, 100vw"
                draggable={false}
              />
            </div>
          </section>
        )}

        <div
          className={`w-full ${showLandingPanel ? "lg:max-w-md" : "mx-auto max-w-md"} bg-(--bg-surface) border border-(--border) rounded-xl p-7 flex flex-col gap-4`}
        >
          {!showLandingPanel && (
            <div className="flex items-center gap-3">
              <Image
                src="/logo.png"
                alt="ZinaLog"
                className="h-12 w-12"
                width={64}
                height={64}
                draggable={false}
              />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-(--accent)">
                  ZinaLog
                </p>
                <p className="text-sm text-(--text-muted)">
                  Secure dashboard access
                </p>
              </div>
            </div>
          )}

          <div>
            <h1 className="text-[24px] font-bold text-foreground">
              {showSetup
                ? "Set up ZinaLog"
                : showPasswordChange
                  ? "Change temporary password"
                  : showMfa
                    ? "Verify your sign-in"
                    : "Sign in"}
            </h1>
            <p className="text-[13px] text-(--text-muted) mt-1">
              {showSetup
                ? "Create the first admin account for this instance."
                : showPasswordChange
                  ? "Your temporary password can only be used once and expires after 10 minutes."
                  : showMfa
                    ? "Use the 6-digit code sent to your email."
                    : "Use your account to access the dashboard."}
            </p>
          </div>

          {message && (
            <div className="px-3 py-2 rounded-md border border-[rgba(88,166,255,0.3)] bg-[rgba(88,166,255,0.1)] text-[12px] text-(--accent)">
              {message}
            </div>
          )}

          <div className="flex flex-col gap-3">
            {(showSetup || showCredentials) && (
              <>
                <div>
                  <label className="text-[12px] text-(--text-muted) block mb-1.5">
                    Username
                  </label>
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className={inputCls}
                    autoComplete="username"
                  />
                </div>

                {showSetup && (
                  <div>
                    <label className="text-[12px] text-(--text-muted) block mb-1.5">
                      Email
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={inputCls}
                      autoComplete="email"
                    />
                  </div>
                )}

                <div>
                  <label className="text-[12px] text-(--text-muted) block mb-1.5">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputCls}
                    autoComplete={
                      showSetup ? "new-password" : "current-password"
                    }
                  />
                  {showSetup && (
                    <p className="text-[11px] text-(--text-dim) mt-1">
                      Use at least 12 characters with upper/lowercase, a number,
                      and a special character.
                    </p>
                  )}
                </div>
              </>
            )}

            {showPasswordChange && (
              <>
                <div>
                  <label className="text-[12px] text-(--text-muted) block mb-1.5">
                    New password
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className={inputCls}
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <label className="text-[12px] text-(--text-muted) block mb-1.5">
                    Confirm new password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={inputCls}
                    autoComplete="new-password"
                  />
                </div>
              </>
            )}

            {showMfa && (
              <div>
                <label className="text-[12px] text-(--text-muted) block mb-1.5">
                  Verification code
                </label>
                <input
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  className={inputCls}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                />
              </div>
            )}
          </div>

          {error && (
            <div className="px-3 py-2 rounded-md border border-[rgba(248,81,73,0.3)] bg-[rgba(248,81,73,0.1)] text-[12px] text-(--error)">
              {error}
            </div>
          )}

          <button
            onClick={submit}
            disabled={loading}
            className={`bg-(--accent-glow) rounded-md py-2.5 px-4 text-[14px] font-semibold text-white ${loading ? "opacity-70 cursor-not-allowed" : "cursor-pointer"}`}
          >
            {loading
              ? showSetup
                ? "Creating account…"
                : showPasswordChange
                  ? "Updating password…"
                  : showMfa
                    ? "Verifying…"
                    : "Signing in…"
              : showSetup
                ? "Create admin account"
                : showPasswordChange
                  ? "Update password"
                  : showMfa
                    ? "Verify code"
                    : "Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}
