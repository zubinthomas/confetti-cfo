import React, { useEffect, useMemo, useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import {
  diffState, isEmptyLayout, stateFromLayers, type EditorState, type LabelledLayer,
} from "@/lib/layout/editor";
import { editorContext } from "@/lib/layout/editorContext";
import type { CanFn, LayoutConfig } from "@/lib/layout/types";
import NavEditor from "./NavEditor";
import TabsEditor from "./TabsEditor";
import WidgetsEditor from "./WidgetsEditor";

export type EditorSection = "nav" | "tabs" | "widgets";

const SECTIONS: { id: EditorSection; label: string }[] = [
  { id: "nav", label: "Navigation" },
  { id: "tabs", label: "Page tabs" },
  { id: "widgets", label: "Overview widgets" },
];

export interface LayoutPreset { label: string; config: LayoutConfig }

/** Edits one layout layer. The layers beneath it (`below`, lowest first) are
 *  the starting point, and only what differs from them is saved, so anything
 *  left alone keeps following those layers. `can` decides which items exist
 *  to edit at all: items the viewer can't open are never listed. */
export default function LayoutEditor({
  can, hasEmployee, below, current, currentLabel, onSave, onClear, clearLabel, clearHint,
  presets = [], initialSection = "nav", saveLabel = "Save layout",
}: {
  can: CanFn;
  hasEmployee: boolean;
  below: LabelledLayer[];
  /** The layer being edited, as saved now (null = none saved). */
  current: LayoutConfig | null;
  /** How the layer's own settings are labelled in badges ("You", "This role"). */
  currentLabel: string;
  onSave: (config: LayoutConfig) => Promise<void>;
  onClear: () => Promise<void>;
  clearLabel: string;
  clearHint?: string;
  presets?: LayoutPreset[];
  initialSection?: EditorSection;
  saveLabel?: string;
}) {
  const ctx = useMemo(() => editorContext(can, hasEmployee), [can, hasEmployee]);
  const belowConfigs = useMemo(() => below.map((l) => l.config), [below]);
  const baseline = useMemo(() => stateFromLayers(ctx, belowConfigs), [ctx, belowConfigs]);
  const saved = useMemo(() => stateFromLayers(ctx, [...belowConfigs, current]), [ctx, belowConfigs, current]);
  const badgeLayers = useMemo<LabelledLayer[]>(
    () => (current ? [...below, { label: currentLabel, config: current }] : below),
    [below, current, currentLabel],
  );

  const [state, setState] = useState<EditorState>(saved);
  // Follow the saved layout when it changes underneath (a save, a clear, or a
  // different target), without remounting so the status message survives.
  const savedKey = JSON.stringify(saved);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setState(saved); }, [savedKey]);
  const [section, setSection] = useState<EditorSection>(initialSection);
  const [busy, setBusy] = useState<"save" | "clear" | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const draft = useMemo(() => diffState(ctx, baseline, state), [ctx, baseline, state]);
  const savedDraft = useMemo(() => diffState(ctx, baseline, saved), [ctx, baseline, saved]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(savedDraft);

  const run = async (kind: "save" | "clear", action: () => Promise<void>, done: string) => {
    setBusy(kind);
    setMessage(null);
    try {
      await action();
      setMessage({ kind: "ok", text: done });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  };

  // Saving a layout that matches the layers below clears it instead of
  // storing an empty one.
  const save = () => run("save", () => (isEmptyLayout(draft) ? onClear() : onSave(draft)), "Saved.");
  const clear = () => run("clear", async () => { await onClear(); setState(baseline); }, "Cleared.");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1.5 flex-wrap">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s.id)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                section === s.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => { setState(stateFromLayers(ctx, [...belowConfigs, p.config])); setMessage(null); }}
              className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted"
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            onClick={clear}
            disabled={busy !== null || (!current && !dirty)}
            title={clearHint}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-40"
          >
            {busy === "clear" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
            {clearLabel}
          </button>
          <button
            type="button"
            onClick={() => { setState(saved); setMessage(null); }}
            disabled={!dirty || busy !== null}
            className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-40"
          >
            Discard changes
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!dirty || busy !== null}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40"
          >
            {busy === "save" && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {saveLabel}
          </button>
        </div>
      </div>

      {message && (
        <p className={`text-xs ${message.kind === "error" ? "text-destructive" : "text-emerald-600"}`} role="status">{message.text}</p>
      )}
      {dirty && !message && <p className="text-xs text-muted-foreground">You have unsaved changes.</p>}

      {section === "nav" && <NavEditor state={state} onChange={setState} layers={badgeLayers} />}
      {section === "tabs" && <TabsEditor state={state} onChange={setState} layers={badgeLayers} />}
      {section === "widgets" && <WidgetsEditor state={state} onChange={setState} layers={badgeLayers} />}
    </div>
  );
}
