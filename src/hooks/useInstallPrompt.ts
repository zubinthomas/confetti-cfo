import { useEffect, useState } from "react";

// Not in lib.dom.ts - Chrome/Edge/Android fire this before showing their own
// install UI; capturing it lets us show our own prompt instead.
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "pwa-install-dismissed";

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

// Safari never fires beforeinstallprompt - it has no install API at all, so
// iOS gets instructional text (Share -> Add to Home Screen) instead of a button.
function isIOS() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === "1");

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const standalone = isStandalone();

  const promptInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  };

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
  };

  return {
    canShowAndroidPrompt: !!deferredPrompt && !standalone && !dismissed,
    canShowIosHint: isIOS() && !standalone && !dismissed && !deferredPrompt,
    promptInstall,
    dismiss,
  };
}
