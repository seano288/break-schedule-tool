# Integrations Landscape: Workforce-Scheduling Products & Their Schedule Exports

**Ticket:** Research — what WFM products do CA hourly retail employers use, and which expose a schedule EXPORT (file or API) we could ingest, now or post-v1?
**Date:** 2026-07-31
**Context:** v1 ingests an `.xlsx` export from **UKG Retail Schedule Planner** via a generic tabular parser with a UKG preset. v1 is **upload-only** (no direct API integrations — see `map.md`). This research (a) tests the "generic tabular upload" bet against the real market and (b) tells us whether to anticipate an API parser later.

Scope note: findings are drawn from official developer/product/help domains. Where a fact could not be confirmed from a primary source, it is marked **unconfirmed** rather than inferred. Exact API endpoint paths that sit behind credential-gated reference portals are frequently unconfirmable from public pages; endpoint *existence* is confirmed where the vendor documents the resource.

---

## The market shape (why this matters for the bet)

The products split cleanly into two tiers, and that split maps directly onto our ingestion strategy:

- **Enterprise WFM** (UKG Pro WFM/Dimensions, UKG Pro, Workday, Legion, Quinyx, Kronos WFC legacy): rich, configurable **file reports** (xlsx/CSV) that a manager or admin runs on demand, *plus* APIs — but the **APIs are universally customer-/partner-gated** (a tenant + provisioned credentials, never self-serve). These are where large CA retail chains live.
- **SMB / mid-market** (Deputy, When I Work, Homebase, 7shifts, HotSchedules): a manager-facing **"Export Schedule"** button producing PDF/CSV/XLSX, plus APIs that also require an application/approval step (nothing is a truly open, sign-up-and-go public API either).

The single most important cross-cutting finding: **every product offers a manager- or admin-facing schedule export as a file, and none offers a fully public self-serve API.** That is a strong tailwind for an upload-first product and a caution against betting on API ingestion early.

---

## UKG family (the v1 anchor)

UKG's product line spans the whole market, which is why it's a smart anchor:

- **UKG Pro** — enterprise HCM for the largest, most complex multi-location/multi-country organizations. [Source](https://www.ukg.com/learn/article-library/executive-leaders/hr-software-guide-ukg-pro-or-ukg-ready-which-right-you)
- **UKG Pro Workforce Management** (formerly **UKG Dimensions**, formerly Kronos Workforce Dimensions) — enterprise WFM (time, attendance, scheduling, labor) for mid-to-large orgs; retail is a named vertical. This is the module that contains scheduling/**Retail Schedule Planner**. [Source](https://www.ukg.com/products/ukg-pro-workforce-management)
- **UKG Ready** — SMB / mid-market HCM+WFM (UKG Ready Start targets <200 employees; scales to ~2,500). [Source](https://www.outsail.co/post/ukg-ready-vs-ukg-pro-which-platform-fits-your-company-size)
- **Kronos Workforce Central (WFC)** — the legacy on-prem/private-cloud predecessor. **End of life**: Kronos Private Cloud EOL 31 Dec 2025; on-prem WFC EOL 31 Mar 2027; engineering ended 31 Dec 2025. Migration path is UKG Pro WFM. Do not build to WFC. [Source](https://www.workaxle.com/blog/kronos-workforce-central-end-of-life-migration)

**Retail focus:** UKG explicitly positions Pro WFM for retail hourly scheduling (AI-guided schedule recommendations, labor forecasting, compliance). [Source](https://www.ukg.com/industry-solutions/retail/retail)

### File export (the v1 path)
UKG Workforce Dimensions / Pro WFM reports and schedule views export to **Excel (.xls/.xlsx)** and **CSV** (plus PSV/TSV/SSV delimited variants). When output as CSV, **the report includes column headers as the first row**, and column order is admin-configurable (`CSV_Export_Column_Names_Order`). [Formats source](https://communityfiles.ukg.com/support/KOL/OnlineHelp-WorkforceDimensions/en-us/Content/MasterTopics/ReportAppendices/ExportReports.htm) · [CSV headers source](https://communityfiles.ukg.com/support/KOL/OnlineHelp-WorkforceDimensions/en-us/Content/MasterTopics/ReportAppendices/CSV_output.htm)

The Schedule Planner also emits an **`.xlsx`** file (the Rotation Schedule template and planner-data exports are Excel). Note: the "Export Planner Data" flow is forecast/labor-volume data (`.xls`, ≤3,000 rows, function-access-gated), which is *distinct* from the employee-shift schedule report our UKG preset targets. [Rotation template source](https://communityfiles.ukg.com/support/kol/onlinehelp-workforcedimensions/en-us/Content/RotationSchedule/User/RotationScheduleTemplates.htm) · [Planner-data export source](https://customer2.kronos.com/support/KOL/OnlineHelp-WorkforceDimensions/en-us/Content/Forecasting/ExportPlannerData.htm)

**Shape caveat:** UKG's schedule export columns are **admin-configurable**, not a fixed schema. Our UKG preset must tolerate column-order/label variation — which is exactly what the "generic tabular parser + preset" design is for.

### API
**UKG Pro WFM API** — a REST API (OAuth 2.0) exposing `shifts` (stored entities) and the computed `schedule`, plus Open Shift create/retrieve/update/delete. [Welcome source](https://developer.ukg.com/wfm/reference/welcome-to-the-ukg-pro-workforce-management-api)

**Access tier: customer-/tenant-gated, not self-serve.** You need an **APP_KEY issued by a Developer Admin inside a UKG customer tenant**, plus either an employee credential flow or client-credentials (client_id/client_secret from the tenant's Developer Console). You must be the customer (or their authorized integration partner) to get credentials. No public pricing; access is bundled with the customer's UKG contract. [Auth source](https://developer.ukg.com/wfm/docs/authentication-and-security-doc) · [OAuth source](https://developer.ukg.com/proplatform/docs/obtaining-bearer-tokens)

---

## Enterprise / retail-WFM tier

### Workday (Scheduling / Workforce Management)
- **Segment:** Enterprise, built on Workday HCM; explicitly targets frontline/hourly in retail, hospitality, food service (Workday cites 1,800+ retail & hospitality customers). Contract/tenant software, not SMB self-serve. [Source](https://www.workday.com/en-us/topics/hr/workforce-management.html)
- **File export:** Yes, via **Report-as-a-Service (RaaS)** — any Advanced custom report can be exposed as a web service and pulled as **CSV, JSON, or XML**. Columns are **tenant-defined** (you build the report), not a fixed schema. [Source](https://github.com/Workday/raas-python)
- **API:** SOAP Web Services (includes a **Scheduling** service and **Staffing** service), a narrower REST API (Staffing), and RaaS. Exact scheduling operation names live behind the versioned WSDL/Operation Directory — unconfirmed from public index. [Source](https://community-content.workday.com/en-us/public/products/platform-and-product-extensions/soap-api-reference.html)
- **Access:** Enterprise/customer-only. All paths require a **Workday tenant** + provisioned credentials (registered API Client with RaaS scope, or an Integration System User for SOAP). No public self-serve; no separate published API price.

### Quinyx
- **Segment:** Retail / hospitality / logistics hourly ("frontline"), mid-market to enterprise, multi-location. Cites Gartner Market Guide for Retail WFM. [Source](https://www.quinyx.com/workforce-management)
- **File export:** **Unconfirmed** on primary product/developer pages — no documented manager-facing schedule file download. The documented data-out mechanism is the API.
- **API:** Yes — Developer Portal documents a REST API in tiers: **v3** (current, OAuth 2.0, NA/EU regional endpoints — recommended), **v2** (Swagger), **v1 SOAP** (legacy). Exposes WFM resources including shifts/schedules/forecast. Exact v3 shift/schedule paths sit behind the reference portal — unconfirmed. [Source](https://developer.quinyx.com/api/v3)
- **Access:** Partner/customer-gated. OAuth 2.0 **client-credentials** where ClientID/Secret must be **issued by Quinyx** (not self-serve). No public pricing. [Source](https://developer.quinyx.com/)

### Legion
- **Segment:** Retail / restaurant / hospitality / healthcare hourly WFM, enterprise + mid-market (union/compliance rules, multi-location). [Source](https://legion.co/products/automated-scheduling/)
- **File export:** Partially confirmed — documents **scheduled File Integrations** (HR, payroll, timekeeping, demand). A manager-facing UI download to xlsx/CSV/PDF and column shapes are **unconfirmed** publicly. [Source](https://legion.co/blog/platform-services-workforce-management-scale/)
- **API:** Yes — "extensive REST APIs" for inbound/outbound data plus **webhooks** for real-time events (explicitly *shift swaps* and *schedule publish/edit*) and an Integration Center. Exact endpoint names not published (no open developer portal found). [Source](https://legion.co/blog/2023/09/21/streamlining-workforce-management/)
- **Access:** Enterprise/partner-gated. No self-serve portal, no public endpoint reference, no pricing.

---

## SMB / mid-market tier

### Deputy
- **Segment:** SMB → Enterprise, **all hourly verticals** (single/multi-location/franchise/enterprise; hospitality, retail/supermarkets, healthcare, etc.). General shift-work, not food-service-specific. [Source](https://www.deputy.com/)
- **File export:** **Best-in-class.** Schedule view → Options → Export Schedule → **PDF, Excel (XLSX), CSV, or JSON**. CSV/Excel = one row per scheduled shift for the period (optional leave). [Source](https://help.deputy.com/hc/en-au/articles/4755408081167-How-to-export-or-download-your-data)
- **API:** Yes. The **`Roster`** object = one shift; documented get/add/update shift + auto-fill/auto-build endpoints. [Source](https://deputy.com/api-doc/Resources/Roster)
- **Access:** OAuth 2.0 or permanent token, but **contact/approval-first** — docs invite discussing the integration and emailing apisupport@deputy.com for sandbox access. Partner-gated; no public pricing. [Source](https://developer.deputy.com/docs/getting-started-with-the-deputy-api)

### When I Work
- **Segment:** SMB / mid-market shift-based workplaces (hospitality, retail, healthcare). General shift work. [Source](https://help.wheniwork.com/articles/getting-access-to-the-when-i-work-api-computer/)
- **File export:** Yes — "Exporting Schedules" produces a **two-tab spreadsheet**: tab 1 = list of shifts in the date range; tab 2 = per-user total scheduled hours & wages. [Source](https://help.wheniwork.com/articles/exporting-schedules/)
- **API:** Yes — REST API with a **Shifts** resource under the "Primary" service (base `api.wheniwork.com`; OpenAPI/Swagger at `apidocs.wheniwork.com`). Exact shifts path (likely `GET /2/shifts`) unconfirmed from the rendered spec. [Source](https://help.wheniwork.com/articles/api-services-reference-guide/)
- **Access:** Application + approval, not self-serve. Requires admin-level account for an API key; customers email an access request, partners apply via the Partners form. No public cost. [Source](https://help.wheniwork.com/articles/getting-access-to-the-when-i-work-api-computer/)

### Homebase
- **Segment:** **Small business** (150,000+ SMBs), restaurant + retail origin; also food & beverage, health & wellness. Priced per location. SMB / food-service + retail lean. [Source](https://www.joinhomebase.com/schedule-maker-tool)
- **File export:** Schedule exports as a **printable PDF** (landscape, to post/text/print). **CSV/Excel** export is documented for **timesheets**, not confirmed for the schedule grid itself. [Source](https://support.joinhomebase.com/hc/en-us/articles/12622131614733-Copy-Print-Export-your-Schedule)
- **API:** **Partner-gated.** Promotes a Partner Program + pre-built integrations (Square, Toast, Shopify, ADP, Gusto…) rather than open API docs. Whether a self-serve shift-level API key exists is **unconfirmed** from primary sources. [Source](https://www.joinhomebase.com/become-a-partner)
- **Access:** Partner application/approval; no public self-serve API docs or pricing found.

### 7shifts
- **Segment:** **Restaurants / food-service ONLY** (55,000+ restaurants; food trucks → franchise groups). The most food-service-specialized. [Source](https://www.7shifts.com/built-for/full-service-restaurants/)
- **File export:** Schedule → Print / Download PDF (+ per-week/per-employee downloadable backup). **Excel/CSV** is for time punches / pay periods, not the schedule grid. [Source](https://kb.7shifts.com/hc/en-us/articles/4417513470099-How-to-Print-a-Schedule)
- **API:** **Cleanest documented public shift endpoint** — REST v2: `GET https://api.7shifts.com/v2/company/{company_id}/shifts` and `GET .../shifts/{id}`. Shift objects carry user_id, department_id, location_id, role_id, station, times. [Source](https://developers.7shifts.com/reference/listshift)
- **Access:** **Plan-gated + partner onboarding.** Bearer token (internal) or OAuth 2.0 client-credentials (partners); required endpoints map to a minimum customer subscription tier (e.g. Schedule Enforcement needs The Works/Pro+). No separate API fee. [Source](https://developers.7shifts.com/docs/plan-requirements)

### HotSchedules (by Fourth)
- **Segment:** **Restaurant / hospitality**, mid-market → enterprise chains and multi-location groups (best for 50+ employees, multi-location). Food-service specialized, larger end than 7shifts. [Source](https://www.fourth.com/product/hotschedules)
- **File export:** Yes — Extended Schedule Report (printable); Staff tab → Export to **Excel, Word, or PDF**; Fourth Analytics data export. [Source](https://help.hotschedules.com/hc/en-us/articles/115001398992-HS-Exporting-Staff-Information)
- **API:** Yes — legacy SOAP **Schedule Service** (third parties pull scheduled shifts as `WSScheduleItem` arrays; WSDL at `services.hotschedules.com/api/services/ScheduleService?wsdl`) + modern Fourth REST **TeamHours BI Shifts API** (Swagger at `api.fourth.com/teamhours/swagger`). [Source](https://help.hotschedules.com/hc/en-us/articles/4421642338701-Understanding-Partner-Integrations-and-APIs)
- **Access:** **Enterprise/partner-gated, sales-mediated.** Access requested via a Fourth rep; Fourth provisions credentials + root URLs and runs a technical onboarding call. OAuth 2.0 / Basic (REST) or UsernameToken (SOAP). No self-serve; no public pricing. [Source](https://developer.fourth.com/en-gb/docs/integration-options)

---

## Comparison table

| Product | Segment | Vertical | Schedule FILE export | Shift/schedule API | API access tier / cost |
|---|---|---|---|---|---|
| **UKG Pro WFM / Dimensions** *(v1 anchor)* | Enterprise (mid→large) | Retail + broad | **xlsx / CSV** (headers row; admin-configurable columns) | REST; `shifts` + computed `schedule`, Open Shift CRUD | Customer/tenant-gated; APP_KEY from tenant Developer Admin; no public price |
| UKG Ready | SMB / mid-market | Broad | xlsx / CSV (Ready reporting) | REST (UKG Ready APIs) | Customer-gated |
| UKG Pro (HCM) | Enterprise | Broad | xlsx / CSV | REST HCM API | Customer-gated |
| Kronos WFC (legacy) | Enterprise | Broad | xlsx / CSV | Legacy APIs | **EOL 2025/2027 — do not build to** |
| Workday | Enterprise | Retail/hospitality/food | **CSV/JSON/XML via RaaS** (tenant-defined columns) | SOAP Scheduling+Staffing, REST, RaaS | Enterprise/customer-only; tenant + provisioned creds |
| Quinyx | Mid-market → enterprise | Retail/hospitality/logistics | Unconfirmed (API is the data-out path) | REST v3 (OAuth2), v2, SOAP; shifts/schedules/forecast | Partner/customer-gated; Quinyx-issued client creds |
| Legion | Enterprise + mid-market | Retail/restaurant/hospitality | Scheduled file integrations; UI export unconfirmed | REST + webhooks (shift swaps, schedule publish) | Enterprise/partner-gated; no public portal |
| **Deputy** | SMB → Enterprise | All hourly (general) | **PDF / XLSX / CSV / JSON** (1 row per shift) | `Roster` object (shift CRUD, auto-fill/build) | OAuth/token; contact/approval-first |
| **When I Work** | SMB / mid-market | General shift work | **XLSX** (2-tab: shifts + hours/wages) | REST Shifts resource | Apply + admin-key approval |
| Homebase | SMB | SMB restaurant + retail | **PDF** (schedule); CSV/XLSX only for timesheets | Partner-gated; open shift API unconfirmed | Partner program application |
| 7shifts | SMB | **Restaurants only** | PDF/print; CSV/XLSX only for punches | **`GET /v2/company/{id}/shifts`** (cleanest public) | Plan-gated + partner onboarding |
| HotSchedules (Fourth) | Mid → enterprise | Restaurant/hospitality | **Excel / Word / PDF** | SOAP Schedule Service + Fourth REST BI Shifts | Enterprise/partner; Fourth-rep provisioned |

---

## Verdict

### Is "generic tabular upload with a UKG preset" sufficient v1 coverage? — **Yes.**

1. **Every product in the market exposes a manager/admin schedule export as a file.** For a retail-first, CA-first v1, the products that matter (UKG Pro WFM, Workday, Deputy, When I Work) all produce **xlsx or CSV** with a per-shift/tabular shape. A generic tabular parser is the correct common denominator.
2. **No product offers a self-serve public API.** Every API — UKG, Workday, Quinyx, Legion, Deputy, When I Work, Homebase, 7shifts, HotSchedules — requires a tenant/customer relationship *plus* an application/approval/provisioning step. So API ingestion buys us **zero reduction in onboarding friction** vs. upload for v1, while adding OAuth flows, per-vendor credential handling, and partner-approval lead times. Upload-only is the right v1 call; the `map.md` decision holds.
3. **The main risk is not "wrong format," it's "column variance."** UKG's own export columns are admin-configurable; Workday's are tenant-defined; the SMB tools each label things differently. The real v1 engineering effort is a **robust column-mapping layer** (header detection, synonyms, a manual "map these columns" fallback), not more file formats. The UKG preset is one instance of that mapping; the generic parser + preset architecture is exactly right, but budget for the mapping UX.
4. **One coverage gap to note, not fix in v1:** the pure food-service SMB tools (7shifts, HotSchedules, Homebase) lean toward **PDF/print** for the *schedule grid* and reserve CSV/Excel for *timesheets/punches*. Since v1 is **retail-only**, this doesn't bite us — but if/when we open the food-service vertical, "tabular upload" alone may not cover 7shifts/HotSchedules/Homebase schedules well (PDF parsing or their APIs would be needed). This reinforces keeping ingestion a pluggable seam.

### Highest-value FIRST API parser post-v1 (pick 1-2)

1. **UKG Pro WFM API — first.** It's the same vendor as the v1 anchor, so it converts existing UKG-preset customers from a manual monthly upload to a live sync with the *lowest new-concept cost* (we already understand their schedule model). It's a clean REST API exposing `shifts` + the computed `schedule`. The gate is customer-provisioned credentials (APP_KEY + client-credentials), which our *own customers* can obtain from their tenant — so the approval burden sits with the customer, not us. Highest leverage, lowest marginal learning.
2. **Deputy API — second.** If we expand down-market into SMB/mid-market retail, Deputy is the best-documented, most retail-general shift API (the `Roster` object is literally one shift), and Deputy already has the strongest *file* export (XLSX/CSV/JSON) so we can support upload **and** API for the same customer with shared mapping. Access is contact-first but self-servable via OAuth once approved.

**Deliberately deprioritized:** Workday and Legion (enterprise-only, heavyweight SOAP/RaaS, long sales-mediated provisioning — high effort, few but large deals; revisit only when an enterprise deal demands it). 7shifts/HotSchedules are strong APIs but **food-service**, i.e. out of v1/v2 retail scope. Kronos WFC is EOL — never build to it.

---

## Sources

UKG: [Pro/Ready segmentation](https://www.outsail.co/post/ukg-ready-vs-ukg-pro-which-platform-fits-your-company-size) · [Pro WFM product](https://www.ukg.com/products/ukg-pro-workforce-management) · [Retail industry](https://www.ukg.com/industry-solutions/retail/retail) · [WFM API welcome](https://developer.ukg.com/wfm/reference/welcome-to-the-ukg-pro-workforce-management-api) · [WFM auth](https://developer.ukg.com/wfm/docs/authentication-and-security-doc) · [OAuth bearer tokens](https://developer.ukg.com/proplatform/docs/obtaining-bearer-tokens) · [Export report formats](https://communityfiles.ukg.com/support/KOL/OnlineHelp-WorkforceDimensions/en-us/Content/MasterTopics/ReportAppendices/ExportReports.htm) · [CSV output](https://communityfiles.ukg.com/support/KOL/OnlineHelp-WorkforceDimensions/en-us/Content/MasterTopics/ReportAppendices/CSV_output.htm) · [Rotation schedule template (.xlsx)](https://communityfiles.ukg.com/support/kol/onlinehelp-workforcedimensions/en-us/Content/RotationSchedule/User/RotationScheduleTemplates.htm) · [Export planner data](https://customer2.kronos.com/support/KOL/OnlineHelp-WorkforceDimensions/en-us/Content/Forecasting/ExportPlannerData.htm)

Kronos WFC EOL: [WorkAxle migration guide](https://www.workaxle.com/blog/kronos-workforce-central-end-of-life-migration)

Workday: [WFM topic](https://www.workday.com/en-us/topics/hr/workforce-management.html) · [SOAP API reference](https://community-content.workday.com/en-us/public/products/platform-and-product-extensions/soap-api-reference.html) · [RaaS (raas-python)](https://github.com/Workday/raas-python)

Quinyx: [Developer portal](https://developer.quinyx.com/) · [API v3](https://developer.quinyx.com/api/v3) · [WFM product](https://www.quinyx.com/workforce-management)

Legion: [Automated scheduling](https://legion.co/products/automated-scheduling/) · [Platform services](https://legion.co/blog/platform-services-workforce-management-scale/) · [Integration overview](https://legion.co/blog/2023/09/21/streamlining-workforce-management/)

Deputy: [Shifts overview](https://developer.deputy.com/docs/shifts-overview) · [Roster resource](https://deputy.com/api-doc/Resources/Roster) · [Getting started](https://developer.deputy.com/docs/getting-started-with-the-deputy-api) · [Export/download data](https://help.deputy.com/hc/en-au/articles/4755408081167-How-to-export-or-download-your-data)

When I Work: [API access](https://help.wheniwork.com/articles/getting-access-to-the-when-i-work-api-computer/) · [API services reference](https://help.wheniwork.com/articles/api-services-reference-guide/) · [Exporting schedules](https://help.wheniwork.com/articles/exporting-schedules/)

Homebase: [Become a partner](https://www.joinhomebase.com/become-a-partner) · [Copy/Print/Export schedule](https://support.joinhomebase.com/hc/en-us/articles/12622131614733-Copy-Print-Export-your-Schedule) · [Schedule maker](https://www.joinhomebase.com/schedule-maker-tool)

7shifts: [List Shifts API](https://developers.7shifts.com/reference/listshift) · [Retrieve Shift](https://developers.7shifts.com/reference/retrieveshift) · [Plan requirements](https://developers.7shifts.com/docs/plan-requirements) · [Print a schedule](https://kb.7shifts.com/hc/en-us/articles/4417513470099-How-to-Print-a-Schedule) · [Built for full-service restaurants](https://www.7shifts.com/built-for/full-service-restaurants/)

HotSchedules / Fourth: [Partner integrations & APIs](https://help.hotschedules.com/hc/en-us/articles/4421642338701-Understanding-Partner-Integrations-and-APIs) · [Fourth integration options](https://developer.fourth.com/en-gb/docs/integration-options) · [Export staff info](https://help.hotschedules.com/hc/en-us/articles/115001398992-HS-Exporting-Staff-Information) · [HotSchedules product](https://www.fourth.com/product/hotschedules)
