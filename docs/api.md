# API reference

All endpoints are read-only and versioned under `/api/v1`. List endpoints accept `limit` from 1 to 500 and an opaque numeric `cursor`. Successful responses contain `data` and `meta`; query errors use HTTP 400 with an `INVALID_QUERY` code.

`GET /countries` returns the validated country registry and coverage tier. `GET /collections` returns reusable regional or institutional groups. `GET /indicators` returns definitions and provenance. `GET /observations` accepts comma-separated `country`, one `indicator`, and an observation `status`. `GET /releases` returns source-period release records. `GET /pulse` contains observed-only summary signals. `GET /health` reports Supabase fact volume, ingestion job state, snapshot age, row volume, and country coverage. `GET /market` returns the latest successfully parsed official ECB EUR reference rates and FRED DGS10 observation, plus the source dates and dashboard check time; partial upstream success is reported in `meta.partial`. Public routes prefer normalized Supabase facts and use the committed snapshot only when the live fact model is unavailable or empty.

Observation fields are `country`, `indicator`, `period`, `value`, `frequency`, `status`, `vintage`, `source`, and `fetchedAt`. Consumers must not treat a `forecast` status as observed history.

Operational endpoint: `GET /api/cron/ingest?indicator=GDP_GROWTH` accepts a bearer `CRON_SECRET`, supports the allow-listed World Bank series, and returns logged rows seen/written. It is not a public API.
