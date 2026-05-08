import { useNavigate, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, Shield, Database, Clock, Lock, UserCheck, Mail } from "lucide-react";
import { BRAND } from "../lib/brand";
import StratumMark from "../components/brand/StratumMark";

const Section = ({ icon: Icon, title, children }) => (
  <section className="mb-8">
    <div className="flex items-center gap-2.5 mb-3">
      <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
        <Icon size={14} className="text-primary" />
      </div>
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
    </div>
    <div className="text-sm text-secondary leading-relaxed space-y-2 pl-[2.375rem]">
      {children}
    </div>
  </section>
);

export default function Privacy() {
  const navigate = useNavigate();

  return (
    <>
      <Helmet>
        <title>{`Privacy Policy — ${BRAND.name}`}</title>
        <meta name="description" content={`Privacy policy for ${BRAND.name} (internal).`} />
      </Helmet>

      <div className="min-h-screen bg-background">
        {/* Top bar */}
        <header className="border-b border-border bg-surface sticky top-0 z-10">
          <div className="max-w-3xl mx-auto px-6 h-14 flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              aria-label="Go back"
              className="flex items-center gap-1.5 text-sm text-secondary hover:text-foreground transition-colors -ml-1 px-2 py-1 rounded-lg hover:bg-surface-hover"
            >
              <ArrowLeft size={15} />
              Back
            </button>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2">
              <div className="rounded-md overflow-hidden ring-1 ring-primary/20 flex-shrink-0">
                <StratumMark variant="tile" size={22} decorative />
              </div>
              <span className="text-xs font-semibold text-foreground font-display">{BRAND.name}</span>
            </div>
          </div>
        </header>

        <main className="max-w-3xl mx-auto px-6 py-10 page-enter">

          {/* Page heading */}
          <div className="mb-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/8 border border-primary/20 text-xs font-medium text-primary mb-4">
              <Shield size={11} />
              Internal Use Only
            </div>
            <h1 className="text-3xl font-bold text-foreground mb-3">Privacy Policy</h1>
            <p className="text-sm text-secondary leading-relaxed">
              How <strong className="text-foreground">{BRAND.name}</strong> handles data for {BRAND.operatorName}{" "}
              employees using this internal tool.
            </p>
            <p className="text-xs text-secondary/60 mt-3">
              Last updated: {new Date().toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" })}
            </p>
          </div>

          <div className="w-full h-px bg-border mb-10" />

          <Section icon={Database} title="Data We Collect">
            <p>Data we process includes:</p>
            <ul className="list-disc list-inside space-y-1 mt-2">
              <li><strong className="text-foreground">Search and assistant queries</strong> — for retrieval and knowledge-gap reporting.</li>
              <li><strong className="text-foreground">Answer feedback</strong> — thumbs up/down on assistant replies.</li>
              <li><strong className="text-foreground">Auth events</strong> — login timestamps for audit.</li>
              <li><strong className="text-foreground">Session tokens</strong> — short-lived JWTs in browser storage.</li>
              <li><strong className="text-foreground">Role and org fields</strong> — for access control.</li>
            </ul>
            <p className="mt-2">We do <strong className="text-foreground">not</strong> use general web browsing history, personal financial data, or data unrelated to this app.</p>
          </Section>

          <Section icon={UserCheck} title="How We Use Your Data">
            <ul className="list-disc list-inside space-y-1.5">
              <li><strong className="text-foreground">Knowledge base</strong> — surfacing gaps to admins from no/low-confidence queries.</li>
              <li><strong className="text-foreground">Quality</strong> — aggregate feedback for retrieval tuning.</li>
              <li><strong className="text-foreground">Security</strong> — login and access review for abuse detection.</li>
              <li><strong className="text-foreground">Access control</strong> — role and org drive what you can see and do.</li>
            </ul>
            <p className="mt-2">Not sold to third parties or used for external marketing.</p>
          </Section>

          <Section icon={Clock} title="Data Retention">
            <div className="rounded-xl border border-border bg-surface overflow-hidden">
              <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-background/50">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-secondary uppercase tracking-wider">Data Type</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-secondary uppercase tracking-wider">Retention Period</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {[
                    ["Search query logs", "90 days"],
                    ["AI conversation history", "90 days"],
                    ["Feedback records", "1 year"],
                    ["Login audit logs", "2 years (compliance requirement)"],
                    ["Session tokens", "Until logout or token expiry (8 hours)"],
                    ["User account data", "For the duration of employment"],
                  ].map(([type, period]) => (
                    <tr key={type} className="hover:bg-surface-hover transition-colors">
                      <td className="px-4 py-2.5 text-foreground">{type}</td>
                      <td className="px-4 py-2.5 text-secondary">{period}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
            <p className="mt-3">After retention, data is purged from production systems per policy.</p>
          </Section>

          <Section icon={Lock} title="Security Measures">
            <ul className="list-disc list-inside space-y-1.5">
              <li><strong className="text-foreground">Auth</strong> — JWTs for API calls (typical 8h expiry); optional TOTP MFA.</li>
              <li><strong className="text-foreground">At rest</strong> — database and embeddings encrypted (e.g. AES-256) per platform standard.</li>
              <li><strong className="text-foreground">In transit</strong> — TLS between browser and services.</li>
              <li><strong className="text-foreground">RBAC</strong> — server-side checks on content and actions.</li>
              <li><strong className="text-foreground">Data residency</strong> — processing stays inside your organisation&apos;s network boundary as deployed.</li>
            </ul>
          </Section>

          <Section icon={Shield} title="Your Rights">
            <p>As an authorised user, you have the following rights regarding your personal data:</p>
            <ul className="list-disc list-inside space-y-1.5 mt-2">
              <li><strong className="text-foreground">Access</strong> — you may request a summary of data held about you.</li>
              <li><strong className="text-foreground">Deletion</strong> — you may request deletion of your query and feedback history. Account data will be removed on offboarding.</li>
              <li><strong className="text-foreground">Correction</strong> — if your role or name is incorrect, contact your IT administrator.</li>
              <li><strong className="text-foreground">Restriction</strong> — you may request that your data not be used for analytics purposes.</li>
            </ul>
            <p className="mt-3">Use the contact below or your internal helpdesk.</p>
          </Section>

          <Section icon={Mail} title="Contact">
            <p>For privacy-related enquiries, data requests, or to report a concern, contact the IT Admin team:</p>
            <div className="mt-3 p-4 rounded-xl border border-border bg-surface space-y-1.5 break-words">
              <p><strong className="text-foreground">IT Admin Team</strong></p>
              <p>Internal helpdesk: <span className="font-mono text-xs bg-surface-hover px-1.5 py-0.5 rounded">it-admin@stratum.internal</span></p>
              <p>Slack channel: <span className="font-mono text-xs bg-surface-hover px-1.5 py-0.5 rounded">#it-helpdesk</span></p>
              <p>Response time: Within 2 business days</p>
            </div>
          </Section>

          <div className="w-full h-px bg-border my-8" />

          {/* Footer */}
          <footer className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-xs text-secondary/60">
            <p>{BRAND.name} — Internal Policy Document</p>
            <Link
              to="/portal/knowledge"
              className="text-primary hover:text-primary/80 font-medium transition-colors"
            >
              Back to Knowledge Hub →
            </Link>
          </footer>
        </main>
      </div>
    </>
  );
}
