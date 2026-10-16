// Marking a period reconciled/un-reconciled (server/routes/periods.ts).
// Period rows themselves come from useReferenceData() - this is just the
// one mutation.
import { patch } from "./http";
import type { Period } from "@/data/types";

export const reconcilePeriod = (id: number, reconciled: boolean) =>
  patch<Period>(`/periods/${id}/reconcile`, { reconciled });
