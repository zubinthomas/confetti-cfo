import React, { useEffect, useState } from "react";
import DashCard from "./DashCard";
import { listSettings, type Setting, type SettingCategory } from "@/api/settingsApi";
import { Loader2, Lock } from "lucide-react";

const CATEGORY_LABELS: Record<SettingCategory, string> = {
  server: "Server",
  security: "Security",
  llm: "LLM (AI Queries)",
  google_oauth: "Google OAuth",
  google_sheets: "Google Sheets sync",
  email: "Email (OTP / password reset)",
};

const CATEGORY_ORDER: SettingCategory[] = [
  "server", "security", "llm", "google_oauth", "google_sheets", "email",
];

function ValueCell({ setting }: { setting: Setting }) {
  if (setting.value === null || setting.value === "") {
    return <span className="text-xs text-muted-foreground italic">Not set</span>;
  }
  if (setting.isSecret) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-mono text-foreground">
        <Lock className="w-3 h-3 text-muted-foreground shrink-0" /> {setting.value}
      </span>
    );
  }
  return <span className="text-xs font-mono text-foreground break-all">{setting.value}</span>;
}

function CategoryTable({ settings }: { settings: Setting[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-muted-foreground border-b border-border text-xs">
          <th className="py-1.5 pr-3 font-medium w-[220px]">Setting</th>
          <th className="py-1.5 pr-3 font-medium">Value</th>
          <th className="py-1.5 font-medium hidden md:table-cell">Description</th>
        </tr>
      </thead>
      <tbody>
        {settings.map((s) => (
          <tr key={s.key} className="border-b border-border last:border-0 align-top">
            <td className="py-2 pr-3">
              <div className="text-sm text-foreground font-medium">{s.label}</div>
              <div className="text-[11px] text-muted-foreground font-mono">{s.key}</div>
            </td>
            <td className="py-2 pr-3"><ValueCell setting={s} /></td>
            <td className="py-2 hidden md:table-cell text-xs text-muted-foreground">
              {s.description || "-"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Setting[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    listSettings()
      .then(setSettings)
      .catch((err: Error) => setError(err.message || "Failed to load settings"));
  }, []);

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  if (!settings) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading settings…
      </div>
    );
  }

  const byCategory = new Map<SettingCategory, Setting[]>();
  for (const s of settings) {
    if (!byCategory.has(s.category)) byCategory.set(s.category, []);
    byCategory.get(s.category)!.push(s);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
        These mirror <code className="font-mono">server/.env</code> and are read-only for now - edit
        the file directly and restart the server to change them. Secret values are masked.
      </div>
      {CATEGORY_ORDER.filter((c) => byCategory.has(c)).map((category) => (
        <DashCard
          key={category}
          title={
            <div className="flex items-center gap-2">
              {CATEGORY_LABELS[category]}
              <span className="px-1.5 py-0.5 rounded text-[10px] font-normal text-muted-foreground border border-border">
                {byCategory.get(category)!.length}
              </span>
            </div>
          }
        >
          <CategoryTable settings={byCategory.get(category)!} />
        </DashCard>
      ))}
    </div>
  );
}
