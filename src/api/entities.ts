// CRUD for the app entities (HR & compliance records), served by the Express
// server's /api/entities routes.
import { get, post, put, del } from "./http";

export interface EntityRecord {
  id: string;
  created_date: string;
  // HR forms build these records dynamically, so fields stay loosely typed
  [field: string]: any;
}

const entityApi = (name: string) => ({
  list: (sort?: string) =>
    get<EntityRecord[]>(`/entities/${name}${sort ? `?sort=${encodeURIComponent(sort)}` : ""}`),
  create: (data: Record<string, unknown>) => post<EntityRecord>(`/entities/${name}`, data),
  update: (id: string, data: Record<string, unknown>) => put<EntityRecord>(`/entities/${name}/${id}`, data),
  delete: (id: string) => del(`/entities/${name}/${id}`),
});

export const Employee = entityApi("Employee");
export const Licence = entityApi("Licence");
export const Recruitment = entityApi("Recruitment");
export const LeaveRequest = entityApi("LeaveRequest");
export const PayrollRecord = entityApi("PayrollRecord");
