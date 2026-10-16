# Data dictionary

`countries` contains ISO metadata and coverage classification. `country_collections` and `collection_members` define stable comparison groups. `indicator_series` stores source-specific series codes, frequency, unit, seasonal adjustment, and coverage tier. `economic_releases` represents scheduled and completed source releases. `economic_observations` is immutable by series, country, period, and vintage date; revisions create another vintage. `ingestion_job_runs` stores source health and row metrics.

`profiles`, `watchlists`, `watchlist_items`, `alert_rules`, `brief_preferences`, and `brief_deliveries` contain private workflow state. Their policies compare the authenticated user ID with the owner column. Delivery uniqueness treats a null watchlist as a real deduplication value.

Status meanings:

- `actual`: an observed value published by the source.
- `preliminary`: observed but explicitly subject to revision.
- `estimate`: source estimate for a period without a final observation.
- `forecast`: forward-looking value; excluded from latest-observed coverage.
