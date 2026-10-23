import React, { useEffect, useState } from "react";
import { getSeatingOptions, moveReservation, type Reservation, type SeatingOptions } from "@/api/reservationsApi";

const BTN = "text-xs px-2.5 py-1.5 max-sm:min-h-11 rounded-lg";

/** For a late party whose table is taken: the table that fits them best right
 *  now (fewest spare seats, same area first) as a one-click Seat, plus a picker
 *  for the other free tables. Moving keeps the booking's time and seats it. */
export default function MoveBooking({ booking, canMove, version, onMoved }: {
  booking: Reservation;
  canMove: boolean;
  /** Changes whenever the floor reloads, so the options never go stale. */
  version: string;
  onMoved: () => void;
}) {
  const [data, setData] = useState<SeatingOptions | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    getSeatingOptions(booking.id)
      .then((d) => { if (live) { setData(d); setError(""); } })
      .catch((err) => { if (live) setError(err instanceof Error ? err.message : "Couldn't look for another table"); });
    return () => { live = false; };
  }, [booking.id, version]);

  const move = async (tableId: string) => {
    setBusy(true);
    setError("");
    try {
      await moveReservation(booking.id, { tableId, seat: true });
      onMoved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't move this booking");
    } finally {
      setBusy(false);
    }
  };

  if (error && !data) return <p role="alert" className="text-xs text-destructive">{error}</p>;
  if (!data) return <p className="text-xs text-muted-foreground">Looking for a free table...</p>;
  if (data.options.length === 0) {
    return <p className="text-xs text-muted-foreground">No free table fits a party of {data.partySize}.</p>;
  }

  const [best, ...rest] = data.options;
  const label = (o: { name: string; capacity: number }) => `${o.name} (seats ${o.capacity})`;
  if (!canMove) {
    return <p className="text-xs text-muted-foreground">Free table that fits: {label(best)}</p>;
  }
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => move(best.tableId)} disabled={busy}
          className={`${BTN} bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50`}
        >
          Seat at {label(best)}
        </button>
        {rest.length > 0 && (
          <select
            aria-label={`Other table for ${booking.guestName}`} value="" disabled={busy}
            onChange={(e) => { if (e.target.value) move(e.target.value); }}
            className={`${BTN} border border-border bg-background text-foreground`}
          >
            <option value="">Other table...</option>
            {rest.map((o) => <option key={o.tableId} value={o.tableId}>{label(o)} · {o.areaName}</option>)}
          </select>
        )}
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
