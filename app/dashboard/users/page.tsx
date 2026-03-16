"use client";

import { useEffect, useState } from "react";
import ConfirmModal from "@/components/confirm-modal";
import DialogShell from "@/components/dialog-shell";

type UserRole = "admin" | "operator" | "viewer";

interface UserSummary {
  id: number;
  username: string;
  email: string | null;
  role: UserRole;
  is_active: number;
  mfa_enabled: number;
  password_is_temporary: number;
  password_expires_at: string | null;
  allowed_services: string[] | null;
  created_at: string;
  last_login_at: string | null;
}

interface CurrentUser {
  id: number;
  username: string;
  role: UserRole;
}

interface EmailDialogState {
  id: number;
  username: string;
  email: string;
}

interface ServiceAccessDialogState {
  id: number;
  username: string;
  allowed_services: string[] | null;
}

const inputCls =
  "w-full bg-(--bg-card) border border-(--border) rounded-md px-3 py-2 text-[13px] text-foreground outline-none";

function formatDate(value: string | null): string {
  if (!value) return "Never";
  return new Date(value + (value.endsWith("Z") ? "" : "Z")).toLocaleString();
}

function toggleServiceSelection(selected: string[], service: string): string[] {
  const next = selected.includes(service)
    ? selected.filter((item) => item !== service)
    : [...selected, service];

  return [...next].sort((left, right) => left.localeCompare(right));
}

function formatServiceAccess(allowedServices: string[] | null): string {
  if (allowedServices === null) {
    return "All services";
  }

  if (allowedServices.length === 0) {
    return "No services";
  }

  return allowedServices.join(", ");
}

function buildServiceOptions(
  availableServices: string[],
  selectedServices: string[] | null
): string[] {
  return Array.from(new Set([...availableServices, ...(selectedServices ?? [])])).sort((left, right) =>
    left.localeCompare(right)
  );
}

function canManageUserTarget(actorRole: UserRole | undefined, targetRole: UserRole): boolean {
  if (actorRole === "admin") return true;
  if (actorRole === "operator") return targetRole !== "admin";
  return false;
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [roles, setRoles] = useState<UserRole[]>(["viewer", "operator", "admin"]);
  const [availableServices, setAvailableServices] = useState<string[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [emailDialog, setEmailDialog] = useState<EmailDialogState | null>(null);
  const [serviceAccessDialog, setServiceAccessDialog] = useState<ServiceAccessDialogState | null>(
    null
  );
  const [deleteDialog, setDeleteDialog] = useState<{ id: number; username: string } | null>(null);
  const [form, setForm] = useState({
    username: "",
    email: "",
    role: "viewer" as UserRole,
    mfa_enabled: false,
    allowed_services: null as string[] | null,
  });

  const loadUsers = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to load users");
        return;
      }

      setUsers(data.users ?? []);
      setCurrentUser(data.currentUser ?? null);
      setRoles((data.roles ?? ["viewer", "operator", "admin"]) as UserRole[]);
      setAvailableServices(data.availableServices ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const createUser = async () => {
    setError("");
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to create user");
      return;
    }

    setForm({
      username: "",
      email: "",
      role: "viewer",
      mfa_enabled: false,
      allowed_services: null,
    });
    await loadUsers();
  };

  const patchUser = async (id: number, payload: Record<string, unknown>) => {
    setError("");
    const res = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to update user");
      return false;
    }

    await loadUsers();
    return true;
  };

  const deleteUser = async (id: number) => {
    setError("");
    const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to delete user");
      return;
    }

    await loadUsers();
  };

  const saveEmail = async () => {
    if (!emailDialog) {
      return;
    }

    const trimmedEmail = emailDialog.email.trim();
    if (!trimmedEmail) {
      setError("Email cannot be empty");
      return;
    }

    const updated = await patchUser(emailDialog.id, { email: trimmedEmail });
    if (updated) {
      setEmailDialog(null);
    }
  };

  const saveServiceAccess = async () => {
    if (!serviceAccessDialog) {
      return;
    }

    const updated = await patchUser(serviceAccessDialog.id, {
      allowed_services: serviceAccessDialog.allowed_services,
    });
    if (updated) {
      setServiceAccessDialog(null);
    }
  };

  const isAdmin = currentUser?.role === "admin";
  const currentRole = currentUser?.role;
  const adminUserCount = users.filter((user) => user.role === "admin").length;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-bold mb-1">Users</h1>
        <p className="text-[13px] text-(--text-muted)">
          Manage dashboard access and assign roles.
        </p>
      </div>

      {isAdmin && (
        <div className="bg-(--bg-card) border border-(--border) rounded-[10px] p-5 flex flex-col gap-3.5">
          <div className="text-[14px] font-semibold text-foreground">Create user</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              className={inputCls}
              placeholder="Username"
              value={form.username}
              onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
            />
            <input
              className={inputCls}
              type="email"
              placeholder="Email address"
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            />
            <select
              className={inputCls}
              value={form.role}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, role: e.target.value as UserRole }))
              }
            >
              {roles.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-[13px] text-(--text-muted)">
            <input
              type="checkbox"
              checked={form.mfa_enabled}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, mfa_enabled: e.target.checked }))
              }
            />
            Require email MFA for this user
          </label>
          <div className="rounded-md border border-(--border) bg-(--bg-surface) px-3.5 py-3 flex flex-col gap-3">
            <div>
              <div className="text-[13px] font-semibold text-foreground">Service access</div>
              <p className="text-[12px] text-(--text-dim) mt-1">
                Limit this user to specific services, or leave access unrestricted.
              </p>
            </div>

            <label className="flex items-center gap-2 text-[13px] text-(--text-muted)">
              <input
                type="radio"
                name="create-user-service-access"
                checked={form.allowed_services === null}
                onChange={() => setForm((prev) => ({ ...prev, allowed_services: null }))}
              />
              All services
            </label>

            <label className="flex items-center gap-2 text-[13px] text-(--text-muted)">
              <input
                type="radio"
                name="create-user-service-access"
                checked={form.allowed_services !== null}
                onChange={() => setForm((prev) => ({ ...prev, allowed_services: [] }))}
              />
              Only selected services
            </label>

            {form.allowed_services !== null && (
              <div className="flex flex-col gap-2">
                {availableServices.length === 0 ? (
                  <div className="text-[12px] text-(--text-dim)">
                    No services have been logged yet. You can create the user now and update access
                    later.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {availableServices.map((service) => (
                      <label
                        key={service}
                        className="flex items-center gap-2 text-[12px] text-(--text-muted)"
                      >
                        <input
                          type="checkbox"
                          checked={(form.allowed_services ?? []).includes(service)}
                          onChange={() =>
                            setForm((prev) => ({
                              ...prev,
                              allowed_services: toggleServiceSelection(
                                prev.allowed_services ?? [],
                                service
                              ),
                            }))
                          }
                        />
                        <span className="truncate">{service}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <p className="text-[12px] text-(--text-dim)">
            A temporary password is generated automatically, emailed to the user, and expires in 10
            minutes.
          </p>
          <button
            onClick={createUser}
            className="self-start bg-(--accent-glow) rounded-md py-2 px-4 text-[13px] font-semibold text-white cursor-pointer"
          >
            Create user
          </button>
        </div>
      )}

      {error && (
        <div className="px-3 py-2 rounded-md border border-[rgba(248,81,73,0.3)] bg-[rgba(248,81,73,0.1)] text-[12px] text-(--error)">
          {error}
        </div>
      )}

      <div className="bg-(--bg-card) border border-(--border) rounded-[10px] overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-(--text-dim) text-[14px]">Loading…</div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-(--bg-surface) border-b border-(--border)">
                {[
                  "Username",
                  "Email",
                  "Role",
                  "Service Access",
                  "MFA",
                  "Temp Password",
                  "Status",
                  "Created",
                  "Last Login",
                  "Actions",
                ].map((heading) => (
                  <th
                    key={heading}
                    className="px-3.5 py-2.5 text-left text-[11px] font-semibold text-(--text-dim) uppercase tracking-[0.5px]"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((user, index) => {
                const canManageTarget = canManageUserTarget(currentRole, user.role);
                const isLastAdmin = user.role === "admin" && adminUserCount <= 1;

                return (
                  <tr
                    key={user.id}
                    className={index < users.length - 1 ? "border-b border-(--border)" : ""}
                  >
                    <td className="px-3.5 py-3 text-[13px] font-semibold text-foreground">
                      {user.username}
                    </td>
                    <td className="px-3.5 py-3 text-[12px] text-(--text-dim)">
                      <div className="flex items-center gap-2">
                        <span>{user.email ?? "Not set"}</span>
                        {canManageTarget && (
                          <button
                            onClick={() =>
                              setEmailDialog({
                                id: user.id,
                                username: user.username,
                                email: user.email ?? "",
                              })
                            }
                            className="bg-transparent border border-(--border) rounded-md px-2 py-1 text-[11px] text-(--text-muted) cursor-pointer"
                          >
                            Edit
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-3.5 py-3">
                      {isAdmin ? (
                        <select
                          className={inputCls}
                          value={user.role}
                          disabled={isLastAdmin}
                          onChange={(e) =>
                            void patchUser(user.id, { role: e.target.value as UserRole })
                          }
                        >
                          {roles.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-[12px] text-(--text-muted) capitalize">
                          {user.role}
                        </span>
                      )}
                    </td>
                    <td className="px-3.5 py-3 text-[12px] text-(--text-dim)">
                      <div className="flex items-center gap-2">
                        <span className="max-w-50 truncate" title={formatServiceAccess(user.allowed_services)}>
                          {formatServiceAccess(user.allowed_services)}
                        </span>
                        {isAdmin && canManageTarget && (
                          <button
                            onClick={() =>
                              setServiceAccessDialog({
                                id: user.id,
                                username: user.username,
                                allowed_services: user.allowed_services,
                              })
                            }
                            className="bg-transparent border border-(--border) rounded-md px-2 py-1 text-[11px] text-(--text-muted) cursor-pointer"
                          >
                            Edit
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-3.5 py-3 text-[12px]">
                      {isAdmin ? (
                        <label className="flex items-center gap-2 text-(--text-muted)">
                          <input
                            type="checkbox"
                            checked={!!user.mfa_enabled}
                            onChange={(e) =>
                              void patchUser(user.id, { mfa_enabled: e.target.checked })
                            }
                          />
                          Enabled
                        </label>
                      ) : (
                        <span className="text-(--text-muted)">
                          {user.mfa_enabled ? "Enabled" : "Disabled"}
                        </span>
                      )}
                    </td>
                    <td className="px-3.5 py-3 text-[12px] text-(--text-dim)">
                      {user.password_is_temporary
                        ? `Expires ${formatDate(user.password_expires_at)}`
                        : "No"}
                    </td>
                    <td className="px-3.5 py-3 text-[12px]">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-sm font-semibold ${
                          user.is_active
                            ? "bg-[rgba(63,185,80,0.15)] text-(--success)"
                            : "bg-[rgba(139,148,158,0.15)] text-(--text-dim)"
                        }`}
                      >
                        {user.is_active ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td className="px-3.5 py-3 text-[12px] text-(--text-dim)">
                      {formatDate(user.created_at)}
                    </td>
                    <td className="px-3.5 py-3 text-[12px] text-(--text-dim)">
                      {formatDate(user.last_login_at)}
                    </td>
                    <td className="px-3.5 py-3">
                      <div className="flex gap-2">
                        {isAdmin && (
                          <>
                            <button
                              onClick={() =>
                                void patchUser(user.id, { is_active: !user.is_active })
                              }
                              disabled={isLastAdmin && !!user.is_active}
                              className="bg-transparent border border-(--border) rounded-md px-3 py-1.5 text-[12px] text-(--text-muted) cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {user.is_active ? "Disable" : "Enable"}
                            </button>
                            <button
                              onClick={() => void patchUser(user.id, { send_reset_email: true })}
                              className="bg-transparent border border-(--border) rounded-md px-3 py-1.5 text-[12px] text-(--text-muted) cursor-pointer"
                            >
                              Email reset
                            </button>
                          </>
                        )}
                        {canManageTarget && (
                          <button
                            onClick={() =>
                              setDeleteDialog({ id: user.id, username: user.username })
                            }
                            disabled={isLastAdmin}
                            className="bg-transparent border border-[rgba(248,81,73,0.3)] rounded-md px-3 py-1.5 text-[12px] text-(--error) cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {emailDialog && (
        <DialogShell
          title={`Edit email for ${emailDialog.username}`}
          description="Update the notification email address used for this user."
          onClose={() => setEmailDialog(null)}
          widthClassName="w-full max-w-[460px]"
          footer={
            <>
              <button
                onClick={() => setEmailDialog(null)}
                className="bg-(--bg-card) border border-(--border) rounded-md px-4.5 py-2 text-[13px] text-(--text-muted) cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => void saveEmail()}
                className="bg-(--accent-glow) border-none rounded-md px-4.5 py-2 text-[13px] font-semibold text-white cursor-pointer"
              >
                Save email
              </button>
            </>
          }
        >
          <div>
            <label className="text-[12px] text-(--text-muted) block mb-1.5">Email address</label>
            <input
              type="email"
              className={inputCls}
              value={emailDialog.email}
              onChange={(e) =>
                setEmailDialog((current) =>
                  current ? { ...current, email: e.target.value } : current
                )
              }
              autoFocus
            />
          </div>
        </DialogShell>
      )}

      {serviceAccessDialog && (
        <DialogShell
          title={`Edit service access for ${serviceAccessDialog.username}`}
          description="Choose whether this user can view every service or only a selected subset."
          onClose={() => setServiceAccessDialog(null)}
          widthClassName="w-full max-w-[560px]"
          footer={
            <>
              <button
                onClick={() => setServiceAccessDialog(null)}
                className="bg-(--bg-card) border border-(--border) rounded-md px-4.5 py-2 text-[13px] text-(--text-muted) cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => void saveServiceAccess()}
                className="bg-(--accent-glow) border-none rounded-md px-4.5 py-2 text-[13px] font-semibold text-white cursor-pointer"
              >
                Save access
              </button>
            </>
          }
        >
          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-2 text-[13px] text-(--text-muted)">
              <input
                type="radio"
                name="edit-user-service-access"
                checked={serviceAccessDialog.allowed_services === null}
                onChange={() =>
                  setServiceAccessDialog((current) =>
                    current ? { ...current, allowed_services: null } : current
                  )
                }
              />
              All services
            </label>

            <label className="flex items-center gap-2 text-[13px] text-(--text-muted)">
              <input
                type="radio"
                name="edit-user-service-access"
                checked={serviceAccessDialog.allowed_services !== null}
                onChange={() =>
                  setServiceAccessDialog((current) =>
                    current ? { ...current, allowed_services: current.allowed_services ?? [] } : current
                  )
                }
              />
              Only selected services
            </label>

            {serviceAccessDialog.allowed_services !== null && (
              <div className="flex flex-col gap-2 rounded-md border border-(--border) bg-(--bg-surface) p-3">
                {buildServiceOptions(
                  availableServices,
                  serviceAccessDialog.allowed_services
                ).length === 0 ? (
                  <div className="text-[12px] text-(--text-dim)">
                    No services have been logged yet. Save an empty selection to deny access until
                    services become available.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {buildServiceOptions(
                      availableServices,
                      serviceAccessDialog.allowed_services
                    ).map((service) => (
                      <label
                        key={service}
                        className="flex items-center gap-2 text-[12px] text-(--text-muted)"
                      >
                        <input
                          type="checkbox"
                          checked={(serviceAccessDialog.allowed_services ?? []).includes(service)}
                          onChange={() =>
                            setServiceAccessDialog((current) =>
                              current && current.allowed_services !== null
                                ? {
                                    ...current,
                                    allowed_services: toggleServiceSelection(
                                      current.allowed_services,
                                      service
                                    ),
                                  }
                                : current
                            )
                          }
                        />
                        <span className="truncate">{service}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogShell>
      )}

      {deleteDialog && (
        <ConfirmModal
          title={`Delete ${deleteDialog.username}?`}
          message="This will permanently remove the user account. This action cannot be undone."
          confirmLabel="Delete user"
          danger
          onCancel={() => setDeleteDialog(null)}
          onConfirm={() => {
            const current = deleteDialog;
            setDeleteDialog(null);
            void deleteUser(current.id);
          }}
        />
      )}

    </div>
  );
}
