import React from "react";
import { areaLabel, type ReservationArea, type ReservationLocation } from "@/api/reservationsApi";

/** Area picker. With more than one location the options are grouped under the
 *  location's name, otherwise it is a flat list. Shared by the booking form and
 *  the Guest Register. */
export default function AreaSelect({ value, onChange, locations, areas, className, allowNone, noneLabel }: {
  value: string; onChange: (id: string) => void;
  locations: ReservationLocation[]; areas: ReservationArea[]; className?: string;
  allowNone?: boolean; noneLabel?: string;
}) {
  const options = (list: ReservationArea[]) => list.map((a) => <option key={a.id} value={a.id}>{areaLabel(a)}</option>);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={className}>
      {allowNone && <option value="">{noneLabel ?? "Any area"}</option>}
      {locations.length > 1
        ? locations.map((l) => (
          <optgroup key={l.id} label={l.name}>{options(areas.filter((a) => a.locationId === l.id))}</optgroup>
        ))
        : options(areas)}
    </select>
  );
}
