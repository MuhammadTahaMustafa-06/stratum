import { useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2, Lock, ShieldAlert, Fingerprint, QrCode, KeyRound,
  Camera, Mail, Save, ShieldCheck, User2, Building2, Users2,
  Copy, Check,
} from "lucide-react";
import { updateMe, uploadMyAvatar, setupMFA, confirmMFA, disableMFA } from "../api/client";
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

  // MFA states
  const [mfaBusy, setMfaBusy] = useState(false);
  const [mfaSetup, setMfaSetup] = useState(null); // { secret, otpauth_url, qr_code_png_b64 }
  const [mfaCode, setMfaCode] = useState("");
  const [mfaBackupCodes, setMfaBackupCodes] = useState([]);
  const [backupCodesCopied, setBackupCodesCopied] = useState(false);
  const [showDisableMfa, setShowDisableMfa] = useState(false);
  const [disablePw, setDisablePw] = useState("");
  const [disableMfaCode, setDisableMfaCode] = useState("");

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
  const mfaQrCodeB64 = mfaSetup?.qr_code_png_b64 || mfaSetup?.qr_code_base64 || "";

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

  const handleSetupMfa = async () => {
    setMfaBusy(true);
    try {
      const res = await setupMFA();
      setMfaSetup(res);
      setMfaBackupCodes([]);
      setBackupCodesCopied(false);
    } catch (err) {
      notifyApiError(err, "Could not initialize MFA setup.");
    } finally {
      setMfaBusy(false);
    }
  };

  const handleConfirmMfa = async () => {
    if (!mfaCode.trim()) return;
    setMfaBusy(true);
    try {
      await confirmMFA(mfaCode);
      setUser((prev) => prev ? { ...prev, mfa_enabled: true } : prev);
      setMfaBackupCodes(Array.isArray(mfaSetup?.backup_codes) ? mfaSetup.backup_codes : []);
      setBackupCodesCopied(false);
      setMfaSetup(null);
      setMfaCode("");
      notifySuccess("MFA enabled successfully.");
    } catch (err) {
      notifyApiError(err, "MFA confirmation failed. Check the code.");
    } finally {
      setMfaBusy(false);
    }
  };

  const handleDisableMfa = async () => {
    if (!disablePw.trim() && !disableMfaCode.trim()) return;
    setMfaBusy(true);
    try {
      await disableMFA({ password: disablePw, code: disableMfaCode });
      setUser((prev) => prev ? { ...prev, mfa_enabled: false } : prev);
      setMfaBackupCodes([]);
      setBackupCodesCopied(false);
      setShowDisableMfa(false);
      setDisablePw("");
      setDisableMfaCode("");
      notifySuccess("MFA disabled.");
    } catch (err) {
      notifyApiError(err, "Could not disable MFA. Use your Stratum password, or your 6-digit authenticator / backup code (Google sign-in uses the code, not your Google password).");
    } finally {
      setMfaBusy(false);
    }
  };

  const copyBackupCodes = async () => {
    if (!mfaBackupCodes.length) return;
    try {
      await navigator.clipboard.writeText(mfaBackupCodes.join("\n"));
      setBackupCodesCopied(true);
      notifySuccess("Backup codes copied.");
      setTimeout(() => setBackupCodesCopied(false), 2000);
    } catch {
      notifySuccess("Select and copy your backup codes before leaving this page.");
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
                <p className="text-sm text-secondary flex items-center justify-center gap-1.5 leading-normal break-all">
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
          <div className="app-card overflow-hidden p-5 sm:p-8">
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

          {/* ── Security / MFA ── */}
          <div className="app-card p-6 sm:p-8">
            <div className="mb-6">
              <h2 className="font-display text-xl font-semibold text-foreground tracking-tight flex items-center gap-2">
                <Lock size={20} className="text-primary" />
                Security & MFA
              </h2>
              <p className="text-sm text-secondary mt-1.5 leading-relaxed max-w-lg">
                Add an extra layer of security to your account using a Time-based One-Time Password (TOTP) app.
              </p>
            </div>

            {user.mfa_enabled ? (
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 rounded-xl border border-green-200 bg-green-50 dark:border-green-900/40 dark:bg-green-950/20">
                  <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center text-green-600 dark:text-green-400 shrink-0">
                    <ShieldCheck size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-green-800 dark:text-green-300">MFA is active</p>
                    <p className="text-xs text-green-700/80 dark:text-green-400/70">Your account is protected by two-factor authentication.</p>
                  </div>
                </div>

                {mfaBackupCodes.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-bold text-amber-900 dark:text-amber-200">Save your backup codes</p>
                        <p className="mt-1 text-xs leading-relaxed text-amber-800/80 dark:text-amber-300/80">
                          These codes are shown once. Store them somewhere safe so you can sign in if you lose authenticator access.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={copyBackupCodes}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-950/70"
                      >
                        {backupCodesCopied ? <Check size={13} /> : <Copy size={13} />}
                        {backupCodesCopied ? "Copied" : "Copy codes"}
                      </button>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {mfaBackupCodes.map((code) => (
                        <code
                          key={code}
                          className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-bold tracking-wider text-amber-950 select-all dark:border-amber-900 dark:bg-slate-950 dark:text-amber-100"
                        >
                          {code}
                        </code>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => setMfaBackupCodes([])}
                      className="mt-3 text-xs font-semibold text-amber-800 hover:underline dark:text-amber-300"
                    >
                      I have saved these codes
                    </button>
                  </div>
                )}

                {!showDisableMfa ? (
                  <button
                    type="button"
                    onClick={() => setShowDisableMfa(true)}
                    className="text-xs font-semibold text-red-600 hover:text-red-700 hover:underline px-1"
                  >
                    Disable two-factor authentication
                  </button>
                ) : (
                  <div className="p-4 rounded-xl border border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20 space-y-3">
                    <p className="text-xs font-semibold text-red-800 dark:text-red-300">Confirm to disable MFA</p>
                    <p className="text-[11px] text-red-800/90 dark:text-red-300/90 leading-relaxed">
                      If you sign in with email and password, enter that password. If you use Google (or other SSO), leave password blank and enter your current 6-digit authenticator code or a one-time backup code — not your Google password.
                    </p>
                    <input
                      type="password"
                      autoComplete="current-password"
                      placeholder="Stratum password (if you use one)"
                      value={disablePw}
                      onChange={(e) => setDisablePw(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-red-200 bg-background focus:ring-1 focus:ring-red-500"
                    />
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="6-digit app code or backup code"
                      value={disableMfaCode}
                      onChange={(e) => setDisableMfaCode(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-red-200 bg-background focus:ring-1 focus:ring-red-500 font-mono tracking-wider"
                    />
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <button
                        type="button"
                        onClick={handleDisableMfa}
                        disabled={mfaBusy || (!disablePw.trim() && !disableMfaCode.trim())}
                        className="px-4 py-2 bg-red-600 text-white text-xs font-bold rounded-lg hover:bg-red-700 disabled:opacity-50"
                      >
                        {mfaBusy ? <Loader2 size={14} className="portal-animate-spin" /> : "Disable"}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowDisableMfa(false); setDisablePw(""); setDisableMfaCode(""); }}
                        className="px-4 py-2 text-secondary text-xs font-medium hover:text-foreground"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : mfaSetup ? (
              <div className="space-y-5 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="max-w-full p-3 sm:p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-4 overflow-hidden">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                      <QrCode size={20} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-foreground">Set up your authenticator</p>
                      <p className="text-xs text-secondary mt-0.5 leading-relaxed">
                        Scan this QR code in your app (Google Authenticator, Authy, etc.) or enter the secret manually.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col items-center gap-4 py-2">
                    <div className="p-3 bg-white rounded-xl shadow-sm border border-border">
                      {mfaQrCodeB64 ? (
                        <img
                          src={`data:image/png;base64,${mfaQrCodeB64}`}
                          alt="QR code for authenticator app setup"
                          width={160}
                          height={160}
                          className="block h-32 w-32 sm:h-40 sm:w-40"
                        />
                      ) : (
                        <div className="w-28 h-28 sm:w-32 sm:h-32 bg-slate-50 flex items-center justify-center text-center p-2 rounded-lg border border-dashed border-slate-300">
                          <p className="text-[10px] text-slate-400">QR code unavailable. Enter the secret manually.</p>
                        </div>
                      )}
                    </div>
                    
                    <div className="w-full min-w-0 space-y-1.5">
                      <p className="text-[10px] font-bold text-secondary uppercase tracking-cap px-1">Manual Entry Secret</p>
                      <div className="flex min-w-0 items-start gap-2 rounded-lg bg-background border border-border p-2.5 font-mono text-[11px] sm:text-xs text-foreground tracking-wide sm:tracking-wider break-all [overflow-wrap:anywhere] select-all">
                        <KeyRound size={12} className="text-primary opacity-60 shrink-0 mt-0.5" />
                        <span className="min-w-0">{mfaSetup.secret}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-primary/10">
                    <p className="text-xs font-semibold text-foreground">Verify confirmation code</p>
                    <div className="flex flex-col gap-2 lg:flex-row">
                      <input
                        type="text"
                        maxLength={6}
                        placeholder="000000"
                        value={mfaCode}
                        onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
                        className="min-w-0 flex-1 px-3 py-2 text-sm font-mono tracking-widest rounded-lg border border-border bg-background focus:ring-2 focus:ring-primary/30"
                      />
                      <button
                        type="button"
                        onClick={handleConfirmMfa}
                        disabled={mfaBusy || mfaCode.length < 6}
                        className="w-full px-6 py-2 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary/90 shadow-sm shadow-primary/20 disabled:opacity-50 lg:w-auto lg:shrink-0"
                      >
                        {mfaBusy ? <Loader2 size={14} className="portal-animate-spin" /> : "Verify & Enable"}
                      </button>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setMfaSetup(null); setMfaCode(""); }}
                  className="text-xs font-medium text-secondary hover:text-foreground"
                >
                  Cancel setup
                </button>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-center gap-5 p-5 rounded-xl border border-border bg-surface-hover/30">
                <div className="w-14 h-14 rounded-2xl bg-primary/5 flex items-center justify-center text-primary shrink-0">
                  <Fingerprint size={28} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground">Enhance account security</p>
                  <p className="text-xs text-secondary mt-1 leading-relaxed">
                    Protect your account with an extra verification step during sign-in.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSetupMfa}
                  disabled={mfaBusy}
                  className="w-full sm:w-auto px-5 py-2.5 bg-primary text-white text-xs font-bold rounded-xl hover:bg-primary/90 transition-all shadow-sm shadow-primary/20 disabled:opacity-50"
                >
                  {mfaBusy ? <Loader2 size={14} className="portal-animate-spin" /> : "Enable MFA"}
                </button>
              </div>
            )}
          </div>

          {/* Save button row */}
          <div className="flex flex-col gap-3 mt-6 sm:flex-row sm:items-center">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex w-full items-center justify-center gap-2 px-6 py-3 rounded-xl bg-primary text-white text-sm font-semibold
                hover:opacity-92 active:scale-[0.98] disabled:opacity-60 transition-all shadow-md shadow-primary/20 sm:w-auto"
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
