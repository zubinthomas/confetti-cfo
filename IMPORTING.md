# Importing financial data

Financial data comes from three known Excel workbooks - the **CEPL P&L**,
**Cafe Weekly P&L**, and **Sienna Store Sales** - imported either by uploading
the `.xlsx` directly or by connecting a Google Sheet that re-syncs
automatically. Both paths land in **Data → Import** in the dashboard.

Both are **preview-first**: the workbook is parsed and validated, you see
exactly what would be created/changed per table, and nothing touches the
database until you click **Commit import**. Imports upsert by natural key
(department + period + line item, and so on), so re-importing the same data is
a no-op, updated cells change exactly the affected values, and new months/rows
are appended. Every batch is kept as provenance.

## Excel upload

Upload one of the three known workbooks from the Import page. Unrecognised
workbook shapes are rejected; validation errors block commit.

## Google Sheets sync

Connect a sheet once and it stays connected: the server re-syncs it in the
background and whenever changes are found, a fresh preview batch appears on
the Import page for you to review and commit. The sheet must have the same
shape as one of the three known workbooks (e.g. the workbook uploaded to
Google Sheets).

### Connecting a sheet

Two ways, both in the Google Sheets card on the Import page:

- **Pick from the list** (preferred): every spreadsheet shared with the
  server's service account - native Google Sheets *and* plain `.xlsx` files
  stored in Drive - is listed with a **Connect** button. Share a file with the
  service account's email, hit the refresh icon, and connect it.
- **Paste a URL**: for sheets shared as *Anyone with the link can view*, no
  service account needed - the server fetches Google's public `.xlsx` export.
  Pasting the URL of a private-but-service-account-shared sheet also works;
  access is resolved automatically (link first, service account as fallback).

**Service account setup** (one-time, enables the picker and private sheets):

1. In [Google Cloud Console](https://console.cloud.google.com), create a
   project (or reuse one), enable the **Google Drive API**, create a
   **service account**, and download its JSON key.
2. Point the server at the key in `server/.env`, either
   `GOOGLE_SERVICE_ACCOUNT_FILE=/path/to/key.json` or
   `GOOGLE_SERVICE_ACCOUNT_JSON=` with the JSON itself (base64 accepted).
3. Share each sheet (or a whole Drive folder) with the service account's
   `client_email` - shown as a hint on the Import page once configured.
   Viewer access is enough.

### Managing connected sheets

Each sheet row on the Import page shows its last sync time and status
(*preview ready*, *auto-committed*, *no changes*, or *error* with the
reason), plus:

- **Sync mode** - how each sheet's syncs are handled:
  - *Manual review* (default): every sync with changes leaves a preview batch
    for you to commit.
  - *Auto*: a sync is committed immediately - but only when the parse
    produced no warning- or error-level issues; anything questionable still
    stops as a preview for review.
  - *Paused*: skipped by the scheduled sync (history kept; *Sync now* still
    works).
- **Sync now** - re-fetch immediately instead of waiting for the schedule.
- **Remove** - stops syncing and discards the sheet's pending preview;
  already-committed imports are kept as provenance.

### Sync behaviour

Set the interval with `SHEETS_SYNC_INTERVAL_MINUTES` in `server/.env`
(default 30; `0` disables scheduled syncing, leaving manual *Sync now*). A
new sync supersedes the sheet's previous uncommitted preview, so at most one
pending preview exists per sheet, and syncs that find no changes don't create
a batch at all. Nothing is committed without a human unless a sheet is
explicitly set to *Auto* - and even then only clean, warning-free syncs land.
