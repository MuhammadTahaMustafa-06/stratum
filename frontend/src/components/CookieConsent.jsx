import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Cookie } from "lucide-react";

const STORAGE_KEY = "stratum-cookie-consent";

export default function CookieConsent() {
  const [visible, setVisible] = useState(() => {
    try {
      return !localStorage.getItem(STORAGE_KEY);
    } catch {
      return false;
    }
  });

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch { /* storage unavailable */ }
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          role="region"
          aria-label="Cookie consent"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="fixed inset-x-2 z-50 mx-auto max-w-xl sm:inset-x-4"
          style={{ bottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <div className="flex flex-col items-stretch gap-3 px-3.5 py-3 rounded-xl border border-border bg-surface shadow-lg shadow-black/10 sm:flex-row sm:items-center sm:px-4">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Cookie size={14} className="text-primary" aria-hidden="true" />
              </div>
              <p className="flex-1 text-xs text-secondary leading-relaxed">
                This platform uses functional cookies for authentication. By continuing to use the platform, you consent to their use.
              </p>
            </div>
            <button
              onClick={dismiss}
              className="w-full flex-shrink-0 px-3.5 py-2 text-xs font-semibold rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors sm:w-auto sm:py-1.5"
            >
              Got it
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
