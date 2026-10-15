// Backup history + on-demand trigger (server/routes/backups.ts). No
// download/delete here on purpose - see that route's own comment.
import { get, post } from "./http";

export interface BackupInfo {
  filename: string;
  createdAt: string;
  sizeBytes: number;
}

export const listBackups = () => get<BackupInfo[]>("/backups");
export const createBackup = () => post<BackupInfo>("/backups");
