import React from "react";
import { Download, X } from "lucide-react";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";

export default function InstallBanner() {
  const { canShowAndroidPrompt, canShowIosHint, promptInstall, dismiss } = useInstallPrompt();

  if (!canShowAndroidPrompt && !canShowIosHint) return null;

  return (
    <div className="flex items-center gap-3 text-xs bg-primary/10 border border-primary/30 rounded-lg px-3 py-2 mb-4">
      <Download className="w-4 h-4 text-primary shrink-0" />
      <p className="flex-1 text-foreground">
        {canShowAndroidPrompt
          ? "Install this dashboard as an app for quicker, full-screen access."
          : 'Add this dashboard to your Home Screen: tap Share, choose "Add to Home Screen," then tap Add to confirm.'}
      </p>
      {canShowAndroidPrompt && (
        <button
          type="button"
          onClick={promptInstall}
          className="shrink-0 px-2.5 py-1 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity"
        >
          Install
        </button>
      )}
      <button type="button" onClick={dismiss} aria-label="Dismiss" className="shrink-0 text-muted-foreground hover:text-foreground">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
