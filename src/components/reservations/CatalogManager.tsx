import React, { useMemo } from "react";
import { ChevronDown, Loader2, Plus } from "lucide-react";
import type { ReservationArea, ReservationLocation, ReservationTable } from "@/api/reservationsApi";
import DashCard from "@/components/dashboard/DashCard";
import { ArchivedBadge, CatalogRowActions, type CatalogKind } from "@/components/reservations/CatalogParts";
import TableTile, { MERGE_BAR } from "@/components/reservations/TableTile";
import { allCollapsed, collapseAreas, expandAreas, mergeSummary, seatsLabel, toggleId } from "@/components/reservations/reservationUi";
import { usePersistedState } from "@/hooks/usePersistedState";

type CatalogView = "grid" | "list";
const isView = (v: unknown): v is CatalogView => v === "grid" || v === "list";
const isIdList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

const PILL = "text-sm px-3 py-1.5 max-sm:min-h-11 rounded-lg";
const ADD_LINK = "text-xs text-primary hover:underline flex items-center gap-1 max-sm:min-h-11";
// Two across on a phone (inner width is about 240px there), wider tiles from sm up.
const GRID = "grid gap-2 grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))]";

/** "12 tables", plus " · 2 archived" when archived ones are in the list. */
function tableCount(tables: { archivedAt: string | null }[]): string {
  const archived = tables.filter((t) => t.archivedAt).length;
  const active = tables.length - archived;
  return `${active} ${active === 1 ? "table" : "tables"}${archived > 0 ? ` · ${archived} archived` : ""}`;
}

interface Props {
  loading: boolean;
  /** What to show, archived rows already included or left out by the caller. */
  locations: ReservationLocation[];
  areas: ReservationArea[];
  tables: ReservationTable[];
  showArchived: boolean;
  onShowArchived: (show: boolean) => void;
  canWrite: boolean;
  canDelete: boolean;
  onAddLocation: () => void;
  onAddArea: (location: ReservationLocation) => void;
  onAddTable: (area: ReservationArea) => void;
  onEditLocation: (location: ReservationLocation) => void;
  onEditArea: (area: ReservationArea, location: ReservationLocation) => void;
  onEditTable: (table: ReservationTable, area: ReservationArea) => void;
  onArchive: (kind: CatalogKind, id: string, name: string) => void;
  onRestore: (kind: CatalogKind, id: string) => void;
  onPurge: (kind: CatalogKind, id: string, name: string) => void;
}

export default function CatalogManager(p: Props) {
  // Collapsed rather than expanded ids, so an area created later starts open.
  const [collapsed, setCollapsed] = usePersistedState<string[]>("restaurant.catalog.collapsed", [], isIdList);
  const [view, setView] = usePersistedState<CatalogView>("restaurant.catalog.view", "grid", isView);

  const areaIds = useMemo(() => p.areas.map((a) => a.id), [p.areas]);
  const everyAreaCollapsed = allCollapsed(areaIds, collapsed);

  const actions = (kind: CatalogKind, id: string, name: string) => ({
    onArchive: () => p.onArchive(kind, id, name),
    onRestore: () => p.onRestore(kind, id),
    onPurge: () => p.onPurge(kind, id, name),
  });

  return (
    <DashCard
      title="Locations & Tables"
      action={(
        <div className="flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-1.5 text-sm text-muted-foreground max-sm:min-h-11">
            <input type="checkbox" checked={p.showArchived} onChange={(e) => p.onShowArchived(e.target.checked)} />
            Show archived
          </label>
          <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5" role="group" aria-label="Table layout">
            {([["grid", "Grid"], ["list", "List"]] as const).map(([id, label]) => (
              <button
                key={id} onClick={() => setView(id)} aria-pressed={view === id}
                className={`${PILL} ${view === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-background"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {areaIds.length > 0 && (
            <button
              onClick={() => setCollapsed((ids) => (everyAreaCollapsed ? expandAreas(areaIds, ids) : collapseAreas(areaIds, ids)))}
              className={`${PILL} border border-border text-muted-foreground hover:bg-muted`}
            >
              {everyAreaCollapsed ? "Expand all" : "Collapse all"}
            </button>
          )}
          {p.canWrite && (
            <button
              onClick={p.onAddLocation}
              className="flex items-center gap-1.5 text-sm bg-primary text-primary-foreground px-3 py-1.5 max-sm:min-h-11 rounded-lg hover:opacity-90 transition"
            >
              <Plus className="w-4 h-4" /> Add Location
            </button>
          )}
        </div>
      )}
    >
      {p.loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : p.locations.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No locations yet.</p>
      ) : (
        <div className="space-y-6">
          {view === "grid" && (
            <div className="flex items-center gap-4 flex-wrap text-xs text-muted-foreground" aria-label="Legend">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: MERGE_BAR.free }} /> Free merge</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: MERGE_BAR.linked }} /> Linked tables</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full border border-border" /> No merging</span>
            </div>
          )}
          {p.locations.map((loc) => {
            const locAreas = p.areas.filter((a) => a.locationId === loc.id);
            return (
              <div key={loc.id} className={`border border-border rounded-lg p-4 ${loc.archivedAt ? "opacity-60" : ""}`}>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <span className="text-sm font-semibold text-foreground min-w-0 break-words flex items-center gap-2 flex-wrap">
                    {loc.name} {loc.archivedAt && <ArchivedBadge />}
                  </span>
                  <CatalogRowActions
                    label={loc.name} item={loc} canWrite={p.canWrite} canDelete={p.canDelete}
                    onEdit={() => p.onEditLocation(loc)} {...actions("location", loc.id, loc.name)}
                  />
                </div>

                {locAreas.length === 0 ? (
                  <p className="text-xs text-muted-foreground mb-3">No areas yet.</p>
                ) : (
                  <div className="space-y-4 mb-3">
                    {locAreas.map((area) => {
                      const areaTables = p.tables.filter((t) => t.areaId === area.id);
                      const open = !collapsed.includes(area.id);
                      const bodyId = `catalog-area-${area.id}`;
                      const canAddTable = p.canWrite && !area.archivedAt;
                      const tableActions = (t: ReservationTable) => ({
                        canWrite: p.canWrite, canDelete: p.canDelete,
                        onEdit: () => p.onEditTable(t, area), ...actions("table", t.id, t.name),
                      });
                      return (
                        <div key={area.id} className={`pt-3 border-t border-border/60 first:border-t-0 first:pt-0 ${area.archivedAt ? "opacity-60" : ""}`}>
                          <div className="flex items-center justify-between gap-3">
                            <button
                              onClick={() => setCollapsed((ids) => toggleId(ids, area.id))}
                              aria-expanded={open} aria-controls={bodyId}
                              className="flex items-center gap-2 flex-wrap min-w-0 flex-1 text-left max-sm:min-h-11"
                            >
                              <ChevronDown className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`} />
                              <span className="text-sm font-medium text-foreground">{area.name}</span>
                              {area.floor && <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{area.floor}</span>}
                              {area.type && <span className="text-xs px-2 py-0.5 rounded-full border border-border text-muted-foreground">{area.type}</span>}
                              <span className="text-xs text-muted-foreground">{tableCount(areaTables)}</span>
                              {area.archivedAt && <ArchivedBadge />}
                            </button>
                            <CatalogRowActions
                              label={area.name} item={area} canWrite={p.canWrite} canDelete={p.canDelete}
                              onEdit={() => p.onEditArea(area, loc)} {...actions("area", area.id, area.name)}
                            />
                          </div>

                          {open && (
                            <div id={bodyId} className="mt-3">
                              {areaTables.length === 0 && <p className="text-xs text-muted-foreground mb-2">No tables yet.</p>}
                              {view === "grid" ? (
                                (areaTables.length > 0 || canAddTable) && (
                                  <div className={GRID}>
                                    {areaTables.map((t) => (
                                      <TableTile
                                        key={t.id} table={t} canWrite={p.canWrite} canDelete={p.canDelete}
                                        onOpen={() => p.onEditTable(t, area)}
                                        onRestore={() => p.onRestore("table", t.id)}
                                        onPurge={() => p.onPurge("table", t.id, t.name)}
                                      />
                                    ))}
                                    {canAddTable && (
                                      <button
                                        onClick={() => p.onAddTable(area)}
                                        className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-xs text-primary hover:bg-muted/60 min-h-[4.5rem] max-sm:min-h-11"
                                      >
                                        <Plus className="w-3 h-3" /> Add Table
                                      </button>
                                    )}
                                  </div>
                                )
                              ) : (
                                <>
                                  {areaTables.length > 0 && (
                                    <div className="space-y-1 mb-2">
                                      {areaTables.map((t) => (
                                        <div key={t.id} className={`flex items-center justify-between gap-3 text-sm border-b border-border/60 last:border-b-0 py-1 ${t.archivedAt ? "opacity-60" : ""}`}>
                                          <span className="text-foreground min-w-0 break-words">
                                            {t.name} <span className="text-muted-foreground">· seats {seatsLabel(t.capacity, t.maxExtraCapacity)}{t.type ? ` · ${t.type}` : ""}{mergeSummary(t).kind !== "none" ? ` · ${mergeSummary(t).label}` : ""}</span>{" "}
                                            {t.archivedAt && <ArchivedBadge />}
                                          </span>
                                          <CatalogRowActions label={`table ${t.name}`} item={t} {...tableActions(t)} />
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {canAddTable && (
                                    <button onClick={() => p.onAddTable(area)} className={ADD_LINK}>
                                      <Plus className="w-3 h-3" /> Add Table
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {p.canWrite && !loc.archivedAt && (
                  <button onClick={() => p.onAddArea(loc)} className={ADD_LINK}>
                    <Plus className="w-3 h-3" /> Add Area
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </DashCard>
  );
}
