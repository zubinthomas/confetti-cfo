// Engagement-hours log against the spec's 60h/month delivery budget
// (server/routes/timeLog.ts).
import { get, post, del } from "./http";
import type { TimeLogEntry } from "@/data/types";

export const listTimeLog = (month?: string) =>
  get<TimeLogEntry[]>(month ? `/time-log?month=${month}` : "/time-log");

export const addTimeLogEntry = (input: { date: string; hours: number; note?: string }) =>
  post<TimeLogEntry>("/time-log", input);

export const deleteTimeLogEntry = (id: number) =>
  del<{ message: string }>(`/time-log/${id}`);
