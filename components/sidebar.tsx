"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  ScrollText,
  AlertTriangle,
  TriangleAlert,
  Info,
  Bug,
  KeyRound,
  Settings,
  Activity,
  Menu,
  X,
  Layers,
  ChevronDown,
  Users,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { APP_VERSION } from "@/lib/version";
import type { SessionUser } from "@/lib/session-auth";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/logs", label: "Logs", icon: ScrollText },
];

const groupItems = [
  {
    href: "/dashboard/groups/errors",
    label: "Errors",
    icon: AlertTriangle,
    color: "var(--error)",
  },
  {
    href: "/dashboard/groups/warn",
    label: "Warnings",
    icon: TriangleAlert,
    color: "var(--warning)",
  },
  {
    href: "/dashboard/groups/info",
    label: "Info",
    icon: Info,
    color: "var(--accent)",
  },
  {
    href: "/dashboard/groups/debug",
    label: "Debug",
    icon: Bug,
    color: "var(--debug)",
  },
];

function NavLinks({
  onNavigate,
  currentUser,
}: {
  onNavigate?: () => void;
  currentUser: SessionUser;
}) {
  const pathname = usePathname();
  const canManageKeys =
    currentUser.role === "admin" || currentUser.role === "operator";
  const canManageSettings = currentUser.role === "admin";
  const canManageAccessAudit = currentUser.role === "admin";
  const canSeeAdministrative =
    currentUser.role === "admin" || currentUser.role === "operator";
  const isActive = (href: string) =>
    href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname.startsWith(href);
  const adminItems = [
    ...(canManageKeys
      ? [{ href: "/dashboard/keys", label: "API Keys", icon: KeyRound }]
      : []),
    { href: "/dashboard/users", label: "Users", icon: Users },
    ...(canManageAccessAudit
      ? [
          {
            href: "/dashboard/access-audit",
            label: "Access Audit",
            icon: ShieldCheck,
          },
        ]
      : []),
    ...(canManageSettings
      ? [{ href: "/dashboard/settings", label: "Settings", icon: Settings }]
      : []),
  ];

  const groupsActive = pathname.startsWith("/dashboard/groups");
  const adminActive =
    canSeeAdministrative && adminItems.some(({ href }) => isActive(href));
  const [groupsPinnedOpen, setGroupsPinnedOpen] = useState(false);
  const [adminPinnedOpen, setAdminPinnedOpen] = useState(false);
  const groupsOpen = groupsActive || groupsPinnedOpen;
  const adminOpen = adminActive || adminPinnedOpen;

  return (
    <nav className="flex-1 px-2.5 py-3">
      {navItems.map(({ href, label, icon: Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-md mb-0.5 no-underline text-[13px] transition-all duration-150 ${
              active
                ? "font-semibold text-(--accent) bg-[rgba(88,166,255,0.1)]"
                : "font-normal text-(--text-muted) bg-transparent"
            }`}
          >
            <Icon size={16} />
            {label}
          </Link>
        );
      })}

      {/* Groups collapsible section */}
      <button
        onClick={() => {
          if (!groupsActive) {
            setGroupsPinnedOpen((open) => !open);
          }
        }}
        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-md mb-0.5 w-full border-none cursor-pointer text-[13px] text-left transition-all duration-150 ${
          groupsActive
            ? "font-semibold text-(--accent) bg-[rgba(88,166,255,0.1)]"
            : "font-normal text-(--text-muted) bg-transparent"
        }`}
      >
        <Layers size={16} />
        <span className="flex-1">Groups</span>
        <ChevronDown
          size={14}
          className={`transition-transform duration-200 opacity-60 ${groupsOpen ? "rotate-180" : "rotate-0"}`}
        />
      </button>

      {groupsOpen && (
        <div className="pl-3.5 mb-0.5">
          {groupItems.map(({ href, label, icon: Icon, color }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={onNavigate}
                className={`flex items-center gap-2.25 px-3 py-2 rounded-md mb-px no-underline text-[12px] transition-all duration-150 ${
                  active ? "font-semibold" : "font-normal text-(--text-muted)"
                }`}
                style={
                  active
                    ? {
                        color,
                        background: `color-mix(in srgb, ${color} 12%, transparent)`,
                      }
                    : undefined
                }
              >
                <Icon size={14} style={{ color: active ? color : undefined }} />
                {label}
              </Link>
            );
          })}
        </div>
      )}

      {canSeeAdministrative && (
        <>
          <button
            onClick={() => {
              if (!adminActive) {
                setAdminPinnedOpen((open) => !open);
              }
            }}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-md mb-0.5 w-full border-none cursor-pointer text-[13px] text-left transition-all duration-150 ${
              adminActive
                ? "font-semibold text-(--accent) bg-[rgba(88,166,255,0.1)]"
                : "font-normal text-(--text-muted) bg-transparent"
            }`}
          >
            <Settings size={16} />
            <span className="flex-1">Administrative</span>
            <ChevronDown
              size={14}
              className={`transition-transform duration-200 opacity-60 ${adminOpen ? "rotate-180" : "rotate-0"}`}
            />
          </button>

          {adminOpen && (
            <div className="pl-3.5 mb-0.5">
              {adminItems.map(({ href, label, icon: Icon }) => {
                const active = pathname === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={onNavigate}
                    className={`flex items-center gap-2.25 px-3 py-2 rounded-md mb-px no-underline text-[12px] transition-all duration-150 ${
                      active
                        ? "font-semibold text-(--accent)"
                        : "font-normal text-(--text-muted)"
                    }`}
                  >
                    <Icon size={14} />
                    {label}
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}
    </nav>
  );
}

export default function Sidebar({ currentUser }: { currentUser: SessionUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawerPath, setDrawerPath] = useState<string | null>(null);
  const drawerOpen = drawerPath === pathname;
  const lastAuditedPath = useRef<string | null>(null);

  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.refresh();
    router.push("/login");
  };

  // Prevent body scroll when drawer is open
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  useEffect(() => {
    if (
      !pathname?.startsWith("/dashboard") ||
      lastAuditedPath.current === pathname
    ) {
      return;
    }

    lastAuditedPath.current = pathname;
    void fetch("/api/auth/access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resource: pathname }),
    });
  }, [pathname]);

  return (
    <>
      {/*  Desktop sidebar  */}
      <aside className="sidebar-wrap w-55 min-h-screen bg-(--bg-surface) border-r border-(--border) flex flex-col fixed top-0 left-0 bottom-0 z-40">
        <div className="px-5 pt-5 pb-4 border-b border-(--border)">
          <Link href="/dashboard" className="no-underline">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#209CEE] flex items-center justify-center">
                <Image src="/logo.png" alt="ZinaLog" width={20} height={20} />
              </div>
              <div>
                <div className="font-bold text-[17px] text-foreground tracking-[-0.3px]">
                  ZinaLog
                </div>
                <div className="text-[10px] text-(--text-dim) -mt-0.5">
                  App Logs {APP_VERSION}
                </div>
              </div>
            </div>
          </Link>
        </div>

        <div className="px-5 py-2.5 border-b border-(--border)">
          <div className="flex items-center gap-1.5 text-[11px] text-(--success)">
            <Activity size={12} />
            <span className="opacity-80">Collecting logs</span>
            <span className="pulse-dot w-1.5 h-1.5 rounded-full bg-(--success) ml-0.5" />
          </div>
        </div>

        <NavLinks currentUser={currentUser} />

        <div className="px-5 py-3 border-t border-(--border) flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-[12px] text-foreground truncate">
              {currentUser.username}
            </div>
            <div className="text-[11px] text-(--text-dim) capitalize">
              {currentUser.role}
            </div>
          </div>
          <button
            onClick={signOut}
            className="bg-transparent border border-(--border) rounded-md p-2 text-(--text-muted) cursor-pointer flex items-center"
            aria-label="Sign out"
          >
            <LogOut size={14} />
          </button>
        </div>
      </aside>

      {/*  Mobile top header  */}
      <header className="mobile-header hidden fixed top-0 left-0 right-0 z-50 h-13.5 bg-(--bg-surface) border-b border-(--border) items-center px-4 gap-2.5">
        {/* Hamburger */}
        <button
          onClick={() => setDrawerPath(pathname)}
          className="bg-transparent border-none cursor-pointer text-(--text-muted) p-1 rounded-md flex items-center justify-center"
          aria-label="Open menu"
        >
          <Menu size={22} />
        </button>

        {/* Logo */}
        <Link
          href="/dashboard"
          className="no-underline flex items-center gap-2"
        >
          <div className="w-8 h-8 rounded-lg bg-[#209CEE] flex items-center justify-center">
            <Image src="/logo.png" alt="ZinaLog" width={20} height={20} />
          </div>
          <span className="font-bold text-[16px] text-foreground tracking-[-0.3px]">
            ZinaLog
          </span>
        </Link>

        {/* Live dot */}
        <div className="ml-auto flex items-center gap-1 text-[11px] text-(--success)">
          <span className="pulse-dot w-1.75 h-1.75 rounded-full bg-(--success)" />
          <span className="opacity-80">Live</span>
        </div>
      </header>

      {/*  Mobile drawer backdrop  */}
      {drawerOpen && (
        <div
          onClick={() => setDrawerPath(null)}
          className="fixed inset-0 z-59 bg-black/60 backdrop-blur-[2px]"
        />
      )}

      {/*  Mobile drawer  */}
      {drawerOpen && (
        <div className="fixed top-0 left-0 bottom-0 z-60 w-65 flex flex-col bg-(--bg-surface) border-r border-(--border) animate-[slideInLeft_0.22s_ease-out]">
          {/* Drawer header */}
          <div className="px-4 pt-4 pb-3.5 border-b border-(--border) flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#209CEE] flex items-center justify-center">
              <Image src="/logo.png" alt="ZinaLog" width={20} height={20} />
            </div>
            <div className="flex-1">
              <div className="font-bold text-[16px] text-foreground">
                ZinaLog
              </div>
              <div className="text-[10px] text-(--text-dim) -mt-px">
                App Logs {APP_VERSION}
              </div>
            </div>
            <button
              onClick={() => setDrawerPath(null)}
              className="bg-transparent border-none cursor-pointer text-(--text-dim) p-1 rounded-md flex"
              aria-label="Close menu"
            >
              <X size={18} />
            </button>
          </div>

          {/* Live indicator */}
          <div className="px-4.5 py-2.5 border-b border-(--border)">
            <div className="flex items-center gap-1.5 text-[11px] text-(--success)">
              <Activity size={12} />
              <span className="opacity-80">Collecting logs</span>
              <span className="pulse-dot w-1.5 h-1.5 rounded-full bg-(--success) ml-0.5" />
            </div>
          </div>

          {/* Nav links  close drawer on click */}
          <NavLinks
            currentUser={currentUser}
            onNavigate={() => setDrawerPath(null)}
          />

          <div className="px-4.5 py-3 border-t border-(--border) flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-[12px] text-foreground truncate">
                {currentUser.username}
              </div>
              <div className="text-[11px] text-(--text-dim) capitalize">
                {currentUser.role}
              </div>
            </div>
            <button
              onClick={signOut}
              className="bg-transparent border border-(--border) rounded-md p-2 text-(--text-muted) cursor-pointer flex items-center"
              aria-label="Sign out"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
