# Break Schedule Tool

I built this tool while working in retail to streamline a time-consuming daily task. Administrators and managers would spend 15-30 minutes each day manually determining breaks from a daily schedule spreadsheet, and it wasn't uncommon for there to be issues with compliance with state labor law. This tool takes the exported daily schedule from the UKG Retail Schedule Planner, calculates legally compliant meal periods and rest breaks for every employee (including split shifts), and writes them back into the spreadsheet.

It started as a quick Excel macro, then grew into a fully client-side web app (MVC, Facade, and Observer patterns, a Vite build, and GitHub Pages hosting). It's now being rebuilt as a multi-tenant SaaS product: an Azure Static Web App frontend backed by an Azure Functions API, so multiple companies, each with their own locations, coverage groups, and users, can use it without running anything themselves. The original client-only app has been retired; the SaaS app is now the only supported way to use the tool.

---

## What it does

1. A manager selects one of their assigned Locations and uploads the custom daily schedule `.xlsx` file exported from UKG.
2. The API parses every shift, groups employees who appear in two rows (split shifts), and calculates the correct number of meals and rest breaks under the Location's labor-law jurisdiction (California only for now).
3. Break times are optimized so coworkers in the same department aren't on break at the same time, using the Location's own coverage groups and operating hours.
4. The completed schedule is returned as a formatted `.xlsx` file for download. Nothing about the upload or the run is persisted — the file only ever lives in the memory of the request that processes it.

---

## Architecture

| Piece | Where | What |
|---|---|---|
| **Frontend** | `web/` | Static site deployed to Azure Static Web Apps. Authentication (Entra ID) and route protection are handled by SWA itself via `web/staticwebapp.config.json` — the app has no login code of its own. |
| **API** | `api/` | Azure Functions (Node 20), one function per endpoint under `api/src/functions/`. Deployed as SWA's managed API, so it shares the frontend's auth: every `/api/*` request arrives with the caller's identity already resolved into an `x-ms-client-principal` header. |
| **Storage** | Azure Table Storage | Companies, Locations, Users, coverage groups, and settings. Accessed only through `api/src/facades/TableStorageFacade.js`. |
| **Scheduling engine** | `api/src/core/` | The pure break/meal calculation logic — no DOM, no HTTP, fully unit-testable. Covered by `api/tests/core/`. |
| **Deployment** | `azd` (`azure.yaml`, `infra/`) | `azd up` provisions the Static Web App, storage account, and supporting infra from the Bicep templates in `infra/`, and deploys `web/` (with `api/` bundled in as its managed API, per `web/swa-cli.config.json`). |

### Multi-tenancy model

A **Company** has many **Locations** and **Users**. Users are invited by email, assigned an Admin or Manager role, and (if Manager) scoped to specific Locations. Every Company-scoped entity (Location, coverage group, settings) is resolved against the caller's own Company before use — see `api/src/lib/companyScope.js` for the shared isolation helpers every endpoint goes through.

### The wizard

The core workflow — select a Location, upload a schedule, review the parsed result, calculate breaks, download the finished file — is implemented as a sequence of API endpoints (`api/src/functions/wizard*.js`) that carry state forward via the request/response rather than persisting anything server-side. The current `web/` frontend is a minimal tracer bullet; building it out into the full guided flow is tracked separately.

---

## Development

### Prerequisites

- Node.js v20 LTS or later
- npm v9+ (included with Node.js)
- [Azure Functions Core Tools](https://learn.microsoft.com/azure/azure-functions/functions-run-local) and [Azurite](https://github.com/Azure/Azurite) for local API/storage emulation
- [Azure Static Web Apps CLI](https://azure.github.io/static-web-apps-cli/) (installed as a dev dependency, run via `npm run tracer:web`)

### Installation

```bash
git clone https://github.com/seano288/break-schedule-tool.git
cd break-schedule-tool
npm install
npm --prefix api install
```

Dependencies are pinned in `package-lock.json` / `api/package-lock.json`. Use `npm ci` instead of `npm install` in automated environments to enforce exact versions.

### Running locally

```bash
npm run tracer:dev   # Azurite (storage emulator) + Functions API + SWA CLI, all together
```

Or run the pieces individually:

```bash
npm run tracer:azurite  # Table Storage emulator
npm run tracer:api       # Azure Functions API on its default port
npm run tracer:web       # SWA CLI, proxies the API and emulates SWA auth
```

### Testing and linting

```bash
npm test                 # Vitest — scheduling engine + API unit/integration tests (api/src/**/*.test.js)
npm run lint              # ESLint (with eslint-plugin-security) across api/
```

### Deployment

```bash
azd up
```

`azd` provisions the infrastructure defined in `infra/` and deploys `web/` (with `api/` bundled as its managed API). There is no other deployment path — see [Architecture](#architecture).

---

## California Labor Law Reference

### Meal periods

| Total hours worked | Meal periods required |
|---|---|
| < 5h (< 300 min) | 0 |
| >= 5h (>= 300 min) | 1 |
| >= 10h (>= 600 min) | 2 |
| Split shift — gap >= 30 min | Gap satisfies first meal; same totals apply |

### Rest breaks

One paid 10-minute rest break per 4-hour work period or **major fraction thereof** (CA DLSE: strictly more than 2 hours). No break if total shift is under 3.5 hours.

Formula: `floor(totalMinutes / 240) + (totalMinutes % 240 > 120 ? 1 : 0)`

| Total shift minutes | Breaks |
|---|---|
| < 210 (< 3.5h) | 0 |
| 210-360 (3.5h to 6h) | 1 |
| 361-480 (6h+1min to 8h) | 2 |
| 481-600 (8h+1min to 10h) | 2 |
| 601-720 (10h+1min to 12h) | 3 |

Note: a 6-hour shift gets **1** rest break (remainder = 120 min, which is NOT strictly greater than 120). A 6h+1min shift gets 2. Rest breaks are paid and count as worked time; no deduction is applied when calculating the count.

Break placement uses net worked time, not wall-clock offsets. Each break is placed at the 2-hour mark of its 4-hour worked period, which correctly accounts for meal gaps mid-shift. Jurisdiction-specific rules (currently just California) live behind a ruleset seam — see `api/src/core/rulesets/`.

---

## Tech Stack

| Tool | Purpose |
|---|---|
| **Azure Static Web Apps** | Frontend hosting, built-in authentication and route protection |
| **Azure Functions** (Node 20) | API |
| **Azure Table Storage** | Company/Location/User/settings persistence |
| **azd** / **Bicep** (`infra/`) | Infrastructure provisioning and deployment |
| **Vitest** | Unit testing, all under `api/` (scheduling engine included) |
| **ESLint** + **eslint-plugin-security** | Static analysis |
| **xlsx (SheetJS)** | Excel file parsing and generation |
| **Azurite** / **Azure Functions Core Tools** / **SWA CLI** | Local emulation for development (`npm run tracer:dev`) |

---

## License

MIT
