# Azure Table Storage over Cosmos DB or Azure SQL

All persisted data (Company, Location, User/UserLink, CoverageGroup, Settings, InviteCode) is small, entity-level configuration accessed by key — it doesn't need Cosmos DB's global distribution/multi-region features or Azure SQL's relational query power, since there are no cross-entity joins in the access patterns. Table Storage is materially cheaper and simpler to operate, and its partition-key model maps directly onto the tenancy model: entities partition under their owning Company, giving cheap per-company queries and physical tenant isolation for free. The trade-off is no cross-entity joins and no complex query capability if the model grows more relational later — that would mean migrating store, not just adding an index.

**Status:** accepted
