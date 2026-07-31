# Design canonical schedule model + parser interface

Type: prototype
Status: open
Blocked by: 01

> **Constraint from [#05 IP-cut-line](05-draw-ip-protection-cut-line.md):** the parser runs **server-side**, and the canonical model is a **server-internal seam — NOT the API/wire contract** (the wire input is the raw file + preset id + settings; the client ships no parser and no `core/`). The pluggable-parser goal still holds server-side: the v1 variant is the **UKG preset** (B-preset), and the interface must leave room for interactive per-file mapping (B-map, v2) and future API parsers. Validation/rejection happens server-side, and unmatched files must be **rejected loudly**, never silently mis-parsed.

## Question

What is the canonical internal schedule model, and what is the parser interface that normalizes any input format into it?

This is the seam principle made concrete for ingestion. The core algorithm must consume only the canonical model — never a source format. The tabular parser (xlsx/CSV + column mapping, with a UKG preset) is v1's only parser, but the interface must let a JSON parser or API parser slot in later without touching the core.

Blocked by **Audit CA compliance completeness (#01)** because the canonical model's required fields are partly determined by what the compliance engine needs (e.g., does it need paid/unpaid segment markers, shift-type, meal-waiver eligibility inputs?).

Resolve via `/domain-modeling` + `/prototype`:
- The canonical shape: employee, date, start, end, department + whatever schedule-level metadata the algorithm and CA rules require (per #01).
- The parser interface: signature, how a parser reports mapping needs, how the tabular parser's column-mapping config is expressed and saved as a template, where the UKG preset lives.
- Validation: where malformed input is rejected and what the error contract is.

Deliverable: the canonical model definition + parser interface (stub/prototype), with the tabular parser sketched against it.
