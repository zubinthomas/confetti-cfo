// The venue every database starts with. Shared by the startup seed
// (reservations.ts seedDefaultReservationLocations) and the table seed
// (seed-reservation-tables.ts) so the two can't disagree on names.
export const DEFAULT_LOCATION = 'Sienna, Hindustan Park';

// name + floor, in display order. "Second Floor" is its own floor, so no
// separate floor label; Curbside is outside, so none either.
export const DEFAULT_AREAS: { name: string; floor: string | null }[] = [
  { name: 'Cafe', floor: 'Ground Floor' },
  { name: 'Restaurant', floor: 'First Floor' },
  { name: 'Bar', floor: 'First Floor' },
  { name: 'Second Floor', floor: null },
  { name: 'Curbside', floor: null },
];
