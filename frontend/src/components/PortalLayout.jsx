import { useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { hasPortalAccess, ROLE_LABELS } from "../lib/roles";
import Chatbot from "./Chatbot";
import CookieConsent from "./CookieConsent";
import PortalFooter from "./PortalFooter";
import { Library, LayoutDashboard, UserCircle2, LogOut, Sun, Moon, PanelLeftClose, PanelLeft, ChevronRight, Bookmark } from "lucide-react";
import { BRAND } from "../lib/brand";
import StratumMark from "./brand/StratumMark";

const PORTALS = [
  { id: "knowledge", label: "Knowledge Hub", icon: Library, path: "/portal/knowledge", description: "Search & browse docs" },
  { id: "profile",   label: "My Profile",    icon: UserCircle2, path: "/portal/profile", description: "View your account" },
  { id: "admin",     label: "Admin",          icon: LayoutDashboard, path: "/portal/admin", description: "Manage content" },
];

const ROLE_AVATAR_COLOR = {
  system_admin:    "bg-red-500/15 text-red-500",
  knowledge_admin: "bg-purple-500/15 text-purple-500",
  domain_expert:   "bg-amber-500/15 text-amber-500",
  employee:        "bg-blue-500/15 text-blue-500",
};

function useDarkMode() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("stratum-theme", next ? "dark" : "light");
  };
  return [dark, toggle];
}

function UserAvatar({ user, size = 28 }) {
  const role = user?.role || "employee";
  const colorClass = ROLE_AVATAR_COLOR[role] || ROLE_AVATAR_COLOR.employee;
  const initials = (user?.full_name || "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div
      className={`rounded-lg ${colorClass} flex items-center justify-center flex-shrink-0 font-semibold select-none`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials}
    </div>
  );
}

export default function PortalLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [dark, toggleDark] = useDarkMode();
  const [collapsed, setCollapsed] = useState(false);

  const availablePortals = PORTALS.filter((p) => hasPortalAccess(user, p.id));

  return (
    <div className="min-h-screen flex bg-background text-foreground">

      {/* Skip to content */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-white focus:rounded-lg focus:text-sm focus:font-medium"
      >
        Skip to content
      </a>

      {/* ── Sidebar ───────────────────────────────────────────────── */}
      <aside
        aria-label="Main navigation"
        className={`${collapsed ? "w-[54px]" : "w-[210px]"} flex-shrink-0 flex flex-col bg-surface border-r border-border transition-all duration-200 ease-in-out`}
      >

        {/* Logo row */}
        <div className={`h-14 flex items-center border-b border-border flex-shrink-0 ${collapsed ? "justify-center px-0" : "px-4 gap-2.5"}`}>
          {!collapsed && (
            <>
              <div className="rounded-md overflow-hidden flex-shrink-0 ring-1 ring-primary/15 shadow-sm">
                <StratumMark variant="tile" size={24} decorative />
              </div>
              <span className="font-display font-semibold text-[13px] text-foreground flex-1 truncate tracking-tight leading-tight">
                {BRAND.name}
              </span>
            </>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="text-secondary hover:text-foreground transition-colors p-1 rounded"
          >
            {collapsed ? <PanelLeft size={14} /> : <PanelLeftClose size={14} />}
          </button>
        </div>

        {/* Nav */}
        <nav
          role="navigation"
          aria-label="Portal navigation"
          className="flex-1 py-3 px-2 space-y-0.5 overflow-hidden"
        >
          {!collapsed && (
            <p className="px-2 text-[10px] font-semibold text-secondary/65 uppercase tracking-eyebrow mb-2">Portals</p>
          )}
          {availablePortals.map((portal) => {
            const Icon = portal.icon;
            const active =
              portal.path === "/portal/knowledge"
                ? location.pathname === "/portal/knowledge" ||
                  location.pathname.startsWith("/portal/knowledge/articles")
                : location.pathname.startsWith(portal.path);
            return (
              <button
                key={portal.id}
                onClick={() => navigate(portal.path)}
                title={collapsed ? portal.label : undefined}
                aria-label={collapsed ? portal.label : undefined}
                aria-current={active ? "page" : undefined}
                className={`w-full flex items-center gap-2.5 rounded-lg text-[13px] leading-snug transition-all
                  ${collapsed ? "justify-center px-0 py-2.5" : "px-2.5 py-2"}
                  ${active
                    ? "bg-primary/10 text-primary font-semibold"
                    : "text-secondary hover:text-foreground hover:bg-surface-hover"
                  }`}
              >
                <Icon size={15} className="flex-shrink-0" aria-hidden="true" />
                {!collapsed && (
                  <span className="flex-1 text-left truncate">{portal.label}</span>
                )}
                {!collapsed && active && <ChevronRight size={12} className="flex-shrink-0 opacity-60" aria-hidden="true" />}
              </button>
            );
          })}
          {hasPortalAccess(user, "knowledge") && (
            <button
              type="button"
              onClick={() => navigate("/portal/knowledge/bookmarks")}
              title={collapsed ? "Bookmarks" : undefined}
              aria-label={collapsed ? "Bookmarks" : undefined}
              aria-current={location.pathname === "/portal/knowledge/bookmarks" ? "page" : undefined}
              className={`w-full flex items-center gap-2.5 rounded-lg text-[13px] leading-snug transition-all mt-1
                ${collapsed ? "justify-center px-0 py-2.5" : "px-2.5 py-2"}
                ${location.pathname === "/portal/knowledge/bookmarks"
                  ? "bg-primary/10 text-primary font-semibold"
                  : "text-secondary hover:text-foreground hover:bg-surface-hover"
                }`}
            >
              <Bookmark size={15} className="flex-shrink-0" aria-hidden="true" />
              {!collapsed && <span className="flex-1 text-left truncate">Bookmarks</span>}
            </button>
          )}
        </nav>

        {/* Footer */}
        <div className={`border-t border-border py-3 flex-shrink-0 ${collapsed ? "px-2" : "px-3"}`}>
          {!collapsed ? (
            <div className="space-y-3">
              {/* User card */}
              <div className="flex items-center gap-2.5 px-1">
                <UserAvatar user={user} size={28} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold truncate leading-snug">{user?.full_name}</p>
                  <p className="text-xs text-secondary truncate leading-snug">
                    {ROLE_LABELS[user?.role] || user?.role}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-1">
                <button
                  onClick={toggleDark}
                  aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] text-secondary hover:text-foreground hover:bg-surface-hover rounded-lg transition-colors"
                >
                  {dark ? <Sun size={12} aria-hidden="true" /> : <Moon size={12} aria-hidden="true" />}
                  {dark ? "Light" : "Dark"}
                </button>
                <button
                  onClick={() => { logout(); navigate("/login"); }}
                  aria-label="Sign out"
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] text-secondary hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
                >
                  <LogOut size={12} aria-hidden="true" />
                  Sign out
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5">
              <UserAvatar user={user} size={26} />
              <button
                onClick={toggleDark}
                aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
                title={dark ? "Light mode" : "Dark mode"}
                className="p-1.5 text-secondary hover:text-foreground rounded-lg transition-colors"
              >
                {dark ? <Sun size={13} aria-hidden="true" /> : <Moon size={13} aria-hidden="true" />}
              </button>
              <button
                onClick={() => { logout(); navigate("/login"); }}
                aria-label="Sign out"
                title="Sign out"
                className="p-1.5 text-secondary hover:text-red-500 rounded-lg transition-colors"
              >
                <LogOut size={13} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ── Main content ──────────────────────────────────────────── */}
      <main id="main-content" role="main" className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
          <div className="flex-1">
            <Outlet />
          </div>
          <PortalFooter />
        </div>
      </main>

      <Chatbot />
      <CookieConsent />
    </div>
  );
}
