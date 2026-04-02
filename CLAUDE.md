# BetterBankings Frontend — CLAUDE.md

> Read the backend `../bs-be/CLAUDE.md` first. This file covers frontend-specific details only.

---

## What This Project Is

**betterbankings-software** is the Next.js frontend for the BetterBankings cashflow analysis platform. It provides a web UI for uploading loan CSV or XLSX data, viewing computed cashflow results in paginated tables (IRRBB, LCR, NSFR, ILAAP buckets), pivoting/aggregating data by various dimensions, filtering, exporting to Excel, managing scenario behaviours (CSV or XLSX), managing reference data (SuperAdmin), and saving/loading column presets.

Backend API is at `https://103.103.22.207:8002` (hardcoded in `app/lib/api.ts`).

---

## Tech Stack

| Thing     | Value                                                                                              |
| --------- | -------------------------------------------------------------------------------------------------- |
| Framework | Next.js **16.1.6** (App Router)                                                                    |
| Language  | TypeScript                                                                                         |
| React     | 19.2.3                                                                                             |
| Styling   | Tailwind CSS **v4** — CSS-first config via `@theme` in `globals.css`, **NOT** `tailwind.config.ts` |
| Font      | Inter (Google Fonts, weights 300–800)                                                              |
| Auth      | Custom token-based (Bearer token from backend, stored in `localStorage`)                           |

---

## Running Locally

```bash
cd betterbankings-software
npm install
npm run dev
# → http://localhost:3000
```

---

## Folder Structure

```
betterbankings-software/
├── app/
│   ├── layout.tsx                Root layout — Inter font, globals.css
│   ├── page.tsx                  MAIN PAGE — the entire application (~2600 lines, "use client")
│   │                             Contains: results table, column selector, filters, pivot table,
│   │                             behaviour management, summary panel, upload, presets
│   ├── globals.css               Tailwind v4 config (@theme) + all component styles (~44KB)
│   ├── components/
│   │   └── LoginPage.tsx         Login form component
│   ├── lib/
│   │   ├── api.ts                All backend API calls (auth, upload, results, pivot, behaviours,
│   │   │                         presets, reference, export) — typed interfaces, fetch wrappers
│   │   ├── cashflow.ts           Client-side amortization calculation (Python port, for local preview)
│   │   └── parser.ts             Client-side CSV parser (for preview before upload)
│   ├── admin/
│   │   └── page.tsx              SuperAdmin reference data management page
│   ├── drilldown/
│   │   └── page.tsx              Drilldown view page (~30KB)
│   └── history/
│       └── page.tsx              Upload history page
├── public/                       Static assets
├── package.json
├── tsconfig.json
├── next.config.ts
├── postcss.config.mjs
├── next-env.d.ts
├── bucket.py                     Python reference file (NOT used by frontend — for reference only)
├── calculator.py                 Python reference file (NOT used by frontend — for reference only)
├── extractor.py                  Python reference file (NOT used by frontend — for reference only)
└── model.py                      Python reference file (NOT used by frontend — for reference only)
```

---

## Architecture — Single-Page Monolith

The main application lives in **`app/page.tsx`** (~2600 lines, `"use client"`). It is a single client component that manages:

### State & Views

- **Login gate** — renders `<LoginPage>` if not authenticated, otherwise the full dashboard
- **Upload** — CSV or XLSX file upload → polls `GET /api/upload/status/:id` until completed
- **Active Upload** — once completed, loads results from the backend
- **Results Table** — paginated table with configurable visible columns, sorting, filtering
- **Column Selector** — grouped toggle panel (Input Columns, LCR, NSFR, IRRBB, ILAAP bucket columns)
- **Filter Panel** — per-column filter dropdowns with AND logic
- **Pivot Table** — dynamic aggregation by any combination of pivot keys
- **Summary Panel** — totals, averages, bucket sums
- **Behaviour Tabs** — switch between base results and scenario behaviour results
- **Preset System** — save/load column + pivot configurations

### Key Constants

- `INPUT_KEYS` — 27 input column identifiers (includes account_number, instrument_type, market_value, asset_liability, margin, revolving_flag)
- `PIVOTABLE_KEYS` — 12 columns that can be used as pivot group-by keys
- `IRRBB_LABELS`, `LCR_LABELS`, `NSFR_LABELS`, `ILAAP_LABELS` — bucket label arrays (from `api.ts`)

### Filter Type

- `"both"` — sum principal + interest (default)
- `"bbi"` — principal only
- `"interest"` — interest only

---

## API Integration — `app/lib/api.ts`

**Base URL:** `https://103.103.22.207:8002`

### Auth Functions

- `login(username, password)` → stores token + username + role in `localStorage`
- `logout()` → `POST /api/auth/logout` + clears localStorage
- `isLoggedIn()` / `getUsername()` / `getRole()` / `isSuperAdmin()` — localStorage checks
- `authHeaders()` → `{ Authorization: "Bearer <token>" }`

### Key API Functions

| Function                                                                 | Endpoint                              | Notes                       |
| ------------------------------------------------------------------------ | ------------------------------------- | --------------------------- |
| `uploadCSV(file)`                                                        | `POST /api/upload`                    | Multipart form data         |
| `waitForProcessing(id)`                                                  | `GET /api/upload/status/:id`          | Polls every 2s              |
| `getHistory()`                                                           | `GET /api/history`                    | User's upload history       |
| `deleteUpload(id)`                                                       | `DELETE /api/history/:id`             |                             |
| `getResults(uploadId, params)`                                           | `GET /api/results/:id`                | Paginated, filtered, sorted |
| `getSummary(uploadId, filterType, filters, behaviourId)`                 | `GET /api/results/:id/summary`        |                             |
| `getFilterOptions(uploadId, column)`                                     | `GET /api/results/:id/filter-options` |                             |
| `getPivot(uploadId, pivotKeys, filterType, filters)`                     | `GET /api/pivot/:id`                  |                             |
| `exportExcel(uploadId, filterType, filters, behaviourId)`                | `GET /api/export/:id`                 | Blob download               |
| `listBehaviours(uploadId)`                                               | `GET /api/uploads/:id/behaviours`     |                             |
| `uploadBehaviour(uploadId, name, file)`                                  | `POST /api/uploads/:id/behaviours`    |                             |
| `deleteBehaviour(id)`                                                    | `DELETE /api/behaviours/:id`          |                             |
| `reprocess(uploadId)`                                                    | `POST /api/uploads/:id/reprocess`     |                             |
| `listPresets()` / `createPreset()` / `updatePreset()` / `deletePreset()` | `/api/presets` CRUD                   |                             |
| `getReferenceMaps()`                                                     | `GET /api/reference-maps`             | For display name mapping    |
| `listReference()` / `createReference()` / etc.                           | `/api/reference/:table` CRUD          | SuperAdmin only             |

### Type Definitions

- `ResultRow` — matches backend `models.ResultRow`, includes all loan input fields + 8 bucket maps (IRRBB/LCR/NSFR/ILAAP × principal/interest) + account_number, instrument_type, market_value, asset_liability, margin, revolving_flag
- `PaginatedResponse` — `{ data: ResultRow[], total, total_pages }`
- `SummaryResponse` — `{ total_count, total_outstanding, avg_interest_rate, currencies, bucket_totals, column_sums }`
- `ReferenceMaps` — `Record<string, ReferenceItem[]>` — all reference tables in one object

---

## Client-Side Libraries

### `app/lib/cashflow.ts`

Local amortization calculator (port of `installment_software/calculator.py`). Used for client-side preview before upload, NOT for the actual processing (that happens server-side).

### `app/lib/parser.ts`

Client-side CSV parser for preview. Handles delimiter detection, BOM removal, column alias mapping.

---

## Tailwind CSS v4

All design tokens defined in `app/globals.css` under `@theme`:

```css
@import "tailwindcss";

@theme {
  --color-brand-primary: ...;
  --color-surface-0: ...;
  /* etc */
}
```

`globals.css` is ~44KB and contains all component styling. **Do not create `tailwind.config.ts`** — it would conflict with v4.

---

## Reference Map Display

The frontend fetches `GET /api/reference-maps` on load to get display names for ID-based columns. The `mapValue()` helper in `page.tsx` converts raw DB values (like `"1"`) to human-readable names (like `"Loan"`).

Reference tables: `product_types`, `segments`, `methods`, `day_counts`, `currencies`, `instrument_types`, `transactional_types`, `installment_frequencies`

---

## Pages

### `/` (Main Page — `app/page.tsx`)

The entire dashboard — upload (CSV/XLSX), results, pivot, behaviours (CSV/XLSX scenarios), presets, filters, column selector. All in one ~2700-line client component.

### `/admin` (`app/admin/page.tsx`)

SuperAdmin reference data management. CRUD operations on all 8 reference tables.

### `/drilldown` (`app/drilldown/page.tsx`)

Drilldown view for detailed row-level analysis.

### `/history` (`app/history/page.tsx`)

Upload history list with delete action.

---

## Common Pitfalls

- **`page.tsx` is 2700+ lines** — the main application is a single monolithic client component. All state lives in React hooks at the top. Be careful with state dependencies.
- **Python `.py` files in root** — `bucket.py`, `calculator.py`, `extractor.py`, `model.py` are reference files from `installment_software`, NOT used by the frontend at runtime.
- **Tailwind v4** — CSS-first config, no JS config file. Custom colors use `@theme` in `globals.css`.
- **API_BASE is hardcoded** — `https://103.103.22.207:8002` in `api.ts`. Change this for different environments.
- **Auth is localStorage-based** — `token`, `username`, `role` stored in localStorage. No refresh token mechanism.
- **`behaviour_id` handling** — `"null"`, `"base"`, or empty all mean "show base results (no scenario)". A numeric string means "show results for that scenario behaviour".
- **Bucket label strings must match exactly** — the frontend uses the exact same bucket label strings as the backend (e.g., `"≤ 1 M"`, `"CF <= 30D"`). Any mismatch will result in missing data.
- **No SSR** — the main page is `"use client"` with localStorage auth, so it cannot be server-rendered.
- **XLSX upload support** — file accept attributes include `.xlsx,.xls` for both data input and scenario uploads. The backend handles format detection by file extension.
- **ILAAP columns** — 41 ILAAP bucket columns are available in the column selector under "CF ILAAP" group. Interest is always 0 for ILAAP buckets.
