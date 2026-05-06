import { useState, useEffect } from "react";
import { listExperts, upsertMyExpertProfile } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { Users, Search, Loader2, Mail, Tag, CheckCircle2 } from "lucide-react";

const DOMAINS_OPTS = ["", "application", "banking", "process", "payments", "compliance", "risk"];

const AVAILABILITY_COLORS = {
  available: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  busy: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  away: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

function ExpertCard({ expert }) {
  const avColor = AVAILABILITY_COLORS[expert.availability] || AVAILABILITY_COLORS.available;
  const initials = (expert.full_name || "?").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="p-4 rounded-lg border border-border bg-surface hover:border-primary/40 transition-all">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
          <span className="text-xs font-bold text-primary">{initials}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-foreground truncate">{expert.full_name}</p>
            <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${avColor}`}>
              {expert.availability}
            </span>
          </div>
          {expert.department && (
            <p className="text-xs text-secondary mt-0.5">{expert.department} · {expert.team}</p>
          )}
          {expert.bio && (
            <p className="text-xs text-secondary mt-1 leading-relaxed line-clamp-2">{expert.bio}</p>
          )}

          {/* Domains */}
          {expert.domains?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {expert.domains.map((d) => (
                <span key={d} className="px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary">
                  {d}
                </span>
              ))}
            </div>
          )}

          {/* Skills */}
          {expert.skills?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {expert.skills.slice(0, 4).map((s) => (
                <span key={s} className="px-2 py-0.5 text-xs rounded-full border border-border text-secondary">
                  {s}
                </span>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3 mt-3">
            <span className="flex items-center gap-1 text-xs text-secondary">
              <Tag size={11} /> {expert.articles_count} articles
            </span>
            <a
              href={`mailto:${expert.email}`}
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <Mail size={11} /> Contact
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function MyProfileForm({ onSave }) {
  const [form, setForm] = useState({ domains: "", systems: "", skills: "", availability: "available", contact_preference: "slack" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await upsertMyExpertProfile({
        domains: form.domains.split(",").map((s) => s.trim()).filter(Boolean),
        systems: form.systems.split(",").map((s) => s.trim()).filter(Boolean),
        skills: form.skills.split(",").map((s) => s.trim()).filter(Boolean),
        availability: form.availability,
        contact_preference: form.contact_preference,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onSave?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-5 rounded-lg border border-border bg-surface">
      <h3 className="text-sm font-semibold text-foreground mb-4">Register as an Expert</h3>
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-secondary mb-1">Banking Domains (comma-separated)</label>
          <input
            value={form.domains}
            onChange={(e) => setForm({ ...form, domains: e.target.value })}
            placeholder="e.g. payments, compliance, core-banking"
            className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder-secondary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div>
          <label className="block text-xs text-secondary mb-1">Systems (comma-separated)</label>
          <input
            value={form.systems}
            onChange={(e) => setForm({ ...form, systems: e.target.value })}
            placeholder="e.g. SWIFT gateway, Core Banking System"
            className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder-secondary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div>
          <label className="block text-xs text-secondary mb-1">Skills (comma-separated)</label>
          <input
            value={form.skills}
            onChange={(e) => setForm({ ...form, skills: e.target.value })}
            placeholder="e.g. ISO 20022, KYC processes, API design"
            className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder-secondary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs text-secondary mb-1">Availability</label>
            <select
              value={form.availability}
              onChange={(e) => setForm({ ...form, availability: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="available">Available</option>
              <option value="busy">Busy</option>
              <option value="away">Away</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-xs text-secondary mb-1">Contact via</label>
            <select
              value={form.contact_preference}
              onChange={(e) => setForm({ ...form, contact_preference: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="slack">Slack</option>
              <option value="email">Email</option>
              <option value="teams">Teams</option>
            </select>
          </div>
        </div>
      </div>
      <button
        type="submit"
        disabled={saving}
        className="mt-4 w-full py-2 text-sm font-medium rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
      >
        {saved ? <><CheckCircle2 size={15} className="text-white" /> Saved!</> : saving ? <Loader2 size={15} className="portal-animate-spin" /> : "Save Profile"}
      </button>
    </form>
  );
}

export default function ExpertDirectory() {
  const { user } = useAuth();
  const [experts, setExperts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [domain, setDomain] = useState("");
  const [showForm, setShowForm] = useState(false);

  const fetchExperts = () => {
    setLoading(true);
    listExperts(domain || null)
      .then((res) => setExperts(res.items || []))
      .catch(() => setExperts([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchExperts(); }, [domain]);

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Expert Directory</h1>
          <p className="text-secondary text-sm mt-0.5">SMEs by domain and skill</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 text-xs font-medium rounded-lg border border-border text-foreground hover:bg-surface-hover transition-colors"
        >
          {showForm ? "Hide form" : "Register as Expert"}
        </button>
      </div>

      {showForm && (
        <div className="mb-6">
          <MyProfileForm onSave={() => { setShowForm(false); fetchExperts(); }} />
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-2 flex-wrap mb-6">
        {DOMAINS_OPTS.map((d) => (
          <button
            key={d}
            onClick={() => setDomain(d)}
            className={`px-3 py-1.5 text-xs rounded-full border transition-colors
              ${domain === d
                ? "bg-primary text-white border-primary"
                : "border-border text-secondary hover:text-foreground hover:border-primary/40"
              }`}
          >
            {d || "All Domains"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={22} className="portal-animate-spin text-secondary" />
        </div>
      ) : experts.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <Users size={32} className="text-secondary mb-3" />
          <p className="text-sm font-medium text-foreground">No experts registered yet</p>
          <p className="text-xs text-secondary mt-1">Be the first to register your expertise above.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {experts.map((e) => <ExpertCard key={e.id} expert={e} />)}
        </div>
      )}
    </div>
  );
}
