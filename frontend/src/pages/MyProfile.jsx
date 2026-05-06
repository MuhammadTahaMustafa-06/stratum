import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera, Mail, Save, ShieldCheck, User2, Building2, Users2,
  Loader2,
} from "lucide-react";
import { updateMe, uploadMyAvatar } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { ROLE_LABELS } from "../lib/roles";
import { notifyApiError, notifySuccess } from "../lib/notify";
import { InlineSpinner } from "../components/ui/Skeleton";

// ── helpers ────────────────────────────────────────────────────────────────────

function initials(name) {
  return (name || "?")
    .split(" ")
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Same-origin /uploads so Vite/nginx proxy + CSP img-src 'self' work; keep other https URLs as-is. */
function avatarUrlForImgSrc(raw) {
  const s = (raw || "").trim();
  if (!s) return "";
  if (s.startsWith("http://") || s.startsWith("https://")) {
    try {
      const u = new URL(s);
      if (u.pathname.startsWith("/uploads/")) {
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        return `${origin}${u.pathname}${u.search}`;
      }
    } catch {
      return s;
    }
    return s;
  }
  if (s.startsWith("/uploads/") || s.startsWith("uploads/")) {
    const normalized = s.startsWith("/") ? s : `/${s}`;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}${normalized}`;
  }
  return s;
}

function avatarUrlForApiPayload(raw) {
  const s = (raw || "").trim();
  if (!s) return null;
  if (s.startsWith("http://") || s.startsWith("https://")) {
    try {
      const u = new URL(s);
      if (u.pathname.startsWith("/uploads/")) return u.pathname.slice(0, 512);
    } catch { /* fall through */ }
  }
  return s;
}

// Role badge colours
const ROLE_BADGE = {
  system_admin:    "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800",
  knowledge_admin: "bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-800",
  domain_expert:   "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
  employee:        "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/60 dark:text-slate-400 dark:border-slate-700",
};

// ── main component ─────────────────────────────────────────────────────────────

export default function MyProfile() {
  const { user, setUser } = useAuth();
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [avatarLoaded, setAvatarLoaded] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const [form, setForm] = useState({
    full_name: "",
    team: "",
    department: "",
    avatar_url: "",
    bio: "",
  });

  // Sync form with user (original useEffect pattern — works like original file)
  useEffect(() => {
    if (!user) return;
    
    // Only update form if we aren't currently saving (avoid losing unsaved local changes during background updates)
    // and only reset avatar states if the URL actually changed.
    setForm(prev => {
      const newUrl = user.avatar_url || "";
      if (prev.avatar_url !== newUrl) {
        setAvatarLoadFailed(false);
        setAvatarLoaded(false);
      }
      return {
        full_name: user.full_name || "",
        team: user.team || "",
        department: user.department || "",
        avatar_url: newUrl,
        bio: user.bio || "",
      };
    });
  }, [user]);

  const roleLabel = useMemo(() => ROLE_LABELS[user?.role] || user?.role || "Not set", [user]);
  const roleBadgeCls = ROLE_BADGE[user?.role] || ROLE_BADGE.employee;
  const previewName = form.full_name || user?.full_name || "";
  const avatarSrc = useMemo(() => avatarUrlForImgSrc(form.avatar_url), [form.avatar_url]);

  if (!user) return null;

  const onChange = (key, value) => {
    setForm((prev) => {
      if (key === "avatar_url" && prev.avatar_url !== value) {
        setAvatarLoadFailed(false);
        setAvatarLoaded(false);
      }
      return { ...prev, [key]: value };
    });
  };

  const onSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        full_name: form.full_name,
        team: form.team || null,
        department: form.department || null,
        avatar_url: avatarUrlForApiPayload(form.avatar_url),
        bio: form.bio || null,
      };
      const updated = await updateMe(payload);
      setUser(updated);
      notifySuccess("Profile saved.");
    } catch (err) {
      notifyApiError(err, "Could not update profile.");
    } finally {
      setSaving(false);
    }
  };

  const processAvatarFile = async (file) => {
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const updated = await uploadMyAvatar(file);
      // Update context and let useEffect sync the form state.
      setUser(updated);
      notifySuccess("Photo updated.");
    } catch (err) {
      notifyApiError(err, "Avatar upload failed.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
      setUploadingAvatar(false);
    }
  };

  const onPickAvatar = (e) => processAvatarFile(e.target.files?.[0]);

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    processAvatarFile(e.dataTransfer.files?.[0]);
  };

  // ── render ──────────────────────────────────────────────────────────────────

  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10 page-enter">
      {/* Page header */}
      <header className="mb-8 sm:mb-10">
        <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-primary">
          Account settings
        </p>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold text-foreground mt-2 sm:mt-2.5">
          My profile
        </h1>
        <p className="text-base text-secondary mt-3 max-w-xl leading-relaxed">
          Manage how you appear to colleagues—photo, team, and a short bio—in one place.
        </p>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* ── Left: Avatar card ── */}
        <aside className="xl:col-span-1 space-y-4">
          <div className="app-card p-6 sm:p-7">
            <div className="flex flex-col items-center text-center">

              {/* Avatar upload zone */}
              <div
                className={`relative cursor-pointer group transition-all duration-300 ${dragOver ? "scale-105" : ""}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => !uploadingAvatar && fileInputRef.current?.click()}
                title="Click or drag & drop to change photo"
              >
                {/* Glow ring on hover/drag */}
                <div
                  className={`absolute -inset-1.5 rounded-[28px] transition-all duration-500 ${
                    dragOver
                      ? "bg-gradient-to-br from-primary via-accent to-primary opacity-70 animate-pulse"
                      : "bg-gradient-to-br from-primary/20 to-accent/20 opacity-0 group-hover:opacity-100"
                  }`}
                />

                {/* Avatar circle */}
                <div className="relative w-28 h-28 rounded-3xl bg-gradient-to-br from-primary/[0.12] to-accent/[0.08] flex items-center justify-center text-3xl font-display font-semibold text-primary ring-4 ring-surface shadow-lg overflow-hidden">
                  {/* Initials fallback (hidden when image successfully loads) */}
                  <span className={`transition-opacity duration-300 ${(avatarSrc && avatarLoaded && !avatarLoadFailed) ? "opacity-0" : "opacity-100"}`}>
                    {initials(previewName)}
                  </span>

                  {avatarSrc && !avatarLoadFailed && (
                    <img
                      key={avatarSrc}
                      src={avatarSrc}
                      alt="Profile avatar"
                      className={`absolute inset-0 w-28 h-28 rounded-3xl object-cover transition-opacity duration-300 ${avatarLoaded ? "opacity-100" : "opacity-0"}`}
                      onLoad={() => setAvatarLoaded(true)}
                      onError={() => {
                        setAvatarLoaded(false);
                        setAvatarLoadFailed(true);
                      }}
                    />
                  )}

                  {/* Hover / uploading overlay */}
                  <div className={`absolute inset-0 rounded-3xl bg-black/50 flex flex-col items-center justify-center gap-1 transition-opacity duration-200 ${
                    uploadingAvatar ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                  }`}>
                    {uploadingAvatar
                      ? <Loader2 size={22} className="text-white portal-animate-spin" />
                      : <>
                          <Camera size={18} className="text-white" />
                          <span className="text-white text-[10px] font-semibold">
                            {dragOver ? "Drop it!" : "Change"}
                          </span>
                        </>
                    }
                  </div>
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                className="hidden"
                onChange={onPickAvatar}
              />

              {/* Identity */}
              <div className="mt-6 space-y-1.5 w-full">
                <p className="text-lg sm:text-xl font-display font-semibold text-foreground leading-snug tracking-tight">
                  {previewName || "Unnamed user"}
                </p>
                <p className="text-sm text-secondary flex items-center justify-center gap-1.5 leading-normal">
                  <Mail size={13} className="opacity-80 shrink-0" aria-hidden /> {user.email}
                </p>
                <div className="flex items-center justify-center mt-2">
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold tracking-tight ${roleBadgeCls}`}>
                    <ShieldCheck size={12} className="opacity-90" aria-hidden /> {roleLabel}
                  </span>
                </div>
              </div>

              {/* Upload CTA */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="mt-5 w-full inline-flex items-center justify-center gap-2 px-3 py-3 rounded-xl bg-primary text-white text-sm font-semibold
                  hover:opacity-92 active:scale-[0.98] disabled:opacity-60 transition-all shadow-md shadow-primary/20"
              >
                <Camera size={14} />
                {uploadingAvatar ? "Uploading…" : "Change Photo"}
              </button>
              <p className="mt-3 text-xs text-secondary/75 leading-normal">PNG, JPG, WebP or GIF · up to 2 MB</p>
              <p className="mt-1 text-xs text-secondary/55">Or drag and drop onto your photo</p>
            </div>
          </div>

          {/* Quick info summary */}
          <div className="app-card p-5 space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-cap text-secondary/80">At a glance</p>
            {[
              { Icon: Users2, label: "Team", val: form.team },
              { Icon: Building2, label: "Department", val: form.department },
            ].map(({ Icon, label, val }) => (
              <div key={label} className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-primary/8 flex items-center justify-center flex-shrink-0">
                  <Icon size={13} className="text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-medium text-secondary/80 uppercase tracking-cap">{label}</p>
                  <p className="text-sm text-foreground font-medium truncate leading-snug">{val || "—"}</p>
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* ── Right: Profile form ── */}
        <form onSubmit={onSave} className="xl:col-span-2 space-y-5">
          <div className="app-card p-6 sm:p-8">
            <div className="mb-6 sm:mb-7">
              <h2 className="font-display text-xl font-semibold text-foreground tracking-tight">Profile information</h2>
              <p className="text-sm text-secondary mt-1.5 leading-relaxed max-w-lg">
                Shown on directory-style views and alongside your activity in the portal.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Full Name */}
              <label className="space-y-1.5">
                <span className="text-[11px] font-semibold text-secondary/90 uppercase tracking-cap">Full name</span>
                <div className="relative">
                  <User2 size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-secondary pointer-events-none" />
                  <input
                    className="w-full pl-10 pr-3.5 py-3 rounded-xl border border-border bg-background text-foreground text-[15px] leading-snug
                      placeholder:text-secondary/45 focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/80 transition-[box-shadow,border-color] duration-200"
                    value={form.full_name}
                    onChange={(e) => onChange("full_name", e.target.value)}
                    placeholder="Your full name"
                    required
                  />
                </div>
              </label>

              {/* Email (read-only) */}
              <label className="space-y-1.5">
                <span className="text-[11px] font-semibold text-secondary/90 uppercase tracking-cap">Email</span>
                <div className="relative">
                  <Mail size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-secondary pointer-events-none" />
                  <input
                    className="w-full pl-10 pr-3.5 py-3 rounded-xl border border-border bg-muted/80 text-secondary text-[15px] leading-snug cursor-not-allowed"
                    value={user.email}
                    disabled
                    readOnly
                    title="Email cannot be changed"
                  />
                </div>
              </label>

              {/* Team */}
              <label className="space-y-1.5">
                <span className="text-[11px] font-semibold text-secondary/90 uppercase tracking-cap">Team</span>
                <div className="relative">
                  <Users2 size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-secondary pointer-events-none" />
                  <input
                    className="w-full pl-10 pr-3.5 py-3 rounded-xl border border-border bg-background text-foreground text-[15px] leading-snug
                      placeholder:text-secondary/45 focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/80 transition-[box-shadow,border-color] duration-200"
                    value={form.team}
                    onChange={(e) => onChange("team", e.target.value)}
                    placeholder="e.g. Platform"
                  />
                </div>
              </label>

              {/* Department */}
              <label className="space-y-1.5">
                <span className="text-[11px] font-semibold text-secondary/90 uppercase tracking-cap">Department</span>
                <div className="relative">
                  <Building2 size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-secondary pointer-events-none" />
                  <input
                    className="w-full pl-10 pr-3.5 py-3 rounded-xl border border-border bg-background text-foreground text-[15px] leading-snug
                      placeholder:text-secondary/45 focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/80 transition-[box-shadow,border-color] duration-200"
                    value={form.department}
                    onChange={(e) => onChange("department", e.target.value)}
                    placeholder="e.g. Engineering"
                  />
                </div>
              </label>
            </div>

            {/* Bio */}
            <div className="mt-4 space-y-1.5">
              <span className="text-[11px] font-semibold text-secondary/90 uppercase tracking-cap">Professional bio</span>
              <textarea
                className="w-full px-3.5 py-3 rounded-xl border border-border bg-background text-foreground text-[15px] leading-relaxed
                  placeholder:text-secondary/45 min-h-[7.5rem] resize-y focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/80 transition-[box-shadow,border-color] duration-200"
                value={form.bio}
                onChange={(e) => onChange("bio", e.target.value)}
                placeholder="Write a short professional introduction about yourself…"
              />
              <p className="text-xs text-secondary/60 tabular-nums">{form.bio.length} / 1000 characters</p>
            </div>
          </div>

          {/* Save button row */}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-white text-sm font-semibold
                hover:opacity-92 active:scale-[0.98] disabled:opacity-60 transition-all shadow-md shadow-primary/20"
            >
              {saving ? <InlineSpinner size={15} className="text-white" /> : <Save size={14} />}
              {saving ? "Saving…" : "Save Changes"}
            </button>
            {uploadingAvatar && (
              <span className="text-xs text-secondary flex items-center gap-1.5">
                <Loader2 size={11} className="portal-animate-spin" /> Uploading avatar…
              </span>
            )}
          </div>
        </form>
      </div>
    </section>
  );
}
