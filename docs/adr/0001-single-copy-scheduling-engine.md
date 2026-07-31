# Single copy of the scheduling engine, not a synced pair

The original SaaS migration spec (issue #1) called for `api/src/core/` to be a duplicate of the root `src/core/` scheduling engine — kept manually in sync, with tests living at the root against the root copy — because `api/` deploys standalone and can't import across the SWA/Functions boundary. In practice, nothing outside its own tests ever imported the root copy, and `api/src/core/` had no tests of its own, so drift between the two copies would have gone undetected. We deleted `src/core/` and moved its tests into `api/tests/core/`, making `api/src/core/` the single, tested copy of the engine.

**Status:** accepted
