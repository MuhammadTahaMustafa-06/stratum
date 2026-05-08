import { useState, useEffect } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getPortalDescription, getPortalLabel, hasPortalAccess, ROLE_LABELS } from "../lib/roles";
import Chatbot from "./Chatbot";
import CookieConsent from "./CookieConsent";
import PortalFooter from "./PortalFooter";
import {
  Library, LayoutDashboard, UserCircle2, LogOut, Sun, Moon,
  PanelLeftClose, PanelLeft, ChevronRight, Bookmark, Menu, X,
} from "lucide-react";
import { BRAND } from "../lib/brand";
import StratumMark from "./brand/StratumMark";
import { motion, AnimatePresence } from "framer-motion";

const PORTALS = [
  { id: "knowledge", label: "Knowledge Center", icon: Library,        path: "/portal/knowledge", description: "Policies & Procedures" },
  { id: "profile",   label: "My Account",       icon: UserCircle2,    path: "/portal/profile",   description: "View profile" },
  { id: "admin",     label: "Management",       icon: LayoutDashboard, path: "/portal/admin",    description: "Platform administration" },
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

/** Shared nav link list — used in both sidebar and drawer */
function NavLinks({ availablePortals, location, navigate, collapsed = false, onNavigate }) {
  const handleNav = (path) => {
    navigate(path);
    onNavigate?.();
  };

  return (
    <nav
      role="navigation"
      aria-label="Portal navigation"
      className={`flex-1 py-3 px-2 space-y-0.5 overflow-hidden`}
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
            onClick={() => handleNav(portal.path)}
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
      {availablePortals.some((p) => p.id === "knowledge") && (
        <button
          type="button"
          onClick={() => handleNav("/portal/knowledge/bookmarks")}
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
  );
}

/** Mobile drawer — slides in from left */
function MobileDrawer({ open, onClose, user, availablePortals, location, navigate, dark, toggleDark, logout }) {
  // Lock body scroll when drawer is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Drawer panel */}
          <motion.aside
            key="drawer-panel"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
            className="fixed inset-y-0 left-0 z-50 w-72 flex flex-col bg-surface border-r border-border shadow-2xl"
            aria-label="Mobile navigation"
          >
            {/* Drawer header */}
            <div className="h-14 flex items-center justify-between px-4 border-b border-border flex-shrink-0">
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <div className="rounded-md overflow-hidden flex-shrink-0 ring-1 ring-primary/15 shadow-sm">
                  <StratumMark variant="tile" size={24} decorative />
                </div>
                <span className="font-display font-semibold text-[13px] text-foreground truncate tracking-tight leading-tight">
                  {BRAND.name}
                </span>
              </div>
              <button
                onClick={onClose}
                aria-label="Close navigation"
                className="p-1.5 text-secondary hover:text-foreground rounded-lg hover:bg-surface-hover transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Nav links */}
            <NavLinks
              availablePortals={availablePortals}
              location={location}
              navigate={navigate}
              collapsed={false}
              onNavigate={onClose}
            />

            {/* Footer: user card + actions */}
            <div className="border-t border-border py-3 flex-shrink-0 px-3">
              <div className="space-y-3">
                <div className="flex items-center gap-2.5 px-1">
                  <UserAvatar user={user} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold truncate leading-snug">{user?.full_name}</p>
                    <p className="text-xs text-secondary truncate leading-snug">
                      {ROLE_LABELS[user?.role] || user?.role}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={toggleDark}
                    aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] text-secondary hover:text-foreground hover:bg-surface-hover rounded-lg transition-colors"
                  >
                    {dark ? <Sun size={13} aria-hidden="true" /> : <Moon size={13} aria-hidden="true" />}
                    {dark ? "Light" : "Dark"}
                  </button>
                  <button
                    onClick={() => { logout(); navigate("/login"); onClose(); }}
                    aria-label="Sign out"
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] text-secondary hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
                  >
                    <LogOut size={13} aria-hidden="true" />
                    Sign out
                  </button>
                </div>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

export default function PortalLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [dark, toggleDark] = useDarkMode();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close drawer on route change
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  const availablePortals = PORTALS
    .filter((p) => hasPortalAccess(user, p.id))
    .map((p) => ({
      ...p,
      label: getPortalLabel(user, p.id, p.label),
      description: getPortalDescription(user, p.id, p.description),
    }));

  return (
    <div className="min-h-screen flex bg-background text-foreground">

      {/* Skip to content */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-white focus:rounded-lg focus:text-sm focus:font-medium"
      >
        Skip to content
      </a>

      {/* ── Mobile top navbar ─────────────────────────────────────── */}
      <header className="md:hidden fixed top-0 inset-x-0 z-30 h-14 flex items-center justify-between px-4 bg-surface border-b border-border">
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="Open navigation"
          className="p-2 -ml-1 text-secondary hover:text-foreground rounded-lg hover:bg-surface-hover transition-colors"
        >
          <Menu size={20} />
        </button>

        <div className="flex items-center gap-2">
          <div className="rounded-md overflow-hidden ring-1 ring-primary/15 shadow-sm">
            <StratumMark variant="tile" size={22} decorative />
          </div>
          <span className="font-display font-semibold text-[13px] text-foreground tracking-tight">
            {BRAND.name}
          </span>
        </div>

        <button
          onClick={toggleDark}
          aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
          className="p-2 -mr-1 text-secondary hover:text-foreground rounded-lg hover:bg-surface-hover transition-colors"
        >
          {dark ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
        </button>
      </header>

      {/* ── Mobile drawer ─────────────────────────────────────────── */}
      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        user={user}
        availablePortals={availablePortals}
        location={location}
        navigate={navigate}
        dark={dark}
        toggleDark={toggleDark}
        logout={logout}
      />

      {/* ── Desktop Sidebar ───────────────────────────────────────── */}
      <aside
        aria-label="Main navigation"
        className={`${collapsed ? "w-[54px]" : "w-[210px]"} hidden md:flex flex-shrink-0 flex-col bg-surface border-r border-border transition-all duration-200 ease-in-out`}
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

        <NavLinks
          availablePortals={availablePortals}
          location={location}
          navigate={navigate}
          collapsed={collapsed}
        />

        {/* Sidebar footer */}
        <div className={`border-t border-border py-3 flex-shrink-0 ${collapsed ? "px-2" : "px-3"}`}>
          {!collapsed ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2.5 px-1">
                <UserAvatar user={user} size={28} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold truncate leading-snug">{user?.full_name}</p>
                  <p className="text-xs text-secondary truncate leading-snug">
                    {ROLE_LABELS[user?.role] || user?.role}
                  </p>
                </div>
              </div>
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
        {/* Push content below mobile top navbar */}
        <div className="h-14 flex-shrink-0 md:hidden" aria-hidden="true" />
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
