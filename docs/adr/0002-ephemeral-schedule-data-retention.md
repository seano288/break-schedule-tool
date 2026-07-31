# Ephemeral schedule-data retention, scoped to the entity level

The original tool's promise was "nothing leaves your browser" (fully client-side, `localStorage` only). Multi-tenancy requires some server-side persistence, so that absolute promise can't hold — Company/Location/User/CoverageGroup/Settings now persist in Azure Table Storage. We preserve the spirit of the original promise by drawing the retention boundary at the entity level instead: configuration persists, but uploaded schedule file contents and anything derived from them (employee names, shifts, computed breaks) are processed only in the memory of a single Function invocation and are never written to Table Storage, Blob Storage, or anywhere else. This is what lets the product still tell customers their privacy posture is unchanged for the data that actually matters.

**Status:** accepted
