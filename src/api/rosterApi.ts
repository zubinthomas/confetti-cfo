// Weekly shift roster (server/routes/roster.ts). Read-only, backed by the
// imported shift_roster table - not the generic entity CRUD layer, since
// there's no manual create/edit UI for this data (see RosterTab.tsx).
import { get } from "./http";

export interface RosterRow {
  id: string;
  employeeName: string;
  employeeId: string | null;
  division: string | null;
  functionalArea: string | null;
  designation: string | null;
  gender: string | null;
  date: string;
  weekStart: string;
  shiftRaw: string | null;
  isOff: boolean;
  shiftStart: string | null;
  shiftEnd: string | null;
  breakSlot: string | null;
  weeklyOffDay: string | null;
}

export interface RosterWeek {
  week: string | null;
  weeks: string[];
  rows: RosterRow[];
}

export const getRoster = (week?: string) => get<RosterWeek>(`/roster${week ? `?week=${encodeURIComponent(week)}` : ""}`);
