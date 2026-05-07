import { Link } from "react-router-dom";
import { Shield, FileLock2, Mail, ExternalLink } from "lucide-react";
import { BRAND } from "../lib/brand";

export default function PortalFooter() {
  const year = new Date().getFullYear();
  return (
    <footer
      className="no-print border-t border-border bg-surface/80 backdrop-blur-sm mt-auto"
      role="contentinfo"
    >
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <p className="font-display font-semibold text-foreground tracking-tight">{BRAND.name}</p>
            <p className="text-xs text-secondary mt-2 max-w-md leading-relaxed">
              {BRAND.tagline} Internal only. Access may be logged.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background/80 px-2.5 py-1 text-[11px] font-medium text-secondary">
                <Shield size={12} className="text-primary" aria-hidden="true" />
                Secure access
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background/80 px-2.5 py-1 text-[11px] font-medium text-secondary">
                <FileLock2 size={12} className="text-primary" aria-hidden="true" />
                Audited access
              </span>
            </div>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-secondary/80 mb-3">Navigate</p>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/portal/knowledge" className="text-secondary hover:text-primary transition-colors">
                  Knowledge Center
                </Link>
              </li>
              <li>
                <Link to="/portal/admin" className="text-secondary hover:text-primary transition-colors">
                  Management
                </Link>
              </li>
              <li>
                <Link to="/privacy" className="text-secondary hover:text-primary transition-colors inline-flex items-center gap-1">
                  Privacy policy
                  <ExternalLink size={11} className="opacity-50" aria-hidden="true" />
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-secondary/80 mb-3">Support</p>
            <p className="text-sm text-secondary flex items-start gap-2">
              <Mail size={14} className="text-primary flex-shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                <a href={`mailto:${BRAND.supportEmail}`} className="hover:text-primary transition-colors">
                  {BRAND.supportEmail}
                </a>
              </span>
            </p>
            <p className="text-[11px] text-secondary/70 mt-3 leading-relaxed">
              Report security concerns through your organisation&apos;s official channel.
            </p>
          </div>
        </div>
        <div className="mt-8 pt-6 border-t border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-[11px] text-secondary/70">
          <p>© {year} {BRAND.copyrightEntity}. Internal use only.</p>
          <p className="sm:text-right">Verify critical steps with your lead.</p>
        </div>
      </div>
    </footer>
  );
}
