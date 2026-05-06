import { useSyncExternalStore } from "react";
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

  return (
    <Toaster
      theme={dark ? "dark" : "light"}
      position="top-right"
      richColors
      closeButton
      visibleToasts={5}
      gap={12}
      toastOptions={{
        duration: 4400,
        classNames: {
          toast:
            "font-sans rounded-xl border shadow-lg backdrop-blur-md bg-surface/95 dark:bg-surface/95",
          title: "font-semibold text-foreground",
          description: "text-sm text-secondary",
          closeButton: "bg-background border-border",
        },
      }}
    />
  );
}
