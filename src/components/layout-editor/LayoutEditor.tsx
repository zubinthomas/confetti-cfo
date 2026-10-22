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
  presets = [], initialSection = "nav", saveLabel = "Save layout", readOnly = false, extraDirty = false, onDiscard,
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
  /** Show the layout without letting it be changed. */
  readOnly?: boolean;
  /** Something saved with the layout but edited outside this component (a
   *  permission's priority) changed, so Save is allowed with no layout edits. */
  extraDirty?: boolean;
  /** Called on Discard, so state held outside the editor can be reset too. */
  onDiscard?: () => void;
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
  const layoutDirty = JSON.stringify(draft) !== JSON.stringify(savedDraft);
  const dirty = layoutDirty || extraDirty;

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
  // storing an empty one, unless something else saved with it (the priority)
  // changed, in which case the empty layout still has to be stored.
  const save = () => run("save", () => (isEmptyLayout(draft) && !extraDirty ? onClear() : onSave(draft)), "Saved.");
  const clear = () => run("clear", async () => { await onClear(); setState(baseline); }, "Cleared.");

  const discard = () => { setState(saved); onDiscard?.(); setMessage(null); };

  const BTN = "whitespace-nowrap inline-flex items-center justify-center gap-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-40 text-sm max-sm:min-h-11 max-sm:px-4 sm:text-xs sm:px-3 sm:py-1.5";

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 flex-wrap">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSection(s.id)}
            className={`px-3 rounded-lg text-sm transition-colors max-sm:min-h-11 sm:py-1.5 ${
              section === s.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {!readOnly && (
        <div className="flex items-center gap-2 flex-wrap">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => { setState(stateFromLayers(ctx, [...belowConfigs, p.config])); setMessage(null); }}
              className={BTN}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            onClick={clear}
            disabled={busy !== null || (!current && !dirty)}
            title={clearHint}
            className={BTN}
          >
            {busy === "clear" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
            {clearLabel}
          </button>
        </div>
      )}

      {message && (
        <p className={`text-xs ${message.kind === "error" ? "text-destructive" : "text-emerald-600"}`} role="status">{message.text}</p>
      )}

      {/* A read-only layout is shown but can't be touched. */}
      <div {...(readOnly ? { inert: "" as unknown as boolean } : {})} className={readOnly ? "opacity-70" : undefined}>
        {section === "nav" && <NavEditor state={state} onChange={setState} layers={badgeLayers} />}
        {section === "tabs" && <TabsEditor state={state} onChange={setState} layers={badgeLayers} />}
        {section === "widgets" && <WidgetsEditor state={state} onChange={setState} layers={badgeLayers} />}
      </div>

      {/* Pinned to the bottom of the screen on phones so Save stays in reach
          however far down the list is scrolled. */}
      {!readOnly && (
        <div
          className="max-sm:sticky max-sm:bottom-0 max-sm:-mx-4 max-sm:pl-4 max-sm:pr-20 max-sm:pt-3 max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom))] max-sm:bg-card/95 max-sm:backdrop-blur max-sm:border-t max-sm:border-border max-sm:z-20 flex items-center gap-2 sm:justify-end"
        >
          {dirty && <span className="text-xs text-muted-foreground mr-auto">Unsaved changes</span>}
          <button type="button" onClick={discard} disabled={!dirty || busy !== null} className={BTN}>
            <span className="sm:hidden">Discard</span><span className="max-sm:hidden">Discard changes</span>
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!dirty || busy !== null}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 text-sm max-sm:min-h-11 max-sm:px-4 sm:text-xs sm:px-3 sm:py-1.5"
          >
            {busy === "save" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span className="sm:hidden">Save</span><span className="max-sm:hidden">{saveLabel}</span>
          </button>
        </div>
      )}
    </div>
  );
}
