import { useEffect, useState, useSyncExternalStore } from "react";
import { useLocation } from "react-router-dom";
import { Toaster } from "sonner";

function subscribeDark(callback) {
  const el = document.documentElement;
  const mo = new MutationObserver(callback);
  mo.observe(el, { attributes: true, attributeFilter: ["class"] });
  return () => mo.disconnect();
}

function snapshotDark() {
  return document.documentElement.classList.contains("dark");
}

function snapshotDarkServer() {
  return false;
}

/**
 * Global toast host — theme tracks `document.documentElement` `.dark` (portal toggle).
 */
export default function PortalToaster() {
  const dark = useSyncExternalStore(subscribeDark, snapshotDark, snapshotDarkServer);
  const location = useLocation();
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 640px)").matches : false
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const handleChange = () => setIsMobile(mq.matches);
    handleChange();
    mq.addEventListener("change", handleChange);
    return () => mq.removeEventListener("change", handleChange);
  }, []);

  const isAuthSurface = [
    "/login",
    "/signup",
    "/auth/callback",
    "/forgot-password",
    "/reset-password",
    "/mfa",
  ].some((path) => location.pathname.startsWith(path));

  return (
    <Toaster
      theme={dark ? "dark" : "light"}
      position={isMobile && !isAuthSurface ? "bottom-center" : isMobile ? "top-center" : "top-right"}
      richColors
      closeButton
      visibleToasts={5}
      gap={12}
      toastOptions={{
        duration: 4400,
        classNames: {
          toast:
            "font-sans rounded-xl border shadow-lg backdrop-blur-md bg-surface/95 dark:bg-surface/95 max-w-[calc(100vw-1rem)] sm:max-w-md",
          title: "font-semibold text-foreground",
          description: "text-sm text-secondary",
          closeButton: "bg-background border-border",
        },
      }}
    />
  );
}
