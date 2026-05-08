import React, { useState } from "react";
import { Menu, X } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { BRAND } from "../lib/brand";
import StratumMark from "./brand/StratumMark";
import { useAuth } from "../context/AuthContext";
import { getPortalLabel, hasPortalAccess, PORTAL } from "../lib/roles";

function linkActive(path, pathname) {
  if (path === "/portal/knowledge") return pathname.startsWith("/portal/knowledge");
  return pathname === path;
}

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const { user } = useAuth();
  const canAccessAdmin = hasPortalAccess(user, PORTAL.ADMIN);
  const adminLabel = getPortalLabel(user, PORTAL.ADMIN, "Admin");

  const navLinks = user
    ? [
        { name: "Knowledge Hub", path: "/portal/knowledge" },
        { name: "My Profile", path: "/portal/profile" },
        ...(canAccessAdmin ? [{ name: adminLabel, path: "/portal/admin" }] : []),
        { name: "Privacy", path: "/privacy" },
      ]
    : [
        { name: "Privacy", path: "/privacy" },
        { name: "Sign in", path: "/login" },
      ];

  const logoTo = user ? "/portal/knowledge" : "/login";
  const primaryCta = user
    ? { label: "Knowledge Hub", to: "/portal/knowledge" }
    : { label: "Sign in", to: "/login" };

  return (
    <nav className="fixed w-full bg-white/90 dark:bg-slate-950/90 backdrop-blur-md z-50 border-b border-gray-100 dark:border-slate-800 shadow-sm transition-all duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-20 items-center gap-3">
          <Link to={logoTo} className="flex min-w-0 items-center gap-2 group">
            <div className="bg-gradient-to-br from-sky-600 to-violet-600 p-1.5 rounded-lg shadow-md shadow-sky-600/20 group-hover:opacity-95 transition-opacity shrink-0">
              <StratumMark variant="knockout" size={28} decorative />
            </div>
            <span className="min-w-0 truncate font-display font-bold text-xl tracking-tight">
              <span className="bg-gradient-to-r from-sky-600 via-primary to-violet-600 dark:from-sky-400 dark:via-primary dark:to-violet-400 bg-clip-text text-transparent">
                {BRAND.name}
              </span>
            </span>
          </Link>

          <div className="hidden md:flex items-center space-x-8">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={`text-sm font-medium transition-colors hover:text-accent ${
                  linkActive(link.path, location.pathname) ? "text-primary" : "text-gray-600 dark:text-slate-300"
                }`}
              >
                {link.name}
              </Link>
            ))}
            <Link to={primaryCta.to} className="btn-primary text-sm shadow-md hover:shadow-lg transition-all">
              {primaryCta.label}
            </Link>
          </div>

          <div className="md:hidden flex items-center">
            <button
              type="button"
              onClick={() => setIsOpen(!isOpen)}
              className="text-gray-600 dark:text-slate-300 hover:text-primary focus:outline-none"
              aria-expanded={isOpen}
              aria-label={isOpen ? "Close menu" : "Open menu"}
            >
              {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {isOpen && (
        <div className="md:hidden bg-white dark:bg-slate-950 border-b border-gray-100 dark:border-slate-800 px-4 pt-2 pb-4 space-y-1 shadow-lg absolute w-full">
          {navLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              onClick={() => setIsOpen(false)}
              className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 dark:text-slate-200 hover:text-primary hover:bg-gray-50 dark:hover:bg-slate-800"
            >
              {link.name}
            </Link>
          ))}
          <Link
            to={primaryCta.to}
            onClick={() => setIsOpen(false)}
            className="block w-full text-center mt-4 btn-primary"
          >
            {primaryCta.label}
          </Link>
        </div>
      )}
    </nav>
  );
}
