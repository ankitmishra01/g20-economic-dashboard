# API reference

All endpoints are read-only and versioned under `/api/v1`. List endpoints accept `limit` from 1 to 500 and an opaque numeric `cursor`. Successful responses contain `data` and `meta`; query errors use HTTP 400 with an `INVALID_QUERY` code.

`GET /countries` returns the validated country registry and coverage tier. `GET /collections` returns reusable regional or institutional groups. `GET /indicators` returns definitions and provenance. `GET /observations` accepts comma-separated `country`, one `indicator`, and an observation `status`. `GET /releases` returns source-period release records. `GET /pulse` contains observed-only summary signals. `GET /health` reports snapshot age, row volume, country coverage, and job state.

Observation fields are `country`, `indicator`, `period`, `value`, `frequency`, `status`, `vintage`, `source`, and `fetchedAt`. Consumers must not treat a `forecast` status as observed history.
