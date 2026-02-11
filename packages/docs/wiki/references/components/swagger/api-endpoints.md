# API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/doc/explorer` | Documentation UI (Scalar by default) |
| `GET` | `/doc/openapi.json` | Raw OpenAPI specification |

> [!NOTE]
> These paths are based on the default configuration. If you customize `restOptions.base.path`, `restOptions.ui.path`, or `restOptions.doc.path`, the actual endpoints change accordingly.

## Documentation UI

**Default path:** `/doc/explorer`

Renders an interactive API documentation page using the configured UI provider (Scalar or Swagger UI). The UI fetches the OpenAPI spec from the JSON endpoint and renders it with full request/response exploration.

## OpenAPI JSON Specification

**Default path:** `/doc/openapi.json`

Returns the raw OpenAPI JSON specification generated from all registered controller routes and their Zod schemas. This endpoint can be used by external tools, CI pipelines, or client generators.

These paths can be configured by providing custom `ISwaggerOptions`. This feature provides a powerful and flexible way to document your APIs, making them easier to consume and understand.
