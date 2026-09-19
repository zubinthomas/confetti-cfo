// Low-level Google Calendar REST access, modeled on server/sheets/fetch.ts's
// service-account pattern: google-auth-library's JWT class only (no
// googleapis package), a minted access token, plain fetch() against the
// REST API. Reuses the same GOOGLE_SERVICE_ACCOUNT_FILE/_JSON credentials
// already configured for Sheets - just a different OAuth scope, so a
// separate JWT client (Sheets' client is scoped to drive.readonly only).
import { readFileSync } from 'fs';
import { JWT } from 'google-auth-library';

const FETCH_TIMEOUT_MS = 15_000;
const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

export class CalendarAccessError extends Error {
  code: 'no_service_account' | 'no_calendar_id' | 'access_denied' | 'bad_response';
  constructor(code: CalendarAccessError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

interface ServiceAccount { client: JWT; email: string }
let cachedSA: ServiceAccount | null | undefined;

function loadServiceAccount(): ServiceAccount | null {
  const file = process.env.GOOGLE_SERVICE_ACCOUNT_FILE;
  let raw = file ? readFileSync(file, 'utf-8') : process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  let creds: { client_email?: string; private_key?: string };
  try {
    creds = JSON.parse(raw);
  } catch {
    raw = Buffer.from(raw, 'base64').toString('utf-8');
    creds = JSON.parse(raw);
  }
  if (!creds.client_email || !creds.private_key) {
    throw new Error('Service account JSON is missing client_email/private_key');
  }
  const client = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
  return { client, email: creds.client_email };
}

function getServiceAccount(): ServiceAccount | null {
  if (cachedSA === undefined) {
    try {
      cachedSA = loadServiceAccount();
    } catch (err) {
      console.error('calendar: invalid service account config:', err instanceof Error ? err.message : err);
      cachedSA = null;
    }
  }
  return cachedSA;
}

/** Whether Calendar sync has everything it needs to run - callers use this
 *  to skip silently (not an error) rather than call through and catch. */
export function isCalendarConfigured(): boolean {
  return !!getServiceAccount() && !!process.env.GOOGLE_CALENDAR_ID;
}

function requireReady(): { sa: ServiceAccount; calendarId: string } {
  const sa = getServiceAccount();
  if (!sa) throw new CalendarAccessError('no_service_account', 'No service account is configured (set GOOGLE_SERVICE_ACCOUNT_FILE or GOOGLE_SERVICE_ACCOUNT_JSON)');
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!calendarId) throw new CalendarAccessError('no_calendar_id', 'GOOGLE_CALENDAR_ID is not configured');
  return { sa, calendarId };
}

async function calendarFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { sa } = requireReady();
  const { token } = await sa.client.getAccessToken();
  let res: Response;
  try {
    res = await fetch(`${CALENDAR_API_BASE}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    throw new CalendarAccessError('bad_response', `Could not reach the Calendar API: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (res.status === 403 || res.status === 404) {
    let detail: string | undefined;
    try {
      detail = ((await res.json()) as { error?: { message?: string } }).error?.message;
    } catch { /* non-JSON error body */ }
    throw new CalendarAccessError('access_denied',
      detail ?? `Calendar API access denied (HTTP ${res.status}) - check the calendar is shared with ${sa.email} and the Calendar API is enabled`);
  }
  return res;
}

export interface CalendarEvent {
  id: string;
  status?: string; // 'confirmed' | 'cancelled' | ...
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  updated?: string;
}

export async function insertEvent(event: Partial<CalendarEvent>): Promise<CalendarEvent> {
  const { calendarId } = requireReady();
  const res = await calendarFetch(`/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
    body: JSON.stringify(event),
  });
  if (!res.ok) throw new CalendarAccessError('bad_response', `Calendar event create failed with HTTP ${res.status}`);
  return res.json() as Promise<CalendarEvent>;
}

export async function updateEvent(eventId: string, event: Partial<CalendarEvent>): Promise<CalendarEvent> {
  const { calendarId } = requireReady();
  const res = await calendarFetch(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    body: JSON.stringify(event),
  });
  if (!res.ok) throw new CalendarAccessError('bad_response', `Calendar event update failed with HTTP ${res.status}`);
  return res.json() as Promise<CalendarEvent>;
}

export async function deleteEvent(eventId: string): Promise<void> {
  const { calendarId } = requireReady();
  const res = await calendarFetch(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
  });
  // 410 Gone = already deleted on the Calendar side - not an error for us.
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new CalendarAccessError('bad_response', `Calendar event delete failed with HTTP ${res.status}`);
  }
}

/** Events in [timeMin, timeMax), single-instance expanded (no recurrence
 *  series objects) - what the pull job scans each tick. */
export async function listEvents({ timeMin, timeMax }: { timeMin: string; timeMax: string }): Promise<CalendarEvent[]> {
  const { calendarId } = requireReady();
  const events: CalendarEvent[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      timeMin, timeMax, singleEvents: 'true', orderBy: 'startTime', maxResults: '250',
      ...(pageToken ? { pageToken } : {}),
    });
    const res = await calendarFetch(`/calendars/${encodeURIComponent(calendarId)}/events?${params}`);
    if (!res.ok) throw new CalendarAccessError('bad_response', `Calendar event list failed with HTTP ${res.status}`);
    const json = (await res.json()) as { items?: CalendarEvent[]; nextPageToken?: string };
    events.push(...(json.items ?? []));
    pageToken = json.nextPageToken;
  } while (pageToken);
  return events;
}
